/** One deliberately authored short cut and a deforming jacket, in bind-space metres.
 * No game assets are changed. All generated geometry is included in PREVIEW.glb.
 */
import * as T from '../vendor/three/three.module.js';
const clamp=T.MathUtils.clamp,TAU=Math.PI*2;

export function scalpLine(a,p){
 const phi=Math.atan2(p.x,p.z-a.centerZ),front=Math.max(0,Math.cos(phi)),back=Math.max(0,-Math.cos(phi));
 // Clear the ear tops at the temples, lower the nape, and soften the frontal M.
 const line=a.top-.084+.010*front+.10*front**4-.065*back+.008*Math.exp(-(((Math.abs(phi)-.65)/.30)**2));
 const ear=clamp((Math.abs(p.x)/a.width-.34)/.08,0,1);
 return Math.max(line,a.top-.15+.085*ear);
}
function lift(a,p,n){
 const crown=clamp((p.y-a.top+.13)/.13,0,1),front=clamp((p.z-a.centerZ+.01)/.09,0,1);
 const crest=Math.exp(-(((p.x+.023)/.065)**2))*front*crown;
 return p.clone().addScaledVector(n,.0025+crown*(.006+.018*front)).add(new T.Vector3(.010*crown*crown,.030*crest,0));
}
export function makeStudioHair(a,color,authored=null,restScalp=null){
 const group=new T.Group(),source=a.skin.geometry,pos=source.attributes.position,norm=source.attributes.normal,ix=source.index;
 const vertices=[],normals=[],colors=[],tint=new T.Color(color);
 // Clip the actual scalp triangles; interpolation keeps hair attached to sculpted heads.
 for(let k=0;k<(ix?ix.count:pos.count);k+=3){
  const polygon=[0,1,2].map(j=>{const i=ix?ix.getX(k+j):k+j,p=new T.Vector3().fromBufferAttribute(pos,i),n=new T.Vector3().fromBufferAttribute(norm,i);return {p,n,d:p.y-scalpLine(a,p)};});
  const clipped=[];
  for(let j=0;j<3;j++){const v=polygon[j],w=polygon[(j+1)%3];if(v.d>=0)clipped.push(v);if((v.d>=0)!==(w.d>=0)){const t=v.d/(v.d-w.d);clipped.push({p:v.p.clone().lerp(w.p,t),n:v.n.clone().lerp(w.n,t).normalize()});}}
  for(let j=1;j+1<clipped.length;j++)for(const v of [clipped[0],clipped[j],clipped[j+1]]){
   const q=authored?v.p.clone().addScaledVector(v.n,.002):lift(a,v.p,v.n);vertices.push(...q.toArray());normals.push(...v.n.toArray());
   const shade=.91+.09*clamp((v.p.y-a.top+.12)/.12,0,1);colors.push(shade,shade,shade);
  }
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setAttribute('normal',new T.Float32BufferAttribute(normals,3));geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));
 const material=new T.MeshStandardMaterial({color:tint,roughness:.74,vertexColors:true});material.name='studio-hair-mass';
 const cap=new T.Mesh(geometry,material);cap.name='studio-swept-scalp';group.add(cap);const surfaces=[cap];
 if(authored&&restScalp){
  // Retain the source artist's asymmetric swept volumes, then tighten their
  // silhouette and transfer scalp edits.
  const shaped=authored.geometry.clone(),p=shaped.attributes.position,scalp=a.skin.geometry.attributes.position;
  const from=authored.scalpBounds||a,sx=a.width/from.width,sy=a.depth/from.depth,sz=sy;
  const normalMatrix=new T.Matrix3().getNormalMatrix(new T.Matrix4().makeScale(sx,sy,sz));shaped.attributes.normal.applyNormalMatrix(normalMatrix);
  for(let i=0;i<p.count;i++){
   const point=new T.Vector3(p.getX(i)*sx,a.top+(p.getY(i)-from.top)*sy,a.centerZ+(p.getZ(i)-from.centerZ)*sz);let nearest=0,distance=Infinity;
   for(let j=0;j<restScalp.length/3;j++){const d=(point.x-restScalp[j*3])**2+(point.y-restScalp[j*3+1])**2+(point.z-restScalp[j*3+2])**2;if(d<distance){distance=d;nearest=j;}}
   const old=new T.Vector3().fromArray(restScalp,nearest*3),now=new T.Vector3().fromBufferAttribute(scalp,nearest),q=point.clone().sub(old).multiplyScalar(.82).add(now);p.setXYZ(i,q.x,q.y,q.z);
  }
  const volumeMaterial=material.clone();volumeMaterial.vertexColors=false;const volume=new T.Mesh(shaped,volumeMaterial);volume.name='studio-swept-volume';group.add(volume);surfaces.push(volume);
 }
 group.updateMatrixWorld(true);
 // Broad, shallow tapered locks carry the comb direction without wiry tubes or
 // alpha gaps. Project every guide onto the fitted mass rather than an ellipsoid.
 const ray=new T.Raycaster(),center=new T.Vector3(0,a.top-.105,a.centerZ),v=[],ids=[],cs=[];
 for(let strand=0;strand<88;strand++){
  const phi=(strand+.5)/88*TAU,points=[],across=strand<56,side=strand<43?1:-1,z=-.095+(strand%43)/42*.166;
  for(let step=0;step<=32;step++){
   const t=step/32,theta=.10+t*2.1,angle=phi+.38*Math.sin(t*Math.PI/2),d=across?new T.Vector3(-.025+side*.14*t,.105-.125*t*t,z-.025*Math.sin(Math.PI*t)).normalize():new T.Vector3(Math.sin(theta)*Math.sin(angle),Math.cos(theta),Math.sin(theta)*Math.cos(angle));
   ray.set(center.clone().addScaledVector(d,.45),d.clone().negate());const hit=ray.intersectObjects(surfaces)[0];
   if(hit)points.push({p:hit.point,n:hit.normal||hit.face.normal});else if(points.length>2)break;
  }
  if(points.length<4)continue;
  const start=v.length/3;
  for(let j=0;j<points.length;j++){
   const t=j/(points.length-1),{p,n}=points[j],flow=points[Math.min(j+1,points.length-1)].p.clone().sub(points[Math.max(0,j-1)].p).normalize(),side=new T.Vector3().crossVectors(n,flow).normalize();
   const width=.0016*Math.sin(Math.PI*(.06+.92*t))**.55;
   // Three vertices across a lock create a soft crest, tapering flush at its tip.
   for(const s of [-1,0,1]){const q=p.clone().addScaledVector(side,s*width).addScaledVector(n,.0001+(s===0?.0005:0)*Math.sin(Math.PI*t));v.push(...q.toArray());const shade=.96+.07*((strand*17)%13)/13;cs.push(shade,shade,shade);}
   if(j<points.length-1){const i=start+j*3;for(let k=0;k<2;k++)ids.push(i+k,i+k+1,i+k+3,i+k+1,i+k+4,i+k+3);}
  }
 }
 const locks=new T.BufferGeometry();locks.setAttribute('position',new T.Float32BufferAttribute(v,3));locks.setAttribute('color',new T.Float32BufferAttribute(cs,3));locks.setIndex(ids);locks.computeVertexNormals();
 const lockMaterial=material.clone();lockMaterial.vertexColors=true;lockMaterial.side=T.DoubleSide;lockMaterial.name='studio-hair-locks';const mesh=new T.Mesh(locks,lockMaterial);mesh.name='studio-swept-locks';group.add(mesh);group.name='studio-swept-hair';return group;
}

