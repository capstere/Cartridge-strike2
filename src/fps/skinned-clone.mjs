/** Clone nodes and skeletons, sharing immutable source geometry/textures. */
import * as T from '../../vendor/three/three.module.js';
export function cloneSkinned(source){
 const root=source.clone(true),a=[],b=[];source.traverse(n=>a.push(n));root.traverse(n=>b.push(n));const nodes=new Map(a.map((n,i)=>[n,b[i]]));
 for(const [original,copy]of nodes)if(original.isSkinnedMesh){
  if(original.skeleton.bones.some(b=>!nodes.has(b)))throw Error('Skelettet pekar utanför modellen.');
  copy.skeleton=new T.Skeleton(original.skeleton.bones.map(b=>nodes.get(b)),original.skeleton.boneInverses.map(m=>m.clone()));copy.bindMatrix.copy(original.bindMatrix);copy.bindMatrixInverse.copy(original.bindMatrixInverse);copy.frustumCulled=false;
 }
 return root;
}
