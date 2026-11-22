import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game, CONFIG, DIFFICULTIES} from '../src/fps/game.mjs';
import {createWorld} from '../src/fps/world.mjs';
import {moveActor} from '../src/fps/movement.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
import {shotSpread} from '../src/fps/tactical-rules.mjs';
import {validateInput, ControllerRegistry} from '../shared/multiplayer/input.mjs';
import {loadHeadlessWorld, createHeadlessSimulation} from '../server/headless.mjs';
const project = id => JSON.parse(readFileSync(new URL(`../levels/${id}.json`, import.meta.url)));
const humanControllers = {'analysts-0':'human','counterAnalysts-0':'human'};
const fixture = (options={}) => new Game(createWorld({fresh:true,levelProject:project('synthetic-demo')}),
 {seed:42,controllers:humanControllers,localPlayerId:null,config:{buyTime:0,botFire:false},...options}).start();
const humans = g => [g.actors[0],g.actors[5]];
const pose = a => Object.fromEntries(['x','y','z','yaw','pitch','height','vy','onGround','crouching','jumpHeld','moving','distanceWalked','lastStep','blockedBy'].map(k=>[k,a[k]]));
const objects = (value, set=new Set()) => {
 if(!value || typeof value!=='object' || set.has(value))return set;
 set.add(value);for(const v of Object.values(value))objects(v,set);return set;
};

test('headless Node constructs both manifest maps without browser globals',async()=>{
 for(const name of ['window','document','localStorage','WebGLRenderingContext'])assert.equal(typeof globalThis[name],'undefined',name);
 for(const id of ['synthetic-demo','floor5-prepared']){
  const loaded=await loadHeadlessWorld(id),w=loaded.world;
  assert.equal(loaded.mapId,id);assert.match(loaded.sourceHash,/^[a-f0-9]{64}$/);
  assert(w.navigation.nodes.length>0);assert(w.staticBoxes.length>0);
  assert.equal(w.anchors.analysts.length,5);assert.equal(w.anchors.counterAnalysts.length,5);
 }
 assert.equal((await loadHeadlessWorld()).mapId,'floor5-prepared');
 await assert.rejects(()=>loadHeadlessWorld('../classic-floor5'),/Unknown public map/);
});

for(const id of ['synthetic-demo','floor5-prepared'])test(`${id}: fresh worlds isolate nested caches, doors, glass, elevators and navigation`,()=>{
 const p=project(id),a=createWorld({fresh:true,levelProject:p}),b=createWorld({fresh:true,levelProject:p});
 const group=w=>[w.project,w.projectScene,w.data,w.description,w.anchors];
 const aObjects=objects(group(a)),bObjects=objects(group(b));
 assert.equal([...aObjects].filter(o=>bObjects.has(o)).length,0,'no shared nested source geometry');
 const before=JSON.stringify(group(b)),route=b.findPath(b.anchors.analysts[0],b.anchors.rescue);
 const da=a.doors.doors[0],db=b.doors.doors.find(d=>d.id===da.id);
 a.doors.request(da,0);a.doors.update(.2,.2,[]);assert(da.angle>0);assert.equal(db.angle,0);
 const box=a.staticBoxes.find(b=>b.glassId),other=b.staticBoxes.find(b=>b.id===box.id);
 assert(a.glass.breakAt({id:box.id}));assert.equal(box.disabled,true);assert.equal(other.disabled,false);
 assert.equal(b.glass.revision,0);assert.equal(b.glass.brokenCount,0);
 a.setElevatorProgress(0);assert.equal(b.doors.elevators.progress,1);
 a.data.rooms[0].polygon[0][0]+=10;a.projectScene.entries[0].a[0]+=10;a.project.name='private mutation';
 a.navigation.invalidate();
 assert.equal(JSON.stringify(group(b)),before);assert.deepEqual(b.findPath(b.anchors.analysts[0],b.anchors.rescue),route);
 const c=createWorld({fresh:true,levelProject:p});assert.equal(JSON.stringify(group(c)),before,'later room must not inherit earlier changes');
 assert.notEqual(a.navigation.graph,b.navigation.graph);assert.notEqual(a.navigation.nodes[0],b.navigation.nodes[0]);
});

test('legacy fresh world also bypasses the transitive source-description cache',()=>{
 const a=createWorld({fresh:true}),b=createWorld({fresh:true});
 assert.notEqual(a.data,b.data);assert.notEqual(a.description.boxes[0],b.description.boxes[0]);
 const value=b.data.pdfToWorld([200,200]);a.data.originPdf[0]++;
 assert.deepEqual(b.data.pdfToWorld([200,200]),value);assert.notDeepEqual(a.data.pdfToWorld([200,200]),value);
 a.data.rooms[0].polygon[0][0]++;assert.notDeepEqual(a.data.rooms[0].polygon,b.data.rooms[0].polygon);
});

