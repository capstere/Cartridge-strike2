// Private test IPC only. Never imported by the shipped server.
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {cpus,platform,arch} from 'node:os';
const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const {createLocalServer}=await import(new URL('server/local-server.mjs',root));
const {CONTRACT}=await import(new URL('shared/multiplayer/build.mjs',root));
const loops=monitorEventLoopDelay({resolution:10});loops.enable();
const samples={tick:[],simulation:[],projection:[],serialization:[],interval:[],shotAge:[]};
const push=(key,n)=>{const a=samples[key];a.push(n);if(a.length>8192)a.shift();};
const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b),n=sorted.length;return {n,p50:sorted[Math.floor(n*.5)]||0,p95:sorted[Math.floor(n*.95)]||0,p99:sorted[Math.floor(n*.99)]||0,max:sorted.at(-1)||0};};
let local,started=performance.now(),cpu=process.cpuUsage(),bytes=0,inBytes=0,respawns=0,fixtureTimer;
const seen=new WeakSet(),connections=new WeakSet(),lives=new Map();
function instrument(){
 for(const r of local.rooms){
  if(!r.sim||!r.state)continue;
  if(!seen.has(r)){
   seen.add(r);let last;
   for(const [obj,key,label] of [[r,'fixedTick','tick'],[r.sim,'tick','simulation'],[r,'project','projection'],[r,'broadcastPatch','serialization']]){
    const original=obj[key];obj[key]=function(...args){const t=performance.now();if(label==='tick'){if(last!==undefined)push('interval',t-last);last=t;}try{return original.apply(this,args);}finally{push(label,performance.now()-t);}};
   }
   if(r.lag){const accept=r.lag.accept;r.lag.accept=function(seat,frame,stamp){if(stamp)push('shotAge',r.clock.elapsedTime-stamp);return accept.call(this,seat,frame,stamp);};}
  }
  for(const c of r.clients)if(!connections.has(c.ref)){
   connections.add(c.ref);const original=c.ref.send;
   c.ref.send=function(data,...args){bytes+=typeof data==='string'?Buffer.byteLength(data):data.byteLength;return original.call(this,data,...args);};
   c.ref.on('message',data=>inBytes+=data.byteLength);
  }
  // Test-only combat placement on each new life. All movement, ammo, hits,
  // cooldowns, damage and respawn timing still pass through the real authority.
  for(const a of r.sim.game.actors){
   const key=r.roomId+':'+a.id;
   if(lives.get(key)!==a.lifeId){
    if(lives.has(key))respawns++;lives.set(key,a.lifeId);
    const x=22.8,z=a.team==='analysts'?-18-a.index:-13+a.index;
    if(!r.sim.game.world.canOccupy(x,z,a.radius,a.height,0))throw Error('Invalid C08 load fixture '+x+','+z);
    Object.assign(a,{x,y:0,z,yaw:a.team==='analysts'?Math.PI:0,pitch:0});
   }
  }
 }
}
function snapshot(){
 instrument();
 const usage=process.cpuUsage(cpu),elapsed=(performance.now()-started)/1000;
 return {elapsedSeconds:elapsed,serverCpuPercent:(usage.user+usage.system)/1e4/elapsed,memory:process.memoryUsage(),
  eventLoopMs:{p50:loops.percentile(50)/1e6,p95:loops.percentile(95)/1e6,p99:loops.percentile(99)/1e6,max:loops.max/1e6},
  costMs:Object.fromEntries(Object.entries(samples).filter(([k])=>k!=='shotAge').map(([k,v])=>[k,stats(v)])),shotAgeMs:stats(samples.shotAge),bytes,inBytes,respawns,
  resources:process.getActiveResourcesInfo().reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{}),
  rooms:[...local.rooms].map(r=>({id:r.roomId,clients:r.clients.length,seats:r.seats.size,actors:r.sim.game.actors.length,tick:r.sim.tickNumber,
   metrics:r.metrics,lag:r.lag?{...r.lag.metrics,ages:stats(r.lag.metrics.ages)}:undefined,histories:r.lag?.tickTimes.size,
   rewindEntities:r.lag?.rewind.groups?.map(g=>[...g.entities()].length),
   inputMax:Math.max(0,...[...r.seats.keys()].map(sid=>r.inputs.get(sid).size)),
   listeners:r.clients.map(c=>c.ref.eventNames().reduce((n,name)=>n+c.ref.listenerCount(name),0)),
   listenerDetails:r.clients.map(c=>({sid:c.sessionId,events:Object.fromEntries(c.ref.eventNames().map(name=>[name,c.ref.listenerCount(name)]))})),
   score:{...r.sim.game.state.score},actorsState:r.sim.game.actors.map(a=>({id:a.id,lifeId:a.lifeId,kills:a.kills,deaths:a.deaths}))}))};
}
process.on('message',async({id,action,options})=>{
 try{
  let result;
  if(action==='start'){
   local=await createLocalServer({port:0});fixtureTimer=setInterval(instrument,20);
   result={url:local.url,contract:CONTRACT,environment:{node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0].model,cores:cpus().length}};
  }else if(action==='reset'){
   for(const a of Object.values(samples))a.length=0;bytes=inBytes=0;loops.reset();cpu=process.cpuUsage();started=performance.now();global.gc?.();result=snapshot();
  }else if(action==='sample'){global.gc?.();result=snapshot();}
  else if(action==='drop'){const r=[...local.rooms].find(r=>r.roomId===options.room);r.clients.find(c=>c.sessionId===options.sid).ref.terminate();}
  else if(action==='close'){clearInterval(fixtureTimer);await local.close();loops.disable();result=snapshot();}
  else throw Error('Unknown test IPC action');
  process.send({id,result},()=>{if(action==='close')process.disconnect();});
 }catch(e){process.send({id,error:e.stack});}
});
process.on('disconnect',()=>{clearInterval(fixtureTimer);loops.disable();local?.close().catch(()=>{});});
