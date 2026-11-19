import {glassCrossing} from './network-glass-fixture.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadHeadlessWorld,createHeadlessSimulation} from '../server/headless.mjs';
import {NETWORK_CONFIG,NETWORK_MAP,copyPose} from '../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {collisionContract} from '../shared/multiplayer/collision-contract.mjs';
import {prepareNetworkWorld,createPredictedWorld,applyNetworkWorld} from '../shared/multiplayer/world.mjs';
import {moveActor} from '../src/fps/movement.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
const snapshot=w=>({doors:new Map(w.doors.doors.map(d=>[d.id,{angle:d.angle,target:d.target,sign:d.sign,holdUntil:d.holdUntil}])),elevatorProgress:w.doors.elevators.progress,...w.networkDynamics});
const hash=w=>createHash('sha256').update(collisionContract(w)).digest('hex');
function route(w,d){
 for(const range of [1.4,1,.7,.45])for(const along of [0,-.12,.12,-.24,.24]){
  let clear=true;for(let t=-range;t<=range+.001;t+=.025)if(!w.staticCanOccupy(d.x+d.ux*along+d.nx*t,d.z+d.uz*along+d.nz*t,.2,1.7,0)){clear=false;break;}
  if(clear)return {along,range};
 }throw Error('No static route '+d.id);
}
test('published Floor 5 contract includes resolved collision, all doors and spawn cabins',async()=>{
 const {world:w,sourceHash}=await loadHeadlessWorld(NETWORK_MAP);
 assert.equal(NETWORK_MAP,'floor5-prepared');assert.equal(sourceHash,CONTRACT.mapHash);assert.equal(hash(w),CONTRACT.collisionHash);
 assert.equal(w.doors.doors.length,51);assert.equal(w.doors.elevators.cabins.length,2);
 const box=w.staticBoxes[0],original=box.x;box.x+=1e-12;assert.equal(hash(w),CONTRACT.collisionHash,'hash tolerates libm ULP differences');assert.notEqual(box.x,original,'hashing never rounds the actual physics');box.x+=.01;assert.notEqual(hash(w),CONTRACT.collisionHash,'geometry drift is detected');
});
test('Floor 5 prediction crosses all 102 door approaches with identical authoritative collision and isolated render poses',{timeout:30000},async()=>{
 const sim=await createHeadlessSimulation({mapId:NETWORK_MAP,config:NETWORK_CONFIG,controllers:{'analysts-0':'human','counterAnalysts-0':'human'}});
 const g=sim.game,w=g.world;prepareNetworkWorld(w);const a=g.actors[0];g.state.actors=[a];
 const p=structuredClone(a),pg={world:w,config:NETWORK_CONFIG,actors:[p],hostages:[],state:{time:0,zombies:[]}},predicted=createPredictedWorld(w);
 for(const d of w.doors.doors)for(const side of [-1,1]){
  const {along,range}=route(w,d);w.doors.reset();
  Object.assign(a,{x:d.x+d.ux*along+d.nx*range*side,z:d.z+d.uz*along+d.nz*range*side,y:0,vy:0,height:1.7,crouching:false,alive:true,onGround:true,jumpHeld:false});copyPose(p,a);p.alive=true;
  pg.state.time=g.state.time;predicted.adopt(snapshot(w));
  let travelled=0;
  for(let i=0;i<180;i++){
   const input={forward:.65,yaw:Math.atan2(d.nx*side,d.nz*side),pitch:0};
   g.stepActors(new Map([[a.id,input]]));pg.state.time+=1/60;
   const rendered=snapshot(w);
   predicted.step(pg.state.time,1/60,pg.actors,()=>moveActor(pg,p,input,1/60,false));
   assert.deepEqual(snapshot(w),rendered,'prediction never writes authoritative render leaves');
   for(const k of ['x','y','z','vy','height'])assert(Math.abs(a[k]-p[k])<1e-9,`${d.id} ${side} ${i} ${k}`);
   travelled=-side*((a.x-d.x)*d.nx+(a.z-d.z)*d.nz);if(travelled>range-.06)break;
  }
  assert(travelled>range-.1,d.id+' '+side+' crossed');
 }
});
test('late-join doors, shutters and shared collision contexts restore safely; valid team spawns',async()=>{
 const sim=await createHeadlessSimulation({mapId:NETWORK_MAP,config:NETWORK_CONFIG,controllers:{'analysts-0':'human','counterAnalysts-0':'human'}});
 const g=sim.game,w=g.world;prepareNetworkWorld(w);
 for(const a of g.actors){a.alive=false;assert(respawnActor(g,a));assert(w.canOccupy(a.x,a.z,a.radius,a.height,a.y));}
 assert(Math.hypot(g.actors[0].x-g.actors[1].x,g.actors[0].z-g.actors[1].z)>.52);
 w.networkDynamics.elevatorOpenAt=g.state.time+.75;
 const p=createPredictedWorld(w),actors=g.actors.map(a=>structuredClone(a));p.adopt(snapshot(w));
 const pg={world:w,config:NETWORK_CONFIG,actors,hostages:[],state:{time:g.state.time,zombies:[]}};
 const input={forward:.65,yaw:Math.PI,pitch:0};
 const cabins=g.actors.map(a=>w.doors.elevators.cabins.toSorted((c,d)=>Math.hypot(c.x-a.x,c.z-a.z)-Math.hypot(d.x-a.x,d.z-a.z))[0]);
 for(let i=1;i<=180;i++){
  g.stepActors(new Map(g.actors.map(a=>[a.id,input])));pg.state.time+=1/60;
  p.step(pg.state.time,1/60,actors,()=>{for(const a of actors)moveActor(pg,a,input,1/60,false);});
  assert.equal(p.doors.elevators.progress,w.doors.elevators.progress);
  for(let j=0;j<actors.length;j++){
   const a=g.actors[j];for(const key of ['x','y','z'])assert(Math.abs(a[key]-actors[j][key])<1e-9,'shared movement through opening shutters');
   if(i===45)assert(a.z<cabins[j].z-a.radius,'closed cabin shutter blocks movement');
  }
 }
 for(let i=0;i<actors.length;i++)assert(actors[i].z>cabins[i].z+.5,'both humans leave their actual spawn cabins');
 assert.equal(w.doors.elevators.progress,1);p.adopt(snapshot(w));
 assert.deepEqual(p.doors.doors.map(d=>d.angle),w.doors.doors.map(d=>d.angle));
 const d=w.doors.doors.find(d=>route(w,d).range===1.4),pos={x:d.x+d.nx,z:d.z+d.nz,y:1.2},dir={x:-d.nx,y:0,z:-d.nz};
 w.doors.reset();const before=w.raycast(pos,dir,2);
 const empty=w.createDynamicContext([]);
 assert.throws(()=>w.withDynamicContext(empty,()=>{throw Error('restore');}),/restore/);
 assert.deepEqual(w.raycast(pos,dir,2),before,'context restored after exception');
 assert.throws(()=>applyNetworkWorld(w.doors,{doors:new Map()}),/Missing authoritative door/);
});

