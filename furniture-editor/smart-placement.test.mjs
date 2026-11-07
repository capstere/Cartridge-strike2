import test from 'node:test';
import assert from 'node:assert/strict';
import {inferPlacementRole,proposeSmartPose,findSupport,duplicateFurnitureAssembly} from './smart-placement.mjs?v=5.7.2';
const desk={id:'NY-OBJ-0001',assetId:'studio:desk-120',assetName:'Skrivbord 120 × 70',kind:'prop',
 x:3,z:3,yaw:0,w:1.2,d:.7,height:.75};
const wall={id:'BYGG-V-0001',kind:'wall',a:[0,0],b:[8,0],height:2.85,thickness:.11};
const item=(id,name,w=.4,d=.3,h=.35)=>({id:'NY-OBJ-0002',assetId:id,assetName:name,
 kind:'prop',x:3,z:3,yaw:0,w,d,height:h});
test('pre-existing procedural microwave stays on counter and remains a normal persisted furniture object',()=>{
 const mw=item('studio:microwave','Mikrovågsugn',.5,.42,.31);
 const q=proposeSmartPose(mw,{x:3,z:3},[desk]);
 assert.equal(q.mountId,desk.id);
 assert(Math.abs(q.elevation-(desk.height-.008))<.002);
 assert.equal(q.wallMount,null);
});
test('ordinary curated GLB microwave, monitor, keyboard and small plant now understand desks',()=>{
 for(const [id,name] of [
  ['kenney:furniture-kit:kitchenmicrowave','Mikrovågsugn'],
  ['studio:monitor','Datorskärm'],
  ['kenney:furniture-kit:books','Böcker'],
  ['kenney:furniture-kit:plantsmall1','Liten växt'],
  ['kenney:furniture-kit:lampsquaretable','Bordslampa']]){
  const o=item(id,name,.3,.25,.31);
  assert.equal(inferPlacementRole(o),'countertop',id);
  assert.equal(proposeSmartPose(o,{x:3,z:3},[desk]).mountId,desk.id,id);
 }
});
test('mirror and owner GLB wall signs mount at eye height with non-blocking visual geometry',()=>{
 for(const o of [item('kenney:furniture-kit:bathroommirror','Badrumsspegel',.52,.12,.65),
  item('hissrum12:sign','5S-skylt / etikett',.45,.07,.18),
  item('hissrum12:phoneArm','Telefon på väggarm',.26,.36,.3),
  item('local:'+'a'.repeat(64),'Min tavla',.5,.08,.6)]){
  assert.equal(inferPlacementRole(o),'wall');
  const pose=proposeSmartPose(o,{x:4,z:.15},[],{walls:[wall]});
  assert(pose.wallMount,o.assetId);
  assert.equal(pose.wallMount.wallId,wall.id);
  assert.equal(pose.collision,'none');
  assert(pose.elevation>.5);
 }
});
test('all three manual overrides work without teleporting across the room',()=>{
 const mirror=item('kenney:furniture-kit:bathroommirror','Spegel',.5,.1,.7);
 const manualTable=proposeSmartPose(mirror,{x:3,z:3},[desk],{mode:'surface',walls:[wall]});
 assert.equal(manualTable.mountId,desk.id);
 const manualWall=proposeSmartPose(item('local:'+'a'.repeat(64),'Min egen modell',.5,.1,.7),
  {x:4,z:.2},[desk],{mode:'wall',walls:[wall]});
 assert(manualWall.wallMount);
 const manualFloor=proposeSmartPose(mirror,{x:3,z:3},[desk],{mode:'floor',walls:[wall]});
 assert.equal(manualFloor.elevation,0);
 assert.equal(manualFloor.wallMount,null);
 assert.equal(manualFloor.mountId,null);
 const outside=proposeSmartPose(mirror,{x:99,z:99},[desk],{mode:'wall',walls:[wall]});
 assert.equal(outside.wallMount,null);
 assert.deepEqual({x:outside.x,z:outside.z},{x:99,z:99});
});
test('large floor objects do not erroneously climb on desks',()=>{
 const floor=item('hissrum12:pallet','EUR-pall',1.2,.8,.144);
 assert.equal(inferPlacementRole(floor),'floor');
 assert.equal(findSupport(floor,{x:3,z:3},[desk]),null);
});
test('duplicate supports keep their countertop children connected to new IDs',()=>{
 const mw={...item('studio:microwave','Mikro',.5,.42,.31),x:3,z:3,mountId:desk.id,elevation:.74};
 const clones=duplicateFurnitureAssembly(desk,[desk,mw],{x:5,z:5,yaw:0,mountId:null,elevation:0,wallMount:null});
 assert.equal(clones.length,2);
 assert.notEqual(clones[0].id,desk.id);
 assert.equal(clones[1].mountId,clones[0].id);
 assert.equal(clones[1].wallMount,null);
});
test('wall-mounted duplicated objects do not accidentally keep old wall data on floor copies',()=>{
 const m={...item('kenney:furniture-kit:bathroommirror','Spegel',.5,.1,.65),wallMount:{wallId:'OLD',t:.5,side:1,y:1.5}};
 const [copy]=duplicateFurnitureAssembly(m,[m],{x:1,z:1,yaw:0,mountId:null,elevation:0,wallMount:null});
 assert.equal(copy.wallMount,null);
});


test('a small wall shelf is both anchored to the wall and a support for books',()=>{
 const wallShelf=item('studio:wall-shelf','Vägghylla',.9,.25,.1);
 const wallPose=proposeSmartPose(wallShelf,{x:4,z:.1},[],{walls:[wall]});
 assert(wallPose.wallMount);
 const mounted={...wallShelf,...wallPose};
 const books={...item('kenney:furniture-kit:books','Böcker',.31,.28,.28),id:'NY-OBJ-0003'};
 const pose=proposeSmartPose(books,{x:mounted.x,z:mounted.z},[mounted],{walls:[wall]});
 assert.equal(pose.mountId,mounted.id);
 assert(pose.elevation>1.5);
});

test('explicit wall and surface failure is blocked, never a successful floor placement',()=>{
 const o=item('local:'+'a'.repeat(64),'Import',2,.2,1);
 const tooNarrow={...wall,b:[1,0]};
 assert.match(proposeSmartPose(o,{x:.5,z:0},[],{mode:'wall',walls:[tooNarrow]}).blocked,/väggbredd/);
 assert.match(proposeSmartPose(o,{x:4,z:0},[],{mode:'wall',walls:[{...wall,height:.5}]}).blocked,/vägghöjd/);
 assert(proposeSmartPose(o,{x:4,z:4},[],{mode:'surface'}).blocked);
 assert.equal(proposeSmartPose(o,{x:4,z:4},[],{mode:'floor'}).blocked,undefined);
});
test('catalog placement metadata works without name inference',()=>{
 const tv=item('onboard:tv-with-a-wall-mount','Unrelated display name',3.066,.25,1.789);
 assert.equal(inferPlacementRole(tv),'wall');
 const pose=proposeSmartPose(tv,{x:4,z:.15},[],{walls:[wall]});
 assert(Math.abs(pose.yaw)<1e-6,'Measured +Z TV screen faces +Z room');
});
test('a rolled wall shelf is not offered as a horizontal support',()=>{
 const shelf={...desk,assetId:'studio:wall-shelf',kind:'wall-shelf',height:.5,wallMount:{wallId:wall.id,t:.5,side:1,y:1.5},wallRoll:.25};
 assert.equal(findSupport(item('local:fixture','Kopp',.2,.2,.2),{x:3,z:3},[shelf]),null);
});
