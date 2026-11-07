/** Actual skinned-vertex sculpting, independent of UI and rendering.
 * Immutable base geometry + sparse bind-space deltas, welded UV seams, original
 * bone weights, per-rig topology signatures and reversible brush transactions.
 */
import * as T from '../vendor/three/three.module.js';
import {newSculpt,SCULPT_MAX_OFFSET,brushWeight} from './sculpt-schema.mjs?v=6.1.2';
const V=new T.Vector3(),M=new T.Matrix4();
const keyOf=p=>p.map(v=>Math.round(v*1e6)).join(',');
function vertex(g,i){
 const data={p:[],n:[],uv:[],j:[],w:[]};
 for(const [k,name,n]of [['p','position',3],['n','normal',3],['uv','uv',2],['j','skinIndex',4],['w','skinWeight',4]])for(let a=0;a<n;a++)data[k].push(g.attributes[name]?.getComponent(i,a)||0);
 return data;
}
function midpoint(a,b){
 const v={p:a.p.map((x,i)=>(x+b.p[i])/2),n:a.n.map((x,i)=>(x+b.n[i])/2),uv:a.uv.map((x,i)=>(x+b.uv[i])/2),j:[],w:[]};
 const weights=new Map();for(const p of [a,b])for(let i=0;i<4;i++)weights.set(p.j[i],(weights.get(p.j[i])||0)+p.w[i]/2);
 const ranked=[...weights].sort((a,b)=>b[1]-a[1]).slice(0,4),total=ranked.reduce((n,v)=>n+v[1],0)||1;
 for(let i=0;i<4;i++){v.j[i]=ranked[i]?.[0]||0;v.w[i]=(ranked[i]?.[1]||0)/total;}
 const length=Math.hypot(...v.n)||1;v.n=v.n.map(x=>x/length);return v;
}
export function subdivideSkin(geometry,levels=2){
 let triangles=[];const ix=geometry.index,count=ix?ix.count:geometry.attributes.position.count;
 for(let i=0;i<count;i+=3)triangles.push([0,1,2].map(j=>vertex(geometry,ix?ix.getX(i+j):i+j)));
 if(count*4**levels>150000)throw Error('Ansiktsmodellen är för stor för detaljredigering.');
 for(let step=0;step<levels;step++){
  const next=[];for(const [a,b,c]of triangles){const ab=midpoint(a,b),bc=midpoint(b,c),ca=midpoint(c,a);next.push([a,ab,ca],[ab,b,bc],[ca,bc,c],[ab,bc,ca]);}triangles=next;
 }
 const data={p:[],n:[],uv:[],j:[],w:[]};for(const tri of triangles)for(const v of tri)for(const k of Object.keys(data))data[k].push(...v[k]);
 const g=new T.BufferGeometry();
 for(const [k,name,n]of [['p','position',3],['n','normal',3],['uv','uv',2],['j','skinIndex',4],['w','skinWeight',4]])g.setAttribute(name,k==='j'?new T.Uint16BufferAttribute(data[k],n):new T.Float32BufferAttribute(data[k],n));
 g.userData.sculptResolution=levels;g.computeBoundingBox();g.computeBoundingSphere();return g;
}
export function prepareSculptGeometry(avatar){
 const mesh=avatar.meshes.find(m=>m.material?.name==='face-skin');if(!mesh||mesh.geometry.userData.sculptResolution)return;
 const proxy=mesh.geometry.clone();avatar.anatomySkin={geometry:proxy};avatar.anatomyNormals=Float32Array.from(proxy.attributes.normal.array);avatar.anatomyPositions=Float32Array.from(proxy.attributes.position.array);avatar.ownedGeometry.push(proxy);
 avatar.rigHeadTop=new T.Box3().setFromBufferAttribute(mesh.geometry.attributes.position).max.y;
 const g=subdivideSkin(mesh.geometry,2);mesh.geometry=g;avatar.ownedGeometry.push(g);
}
function topology(source){let h=2166136261;for(let i=0;i<source.length;i++){h^=Math.round(source[i]*1e6);h=Math.imul(h,16777619);}return 's1-'+(h>>>0).toString(16).padStart(8,'0');}
/** Full weighted skin matrix, including bind and scene transforms. Its inverse
 * maps a pointer's world displacement back to the original editable surface. */
