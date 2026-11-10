import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import {Game,resolveRound} from '../src/fps/game.mjs';
import {createWorld} from '../src/fps/world.mjs';
import {POSES,zombiePosition} from '../src/fps/zombie-poses.mjs';
import {tickZombies} from '../src/fps/zombies.mjs';

const read=p=>JSON.parse(readFileSync(p));
const audit=read('docs/zombies/Cartridge_Strike_2_Zombie_Animations.json').clips;
const world=createWorld({levelProject:read('levels/floor5-prepared.json')});
const game=(config={})=>new Game(world,{seed:42,config:{buyTime:0,...config}}).start();
function quiet(g){
  g.state.phase='active';world.setElevatorProgress(1);
  for(const a of g.actors){a.alive=false;a.bot=null;}
}
function advance(g,seconds,observe=()=>{},doors=true){
  for(let i=0;i<Math.ceil(seconds*20);i++){
    g.state.time+=.05;g.pendingDamage=[];
    if(doors)world.doors.update(g.state.time,.05,[...g.actors,...g.state.zombies]);
    tickZombies(g,.05);for(const h of g.pendingDamage)g.damage(h.target,h.amount,h.source,h.kind,h);
    g.soundEvents=g.soundEvents.filter(e=>g.state.time-e.time<2);g.events=[];observe();
  }
}
const actual=z=>[z.x,z.z];
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);

test('both source rigs, all audited clip names, timing, original vertex and animation bytes',()=>{
 for(const [i,[kind,title,hash]] of [
   ['hollow','The Hollow Walker','eae8c27cc273e3cd9c914b0f82e3575c8ae229e3db2ceddf0c3d505c22ecdf75'],
   ['tattered','Tattered Wanderer','b9ec315ca34a10a73b2d5c12e81d6c4b73f507c65d51db6bc637619190f56eed']].entries()){
   const file=gunzipSync(readFileSync('assets/fps/zombies/'+kind+'.glb.gz')),length=file.readUInt32LE(12);
   const gltf=JSON.parse(file.subarray(20,20+length)),bin=file.subarray(28+length),source=audit[title];
   assert.equal(gltf.skins[0].joints.length,i?66:68);assert.equal(gltf.animations.length,16);
   assert.deepEqual(gltf.animations.map(a=>a.name),source.animations.map(a=>a.name));
   assert.deepEqual(new Set(Object.values(POSES[kind])),new Set(gltf.animations.map(a=>a.name)));
   const images=new Set(gltf.images.map(im=>im.bufferView)),digest=createHash('sha256');
   for(const [j,view] of gltf.bufferViews.entries())if(!images.has(j))digest.update(bin.subarray(view.byteOffset,view.byteOffset+view.byteLength));
   assert.equal(digest.digest('hex'),hash);
   for(const [j,a] of gltf.animations.entries()){
     const duration=Math.max(...a.samplers.map(s=>gltf.accessors[s.input].max[0]));
     assert.ok(Math.abs(duration-source.animations[j].durationSeconds)<.001,a.name);
   }
 }
});

test('normal populations, actual seat, full reclining footprint, clear mission interactions and compatible custom maps',()=>{
 for(const mode of ['classic','endless'])for(const mobile of [false,true]){
  const g=game({mode,mobile}),zs=g.state.zombies;
  assert.equal(zs.filter(z=>z.model!=='danceman').length,mobile?3:5);assert.equal(g.actors.length,10);
  assert.equal(world.roomAt(zs[0].x,zs[0].z).id,'I25');assert.ok(world.canOccupy(zs[0].x,zs[0].z,1.04));
  const item=world.projectScene.items.find(o=>o.id===zs[1].seat.id);
  assert.equal(item.kind,'chair');assert.ok(distance(zombiePosition(zs[1],0),item)<.1);assert.ok(distance(zs[1],item)>.59);
  for(const z of zs){
   assert.ok(world.canOccupy(z.x,z.z,z.radius,1.7));assert.ok(!z.team&&!z.inventory);
   for(const a of [...g.actors,...g.hostages,world.anchors.bomb,world.anchors.rescue])assert.ok(distance(z,a)>4.5);
  }
  g.beginRound();assert.equal(g.state.zombies.length,zs.length);assert.notEqual(g.state.zombies[0],zs[0]);
 }
 const custom=createWorld({levelProject:read('levels/synthetic-demo.json')});
 assert.equal(new Game(custom).start().state.zombies.length,0);
});

