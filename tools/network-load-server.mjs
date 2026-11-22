import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
// Private test IPC only. Never imported by the shipped server.
import {readFile} from 'node:fs/promises';
import {monitorEventLoopDelay} from 'node:perf_hooks';
import {pathToFileURL} from 'node:url';
import {cpus,platform,arch} from 'node:os';
const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const {createLocalServer}=await import(new URL('server/local-server.mjs',root));
const {CONTRACT}=await import(new URL('shared/multiplayer/build.mjs',root));
const loops=monitorEventLoopDelay({resolution:10});loops.enable();
const samples={tick:[],simulation:[],projection:[],serialization:[],interval:[],shotAge:[]};
const totals=Object.fromEntries(Object.keys(samples).map(key=>[key,0]));
const full = Object.fromEntries(['tick','interval'].map(key => [key, []]));
const slow = [];
const phaseCosts=Object.fromEntries(['combat','buy','result'].map(phase=>[phase,{tick:[],simulation:[],interval:[]}]));
const residentActivity={distance:0,windups:0,stomps:0};
const objectiveCosts={beginRound:[],breakAt:[],findPath:[],escortedTick:[]};
let work,roomStartup;
function profile(object, method, label) {
 const original=object[method];
 object[method]=function(...args){
   const samples=objectiveCosts[label];
   if(!work&&!samples)return original.apply(this,args);
   const t=performance.now();
   let result;
   try{result=original.apply(this,args);return result;}finally{
     const ms=performance.now()-t;
     if(work)work[label]=(work[label]||0)+ms;
     if(samples&&(label!=='breakAt'||result))samples.push(ms);
   }
 };
}
const push=(key,n)=>{totals[key]+=n;full[key]?.push(n);const a=samples[key];a.push(n);if(a.length>8192)a.shift();};
const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b),n=sorted.length;if(!n)return {n:0,p50:null,p95:null,p99:null,max:null};return {n,p50:sorted[Math.floor(n*.5)]||0,p95:sorted[Math.floor(n*.95)]||0,p99:sorted[Math.floor(n*.99)]||0,max:sorted.at(-1)||0};};
const withSlowCounts=values=>({...stats(values),above33:values.filter(n=>n>33).length,above50:values.filter(n=>n>50).length,above100:values.filter(n=>n>100).length});
const ai=process.env.CS2_LOAD_AI==='1';
const weaponLoad=process.env.CS2_LOAD_WEAPON;
const classicStartingCredits=3600;
function newWeaponActivity(){
 return {shots:0,shotsByActor:{},reloadsByActor:{},rocketLaunches:0,rocketExplosions:0,peakRocketsInFlight:0};
}
let weaponActivity=newWeaponActivity();
const classicMetrics={rounds:0,plants:0,defuses:0,escorts:0,rescues:0,hostageTravel:0};
let botShots=0,botTravel=0,throws=0,breaks=0,updates=0;
let local,started=performance.now(),cpu=process.cpuUsage(),bytes=0,inBytes=0,respawns=0,combatRespawns=0,fixtureTimer;
const seen=new WeakSet(),connections=new WeakSet(),lives=new Map();
function instrument(){
 for(const r of local.rooms){
  if(!r.sim||!r.state)continue;
  if(!seen.has(r)){
   seen.add(r);let last;
   if(ai){
    const g=r.sim.game;
    for(const [obj,key] of [[g.world.navigation,'findPath'],[g.world,'findPath'],[g,'updateGrenades'],[g,'moveActor'],[g,'fire'],[g.world.glass,'breakAt']])profile(obj,key,(obj===g.world?'world.':'')+key);
    if(r.classic){profile(g,'beginRound','beginRound');profile(g,'updateHostages','updateHostages');}
   }
   for(const [obj,key,label] of [[r,'fixedTick','tick'],[r.sim,'tick','simulation'],[r,'project','projection'],[r,'broadcastPatch','serialization']]){
    const original=obj[key];obj[key]=function(...args){
      const dead=label==='simulation'?r.sim.game.actors.filter(a=>!a.alive):[];
      const t=performance.now(),phase=r.state.phase==='results'?'result':r.sim.game.phase==='active'?'combat':r.sim.game.phase;
      if(label==='tick'){
        if(roomStartup?.id===r.roomId && last!==undefined)roomStartup.maxInterval=Math.max(roomStartup.maxInterval,t-last);
        if(last!==undefined&&(!weaponLoad||last>=started)){push('interval',t-last);phaseCosts[phase]?.interval.push(t-last);}
        last=t;work={};
      }
      let result;
      try{
          const classicRoom=label==='simulation'&&r.classic;
          const residents=label==='simulation'&&ai?r.sim.game.state.zombies.map(z=>[z,z.x,z.z]):[];
          const followers=classicRoom?r.sim.game.hostages.map(h=>[h,h.distanceWalked]):[];
          result=original.apply(this,args);
          if(classicRoom){
            if(followers.some(([h,before])=>h.distanceWalked>before))objectiveCosts.escortedTick.push(performance.now()-t);
            for(const [h,before] of followers)classicMetrics.hostageTravel+=h.distanceWalked-before;
            for(const e of result){
              if(e.type==='round')classicMetrics.rounds++;
              if(e.type==='planted')classicMetrics.plants++;
              if(e.type==='result'&&e.reason==='defuse')classicMetrics.defuses++;
              if(e.type==='hostage'&&e.escortId)classicMetrics.escorts++;
              if(e.type==='rescued')classicMetrics.rescues++;
            }
          }
          if(ai&&label==='simulation'){
            for(const [z,x,y] of residents)residentActivity.distance+=Math.hypot(z.x-x,z.z-y);
            residentActivity.windups+=result.filter(e=>e.type==='zombie-windup').length;
            residentActivity.stomps+=result.filter(e=>e.type==='zombie-stomp').length;
            throws+=result.filter(e=>e.type==='throw').length;breaks+=result.filter(e=>e.type==='glass-break').length;
            botShots+=result.filter(e=>e.type==='shot'&&r.bots.has(e.actorId)).length;
            for(const {actor} of r.bots.values())botTravel+=actor.alive?actor.moving/60:0;
          }
          return result;
        }finally{
        const ms=performance.now()-t;
        push(label,ms);phaseCosts[phase]?.[label]?.push(ms);if(label==='tick'){updates++;if(ms>33&&slow.length<10000)slow.push({tick:r.sim.tickNumber,ms,work,respawns:combatRespawns,breaks});work=null;}
        if(label==='simulation'){
          if(weaponLoad&&result)recordWeaponActivity(r.sim.game,result);
          combatRespawns+=dead.filter(a=>a.alive).length;placeActors(r);
        }
      }
    };
   }
   if(r.lag){const accept=r.lag.accept;r.lag.accept=function(seat,frame,stamp){if(stamp)push('shotAge',r.clock.elapsedTime-stamp);return accept.call(this,seat,frame,stamp);};}
  }
  for(const c of r.clients)if(!connections.has(c.ref)){
   connections.add(c.ref);const original=c.ref.send;
   c.ref.send=function(data,...args){bytes+=typeof data==='string'?Buffer.byteLength(data):data.byteLength;return original.call(this,data,...args);};
   c.ref.on('message',data=>inBytes+=data.byteLength);
  }
  placeActors(r);
 }
}
function placeActors(r){
  // Place a respawn before its first state projection, so no intermediate
  // ordinary spawn can be interpolated into this controlled combat fixture.
  // Test-only combat placement on each new life. All movement, ammo, hits,
  // cooldowns, damage and respawn timing still pass through the real authority.
  if(ai||weaponLoad)return;
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
function recordWeaponActivity(game,events){
 for(const event of events){
  if(event.weapon===weaponLoad&&event.type==='shot'){
   weaponActivity.shots++;
   const counts=weaponActivity.shotsByActor;
   counts[event.actorId]=(counts[event.actorId]||0)+1;
  }else if(event.weapon===weaponLoad&&event.type==='reload'){
   const counts=weaponActivity.reloadsByActor;
   counts[event.actorId]=(counts[event.actorId]||0)+1;
  }else if(event.type==='rocket-launch')weaponActivity.rocketLaunches++;
  else if(event.type==='rocket-explosion')weaponActivity.rocketExplosions++;
 }
 weaponActivity.peakRocketsInFlight=Math.max(weaponActivity.peakRocketsInFlight,game.state.projectiles.length);
}
function weaponFixtureRoom(){
 const [room]=local.rooms;
 if(!weaponLoad||local.rooms.size!==1||room.sim.game.actors.length!==10||room.bots.size)throw Error('Weapon fixture requires ten human-controlled actors in one room');
 return room;
}
function placeWeaponActors(room){
 const {world,actors}=room.sim.game;
 if(room.state.phase!=='active'||room.sim.game.phase!=='active'||actors.some(a=>!a.alive||a.weapon!==weaponLoad)){
  throw Error('Weapon fixture requires ten living actors with the selected weapon in active play');
 }
 // Parallel C08 lanes keep both teams active during the same firing schedule.
 // Check the real collision path past the blast radius, including strafe clearance.
 const x=22.8,yaw=Math.PI/2,pitch=-.25,lanes=[];
 const direction={x:-Math.cos(pitch),y:Math.sin(pitch),z:0};
 const ordered=actors.slice().sort((a,b)=>a.team.localeCompare(b.team)||a.index-b.index);
 for(const actor of ordered){
  const firstZ=lanes.length?lanes.at(-1).z+.75:-24.25;
  let lane;
  for(let z=firstZ;z<=2.75;z+=.25){
   if(world.roomAt(x,z)?.id!=='C08'||!world.canOccupy(x,z,actor.radius+.15,actor.height,0))continue;
   const clear=[-.15,-.10,-.05,0,.05,.10,.15].every(offset=>
    !world.raycast({x,y:actor.height-.12,z:z+offset},direction,5.5));
   if(clear){lane={id:actor.id,x,z,yaw,pitch};break;}
  }
  if(!lane)throw Error(`No clear C08 lane for ${actor.id}`);
  lanes.push(lane);
 }
 for(const [index,actor] of ordered.entries()){
  const {z}=lanes[index];
  Object.assign(actor,{x,y:0,z,yaw,pitch,vy:0,onGround:true});
 }
 room.project();
 return lanes;
}
function thermal(){
 let temperatureC=null,throttled=null;
 try{temperatureC=Number(readFileSync('/sys/class/thermal/thermal_zone0/temp','utf8'))/1000;}catch{}
 try{throttled=execFileSync('vcgencmd',['get_throttled'],{encoding:'utf8',timeout:1000}).trim();}catch{}
 return {temperatureC,throttled};
}
function snapshot(){
 instrument();
 const usage=process.cpuUsage(cpu),elapsed=(performance.now()-started)/1000;
 const loopSamples=Number(loops.count);
 return {thermal:thermal(),elapsedSeconds:elapsed,serverCpuPercent:(usage.user+usage.system)/1e4/elapsed,memory:process.memoryUsage(),
  residents:{...residentActivity},phaseCosts:Object.fromEntries(Object.entries(phaseCosts).map(([phase,costs])=>[phase,
    Object.fromEntries(Object.entries(costs).map(([label,values])=>[label,withSlowCounts(values)]))])),
  classic:{...classicMetrics},objectiveCosts:Object.fromEntries(Object.entries(objectiveCosts).map(([k,a])=>[k,stats(a)])),wholeRun:Object.fromEntries(Object.entries(full).map(([key,a])=>[key,withSlowCounts(a)])),slow:slow.slice().sort((a,b)=>b.ms-a.ms).slice(0,12),
  eventLoopMs:loopSamples?{n:loopSamples,p50:loops.percentile(50)/1e6,p95:loops.percentile(95)/1e6,p99:loops.percentile(99)/1e6,max:loops.max/1e6}:{n:0,p50:null,p95:null,p99:null,max:null},
  costMs:Object.fromEntries(Object.entries(samples).filter(([k])=>k!=='shotAge').map(([k,v])=>[k,stats(v)])),shotAgeMs:stats(samples.shotAge),bytes,inBytes,respawns,combatRespawns,botShots,botTravel,throws,breaks,updates,workPerUpdateMs:updates?(totals.tick+totals.serialization)/updates:0,
  resources:process.getActiveResourcesInfo().reduce((o,k)=>(o[k]=(o[k]||0)+1,o),{}),
  ...(weaponLoad?{weaponActivity}:{}),
  rooms:[...local.rooms].map(r=>({id:r.roomId,matchId:r.state.matchId,phase:r.state.phase,residents:r.state.residents?.size||0,clients:r.clients.length,ai:r.bots?.size||0,seats:r.seats.size,actors:r.sim.game.actors.length,tick:r.sim.tickNumber,
   metrics:r.metrics,lag:r.lag?{...r.lag.metrics,ages:stats(r.lag.metrics.ages)}:undefined,histories:r.lag?.tickTimes.size,
   rewindEntities:r.lag?.rewind.groups?.map(g=>[...g.entities()].length),
   inputMax:Math.max(0,...[...r.seats.keys()].map(sid=>r.inputs.get(sid).size)),rtts:[...r.seats.values()].map(s=>s.rtt),
   listeners:r.clients.map(c=>c.ref.eventNames().reduce((n,name)=>n+c.ref.listenerCount(name),0)),
   listenerDetails:r.clients.map(c=>({sid:c.sessionId,events:Object.fromEntries(c.ref.eventNames().map(name=>[name,c.ref.listenerCount(name)]))})),
   ...(weaponLoad?{friendlyFire:r.state.friendlyFire}:{}),
   score:{...r.sim.game.state.score},actorsState:r.sim.game.actors.map(a=>({id:a.id,lifeId:a.lifeId,kills:a.kills,deaths:a.deaths,
    ...(weaponLoad?{team:a.team,alive:a.alive,hp:a.hp,weapon:a.weapon,ammo:a.inventory.primary?.ammo,reserve:a.inventory.primary?.reserve}:{})}))}))};
}
process.on('message',async({id,action,options})=>{
 try{
  let result;
  if(action==='start'){
   const testMatch=weaponLoad?{countdownSeconds:.2}:ai?{}:process.env.CS2_SOAK==='1'?{durationSeconds:90,scoreTarget:30,countdownSeconds:.2}:{continuous:true};
   local=await createLocalServer({port:0,testMatch});fixtureTimer=setInterval(instrument,20);
   const model=await readFile('/proc/device-tree/model','utf8').then(value=>value.replace(/\0/g,'').trim()).catch(()=>undefined);
   result={url:local.url,contract:CONTRACT,environment:{model,node:process.version,platform:platform(),arch:arch(),cpu:cpus()[0].model,cores:cpus().length}};
  }else if(action==='room-startup'){
   instrument();
   const rooms=[...local.rooms];
   if(options?.watch){
    const room=rooms.find(r=>r.roomId===options.watch);if(!room)throw Error('Missing active room');
    roomStartup={id:room.roomId,maxInterval:0};
   }
   result={rss:process.memoryUsage().rss,maxInterval:roomStartup?.maxInterval,
    rooms:rooms.map(r=>({id:r.roomId,phase:r.state.phase,clients:r.clients.length,bots:r.bots.size,navigationBuildMs:r.sim.game.world.navigation.statistics.buildMs}))};
  }else if(action==='fund-weapon-fixture'){
   const room=weaponFixtureRoom();
   if(!room.classic||room.state.phase!=='waiting')throw Error('Set Classic fixture credits in the waiting lobby');
   room.sim.game.config.startMoney=classicStartingCredits;
   result=classicStartingCredits;
  }else if(action==='place-weapon-fixture'){
   result=placeWeaponActors(weaponFixtureRoom());
  }else if(action==='reset'){
   if(weaponLoad)result=snapshot();
   for(const costs of Object.values(phaseCosts))for(const values of Object.values(costs))values.length=0;
   for(const key of Object.keys(residentActivity))residentActivity[key]=0;
   for(const key of Object.keys(classicMetrics))classicMetrics[key]=0;
   for(const a of [...Object.values(objectiveCosts),...Object.values(samples),...Object.values(full),slow])a.length=0;for(const k of Object.keys(totals))totals[k]=0;updates=throws=breaks=botTravel=botShots=respawns=combatRespawns=bytes=inBytes=0;
   if(weaponLoad){weaponActivity=newWeaponActivity();loops.disable();loops.enable();}
   loops.reset();cpu=process.cpuUsage();started=performance.now();if(process.env.CS2_FORCE_GC==='1'||process.env.CS2_SOAK==='1')global.gc?.();if(!weaponLoad)result=snapshot();
  }else if(action==='sample'){if(process.env.CS2_FORCE_GC==='1'||process.env.CS2_SOAK==='1')global.gc?.();result=snapshot();}
  else if(action==='drop'){const r=[...local.rooms].find(r=>r.roomId===options.room);r.clients.find(c=>c.sessionId===options.sid).ref.terminate();}
  else if(action==='close'){clearInterval(fixtureTimer);await local.close();loops.disable();result=snapshot();}
  else throw Error('Unknown test IPC action');
  process.send({id,result},()=>{if(action==='close')process.disconnect();});
 }catch(e){process.send({id,error:e.stack});}
});
process.on('disconnect',()=>{clearInterval(fixtureTimer);loops.disable();local?.close().catch(()=>{});});
