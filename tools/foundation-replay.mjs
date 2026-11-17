// Deterministic offline trace used before/after the controller/movement extraction.
// Run from the repository root with the vendored Three loader. No network or renderer.
// Exclude only the BotController object graph and newly added controller metadata.
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createWorld} from '../src/fps/world.mjs';
import {Game} from '../src/fps/game.mjs';
const rows=[];
for(const map of ['synthetic-demo','floor5-prepared']){
 const t=performance.now(),project=JSON.parse(fs.readFileSync(`levels/${map}.json`)),world=createWorld({levelProject:project,fresh:true});
 const constructionMs=performance.now()-t;
 for(const mode of ['classic','endless'])for(const autoplay of [false,true]){
  const game=new Game(world,{seed:42,autoplay,config:{mode,buyTime:0}}).start();
  const hash=createHash('sha256');let shots=0;const start=performance.now();
  for(let tick=0;tick<1200;tick++){
   game.step(1/60,{forward:tick%120<60?1:0,strafe:tick%200<100?.3:-.3,yaw:tick*.001,pitch:.03,fire:tick%90<20,crouch:tick%180<30,jump:tick%90===0});
   const events=game.drainEvents();shots+=events.filter(e=>e.type==='shot').length;
   hash.update(JSON.stringify({state:game.state,events},(k,v)=>['bot','controllerType'].includes(k)?undefined:v));
  }
  rows.push({map,mode,autoplay,ticks:1200,hash:hash.digest('hex'),shots,constructionMs,simulationMs:performance.now()-start});
 }
}
console.log(JSON.stringify(rows,null,2));
