import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';import {Game} from '../src/fps/game.mjs';
import {runRounds,runObjective} from './bot-tactics-scenarios.mjs';
const w=createWorld({levelProject:JSON.parse(fs.readFileSync('levels/floor5-prepared.json'))}),reports=[],objectives=[];
for(const seed of [17,42,93,9])test('two actual Floor 5 rounds, seed '+seed,()=>{
 const g=new Game(w,{seed,team:seed%2?'analysts':'counterAnalysts',autoplay:true,config:{buyTime:1,wanderers:false}}).start(),r=runRounds(g);reports.push(r);
 assert.equal(r.results.length,2);assert.equal(r.earlyShots,0);assert.equal(r.exits.length,2);
 for(const exit of r.exits)for(const a of exit.actors)if(a.alive){assert(!['BYGG-G-41001','BYGG-G-41002'].includes(a.room),a.id+' stuck in lift');assert(a.travel>3);}
 for(const team of ['analysts','counterAnalysts'])for(const round of [1,2])assert(new Set(r.routes.filter(v=>v.round===round&&v.actor.startsWith(team+'-')).map(v=>v.lane)).size>=2);
 assert(r.maxMovingStall<15,'long objective stall: '+r.maxMovingStall);
});
for(const seed of [17,42,93])for(const scenario of ['plant','defuse','rescue'])test(scenario+' with physical teammates and original timers, seed '+seed,()=>{
 const g=new Game(w,{seed,team:scenario==='defuse'?'analysts':'counterAnalysts',autoplay:true,config:{buyTime:1,wanderers:false,botFire:false,botVision:0}}).start(),r=runObjective(g,scenario);objectives.push(r);
 if(scenario==='plant'){assert.equal(r.bomb,'planted');assert(r.time<120);}
 if(scenario==='defuse')assert.equal(r.result,'defuse');
 if(scenario==='rescue'){assert.equal(r.result,'rescue');assert.equal(r.rescued,2);}
});
test('save controlled simulation report',()=>{fs.mkdirSync('test-results/bot-tactics',{recursive:true});fs.writeFileSync('test-results/bot-tactics/simulation.json',JSON.stringify({rounds:reports,objectives},null,2));});
