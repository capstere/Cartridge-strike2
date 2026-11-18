// Real Colyseus protocol clients; NO browser, renderer or physical-device claim.
import {fork} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import {latencyProxy} from './network-proxy.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=20000){const end=performance.now()+timeout;while(!fn()){assert(performance.now()<end,label);await delay(20);}}
const duration=Number(process.env.CS2_LOAD_SECONDS||30),counts=(process.env.CS2_LOAD_COUNTS||'2,4,10').split(',').map(Number);
const rtts=(process.env.CS2_LOAD_RTTS||'0').split(',').map(Number),soak=process.env.CS2_SOAK==='1';
const output=process.env.CS2_LOAD_OUTPUT||'test-results/pass3b/load.json';
const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const results=[];
for(const count of counts)for(const rtt of rtts){
 const child=fork(new URL('./network-load-server.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--expose-gc','--import',new URL('server/register-shared.mjs',root).href]});
 const pending=new Map();let serial=0,exited=false;
 const rpc=(action,options)=>new Promise((resolve,reject)=>{if(exited||!child.connected)return reject(Error('test server unavailable'));const id=++serial;pending.set(id,{resolve,reject});child.send({id,action,options});});
 child.on('message',m=>{const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error)):p.resolve(m.result);});
 child.on('exit',code=>{exited=true;for(const p of pending.values())p.reject(Error('load server exited '+code));pending.clear();});
 const info=await rpc('start'),proxy=rtt?await latencyProxy(info.url,{oneWayMs:rtt/2,jitterMs:20}):null,url=proxy?.url||info.url;
 const client=new Client(url,{headers:{Origin:url}}),peers=[];let running=true,timer,frames=0,joins=0,reconnects=0,maxPending=0;
 const own=p=>[...(p.room.state.actors?.values()||[])].find(a=>a.sessionId===p.room.sessionId);
 async function add(roomId){
  const room=await (roomId?client.joinById(roomId,{code:'load-123',name:'Load',contract:info.contract}):client.create('private-fps',{code:'load-123',name:'Load',contract:info.contract}));
  Object.assign(room.reconnection,{enabled:true,minUptime:0,minDelay:150,maxDelay:500,maxRetries:30,maxEnqueuedMessages:0});
  const p={room,fire:0,reload:0,life:0,epoch:0,shots:0,hits:0};
  room.onMessage('clock-probe',token=>room.send('clock-echo',token));room.onMessage('problem',m=>{throw Error(String(m));});
  room.onMessage('events',events=>{p.shots+=events.filter(e=>e.type==='shot'&&e.actorId===own(p)?.id).length;p.hits+=events.filter(e=>e.type==='hit'&&e.sourceId===own(p)?.id).length;});
  room.send('ready',info.contract);await until(()=>own(p)?.ready,'load ready');peers.push(p);return p;
 }
 try{
  const first=await add();for(let i=1;i<count;i++)await add(first.room.roomId);
  let next=performance.now();
  function pump(){
   if(!running)return;
   for(const p of peers){
    const a=own(p);if(!a||p.room.reconnection.isReconnecting)continue;
    if(soak&&p.room.state.phase!=='active'){
      const state=p.room.state,command=(kind,extra={})=>p.room.send('match',{kind,matchId:state.matchId,controlEpoch:a.controlEpoch,...extra});
      if(performance.now()-(p.lastLobby||0)>500){p.lastLobby=performance.now();
        if(state.phase==='results')command('rematch');
        if(state.phase==='waiting'){
          if(!a.playerReady)command('ready',{ready:true});
          if(state.ownerId===p.room.sessionId&&peers.length===count&&[...state.actors.values()].every(x=>x.connected&&x.playerReady))command('start');
        }
      }
      continue;
    }
    if(p.epoch!==(a.controlEpoch||0)){p.epoch=a.controlEpoch||0;p.fire=p.reload=0;p.room.send('controls',{enabled:true,lifeId:a.lifeId,controlEpoch:a.controlEpoch});}
    if(!a.alive)continue;if(a.lifeId!==p.life){p.life=a.lifeId;p.fire=p.reload=0;}
    const enemy=[...p.room.state.actors.values()].find(b=>b.ready&&b.alive&&b.team!==a.team&&b.id.endsWith(a.id.split('-').at(-1)));
    const input=p.room.input({mode:'reliable',renderDelay:100});
    Object.assign(input.data,{lifeId:a.lifeId,controlEpoch:a.controlEpoch||0,sampleTick:p.room.state.tick,
     fireId:++p.fire,reloadId:a.ammo===0?++p.reload:p.reload,forward:0,strafe:Math.sin(frames/120)*.15,
     yaw:enemy?Math.atan2(-(enemy.x-a.x),-(enemy.z-a.z)):a.yaw,pitch:0,jump:false,crouch:false,sneak:false,fire:!!enemy});
    input.send();maxPending=Math.max(maxPending,input.pendingCount);
   }
   frames++;next+=1000/60;if(next<performance.now()-100)next=performance.now();timer=setTimeout(pump,Math.max(0,next-performance.now()));
  }pump();
  await delay(5000);const baseline=await rpc('reset'),samples=[];let nextCycle=performance.now()+30000,nextDrop=performance.now()+15000;
  const end=performance.now()+duration*1000;
  while(performance.now()<end){
   await delay(Math.min(5000,end-performance.now()));
   if(soak&&performance.now()>=nextDrop){
    const p=peers[0],epoch=own(p).controlEpoch;await rpc('drop',{room:p.room.roomId,sid:p.room.sessionId});
    await until(()=>own(p)?.controlEpoch>epoch,'soak reconnection');reconnects++;nextDrop+=60000;
   }
   if(soak&&performance.now()>=nextCycle&&joins<20){
    const p=peers.pop();await p.room.leave();await delay(150);await add(peers[0].room.roomId);joins++;nextCycle+=30000;
   }
   const sample=await rpc('sample');samples.push(sample);
   assert.equal(sample.rooms.length,1);assert.equal(sample.rooms[0].actors,count);assert.equal(sample.rooms[0].seats,count);
   assert(sample.rooms[0].inputMax<=12);assert((sample.rooms[0].histories||0)<=64);
   assert(sample.rooms[0].listeners.every(n=>n===sample.rooms[0].listeners[0]),'socket listeners do not accumulate '+JSON.stringify(sample.rooms[0].listenerDetails));
   if(soak&&samples.length%12===0)console.log(JSON.stringify({soakSeconds:Math.round(sample.elapsedSeconds),joins,reconnects,combatRespawns:sample.combatRespawns,matchId:sample.rooms[0].matchId,heapMiB:sample.memory.heapUsed/1048576}));
  }
  running=false;clearTimeout(timer);const measured=await rpc('sample');
  assert(peers.every(p=>p.shots>0),'every independent client fired');assert(peers.some(p=>p.hits>0),'sustained combat hit opponents');
  if(soak){assert(measured.rooms[0].matchId>=3,'soak must complete multiple matches');assert(joins>=20);assert(measured.combatRespawns>=20,'actual deaths must respawn, excluding match resets and joins');const warm=samples.filter(s=>s.elapsedSeconds>=120);if(warm.length>10){const first=warm.slice(0,6).map(s=>s.memory.heapUsed),last=warm.slice(-6).map(s=>s.memory.heapUsed);assert(Math.max(...last)<Math.max(...first)+16*1048576,'post-GC retained heap remains bounded');}}
  await Promise.all(peers.map(p=>p.room.leave()));await delay(500);const cleanup=await rpc('sample');assert.equal(cleanup.rooms.length,0,'empty room disposed');
  results.push({status:'PASS',kind:'protocol-only, server in separate process',physicalPi:info.environment.model?.startsWith('Raspberry Pi')?'PASS':'NOT RUN',count,rttMs:rtt,jitterMs:rtt?20:0,loss:'NOT RUN: ordered WebSocket delay, no packet dropping',environment:info.environment,contract:info.contract,
    measured,baseline,perPlayerOutboundBytesPerSecond:measured.bytes/measured.elapsedSeconds/count,maxPending,joins,reconnects,shots:peers.map(p=>p.shots),hits:peers.map(p=>p.hits),samples:soak?samples:undefined,cleanup});
  console.log(JSON.stringify({count,rtt,status:'PASS',simulation:measured.costMs.simulation,tick:measured.costMs.tick,outbound:results.at(-1).perPlayerOutboundBytesPerSecond}));
 }finally{running=false;clearTimeout(timer);await Promise.allSettled(peers.map(p=>p.room.leave()));await proxy?.close();await rpc('close').catch(()=>{});}
 await mkdir(new URL('.',pathToFileURL(process.cwd()+'/'+output)),{recursive:true});await writeFile(output,JSON.stringify({results},null,2)+'\n');
}
