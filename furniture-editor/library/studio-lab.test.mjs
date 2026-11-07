import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../../vendor/three/three.module.js';
import {OFFICE_LIBRARY} from './office-catalog.mjs';
import {LAB_FURNITURE_MAP} from './lab-furniture.mjs';
import {LIBRARY_ALL,LIBRARY_MAP} from './catalog.mjs';
import {inspectGLB} from './glb-utils.mjs';
import {makeZip,readZip} from './zip.mjs';
import {inferPlacementRole,proposeSmartPose,duplicateFurnitureAssembly} from '../smart-placement.mjs';
import {placementPreview,preferredPlacementPoint} from '../snap-highlights.mjs';
import {furnitureSurfaces,mountedElevation} from '../furniture-surfaces.mjs';
import {planFurnitureTranslation} from '../furniture-translation.mjs';
import {rotateFurniture} from '../furniture-transforms.mjs';
import {fittedSize,modelFront} from '../model-alignment.mjs';
import {exportPatch,parsePatch} from '../core.mjs';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from '../build/level-project.mjs';
import {makeEntry} from '../build/architecture.mjs';
import {resolveProjectScene,floor5Baseline} from '../build/project-scene.mjs';
import {buildProjectFurniture} from '../build/project-visuals.mjs';

const close=(a,b,tolerance=1e-6)=>assert(Math.abs(a-b)<tolerance,`${a} should equal ${b}`);
function item(id,index=1,overrides={}){
 const entry=LIBRARY_MAP.get(id);assert(entry,`Missing catalogue entry: ${id}`);
 return {id:`NY-OBJ-${String(index).padStart(4,'0')}`,assetId:id,assetName:entry.name,
  kind:entry.kind,roomId:'I09',x:2,z:3,yaw:0,w:entry.width,d:entry.depth,height:entry.height,
  ...(entry.wallFacing?{wallFacing:entry.wallFacing}:{}),
  ...(entry.modelSize?{modelSize:entry.modelSize}:{}),...overrides};
}
function rackAssembly(){
 const rack=item('studio:shoe-rack-black'),shoes=[0,1,2].map((level,index)=>{
  const shoe=item('studio:shoes',index+2,{color:['#ca3557','#347bb5','#194f35'][index]});
  return {...shoe,...proposeSmartPose(shoe,{x:rack.x+(index-1)*.25,z:rack.z,y:[.12,.36,.6][level]},[rack])};
 });
 return [rack,...shoes];
}
const wall=makeEntry('BYGG-V-9901','wall',[0,0],[8,0]);
function wallAssembly(){
 const base=item('studio:shoe-shelf-white',11);
 const shelf={...base,...proposeSmartPose(base,{x:4,z:.1,y:1.35},[],{walls:[wall]})};
 const shoe=item('studio:shoes',12,{color:'#bc6435'});
 return [shelf,{...shoe,...proposeSmartPose(shoe,{x:shelf.x+.2,z:shelf.z,y:shelf.elevation+.14},[shelf])}];
}

test('rack plan placement uses the top; actual 3D hits select each shelf and the preview agrees',()=>{
 const rack=item('studio:shoe-rack-black'),shoe=item('studio:shoes',2);
 const plan=proposeSmartPose(shoe,{x:rack.x,z:rack.z},[rack]);
 assert.equal(plan.mountSurface,2);close(plan.elevation,.6);
 for(const [index,height] of [.12,.36,.6].entries()){
  const pick={id:rack.id,ground:{x:9,z:9},surface:{x:rack.x+.2,z:rack.z,y:height}};
  const point=preferredPlacementPoint(pick,[rack],[]);
  const pose=proposeSmartPose(shoe,point,[rack]);
  assert.equal(pose.mountId,rack.id);assert.equal(pose.mountSurface,index);
  close(pose.elevation,height);close(pose.x,rack.x+.2);
  const preview=placementPreview(shoe,point,[rack]);
  assert.equal(preview.kind,'surface');assert.equal(preview.targetId,rack.id);
  assert.deepEqual(preview.pose,pose);close(preview.surface.y,height+.026);
  // Plan-view adjustment must retain the already selected lower shelf.
  const moved=proposeSmartPose({...shoe,...pose},{x:rack.x-.2,z:rack.z},[rack]);
  assert.equal(moved.mountSurface,index);close(moved.elevation,height);
 }
});