test('two humans receive independent aim and movement; no bot takeover on round or respawn',()=>{
 const g=fixture({config:{buyTime:.1,mode:'endless'}}),[a,b]=humans(g);
 assert.equal(g.player,undefined);assert.equal(a.isPlayer,false);assert.equal(b.isPlayer,false);
 const x=a.x,z=b.z;
 for(let i=0;i<4;i++)g.stepActors(new Map([[a.id,{strafe:1,yaw:0}],[b.id,{forward:1,yaw:Math.PI,pitch:.2}]]));
 assert(a.x>x);assert(b.z>z);assert.equal(a.yaw,0);assert.equal(b.pitch,.2);
 assert(g.actors.every(a=>!a.bot));
 g.beginRound();assert(humans(g).every(a=>a.controllerType==='human'&&!a.bot));
 a.alive=false;assert(respawnActor(g,a));assert.equal(a.bot,null);assert.equal(a.controllerType,'human');
 const classic=fixture({config:{buyTime:2}}),[ca,cb]=humans(classic);
 classic.stepActors(new Map([[ca.id,{yaw:.7}],[cb.id,{yaw:-.8}]]));
 assert.equal(classic.phase,'buy');assert.equal(ca.yaw,.7);assert.equal(cb.yaw,-.8);
});

for (const networkSlice of [false, true]) {
 test(`Classic survivor completes a pistol reload during the ${networkSlice ? 'online' : 'offline'} buy phase`,()=>{
   const game=fixture({config:{mode:'classic',networkSlice,buyTime:15}});
   const player=game.actors[0], pistol=game.item(player), full=pistol.ammo, reserve=pistol.reserve;
   game.state.phase='active';
   assert(game.fire(player,true));
   game.beginRound();
   assert.equal(pistol.ammo,full-1);
   assert(game.reload(player));
   assert(game.select('knife',player));
   assert.equal(player.reloadUntil,0);
   for(let i=0;i<100;i++)game.stepActors();
   assert.equal(pistol.ammo,full-1,'switching away cancels the transfer');
   assert(game.select('pistol',player));
   assert(game.reload(player));
   while(game.state.time+game.config.fixedStep+1e-8<player.reloadUntil)game.stepActors();
   assert.equal(pistol.ammo,full-1);
   assert.equal(pistol.reserve,reserve);
   game.stepActors();
   assert.equal(game.phase,'buy');
   assert.equal(pistol.ammo,full);
   assert.equal(pistol.reserve,reserve-1);
   assert.equal(player.reloadUntil,0);
   assert.equal(game.reload(player),false);
 });
}

test('offline identity, bot assignment, local input and pause stay backwards compatible',()=>{
 const g=fixture({controllers:null,localPlayerId:undefined}),p=g.player;
 assert.equal(p.id,'analysts-0');assert.equal(p.controllerType,'human');assert.equal(g.actors.filter(a=>a.bot).length,9);
 g.update(1/60,{yaw:1,pitch:.1});assert.equal(p.yaw,1);const time=g.state.time;
 g.pause();g.update(1,{yaw:2,fire:true});assert.equal(g.state.time,time);assert.equal(p.yaw,1);
 g.pause(false);g.update(1/60,{yaw:2});assert.equal(p.yaw,2);
 const auto=fixture({controllers:null,localPlayerId:undefined,autoplay:true});assert.equal(auto.actors.filter(a=>a.bot).length,10);
});

test('PvP damage and precision are independent of local presentation; bot tuning is retained',()=>{
 for(const difficulty of ['casual','normal','hard']){
  const g=fixture({difficulty}),[a,b]=humans(g);g.state.phase='active';
  assert(g.damage(a,20,b));assert.equal(a.hp,80);assert(g.damage(b,20,a));assert.equal(b.hp,80);
  const bot=g.actors[6];bot.controllerType='bot';a.hp=100;
  assert(g.damage(a,20,bot));assert.equal(a.hp,100-20*DIFFICULTIES[difficulty].humanDamage);
  Object.assign(a,{aimAmount:1,moving:0,flash:0,recoil:0});
  assert.equal(shotSpread(a,'p9'),shotSpread({...a,isPlayer:true},'p9'));
 }
});

test('fire is evaluated using the associated human input orientation in that tick',()=>{
 const g=fixture(),[a,b]=humans(g);g.state.phase='active';
 for(const actor of g.actors)if(actor!==a&&actor!==b)actor.alive=false;
 for(const h of g.hostages)h.rescued=true;
 Object.assign(a,{x:2,z:2,y:0,yaw:Math.PI/2,pitch:0,nextShot:0});
 Object.assign(b,{x:2,z:4,y:0,hp:100,armor:0});
 g.stepActors(new Map([[a.id,{yaw:Math.PI,pitch:0,fire:true}]]));
 assert(b.hp<100,'new aim hits the opponent behind the old aim');
 assert.equal(g.events.find(e=>e.type==='shot').yaw,Math.PI);
});

