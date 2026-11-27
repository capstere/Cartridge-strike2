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
 // Each case changes the test world's support, capsule sweep or ceiling.
 const world=createWorld({fresh:true,levelProject:JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url)))});
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

test('one crouch tap while rushing starts a grounded steerable slide and replay reproduces its entire path',()=>{
 const {game,a}=fixture(),sprint={forward:1,sprint:true};
 run(game,sprint,24);
 const speed=a.moving;
 game.update(dt/3,{...sprint,crouchEdge:true});game.update(dt*2/3,{});
 assert(a.slideUntil>game.state.time);assert(a.crouching);assert(!a.rushing);assert(a.moving>speed);
 const predicted={...a};copyPose(predicted,a);
 const replay={world:game.world,config:game.config,actors:[predicted],hostages:[],state:{time:game.state.time,zombies:[]}};
 const start=a.slideUntil,dir=a.travelDirZ;
 for(let i=0;i<55;i++){
   const controls={strafe:i<10?1:0,forward:i<10?0:-1,crouch:true,sprint:true};
   game.state.time+=dt;replay.state.time+=dt;
   moveActor(game,a,controls,dt);moveActor(replay,predicted,controls,dt,false);
   for(const key of [...POSE_NUMBERS,...POSE_BOOLEANS])assert.equal(a[key],predicted[key],key);
   if(i<10){assert(a.travelDirX>=0 && a.travelDirZ<-.9);assert.equal(a.slideUntil,start);}
 }
 assert(a.travelDirZ>=dir);assert.equal(a.slideUntil,0);assert(a.crouching);
 assert(a.moving<=game.config.crouchSpeed+.00001);
 run(game,{...sprint,crouch:true},30);assert.equal(a.slideUntil,0);
});

test('slide stops at a swept capsule and cannot jump into an overhead obstruction',()=>{
 const {game,a}=fixture(),sprint={forward:1,sprint:true};
 run(game,sprint,18);run(game,{...sprint,crouch:true},1);assert(a.slideUntil>0);
 game.world.canStand=()=>false;
 run(game,{jump:true},1);assert(a.onGround);assert(a.crouching);assert(a.slideUntil>0);
 const occupant=game.actors.find(b=>b!==a);
 Object.assign(occupant,{x:a.x,y:a.y,z:a.z-a.radius-occupant.radius-.004,alive:true});
 run(game,{},1);assert.equal(a.slideUntil,0);assert.equal(a.blockedBy,occupant.id);
 assert(a.slideReadyAt>game.state.time);assert(a.onGround);
 resetRush(a);assert.equal(a.slideReadyAt,0);assert.equal(a.travelDirZ,0);
});

test('cartridge quick release finishes the pull once, returns to the previous sidearm and preserves the full fuse',()=>{
 const {game,a}=fixture();const pistol=a.inventory.pistol.id;
 a.inventory.he=1;game.select(pistol);assert(game.select('he'));run(game,{},16);
 const events=run(game,{firePress:{yaw:0,pitch:0}},1);assert(a.cartridge);assert.equal(a.inventory.he,1);
 events.push(...run(game,{},31));assert.equal(game.state.grenades.length,0);
 events.push(...run(game,{},3));assert.equal(game.state.grenades.length,1);
 assert.equal(events.filter(e=>e.type==='throw'&&e.actorId===a.id).length,1);
 assert.equal(events.filter(e=>e.type==='cartridge-latch'&&e.actorId===a.id).length,1);
 const launched=events.find(e=>e.type==='throw');
 assert(Math.abs(game.state.grenades[0].deadline-launched.time-game.config.grenadeFuse)<1e-7);
 assert.equal(a.weapon,pistol);assert.equal(a.inventory.he,0);
 assert(game.select('last'));assert.equal(a.weapon,a.inventory.primary.id);
});

test('only the HE fuse runs while held; switching cancels an unarmed cartridge and releases a live HE at its owner',()=>{
 for(const id of ['he','flash','smoke']){
   const {game,a}=fixture();a.inventory[id]=1;game.select(id);run(game,{},16);
   run(game,{fire:true},10);assert(a.cartridge);game.select('pistol');assert.equal(a.inventory[id],1);
   assert.equal(a.cartridge,null);assert.equal(game.state.grenades.length,0);
   game.select(id);run(game,{},16);run(game,{fire:true},37);
   assert.equal(a.cartridge.deadline>0,id==='he');const deadline=a.cartridge.deadline;
   if(id==='he'){
     assert(game.select('pistol'));assert.equal(a.inventory.he,0);assert.equal(game.state.grenades.length,1);
     const g=game.state.grenades[0];assert.equal(g.deadline,deadline);assert.equal(g.vx,0);assert.equal(g.vz,0);
   }else{
     run(game,{fire:true},Math.ceil(game.config.grenadeFuse/dt)+5);assert.equal(a.inventory[id],1);
     run(game,{},10);assert.equal(a.inventory[id],0);assert.equal(game.state.grenades.length,1);
   }
 }
});