test('scaled and elevated shelf profiles clamp shoes to their physical usable surface',()=>{
 const rack=item('studio:shoe-rack-black',1,{w:1.3,d:.51,height:.99,elevation:.4,yaw:Math.PI/2});
 const profiles=furnitureSurfaces(rack),shoe=item('studio:shoes',2);
 assert.equal(profiles.length,3);close(profiles[0].y,.18);close(profiles[0].width,1.196);close(profiles[0].depth,.465);
 const pose=proposeSmartPose(shoe,{x:rack.x+.2,z:rack.z-.4,y:.58},[rack]);
 assert.equal(pose.mountSurface,0);close(pose.elevation,.58);close(pose.yaw,Math.PI/2);
 const localX=-(pose.z-rack.z),localZ=pose.x-rack.x;
 assert(Math.abs(localX)+shoe.w/2<=profiles[0].width/2+.001);
 assert(Math.abs(localZ)+shoe.d/2<=profiles[0].depth/2+.001);
 const oversized={...shoe,w:2};assert.equal(proposeSmartPose(oversized,{x:rack.x,z:rack.z},[rack]).mountId,null);
 assert.equal(proposeSmartPose(shoe,{x:rack.x,z:rack.z},[{...rack,deleted:true}]).mountId,null);
});

test('sliding turned shoes on an angled rack respects their actual footprint and shelf level',()=>{
 const rack=item('studio:shoe-rack-black',1,{yaw:Math.PI/2});
 const shoe=item('studio:shoes',2,{yaw:Math.PI,mountId:rack.id,mountSurface:1});
 const pose=proposeSmartPose(shoe,{x:rack.x,z:rack.z-.45},[rack]);
 assert.equal(pose.mountId,rack.id);assert.equal(pose.mountSurface,1);
 close(pose.yaw,shoe.yaw);close(pose.elevation,.36);
 // Rotated a quarter turn relative to the rack, the depth spans its width.
 close(rack.z-pose.z,(.92-shoe.d)/2,.001);
 const other={...rack,id:'other-rack',x:8,yaw:0};
 const moved=proposeSmartPose(shoe,{x:other.x,z:other.z},[rack,other]);
 assert.equal(moved.mountId,other.id);close(moved.yaw,other.yaw);
});

test('wall shoe shelf mounts on the wall and supports shoes at its actual upper face',()=>{
 const [shelf,shoe]=wallAssembly();
 assert.equal(inferPlacementRole(shelf),'wall');assert(shelf.wallMount);assert.equal(shelf.collision,'none');
 assert.equal(shoe.mountId,shelf.id);assert.equal(shoe.mountSurface,0);assert.equal(shoe.wallMount,null);
 close(shoe.elevation,shelf.elevation+.14);close(mountedElevation(shoe,shelf),shoe.elevation);
 assert.equal(proposeSmartPose(item('studio:shoes',13),{x:shelf.x,z:shelf.z},[{...shelf,wallRoll:.2}]).mountId,null);
 const moved=planFurnitureTranslation(shelf,[shelf,shoe],[wall],{x:.5,y:.2,z:0});
 close(moved[0].x,shelf.x+.5);close(moved[1].x,shoe.x+.5);
 close(moved[1].elevation,shoe.elevation+.2);assert.equal(moved[1].mountSurface,0);
 assert.equal(moved[0].wallMount.wallId,wall.id);assert.equal(moved[1].mountId,moved[0].id);
 assert.match(rotateFurniture(moved[0],moved,[wall],Math.PI/12),/ovanpå/,'loaded wall shelves cannot be tilted through their shoes');
});