test('a real Floor 5 shot opens a pane for hitscan, capsules and navigation',async()=>{
 const sim=await createHeadlessSimulation({mapId:NETWORK_MAP,config:NETWORK_CONFIG,controllers:{'analysts-0':'human','counterAnalysts-0':'human'}});
 const g=sim.game,w=g.world;prepareNetworkWorld(w);const [a,b]=g.actors;b.alive=false;b.respawnAt=null;
 const {pose,pane,dir,from}=glassCrossing(w),to={x:pose.x+dir.x*1.6,z:pose.z+dir.z*1.6};
 Object.assign(a,pose,{nextShot:0,recoil:0});
 assert.equal(w.canOccupy(pane.x,pane.z,a.radius,a.height,0),false);
 assert.equal(w.navigation.clear(pose,to),false);
 g.stepActors(new Map([[a.id,{yaw:a.yaw,pitch:0,fire:true}]]));
 assert.equal(a.inventory.primary.ammo,29);
 assert(g.events.some(e=>e.type==='glass-break'&&e.paneId===pane.id));
 assert.equal(w.glass.brokenCount,1);
 assert.equal(w.raycast(from,dir,1.5),null);
 assert(w.canOccupy(pane.x,pane.z,a.radius,a.height,0));
 assert(w.navigation.clear(pose,to));
 assert(w.findPath(pose,to).length);
});
