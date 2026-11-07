/** Anatomical surface patches and deliberately modelled studio accessories.
 * Geometry is generated locally from the actual source head, never unrelated spheres.
 * All coordinates are canonical bind space in metres; final parts remain editable.
 */
import * as T from '../vendor/three/three.module.js';
import {mergeGeometries} from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from '../vendor/three/addons/geometries/RoundedBoxGeometry.js';
const TAU=Math.PI*2,clamp=T.MathUtils.clamp;
export const ACCESSORY_TYPES=['cap','glasses','beard','hair','helmet','backpack','badge','shoulder','wrist'];
export function anatomy(avatar){
 const skin=avatar.anatomySkin||avatar.meshes.find(m=>m.material?.name==='face-skin');
 const eyes=avatar.meshes.find(m=>m.material?.name==='eyes');
 const bounds=new T.Box3().setFromBufferAttribute(skin.geometry.attributes.position);
 const eyeBox=new T.Box3().setFromBufferAttribute(eyes.geometry.attributes.position);
 return {skin,top:bounds.max.y,baseTop:avatar.rigHeadTop??bounds.max.y,width:bounds.max.x-bounds.min.x,depth:bounds.max.z-bounds.min.z,eyeY:(eyeBox.min.y+eyeBox.max.y)/2,front:bounds.max.z,centerZ:(bounds.min.z+bounds.max.z)/2};
}
function material(color,extra={}){return new T.MeshStandardMaterial({color,roughness:.78,...extra});}
function add(group,geometry,mat,name,pos=[0,0,0],scale=null,rotation=null){
 const mesh=new T.Mesh(geometry,mat);mesh.name=name;mesh.position.fromArray(pos);
 if(scale)mesh.scale.fromArray(scale);if(rotation)mesh.rotation.set(...rotation);group.add(mesh);return mesh;
}
function curve(group,points,radius,mat,name,closed=false){
 return add(group,new T.TubeGeometry(new T.CatmullRomCurve3(points.map(p=>new T.Vector3(...p)),closed),Math.max(12,points.length*5),radius,8,closed),mat,name);
}
/** Clip each source triangle against a scalar field and interpolate its normals.
 * Preserves a clean hairline and avoids retaining entire coarse face triangles.
 */
