import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {actorBounds} from '../src/fps/actor-occlusion.mjs';
import {skinSampler} from '../src/fps/skin-sampler.mjs';

test('bone envelopes contain exact vertices with transforms, blended and non-unit weights',()=>{
 const root=new T.Group(),geometry=new T.BoxGeometry(1,2,.8),count=geometry.attributes.position.count;
 const indices=[],weights=[];
 for(let i=0;i<count;i++){indices.push(0,1,0,0);weights.push(.3,.69+(i%3)*.01,0,0);}
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(indices,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 const mesh=new T.SkinnedMesh(geometry,new T.MeshBasicMaterial()),a=new T.Bone(),b=new T.Bone();a.add(b);mesh.add(a);b.position.y=1;
 root.add(mesh);mesh.bind(new T.Skeleton([a,b]));root.position.set(20,.4,-30);root.rotation.y=.7;mesh.scale.set(1.1,.8,.6);
 const box=new T.Box3(),point=new T.Vector3(),sampled=new T.Vector3();
 for(let pose=0;pose<40;pose++){
  a.rotation.z=Math.sin(pose)*.9;b.rotation.x=Math.cos(pose)*1.2;b.position.y=1+pose*.02;
  assert(actorBounds(root,box));mesh.skeleton.update();
  const sample=skinSampler(mesh);
  for(let i=0;i<count;i++){
   assert.deepEqual(sample(i,sampled),mesh.getVertexPosition(i,point));
   assert(box.containsPoint(point.applyMatrix4(mesh.matrixWorld)));
  }
 }
});

test('unsupported animated geometry stays visible and invisible children do not enlarge bounds',()=>{
 const root=new T.Group(),mesh=new T.Mesh(new T.BoxGeometry(),new T.MeshBasicMaterial());root.add(mesh);
 const box=new T.Box3();assert(actorBounds(root,box));const copy=box.clone();
 const hidden=mesh.clone();hidden.position.x=1000;hidden.visible=false;root.add(hidden);assert(actorBounds(root,box));assert.deepEqual(box,copy);
 mesh.morphTargetInfluences=[1];assert.equal(actorBounds(root,box),false);
 mesh.morphTargetInfluences=[];root.add(new T.Sprite());assert.equal(actorBounds(root,box),false);
});
