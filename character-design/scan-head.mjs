/** CC BY 3.0 Infinite scan: real photographic colour and tangent normal maps.
 * Rigid Head/Neck skin transfer is a studio adaptation, not a facial expression rig.
 */
import * as T from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
let pending;
export function loadScan(){return pending??=Promise.all([new GLTFLoader().loadAsync(new URL('./assets/scan/LeePerrySmith.glb',import.meta.url).href),...['Map-COL.jpg','Infinite-Level_02_Tangent_SmoothUV.jpg'].map(n=>new T.TextureLoader().loadAsync(new URL('./assets/scan/'+n,import.meta.url).href))]).then(([asset,map,normal])=>{let geometry;asset.scene.traverse(m=>{if(m.isMesh)geometry=m.geometry;});map.colorSpace=T.SRGBColorSpace;return {geometry,map,normal};}).catch(e=>{pending=null;throw e;});}
function clip(g,height,above){
 const attributes=Object.entries(g.attributes),data=Object.fromEntries(attributes.map(([n])=>[n,[]]));
 const vertex=i=>Object.fromEntries(attributes.map(([n,a])=>[n,Array.from({length:a.itemSize},(_,k)=>a.getComponent(i,k))]));
 const mix=(a,b,t)=>{const out={};for(const [n]of attributes)out[n]=a[n].map((v,k)=>v+(b[n][k]-v)*t);const combined=new Map();for(const [v,w]of [[a,1-t],[b,t]])for(let k=0;k<4;k++)combined.set(v.skinIndex[k],(combined.get(v.skinIndex[k])||0)+v.skinWeight[k]*w);const ranked=[...combined].sort((a,b)=>b[1]-a[1]).slice(0,4),sum=ranked.reduce((s,v)=>s+v[1],0);out.skinIndex=ranked.map(v=>v[0]);out.skinWeight=ranked.map(v=>v[1]/sum);while(out.skinIndex.length<4){out.skinIndex.push(0);out.skinWeight.push(0);}return out;};
 const count=g.index?.count||g.attributes.position.count;
 for(let i=0;i<count;i+=3){const poly=[0,1,2].map(k=>vertex(g.index?g.index.getX(i+k):i+k)),out=[];for(let j=0;j<3;j++){const a=poly[j],b=poly[(j+1)%3],da=(a.position[1]-height)*(above?1:-1),db=(b.position[1]-height)*(above?1:-1);if(da>=0)out.push(a);if((da>=0)!==(db>=0))out.push(mix(a,b,da/(da-db)));}for(let j=1;j<out.length-1;j++)for(const v of [out[0],out[j],out[j+1]])for(const [n]of attributes)data[n].push(...v[n]);}
 const out=new T.BufferGeometry();for(const [n,a]of attributes)out.setAttribute(n,n==='skinIndex'?new T.Uint16BufferAttribute(data[n],a.itemSize):new T.Float32BufferAttribute(data[n],a.itemSize));return out;
}
function bridge(upper,lower,top,bottom,head,neck){
 const rim=(g,y)=>{const a=g.attributes,p=a.position,unique=new Map();for(let i=0;i<p.count;i++)if(Math.abs(p.getY(i)-y)<1e-5){const x=p.getX(i),z=p.getZ(i),angle=Math.atan2(x,z-.012);unique.set(angle,{angle,position:[x,y,z],normal:[a.normal.getX(i),a.normal.getY(i),a.normal.getZ(i)],uv:[a.uv.getX(i),a.uv.getY(i)]});}return [...unique.values()].sort((a,b)=>a.angle-b.angle);};
 const a=rim(upper,top),b=rim(lower,bottom),TAU=Math.PI*2;
 const sample=(ring,angle)=>{let j=ring.findIndex(v=>v.angle>=angle);if(j<0)j=0;const right=ring[j],left=ring[(j+ring.length-1)%ring.length],ra=right.angle+(right.angle<left.angle?TAU:0),at=angle+(angle<left.angle?TAU:0),t=(at-left.angle)/(ra-left.angle||1);return {position:left.position.map((v,k)=>v+(right.position[k]-v)*t),normal:left.normal.map((v,k)=>v+(right.normal[k]-v)*t),uv:left.uv.map((v,k)=>v+(right.uv[k]-v)*t)};};
 if(a.length<3||b.length<3)return upper;
 const positions=[],normals=[],uvs=[],joints=[],weights=[],cols=80,rows=8;
 const points=[];for(let row=0;row<=rows;row++)for(let col=0;col<=cols;col++){const angle=-Math.PI+col/cols*TAU,t=row/rows,u=sample(a,angle),v=sample(b,angle),normal=new T.Vector3(...u.normal).lerp(new T.Vector3(...v.normal),t).normalize(),y=top+(bottom-top)*t,hw=T.MathUtils.smoothstep(y,top-.085,top+.015);points.push({p:u.position.map((x,k)=>x+(v.position[k]-x)*t),n:normal.toArray(),uv:u.uv,j:[head,neck,0,0],w:[hw,1-hw,0,0]});}
 for(let row=0;row<rows;row++)for(let col=0;col<cols;col++){const i=row*(cols+1)+col;for(const index of [i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2]){const v=points[index];positions.push(...v.p);normals.push(...v.n);uvs.push(...v.uv);joints.push(...v.j);weights.push(...v.w);}}
 const data={position:positions,normal:normals,uv:uvs,skinIndex:joints,skinWeight:weights},g=new T.BufferGeometry();for(const [name,arr]of Object.entries(data)){const original=upper.attributes[name],combined=[...original.array,...arr];g.setAttribute(name,name==='skinIndex'?new T.Uint16BufferAttribute(combined,original.itemSize):new T.Float32BufferAttribute(combined,original.itemSize));}upper.dispose();return g;
}
export function applyScanHead(avatar,scan){
 const face=avatar.meshes.find(m=>m.material?.name==='face-skin'),old=face.geometry,originalTop=new T.Box3().setFromBufferAttribute(old.attributes.position).max.y;
 let g=scan.geometry.toNonIndexed();const p=g.attributes.position;const box=new T.Box3().setFromBufferAttribute(p),scale=.36/(box.max.y-box.min.y),shift=originalTop-box.max.y*scale;
 const joints=new Uint16Array(p.count*4),weights=new Float32Array(p.count*4),head=face.skeleton.bones.findIndex(b=>b.name==='Head'),neck=Math.max(0,face.skeleton.bones.findIndex(b=>/neck/i.test(b.name)));
 for(let i=0;i<p.count;i++){p.setXYZ(i,p.getX(i)*scale,p.getY(i)*scale+shift,p.getZ(i)*scale+.012);const t=T.MathUtils.smoothstep(p.getY(i),originalTop-.34,originalTop-.24);joints[i*4]=head;joints[i*4+1]=neck;weights[i*4]=t;weights[i*4+1]=1-t;}
 g.setAttribute('skinIndex',new T.Uint16BufferAttribute(joints,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(weights,4));const full=g;g=clip(g,originalTop-.255,true);full.dispose();const lower=clip(old,originalTop-.265,false);g=bridge(g,lower,originalTop-.255,originalTop-.265,head,neck);g.userData.sculptResolution=1;g.computeBoundingBox();g.computeBoundingSphere();face.geometry=g;avatar.ownedGeometry.push(g);
 face.material.side=T.DoubleSide;face.material.map=scan.map;face.material.normalMap=scan.normal;face.material.normalScale.set(.65,.65);face.material.roughness=.57;face.material.metalness=0;face.material.needsUpdate=true;
 const neckGeometry=lower,neckMaterial=face.material.clone();neckMaterial.name='scan-neck-skin';neckMaterial.map=null;neckMaterial.normalMap=null;neckMaterial.color.set('#d8b6a9');const neckMesh=new T.SkinnedMesh(neckGeometry,neckMaterial);neckMesh.name='scan-neck-transition';neckMesh.position.copy(face.position);neckMesh.quaternion.copy(face.quaternion);neckMesh.scale.copy(face.scale);neckMesh.skeleton=face.skeleton;neckMesh.bindMatrix.copy(face.bindMatrix);neckMesh.bindMatrixInverse.copy(face.bindMatrixInverse);neckMesh.frustumCulled=false;face.parent.add(neckMesh);avatar.meshes.push(neckMesh);avatar.ownedGeometry.push(neckGeometry);avatar.materials.set(neckMaterial,neckMaterial);
 avatar.scanHead=true;avatar.sculptKey='scan-'+avatar.gender;avatar.rigHeadTop=originalTop;
 face.userData.source='Infinite, 3D Head Scan — Lee Perry-Smith / Infinite-Realities; CC BY 3.0; adapted to original Head/Neck bones. Closed eyes, no facial rig.';
}