test('moving, rotating and copying a rack carries every shoe and preserves its level and colour',()=>{
 const source=rackAssembly(),before=structuredClone(source),[rack]=source;
 const moved=planFurnitureTranslation(rack,source,[],{x:1,y:.2,z:-.75});
 assert.deepEqual(source,before,'movement planning must not mutate the saved assembly');
 for(let i=0;i<moved.length;i++){
  close(moved[i].x,source[i].x+1);close(moved[i].z,source[i].z-.75);
  close(moved[i].elevation,(source[i].elevation||0)+.2);
  assert.equal(moved[i].mountSurface,source[i].mountSurface);assert.equal(moved[i].color,source[i].color);
 }
 const rotatedBefore=structuredClone(moved);assert.equal(rotateFurniture(moved[0],moved,[],Math.PI/2),null);
 for(let i=1;i<moved.length;i++){
  close(moved[i].x,moved[0].x+rotatedBefore[i].z-rotatedBefore[0].z);
  close(moved[i].z,moved[0].z-(rotatedBefore[i].x-rotatedBefore[0].x));
  close(moved[i].yaw,Math.PI/2);close(moved[i].elevation,rotatedBefore[i].elevation);
  assert.equal(moved[i].mountId,moved[0].id);assert.equal(moved[i].mountSurface,i-1);
 }
 const copies=duplicateFurnitureAssembly(moved[0],moved,{x:5,z:5,yaw:0,elevation:0});
 assert.equal(copies.length,4);assert.equal(new Set([...moved,...copies].map(o=>o.id)).size,8);
 for(let i=1;i<copies.length;i++){
  assert.equal(copies[i].mountId,copies[0].id);assert.equal(copies[i].mountSurface,i-1);
  assert.equal(copies[i].color,source[i].color);close(copies[i].elevation,source[i].elevation);
 }
});

test('manual floor placement clears a shoe mount and shelf index together',()=>{
 const [rack,shoe]=rackAssembly();
 const detached={...shoe,...proposeSmartPose(shoe,{x:5,z:5},[rack],{mode:'floor'})};
 assert.equal(detached.mountId,null);assert.equal(detached.mountSurface,null);assert.equal(detached.elevation,0);
 const p=exportProject();p.furniture.added=[detached];assert.doesNotThrow(()=>parseProject(p));
});

test('legacy furniture ZIP preserves coloured shoes, each rack level and the wall-shelf attachment',()=>{
 const objects=[...rackAssembly(),...wallAssembly()];
 const patch=exportPatch(objects,[]),zip=makeZip([{name:'projekt.json',data:JSON.stringify(patch)}]);
 const doc=JSON.parse(new TextDecoder().decode(readZip(zip).get('projekt.json'))),restored=parsePatch(doc,[]);
 for(const original of objects){
  const found=restored.find(o=>o.id===original.id);assert(found);
  for(const key of ['assetId','color','mountId','mountSurface'])assert.equal(found[key]??null,original[key]??null);
  close(found.elevation||0,original.elevation||0,.0011);
  if(original.wallMount)assert.deepEqual(found.wallMount,original.wallMount);
 }
 const bad=structuredClone(doc);bad.added.find(o=>o.color).color='red';assert.throws(()=>parsePatch(bad,[]),/färg/);
 const invalid=structuredClone(doc);invalid.added.find(o=>o.mountId).mountSurface=31;assert.throws(()=>parsePatch(invalid,[]),/hyllplan/);
});

test('native project ZIP preserves colours and shelf attachments in both level modes without mutating Floor 5',async()=>{
 const originalBaseline=JSON.stringify(floor5Baseline().data);
 for(const mode of ['new-level','edit-floor5']){
  const project=exportProject({mode,projectId:'lvl-studio-lab-test',name:'Laboratory and entrance test'});
  project.architecture.added=[structuredClone(wall)];
  project.furniture.added=[...rackAssembly(),...wallAssembly()];
  project.assets.library=[...new Set(project.furniture.added.map(o=>o.assetId))];
  const restored=await parseProjectZip(await exportProjectZip(project));
  assert.deepEqual(restored.project,project);assert.equal(restored.files.size,0);
  const resolved=resolveProjectScene(restored.project).items;
  for(const source of project.furniture.added){const actual=resolved.find(o=>o.id===source.id);assert(actual);assert.equal(actual.color,source.color);assert.equal(actual.mountSurface,source.mountSurface);assert.equal(actual.mountId,source.mountId);}
  const legacyContainer=makeZip([{name:'projekt.json',data:JSON.stringify(project)}]);
  assert.deepEqual((await parseProjectZip(legacyContainer)).project,project);
  const invalid=structuredClone(project);invalid.furniture.added.find(o=>o.color).color='#12345g';assert.throws(()=>parseProject(invalid),/färg/);
  const orphan=structuredClone(project),shoe=orphan.furniture.added.find(o=>o.mountId);shoe.mountId=null;assert.throws(()=>parseProject(orphan),/hyllplan/);
 }
 assert.equal(JSON.stringify(floor5Baseline().data),originalBaseline);
});

