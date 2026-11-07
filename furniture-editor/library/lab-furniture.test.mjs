import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three/three.module.js';
import {LAB_FURNITURE_LIBRARY,LAB_FURNITURE_MAP} from './lab-furniture.mjs';
import {populateLabFurniture} from './lab-furniture-mesh.mjs';

function model(id,overrides={}){
 const e=LAB_FURNITURE_MAP.get(id),root=new T.Group();
 const item={id:'NY-OBJ-0001',assetId:id,w:e.width,d:e.depth,height:e.height,...overrides};
 assert.equal(populateLabFurniture(item,root),true);root.updateMatrixWorld(true);
 return {item,root,meshes:root.children[0].children};
}
const close=(a,b)=>assert(Math.abs(a-b)<1e-6,`${a} should equal ${b}`);

test('lab furniture has exact centered, grounded dimensions and bounded rendering cost',()=>{
 for(const entry of LAB_FURNITURE_LIBRARY){
  for(const scale of [1,1.5]){
   const {root,item,meshes}=model(entry.id,{w:entry.width*scale,d:entry.depth*.8,height:entry.height*1.1});
   const box=new T.Box3().setFromObject(root),size=box.getSize(new T.Vector3());
   close(box.min.y,0);close(box.min.x+box.max.x,0);close(box.min.z+box.max.z,0);
   close(size.x,item.w);close(size.z,item.d);close(size.y,item.height);
   assert(meshes.length<=8,'no more than eight merged material batches');
   let triangles=0;
   for(const mesh of meshes){
    triangles+=mesh.geometry.attributes.position.count/3;
    assert(mesh.userData.studioGeometry&&mesh.material.userData.studioOwned);
    assert.equal(mesh.userData.editId,item.id);
    assert([...mesh.geometry.attributes.position.array].every(Number.isFinite));
    assert([...mesh.geometry.attributes.normal.array].every(Number.isFinite));
   }
   assert(triangles<2500,'each model stays below 2,500 triangles');
   let lights=0;root.traverse(o=>{if(o.isLight)lights++;});assert.equal(lights,0);
  }
 }
});

test('biosafety cabinet has an open lower working chamber, visible glass and an open stand',()=>{
 const {root}=model('studio:biosafety-cabinet');
 const ray=new T.Raycaster(new T.Vector3(0,1.08,-2),new T.Vector3(0,0,1));
 const inside=ray.intersectObject(root,true);
 assert(inside.length>0);assert(inside[0].point.z>.30,'lower opening exposes the steel back wall');
 ray.ray.origin.y=1.45;
 const sash=ray.intersectObject(root,true)[0];
 assert(sash.object.material.transparent&&sash.object.material.opacity<.2);
 assert.equal(sash.object.material.depthWrite,false);
 ray.ray.origin.y=.62;
 assert.equal(ray.intersectObject(root,true).length,0,'stand stays open below the work surface');
});

test('rack levels and wall shelf support surfaces coincide with their actual geometry',()=>{
 for(const id of ['studio:shoe-rack-black','studio:shoe-shelf-white','studio:biosafety-cabinet']){
  const entry=LAB_FURNITURE_MAP.get(id),{root}=model(id);
  for(const surface of entry.supportSurfaces){
   const ray=new T.Raycaster(new T.Vector3(surface.x,surface.y+.015,surface.z),new T.Vector3(0,-1,0),0,.03);
   const hit=ray.intersectObject(root,true)[0];assert(hit,`${id} has a physical shelf at ${surface.y}`);
   close(hit.point.y,surface.y);
   assert(surface.width<=entry.width&&surface.depth<=entry.depth);
  }
 }
});

test('shoe color changes only the uppers and every instance owns disposable resources',()=>{
 const a=model('studio:shoes',{color:'#c23864'}),b=model('studio:shoes',{color:'#2257a8'});
 const upperA=a.meshes.find(m=>m.material.name==='lab-upper');
 const upperB=b.meshes.find(m=>m.material.name==='lab-upper');
 assert.equal(upperA.material.color.getHexString(),'c23864');assert.equal(upperB.material.color.getHexString(),'2257a8');
 a.meshes.forEach((mesh,i)=>{
  assert.notEqual(mesh.geometry,b.meshes[i].geometry);
  assert.notEqual(mesh.geometry.attributes.position.array,b.meshes[i].geometry.attributes.position.array);
  assert.notEqual(mesh.material,b.meshes[i].material);
  if(mesh!==upperA)assert.equal(mesh.material.color.getHexString(),b.meshes[i].material.color.getHexString());
  mesh.geometry.dispose();mesh.material.dispose();
 });
 upperA.material.color.set('#ffffff');assert.equal(upperB.material.color.getHexString(),'2257a8');
 const fallback=model('studio:shoes',{color:'url(unsafe)'}).meshes.find(m=>m.material.name==='lab-upper');
 assert.equal(fallback.material.color.getHexString(),'f2f3ef');
});

test('shoe upper faces point outward at the toe and side, with no culled gaps',()=>{
 const {root}=model('studio:shoes');
 const front=new T.Raycaster(new T.Vector3(.071,.07,-1),new T.Vector3(0,0,1)).intersectObject(root,true)[0];
 assert(front&&front.point.z<-.07&&front.object.material.name==='lab-upper');
 const side=new T.Raycaster(new T.Vector3(1,.06,0),new T.Vector3(-1,0,0)).intersectObject(root,true)[0];
 assert(side&&side.point.x>.10&&side.object.material.name==='lab-upper');
});

test('lab renderer ignores unrelated presets without adding fallback geometry',()=>{
 const root=new T.Group();assert.equal(populateLabFurniture({assetId:'studio:desk-120'},root),false);
 assert.equal(root.children.length,0);
});