test('HE held to expiry produces one local blast and debit with friendly fire off; auto-trigger never primes',()=>{
 const {game,a}=fixture();a.inventory.he=1;a.hp=250;a.armor=0;game.config.friendlyFire=false;
 game.select('he');run(game,{},16);run(game,{fire:true,autoFire:true},40);assert(!a.cartridge);
 run(game,{},1);const events=run(game,{fire:true},Math.ceil((game.config.grenadeFuse+.65)/dt));
 assert.equal(a.inventory.he,0);assert.equal(a.cartridge,null);assert.equal(game.state.grenades.length,0);
 assert.equal(events.filter(e=>e.type==='he').length,1);
 assert.equal(events.filter(e=>e.type==='throw' && e.dropped).length,1);
 assert.equal(events.filter(e=>e.type==='shot' && e.actorId===a.id).length,0);
 assert(a.hp<250);
});

test('standard gamepad analog travel, L3 sprint, crouch edge, trigger hysteresis and reset require physical input',async()=>{
 const {GamepadControls}=await import('./gamepad-controls.mjs');
 const input=new GamepadControls(),pad={id:'test pad',buttons:Array.from({length:17},()=>({pressed:false,value:0})),axes:[.02,-.01,0,.04]};
 assert.equal(input.sample(pad).forward,0);
 pad.axes[1]=-1;pad.buttons[10].pressed=true;assert(input.sample(pad).sprint);
 pad.buttons[10].pressed=false;pad.buttons[1].pressed=true;
 const slide=input.sample(pad);assert(slide.sprint && slide.crouchEdge);assert(!input.sample(pad).crouchEdge);
 pad.buttons[7].value=.27;const shot=input.sample(pad);assert(shot.firePress && !shot.sprint);
 pad.buttons[7].value=.18;assert(input.sample(pad).fire);
 pad.buttons[7].value=.14;assert(!input.sample(pad).fire);
 input.clear();assert.equal(input.sample(pad),null);
 pad.buttons[1].pressed=false;assert(input.sample(pad));
});

test('switching away during an early or cooked cartridge hold requires releasing before the returning rifle can fire',()=>{
 for(const ticks of [10,39]){
   const {game,a}=fixture();a.inventory.he=1;game.select('he');run(game,{},16);
   run(game,{fire:true},ticks);assert(a.cartridge);const ammo=a.inventory.primary.ammo;
   assert(game.select('cr4'));const held=run(game,{fire:true},40);
   assert.equal(a.inventory.primary.ammo,ammo);assert(!held.some(e=>e.type==='shot' && e.actorId===a.id));
   run(game,{},1);run(game,{fire:true},1);assert.equal(a.inventory.primary.ammo,ammo-1);
 }
});

test('a cooked HE guide suppresses flight if its fuse expires before the attainable release tick',async()=>{
 const {cartridgeFlightFuse,predictGrenade}=await import('./grenade-physics.mjs');
 const {game,a}=fixture(),time=5,config=game.config;
 a.weapon='he';a.cartridge={started:3,releaseAt:0,deadline:time+.12};
 assert.equal(cartridgeFlightFuse(a,time,config),null,'no outward path during the final release interval');
 a.cartridge.deadline=time+.125;
 assert.equal(cartridgeFlightFuse(a,time,config),null,'fixed tick reaches expiry before release');
 a.cartridge.releaseAt=time+.05;const fuse=cartridgeFlightFuse(a,time,config);
 assert(Math.abs(fuse-.075)<1e-8,'already releasing can still launch');
 a.cartridge=null;
 const ordinary=predictGrenade(a,config,game.world);
 assert.deepEqual(predictGrenade(a,{...config,grenadeFuse:cartridgeFlightFuse(a,time,config)},game.world).endpoint,ordinary.endpoint);
});

test('closing controls cannot renew a slide boost within the same life',()=>{
 const {game,a}=fixture(),sprint={forward:1,sprint:true};
 run(game,sprint,12);run(game,{...sprint,crouchEdge:true},1);
 assert(a.slideUntil>game.state.time);game.pause(true);game.pause(false);
 assert.equal(a.slideUntil,0);assert(a.slideReadyAt>game.state.time);
 run(game,sprint,2);run(game,{...sprint,crouchEdge:true},1);
 assert.equal(a.slideUntil,0);
});

