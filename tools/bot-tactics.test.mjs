import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';
import {Game,DIFFICULTIES} from '../src/fps/game.mjs';
import {tacticalPosition} from '../src/fps/bot-tactics.mjs';
import {distanceSegment} from '../src/fps/physics.mjs';
const world=createWorld({levelProject:JSON.parse(fs.readFileSync('levels/floor5-prepared.json'))});
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
const start=(seed=42,extra={})=>new Game(world,{seed,autoplay:true,config:{buyTime:1,wanderers:false,...extra}}).start();
const eye=p=>({x:p.x,y:1.58,z:p.z});
function doorSignature(from,path){
 return world.data.doors.filter(d=>!d.blocked&&path.some((b,i)=>{
  const a=i?path[i-1]:from,ux=(d.b[0]-d.a[0])/d.width,uz=(d.b[1]-d.a[1])/d.width;
  const side=p=>-(p.x-d.center[0])*uz+(p.z-d.center[1])*ux,sa=side(a),sb=side(b);
  if(sa*sb>=0)return false;const t=sa/(sa-sb),x=a.x+(b.x-a.x)*t,z=a.z+(b.z-a.z)*t;
  return Math.abs((x-d.center[0])*ux+(z-d.center[1])*uz)<d.width/2;
 })).map(d=>d.id).sort().join('|');
}
test('both Floor 5 lifts have distinct door routes, all swept on unchanged Yuka geometry',()=>{
 const edges=()=>{const out=[];return world.navigation.nodes.flatMap(n=>{world.navigation.graph.getEdgesOfNode(n.id,out);return out.map(e=>[e.from,e.to,e.cost]);});};
 const before=edges();
 for(const team of ['analysts','counterAnalysts']){
  const from=world.anchors[team][0],choices=world.tactical.choices(team,'bomb');assert(choices.length>=2);
  assert(new Set(choices.map(c=>doorSignature(from,c.path))).size>=2,team+' needs different doors, not just different samples');
  for(const c of choices){let p=from;for(const q of c.path){assert(world.navigation.clear(p,q,.2));p=q;}assert(distance(p,world.anchors.bomb)<.001);}
  const ordinary=world.findPath(from,world.anchors.bomb);
  world.findPath(from,world.anchors.bomb,{avoid:[{...ordinary[Math.floor(ordinary.length/2)],radius:5,weight:8}]});
  assert.deepEqual(world.findPath(from,world.anchors.bomb),ordinary);
 }
 assert.deepEqual(edges(),before);
});
test('seeded round roles vary, retain objective owners, and reassign after loss/escort events',()=>{
 const snapshot=g=>g.actors.map(a=>({id:a.id,role:a.aiRole,task:a.bot.task,style:a.bot.style,depart:a.bot.departAt}));
 const first=start(17),same=start(17),other=start(93);
 assert.deepEqual(snapshot(first),snapshot(same));assert.notDeepEqual(snapshot(first),snapshot(other));
 assert.equal(first.actors.find(a=>a.id===first.bomb.carrierId).aiRole,'objective');
 const rescuers=first.actors.filter(a=>a.aiRole==='rescue');assert.equal(rescuers.length,2);assert.equal(new Set(rescuers.map(a=>a.bot.task.hostageId)).size,2);
 const victim=rescuers[0],hostageId=victim.bot.task.hostageId;victim.alive=false;first.squadTactics.refresh();
 assert(first.actors.some(a=>a.alive&&a.bot.task?.hostageId===hostageId));
 const escort=first.actors.find(a=>a.alive&&a.bot.task?.hostageId===hostageId);first.hostages.find(h=>h.id===hostageId).escortId=escort.id;first.squadTactics.refresh();assert.equal(escort.aiRole,'escort');
 const prior=snapshot(same);same.beginRound();assert.notDeepEqual(snapshot(same),prior);assert.deepEqual(same.tacticalContacts,[]);assert.equal(same.squadTactics.claims.size,0);
});
function pair(visible){
 for(const a of world.navigation.nodes.filter((_,i)=>i%17===0))for(const b of world.navigation.nodes){
  const d=distance(a,b);if(d<2||d>3.5)continue;
  if(world.segmentClear(eye(a),eye(b),{vision:true})===visible)return [a,b];
 }
 throw Error('No sensor fixture');
}
test('opaque walls prevent knowledge; heard positions remain snapshots and expire',()=>{
 const g=start(),a=g.actors[1],enemy=g.actors[5],[p,q]=pair(false);for(const o of g.actors)o.alive=o===a||o===enemy;
 Object.assign(a,p,{yaw:Math.atan2(-(q.x-p.x),-(q.z-p.z))});Object.assign(enemy,q);g.state.time=10;
 a.bot.perceive();assert.equal(a.bot.target,null);assert.equal(a.bot.investigation,null);assert.equal(g.tacticalContacts.length,0);
 g.emit('shot',enemy);a.bot.perceive();assert.equal(a.bot.target,null);assert(a.bot.investigation);
 const remembered=a.bot.investigation.lastSensedPosition.clone();Object.assign(enemy,{x:1000,z:1000});g.state.time+=.2;a.bot.perceive();
 assert.deepEqual(a.bot.investigation.lastSensedPosition,remembered);assert.equal(a.bot.target,null);
 g.state.time+=g.config.botMemory+1;a.bot.perceive();assert.equal(a.bot.investigation,null);
});
test('all difficulty reaction floors survive tactical changes; sound claims do not grant sight',()=>{
 for(const difficulty of Object.keys(DIFFICULTIES)){
  const g=start(42,{difficulty}),a=g.actors[6],enemy=g.actors[0],[p,q]=pair(true);for(const o of g.actors)o.alive=o===a||o===enemy;
  Object.assign(a,p,{yaw:Math.atan2(-(q.x-p.x),-(q.z-p.z))});Object.assign(enemy,q);g.state.time=10;a.bot.perceive();
  const r=a.bot.target;assert(r?.visible);assert(r.reactionAt>=10+DIFFICULTIES[difficulty].reactionMin);
  assert(!a.bot.canFireBurst());g.state.time=r.reactionAt-1e-6;a.bot.planCombat();assert(!a.bot.command.fire);assert.equal(g.tacticalContacts.length,0);
 }
 const g=start(),bots=g.actors.filter(a=>a.team==='analysts').map(a=>a.bot),record={entity:g.actors[5],lastSensedPosition:{x:-20,z:-20,y:1},senseKey:'sound:1'};
 for(const b of bots){b.actor.aiRole='support';b.investigation=record;}
 const accepted=bots.filter(b=>b.shouldInvestigate());assert.equal(accepted.length,2);assert.notEqual(accepted[0].inquiry.ready,accepted[1].inquiry.ready);
 for(const b of accepted){assert.equal(b.target,null);const ready=b.inquiry.ready;b.investigation={...record,senseKey:'sound:2'};g.state.time+=.1;b.shouldInvestigate();assert.equal(b.inquiry.ready,ready,'repeated footsteps must not restart the waiting timer');}
});
test('cover decisions cannot read hidden enemy coordinates and keep capsule clearance',()=>{
 const g=start(),a=g.actors[1],enemy=g.actors[5];Object.assign(a,world.anchors.bomb);const threat={x:-33,z:-3,y:1.5};
 const p=tacticalPosition(a.bot,a,{threat,cover:true});Object.assign(enemy,{x:p.x,z:p.z});
 assert.deepEqual(tacticalPosition(a.bot,a,{threat,cover:true}),p);assert(world.navigation.clear(a,p));
});
test('unreachable tactical goals use timed retries instead of a search every frame',()=>{
 const g=start(),bot=g.actors[1].bot;g.state.time=10;bot.goal=world.anchors.bomb;bot.departAt=0;bot.mode='objective';bot.routePlan=null;bot.nextRouteChoice=0;
 const original=world.navigation.findPath,choices=world.tactical.choices;let calls=0;
 world.navigation.findPath=()=>{calls++;return [];};world.tactical.choices=()=>[];
 try{for(let i=0;i<60;i++){bot.chooseFloorRoute();g.state.time+=1/60;}assert.equal(calls,1);}finally{world.navigation.findPath=original;world.tactical.choices=choices;}
});
test('a reported danger changes the selected lane without reading any enemy position',()=>{
 const g=start(),a=g.actors[5],b=a.bot;g.state.time=10;b.goal=world.anchors.bomb;b.style.preference=0;b.chooseFloorRoute();
 const first=b.routePlan.laneId,choices=world.tactical.choices(a.team,'bomb'),selected=choices.find(c=>c.id===first);
 const danger=selected.path.find(p=>choices.some(c=>c.id!==first&&c.path.every((q,i)=>distanceSegment(p.x,p.z,[i?c.path[i-1].x:a.x,i?c.path[i-1].z:a.z],[q.x,q.z])>5)));
 assert(danger,'test needs an avoidable route section');g.state.time=20;g.tacticalContacts=[{...danger,at:20,team:a.team,reporter:'teammate'}];
 b.chooseFloorRoute();assert.notEqual(b.routePlan.laneId,first);assert.equal(b.routePlan.at,20);
});
test('opposing teammates pass the actual storage doorway by yielding, across three seeds',()=>{
 for(const seed of [17,42,93]){
  const g=start(seed,{buyTime:0,botVision:0,botFire:false}),d=world.doors.doors.find(d=>d.id==='D38'),a=g.actors[1],b=g.actors[2];
  const ends=[1,-1].map(s=>({x:d.x+d.nx*1.4*s,z:d.z+d.nz*1.4*s,y:0}));Object.assign(a,ends[0]);Object.assign(b,ends[1]);
  for(const o of g.actors)if(o!==a&&o!==b)o.bot=null;
  a.bot.planObjective=()=>a.bot.setGoal(ends[1]);b.bot.planObjective=()=>b.bot.setGoal(ends[0]);a.bot.departAt=b.bot.departAt=0;
  for(let i=0;i<1200;i++)g.step(1/60);
  assert(distance(a,ends[1])<.1);assert(distance(b,ends[0])<.1);assert(g.events.some(e=>e.type==='bot-yield'));
 }
});
test('a known hostage blocks query edges and smoothing without mutating the shared graph',()=>{
 const g=start(),from={x:-22.70230697,z:-21.96499535},h=g.hostages[1],blocker={...h,radius:.401};world.setElevatorProgress(1);
 const path=world.findPath(from,world.anchors.bomb,{blockers:[blocker]});assert(path.length);let p=from;
 for(const q of path){assert(distanceSegment(h.x,h.z,[p.x,p.z],[q.x,q.z])>=.401-1e-7);assert(world.navigation.clear(p,q,.2));p=q;}
 const touching={x:-22.700302873,z:-21.96499},escape=world.findPath(touching,world.anchors.bomb,{blockers:[blocker]});assert(escape.length);
 assert((touching.x-h.x)*(escape[0].x-touching.x)+(touching.z-h.z)*(escape[0].z-touching.z)>=0);
 assert.deepEqual(world.findPath(touching,h,{blockers:[blocker]}),[],'the exit exception cannot make the occupied destination traversable');
});
test('a body-pushed bot walks out of conservative door clearance without teleporting',()=>{
 const g=start(42,{buyTime:0,botVision:0,botFire:false}),a=g.actors[5];Object.assign(a,{x:22.346891645,z:20.639689722,y:0});
 for(const o of g.actors)if(o!==a)o.bot=null;
 assert(world.canOccupy(a.x,a.z));assert(!world.navigation.clear(a,a,.2));const from={x:a.x,z:a.z};let maxStep=0;
 for(let i=0;i<600;i++){const p={x:a.x,z:a.z};g.step(1/60);maxStep=Math.max(maxStep,distance(a,p));}
 assert(distance(a,from)>5);assert(world.navigation.clear(a,a,.2));assert(maxStep<g.config.botSpeed/60+.03);
});