test('every authored clip has a reachable behavior on the prepared floor',()=>{
 const seen={hollow:new Set(),tattered:new Set()},g=game();quiet(g);
 const observe=()=>{for(const z of g.state.zombies)seen[z.model]?.add(z.clip);};
 observe();
 for(const z of g.state.zombies.slice(0,2)){
   const actor=g.actors[0];Object.assign(actor,{x:z.x,z:z.z});g.emit('shot',actor,{weapon:'p9'});
   advance(g,.5,observe);assert.equal(z.behavior,'rising');
 }
 advance(g,3,observe);
 // Let the residents arrive, pause and choose their own contextual ambient sequences.
 advance(g,1250,observe);
 for(const kind of ['hollow','tattered']){
   function resident(){
     const match=game();quiet(match);const z=match.state.zombies.find((v,i)=>i>=2&&v.model===kind);
     match.state.zombies=[z];Object.assign(z,{x:42.7,z:25.2,yaw:0,home:{x:42.7,z:25.2},aggressive:true,weakGait:false});
     return [match,z];
   }
   const [match,z]=resident(),a=match.actors[0];
   Object.assign(a,{alive:true,x:z.x,z:z.z-1.5});advance(match,.6,()=>seen[kind].add(z.clip));assert.equal(z.behavior,'pursuing');
   a.z=z.z-.62;z.nextAttack=0;advance(match,.5,()=>seen[kind].add(z.clip));assert.equal(z.behavior,'attack');
   a.alive=false;advance(match,3);const see=()=>seen[kind].add(z.clip);
   const hit=(amount,weapon,y,dz)=>{match.damage(z,amount,a,weapon,{point:{x:z.x,y,z:z.z},direction:{x:0,y:0,z:dz}});see();};
   hit(6,'p9',1.2,1);advance(match,3.3,see);
   hit(5,'knife',1.2,1);advance(match,3.4,see);
   hit(38,'shotgun',1.2,1);assert.equal(z.behavior,'knockdown');advance(match,7,see);
   hit(8,'he',1.2,1);assert.equal(z.behavior,'knockdown');advance(match,7,see);
   // The injury persists when the actor gets back up and walks to a remembered noise.
   Object.assign(a,{x:z.x,z:z.z+.8});match.emit('shot',a,{weapon:'p9'});advance(match,2,see);
   for(const [weapon,y,dz,key] of [['knife',1.2,1,'dead'],['p9',.8,1,'abdominal'],['p9',1.25,-1,'front'],['p9',1.25,1,'back']]){
     const [m,other]=resident();m.damage(other,1000,m.player,weapon,{point:{x:other.x,y,z:other.z},direction:{x:0,y:0,z:dz}});
     seen[kind].add(other.clip);assert.equal(other.clip,POSES[kind][key]);const corpse=actual(other);advance(m,3);
     assert.deepEqual(actual(other),corpse);assert.equal(other.alive,false);assert.equal(other.path.length,0);
   }
   const missing=[...new Set(Object.values(POSES[kind]))].filter(name=>!seen[kind].has(name));assert.deepEqual(missing,[],kind+' unreachable '+missing);
 }
});

test('both factions are perceived, a clear telegraphed stomp hits once, moving away cancels damage',()=>{
 for(const team of ['analysts','counterAnalysts'])for(const dodge of [true,false]){
  const g=game();quiet(g);const z=g.state.zombies[2];g.state.zombies=[z];
  Object.assign(z,{x:42.7,z:25.2,yaw:0,home:{x:42.7,z:25.2}});const a=g.actors.find(v=>v.team===team);
  Object.assign(a,{x:z.x,z:z.z-.62,alive:true,armor:0});z.nextAttack=0;
  advance(g,.3);assert.equal(z.behavior,'attack');assert.equal(a.hp,100);
  if(dodge)a.z-=1.65;advance(g,1);assert.equal(a.hp<100,!dodge);
  const hp=a.hp;advance(g,.4);assert.equal(a.hp,hp);
 }
});

