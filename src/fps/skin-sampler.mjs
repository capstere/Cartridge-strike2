import {Matrix4,Vector3,Mesh,SkinnedMesh} from '../../vendor/three/three.module.js';

// CPU bounds need the same double-precision matrices as applyBoneTransform.
// skeleton.boneMatrices is Float32 and would subtly change fitted corpse poses.
const matrices=new WeakMap(),base=new Vector3(),influence=new Vector3();
export function skinSampler(mesh){
 if(!mesh.isSkinnedMesh||mesh.getVertexPosition!==SkinnedMesh.prototype.getVertexPosition||
    mesh.applyBoneTransform!==SkinnedMesh.prototype.applyBoneTransform)return (i,out)=>mesh.getVertexPosition(i,out);
 const skeleton=mesh.skeleton;
 let bones=matrices.get(skeleton);
 if(!bones||bones.length!==skeleton.bones.length){bones=skeleton.bones.map(()=>new Matrix4());matrices.set(skeleton,bones);}
 for(let i=0;i<bones.length;i++)bones[i].multiplyMatrices(skeleton.bones[i].matrixWorld,skeleton.boneInverses[i]);
 const {skinIndex,skinWeight}=mesh.geometry.attributes;
 // Used synchronously for one pose. The vertex/morph/bind operations and their
 // order match Three.js; only identical bone matrix products move out of the loop.
 return (i,out)=>{
  Mesh.prototype.getVertexPosition.call(mesh,i,out);
  base.copy(out).applyMatrix4(mesh.bindMatrix);out.set(0,0,0);
  for(let j=0;j<4;j++){
   const weight=skinWeight.getComponent(i,j);
   if(weight!==0)out.addScaledVector(influence.copy(base).applyMatrix4(bones[skinIndex.getComponent(i,j)]),weight);
  }
  return out.applyMatrix4(mesh.bindMatrixInverse);
 };
}