export function skinMatrix(mesh,index,target=new T.Matrix4()){
 const joints=mesh.geometry.attributes.skinIndex,weights=mesh.geometry.attributes.skinWeight,blend=new T.Matrix4();blend.elements.fill(0);
 for(let i=0;i<4;i++){const weight=weights.getComponent(index,i);if(!weight)continue;const id=joints.getComponent(index,i);M.multiplyMatrices(mesh.skeleton.bones[id].matrixWorld,mesh.skeleton.boneInverses[id]);for(let j=0;j<16;j++)blend.elements[j]+=M.elements[j]*weight;}
 return target.copy(mesh.matrixWorld).multiply(mesh.bindMatrixInverse).multiply(blend).multiply(mesh.bindMatrix);
}
function entryFor(mesh,source,key){
 const map=new Map(),groups=[],vertexGroups=new Uint32Array(source.length/3),adj=[];
 for(let i=0;i<source.length/3;i++){
  const p=Array.from(source.subarray(i*3,i*3+3)),k=keyOf(p);let id=map.get(k);
  if(id===undefined){id=groups.length;map.set(k,id);groups.push({p,indices:[]});adj.push(new Set());}
  groups[id].indices.push(i);vertexGroups[i]=id;
 }
 const ix=mesh.geometry.index,count=ix?ix.count:source.length/3;
 for(let i=0;i<count;i+=3){const ids=[0,1,2].map(j=>vertexGroups[ix?ix.getX(i+j):i+j]);for(const a of ids)for(const b of ids)if(a!==b)adj[a].add(b);}
 return {key,mesh,source,groups,lookup:map,vertexGroups,adj:adj.map(s=>[...s]),topology:topology(source),offsets:new Float32Array(groups.length*3),paint:new Float32Array(groups.length*4),base:null,baseNormals:Float32Array.from(mesh.geometry.attributes.normal.array)};
}
function sparse(entry){
 const deltas=[],paint=[];
 for(let i=0;i<entry.groups.length;i++){
  const d=Array.from(entry.offsets.subarray(i*3,i*3+3));if(Math.hypot(...d)>1e-7)deltas.push(i,...d);
  const c=Array.from(entry.paint.subarray(i*4,i*4+4));if(c[3]>1e-5)paint.push(i,...c);
 }
 return {count:entry.groups.length,topology:entry.topology,deltas,paint};
}
/** Backtrack an entire brush step together, including eyes/brows. Compare each
 * triangle with the stroke's starting surface, retaining its orientation and
 * at least 25% projected area. UV and logical seam topology never changes.
 * This guards local folding, not distant surface self-intersections.
 */
