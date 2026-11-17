// Test-only process boundary. The HTTP/WS server runs independently of the
// browser driver's pipe/event loop, just as the Pi does on the real LAN.
// IPC is observational apart from stopping a socket/server for loss tests.
import {fork} from 'node:child_process';
import {fileURLToPath} from 'node:url';
const entry=fileURLToPath(import.meta.url);

if(process.argv[1]===entry&&process.argv[2]==='--serve'){
  const {createLocalServer}=await import('../server/local-server.mjs');
  let local,timer,stopping=false;const trace=[];
  const snapshot=()=>({listening:!!local?.httpServer.listening,rooms:[...(local?.rooms||[])].map(r=>({
    id:r.roomId,sourceHash:r.sim?.sourceHash,tick:r.sim?.tickNumber,doors:r.state?.doors?.size||0,
    clients:r.clients.map(c=>c.sessionId),seats:[...(r.seats?.entries()||[])].map(([sid,s])=>({sid,id:s.id,ready:s.ready,enabled:s.enabled})),
    actors:(r.sim?.game.actors||[]).map(a=>({id:a.id,x:a.x,y:a.y,z:a.z,yaw:a.yaw,pitch:a.pitch,alive:a.alive,lifeId:a.lifeId,
      inventory:{primary:{ammo:a.inventory.primary.ammo,reserve:a.inventory.primary.reserve}},sessionId:r.state.actors.get(a.id)?.sessionId})),
  }))});
  process.on('message',async message=>{
    const {id,action,options}=message;
    try{
      let value;
      if(action==='start'){
        local=await createLocalServer(options);
        local.httpServer.on('request',(req,res)=>{const row={path:req.url,at:performance.now()};trace.push(row);if(trace.length>1500)trace.shift();
          res.once('finish',()=>{row.status=res.statusCode;row.finishedMs=performance.now()-row.at;});
          res.once('close',()=>{row.closedMs=performance.now()-row.at;});});
        timer=setInterval(()=>{if(process.connected)process.send({snapshot:snapshot()});},50);
        value={url:local.url,config:local.config,port:local.httpServer.address().port};
      }else if(action==='terminate'){
        const room=[...local.rooms].find(r=>r.roomId===options.room),client=room?.clients.find(c=>c.sessionId===options.sid);
        if(!client)throw Error('No live socket for the requested test player.');client.ref.terminate();
      }else if(action==='diagnostics'){
        value={trace,connections:await new Promise(resolve=>local.httpServer.getConnections((_e,count)=>resolve(count)))};
      }else if(action==='close'){
        stopping=true;clearInterval(timer);await local?.close();
      }else throw Error('Unknown test IPC action.');
      process.send({id,value,snapshot:snapshot()},()=>{if(action==='close')process.disconnect();});
    }catch(error){process.send({id,error:String(error.stack||error)});}
  });
  process.on('disconnect',()=>{clearInterval(timer);if(!stopping)local?.close().catch(()=>{});});
}

export async function createTestServer(options){
  const child=fork(entry,['--serve'],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--import',new URL('../server/register-shared.mjs',import.meta.url).href]});
  const pending=new Map(),rooms=new Set(),byId=new Map();let serial=0,closed=false,listening=false;
  const exited=new Promise(resolve=>{
    child.once('exit',(code,signal)=>{for(const p of pending.values())p.reject(Error(`Test server exited (${code??signal}).`));pending.clear();resolve();});
    child.once('error',()=>resolve());
  });
  const request=(action,options)=>new Promise((resolve,reject)=>{
    const id=++serial;pending.set(id,{resolve,reject});child.send({id,action,options},e=>{if(e){pending.delete(id);reject(e);}});
  });
  child.on('message',message=>{
    if(message.snapshot){
      listening=message.snapshot.listening;const present=new Set();
      for(const data of message.snapshot.rooms){
        present.add(data.id);let room=byId.get(data.id);
        if(!room){room={roomId:data.id,clients:[],seats:new Map(),state:{actors:new Map(),doors:{size:0}},sim:{game:{actors:[]}}};byId.set(data.id,room);rooms.add(room);}
        const old=new Map(room.sim.game.actors.map(a=>[a.id,a]));
        room.sim.game.actors=data.actors.map(a=>Object.assign(old.get(a.id)||{},a));
        room.clients=data.clients.map(sid=>({sessionId:sid,ref:{terminate:()=>request('terminate',{room:data.id,sid})}}));
        room.state.actors=new Map(data.actors.map(a=>[a.id,a]));room.state.doors.size=data.doors;
        room.sim.sourceHash=data.sourceHash;room.sim.tickNumber=data.tick;
        room.seats=new Map(data.seats.map(s=>[s.sid,{...s,actor:room.sim.game.actors.find(a=>a.id===s.id)}]));
      }
      for(const [id,room] of byId)if(!present.has(id)){rooms.delete(room);byId.delete(id);}
    }
    if(message.id){const p=pending.get(message.id);pending.delete(message.id);if(p)message.error?p.reject(Error(message.error)):p.resolve(message.value);}
  });
  child.on('error',error=>{for(const p of pending.values())p.reject(error);pending.clear();});
  const close=async()=>{
    if(closed)return;closed=true;
    const kill=setTimeout(()=>child.kill(),5000);
    try{if(child.connected)await request('close');await exited;}finally{clearTimeout(kill);}
  };
  try{
    const info=await request('start',options);
    return {...info,rooms,close,diagnostics:()=>request('diagnostics'),httpServer:{get listening(){return listening;},address:()=>({port:info.port})}};
  }catch(error){await close().catch(()=>{});throw error;}
}