export function surfacePatch(mesh,field,offset=.003,deform=null){
 const g=mesh.geometry,pos=g.attributes.position,norm=g.attributes.normal,ix=g.index,out=[],ns=[];
 for(let k=0;k<(ix?ix.count:pos.count);k+=3){
  let polygon=[0,1,2].map(j=>{const i=ix?ix.getX(k+j):k+j;const p=new T.Vector3().fromBufferAttribute(pos,i),n=new T.Vector3().fromBufferAttribute(norm,i);return {p,n,d:field(p)};});
  const clipped=[];
  for(let j=0;j<polygon.length;j++){
   const a=polygon[j],b=polygon[(j+1)%polygon.length];
   if(a.d>=0)clipped.push(a);
   if((a.d>=0)!==(b.d>=0)){const t=a.d/(a.d-b.d);clipped.push({p:a.p.clone().lerp(b.p,t),n:a.n.clone().lerp(b.n,t).normalize(),d:0});}
  }
  for(let j=1;j+1<clipped.length;j++)for(const v of [clipped[0],clipped[j],clipped[j+1]]){
   const p=v.p.clone().addScaledVector(v.n,typeof offset==='function'?offset(v.p):offset);if(deform)deform(p);out.push(p.x,p.y,p.z);ns.push(v.n.x,v.n.y,v.n.z);
  }
 }
 const result=new T.BufferGeometry();result.setAttribute('position',new T.Float32BufferAttribute(out,3));result.setAttribute('normal',new T.Float32BufferAttribute(ns,3));result.computeBoundingBox();return result;
}
export function hairGeometry(a,style='short'){
 const t=a.top;
 // Forehead hairline higher than the temples and nape. Curved rather than a
 // horizontal sphere equator; cap is fitted to the model's own scalp surface.
 const field=p=>{
  const front=clamp((p.z-a.centerZ)/Math.max(.03,a.depth*.5),-1,1);
  const line=t-(front>0?.079-.008*Math.cos(p.x/Math.max(.01,a.width)*TAU):.135-.060*front);
  return p.y-line;
 };
 return surfacePatch(a.skin,field,p=>{
  const crown=clamp((p.y-(t-.12))/.12,0,1);
  return style==='buzz'?.0025:.004+(style==='short'?.012:.008)*crown;
 },p=>{if(style==='mohawk'){const crest=Math.exp(-((p.x/.023)**2));p.y+=.065*crest*clamp((p.y-(t-.1))/.1,0,1);}});
}
export function beardGeometry(a,style='Kort skägg'){
 const t=a.baseTop??a.top,lip=t-.190;
 return surfacePatch(a.skin,p=>{
  const mouthHole=(p.x/.035)**2+((p.y-lip)/.014)**2-1;
  if(style==='Mustasch')return Math.min(p.y-(lip+.011),lip+.034-p.y,.053-Math.abs(p.x),p.z-.055);
  const cheek=t-.171+.021*clamp(Math.abs(p.x)/.07,0,1);
  return Math.min(p.y-(t-.255),cheek-p.y,p.z-.026,mouthHole*.03);
 },style==='Stubb'?.0012:.003,p=>{
  if(style==='Helskägg')p.y-=.026*clamp((t-.208-p.y)/.045,0,1);
 });
}
export function makeHair(avatar,style,color){
 const a=anatomy(avatar),group=new T.Group(),mat=material(color,{roughness:.91});
 const cap=add(group,hairGeometry(a,style),mat,'fitted-scalp');
 if(['short','bob','long','ponytail'].includes(style)){
  const ray=new T.Raycaster(),center=new T.Vector3(0,a.top-.12,a.centerZ),strands=[];cap.updateMatrixWorld(true);
  for(let line=0;line<20;line++){
   const phi=line/20*TAU,points=[];
   for(let step=0;step<14;step++){
    const u=step/13,theta=.12+u*(Math.cos(phi)>0?1.20:1.80),angle=phi+.28*Math.sin(u*Math.PI),d=new T.Vector3(Math.sin(theta)*Math.sin(angle),Math.cos(theta),Math.sin(theta)*Math.cos(angle));
    ray.set(center.clone().addScaledVector(d,.4),d.clone().negate());const hit=ray.intersectObject(cap)[0];
    if(hit)points.push(hit.point.clone().addScaledVector(hit.face.normal,.0008));
   }
   if(points.length>3)strands.push(new T.TubeGeometry(new T.CatmullRomCurve3(points),24,.00045,5,false));
  }
  if(strands.length){const merged=mergeGeometries(strands);for(const g of strands)g.dispose();add(group,merged,material(new T.Color(color).offsetHSL(0,0,-.035),{roughness:.85}),'combed-hair-strands');}
 }

 if(style==='curly'){
  // Short interlocking curls distributed on the actual fitted scalp, not a row
  // of oversized balls floating above the forehead.
  const scalp=group.children[0].geometry.attributes.position,chosen=[];
  for(let i=0;i<scalp.count;i+=3){const p=new T.Vector3().fromBufferAttribute(scalp,i);if(chosen.every(q=>q.distanceTo(p)>.027)){
   chosen.push(p);const n=new T.Vector3().fromBufferAttribute(group.children[0].geometry.attributes.normal,i);
   const curl=add(group,new T.TorusGeometry(.013,.0055,6,12,Math.PI*1.7),mat,'scalp-curl',p.addScaledVector(n,.004).toArray());curl.quaternion.setFromUnitVectors(new T.Vector3(0,0,1),n);if(chosen.length>=55)break;
  }}
 }
 if(['bob','long'].includes(style)){
  const vertices=[],indices=[],rows=12,cols=36,length=style==='long'?.34:.19;
  for(let y=0;y<=rows;y++)for(let x=0;x<=cols;x++){
   const v=y/rows,u=x/cols,phi=1.08+u*(TAU-2.16),bend=(phi<Math.PI?1:-1)*v*v*.35;
   const radius=1-.18*v,angle=phi+bend;
   vertices.push(Math.sin(angle)*(a.width*.53+.003)*radius,a.top-.075-v*length+.007*Math.cos(u*12*Math.PI)*v**5,a.centerZ+Math.cos(angle)*a.depth*.49-(style==='long'?.115:.035)*v);
  }
  for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){const i=y*(cols+1)+x;indices.push(i,i+1,i+cols+1,i+1,i+cols+2,i+cols+1);}
  const g=new T.BufferGeometry();g.setAttribute('position',new T.Float32BufferAttribute(vertices,3));g.setIndex(indices);g.computeVertexNormals();const curtain=add(group,g,mat.clone(),'layered-hair-curtain');curtain.material.side=T.DoubleSide;
  for(const side of [-1,1]){
   const path=new T.CatmullRomCurve3([new T.Vector3(side*a.width*.52,a.top-.09,a.centerZ+.05),new T.Vector3(side*a.width*.57,a.top-.19,a.centerZ+.075),new T.Vector3(side*a.width*.65,a.top-(style==='long'?.29:.23),a.centerZ+.145),new T.Vector3(side*a.width*.59,a.top-(style==='long'?.38:.25),a.centerZ+.17)]);
   const pos=[],idx=[],steps=24,radial=10;
   for(let i=0;i<=steps;i++){
    const t=i/steps,p=path.getPoint(t),taper=1-.97*t**4,width=.013*(.7+.3*Math.sin(Math.PI*t))*taper,depth=.008*taper;
    for(let j=0;j<=radial;j++){const angle=j/radial*TAU;pos.push(p.x+Math.cos(angle)*width,p.y,p.z+Math.sin(angle)*depth);}
   }
   for(let i=0;i<steps;i++)for(let j=0;j<radial;j++){const k=i*(radial+1)+j;idx.push(k,k+1,k+radial+1,k+1,k+radial+2,k+radial+1);}
   const lock=new T.BufferGeometry();lock.setAttribute('position',new T.Float32BufferAttribute(pos,3));lock.setIndex(idx);lock.computeVertexNormals();add(group,lock,mat,'rounded-face-framing-lock');
  }

 }
 if(style==='ponytail'){
  const z=a.centerZ-a.depth*.48;
  const tail=curve(group,[[0,a.top-.085,z],[.004,a.top-.13,z-.045],[.012,a.top-.21,z-.06],[.008,a.top-.30,z-.035]],.022,mat,'tapered-ponytail');
  const g=tail.geometry,position=g.attributes.position,segments=g.parameters.tubularSegments,radial=g.parameters.radialSegments;
  for(let ring=0;ring<=segments;ring++){const t=ring/segments,center=g.parameters.path.getPointAt(t),factor=1-.94*t**1.4;for(let j=0;j<=radial;j++){const i=ring*(radial+1)+j,p=new T.Vector3().fromBufferAttribute(position,i).sub(center).multiplyScalar(factor).add(center);position.setXYZ(i,p.x,p.y,p.z);}}g.computeVertexNormals();

  const tie=add(group,new T.TorusGeometry(.022,.004,6,16),material('#252a2c'),'hair-tie',[0,a.top-.13,z-.044]);tie.rotation.x=.35;
 }
 group.name='fitted-hair-'+style;return group;
}
export function makeBeard(avatar,style,color){
 const group=new T.Group();add(group,beardGeometry(anatomy(avatar),style),material(color,{roughness:.96}),'fitted-facial-hair');return group;
}
function normalized(group){
 group.updateMatrixWorld(true);const b=new T.Box3().setFromObject(group),size=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());
 const root=new T.Group();root.add(group);group.position.sub(center);group.scale.set(1/Math.max(.0001,size.x),1/Math.max(.0001,size.y),1/Math.max(.0001,size.z));group.position.multiply(group.scale);root.userData.nativeBounds={center:center.toArray(),size:size.toArray()};return root;
}
/** Compound accessories are normalized, so the user's dimensions describe the
 * actual visible bounds. Small details use a restrained material palette.
 */
