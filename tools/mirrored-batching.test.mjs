import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {bakeRigidPart,compactModel} from '../src/fps/project-batches.mjs';

function triangle(indexed=true){
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,1,0,0,0,1,0],3));
 g.setAttribute('normal',new THREE.Float32BufferAttribute([0,0,1,0,0,1,0,0,1],3));
 g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,1,0,0,1],2));
 if(indexed)g.setIndex([0,1,2]);
 return g;
}
function normalZ(mesh){
 mesh.updateMatrixWorld(true);
 const g=mesh.geometry,p=g.getAttribute('position'),index=g.getIndex();
 const vertex=i=>new THREE.Vector3().fromBufferAttribute(p,index?index.getX(i):i).applyMatrix4(mesh.matrixWorld);
 const a=vertex(0),b=vertex(1),c=vertex(2);
 return b.sub(a).cross(c.sub(a)).normalize().z;
}
for(const indexed of [true,false]){
 test('baking '+(indexed?'indexed':'non-indexed')+' mirror preserves visible face and original geometry',()=>{
  const src=new THREE.Mesh(triangle(indexed),new THREE.MeshStandardMaterial());
  src.scale.x=-1;src.position.x=2;src.updateMatrixWorld(true);
  const originalIndex=src.geometry.getIndex()?.array.slice();
  const baked=new THREE.Mesh(bakeRigidPart(src),src.material);
  assert.ok(normalZ(baked)>.99);
  assert.equal(baked.geometry.getAttribute('position').count,3);
  assert.ok(baked.geometry.getAttribute('normal').getZ(0)>.99);
  if(indexed)assert.deepEqual([...src.geometry.getIndex().array],[...originalIndex]);
 });
}
test('mirrored rigid meshes merge into one model-space part',()=>{
 const material=new THREE.MeshStandardMaterial();
 const a=new THREE.Mesh(triangle(),material),b=new THREE.Mesh(triangle(),material);
 a.scale.x=b.scale.x=-1;a.position.x=1;b.position.x=3;
 a.updateMatrixWorld(true);b.updateMatrixWorld(true);
 const model=compactModel([a,b]);
 assert.equal(model.children.length,1);
 assert.equal(model.children[0].geometry.getIndex().count,6);
 assert.ok(model.children[0].matrixWorld.determinant()>0);
 assert.ok(normalZ(model.children[0])>.99);
});
test('single mirrored mesh creates positive model transform for instancing',()=>{
 const src=new THREE.Mesh(triangle(),new THREE.MeshStandardMaterial());
 src.scale.x=-1;src.updateMatrixWorld(true);
 const model=compactModel([src]);
 assert.equal(model.children.length,1);
 assert.ok(model.children[0].matrixWorld.determinant()>0);
 assert.ok(normalZ(model.children[0])>.99);
});
