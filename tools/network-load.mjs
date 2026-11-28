// Real Colyseus protocol clients; NO browser, renderer or physical-device claim.
import {fork} from 'node:child_process';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import {latencyProxy} from './network-proxy.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=20000){const end=performance.now()+timeout;while(!fn()){assert(performance.now()<end,label);await delay(20);}}
const weaponLoad=process.env.CS2_LOAD_WEAPON;
const duration=Number(process.env.CS2_LOAD_SECONDS||30),counts=(process.env.CS2_LOAD_COUNTS||(weaponLoad?'10':'2,4,10')).split(',').map(Number);
const rtts=(process.env.CS2_LOAD_RTTS||'0').split(',').map(Number),soak=process.env.CS2_SOAK==='1';
const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const ai=process.env.CS2_LOAD_AI==='1',classic=process.env.CS2_LOAD_MODE==='classic';
const withResidents=process.env.CS2_LOAD_RESIDENTS==='1';
const output=process.env.CS2_LOAD_OUTPUT||(weaponLoad?`test-results/online/pi-weapon-${classic?'classic':'tdm'}-${weaponLoad}.json`:'test-results/pass3b/load.json');
const warmupMs=5000,volleyMs=5000,weaponVolleys=Math.floor(duration*1000/volleyMs);
if(weaponLoad){
 assert(['smg','bazooka'].includes(weaponLoad),'CS2_LOAD_WEAPON must be smg or bazooka');
 assert.deepEqual(counts,[10],'Weapon load requires exactly ten clients');
 assert.deepEqual(rtts,[0],'Weapon load requires loopback without proxy latency');
 assert(duration>=10&&duration<=30,'Weapon load requires 10–30 seconds to use the launcher’s standard ammunition');
 assert(!ai&&!soak&&!withResidents&&process.env.CS2_FORCE_GC!=='1','Weapon load requires human seats, residents disabled and natural GC');
 assert(!process.env.CS2_LOAD_MODE||['tdm','classic'].includes(process.env.CS2_LOAD_MODE),'Weapon load mode must be tdm or classic');
}
const results=[];
for(const count of counts)for(const rtt of rtts){
 const child=fork(new URL('./network-load-server.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--expose-gc','--import',new URL('server/register-shared.mjs',root).href]});
 const pending=new Map();let serial=0,exited=false;
 const rpc=(action,options)=>new Promise((resolve,reject)=>{if(exited||!child.connected)return reject(Error('test server unavailable'));const id=++serial;pending.set(id,{resolve,reject});child.send({id,action,options});});
 child.on('message',m=>{const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error)):p.resolve(m.result);});
 child.on('exit',code=>{exited=true;for(const p of pending.values())p.reject(Error('load server exited '+code));pending.clear();});
 const info=await rpc('start'),proxy=rtt?await latencyProxy(info.url,{oneWayMs:rtt/2,jitterMs:20}):null,url=proxy?.url||info.url;
 const client=new Client(url,{headers:{Origin:url}}),peers=[];let running=true,timer,frames=0,joins=0,reconnects=0,maxPending=0;
 let lanes,startingCredits,weaponRunStart;
 const own=p=>[...(p.room.state.actors?.values()||[])].find(a=>a.sessionId===p.room.sessionId);
 async function add(roomId){
  const room=await (roomId?client.joinById(roomId,{...(info.contract.protocolVersion>=6?{fillBots:ai}:{}),...(classic?{mode:'classic'}:{}),...(withResidents?{zombies:true,danceman:true}:{}),code:'load-123',name:'Load',contract:info.contract}):client.create('private-fps',{...(info.contract.protocolVersion>=6?{fillBots:ai}:{}),...(classic?{mode:'classic'}:{}),...(withResidents?{zombies:true,danceman:true}:{}),code:'load-123',name:'Load',contract:info.contract}));
  Object.assign(room.reconnection,{enabled:true,minUptime:0,minDelay:150,maxDelay:500,maxRetries:30,maxEnqueuedMessages:0});
  const p={room,fire:0,reload:0,life:0,epoch:0,shots:0,hits:0};
  room.onMessage('notice',()=>{});room.onMessage('clock-probe',token=>room.send('clock-echo',token));room.onMessage('problem',m=>{throw Error(String(m));});
  room.onMessage('events',events=>{p.shots+=events.filter(e=>e.type==='shot'&&e.actorId===own(p)?.id).length;p.hits+=events.filter(e=>e.type==='hit'&&e.sourceId===own(p)?.id).length;});
  room.send('ready',info.contract);await until(()=>own(p)?.ready,'load ready');peers.push(p);return p;
 }
 async function prepareWeaponLoad(first){
  const command=(p,kind,extra={})=>p.room.send('match',{
   kind,matchId:p.room.state.matchId,controlEpoch:own(p).controlEpoch,...extra
  });
  if(classic)startingCredits=await rpc('fund-weapon-fixture');
  else {
   for(const p of peers)command(p,'loadout',{primary:weaponLoad});
   await until(()=>peers.every(p=>own(p)?.loadout===weaponLoad),'all TDM loadouts accepted');
  }
  for(const p of peers)command(p,'ready',{ready:true});
  await until(()=>peers.every(p=>own(p)?.playerReady),'all ten actors ready to start');
  command(first,'start');
  await until(()=>peers.every(p=>p.room.state.phase==='active'),'weapon fixture match started');
  if(classic){
   await until(()=>peers.every(p=>p.room.state.roundPhase==='buy'&&own(p)?.money===startingCredits),'Classic fixture entered buy with equal credits');
   for(const p of peers){
    const a=own(p),state=p.room.state;
    p.room.send('classic',{kind:'buy',item:weaponLoad,serial:1,round:state.round,matchId:state.matchId,
     lifeId:a.lifeId,controlEpoch:a.controlEpoch});
   }
  }
  await until(()=>peers.every(p=>own(p)?.weapon===weaponLoad&&own(p)?.primary===weaponLoad),'all actors equipped the benchmark weapon');
  if(classic&&weaponLoad==='bazooka')assert(peers.every(p=>own(p).money===0),'Classic actors paid 3600 for the launcher');
  if(classic)await until(()=>peers.every(p=>p.room.state.roundPhase==='active'),'Classic fixture entered combat');
  const placed=await rpc('place-weapon-fixture');
  lanes=new Map(placed.map((lane,index)=>[lane.id,{...lane,index}]));
  await until(()=>peers.every(p=>{
   const a=own(p),lane=lanes.get(a?.id);
   return lane&&Math.abs(a.x-lane.x)<.01&&Math.abs(a.z-lane.z)<.01;
  }),'all actors received C08 fixture positions');
  for(const p of peers){
   const a=own(p);
   p.weaponActorId=a.id;
   p.startingAmmo={ammo:a.ammo,reserve:a.reserve};
   p.measuredInputs=0;
  }
 }
 function weaponInput(p,a,now,pumpStart){
  const lane=lanes.get(a.id),measuring=weaponRunStart!==undefined;
  let fire=false;
  if(measuring){
   const elapsed=now-weaponRunStart,volley=Math.floor(elapsed/volleyMs);
   const pressAge=elapsed-volley*volleyMs-500-lane.index*65;
   fire=volley<weaponVolleys&&pressAge>=0&&pressAge<180;
   if(fire&&p.pressedVolley!==volley){p.pressedVolley=volley;p.fire++;}
   if(volley<weaponVolleys-1&&pressAge>=500&&p.reloadedVolley!==volley){p.reloadedVolley=volley;p.reload++;}
  }
  const targetZ=lane.z+.10*Math.sin((now-pumpStart)/500+lane.index);
  const strafe=Math.max(-.15,Math.min(.15,(a.z-targetZ)*2));
  const input=p.room.input({mode:'reliable',renderDelay:100});
  Object.assign(input.data,{lifeId:a.lifeId,controlEpoch:a.controlEpoch,sampleTick:p.room.state.tick,
   fireId:p.fire,reloadId:p.reload,forward:0,strafe,yaw:lane.yaw,pitch:lane.pitch,
   jump:false,crouch:false,sneak:false,aim:false,fire});
  input.send();
  maxPending=Math.max(maxPending,input.pendingCount);
  if(measuring)p.measuredInputs++;
 }
 function verifyWeaponLoad(measured,baseline){
  assert.equal(measured.rooms.length,1);
  const [room]=measured.rooms;
  const activity=measured.weaponActivity;
  assert.equal(room.actors,count);
  assert.equal(room.seats,count);
  assert(room.inputMax<=12);
  assert((room.histories||0)<=64);
  assert.deepEqual(room.listeners,baseline.rooms[0].listeners,'socket listener counts stay fixed');
  assert.equal(room.phase,'active');
  assert.equal(room.ai,0);
  assert.equal(room.residents,0);
  assert.equal(room.clients,10);
  assert.equal(room.friendlyFire,false);
  assert.equal(measured.wholeRun.tick.n,measured.updates);
  assert.equal(measured.wholeRun.interval.n,measured.updates-1);
  for(const team of ['analysts','counterAnalysts'])assert.equal(room.actorsState.filter(a=>a.team===team).length,5);
  for(const a of room.actorsState){
   assert(a.alive&&a.deaths===0&&a.hp===100,`${a.id} stayed healthy and active`);
   assert.equal(a.weapon,weaponLoad);
   assert.equal(activity.shotsByActor[a.id],weaponVolleys,`${a.id} fired every scheduled shot`);
   assert.equal(activity.reloadsByActor[a.id],weaponVolleys-1,`${a.id} reloaded between shots`);
  }
  for(const p of peers){
   const a=room.actorsState.find(actor=>actor.id===p.weaponActorId);
   const {ammo,reserve}=p.startingAmmo;
   assert.equal(a.ammo+a.reserve,ammo+reserve-weaponVolleys,`${a.id} used the weapon's normal ammunition`);
   assert.equal(p.fire,weaponVolleys,'all scheduled trigger presses sent');
   assert.equal(p.reload,weaponVolleys-1,'all scheduled reload requests sent');
   assert(p.measuredInputs>0&&p.measuredInputs===peers[0].measuredInputs,'each client sent the same number of input frames');
  }
  assert.equal(activity.shots,count*weaponVolleys,'authoritative shot count');
  const rockets=weaponLoad==='bazooka'?activity.shots:0;
  assert.equal(activity.rocketLaunches,rockets,'authoritative rocket-launch count');
  assert.equal(activity.rocketExplosions,rockets,'authoritative rocket-explosion count');
  assert.equal(activity.peakRocketsInFlight>0,rockets>0,'observed live server projectiles');
  assert.equal(measured.classic.rounds,0,'the initial round covered the measurement window');
 }
 try{
  if(weaponLoad){
   assert(info.contract.protocolVersion>=9,'Weapon load requires the rocket projectile contract');
   assert.equal(info.contract.mapId,'floor5-prepared','Weapon load requires the prepared Floor 5 map');
  }
  const first=await add();for(let i=1;i<count;i++)await add(first.room.roomId);
  if(weaponLoad)await prepareWeaponLoad(first);
  const pumpStart=performance.now();let next=pumpStart;
  function pump(){
   if(!running)return;
   const now=weaponLoad?performance.now():0;
   for(const p of peers){
    const a=own(p);if(!a||p.room.reconnection.isReconnecting)continue;
    if((soak||ai)&&p.room.state.phase!=='active'){
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
    if(weaponLoad){weaponInput(p,a,now,pumpStart);continue;}
    if(classic&&p.room.state.roundPhase==='buy'){
      if(p.bought!==p.room.state.round){
        p.bought=p.room.state.round;p.room.send('classic',{kind:'buy',item:'he',serial:p.bought,round:p.bought,
          matchId:p.room.state.matchId,lifeId:a.lifeId,controlEpoch:a.controlEpoch});
      }
      continue;
    }
    if(ai&&a.he&&p.throwLife!==a.lifeId&&p.room.state.time>5){
      p.throwLife=a.lifeId;p.room.send('select',{slot:'he',serial:a.lifeId,lifeId:a.lifeId,controlEpoch:a.controlEpoch});
    }
    const enemy=[...p.room.state.actors.values()].find(b=>b.ready&&b.alive&&b.team!==a.team&&b.id.endsWith(a.id.split('-').at(-1)));
    const input=p.room.input({mode:'reliable',renderDelay:100});
    Object.assign(input.data,{lifeId:a.lifeId,controlEpoch:a.controlEpoch||0,sampleTick:p.room.state.tick,
     fireId:++p.fire,reloadId:a.ammo===0&&a.reserve>0?++p.reload:p.reload,forward:0,strafe:Math.sin(frames/120)*.15,
     yaw:enemy?Math.atan2(-(enemy.x-a.x),-(enemy.z-a.z)):a.yaw,pitch:0,jump:false,crouch:false,sneak:false,aim:ai&&a.weapon!=='he',fire:a.weapon==='he'?Math.floor(frames/12)%2===1:!!enemy&&(!classic||Math.floor(frames/8)%2===0)});
    input.send();maxPending=Math.max(maxPending,input.pendingCount);
   }
   frames++;next+=1000/60;if(next<performance.now()-100)next=performance.now();timer=setTimeout(pump,Math.max(0,next-performance.now()));
  }pump();
  await delay(warmupMs);const baseline=await rpc('reset'),samples=[];let nextCycle=performance.now()+30000,nextDrop=performance.now()+15000;
  const start=performance.now(),end=start+duration*1000;
  if(weaponLoad){weaponRunStart=start;maxPending=0;await delay(duration*1000);}
  while(!weaponLoad&&performance.now()<end){
   await delay(Math.min(5000,end-performance.now()));
   if(soak&&performance.now()>=nextDrop){
    const p=peers[0],epoch=own(p).controlEpoch;await rpc('drop',{room:p.room.roomId,sid:p.room.sessionId});
    await until(()=>own(p)?.controlEpoch>epoch,'soak reconnection');reconnects++;nextDrop+=60000;
   }
   if(soak&&performance.now()>=nextCycle&&joins<20){
    const p=peers.pop();await p.room.leave();await delay(150);await add(peers[0].room.roomId);joins++;nextCycle+=30000;
   }
   const sample=await rpc('sample');samples.push(sample);
   assert.equal(sample.rooms.length,1);assert.equal(sample.rooms[0].actors,ai?10:count);assert.equal(sample.rooms[0].seats,count);
   assert(sample.rooms[0].inputMax<=12);assert((sample.rooms[0].histories||0)<=64);
   assert(sample.rooms[0].listeners.every(n=>n===sample.rooms[0].listeners[0]),'socket listeners do not accumulate '+JSON.stringify(sample.rooms[0].listenerDetails));
   if(soak&&samples.length%12===0)console.log(JSON.stringify({soakSeconds:Math.round(sample.elapsedSeconds),joins,reconnects,combatRespawns:sample.combatRespawns,matchId:sample.rooms[0].matchId,heapMiB:sample.memory.heapUsed/1048576}));
  }
  running=false;clearTimeout(timer);const measured=await rpc('sample');
  if(weaponLoad)verifyWeaponLoad(measured,baseline);
  if(ai){assert.equal(measured.rooms[0].ai,count===1?9:10-count);assert(measured.botShots>0&&measured.botTravel>5&&(classic?measured.classic.rounds>0:measured.combatRespawns>0)&&measured.throws>0,'active AI movement and combat');}
  assert(peers.every(p=>p.shots>0),'every independent client fired');if(!ai&&!weaponLoad)assert(peers.some(p=>p.hits>0),'sustained combat hit opponents');
  if(soak){assert(measured.rooms[0].matchId>=3,'soak must complete multiple matches');assert(joins>=20);assert(measured.combatRespawns>=20,'actual deaths must respawn, excluding match resets and joins');const warm=samples.filter(s=>s.elapsedSeconds>=120);if(warm.length>10){const first=warm.slice(0,6).map(s=>s.memory.heapUsed),last=warm.slice(-6).map(s=>s.memory.heapUsed);assert(Math.max(...last)<Math.max(...first)+16*1048576,'post-GC retained heap remains bounded');}}
  await Promise.all(peers.map(p=>p.room.leave()));await delay(500);const cleanup=await rpc('sample');assert.equal(cleanup.rooms.length,0,'empty room disposed');
  results.push({status:'PASS',kind:'protocol-only, server in separate process',physicalPi:info.environment.model?.startsWith('Raspberry Pi')?'PASS':'NOT RUN',count,rttMs:rtt,jitterMs:rtt?20:0,loss:'NOT RUN: ordered WebSocket delay, no packet dropping',environment:info.environment,contract:info.contract,
    measured,baseline,perPlayerOutboundBytesPerSecond:measured.bytes/measured.elapsedSeconds/count,maxPending,joins,reconnects,shots:peers.map(p=>p.shots),hits:peers.map(p=>p.hits),samples:soak||ai?samples:undefined,cleanup,
    ...(weaponLoad?{weaponLoad:{weapon:weaponLoad,mode:classic?'classic':'tdm',friendlyFire:measured.rooms[0].friendlyFire,
      warmupSeconds:warmupMs/1000,requestedSeconds:duration,baselineWindow:'setup and warm-up',inputHz:60,
      volleys:weaponVolleys,volleyPeriodMs:volleyMs,startingCredits,lanes:[...lanes.values()],
      startingAmmoByActor:Object.fromEntries(peers.map(p=>[p.weaponActorId,p.startingAmmo])),
      inputsByActor:Object.fromEntries(peers.map(p=>[p.weaponActorId,p.measuredInputs]))}}:{})});
  console.log(JSON.stringify({count,rtt,status:'PASS',simulation:measured.costMs.simulation,tick:measured.costMs.tick,outbound:results.at(-1).perPlayerOutboundBytesPerSecond,
   ...(weaponLoad?{weapon:weaponLoad,mode:classic?'classic':'tdm',wholeRun:measured.wholeRun,weaponActivity:measured.weaponActivity}:{})}));
 }finally{running=false;clearTimeout(timer);await Promise.allSettled(peers.map(p=>p.room.leave()));await proxy?.close();await rpc('close').catch(()=>{});}
 await mkdir(new URL('.',pathToFileURL(process.cwd()+'/'+output)),{recursive:true});await writeFile(output,JSON.stringify({results},null,2)+'\n');
}