export function makeAccessory(type,color,avatar){
 const g=new T.Group(),base=material(color),dark=material('#20262b',{roughness:.85}),metal=material('#9ba6ad',{metalness:.7,roughness:.3});
 if(type==='hair')return normalized(makeHair(avatar,'short',color));
 if(type==='beard')return normalized(makeBeard(avatar,'Kort skägg',color));
 if(type==='glasses'){
  for(const side of [-1,1]){
   const points=[];for(let i=0;i<24;i++){const a=i/24*TAU;points.push([side*.255+Math.cos(a)*.215,Math.sin(a)*.16,.30+.025*Math.abs(Math.cos(a))]);}
   curve(g,points,.014,base,'eyeglass-rim',true);
   const lens=add(g,new T.CircleGeometry(1,32),material('#9cc5d4',{transparent:true,opacity:.14,roughness:.12,depthWrite:false,side:T.DoubleSide}),'optical-lens',[side*.255,0,.304],[.203,.148,1]);
   curve(g,[[side*.475,.035,.30],[side*.505,.04,.19],[side*.48,.015,-.22],[side*.46,-.065,-.31]],.012,base,'temple-arm');
  }
  curve(g,[[-.045,.025,.32],[0,.064,.35],[.045,.025,.32]],.012,base,'nose-bridge');
 }else if(type==='cap'||type==='helmet'){
  const positions=[],indices=[],rings=16,cols=40;
  for(let y=0;y<=rings;y++)for(let x=0;x<=cols;x++){
   const phi=x/cols*TAU,max=type==='cap'?Math.PI/2:1.65-.20*Math.cos(phi),theta=y/rings*max;
   positions.push(.5*Math.sin(theta)*Math.sin(phi),.5*Math.cos(theta),.5*Math.sin(theta)*Math.cos(phi));
  }
  for(let y=0;y<rings;y++)for(let x=0;x<cols;x++){const i=y*(cols+1)+x;indices.push(i,i+cols+1,i+1,i+1,i+cols+1,i+cols+2);}
  const shell=new T.BufferGeometry();shell.setAttribute('position',new T.Float32BufferAttribute(positions,3));shell.setIndex(indices);shell.computeVertexNormals();add(g,shell,base,'tailored-'+type+'-shell');base.side=T.DoubleSide;
  const rim=[];for(let x=0;x<cols;x++){const i=(rings*(cols+1)+x)*3;rim.push(positions.slice(i,i+3));}curve(g,rim,.012,type==='cap'?base:dark,'shell-rim',true);
  if(type==='cap'){
   const v=[],idx=[];for(let row=0;row<2;row++)for(let i=0;i<=24;i++){const phi=-1.12+i/24*2.24,r=.49+row*.29;v.push(Math.sin(phi)*r,-.008-row*.04,.01+Math.cos(phi)*r);}
   for(let i=0;i<24;i++)idx.push(i,i+25,i+1,i+1,i+25,i+26);const brim=new T.BufferGeometry();brim.setAttribute('position',new T.Float32BufferAttribute(v,3));brim.setIndex(idx);brim.computeVertexNormals();add(g,brim,base,'curved-cap-brim');
   for(const phi of [-1.1,0,1.1,Math.PI]){const points=[];for(let i=1;i<=12;i++){const theta=i/12*Math.PI/2;points.push([.502*Math.sin(theta)*Math.sin(phi),.502*Math.cos(theta),.502*Math.sin(theta)*Math.cos(phi)]);}curve(g,points,.0025,dark,'crown-seam');}
  }else{
   for(const side of [-1,1])add(g,new RoundedBoxGeometry(.06,.07,.26,2,.015),dark,'helmet-side-rail',[side*.49,.06,-.03]);
  }
 }else if(type==='backpack'){
  add(g,new RoundedBoxGeometry(.73,.90,.35,3,.085),base,'backpack-body',[0,0,-.02]);
  add(g,new RoundedBoxGeometry(.58,.43,.12,3,.045),base,'front-pocket',[0,-.18,-.235]);
  for(const side of [-1,1]){
   curve(g,[[side*.24,.39,.1],[side*.30,.16,.29],[side*.26,-.31,.17]],.038,dark,'shoulder-strap');
   add(g,new RoundedBoxGeometry(.06,.045,.018,2,.008),metal,'strap-buckle',[side*.26,-.21,.20]);
  }
  curve(g,[[-.15,.43,0],[-.13,.53,.01],[.13,.53,.01],[.15,.43,0]],.022,dark,'carry-handle');
  curve(g,[[-.27,.03,-.30],[0,.05,-.31],[.27,.03,-.30]],.009,metal,'pocket-zip');
 }else if(type==='shoulder'){
  const shell=new T.SphereGeometry(.5,24,12,0,TAU,0,Math.PI*.52);add(g,shell,base,'curved-shoulder-shell');base.side=T.DoubleSide;
  curve(g,Array.from({length:24},(_,i)=>[.5*Math.cos(i/24*TAU),-.025,.5*Math.sin(i/24*TAU)]),.022,dark,'shoulder-rim',true);
 }else if(type==='wrist'){
  add(g,new T.CylinderGeometry(.48,.48,.5,32,1,true),base,'wrist-band');base.side=T.DoubleSide;
  add(g,new RoundedBoxGeometry(.24,.28,.13,2,.035),metal,'band-clasp',[0,0,.48]);
 }else if(type==='badge'){
  const shape=new T.Shape();shape.moveTo(-.4,.5);shape.lineTo(.4,.5);shape.lineTo(.4,-.04);shape.quadraticCurveTo(.35,-.33,0,-.5);shape.quadraticCurveTo(-.35,-.33,-.4,-.04);shape.closePath();
  add(g,new T.ExtrudeGeometry(shape,{depth:.04,bevelEnabled:true,bevelSegments:2,steps:1,bevelSize:.02,bevelThickness:.01}),base,'shield-badge');
  add(g,new T.CircleGeometry(.17,5),metal,'badge-emblem',[0,.10,.065]);
 }
 const root=normalized(g);root.userData.accessoryType=type;return root;
}
export function fitAccessory(part,avatar){
 const a=anatomy(avatar),female=avatar.gender==='female',shift=(a.baseTop??a.top)-1.8100767135620117,type=part.preset,side=part.mirrored?'r':'l';
 const spec={
  glasses:{position:[0,a.eyeY+.002,.018],dimensions:[a.width*1.10,.043,.17],anchor:'Head'},
  cap:{position:[0,a.top-.016,.025],dimensions:[a.width*1.15,.092,.275],anchor:'Head'},
  helmet:{position:[0,a.top-.037,-.007],dimensions:[a.width*1.21,.16,.252],anchor:'Head'},
  backpack:{position:[0,1.235+shift,-.205],dimensions:[.27,.36,.15],anchor:'spine_03'},
  badge:{position:[.073,1.34+shift,.144],dimensions:[.047,.056,.01],anchor:'spine_03'},
  shoulder:{position:[-.225,1.47+shift,-.015],dimensions:[.145,.082,.16],anchor:'upperarm_l'},
 }[type];
 if(type==='shoulder'){
  const shoulder=avatar.root.worldToLocal(avatar.bones.get('upperarm_'+side).getWorldPosition(new T.Vector3()));
  const elbow=avatar.root.worldToLocal(avatar.bones.get('lowerarm_'+side).getWorldPosition(new T.Vector3()));
  const out=elbow.sub(shoulder).normalize();shoulder.addScaledVector(out,.018);shoulder.y+=.026;
  part.position=shoulder.toArray();part.dimensions=[.145,.082,.16];part.rotation=[0,0,0];part.anchor='clavicle_'+side;
 }else if(type==='wrist'){
  const bone=avatar.bones.get('lowerarm_'+side),hand=avatar.bones.get('hand_'+side),start=avatar.root.worldToLocal(bone.getWorldPosition(new T.Vector3())),end=avatar.root.worldToLocal(hand.getWorldPosition(new T.Vector3()));
  const direction=end.clone().sub(start).normalize(),pos=end.clone().addScaledVector(direction,-.035),q=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction),e=new T.Euler().setFromQuaternion(q);
  part.position=pos.toArray();part.dimensions=[.071,.028,.071];part.rotation=[e.x,e.y,e.z].map(x=>x*180/Math.PI);part.anchor='hand_'+side;
 }else if(type==='hair'||type==='beard'){
  const group=makeAccessory(type,part.color,avatar),b=group.userData.nativeBounds;part.position=b.center;part.dimensions=b.size.map(v=>Math.max(.01,v));part.anchor='Head';part.rotation=[0,0,0];disposeAccessory(group);
 }else if(spec){if(avatar.isDwarf&&['backpack','badge'].includes(type)){spec.position[1]=type==='backpack'?.36:.39;spec.position[2]=type==='backpack'?-.14:.11;spec.dimensions=spec.dimensions.map(v=>Math.max(.01,v*.7));}Object.assign(part,spec);part.rotation=[0,0,0];}
 part.fitVersion=1;part.followsFace=true;return part;
}
export function disposeAccessory(root){const geometries=new Set(),materials=new Set();root.traverse(m=>{if(m.geometry)geometries.add(m.geometry);if(m.material)for(const mat of [m.material].flat())materials.add(mat);});for(const g of geometries)g.dispose();for(const m of materials)m.dispose();}