test('the shared studio/FPS renderer places coloured shoes on every real shelf without recolouring another instance',async()=>{
 const objects=rackAssembly(),root=new T.Group();await buildProjectFurniture(objects,root);root.updateWorldMatrix(true,true);
 for(const shoe of objects.slice(1)){
  const holder=root.children.find(o=>o.userData.editId===shoe.id);assert(holder);
  const box=new T.Box3().setFromObject(holder);close(box.min.y,shoe.elevation);close(box.max.y,shoe.elevation+shoe.height);
  const upper=[];holder.traverse(o=>{if(o.isMesh&&o.material.name==='lab-upper')upper.push(o.material);});
  assert.equal(upper.length,1);assert.equal(upper[0].color.getHexString(),shoe.color.slice(1));
 }
 let firstUpper,secondUpper;root.children[1].traverse(o=>{if(o.material?.name==='lab-upper')firstUpper=o.material;});root.children[2].traverse(o=>{if(o.material?.name==='lab-upper')secondUpper=o.material;});
 firstUpper.color.set('#000000');assert.equal(secondUpper.color.getHexString(),objects[2].color.slice(1));
});

/** Independently compute each GLB scene box from its on-disk node transforms. */
function binaryBounds(json,yaw){
 const out=new T.Box3(),start=new T.Matrix4().makeRotationY(yaw||0);
 function visit(index,parent){
  const node=json.nodes[index],local=node.matrix?new T.Matrix4().fromArray(node.matrix):new T.Matrix4().compose(
   new T.Vector3().fromArray(node.translation||[0,0,0]),new T.Quaternion().fromArray(node.rotation||[0,0,0,1]),new T.Vector3().fromArray(node.scale||[1,1,1]));
  const world=new T.Matrix4().multiplyMatrices(parent,local);
  if(node.mesh!==undefined)for(const primitive of json.meshes[node.mesh].primitives){const accessor=json.accessors[primitive.attributes.POSITION];out.union(new T.Box3(new T.Vector3().fromArray(accessor.min),new T.Vector3().fromArray(accessor.max)).applyMatrix4(world));}
  for(const child of node.children||[])visit(child,world);
 }
 for(const node of json.scenes[json.scene||0].nodes)visit(node,start);
 return out;
}
test('uploaded office GLBs retain source bytes, embedded credits/textures and measured front-oriented dimensions',()=>{
 assert.equal(new Set(LIBRARY_ALL.map(e=>e.id)).size,LIBRARY_ALL.length);
 for(const entry of OFFICE_LIBRARY){
  const bytes=readFileSync(new URL(entry.url,new URL('../',import.meta.url))),inspection=inspectGLB(bytes);
  assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);assert(inspection.meshCount>0);
  assert(existsSync(new URL(entry.thumb,new URL('../',import.meta.url))));assert.deepEqual(LIBRARY_MAP.get(entry.id),entry);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert.match(json.asset.extras.license,/CC-BY-4\.0/);assert.equal(json.asset.extras.source,entry.source);
  assert((json.images||[]).every(image=>Number.isInteger(image.bufferView)&&!image.uri));assert(json.buffers.every(buffer=>!buffer.uri));
  const size=binaryBounds(json,entry.modelYaw).getSize(new T.Vector3()).toArray();size.forEach((value,index)=>close(value,entry.modelSize[index]));
  const count=json.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+json.accessors[p.indices??p.attributes.POSITION].count/3,0);assert.equal(count,entry.triangles);
  const object=item(entry.id,20),fit=fittedSize(object);assert.equal(modelFront(object),'+z');close(fit.h,entry.height);
  assert.equal(inferPlacementRole(object),'floor');
  const desk={id:'NY-BORD-999',kind:'table',x:2,z:3,yaw:0,w:3,d:2,height:.75};
  assert.equal(proposeSmartPose(object,{x:2,z:3},[desk]).mountId,null,'the floor printer/whiteboard must not jump onto a desk');
 }
 assert.equal(LAB_FURNITURE_MAP.get('studio:shoes').colorable,true);
});
