import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import * as T from '../../vendor/three/three.module.js';
import {cartridgeGeometry,CartridgeLOD} from '../../src/fps/cartridge-v11.mjs';
import {FPS_LIBRARY,FPS_MAP} from './fps-catalog.mjs';
import {populateFpsFurniture} from './fps-mesh.mjs';
import {inspectGLB} from './glb-utils.mjs';

const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);
function model(id,overrides={}){
 const e=FPS_MAP.get(id),root=new T.Group();
 const item={id:'NY-OBJ-0001',assetId:id,w:e.width,d:e.depth,height:e.height,...overrides};
 assert.equal(populateFpsFurniture(item,root),true);root.updateMatrixWorld(true);
 const meshes=[],lods=[];root.traverse(o=>{if(o.isMesh)meshes.push(o);if(o.isLOD)lods.push(o);});
 return {item,root,meshes,lods};
}
function triangles(group){let count=0;group.traverse(o=>{if(o.isMesh)count+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});return count;}

test('every procedural FPS prop has the requested centered floor bounds, valid attributes and selectable meshes',()=>{
 for(const entry of FPS_LIBRARY.filter(e=>!e.url))for(const [w,h,d]of [[1,1,1],[1.3,.8,1.1]]){
  const {root,item,meshes}=model(entry.id,{w:entry.width*w,height:entry.height*h,d:entry.depth*d});
  const bounds=new T.Box3().setFromObject(root),size=bounds.getSize(new T.Vector3());
  close(bounds.min.y,0);close(bounds.min.x+bounds.max.x,0);close(bounds.min.z+bounds.max.z,0);
  close(size.x,item.w);close(size.y,item.height);close(size.z,item.d);
  assert(meshes.length>0&&meshes.length<=10,entry.id+' uses bounded merged material batches');
  for(const mesh of meshes){
   assert.equal(mesh.userData.editId,item.id);
   for(const attribute of ['position','normal'])assert([...mesh.geometry.attributes[attribute].array].every(Number.isFinite));
  }
  let lights=0;root.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0,'static furniture does not add gameplay lighting');
 }
});

test('FPS copies share immutable buffers but retain independent selectable hierarchies and transforms',()=>{
 for(const entry of FPS_LIBRARY.filter(e=>!e.url)){
  const a=model(entry.id),b=model(entry.id,{id:'NY-OBJ-0002'});
  assert.equal(a.meshes.length,b.meshes.length);
  a.meshes.forEach((mesh,i)=>{
   assert.notEqual(mesh,b.meshes[i]);assert.notEqual(mesh.userData,b.meshes[i].userData);
   assert.equal(mesh.geometry,b.meshes[i].geometry);assert.equal(mesh.material,b.meshes[i].material);
   assert(!mesh.userData.studioGeometry&&!mesh.userData.ghostGeometry);
   assert(!mesh.material.userData.studioOwned,'removing one object must not dispose shared game materials');
   assert.equal(b.meshes[i].userData.editId,'NY-OBJ-0002');
  });
  const before=new T.Box3().setFromObject(b.root);a.root.position.set(17,3,-5);a.root.rotation.y=.72;a.root.updateMatrixWorld(true);
  assert.deepEqual(new T.Box3().setFromObject(b.root),before);
 }
});

test('closed and open cartridges reuse the actual game geometry at every detail level',()=>{
 for(const open of [false,true]){
  const {lods}=model(open?'fps:cartridge-open':'fps:cartridge');assert.equal(lods.length,1);assert(lods[0] instanceof CartridgeLOD);
  for(const [index,detail]of ['near','mid','far'].entries()){
   const source=cartridgeGeometry({detail,open}),meshes=lods[0].levels[index].object.children;
   assert.equal(meshes.length,source.parts.length);assert.equal(triangles(lods[0].levels[index].object),source.triangles);
   meshes.forEach((mesh,i)=>{assert.equal(mesh.geometry,source.parts[i].geometry);assert.equal(mesh.material,source.parts[i].material);});
  }
 }
});

