import test from 'node:test';
import assert from 'node:assert/strict';
import {validateNetworkInput,checkContract} from '../shared/multiplayer/protocol.mjs';
import {safeName,NETWORK_CONFIG,fixedNetworkWorld} from '../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {createHeadlessSimulation} from '../server/headless.mjs';
import {moveActor} from '../src/fps/movement.mjs';
const frame={lifeId:2,sampleTick:120,fireId:1,reloadId:1,forward:0,strafe:1,yaw:0,pitch:0,jump:false,crouch:false,sneak:false,fire:true};
test('network boundary rejects spoofing, invalid numbers, old lives and future/stale ticks',()=>{
 assert.equal(validateNetworkInput(frame,{lifeId:2},120).strafe,1);
 for(const extra of [{actorId:'counterAnalysts-0'},{position:{x:100}},{damage:1000},{dt:1},{moveWorld:{x:20}},{forward:NaN},{yaw:Infinity},{pitch:4},{strafe:2},{lifeId:1},{sampleTick:10},{sampleTick:999},{fireId:-1},{reloadId:.5}])assert.throws(()=>validateNetworkInput({...frame,...extra},{lifeId:2},120));
 for(const key of ['protocolVersion','mapId','mapHash','configHash','buildHash'])assert.throws(()=>checkContract({...CONTRACT,[key]:'wrong'},CONTRACT),new RegExp(key));
 assert.equal(safeName('  A\u0000B\u202e '),'AB');assert.equal(safeName('a'.repeat(50)).length,24);
});
test('shared prediction matches authoritative movement through fixed doors, corners, jumps and crouch',{timeout:15000},async()=>{
 const create=()=>createHeadlessSimulation({mapId:'synthetic-demo',controllers:{'analysts-0':'human','counterAnalysts-0':'human'},config:NETWORK_CONFIG});
 const [a,b]=await Promise.all([create(),create()]);
 for(const sim of [a,b]){fixedNetworkWorld(sim.game.world);sim.game.actors[1].alive=false;sim.game.actors[1].respawnAt=null;Object.assign(sim.game.actors[0],{x:2,z:3,y:0,yaw:-Math.PI/2});}
 const before=b.game.eventSerial;
 for(let tick=0;tick<600;tick++){
  const input={forward:tick<160?1:tick<270?-1:0,strafe:tick>=270?1:0,yaw:-Math.PI/2,jump:tick===30||tick===370,crouch:tick>160&&tick<230};
  a.game.stepActors(new Map([['analysts-0',input]]));b.game.state.time+=1/60;moveActor(b.game,b.game.actors[0],input,1/60,false);
  for(const key of ['x','y','z','vy','height'])assert(Math.abs(a.game.actors[0][key]-b.game.actors[0][key])<1e-9,key+' tick '+tick);
 }
 assert.equal(b.game.eventSerial,before,'prediction never produces combat/audio side effects');
 assert.equal(a.game.actors[0].inventory.primary.ammo,30);
});
test('online bullets use the existing body hitbox and solid walls; fixed glass never breaks',async()=>{
 const sim=await createHeadlessSimulation({mapId:'synthetic-demo',controllers:{'analysts-0':'human','counterAnalysts-0':'human'},config:NETWORK_CONFIG});
 const g=sim.game,[a,b]=g.actors;fixedNetworkWorld(g.world);
 Object.assign(a,{x:2,z:2,yaw:-Math.PI/2,spawnProtectedUntil:0});Object.assign(b,{x:12,z:2,spawnProtectedUntil:0});
 const shoot=()=>{a.nextShot=0;a.recoil=0;g.stepActors(new Map([[a.id,{yaw:a.yaw,fire:true}]]));};
 shoot();assert.equal(b.hp,100,'wall outside doorway blocks hit');
 a.z=3;b.z=3.5;b.x=4;shoot();assert.equal(b.hp,100,'half-meter miss cannot hit a prototype sphere');
 b.z=3;shoot();assert.equal(b.hp,82,'shared radius .20 / height 1.70 hitbox');
 a.yaw=Math.PI;shoot();assert.equal(g.world.glass.brokenCount,0,'window remains intact');
 assert(g.world.staticBoxes.filter(b=>b.glassId).every(b=>!b.disabled));
 for(let i=0;i<120;i++)g.stepActors(new Map([[a.id,{interact:true}]]));
 for(const d of g.world.doors.doors)assert.equal(d.angle,Math.PI/2,'door pose stays fixed');
 assert.equal(g.actors.length,2);assert.equal(g.state.drops.length,0);
});
