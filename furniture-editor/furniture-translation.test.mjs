import test from 'node:test';
import assert from 'node:assert/strict';
import {furnitureHandleFrame,planFurnitureTranslation} from './furniture-translation.mjs';
import {poseOnWall} from './wall-mounts.mjs';
import {duplicateFurnitureAssembly} from './smart-placement.mjs?v=5.7.2';
import {exportProject,exportProjectZip,parseProjectZip} from './build/level-project.mjs?v=5.7.2';
import {resolveProjectScene,writeProjectScene,floor5Baseline} from './build/project-scene.mjs?v=5.7.2';
const item=()=>({id:'NY-OBJ-0001',kind:'desk',x:2,z:3,yaw:.4,w:2,d:1,height:.8,mirrored:true});
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const wall={id:'w',kind:'wall',a:[0,0],b:[10,0],height:3,thickness:.12};
test('handles use model centre and wall tangent, never a normal through the wall',()=>{
 const a=item(),frame=furnitureHandleFrame(a,[]);near(frame.origin.y,.4);assert.deepEqual(Object.keys(frame.axes),['x','z','height']);
 const b={...a,kind:'prop',height:1,w:1,wallRoll:.2,wallFacing:'+z'};Object.assign(b,poseOnWall(b,{wallId:'w',t:.5,y:1.5,side:1,frame:1},[wall]));
 const f=furnitureHandleFrame(b,[wall]);assert.deepEqual(Object.keys(f.axes),['x','height']);near(f.origin.y,b.wallMount.y);assert.deepEqual(f,furnitureHandleFrame(b,[{...wall,a:wall.b,b:wall.a}]));
 assert.equal(furnitureHandleFrame(b,[]),null);
});
test('floor movement preserves geometry/orientation and moves all nested attachments atomically',()=>{
 const a=item(),b={...item(),id:'NY-OBJ-0002',x:2.1,elevation:.8,mountId:a.id},c={...b,id:'NY-OBJ-0003',elevation:1,mountId:b.id},items=[a,b,c],before=structuredClone(items);
 const moved=planFurnitureTranslation(a,items,[],{x:.7,y:.4,z:-.5});assert.deepEqual(items,before);
 for(let i=0;i<items.length;i++){near(moved[i].x,items[i].x+.7);near(moved[i].z,items[i].z-.5);near(moved[i].elevation,(items[i].elevation||0)+.4);for(const k of ['id','yaw','w','d','height','mirrored','mountId'])assert.equal(moved[i][k],items[i][k]);}
 assert.deepEqual(planFurnitureTranslation(a,items,[],{x:0,y:0,z:0}),items);
 const limited=planFurnitureTranslation(a,items,[],{x:1000,y:1000,z:1000});assert(limited.every(m=>m.x<=100&&m.z<=100&&m.elevation<=6));
});
test('wall drag preserves side, id, roll, mirror and distance while clamping its available extent',()=>{
 const a={...item(),kind:'prop',w:1,d:.2,height:1,wallFacing:'+z',wallRoll:.15};Object.assign(a,poseOnWall(a,{wallId:'w',t:.5,y:1.5,side:-1,frame:1},[wall]));const before=structuredClone(a);
 const [m]=planFurnitureTranslation(a,[a],[wall],{x:.8,y:.3,z:30});near(m.x,a.x+.8);near(m.elevation,a.elevation+.3);near(m.z,a.z);assert.equal(m.wallMount.side,-1);assert.equal(m.wallMount.wallId,'w');assert.equal(m.wallRoll,a.wallRoll);assert.equal(m.mirrored,true);assert.deepEqual(a,before);
 const [edge]=planFurnitureTranslation(a,[a],[wall],{x:1000,y:1000,z:1000});assert(edge.x<10&&edge.wallMount.y<3);near(edge.z,a.z);
 assert.throws(()=>planFurnitureTranslation(a,[a],[],{x:1,y:1,z:1}),/saknas/);
});
test('countertop items remain on their support; height changes are position, never mesh scaling',()=>{
 const table=item(),cup={...item(),id:'NY-OBJ-0002',kind:'prop',w:.2,d:.2,height:.2,elevation:.792,mountId:table.id};
 const [m]=planFurnitureTranslation(cup,[table,cup],[],{x:100,y:-100,z:100});assert.equal(m.mountId,table.id);near(m.elevation,.792);assert(Math.hypot(m.x-table.x,m.z-table.z)<1.1);assert.equal(m.height,.2);
 const [up]=planFurnitureTranslation(cup,[table,cup],[],{x:0,y:.3,z:0});near(up.elevation,1.092);
});
test('copying a raised assembly keeps its relative attachment heights',()=>{
 const a={...item(),elevation:.5},b={...item(),id:'NY-OBJ-0002',mountId:a.id,elevation:1.3};const copies=duplicateFurnitureAssembly(a,[a,b],{x:3,z:4,yaw:a.yaw,elevation:1});near(copies[0].elevation,1);near(copies[1].elevation,1.8);assert.equal(b.elevation,1.3);
});
test('elevated original Floor 5 furniture round-trips without changing the baseline',async()=>{
 const p=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(p),source=JSON.stringify(floor5Baseline()),a=scene.items[0];Object.assign(a,planFurnitureTranslation(a,scene.items,scene.entries,{x:.2,y:.4,z:.3})[0]);writeProjectScene(p,scene);
 const restored=(await parseProjectZip(await exportProjectZip(p))).project,m=resolveProjectScene(restored).items.find(o=>o.id===a.id);near(m.elevation,.4);near(m.x,a.x);assert.equal(JSON.stringify(floor5Baseline()),source);
});
test('malformed movement never mutates source instances',()=>{const a=item(),before=structuredClone(a);assert.throws(()=>planFurnitureTranslation(a,[a],[],{x:Infinity,y:0,z:0}),/Ogiltig/);assert.deepEqual(a,before);});