/** Copy normalized weights from nearby garment vertices. Details deform with
 * the source skeleton instead of hanging rigidly from one chest bone. */
export function skinDetail(geometry,source,material,name){
 const p=geometry.attributes.position,s=source.geometry.attributes.position,joints=source.geometry.attributes.skinIndex,weights=source.geometry.attributes.skinWeight,si=[],sw=[];
 for(let i=0;i<p.count;i++){
  const nearest=[],point=new T.Vector3().fromBufferAttribute(p,i);
  for(let j=0;j<s.count;j++){const d=(point.x-s.getX(j))**2+(point.y-s.getY(j))**2+(point.z-s.getZ(j))**2;if(nearest.length<4||d<nearest[3].d){nearest.push({d,j});nearest.sort((a,b)=>a.d-b.d);if(nearest.length>4)nearest.pop();}}
  const blend=new Map();for(const {d,j}of nearest)for(let k=0;k<4;k++){const id=joints.getComponent(j,k);blend.set(id,(blend.get(id)||0)+weights.getComponent(j,k)/Math.max(1e-8,d));}
  const ranked=[...blend].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ranked.reduce((s,x)=>s+x[1],0)||1;
  for(let k=0;k<4;k++){si.push(ranked[k]?.[0]||0);sw.push((ranked[k]?.[1]||0)/total);}
 }
 geometry.setAttribute('skinIndex',new T.Uint16BufferAttribute(si,4));geometry.setAttribute('skinWeight',new T.Float32BufferAttribute(sw,4));geometry.computeVertexNormals();
 const mesh=new T.SkinnedMesh(geometry,material);mesh.name=name;mesh.skeleton=source.skeleton;mesh.bindMatrix.copy(source.bindMatrix);mesh.bindMatrixInverse.copy(source.bindMatrixInverse);mesh.position.copy(source.position);mesh.quaternion.copy(source.quaternion);mesh.scale.copy(source.scale);mesh.frustumCulled=false;return mesh;
}
export function makeStudioJacket(avatar,color,accent){
 const source=avatar.meshes.find(m=>m.material?.name==='jacket-fabric'),parts=[],positions=[],indices=[],shift=(avatar.rigHeadTop??1.8100767135620117)-1.8100767135620117;
 const top=1.8100767135620117+shift,neck=new T.Box3(),skin=avatar.anatomySkin?.geometry.attributes.position||avatar.meshes.find(m=>m.material?.name==='face-skin').geometry.attributes.position;
 for(let i=0;i<skin.count;i++){const y=skin.getY(i);if(y>top-.274&&y<top-.241)neck.expandByPoint(new T.Vector3(skin.getX(i),y,skin.getZ(i)));}
 const neckX=neck.isEmpty()?.062:Math.max(Math.abs(neck.min.x),Math.abs(neck.max.x))+.003,neckZ=neck.isEmpty()?-.029:(neck.min.z+neck.max.z)/2,depth=neck.isEmpty()?.068:(neck.max.z-neck.min.z)/2+.003;
 // Small standing collar, open at the throat. Four rings give a real rounded
 // rim and inside surface, avoiding the old two spheres on the chest.
 for(let ring=0;ring<4;ring++)for(let col=0;col<=48;col++){
  const phi=.36+col/48*(TAU-.72),front=Math.max(0,Math.cos(phi)),inner=ring>=2,r=(inner?-.0015:.0015),upper=ring===1||ring===2;
  positions.push(Math.sin(phi)*(neckX+r),top-.270+(upper?.025:0)-front*.022,neckZ+Math.cos(phi)*(depth+r));
 }
 for(let ring=0;ring<3;ring++)for(let col=0;col<48;col++){const k=ring*49+col;indices.push(k,k+1,k+49,k+1,k+50,k+49);}
 const collar=new T.BufferGeometry();collar.setAttribute('position',new T.Float32BufferAttribute(positions,3));collar.setIndex(indices);
 parts.push(skinDetail(collar,source,new T.MeshStandardMaterial({color,roughness:.86,side:T.DoubleSide}),'studio-jacket-collar'));
 // Project the zipper onto the edited garment, with continuous skin weights.
 const donor=avatar.meshes.find(m=>m.material?.name==='vest-shell')||source;
 const proxies=[source,donor].map(m=>{const p=new T.Mesh(m.geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));p.updateMatrixWorld(true);return p;}),ray=new T.Raycaster(),v=[],idx=[];
 for(let row=0;row<=48;row++){
  const y=1.015+row/48*(top-.294-1.015);ray.set(new T.Vector3(0,y,.4),new T.Vector3(0,0,-1));const hit=ray.intersectObjects(proxies)[0],z=(hit?.point.z??.10)+.002;
  for(const x of [-.002,.002])v.push(x,y,z);
  if(row<48){const k=row*2;idx.push(k,k+1,k+2,k+1,k+3,k+2);}
 }
 const zipper=new T.BufferGeometry();zipper.setAttribute('position',new T.Float32BufferAttribute(v,3));zipper.setIndex(idx);for(const proxy of proxies)proxy.material.dispose();
 parts.push(skinDetail(zipper,donor,new T.MeshStandardMaterial({color:accent,roughness:.6,metalness:.25,side:T.DoubleSide}),'studio-jacket-zipper'));
 return parts;
}

