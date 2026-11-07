import test from 'node:test';
import assert from 'node:assert/strict';
import {validWallMount,poseOnWall,findWallMount,syncWallMounts} from './wall-mounts.mjs';
const fixture={id:'NY-OBJ-0001',kind:'prop',assetId:'kenney:furniture-kit:bathroommirror',
 assetName:'Badrumsspegel',x:3.7,z:1,yaw:0,w:.52,d:.12,height:.65};
const wall={id:'BYGG-V-0002',kind:'wall',a:[4,0],b:[4,8],thickness:.11,height:2.85};
const walls=[wall,{id:'BYGG-D-0003',kind:'door',a:[3,0],b:[3,1],height:2.4}];
const near=(a,b)=>Math.abs(a-b)<.003;
test('wall mirror sits against the wall, centered at eye height and faces outward',()=>{
 const p=findWallMount(fixture,{x:3.8,z:4},walls);
 assert(p&&p.wallMount);
 assert(near(p.x,4-(.11/2+.12/2+.012)));
 assert(near(p.z,4));
 assert(near(p.elevation+fixture.height/2,1.55));
 assert(near(p.yaw,-Math.PI/2));
 assert.equal(p.wallMount.wallId,wall.id);
 assert.equal(p.collision,'none','A wall mirror must not create an invisible player obstacle');
 assert.equal(p.mountId,null);
 assert.equal(validWallMount(p.wallMount),true);
});
test('wall mount follows the wall when a room is resized without changing height or width',()=>{
 const pose=findWallMount(fixture,{x:3.8,z:4},walls);
 const item={...fixture,...pose};
 const moved={...wall,a:[5,0],b:[5,10]};
 const result=syncWallMounts([item],[moved]);
 assert.equal(result.updated,1);
 assert(near(item.x,5-(.11/2+.12/2+.012)));
 assert(near(item.z,5));
 assert(near(item.wallMount.y,1.55));
 assert(near(item.wallMount.t,.5));
});
test('endpoints are clamped to keep the entire asset on the wall',()=>{
 const p=findWallMount(fixture,{x:3.85,z:.01},walls);
 assert(p);
 assert(p.wallMount.t>0&&p.wallMount.t<1);
 assert(p.z>=fixture.w/2);
});
test('invalid wall candidates never teleport an item across a room, nor attach to doors',()=>{
 assert.equal(findWallMount(fixture,{x:-9,z:-8},walls),null);
 assert.equal(findWallMount(fixture,{x:3,z:.5},walls.filter(w=>w.kind==='door')),null);
 assert.equal(poseOnWall(fixture,{wallId:wall.id,t:.5,side:1,y:1.6},[]),null);
 assert.equal(validWallMount({wallId:wall.id,t:22,side:1,y:1.6}),false);
 assert.equal(validWallMount({wallId:wall.id,t:.5,side:0,y:1.6}),false);
});
test('a missing wall cannot silently create an invisible wall or erase the authored model',()=>{
 const mount=findWallMount(fixture,{x:3.8,z:4},walls);
 const item={...fixture,...mount},before=structuredClone(item);
 const result=syncWallMounts([item],[]);
 assert.equal(result.missing,1);
 assert.deepEqual(item,before);
});
test('a tall wall object that cannot fit is not forced onto a window or short wall',()=>{
 const tiny={id:'tiny',kind:'wall',a:[4,0],b:[4,.3],height:2.85};
 assert.equal(findWallMount(fixture,{x:4,z:.1},[tiny]),null);
 assert.equal(findWallMount({...fixture,height:3.1},{x:4,z:4},walls),null);
});
test('the opposite wall face is selectable and rotates the asset with the wall',()=>{
 const p=findWallMount(fixture,{x:4.2,z:4},walls);
 assert(p);
 assert.equal(p.wallMount.side,-1);
 assert(p.x>4);
 assert(near(Math.abs(p.yaw),Math.PI/2));
});

test('new anchors ignore endpoint ordering and centre-line clicks choose the room',()=>{
 const f={x0:0,z0:0,x1:8,z1:8},item={...fixture,w:1,d:.2};
 for(const w of [
  {id:'n',a:[0,0],b:[8,0]},{id:'s',a:[8,8],b:[0,8]},
  {id:'e',a:[8,0],b:[8,8]},{id:'w',a:[0,8],b:[0,0]},
  {id:'diag',a:[1,1],b:[7,7]}]){
  const wall={...w,kind:'wall',height:3,thickness:.035},q={x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2};
  const first=findWallMount(item,q,[wall],{floors:[f]}),rev={...wall,a:wall.b,b:wall.a};
  assert.deepEqual(first,findWallMount(item,q,[rev],{floors:[f]}));
  assert.deepEqual(first,poseOnWall(item,first.wallMount,[rev]));
  if(w.id!=='diag')assert(first.x>0&&first.x<8&&first.z>0&&first.z<8);
 }
});
test('unrounded physical picked face beats room inference, including a 35 mm wall',()=>{
 const w={...wall,a:[0,0],b:[8,0],thickness:.035};
 const q={x:4,z:-.0175,y:1.5,wallId:w.id,normal:{x:0,z:-1}};
 const found=findWallMount(fixture,q,[w],{floors:[{x0:0,x1:8,z0:0,z1:8}]});
 assert.equal(found.wallMount.side,-1);assert(found.z<0);
});
test('different model fronts and measured dimensions use the real back plane',()=>{
 for(const front of ['+z','-z','+x','-x']){
  const item={...fixture,w:2,d:.5,height:2,modelSize:[4,2,1],wallFacing:front};
  const w={...wall,a:[0,0],b:[8,0]},pose=findWallMount(item,{x:4,z:.1},[w]);
  const fa={'+z':0,'-z':Math.PI,'+x':Math.PI/2,'-x':-Math.PI/2}[front];
  assert(Math.abs(Math.sin(pose.yaw+fa))<1e-6);assert(Math.cos(pose.yaw+fa)>.999999);
  const depth=front.endsWith('x')?2:.5;
  assert(Math.abs(pose.z-depth/2-w.thickness/2-.012)<1e-6);
  assert(Math.abs(pose.elevation-(pose.wallMount.y-.5))<1e-6);
 }
});
test('height changes clamp safely; too short a wall does not reanchor to its neighbour',()=>{
 const pose=findWallMount(fixture,{x:3.8,z:4},walls),item={...fixture,...pose};
 const shortened={...wall,height:.9};syncWallMounts([item],[shortened]);assert(item.wallMount.y<=.515);
 const before=structuredClone(item);assert.equal(syncWallMounts([item],[{...wall,height:.2},{...wall,id:'other',a:[3.9,0],b:[3.9,8]}]).missing,1);assert.deepEqual(item,before);
});

test('physical wall openings reserve real spans; a wide TV cannot cover a door',()=>{
 const w={...wall,a:[0,0],b:[4,0]},door={id:'door',kind:'door',a:[1.4,0],b:[2.6,0]};
 assert.equal(findWallMount({...fixture,w:3},{x:1,z:.1},[w,door]),null);
 const mounted=findWallMount({...fixture,w:.5},{x:1,z:.1},[w,door]);assert(mounted);assert(mounted.x+.25<1.4);
});

test('preview pose is exactly idempotent through save and mount synchronization',()=>{
 const diagonal={...wall,a:[-2,-1],b:[7,5]};
 const p=findWallMount(fixture,{x:2.3456789,z:2.3456789,y:1.6789123},[diagonal]);assert(p);
 assert.deepEqual(poseOnWall(fixture,JSON.parse(JSON.stringify(p.wallMount)),[diagonal]),p);
});