test('single and six-cartridge props retain screen-size LOD after placement transforms',()=>{
 for(const id of ['fps:cartridge','fps:cartridge-rack']){
  const {root,lods:[lod]}=model(id),camera=new T.PerspectiveCamera(60,1,.01,100);
  camera.userData.cartridgeViewportHeight=1080;root.position.set(33,2,-12);root.updateMatrixWorld(true);
  assert.equal(lod.samples.length,id.endsWith('rack')?6:1);
  for(const [distance,detail]of [[.25,'near'],[2,'mid'],[8,'far']]){
   camera.position.set(33,2.04,-12+distance);camera.lookAt(33,2.04,-12);camera.updateMatrixWorld(true);lod.update(camera);
   assert.equal(lod.userData.activeDetail,detail);assert.equal(lod.levels.filter(l=>l.object.visible).length,1);
  }
  assert(triangles(lod.levels[2].object)<4000,'distant small props use the cheap existing silhouette');
  if(id.endsWith('rack'))for(const [index,detail]of ['near','mid','far'].entries())assert.equal(triangles(lod.levels[index].object),6*cartridgeGeometry({detail}).triangles);
 }
});

test('BINDER reconstruction has glass and a visible chamber instead of an opaque proxy door',()=>{
 const {root}=model('fps:binder-vacuum-oven');
 const hits=new T.Raycaster(new T.Vector3(0,.38,2),new T.Vector3(0,0,-1)).intersectObject(root,true);
 assert(hits[0].object.material.transparent);assert(hits[0].object.material.opacity<.25);assert.equal(hits[0].object.material.depthWrite,false);
 const opaque=hits.find(h=>!h.object.material.transparent);assert(opaque&&opaque.point.z<-.2,'the ray reaches the chamber back through the glass');
 const shelf=new T.Raycaster(new T.Vector3(0,.4,0),new T.Vector3(0,-1,0)).intersectObject(root,true)[0];
 assert(shelf&&shelf.point.y>.35&&shelf.point.y<.37,'the chamber contains an actual shelf');
 assert.match(FPS_MAP.get('fps:binder-vacuum-oven').source,/Ny lågpolymodell/);
});

test('cart shelves and the free lab worktop coincide with real surfaces after floor rebasing',()=>{
 for(const entry of FPS_LIBRARY.filter(e=>e.supportSurfaces)){
  const {root}=model(entry.id);
  for(const surface of entry.supportSurfaces){
   for(const [dx,dz]of [[0,0],[-.45,-.45],[.45,.45]]){
    const ray=new T.Raycaster(new T.Vector3((surface.x||0)+surface.width*dx,surface.y+.02,(surface.z||0)+surface.depth*dz),new T.Vector3(0,-1,0),0,.04),hit=ray.intersectObject(root,true)[0];
    assert(hit,'the advertised support has a physical shelf');close(hit.point.y,surface.y);
   }
   assert(surface.width<entry.width&&surface.depth<entry.depth);
  }
 }
});

test('FPS GLBs are self-contained local files and the recovered drying oven retains its attributed bytes',()=>{
 assert.equal(new Set(FPS_LIBRARY.map(e=>e.id)).size,FPS_LIBRARY.length);
 for(const entry of FPS_LIBRARY){assert.equal(entry.pack,'fps');assert(existsSync(new URL(entry.thumb,new URL('../',import.meta.url))));}
 for(const entry of FPS_LIBRARY.filter(e=>e.url)){
  const bytes=readFileSync(new URL(entry.url,new URL('../',import.meta.url)));assert(inspectGLB(bytes).meshCount>0);
  const json=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)));
  assert(json.buffers.every(buffer=>!buffer.uri));assert((json.images||[]).every(image=>Number.isInteger(image.bufferView)&&!image.uri));
  if(entry.sha256){
   assert.equal(bytes.length,entry.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),entry.sha256);
   const count=json.meshes.flatMap(m=>m.primitives).reduce((sum,p)=>sum+json.accessors[p.indices??p.attributes.POSITION].count/3,0);assert.equal(count,entry.triangles);
   const credits=readFileSync(new URL('../../docs/onboard-model-attribution.md',import.meta.url),'utf8');assert(credits.includes(entry.sha256));assert(credits.includes(entry.attribution));
  }
 }
});

test('FPS adapter leaves GLB loading and unrelated catalogues to their own renderer',()=>{
 for(const assetId of ['fps:wall-vent','studio:shoes','missing']){
  const root=new T.Group();assert.equal(populateFpsFurniture({assetId},root),false);assert.equal(root.children.length,0);
 }
});