export function safeSurfaceStep(e,reference,previous,candidate){
 const ix=e.mesh.geometry.index,pos=e.mesh.geometry.attributes.position,count=ix?ix.count:pos.count;
 const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),oldNormal=new T.Vector3(),nextNormal=new T.Vector3();
 const point=(target,i,offsets,mix=1)=>{const id=e.vertexGroups[i]*3;return target.set(e.base[i*3]+previous[id]+(offsets[id]-previous[id])*mix,e.base[i*3+1]+previous[id+1]+(offsets[id+1]-previous[id+1])*mix,e.base[i*3+2]+previous[id+2]+(offsets[id+2]-previous[id+2])*mix);};
 const valid=t=>{
  for(let k=0;k<count;k+=3){
   const ids=[0,1,2].map(j=>ix?ix.getX(k+j):k+j);
   point(a,ids[0],reference);point(b,ids[1],reference);point(c,ids[2],reference);oldNormal.subVectors(b,a).cross(c.sub(a));const area=oldNormal.lengthSq();if(area<1e-18)continue;
   point(a,ids[0],candidate,t);point(b,ids[1],candidate,t);point(c,ids[2],candidate,t);nextNormal.subVectors(b,a).cross(c.sub(a));
   if(nextNormal.dot(oldNormal)<area*.25)return false;
  }return true;
 };
 let t=1;for(let attempt=0;attempt<9;attempt++,t*=.5)if(valid(t))return t;return 0;
}
export class SculptEngine{
 constructor(){this.avatar=null;this.entries=[];this.dirty=false;this.stroke=null;}
 apply(project,avatar,sources){
  if(this.avatar!==avatar){this.avatar=avatar;this.entries=[];this.stroke=null;}
  const meshes=avatar.meshes.filter(m=>m.isSkinnedMesh&&!m.userData.sculptDisabled&&(m.material?.name==='face-skin'||m.material?.name==='eyes'||m.material?.name==='hair'&&/eyebrow/i.test(m.name)));
  for(const mesh of meshes){
   const key=mesh.material.name==='hair'?'eyebrows':mesh.material.name,source=sources.get(mesh);if(!source)continue;
   let entry=this.entries.find(e=>e.mesh===mesh);if(!entry){entry=entryFor(mesh,source,key);this.entries.push(entry);}
   entry.base=Float32Array.from(mesh.geometry.attributes.position.array);entry.offsets.fill(0);entry.paint.fill(0);
   const saved=project.creative?.sculpt?.models?.[avatar.sculptKey||avatar.gender]?.[key];
   if(saved){if(saved.count!==entry.groups.length||saved.topology!==entry.topology)throw Error('Den sparade ansiktsformen matchar inte denna grundmodell.');
    for(let i=0;i<saved.deltas.length;i+=4)entry.offsets.set(saved.deltas.slice(i+1,i+4),saved.deltas[i]*3);
    for(let i=0;i<saved.paint.length;i+=5)entry.paint.set(saved.paint.slice(i+1,i+5),saved.paint[i]*4);
   }
   this.updateEntry(entry,project,true);
  }
  this.dirty=false;this.updateHeadCenter();
 }
 updateEntry(e,project,normals=false,bounds=true,paint=true){
  const pos=e.mesh.geometry.attributes.position;
  for(let i=0;i<pos.count;i++){const group=e.vertexGroups[i];pos.setXYZ(i,e.base[i*3]+e.offsets[group*3],e.base[i*3+1]+e.offsets[group*3+1],e.base[i*3+2]+e.offsets[group*3+2]);}
  pos.needsUpdate=true;
  if(e.key==='face-skin'&&paint){
   let attribute=e.mesh.geometry.attributes.color;if(!attribute||attribute.count!==pos.count){attribute=new T.Float32BufferAttribute(new Float32Array(pos.count*3),3);e.mesh.geometry.setAttribute('color',attribute);}
   const colors=attribute.array,base=e.mesh.material.color,baseRGB=[base.r,base.g,base.b];
   for(let i=0;i<pos.count;i++){const id=e.vertexGroups[i]*4,alpha=e.paint[id+3];for(let a=0;a<3;a++)colors[i*3+a]=1-alpha+alpha*e.paint[id+a]/Math.max(.005,baseRGB[a]);}
   attribute.needsUpdate=true;if(!e.mesh.material.vertexColors){e.mesh.material.vertexColors=true;e.mesh.material.needsUpdate=true;}
  }
  if(normals){if(e.offsets.some(v=>Math.abs(v)>1e-7))this.smoothNormals(e);else{e.rotations=null;e.mesh.geometry.attributes.normal.array.set(e.baseNormals);e.mesh.geometry.attributes.normal.needsUpdate=true;}}
  if(bounds){e.mesh.geometry.computeBoundingBox();e.mesh.geometry.computeBoundingSphere();e.mesh.computeBoundingSphere();e.mesh.boundingSphere.radius+=.08;e.mesh.boundingBox=null;}
 }
 smoothNormals(e){
  const pos=e.mesh.geometry.attributes.position,ix=e.mesh.geometry.index,count=ix?ix.count:pos.count;
  const current=Array.from({length:e.groups.length},()=>new T.Vector3()),base=Array.from({length:e.groups.length},()=>new T.Vector3());
  const a=new T.Vector3(),b=new T.Vector3(),c=new T.Vector3(),n=new T.Vector3();
  for(let i=0;i<count;i+=3){
   const ids=[0,1,2].map(j=>ix?ix.getX(i+j):i+j);
   for(const [target,original]of [[current,false],[base,true]]){
    if(original){a.fromArray(e.base,ids[0]*3);b.fromArray(e.base,ids[1]*3);c.fromArray(e.base,ids[2]*3);}else{a.fromBufferAttribute(pos,ids[0]);b.fromBufferAttribute(pos,ids[1]);c.fromBufferAttribute(pos,ids[2]);}
    n.subVectors(b,a).cross(c.sub(a));for(const v of ids)target[e.vertexGroups[v]].add(n);
   }
  }
  // Rotate the authored normals by the deformation gradient instead of erasing
  // their hard/soft edge decisions across UV seams and mouth/ear surfaces.
  const rotations=current.map((v,i)=>base[i].lengthSq()>1e-15&&v.lengthSq()>1e-15?new T.Quaternion().setFromUnitVectors(base[i].normalize(),v.normalize()):new T.Quaternion());
  e.rotations=rotations;
  const normals=new Float32Array(pos.count*3),normal=new T.Vector3();
  for(let i=0;i<pos.count;i++)normal.fromArray(e.baseNormals,i*3).applyQuaternion(rotations[e.vertexGroups[i]]).normalize().toArray(normals,i*3);
  e.mesh.geometry.setAttribute('normal',new T.BufferAttribute(normals,3));
 }