test('wire frames reject spoofed identity, internal movement, nonfinite/out-of-range values and unknown actions',()=>{
 for(const input of [null,[],{actorId:'analysts-0'},{moveWorld:{x:1,z:1}},{position:{x:9}},{dt:1},{damage:100},
  {forward:NaN},{pitch:Infinity},{strafe:2},{yaw:4},{fire:1},{autoFire:true},{select:'bomb'},{restart:true},{buy:'bazooka'},
  Object.create({fire:true}),{get fire(){throw Error('getter must not run');}}])assert.throws(()=>validateInput(input));
 const frame={forward:.5,yaw:1,fire:true,select:'primary'},copy=validateInput(frame);frame.forward=1;assert.equal(copy.forward,.5);
 const g=fixture(),r=new ControllerRegistry(g);r.bind('one',g.actors[0].id);r.bind('two',g.actors[5].id);
 assert.throws(()=>r.bind('third',g.actors[0].id));assert.throws(()=>r.bind('one',g.actors[1].id));assert.throws(()=>r.bind('bot',g.actors[1].id));
 assert.throws(()=>r.collect(new Map([['intruder',{}]])));
 const inputs=r.collect(new Map([['two',{forward:1}]]));assert.deepEqual([...inputs.keys()],[g.actors[5].id]);
 r.unbind('two');assert.throws(()=>r.collect(new Map([['two',{}]])));r.clear();assert.equal(r.collect().size,0);
});

test('authoritative tick advances once, with no accumulator, stale controls or client-supplied dt',async()=>{
 const sim=await createHeadlessSimulation({mapId:'synthetic-demo',controllers:humanControllers,config:{buyTime:0}});
 sim.controllers.bind('one','analysts-0');const p=sim.game.actors[0];
 sim.game.update=()=>{throw Error('nested accumulator');};
 for(let i=0;i<60;i++)sim.tick(new Map([['one',{yaw:0,strafe:.2}]]));
 assert(Math.abs(sim.game.state.time-1)<1e-12);assert.equal(sim.tickNumber,60);assert.equal(sim.game.accumulator,0);
 const x=p.x;sim.tick();assert.equal(p.x,x);assert.equal(p.fireHeld,false);
 p.inventory.pistol.ammo-=2;sim.tick(new Map([['one',{reload:true}]]));
 assert(p.reloadUntil>sim.game.state.time);assert.equal(sim.game.actors[5].reloadUntil,0);
 sim.tick(new Map([['one',{select:'knife'}]]));assert.equal(p.weapon,'knife');assert.equal(p.reloadUntil,0);
 const t=sim.game.state.time;assert.throws(()=>sim.tick(new Map([['one',{dt:2}]])));assert.equal(sim.game.state.time,t);
});

test('shared movement replays the same capsule result without combat, sound or RNG side effects',()=>{
 const ga=fixture(),gb=fixture();
 // A static clone of the collision/body view is enough for this foundation test.
 for(const g of [ga,gb]){for(const a of g.actors.slice(1))a.alive=false;g.hostages.forEach(h=>h.rescued=true);}
 const a=ga.actors[0],b=gb.actors[0];Object.assign(a,{x:2,z:2});Object.assign(b,{x:2,z:2});
 gb.emit=()=>{throw Error('prediction emitted an event');};gb.random=()=>{throw Error('prediction consumed random state');};
 for(let i=0;i<240;i++){
  const input={forward:i<120?1:-1,strafe:.4,yaw:.3,crouch:i>180,jump:i===2};
  ga.state.time=gb.state.time=(i+1)*CONFIG.fixedStep;
  ga.moveActor(a,input,CONFIG.fixedStep);moveActor(gb,b,input,CONFIG.fixedStep,false);
  assert.deepEqual(pose(a),pose(b));
 }
});


test('each Game owns RNG, events, counters and mutable match state',()=>{
 const a=fixture(),b=fixture(),reference=fixture();
 a.random();a.random();a.emit('probe',a.actors[0]);a.state.score.analysts=4;
 assert.equal(b.random(),reference.random());assert.deepEqual(b.events,reference.events);
 assert.equal(b.eventSerial,reference.eventSerial);assert.equal(b.state.score.analysts,0);
 a.actors[0].inventory.pistol.ammo=0;assert.equal(b.actors[0].inventory.pistol.ammo,reference.actors[0].inventory.pistol.ammo);
 a.pause();b.stepActors();assert.equal(b.state.time,CONFIG.fixedStep);assert.equal(a.state.time,0);
});
