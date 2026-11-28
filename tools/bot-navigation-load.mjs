// Compare two checked-out revisions by running this same harness against each.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,writeFile} from 'node:fs/promises';
import {cpus,loadavg} from 'node:os';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{
  root:{type:'string',default:'.'},out:{type:'string'},
  maps:{type:'string',default:'floor5-prepared,compact-arena,meltem,embruns,tephra'},
  diagnose:{type:'boolean',default:false},profiles:{type:'string',default:'authority,solo'},seeds:{type:'string',default:'17,42,93'},ticks:{type:'string',default:'1800'},
}});
const root=pathToFileURL(resolve(values.root)+'/'),ticks=Number(values.ticks);
assert(Number.isSafeInteger(ticks)&&ticks>=60);
const {createHeadlessSimulation,loadHeadlessWorld}=await import(new URL('server/headless.mjs',root));
const {NETWORK_CONFIG,CLASSIC_NETWORK_CONFIG}=await import(new URL('shared/multiplayer/rules.mjs',root));
const {Game}=await import(new URL('src/fps/game.mjs',root));
const {prepareNetworkWorld}=await import(new URL('shared/multiplayer/world.mjs',root));
const players=Object.fromEntries(['analysts','counterAnalysts'].flatMap(team=>
  Array.from({length:5},(_,i)=>[team+'-'+i,team==='analysts'&&i===0?'human':'bot'])));
const quantiles=items=>{
  const sorted=items.toSorted((a,b)=>a-b);
  const pick=q=>Number((sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]??0).toFixed(3));
  return {count:items.length,p50:pick(.5),p95:pick(.95),p99:pick(.99),max:pick(1)};
};
const git=(...args)=>execFileSync('git',['-C',resolve(values.root),...args],{encoding:'utf8'}).trim();
const temperature=async()=>{try{return Number(await readFile('/sys/class/thermal/thermal_zone0/temp','utf8'))/1000;}catch{return null;}};
const report={cpu:cpus()[0]?.model,temperatureAtStartC:await temperature(),loadAtStart:loadavg(),source:git('rev-parse','HEAD'),changes:git('status','--short','--untracked-files=no'),
  node:process.version,arch:process.arch,ticksPerRun:ticks,runs:[]};