 updateHeadCenter(){
  const e=this.entries.find(e=>e.key==='face-skin');if(!e)return;this.updateAnatomyProxy(e);const box=new T.Box3().setFromBufferAttribute(e.mesh.geometry.attributes.position);this.headCenter=box.getCenter(new T.Vector3());this.top=box.max.y;
  this.headGroup=e.groups.reduce((best,g,i)=>Math.abs(g.p[1]-this.top+.08)<Math.abs(e.groups[best].p[1]-this.top+.08)?i:best,0);
 }
 updateAnatomyProxy(e){
  const geometry=this.avatar.anatomySkin?.geometry,source=this.avatar.anatomyPositions;if(!geometry||!source)return;
  const normal=new T.Vector3();
  for(let i=0;i<source.length/3;i++){
   const id=e.lookup.get(keyOf(Array.from(source.subarray(i*3,i*3+3))));if(id===undefined)continue;
   const vertex=e.groups[id].indices[0];geometry.attributes.position.setXYZ(i,e.mesh.geometry.attributes.position.getX(vertex),e.mesh.geometry.attributes.position.getY(vertex),e.mesh.geometry.attributes.position.getZ(vertex));
   normal.fromArray(this.avatar.anatomyNormals,i*3);if(e.rotations)normal.applyQuaternion(e.rotations[id]);geometry.attributes.normal.setXYZ(i,normal.x,normal.y,normal.z);
  }
  geometry.attributes.position.needsUpdate=true;geometry.attributes.normal.needsUpdate=true;geometry.computeBoundingBox();
 }
 headFraming(){
  const e=this.entries.find(e=>e.key==='face-skin');if(!e||!this.headCenter)return null;
  const matrix=skinMatrix(e.mesh,e.groups[this.headGroup].indices[0]);return {center:this.headCenter.clone().applyMatrix4(matrix),span:.43*this.avatar.scale};
 }
 begin(project,hit,options){
  const entry=this.entries.find(e=>e.mesh===hit.object);if(!entry)return false;
  const index=hit.face.a,center=hit.point.clone().applyMatrix4(skinMatrix(entry.mesh,index).invert());
  const skin=this.entries.find(e=>e.key==='face-skin');if(center.y<(this.top||2)-.26)return false;
  this.stroke={center,normal:hit.face.normal.clone().normalize(),options,snapshot:this.entries.map(e=>({offsets:e.offsets.slice(),paint:e.paint.slice()})),projectSnapshot:structuredClone(project.creative.sculpt||newSculpt()),changed:false};
  return true;
 }
 brush(project,{center=this.stroke?.center,delta=null,amount=1}={}){
  const s=this.stroke;if(!s)return false;const {radius,strength,symmetry,mode,color}=s.options;
  let changed=false;const previous=this.entries.map(e=>e.offsets.slice());
  if(delta){delta=delta.clone();const length=delta.length(),limit=radius*.55;if(length>0)delta.multiplyScalar(limit*Math.tanh(length/limit)/length);}
  for(let k=0;k<this.entries.length;k++){
   const e=this.entries[k];if(mode!=='grab'&&e.key!=='face-skin')continue;
   const old=s.snapshot[k],sourceOffsets=mode==='grab'?old.offsets:e.offsets.slice(),paintBefore=mode==='grab'?old.paint:e.paint;
   const weights=e.groups.map((g,i)=>{
    const first=g.indices[0]*3,x=e.base[first]+sourceOffsets[i*3],y=e.base[first+1]+sourceOffsets[i*3+1],z=e.base[first+2]+sourceOffsets[i*3+2];
    const dist=Math.hypot(x-center.x,y-center.y,z-center.z),mirror=symmetry?Math.hypot(x+center.x,y-center.y,z-center.z):Infinity;
    const neck=T.MathUtils.clamp((g.p[1]-(this.top-.255))/.025,0,1);
    return {weight:brushWeight(Math.min(dist,mirror),radius)*neck,mirrored:mirror<dist};
   });
   // An eye is a coherent object. Pull its surrounding skin and move the eye as
   // one unit rather than stretching an eyeball into unrelated triangles.
   if(mode==='grab'&&e.key==='eyes')for(const sign of [-1,1]){
    const max=Math.max(0,...weights.filter((w,i)=>Math.sign(e.groups[i].p[0])===sign).map(w=>w.weight));
    for(let i=0;i<weights.length;i++)if(Math.sign(e.groups[i].p[0])===sign)weights[i].weight=max;
   }
   for(let i=0;i<e.groups.length;i++){
    const {weight,mirrored}=weights[i];if(weight<.00001)continue;
    const beforeAlpha=e.paint[i*4+3],at=i*3,alpha=T.MathUtils.clamp(weight*strength*amount,0,1),offset=new T.Vector3().fromArray(sourceOffsets,at);
    if(mode==='grab'){
     const move=delta.clone();if(mirrored)move.x*=-1;
     if(symmetry)move.x*=T.MathUtils.clamp(Math.abs(e.groups[i].p[0])/(radius*.15),0,1);
     offset.addScaledVector(move,weight*strength);
    }else if(mode==='inflate'||mode==='deflate'){
     const n=new T.Vector3().fromBufferAttribute(e.mesh.geometry.attributes.normal,e.groups[i].indices[0]);offset.addScaledVector(n,alpha*.003*(mode==='deflate'?-1:1));
    }else if(mode==='smooth'){
     const neighbours=e.adj[i];if(neighbours.length){const average=new T.Vector3();for(const j of neighbours)average.add(new T.Vector3().fromArray(sourceOffsets,j*3));average.divideScalar(neighbours.length);offset.lerp(average,alpha*.65);}
    }else if(mode==='restore'){
     offset.multiplyScalar(1-alpha*.7);e.paint[i*4+3]*=1-alpha*.7;
    }else if(mode==='paint'){
     const id=i*4,opacity=alpha*.28,w=e.paint[id+3],next=opacity+w*(1-opacity);
     if(next>0){for(let a=0;a<3;a++)e.paint[id+a]=(color.getComponent?color.getComponent(a):color[['r','g','b'][a]])*opacity/next+e.paint[id+a]*w*(1-opacity)/next;e.paint[id+3]=next;}
    }
    if(offset.length()>SCULPT_MAX_OFFSET)offset.setLength(SCULPT_MAX_OFFSET);
    if(!offset.equals(new T.Vector3().fromArray(e.offsets,at))||mode==='paint'||mode==='restore'&&beforeAlpha!==e.paint[i*4+3]){offset.toArray(e.offsets,at);changed=true;}
   }
  }
  if(!['paint','restore'].includes(mode)){
   let mix=1;for(let k=0;k<this.entries.length;k++){const e=this.entries[k];if(e.key==='face-skin')mix=Math.min(mix,safeSurfaceStep(e,s.snapshot[k].offsets,previous[k],e.offsets));}
   if(mix<1)for(let k=0;k<this.entries.length;k++){const e=this.entries[k];for(let i=0;i<e.offsets.length;i++)e.offsets[i]=previous[k][i]+mix*(e.offsets[i]-previous[k][i]);}
  }
  for(const e of this.entries)this.updateEntry(e,project,false,false,mode==='paint'||mode==='restore');
  if(changed){this.dirty=true;s.changed=true;}return changed;
 }
 store(project,finish=false){
  if(!this.dirty)return false;project.creative.sculpt??=newSculpt();const sculpt=project.creative.sculpt;
  sculpt.models[this.avatar.sculptKey||this.avatar.gender]=Object.fromEntries(this.entries.map(e=>[e.key,sparse(e)]));
  if(finish){sculpt.revision++;this.dirty=false;}return true;
 }
 finish(project){const changed=!!this.stroke?.changed;this.store(project,true);this.stroke=null;for(const e of this.entries)this.updateEntry(e,project,true);this.updateHeadCenter();return changed;}
 cancel(project){
  if(!this.stroke)return;project.creative.sculpt=this.stroke.projectSnapshot;
  for(let i=0;i<this.entries.length;i++){this.entries[i].offsets.set(this.stroke.snapshot[i].offsets);this.entries[i].paint.set(this.stroke.snapshot[i].paint);this.updateEntry(this.entries[i],project,true);}this.stroke=null;this.dirty=false;
 }
 reset(project,paint=false){
  for(const e of this.entries){e.offsets.fill(0);if(paint)e.paint.fill(0);}this.dirty=true;this.store(project,true);for(const e of this.entries)this.updateEntry(e,project,true);this.updateHeadCenter();
 }
}
