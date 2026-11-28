// Compare two checked-out revisions by running this same harness against each.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {parseArgs} from 'node:util';

const {values}=parseArgs({options:{
  root:{type:'string',default:'.'},out:{type:'string'},
  maps:{type:'string',default:'floor5-prepared,compact-arena,meltem,embruns,tephra'},
  seeds:{type:'string',default:'17,42,93'},ticks:{type:'string',default:'1800'},
}});
const root=pathToFileURL(resolve(values.root)+'/'),ticks=Number(values.ticks);
assert(Number.isSafeInteger(ticks)&&ticks>=60);
const {createHeadlessSimulation}=await import(new URL('server/headless.mjs',root));
const {NETWORK_CONFIG,CLASSIC_NETWORK_CONFIG}=await import(new URL('shared/multiplayer/rules.mjs',root));
const players=Object.fromEntries(['analysts','counterAnalysts'].flatMap(team=>
  Array.from({length:5},(_,i)=>[team+'-'+i,team==='analysts'&&i===0?'human':'bot'])));
const quantiles=items=>{
  const sorted=items.toSorted((a,b)=>a-b);
  const pick=q=>Number((sorted[Math.max(0,Math.ceil(q*sorted.length)-1)]??0).toFixed(3));
  return {count:items.length,p50:pick(.5),p95:pick(.95),p99:pick(.99),max:pick(1)};
};
const git=(...args)=>execFileSync('git',['-C',resolve(values.root),...args],{encoding:'utf8'}).trim();
const report={source:git('rev-parse','HEAD'),changes:git('status','--short','--untracked-files=no'),
  node:process.version,arch:process.arch,ticksPerRun:ticks,runs:[]};
for(const seed of values.seeds.split(',').map(Number))for(const mapId of values.maps.split(',')){
  const startup=performance.now(),classic=mapId==='floor5-prepared';
  const sim=await createHeadlessSimulation({mapId,seed,controllers:players,
    config:{...(classic?CLASSIC_NETWORK_CONFIG:NETWORK_CONFIG),buyTime:1}});
  const readyMs=performance.now()-startup;
  const world=sim.game.world;
  assert.equal(sim.game.actors.filter(a=>a.bot).length,9);
  const tickWork=[],tickRoute=[],tickStarts=[],sliceTimes=[],requestWork=[],responseTicks=[];
  let tick=0,starts=0,spent=0,finished=0,empty=0,shots=0,kills=0,earlyShots=0;
  function observe(owner){
    const original=owner.findPath;
    owner.findPath=function(...args){
      const firstTick=tick,start=performance.now(),result=original.apply(this,args);
      starts++;
      let total=performance.now()-start;
      spent+=total;
      function finish(path){
        assert(Array.isArray(path));
        finished++;if(!path.length)empty++;
        requestWork.push(total);responseTicks.push(tick-firstTick);
      }
      if(Array.isArray(result)){sliceTimes.push(total);finish(result);return result;}
      return {next(){
        const start=performance.now(),state=result.next(),elapsed=performance.now()-start;
        total+=elapsed;spent+=elapsed;sliceTimes.push(elapsed);
        if(state.done)finish(state.value);
        return state;
      }};
    };
  }
  observe(world);observe(world.navigation);
  for(;tick<ticks;tick++){
    starts=0;spent=0;
    const start=performance.now(),events=sim.tick(),elapsed=performance.now()-start;
    tickWork.push(elapsed);tickRoute.push(spent);tickStarts.push(starts);
    for(const event of events){
      if(event.type==='shot'){shots++;if(event.reactionAt>event.time+1e-7)earlyShots++;}
      if(event.type==='kill')kills++;
    }
  }
  const actors=sim.game.actors.filter(a=>a.bot);
  assert.equal(earlyShots,0);assert(tickStarts.some(n=>n>0));
  assert(actors.every(a=>[a.x,a.y,a.z].every(Number.isFinite)&&world.scopeAllowed(a.x,a.z,a.radius)));
  const row={mapId,mode:classic?'classic':'tdm',seed,readyMs:Number(readyMs.toFixed(1)),
    tickMs:quantiles(tickWork),routeWorkPerTickMs:quantiles(tickRoute),startsPerTick:quantiles(tickStarts),
    routeSliceMs:quantiles(sliceTimes),completedRequestCpuMs:quantiles(requestWork),responseTicks:quantiles(responseTicks),
    started:tickStarts.reduce((sum,n)=>sum+n,0),finished,empty,shots,kills,earlyShots,
    overBudgetTicks:tickWork.filter(n=>n>1000/60).length,
    finalBotTravel:actors.map(a=>Number(a.bot.distanceTravelled.toFixed(2)))};
  report.runs.push(row);
  if(values.out)await writeFile(values.out,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(row));
}