for(const profile of values.profiles.split(','))for(const seed of values.seeds.split(',').map(Number))for(const mapId of values.maps.split(',')){
  assert(['authority','solo'].includes(profile));
  const startup=performance.now(),classic=mapId==='floor5-prepared';
  let game,advance,sourceHash;
  if(profile==='authority'){
    const roomSeats=Object.fromEntries(Object.keys(players).map(id=>[id,'human']));
    const sim=await createHeadlessSimulation({mapId,seed,controllers:roomSeats,
      config:{...(classic?CLASSIC_NETWORK_CONFIG:NETWORK_CONFIG),buyTime:1}});
    sourceHash=sim.sourceHash;game=sim.game;prepareNetworkWorld(game.world);
    // The room first allocates human seat templates, then assigns its vacant
    // seats to bots before beginRound constructs their real controllers.
    for(const a of game.actors)a.controllerType=players[a.id];
    game.state.round=0;game.beginRound();
    if(classic)game.world.networkDynamics.elevatorOpenAt=Math.max(0,game.state.buyDeadline-1.5);
    sim.controllers.bind('driver','analysts-0');
    advance=input=>sim.tick(new Map([['driver',input]]));
  }else{
    const loaded=await loadHeadlessWorld(mapId),world=loaded.world;sourceHash=loaded.sourceHash;
    game=new Game(world,{seed,controllers:players,localPlayerId:'analysts-0',
      config:{mode:classic?'classic':'endless',buyTime:1,wanderers:false,zombies:false,danceman:false}}).start();
    advance=input=>{game.step(1/60,input);return game.drainEvents();};
  }
  const readyMs=performance.now()-startup,world=game.world;
  assert.equal(game.actors.filter(a=>a.bot).length,9);
  const tickWork=[],tickRoute=[],tickStarts=[],botStartsPerTick=[],sliceTimes=[],requestWork=[],responseTicks=[],slowQueries=[];
  let tick=0,starts=0,botStarts=0,spent=0,finished=0,empty=0,shots=0,kills=0,earlyShots=0;
  const objectives={plants:0,defuses:0,rescues:0,results:[]};
  const behavior={observations:0,moving:0,investigating:0,coverReserved:0,stuckOverHalfSecond:0};
  function observe(owner){
    const original=owner.findPath;
    owner.findPath=function(...args){
      const firstTick=tick,start=performance.now(),result=original.apply(this,args);
      starts++;
      const bot=Boolean(args[2]?.stepped||args[0]?.bot);
      if(bot)botStarts++;
      function diagnose(ms,kind){
        if(!values.diagnose||ms<3)return;
        slowQueries.push({tick,firstTick,ms:Number(ms.toFixed(3)),kind,bot,
          actor:args[0]?.kind||args[0]?.id||null,weighted:args[2]?.avoid?.length||0,
          blockers:args[2]?.blockers?.length||0,from:[args[0].x,args[0].y,args[0].z],to:[args[1].x,args[1].y,args[1].z]});
      }
      let total=performance.now()-start;
      spent+=total;
      function finish(path){
        assert(Array.isArray(path));
        finished++;if(!path.length)empty++;
        requestWork.push(total);responseTicks.push(tick-firstTick);
      }
      if(Array.isArray(result)){sliceTimes.push(total);finish(result);diagnose(total,'synchronous');return result;}
      return {next(){
        const start=performance.now(),state=result.next(),elapsed=performance.now()-start;
        total+=elapsed;spent+=elapsed;sliceTimes.push(elapsed);
        if(state.done)finish(state.value);
        diagnose(elapsed,'continuation');
        return state;
      }};
    };
  }
  observe(world);observe(world.navigation);
  const firstRequests=new WeakMap(),requestToPath=[],firstMovement=new Map();
  const botPrototype=Object.getPrototypeOf(game.actors.find(a=>a.bot).bot),advanceRoute=botPrototype.advanceRoute;
  if(advanceRoute)botPrototype.advanceRoute=function(kind,...args){
    const previous=this.routeJobs[kind],path=advanceRoute.call(this,kind,...args),pending=this.routeJobs[kind];
    if(pending&&!firstRequests.has(pending))firstRequests.set(pending,tick);
    if(path?.length)requestToPath.push(tick-(firstRequests.get(previous)??tick));
    return path;
  };
  let activeAt=null;
  for(;tick<ticks;tick++){
    starts=0;botStarts=0;spent=0;
    const input={yaw:Math.sin(tick/180)*Math.PI,forward:tick%180<110?.8:0,
      strafe:tick%240<100?.35:-.35,fire:tick%90<20,reload:tick%480===0};
    const start=performance.now(),events=advance(input),elapsed=performance.now()-start;
    if(game.phase==='active'){
      activeAt??=tick;
      if(firstMovement.size<9)for(const a of game.actors){
        if(a.bot&&a.moving>.1&&!firstMovement.has(a.id))firstMovement.set(a.id,tick-activeAt);
      }
    }
    tickWork.push(elapsed);tickRoute.push(spent);tickStarts.push(starts);botStartsPerTick.push(botStarts);
    for(const event of events){
      if(event.type==='shot'){shots++;if(event.reactionAt>event.time+1e-7)earlyShots++;}
      if(event.type==='kill')kills++;
      if(event.type==='plant')objectives.plants++;
      if(event.type==='defuse')objectives.defuses++;
      if(event.type==='rescued')objectives.rescues++;
      if(event.type==='result')objectives.results.push({winner:event.winner,reason:event.reason,at:event.time});
    }
    if(tick%12===0)for(const a of game.actors.filter(a=>a.alive&&a.bot)){
      behavior.observations++;
      if(a.moving>.1)behavior.moving++;
      if(a.bot.mode==='investigate')behavior.investigating++;
      if(a.bot.coverMove?.until>game.state.time)behavior.coverReserved++;
      if(a.bot.stuckTime>.5)behavior.stuckOverHalfSecond++;
    }
  }
  if(advanceRoute)botPrototype.advanceRoute=advanceRoute;
  const actors=game.actors.filter(a=>a.bot);
  assert.equal(earlyShots,0);assert(tickStarts.some(n=>n>0));
  assert(actors.every(a=>[a.x,a.y,a.z].every(Number.isFinite)&&world.scopeAllowed(a.x,a.z,a.radius)));
  const row={mapId,sourceHash,profile,mode:classic?'classic':profile==='authority'?'tdm':'endless',seed,readyMs:Number(readyMs.toFixed(1)),
    tickMs:quantiles(tickWork),routeWorkPerTickMs:quantiles(tickRoute),startsPerTick:quantiles(tickStarts),botStartsPerTick:quantiles(botStartsPerTick),
    routeSliceMs:quantiles(sliceTimes),completedRequestCpuMs:quantiles(requestWork),responseTicks:quantiles(responseTicks),
    firstMovementFromActiveTicks:Object.fromEntries(firstMovement),
    requestToUsefulPathTicks:advanceRoute?quantiles(requestToPath):null,
    started:tickStarts.reduce((sum,n)=>sum+n,0),finished,empty,shots,kills,earlyShots,objectives,behavior,score:{...game.state.score},temperatureC:await temperature(),
    overBudgetTicks:tickWork.filter(n=>n>1000/60).length,
    finalBotTravel:actors.map(a=>Number(a.bot.distanceTravelled.toFixed(2)))};
  if(values.diagnose)row.slowestRouteCalls=slowQueries.sort((a,b)=>b.ms-a.ms).slice(0,12);
  report.runs.push(row);
  if(values.out)await writeFile(values.out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(row));
}