/** An actual, independently exported skinned mesh, copied from the existing
 * weighted upper-garment surface. This is a snug prototyping shell (NOT
 * tailored clothing or fabric simulation).  Skin indices/weights and UV are
 * cloned unchanged; the original source mesh is never replaced.
 */
export function makeSkinnedHoodieShell(avatar){
 const source=avatar.meshes.find(m=>m.isSkinnedMesh&&m.material?.name==='jacket-fabric');
 if(!source||!source.geometry?.attributes?.position||!source.geometry?.attributes?.skinWeight||!source.geometry?.attributes?.skinIndex)return [];
 const geometry=source.geometry.clone(),pos=geometry.attributes.position;
 if(!geometry.attributes.normal)geometry.computeVertexNormals();
 const normals=geometry.attributes.normal;
 for(let i=0;i<pos.count;i++){
  const x=pos.getX(i),y=pos.getY(i),z=pos.getZ(i);
  // 6-8 mm clearance; continuous offset also covers the arms without
  // cutting or detaching original garment triangles.
  const padding=.006+.002*Math.max(0,1-Math.abs(y-1.35)/.42);
  pos.setXYZ(i,x+normals.getX(i)*padding,y+normals.getY(i)*padding,z+normals.getZ(i)*padding);
 }
 pos.needsUpdate=true;
 geometry.computeVertexNormals();geometry.computeBoundingBox();geometry.computeBoundingSphere();
 const material=source.material.clone();
 material.name='studio6-skinned-hoodie-shell';
 material.side=T.FrontSide;
 const shell=new T.SkinnedMesh(geometry,material);
 shell.name='studio6-weighted-hoodie-shell';
 shell.skeleton=source.skeleton;
 shell.bindMatrix.copy(source.bindMatrix);
 shell.bindMatrixInverse.copy(source.bindMatrixInverse);
 shell.position.copy(source.position);shell.quaternion.copy(source.quaternion);shell.scale.copy(source.scale);
 shell.frustumCulled=false;
 shell.userData.studioGarment={kind:'hoodie',prototype:true,rigged:true,notTailored:true};
 return [shell];
}
