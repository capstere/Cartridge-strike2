import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {rotateFurniture,mirrorFurniture} from './furniture-transforms.mjs';
import {poseOnWall,syncWallMounts} from './wall-mounts.mjs';
import {wallFootprint,fittedSize} from './model-alignment.mjs';
import {applyFurnitureAppearance,buildProjectFurniture} from './build/project-visuals.mjs?v=5.1.0';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from './build/level-project.mjs?v=5.7.2';
import {resolveProjectScene,writeProjectScene,floor5Baseline} from './build/project-scene.mjs?v=5.7.2';
const near=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} != ${b}`);
const furniture=()=>({id:'NY-OBJ-0001',kind:'prop',x:1,z:2,yaw:.3,w:2,d:.3,height:1.2});
const walls=[{id:'wall',kind:'wall',a:[0,0],b:[8,0],height:3,thickness:.12}];
const mount={wallId:'wall',t:.5,side:1,y:1.5,frame:1};
test('turn and mirror complete attachment trees without losing anchors or elevation',()=>{
 const a=furniture(),b={...furniture(),id:'NY-OBJ-0002',x:1.3,z:2.2,mountId:a.id,elevation:1.2,wallFacing:'+x'},c={...b,id:'NY-OBJ-0003',x:1.35,mountId:b.id};
 const items=[a,b,c],before=structuredClone(items);mirrorFurniture(a,items);assert(b.mirrored&&c.mirrored);assert.notEqual(b.x,before[1].x);mirrorFurniture(a,items);
 for(let i=0;i<items.length;i++){for(const k of ['x','z','yaw'])near(items[i][k],before[i][k]);assert.equal(items[i].mountId,before[i].mountId);assert.equal(items[i].elevation,before[i].elevation);}
 rotateFurniture(a,items,[],Math.PI/2);rotateFurniture(a,items,[],-Math.PI/2);for(let i=0;i<items.length;i++)for(const k of ['x','z','yaw'])near(items[i][k],before[i][k]);
});
test('wall rotation preserves anchor and wall depth for every model front; oversized turns are atomic',()=>{
 for(const wallFacing of ['-z','+z','+x','-x']){
  const item={...furniture(),wallFacing};Object.assign(item,poseOnWall(item,mount,walls));const old=structuredClone(item);
  assert.equal(rotateFurniture(item,[item],walls,Math.PI/12),null);assert.deepEqual(item.wallMount,old.wallMount);near(item.z,old.z);near(item.yaw,old.yaw);
  mirrorFurniture(item,[item]);assert.deepEqual(item.wallMount,old.wallMount);const saved=structuredClone(item);syncWallMounts([item],walls);assert.deepEqual(item,saved);
 }
 const item={...furniture(),w:4,height:1};Object.assign(item,poseOnWall(item,mount,walls));const before=structuredClone(item);assert.match(rotateFurniture(item,[item],walls,Math.PI/2),/inte plats/);assert.deepEqual(item,before);
 const solid={...item,collision:'solid'},savedSolid=structuredClone(solid);assert.match(rotateFurniture(solid,[solid],walls,.1),/Dekoration/);assert.deepEqual(solid,savedSolid);
 const child={...furniture(),id:'child',mountId:item.id};assert.match(rotateFurniture(item,[item,child],walls,.1),/ovanpå/);assert.deepEqual(item,before);
});
test('render wrapper reflects asymmetric vertices, matches rolled bounds and leaves shared geometry/UV/material intact',()=>{
 for(const front of ['-z','+z','+x','-x']){
  const item={...furniture(),wallFacing:front,wallRoll:.25,mirrored:true};Object.assign(item,poseOnWall(item,mount,walls));
  const geometry=new T.BoxGeometry(item.w,item.height,item.d),material=new T.MeshStandardMaterial(),mesh=new T.Mesh(geometry,material);mesh.position.y=item.height/2;
  const vertices=Array.from(geometry.attributes.position.array),uv=Array.from(geometry.attributes.uv.array),holder=new T.Group(),untouched=new T.Group();holder.add(mesh);untouched.add(new T.Mesh(geometry,material));
  applyFurnitureAppearance(holder,item);holder.updateMatrixWorld(true);const size=new T.Box3().setFromObject(holder).getSize(new T.Vector3()),fit=wallFootprint(item),across=front.endsWith('x');
  near(size.y,fit.height);near(across?size.z:size.x,fit.width);near(across?size.x:size.z,fit.depth);
  const determinant=mesh.matrixWorld.determinant();assert(determinant<0);assert.equal(untouched.children[0].scale.x,1);assert.deepEqual([...geometry.attributes.position.array],vertices);assert.deepEqual([...geometry.attributes.uv.array],uv);assert.strictEqual(mesh.material,material);
  // Reflection twice restores every vertex, not merely the bounding box.
  const ordinary={...item,mirrored:false,wallRoll:0};applyFurnitureAppearance(holder,ordinary);holder.updateMatrixWorld(true);const v=new T.Vector3(.7,.2,.1);const transformed=mesh.localToWorld(v.clone());near(transformed.x,v.x);near(transformed.y,v.y+item.height/2);near(transformed.z,v.z);
 }
 assert.deepEqual(fittedSize({...furniture(),kind:'desk',modelSize:[4,1,4]}),{w:2,d:.3,h:1.2});
});
test('new fields validate, preserve legacy projects and round-trip original Floor 5 furniture through ZIP',async()=>{
 const p=exportProject();p.furniture.added.push({...furniture(),mirrored:true,wallRoll:.2});assert.deepEqual(parseProject(p),p);
 for(const bad of [{mirrored:'yes'},{wallRoll:Infinity},{wallRoll:7}]){const q=structuredClone(p);Object.assign(q.furniture.added[0],bad);assert.throws(()=>parseProject(q));}
 delete p.furniture.added[0].mirrored;delete p.furniture.added[0].wallRoll;assert.doesNotThrow(()=>parseProject(p));
 const floor=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(floor),original=JSON.stringify(floor5Baseline().items),chosen=scene.items[0];chosen.mirrored=true;writeProjectScene(floor,scene);
 assert.equal(floor.furniture.placements.find(o=>o.id===chosen.id).mirrored,true);
 const restored=(await parseProjectZip(await exportProjectZip(floor))).project;assert.equal(resolveProjectScene(restored).items.find(o=>o.id===chosen.id).mirrored,true);assert.equal(JSON.stringify(floor5Baseline().items),original);
});
test('lazy preview geometry arriving after its frame receives the same mirror as final placement',()=>{
 const item={...furniture(),mirrored:true},holder=new T.Group();applyFurnitureAppearance(holder,item);
 const mesh=new T.Mesh(new T.BoxGeometry(.2,.2,.2),new T.MeshStandardMaterial());mesh.position.set(.5,.6,0);holder.add(mesh);applyFurnitureAppearance(holder,item);holder.updateMatrixWorld(true);
 near(mesh.getWorldPosition(new T.Vector3()).x,-.5);assert(mesh.matrixWorld.determinant()<0);assert.equal(holder.children.length,1);
});

test('a missing model cannot leave other mirrored instances visually untransformed',async()=>{
 const root=new T.Group(),good={...furniture(),mirrored:true},bad={...furniture(),id:'missing',assetId:'unknown:missing'};
 await assert.rejects(buildProjectFurniture([good,bad],root),/saknas/);root.updateMatrixWorld(true);let determinant=1;root.children[0].traverse(o=>{if(o.isMesh)determinant=o.matrixWorld.determinant();});assert(determinant<0);
});
