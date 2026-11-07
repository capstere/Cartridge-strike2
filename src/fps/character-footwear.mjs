/** Low-profile, continuous footwear. No stacked boxes, shafts or floating laces.
 * Coordinates are the original operator bind space; skeleton and motions unchanged.
 */
import * as T from '../../vendor/three/three.module.js';
const outline=[[-.043,-.105],[-.057,-.078],[-.059,-.015],[-.063,.045],[-.058,.105],[-.036,.135],[0,.143],[.036,.135],[.058,.105],[.063,.045],[.059,-.015],[.057,-.078],[.043,-.105],[0,-.112]];
function loft(rings){
 const vertices=[],uv=[],indices=[],n=outline.length;
 for(let r=0;r<rings.length;r++)for(let i=0;i<n;i++){
  const [sx,sz,y,zshift]=rings[r],[x,z]=outline[i];vertices.push(x*sx,y,z*sz+zshift);uv.push(i/n,r/(rings.length-1));
 }
 for(let r=0;r<rings.length-1;r++)for(let i=0;i<n;i++){
  const a=r*n+i,b=r*n+(i+1)%n,c=a+n,d=b+n;indices.push(a,c,b,b,c,d);
 }
 for(const [r,flip]of [[0,true],[rings.length-1,false]]){
  const start=vertices.length/3,ys=rings[r][2];vertices.push(0,ys,rings[r][3]);uv.push(.5,.5);
  for(let i=0;i<n;i++){const a=r*n+i,b=r*n+(i+1)%n;indices.push(...(flip?[start,b,a]:[start,a,b]));}
 }
 for(let i=0;i<indices.length;i+=3)[indices[i+1],indices[i+2]]=[indices[i+2],indices[i+1]];
 const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setAttribute('uv',new T.Float32BufferAttribute(uv,2));g.setIndex(indices);g.computeVertexNormals();g.computeBoundingBox();return g;
}
export function makeFootwear(){
 // Rounded toe-box narrows into a modest ankle collar under the trouser cuff.
 return {
 sole:loft([[.96,.99,.008,.026],[1,1,.017,.026],[1,1,.032,.026],[.96,.98,.037,.026]]),
 upper:loft([[.96,.98,.033,.026],[.94,.96,.057,.026],[.89,.85,.079,.018],[.72,.52,.105,-.009],[.69,.40,.143,-.023],[.69,.40,.184,-.023]])
 };
}
export function isLegacyFootwear(mesh){return mesh.userData?.legacyFootwear===true||mesh.material?.name==='boots-leather';}

/** Fit the approved shoe shape to the real bind-pose ankle, not world Z=0.
 * The sole remains a rigid foot child (the engine's support anchor). The upper
 * blends foot -> calf so its collar stays inside the trousers as the ankle bends.
 * Call before any animation or non-uniform authoring scale is applied.
 */