test('closed door attenuates sound, blocks sight, bullets and motion until the door opens',()=>{
 const g=game();quiet(g);const door=world.doors.doors.find(d=>[world.anchors.bomb,world.anchors.rescue,...world.anchors.hostages].every(p=>distance(p,d)>5) && [1,-1].every(sign=>world.canOccupy(d.x+sign*d.nx*1.65,d.z+sign*d.nz*1.65,.205,1.7)) &&
  !world.segmentClear({x:d.x+d.nx*1.65,y:1.1,z:d.z+d.nz*1.65},{x:d.x-d.nx*1.65,y:1.1,z:d.z-d.nz*1.65},{vision:false}));
 assert.ok(door);const z=g.state.zombies[2],a=g.player;g.state.zombies=[z];
 Object.assign(z,{x:door.x+door.nx*1.65,z:door.z+door.nz*1.65,yaw:Math.atan2(door.nx,door.nz),home:{x:door.x,z:door.z}});
 Object.assign(a,{x:door.x-door.nx*1.65,z:door.z-door.nz*1.65,alive:true,yaw:z.yaw+Math.PI,pitch:0});
 assert.equal(g.reticleTarget(a),null);g.fire(a);assert.ok(!g.pendingDamage.some(h=>h.target===z));
 advance(g,.5,()=>{},false);assert.equal(z.targetId,null);assert.equal(z.behavior,'investigating');
 advance(g,2,()=>{assert.ok((z.x-door.x)*door.nx+(z.z-door.z)*door.nz>0);},false);
 let saw=false;advance(g,7,()=>{saw ||= z.targetId===a.id;});assert.ok(door.angle>.3);assert.ok(saw,JSON.stringify([door.id,actual(z),actual(a),z.behavior,door.angle]));
});

test('neutral deaths leave scores, money, streaks, bomb, hostage and round outcomes intact',()=>{
 for(const mode of ['classic','endless']){
  const g=game({mode});g.state.phase='active';const z=g.state.zombies[2],p=g.player;
  p.combat.streak=3;const before=[p.kills,p.money,JSON.stringify(g.state.score),g.bomb.carrierId,g.hostages.length];
  g.damage(z,500,p,'p9');assert.equal(z.alive,false);
  assert.deepEqual([p.kills,p.money,JSON.stringify(g.state.score),g.bomb.carrierId,g.hostages.length],before);
  assert.equal(p.combat.streak,3);assert.equal(resolveRound(g.state),null);
  if(mode==='classic'){for(const a of g.actors.filter(a=>a.team==='analysts'))a.alive=false;assert.equal(resolveRound(g.state).winner,'counterAnalysts');}
  else{quiet(g);const corpse=z;advance(g,58);assert.notEqual(g.state.zombies[2],corpse);assert.ok(g.state.zombies[2].alive);}
 }
});

test('resting and seated bodies receive actual pistol rays at their rendered positions',()=>{
 for(const i of [0,1]){
  const g=game();quiet(g);const z=g.state.zombies[i],p=g.player,c=zombiePosition(z,0),y=i?1.22:.28;
  const choices=Array.from({length:24},(_,j)=>({x:c.x+1.75*Math.sin(j*Math.PI/12),y:1.58,z:c.z+1.75*Math.cos(j*Math.PI/12)}));
  const origin=choices.find(v=>world.canOccupy(v.x,v.z,.2,1.7)&&world.segmentClear(v,{x:c.x,y,z:c.z},{vision:false}));
  assert.ok(origin);Object.assign(p,{alive:true,x:origin.x,z:origin.z,y:0,yaw:Math.atan2(origin.x-c.x,origin.z-c.z),pitch:Math.atan2(y-1.58,1.75)});
  assert.equal(g.reticleTarget(p)?.id,z.id);assert.ok(g.fire(p));
  const hit=g.pendingDamage.find(h=>h.target===z);assert.ok(hit);g.damage(z,hit.amount,p,hit.kind,hit);
  assert.ok(z.hp<115);assert.equal(z.behavior,'rising');
 }
});