test('crouch in the air survives landing, matches a restored prediction and makes one slide sound',()=>{
 const {game,a}=fixture(),sprint={forward:1,sprint:true};
 for(const released of [false,true]){
   resetRush(a);Object.assign(a,{x:0,y:0,z:0,vy:0,onGround:true,jumpHeld:false});
   run(game,sprint,18);run(game,{...sprint,jump:true},1);
   for(let tick=0;tick<36 && (a.vy>=0 || a.y>.10);tick++)run(game,sprint,1);
   assert(a.y>0 && a.y<=.10 && !a.onGround);
   a.y=.078; // Measured height in the reported late-press case.
   const travel=released ? {} : sprint;
   const events=run(game,{...travel,crouchEdge:true,crouch:true},1);
   assert.equal(a.slideBuffer,.3);assert(a.onGround);assert.equal(a.slideUntil,0);
   const wire={handling:{}};copyPose(wire,a);
   const replay={...a,slideBuffer:0};copyPose(replay,wire);
   const predicted={world:game.world,config:game.config,actors:[replay],hostages:[],state:{time:game.state.time,zombies:[]}};
   for(let tick=0;tick<9;tick++){
     const controls={...travel,crouch:true,crouchEdge:false};
     events.push(...run(game,controls,1));predicted.state.time+=dt;
     moveActor(predicted,replay,controls,dt,false);
     for(const key of [...POSE_NUMBERS,...POSE_BOOLEANS])assert.equal(replay[key],a[key],key);
   }
   const slides=events.filter(e=>e.type==='slide');
   assert.equal(slides.length,1);assert.equal(slides[0].actorId,a.id);
   assert.equal(slides[0].surface,game.world.materialAt(slides[0].x,slides[0].z));
   assert.equal(a.slideBuffer,0);assert(a.slideUntil>game.state.time);
   assert.equal(game.soundEvents.filter(e=>e.type==='slide').length,0,'presentation does not alter bot hearing');
 }
});

test('a second physical tap waits through the active slide and cooldown, ages only on usable ground and fires once',()=>{
 const {game,a}=fixture(),rush={forward:1,sprint:true};
 run(game,rush,16);
 const first=run(game,{...rush,crouchEdge:true},1);
 assert.equal(first.filter(e=>e.type==='slide').length,1);
 const end=a.slideUntil;
 run(game,{...rush,crouchEdge:true},1);assert.equal(a.slideBuffer,.3);
 const events=[];
 while(game.state.time<end+.24){
   events.push(...run(game,rush,1));assert.equal(a.slideBuffer,.3);
 }
 events.push(...run(game,rush,36));
 assert.equal(events.filter(e=>e.type==='slide').length,1);
 assert.equal(a.slideBuffer,0);
 // An ordinary crouch held over sparse SDK ticks cannot synthesize another edge.
 const held=run(game,{...rush,crouch:true,crouchEdge:false},90);
 assert.equal(held.filter(e=>e.type==='slide').length,0);
 resetRush(a);Object.assign(a,{slideBuffer:.3,moving:0});
 run(game,{},17);assert(a.slideBuffer>0);
 run(game,{},1);assert.equal(a.slideBuffer,0);
 assert.equal(run(game,rush,6).filter(e=>e.type==='slide').length,0);
});

test('fresh competing actions and lifecycle transitions clear the actual buffered movement field',()=>{
 const {game,a}=fixture(),rush={forward:1,sprint:true};
 for(const action of [{aim:true},{fire:true},{sneak:true},{interact:true},{forward:-1}]){
   a.slideBuffer=.3;run(game,{...rush,...action},1);
   assert.equal(a.slideBuffer,0);assert.equal(a.slideUntil,0);
 }
 a.slideBuffer=.3;assert(game.select('knife'));assert.equal(a.slideBuffer,0);
 game.select('pistol');game.item().ammo--;a.slideBuffer=.3;assert(game.reload());assert.equal(a.slideBuffer,0);
 a.slideBuffer=.3;game.pause(true);assert.equal(a.slideBuffer,0);game.pause(false);
 a.slideBuffer=.3;game.beginRound();assert.equal(a.slideBuffer,0);
 game.state.phase='active';a.slideBuffer=.3;game.damage(a,200,null);assert(!a.alive);assert.equal(a.slideBuffer,0);
 game.beginRound();game.warmupRemaining=.2;
 run(game,{...rush,crouch:true,crouchEdge:true},12);assert.equal(a.slideBuffer,0);
 assert.equal(run(game,rush,6).filter(e=>e.type==='slide').length,0);
});

test('an airborne SDK sample gap can retain a new Rush crouch edge, but cannot supply launch speed',()=>{
 const {game,a}=fixture(),rush={forward:1,sprint:true};
 run(game,rush,20);run(game,{...rush,jump:true},1);run(game,{},1);
 assert(!a.onGround && a.moving===0);assert(a.travelDirZ<0);
 run(game,{...rush,crouch:true,crouchEdge:true},1);
 assert.equal(a.slideBuffer,.3);assert.equal(a.slideUntil,0);
 const events=run(game,rush,45).filter(e=>e.type==='slide');
 assert.equal(events.length,1);assert(Math.abs(events[0].y)<1e-6);
 resetRush(a);a.slideBuffer=.3;a.moving=0;
 assert.equal(run(game,{},22).filter(e=>e.type==='slide').length,0);
});
