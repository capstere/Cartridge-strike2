import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from './game.mjs';
import {createWorld} from './world.mjs';
import {stickRush,resetRush,rushReady} from './rush.mjs';
import {moveActor} from './movement.mjs';
import {copyPose,POSE_BOOLEANS,POSE_NUMBERS} from '../../shared/multiplayer/rules.mjs';
import {makeWeapon,animateWeapon} from './models.mjs';

const dt=1/60;
function fixture(){
 const world=createWorld({levelProject:JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url)))});
 const game=new Game(world,{controllers:{'analysts-0':'human','counterAnalysts-0':'human'},localPlayerId:'analysts-0',
   config:{networkSlice:true,mode:'classic',buyTime:0,zombies:false,wanderers:false}}).start();
 game.state.phase='active';
 const a=game.player;
 // Straight unobstructed lane. The unchanged capsule sweep still resolves live bodies.
 world.move=(actor,dx,dy,dz)=>{actor.x+=dx;actor.z+=dz;actor.y=Math.max(0,actor.y+dy);return {onGround:actor.y===0};};
 Object.assign(a,{x:0,z:0,y:0,yaw:0,pitch:0});
 a.inventory.primary=game.weaponItem('cr4');
 return {game,a};
}
function run(game,input,n){const events=[];for(let i=0;i<n;i++){game.update(dt,input);events.push(...game.drainEvents());}return events;}

test('touch outer-ring Rush uses forward directional hysteresis',()=>{
 assert(!stickRush(false,1.10,1));assert(stickRush(false,1.16,1));
 assert(stickRush(true,1,.5));assert(!stickRush(true,.95,1));
 assert(!stickRush(false,1.5,.54));assert(!stickRush(true,1.5,-1));
});

for(const weapon of ['p9','cr4'])test(weapon+' preserves one released tap and original shot angle through Rush, fixed sampling and recovery',()=>{
 const {game,a}=fixture();a.weapon=weapon;
 const moving={forward:1,sprint:true,yaw:0},ammo=game.item().ammo;
 run(game,moving,40);assert(a.rushWeight>.99);assert(a.moving>game.config.runSpeed);
 game.update(dt/3,{...moving,firePress:{yaw:.42,pitch:.08}});
 assert.equal(game.item().ammo,ammo);
 game.update(dt*2/3,{...moving,yaw:-.5});
 assert.equal(game.item().ammo,ammo);
 const events=run(game,{...moving,yaw:-.5},20);
 const shots=events.filter(e=>e.type==='shot' && e.actorId===a.id);
 assert.equal(shots.length,1);assert.equal(game.item().ammo,ammo-1);
 assert.equal(shots[0].yaw,.42);assert.equal(shots[0].pitch,.08);assert.equal(a.yaw,-.5);
 assert(shots[0].time>=46*dt && shots[0].time<=48*dt,'approximately seven fixed ticks of recovery');
});

test('copied crouch, movement and Rush recovery replay identically without producing steps or combat',()=>{
 const {game,a}=fixture();run(game,{forward:1,sprint:true},25);
 const predicted={...a};copyPose(predicted,a);
 const quiet={world:game.world,config:game.config,actors:[predicted],hostages:[],state:{time:game.state.time,zombies:[]}};
 for(const input of [{forward:1,sprint:true},{forward:1,aim:true},{strafe:1,sneak:true},{forward:1,crouch:true},{forward:1,jump:true}]){
   game.state.time+=dt;quiet.state.time+=dt;
   moveActor(game,a,input,dt);moveActor(quiet,predicted,input,dt,false);
   for(const key of [...POSE_NUMBERS,...POSE_BOOLEANS])assert.equal(predicted[key],a[key],key);
 }
 resetRush(a);assert(rushReady(a));assert.equal(a.pendingShot,null);
});

test('saved physical edge clears on pause and accepted reload',()=>{
 const {game,a}=fixture();
 run(game,{sprint:true,forward:1},32);game.update(dt,{firePress:{yaw:0,pitch:0}});
 assert(a.pendingShot);game.pause(true);game.pause(false);assert.equal(a.pendingShot,null);
 game.item().ammo--;run(game,{sprint:true,forward:1},32);
 game.update(dt,{firePress:{yaw:0,pitch:0}});assert(a.pendingShot);
 assert(game.reload());assert.equal(a.pendingShot,null);
});

test('CR4 retains both grips and P9 releases and recovers its support wrist; static reduced-motion still shows gait',()=>{
 for(const id of ['cr4','p9']){
   const m=makeWeapon(id),a={id:'a',weapon:id,reloadUntil:0,onGround:true,alive:true,x:0,z:0,moving:0,rushWeight:0};
   animateWeapon(m,a,2,dt);const support=m.userData.leftHand.position.clone(),trigger=m.userData.rightHand.position.clone();
   const hip=m.rotation.clone();
   Object.assign(a,{rushWeight:1,distanceWalked:1,moving:6});
   animateWeapon(m,a,2+dt,dt,{reducedMotion:true});
   assert(m.rotation.x<hip.x-.28);
   assert(m.userData.rightHand.position.distanceTo(trigger)<1e-8);
   assert.equal(m.userData.leftHand.position.distanceTo(support)>.15,id==='p9');
   const parked=m.matrix.clone(),wrist=m.userData.leftHand.position.clone();
   a.distanceWalked+=.42;
   animateWeapon(m,a,2+dt*2,dt,{reducedMotion:true});
   assert(m.matrix.equals(parked),'steady reduced-motion silhouette at a second stride phase');
   assert(m.userData.leftHand.position.equals(wrist),'steady support wrist at a second stride phase');
   a.rushWeight=0;animateWeapon(m,a,2+dt*2,dt);
   assert(m.userData.leftHand.position.distanceTo(support)<1e-8);
 }
});

test('legacy maps ground at zero; a layered world owns support and body overlaps on a lower deck',()=>{
 for(const layeredTerrain of [false,true]){
   const {game,a}=fixture();game.world.layeredTerrain=layeredTerrain;
   game.world.move=(body,dx,dy,dz)=>{body.x+=dx;body.y+=dy;body.z+=dz;return {onGround:false};};
   Object.assign(a,{x:0,y:-3,z:0,vy:0,onGround:false});
   const neighbor=game.actors.find(other=>other!==a);
   Object.assign(neighbor,{x:0,y:-3,z:-.45,alive:true});
   moveActor(game,a,{forward:1},dt);
   if(layeredTerrain){
     assert(a.y < -3);assert(!a.onGround);
     assert.equal(a.blockedBy,neighbor.id);
   }else{
     assert.equal(a.y,0);assert(a.onGround);
     assert.equal(a.blockedBy,null);
   }
 }
});
