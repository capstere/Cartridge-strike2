import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {Session} from 'node:inspector/promises';
import {createWorld} from '../src/fps/world.mjs';
import {Game} from '../src/fps/game.mjs';
const world=createWorld({levelProject:JSON.parse(fs.readFileSync('levels/floor5-prepared.json'))});
const label=process.env.PROFILE_LABEL||'current',rows=[],session=new Session();session.connect();
await session.post('Profiler.enable');await session.post('Profiler.setSamplingInterval',{interval:500});
for(const seed of (process.env.PROFILE_SEEDS||'17,42,93').split(',').map(Number)){
 world.navigation.invalidate();
 const game=new Game(world,{seed,config:{mode:'endless',buyTime:0}}).start('analysts'),times=[],hash=createHash('sha256');let shots=0;
 await session.post('Profiler.start');
 for(let tick=0;tick<3600;tick++){
  const start=performance.now();game.step(1/60,{});times.push(performance.now()-start);
  const events=game.drainEvents();shots+=events.filter(e=>e.type==='shot').length;
  hash.update(JSON.stringify({state:game.state,events},(k,v)=>k==='bot'?undefined:v));
 }
 const {profile}=await session.post('Profiler.stop');fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync(`test-results/sim-${label}-${seed}.cpuprofile`,JSON.stringify(profile));
 times.sort((a,b)=>a-b);const row={seed,shots,hash:hash.digest('hex'),totalMs:times.reduce((a,b)=>a+b,0),median:times[1800],p95:times[3419],p99:times[3563]};rows.push(row);console.log(JSON.stringify(row));
}
session.disconnect();fs.writeFileSync(`test-results/simulation-${label}.json`,JSON.stringify(rows,null,2));
