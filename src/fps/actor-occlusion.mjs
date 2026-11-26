import {Box3,Matrix4,Vector3} from '../../vendor/three/three.module.js';
import {furnitureVisibility} from './project-visibility.mjs';

// A skinned vertex is a positive weighted sum of bone-transformed vertices.
// The union of the per-bone boxes therefore contains the entire posed skin.
// Cache rest-space support boxes per shared geometry, never per animation pose.
const supports=new WeakMap(),point=new Vector3(),matrix=new Matrix4();
const boneBox=new Box3(),skinBox=new Box3(),partBox=new Box3();
function support(geometry){
 if(supports.has(geometry))return supports.get(geometry);
 const {position,skinIndex,skinWeight}=geometry.attributes;
 if(!position||!skinIndex||!skinWeight)return null;
 const boxes=new Map();let minSum=Infinity,maxSum=-Infinity;
 for(let i=0;i<position.count;i++){
  point.fromBufferAttribute(position,i);let sum=0;
  for(let j=0;j<4;j++){
   const weight=skinWeight.getComponent(i,j),id=skinIndex.getComponent(i,j);
   if(!Number.isFinite(weight)||weight<0){supports.set(geometry,null);return null;}
   sum+=weight;if(!weight)continue;
   if(!boxes.has(id))boxes.set(id,new Box3());boxes.get(id).expandByPoint(point);
  }
  minSum=Math.min(minSum,sum);maxSum=Math.max(maxSum,sum);
 }
 const result={boxes,minSum,maxSum};supports.set(geometry,result);return result;
}
/** Conservative bounds without scanning every deformed vertex each frame.
 * Unsupported geometry stays visible. This function never changes the pose. */
export function actorBounds(root,out){
 out.makeEmpty();let safe=true;
 root.updateMatrixWorld(true);
 root.traverseVisible(mesh=>{
  if(!safe)return;
  if(mesh.isSprite||mesh.isInstancedMesh||(mesh.morphTargetInfluences?.some(v=>v!==0))){safe=false;return;}
  if(!mesh.isMesh)return;
  if(mesh.isSkinnedMesh){
   const s=support(mesh.geometry);if(!s){safe=false;return;}
   skinBox.makeEmpty();
   for(const [id,box]of s.boxes){
    const bone=mesh.skeleton.bones[id],inverse=mesh.skeleton.boneInverses[id];
    if(!bone||!inverse){safe=false;return;}
    matrix.multiplyMatrices(bone.matrixWorld,inverse).multiply(mesh.bindMatrix);
    skinBox.union(boneBox.copy(box).applyMatrix4(matrix));
   }
   // Include zero-weight vertices, and retain non-unit weight sums exactly
   // as an interval before the final bind-inverse/world affine transform.
   if(s.minSum===0)skinBox.expandByPoint(point.set(0,0,0));
   for(const axis of ['x','y','z']){
    const a=skinBox.min[axis],b=skinBox.max[axis];
    skinBox.min[axis]=Math.min(a*s.minSum,a*s.maxSum,b*s.minSum,b*s.maxSum);
    skinBox.max[axis]=Math.max(a*s.minSum,a*s.maxSum,b*s.minSum,b*s.maxSum);
   }
   matrix.multiplyMatrices(mesh.matrixWorld,mesh.bindMatrixInverse);
   out.union(skinBox.applyMatrix4(matrix));
  }else{
   if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox?.();
   if(!mesh.geometry.boundingBox){safe=false;return;}
   out.union(partBox.copy(mesh.geometry.boundingBox).applyMatrix4(mesh.matrixWorld));
  }
 });
 // Tiny rounding pad; the wall test has its own additional aperture margin.
 out.expandByScalar(.002);
 return safe&&!out.isEmpty()&&[...out.min.toArray(),...out.max.toArray()].every(Number.isFinite);
}

/** Only neutral-daylight Floor 5 uses this: no actor shadows/reflection cameras.
 * Pose all actors as before, then suppress only proven hidden submissions. */
export class ActorOcclusion{
 constructor(world){this.visibility=furnitureVisibility(world);this.box=new Box3();this.enabled=true;this.hidden=0;}
 update(actors,camera){
  this.hidden=0;if(!this.enabled)return;
  this.visibility.update(camera.position);
  for(const model of actors){
   if(!model.visible)continue;
   const death=model.userData.avatar?.death;
   if(death?.occlusionBox)this.box.copy(death.occlusionBox);
   else{
    if(!actorBounds(model,this.box))continue;
    if(death?.settled)death.occlusionBox=this.box.clone();
   }
   const contact=model.userData.contact;
   if(contact?.visible){
    contact.updateWorldMatrix(true,false);
    if(!contact.geometry.boundingBox)contact.geometry.computeBoundingBox();
    this.box.union(partBox.copy(contact.geometry.boundingBox).applyMatrix4(contact.matrixWorld));
   }
   if(this.visibility.hidden(this.box)){
    model.visible=false;if(contact)contact.visible=false;this.hidden++;
   }
  }
 }
}
