import {pathToFileURL} from 'node:url';
import {performance} from 'node:perf_hooks';
const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const {createHeadlessSimulation}=await import(new URL('server/headless.mjs',root));
const {NETWORK_CONFIG}=await import(new URL('shared/multiplayer/rules.mjs',root));
const {respawnActor}=await import(new URL('src/fps/action-rules.mjs',root));
const controllers=Object.fromEntries(['analysts','counterAnalysts'].flatMap(team=>Array.from({length:5},(_,i)=>[`${team}-${i}`,'human'])));
const {game:g}=await createHeadlessSimulation({config:NETWORK_CONFIG,controllers});
let rays=0;const clear=g.world.segmentClear;g.world.segmentClear=(...args)=>{rays++;return clear(...args);};
const times=[],positions=[];
for(let j=0;j<35;j++){
 const before=performance.now();for(const a of g.actors){a.alive=false;if(!respawnActor(g,a))throw Error('No spawn');}
 if(j>=5){times.push(performance.now()-before);positions.push(g.actors.map(a=>[a.id,a.x,a.z]));}
 if(j===4)rays=0;
}
times.sort((a,b)=>a-b);console.log(JSON.stringify({node:process.version,platform:process.platform,kind:'10-actor spawn microbenchmark, no network clients',batches:times.length,rays,ms:{p50:times[15],p95:times[28],p99:times[29]},positions}));
