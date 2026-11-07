/** Independent geometric regression: real posed cuff containment and sole seam. */
import * as T from '../vendor/three/three.module.js';
export function footwearMetrics(root){
 root.updateWorldMatrix(true,false);root.updateMatrixWorld(true);root.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});
 let pants;root.traverse(m=>{if(m.visible&&m.isSkinnedMesh&&m.material?.name==='trousers-fabric')pants=m;});
 if(!pants)throw Error('No trousers');const sides=[];
 for(const side of ['l','r']){
  const calf=root.getObjectByName('calf_'+side),foot=root.getObjectByName('foot_'+side),upper=root.getObjectByName('shoe-upper-'+side),sole=root.getObjectByName('boot-sole-'+side);
  if(!calf||!foot||!upper?.isSkinnedMesh||!sole||sole.isSkinnedMesh)throw Error('Foot/calf skinned upper or rigid sole missing');
  const inv=new T.Matrix4().copy(calf.matrixWorld).invert();
  const points=Array.from({length:pants.geometry.attributes.position.count},(_,i)=>pants.getVertexPosition(i,new T.Vector3()).applyMatrix4(pants.matrixWorld).applyMatrix4(inv));
  const indices=pants.geometry.index?.array||points.map((_,i)=>i),uv=upper.geometry.attributes.uv,skin=upper.geometry.attributes.skinWeight,joints=upper.geometry.attributes.skinIndex;
  let probes=0,misses=0,maxClearance=0,topCalfWeight=1;
  for(let i=0;i<uv.count;i++)if(uv.getY(i)>.999){
   const point=upper.getVertexPosition(i,new T.Vector3()).applyMatrix4(upper.matrixWorld).applyMatrix4(inv),direction=new T.Vector3(point.x,0,point.z).normalize(),ray=new T.Ray(point,direction);
   let nearest=Infinity,w=0;for(let j=0;j<4;j++)if(upper.skeleton.bones[joints.getComponent(i,j)]===calf)w+=skin.getComponent(i,j);topCalfWeight=Math.min(topCalfWeight,w);
   for(let k=0;k<indices.length;k+=3){const hit=ray.intersectTriangle(points[indices[k]],points[indices[k+1]],points[indices[k+2]],false,new T.Vector3());if(hit)nearest=Math.min(nearest,hit.distanceTo(point));}
   probes++;if(!Number.isFinite(nearest)||nearest>.05)misses++;else maxClearance=Math.max(maxClearance,nearest);
  }
  // Lower upper-ring vertices must remain inside the rigid sole's top overlap.
  const soleInv=new T.Matrix4().copy(sole.matrixWorld).invert(),box=sole.geometry.boundingBox||new T.Box3().setFromBufferAttribute(sole.geometry.attributes.position);let soleMisses=0,lowerFootWeight=1;
  for(let i=0;i<uv.count;i++)if(uv.getY(i)<.001){
   const point=upper.getVertexPosition(i,new T.Vector3()).applyMatrix4(upper.matrixWorld).applyMatrix4(soleInv);let w=0;
   for(let j=0;j<4;j++)if(upper.skeleton.bones[joints.getComponent(i,j)]===foot)w+=skin.getComponent(i,j);lowerFootWeight=Math.min(lowerFootWeight,w);
   if(point.y<box.min.y-1e-5||point.y>box.max.y+1e-5||point.x<box.min.x-1e-5||point.x>box.max.x+1e-5||point.z<box.min.z-1e-5||point.z>box.max.z+1e-5)soleMisses++;
  }
  sides.push({side,probes,misses,maxClearance,topCalfWeight,soleMisses,lowerFootWeight});
 }
 return {sides,belt:!!root.getObjectByName('duty-belt'),buckle:!!root.getObjectByName('belt-buckle')};
}