export function makeFittedFootwear({root,bones,meshes,side,soleMaterial,upperMaterial}){
 const foot=bones.get('foot_'+side),calf=bones.get('calf_'+side);
 const trousers=meshes.find(m=>m.isSkinnedMesh&&m.material?.name==='trousers-fabric');
 const original=meshes.find(m=>m.isSkinnedMesh&&m.material?.name==='boots-leather');
 if(!foot||!calf||!trousers||!original)throw Error('Skons fotben eller byxslut saknas.');
 root.updateWorldMatrix(true,true);
 const inverse=new T.Matrix4().copy(root.matrixWorld).invert(),ankle=foot.getWorldPosition(new T.Vector3()).applyMatrix4(inverse);
 const rootSpace=mesh=>new T.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld);
 const points=[],v=new T.Vector3(),transform=rootSpace(trousers),p=trousers.geometry.attributes.position;
 for(let i=0;i<p.count;i++){
  v.fromBufferAttribute(p,i).applyMatrix4(transform);
  if(Math.sign(v.x)===Math.sign(ankle.x)&&v.y<ankle.y+.25)points.push(v.clone());
 }
 if(!points.length)throw Error('Kunde inte mäta byxans ankelöppning.');
 const low=Math.min(...points.map(p=>p.y)),cuff=new T.Box3();
 for(const point of points)if(point.y<=low+.035)cuff.expandByPoint(point);
 let floor=Infinity;const oldPosition=original.geometry.attributes.position,oldTransform=rootSpace(original);
 for(let i=0;i<oldPosition.count;i++){
  v.fromBufferAttribute(oldPosition,i).applyMatrix4(oldTransform);
  if(Math.sign(v.x)===Math.sign(ankle.x))floor=Math.min(floor,v.y);
 }
 const center=cuff.getCenter(new T.Vector3()),size=cuff.getSize(new T.Vector3());
 if(!Number.isFinite(floor)||size.x<=0||size.z<=0)throw Error('Ogiltiga fotmått.');
 // Measure the real trouser cross-section; a bounding-box ellipse can protrude
 // through the narrower female cuff even when its centre looks correct.
 const contour=Array.from({length:p.count},(_,i)=>new T.Vector3().fromBufferAttribute(p,i).applyMatrix4(transform));
 const triangles=trousers.geometry.index?.array||contour.map((_,i)=>i),topCenter=center.clone();topCenter.y=cuff.max.y+.020;
 let collar;
 // The original material split leaves a slanted cuff, especially on the female
 // rig. Find the first complete section above it instead of using a guessed height.
 for(let attempt=0;attempt<10&&!collar;attempt++,topCenter.y+=.010){
  const ring=outline.map(([x,z])=>{
   const direction=new T.Vector3(x/.063,0,(z-.0155)/.1275).normalize(),ray=new T.Ray(topCenter,direction);let distance=Infinity;
   for(let i=0;i<triangles.length;i+=3){const hit=ray.intersectTriangle(contour[triangles[i]],contour[triangles[i+1]],contour[triangles[i+2]],false,new T.Vector3());if(hit)distance=Math.min(distance,hit.distanceTo(topCenter));}
   return Number.isFinite(distance)&&distance<=.2?topCenter.clone().addScaledVector(direction,distance*.86):null;
  });
  if(ring.every(Boolean)){collar=ring;break;}
 }
 if(!collar)throw Error('Skons krage kunde inte passas in under byxslutet.');
 const origin=new T.Vector3(ankle.x,floor-.008,ankle.z+.023),geometry=makeFootwear();
 const sole=new T.Mesh(geometry.sole,soleMaterial);sole.name='boot-sole-'+side;
 sole.position.copy(origin);root.add(sole);root.updateWorldMatrix(true,true);foot.attach(sole);
 const upperGeometry=geometry.upper,positions=upperGeometry.attributes.position,joints=[],weights=[];
 const footIndex=trousers.skeleton.bones.indexOf(foot),calfIndex=trousers.skeleton.bones.indexOf(calf);
 if(footIndex<0||calfIndex<0)throw Error('Skons ben saknas i källskelettet.');
 for(let i=0;i<positions.count;i++){
  const y=positions.getY(i),t=T.MathUtils.smoothstep(y,.079,.184),blend=T.MathUtils.smoothstep(y,.057,.143);
  const top=i<outline.length*6?collar[i%outline.length]:topCenter;
  // Top two rings follow the calf; their small overlap is hidden by the cuff.
  positions.setXYZ(i,T.MathUtils.lerp(positions.getX(i)+origin.x,top.x,t),
   y+origin.y+(top.y-(.184+origin.y))*t,
   T.MathUtils.lerp(positions.getZ(i)+origin.z,top.z,t));
  joints.push(footIndex,calfIndex,0,0);weights.push(1-blend,blend,0,0);
 }
 upperGeometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));
 upperGeometry.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));
 positions.needsUpdate=true;upperGeometry.computeVertexNormals();upperGeometry.computeBoundingBox();upperGeometry.computeBoundingSphere();
 const upper=new T.SkinnedMesh(upperGeometry,upperMaterial);upper.name='shoe-upper-'+side;root.add(upper);
 upper.bind(trousers.skeleton,root.matrixWorld);upper.frustumCulled=false;
 for(const mesh of [sole,upper]){mesh.userData.footwear='ankle-fitted-v2';mesh.castShadow=false;mesh.receiveShadow=true;}
 return {sole,upper};
}
