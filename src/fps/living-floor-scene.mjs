/** Whole-floor, room-specific visual dressing. Shared atlases and spatial material
 * batches keep this a static environment pass, not hundreds of independent assets.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import { bounds, CREForm } from './living-floor-plan.mjs';
import { createLivingArt, ART_TILES, VALUE_TILES } from './living-floor-art.mjs';
const C={blue:0x203f6b,bluebox:0x6e8a9a,rubber:0x242d32,steel:0xa6afb0,yellow:0xe0b82f,cream:0xe7e5db,cardboard:0xb68b58,wood:0xa78760,ceramic:0xced6d0,teal:0x427a79,stone:0xc7ccca};
const hash=s=>[...s].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,19);
export function buildLivingScene(world,registry,{replacedProps=[],refinedFreight=false}={}){
 const replaced=new Set(replacedProps);
 const root=new THREE.Group();root.name='living-floor';const art=createLivingArt(),owned=[],batches=new Map(),texts=new Map();
 const paint=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.72,metalness:.025});paint.name='living-paint';
 const metal=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.37,metalness:.72});metal.name='living-metal';
 const fabric=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.96});fabric.name='living-fabric';
 const paper=new THREE.MeshStandardMaterial({map:art.atlas,roughness:.9});paper.name='living-art';
 const labelMat=new THREE.MeshStandardMaterial({map:art.labels,roughness:.85});labelMat.name='living-labels';
 const screen=new THREE.MeshBasicMaterial({map:art.display,toneMapped:false});screen.name='living-display';
 const leafMat=new THREE.MeshStandardMaterial({vertexColors:true,roughness:.86,side:THREE.DoubleSide});leafMat.name='living-leaves';
 const glow=new THREE.MeshBasicMaterial({vertexColors:true,toneMapped:false});glow.name='living-indicators';
 owned.push(paint,metal,fabric,paper,labelMat,screen,leafMat,glow);
 const counts={physicalProps:world.living.props.length,wallDisplays:world.living.mounts.length,plants:0,deskDetails:0,labDetails:0,architecturalDetails:0};
 function add(g,m,x,y,z,rot={},color=0xffffff,cast=false){
  const non=g.index?g.toNonIndexed():g;if(non!==g)g.dispose();g=non;
  if(!g.attributes.uv)g.setAttribute('uv',new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count*2),2));
  if(m.vertexColors){const col=new THREE.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=col.r;a[i+1]=col.g;a[i+2]=col.b;}g.setAttribute('color',new THREE.Float32BufferAttribute(a,3));}
  const q=rot.isQuaternion?rot:new THREE.Quaternion().setFromEuler(new THREE.Euler(rot.x||0,rot.y||0,rot.z||0));
  g.applyMatrix4(new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),q,new THREE.Vector3(1,1,1)));
  const key=`${Math.floor(x/18)}:${Math.floor(z/18)}:${m.name}:${cast}`;
  if(!batches.has(key))batches.set(key,{m,parts:[],cast});batches.get(key).parts.push(g);
 }
 const box=(x,y,z,w,h,d,c=C.cream,mat=paint,yaw=0,bevel=0,cast=false)=>add(bevel?new RoundedBoxGeometry(w,h,d,1,Math.min(bevel,w/4,h/4,d/4)):new THREE.BoxGeometry(w,h,d),mat,x,y,z,{y:yaw},c,cast);
 const rod=(a,b,r=.014,c=C.blue,mat=paint)=>{const u=new THREE.Vector3(...a),v=new THREE.Vector3(...b),delta=v.clone().sub(u);add(new THREE.CylinderGeometry(r,r,delta.length(),8),mat,...u.add(v).multiplyScalar(.5).toArray(),new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize()),c);};
 function plane(x,y,z,w,h,mat,tile=null,yaw=0,flat=false){const g=new THREE.PlaneGeometry(w,h);if(tile!==null){const uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setXY(i,(uv.getX(i)+tile%4)/4,(uv.getY(i)+3-Math.floor(tile/4))/4);}add(g,mat,x,y,z,{x:flat?-Math.PI/2:0,y:flat?0:yaw,z:flat?yaw:0});}
 function text(x,y,z,w,h,title,yaw=0,bg='#f0eee4',fg='#244250'){
  const key=title+bg+fg;let m=texts.get(key);
  if(!m){const c=document.createElement('canvas');c.width=512;c.height=128;const ctx=c.getContext('2d');ctx.fillStyle=bg;ctx.fillRect(0,0,512,128);ctx.fillStyle=fg;ctx.textAlign='center';ctx.textBaseline='middle';ctx.font=`700 ${Math.min(66,700/title.length)}px Arial`;ctx.fillText(title,256,64,480);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;m=new THREE.MeshStandardMaterial({map:t,roughness:.8});m.name='living-text-'+texts.size;texts.set(key,m);owned.push(m);}
  plane(x,y,z,w,h,m,null,yaw);
 }
 function carton(b){
  box(b.x,b.y+b.h/2+.002,b.z,b.w*.12,.004,b.d,0xd6bf89);box(b.x,b.y,b.z+b.d/2+.002,b.w*.12,b.h,.004,0xd6bf89);
  plane(b.x+b.w*.20,b.y,b.z+b.d/2+.005,Math.min(.16,b.w*.35),Math.min(.16,b.h*.60),labelMat,5);
 }
 function plant(x,y,z,size=1){
  counts.plants++;add(new THREE.CylinderGeometry(.17*size,.12*size,.31*size,14),paint,x,y+.155*size,z,{},C.ceramic);add(new THREE.CircleGeometry(.153*size,14),paint,x,y+.313*size,z,{x:-Math.PI/2},0x3e3930);
  for(let branch=0;branch<5;branch++){
   const angle=branch*2.4,ex=x+Math.cos(angle)*.12*size,ez=z+Math.sin(angle)*.12*size,top=y+(.8+branch*.12)*size;
   rod([x,y+.30*size,z],[ex,top,ez],.006*size,0x58664a);
   for(let k=0;k<4;k++){
    const a=angle+k*2.12,r=(.14+k*.025)*size,ly=top-k*.12*size;
    const s=new THREE.Shape();s.moveTo(0,0);s.quadraticCurveTo(.12*size,.07*size,.06*size,.28*size);s.quadraticCurveTo(-.08*size,.16*size,0,0);
    add(new THREE.ShapeGeometry(s,3),leafMat,ex+Math.cos(a)*r*.25,ly,ez+Math.sin(a)*r*.25,{x:-.85,y:a,z:.35},[0x416c50,0x658b5b,0x315e4e][(branch+k)%3]);
   }
  }
 }
 function mug(x,y,z){add(new THREE.CylinderGeometry(.034,.029,.085,12,1,true),paint,x,y+.044,z,{},0xe2dcca);add(new THREE.CircleGeometry(.030,12),paint,x,y+.077,z,{x:-Math.PI/2},0x47362b);add(new THREE.TorusGeometry(.023,.005,5,12),paint,x+.034,y+.050,z,{},0xe2dcca);}
 function binder(x,y,z,color,yaw=0){box(x,y+.16,z,.065,.32,.25,color,paint,yaw,.004);box(x,y+.16,z+.128,.035,.20,.003,0xe4e6dd,paint,yaw);}
 // Render the exact colliding pieces. Details never replace their physical records.
 for(const b of world.living.boxes){
  if(b.id.endsWith('-wood-base'))continue;
  if([...replaced].some(id=>b.id.startsWith(id)))continue;
  if(b.id.includes('-wheel-')||b.id.includes('-caster-'))add(new THREE.CylinderGeometry(b.h/2,b.h/2,b.d,10),paint,b.x,b.y,b.z,{x:Math.PI/2},C.rubber,true);
  else if(b.finish==='blue'&&Math.min(b.w,b.h,b.d)<.031){const dims=[b.w,b.h,b.d],axis=dims.indexOf(Math.max(...dims)),a=[b.x,b.y,b.z],v=[...a];a[axis]-=dims[axis]/2;v[axis]+=dims[axis]/2;rod(a,v,.014,C.blue);}
  else if(!b.id.endsWith('-coffee-machine'))box(b.x,b.y,b.z,b.w,b.h,b.d,b.id.includes('-tote-')?0xacc6cb:C[b.finish]||C.cream,b.finish==='steel'?metal:b.finish==='teal'?fabric:paint,0,b.h>.2?.014:0,true);
  if(b.finish==='cardboard')carton(b);
 }
 for(const p of world.living.props){
  if(replaced.has(p.id))continue;
  const {x,z,w,d,h,type}=p;
  if(type==='creform'){
   const s=CREForm[p.variant],px=(s.innerW+.028)/2,pz=(s.innerD+.028)/2;
   for(const y of[...s.levels,h-.04])for(const u of[-px,px])for(const v of[-pz,pz])box(x+u,y,z+v,.043,.048,.043,0x28333c,paint,0,.005);
   const top=s.levels.at(-1),label=p.variant==='ipt'?0:p.variant==='jars'?1:2;
   text(x,top-.11,z+d/2+.005,w*.77,.14,['SAMPLE SUPPLIES','SAMPLE VESSELS','SUPPLY REQUEST'][label]);
   for(let i=0;i<2;i++){const cx=x+(i-.5)*.30;// Tote bodies are already rendered from their physical records.
   box(cx,top+.196,z,.245,.006,Math.min(.32,d-.10),0xe5e8db);for(let k=0;k<3;k++)box(cx-.075+k*.075,top+.209,z,.045,.02,.16,0xd5dfd8);}
  }else if(type==='bins'){
   for(let k=0;k<3;k++){const u=x+(k-1)*w/3;plane(u,.54,z+d/2-.055,.27,.25,labelMat,3);box(u,.82,z-.10,w/3-.11,.012,.13,0xb7a852);}
  }else if(type==='pallet'){
   // Detailed pallet base is supplied by the licensed reuse adapter.
  }else if(type==='shelf'){
   plane(x,h-.08,z+d/2+.02,w*.65,.15,labelMat,8);
  }else if(type==='planter'){
   // Existing pot is already a collision record; start foliage above it.
   plant(x,.20,z,1.05);
  }else if(type==='kitchen'){
   for(let k=0;k<3;k++){const u=x+(k-1)*w*.30;box(u,h*.52,z+d/2+.007,w*.29,h*.86,.018,0xe4e4d9);rod([u-.09,h-.14,z+d/2+.026],[u+.09,h-.14,z+d/2+.026],.008,0x767f80,metal);}
   box(x-w*.28,h+.04,z,.43,.012,.34,0x53696b);rod([x-w*.28,h+.05,z-.12],[x-w*.28,h+.30,z-.12],.012,0xc2c9c8,metal);rod([x-w*.28,h+.30,z-.12],[x-w*.28,h+.30,z+.04],.012,0xc2c9c8,metal);
   box(x+w*.25,h+.23,z-.04,.34,.39,.31,0x303b40,paint,0,.025);box(x+w*.25,h+.24,z+.123,.28,.21,.012,0x101d25);box(x+w*.25,h+.13,z+.17,.26,.025,.14,0xa9afad,metal);mug(x+w*.25,h+.145,z+.17);text(x+w*.25,h+.36,z+.13,.26,.055,'COFFEE');
  }else if(type==='fridge'){
   box(x,h*.68,z+d/2+.013,w-.045,h*.59,.025,0xd4dedb,paint,0,.01);box(x,h*.17,z+d/2+.013,w-.045,h*.30,.025,0xd4dedb,paint,0,.01);rod([x-w*.30,h*.48,z+d/2+.06],[x-w*.30,h*.75,z+d/2+.06],.012,0x7a8789,metal);plane(x+w*.08,h*.76,z+d/2+.03,.18,.20,labelMat,13);
  }else if(type==='locker'){
   for(let k=0;k<3;k++){const u=x+(k-1)*w/3;box(u,h/2,z+d/2+.005,w/3-.025,h-.08,.018,0x758b94);for(let q=0;q<4;q++)box(u,h-.17-q*.027,z+d/2+.017,w*.20,.009,.004,0x405864);box(u+w*.09,h*.53,z+d/2+.03,.018,.10,.026,0xced4cf,metal);}
   if(p.roomId==='I12')plane(x,h*.72,z+d/2+.02,.28,.25,labelMat,15);
  }else if(type==='credenza'){
   box(x,h+.08,z,w*.8,.12,d*.72,0x243c48,paint,0,.01);for(let k=0;k<4;k++)binder(x-w*.34+k*.08,h+.14,z,[C.teal,C.blue,0xb69264,C.cream][k]);
   mug(x+w*.29,h+.05,z+.03);
  }else if(type==='sink'){
   box(x,h+.055,z,.49,.012,.30,0x6f9293,paint,0,.04);rod([x,h+.04,z-.11],[x,h+.28,z-.11],.012,C.steel,metal);rod([x,h+.28,z-.11],[x,h+.28,z+.05],.012,C.steel,metal);box(x+.24,h+.12,z-.06,.06,.18,.06,0x8cafba,paint,0,.012);
  }else if(type==='sofa'){
   for(const u of[-.4,0,.4])box(x+u,h*.55,z-.03,.37,.12,d-.15,0x5c9590,fabric,0,.035);box(x+w*.30,.76,z+d*.23,.28,.30,.09,0xd2ac78,fabric,.1,.025);
  }
 }
 // All wall displays are individually planned against opaque wall segments.
 for(const m of world.living.mounts){
  const nx=Math.sin(m.yaw),nz=Math.cos(m.yaw),tile=m.kind==='values'?VALUE_TILES[m.variant]:ART_TILES[m.kind]??5;
  box(m.x,m.y,m.z,m.w+.045,m.h+.045,.025,0x2d424b,paint,m.yaw,.006);
  const faceX=m.x+nx*.016,faceZ=m.z+nz*.016;
  if(m.kind==='display')plane(faceX,m.y,faceZ,m.w,m.h,screen,null,m.yaw);
  else plane(faceX,m.y,faceZ,m.w,m.h,paper,tile,m.yaw);
  if(['board','labboard','freightboard'].includes(m.kind))box(m.x+nx*.06,m.y-m.h/2-.035,m.z+nz*.06,m.w*.7,.025,.10,C.steel,metal,m.yaw);
 }
 // Work surfaces get coherent clusters, not random objects floating in aisles.
 const surfaces=world.data.obstacles.filter(o=>o.kind==='excluded-desk-area'||['lab-bench','bench'].includes(o.kind)||['I01','I02','I04'].includes(o.roomId));
 for(const o of surfaces){
  const [x0,z0,x1,z1]=bounds(o.polygon),w=x1-x0,d=z1-z0,room=o.roomId||'I26',seed=hash(o.id);
  if(w<.5||d<.35)continue;
  const parts=world.description.boxes.filter(b=>b.id.startsWith(o.id+'-'));
  const y=room==='I26'?.84:.91;
  if(parts.some(b=>b.y+b.h/2>1.6&&b.w>w*.45)){
   // Instrument faces gain module seams, small controls, vents and a service label.
   const b=parts.find(b=>/cabinet-glass/.test(b.id));if(b){for(let i=0;i<5;i++){const xx=b.x+(i-2)*b.w/5;box(xx,b.y,b.z-b.d/2-.008,.009,b.h*.82,.009,0x7a8f96,metal);box(xx+.035,b.y+b.h*.30,b.z-b.d/2-.014,.013,.016,.008,0x75c9ac,glow);}counts.labDetails++;}continue;
  }
  const x=x0+.22,z=z1-.20;
  if(room==='I26'){
   for(let i=0;i<3;i++)binder(x+i*.075,y,z,[0x406b82,0x667f75,0xc1aa78][i]);
   plane(Math.min(x+.45,x1-.16),y+.006,z,.22,.28,paper,5,0,true);mug(Math.min(x+.80,x1-.12),y,z);
   if(seed%3===0&&w>1.5)plant(x1-.22,y,z0+.22,.30);counts.deskDetails++;
  }else{
   // Generic demo rack and capped tubes; no contents, volumes or SOP assertions.
   box(x,y+.035,z,.27,.07,.18,0x91b6b8,paint,0,.008);
   for(let row=0;row<2;row++)for(let k=0;k<5;k++){const tx=x-.10+k*.05,tz=z-.045+row*.09;add(new THREE.CylinderGeometry(.012,.009,.09,7),paint,tx,y+.105,tz,{},0xe2e9e3);add(new THREE.CylinderGeometry(.014,.014,.018,7),paint,tx,y+.155,tz,{},row?0x7aa8b8:0xd8c375);}
   if(w>1.05){box(x+.46,y+.10,z,.23,.20,.16,0x8fbdc7,paint,0,.012);plane(x+.46,y+.11,z+.082,.18,.12,labelMat,5);}
   counts.labDetails++;
  }
 }
 // Opaque walls receive skirting and ceiling reveals. Exact original spans remain.
 for(const b of world.description.boxes.filter(b=>/^WALL-\d+$/.test(b.id)&&b.material==='wall'&&b.w>.6)){
  const yaw=b.angle||0,nx=Math.sin(yaw),nz=Math.cos(yaw);
  for(const side of[-1,1]){
   const x=b.x+nx*side*(b.d/2+.008),z=b.z+nz*side*(b.d/2+.008),space=world.roomAt(x+nx*side*.15,z+nz*side*.15);
   if(!space)continue;
   box(x,.105,z,b.w,.16,.016,0x59696d,paint,yaw);box(x,2.70,z,b.w,.025,.012,0x9aa6a3,paint,yaw);counts.architecturalDetails++;
  }
 }
 // Source-inspired freight facade. These are CLOSED decorative panels on the
 // existing north/west opaque walls, not new accessible exits or another cabin.
 const r12=world.data.rooms.find(r=>r.id==='I12');if(r12){
  const [x0,z0,x1,z1]=bounds(r12.polygon),cx=(x0+x1)/2,z=z0+.09;
  const liftX=cx+1.04;
  box(liftX,1.33,z,2.94,2.64,.065,0x263c48,metal);
  for(const side of[-1,1]){
   const dx=liftX+side*.70;box(dx,1.31,z+.045,1.365,2.52,.055,0x315c73,metal,0,.014);box(dx,.30,z+.080,1.30,.43,.009,0xaeb9b8,metal);
   if(!refinedFreight)box(dx,2.12,z+.078,.50,.08,.035,0xdbdfd7,paint);rod([dx-side*.40,1.04,z+.105],[dx-side*.40,1.35,z+.105],.014,0xb7c3c5,metal);
   if(!refinedFreight)text(dx,1.77,z+.08,.65,.20,side<0?'CARGO LIFT':'TRANSIT LIFT');
   for(const y of[.22,1.30,2.35])box(dx+side*.60,y,z+.09,.055,.14,.030,0xb9c3c5,metal);
  }
  // Focused freight front: separated inner panels, recessed seams, rubber seals
  // and brushed kick plates. All stay within the existing closed facade.
  for(const side of[-1,1]){
   const dx=liftX+side*.70;
   box(dx,1.38,z+.079,1.22,1.22,.012,0x264d64,paint,0,.008);
   box(dx,1.39,z+.087,1.17,1.16,.004,0x3d667d,metal,0,.004);
   box(liftX+side*1.45,1.32,z+.095,.065,2.65,.045,0x879ba2,metal,0,.007);
   box(liftX+side*.016,1.30,z+.087,.023,2.50,.012,0x111f26);
   for(const yy of[.15,.49])for(const u of[-.53,.53])add(new THREE.CylinderGeometry(.009,.009,.006,12),metal,dx+u,yy,z+.091,{x:Math.PI/2},0x647d86);
   for(const yy of[.30,1.10,2.22])box(liftX+side*1.25,yy,z+.107,.11,.20,.04,0x6c838c,metal,0,.009);
  }
  box(liftX,2.63,z+.10,2.96,.065,.07,0x879ba2,metal,0,.008);
  box(liftX,.025,z+.16,2.97,.028,.20,0xa9b4b6,metal,0,.004);
  for(let k=0;k<8;k++)box(liftX,.042,z+.085+k*.022,2.83,.002,.005,0x3a4e59);
  if(!refinedFreight){text(cx-3.0,1.92,z+.04,.72,.48,'05',0,'#e7e5dc','#264b61');
    text(cx-3.0,1.52,z+.04,1.10,.12,'UNIT 05 / SUPPLIES',0,'#e7e5dc','#264b61');}
  box(liftX,2.71,z+.08,.46,.20,.045,0x20343e);text(liftX,2.71,z+.105,.31,.16,'5',0,'#152730','#8fdbb8');
  box(liftX+1.67,1.31,z,.16,.44,.07,0xc1c5bd,metal);for(const y of[1.22,1.37])add(new THREE.SphereGeometry(.023,8,6),glow,liftX+1.67,y,z+.055,{},y<1.3?0x70c39d:0xcf5547);
  for(const yy of[2.45,2.57])for(let xx=x0+.55;xx<x1-.35;xx+=.78){box(xx,yy,z0+.15,.04,.07,.04,0x687c80,metal,0,.005);}
  const redX=cx-1.84;box(redX,1.13,z,1.34,2.26,.065,0x8d282d,paint);box(redX,1.09,z+.046,1.22,2.10,.035,0xb54540,paint,0,.005);rod([redX-.50,.99,z+.10],[redX+.50,.99,z+.10],.017,0xc8bba2,metal);text(redX,2.40,z+.06,1.15,.24,'SERVICE',0,'#eaece3','#314d4f');
  // West blue double door appearance from the reference, kept sealed by source walls.
  const wz=z1-1.50,wx=x0+.10;for(const s of[-1,1])box(wx,1.14,wz+s*.53,1.04,2.24,.065,0x225d85,paint,Math.PI/2,.009);if(!refinedFreight)text(wx+.05,1.82,wz,1.45,.22,'MATERIAL',Math.PI/2);
  for(const y of[2.45,2.57])rod([x0+.18,y,z0+.16],[x1-.18,y,z0+.16],.025,0xc6c9c3,metal);
  rod([x1-.22,2.55,z0+.16],[x1-.22,2.55,z1-.20],.022,0xb9beb8,metal);
  for(const p of world.living.props.filter(p=>p.roomId==='I12')){
   const pw=p.w+.17,pd=p.d+.17,col=p.type==='bins'?0xe4bd3d:p.type==='pallet'?0x58b087:0x478fb1;
   for(const side of[-1,1]){box(p.x,.016,p.z+side*pd/2,pw,.003,.035,col);box(p.x+side*pw/2,.016,p.z,.035,.003,pd,col);}
  }
  for(const p of world.living.props.filter(p=>p.roomId==='I12')){
   if(p.type==='bins')for(let k=0;k<3;k++){
    const u=p.x+(k-1)*p.w/3,front=p.z+p.d/2-.054;
    box(u,.80,front,.31,.065,.025,0x34434a,paint,0,.011);
    for(const side of[-1,1])box(u+side*.245,.44,front-.012,.022,.52,.028,0xd0a523,paint,0,.009);
    text(u,.66,front+.006,.35,.055,['RETURN','MATERIAL','EMPTY'][k],0,'#e8e6d7','#244b61');
   }
   if(p.type==='creform'){
    for(const side of[-1,1])box(p.x+side*(p.w/2-.015),.14,p.z+p.d/2-.02,.07,.12,.06,0x909e9f,metal,0,.01);
   }
  }
  // A floor lane is clipped to I12, not interpreted as a validated escape route.
  const laneX=liftX;
  for(let iz=z0+1;iz<z1-1;iz+=.45)for(const side of[-1,1])box(laneX+side*.62,.018,iz,.025,.003,.23,0x6bb9b0);
  text(cx,2.42,z1-.075,2.4,.28,'Technical Storage',Math.PI,'#153e54','#f0f1e5');
 }
 // The existing D38 approach receives a restrained wayfinding/header band.
 const freightDoor=world.data.doors.find(d=>d.id==='D38');
 if(freightDoor){const [x,z]=freightDoor.center,alongX=Math.abs(freightDoor.b[0]-freightDoor.a[0])>.1,yaw=alongX?0:Math.PI/2;
  const nx=Math.sin(yaw),nz=Math.cos(yaw);
  text(x+nx*.105,2.54,z+nz*.105,freightDoor.width+.42,.15,'Technical Storage',yaw,'#264b61','#f0efe4');
  for(const side of[-1,1]){
   const dx=x+Math.cos(yaw)*side*(freightDoor.width/2+.045),dz=z-Math.sin(yaw)*side*(freightDoor.width/2+.045);
   box(dx,1.18,dz,.055,2.36,.085,0x597382,metal,yaw,.006);
  }
 }
 // Ceiling tile grid uses a shared original texture, not another layer of geometry.
 const ct=document.createElement('canvas');ct.width=ct.height=256;const cc=ct.getContext('2d');cc.fillStyle='#e3e5de';cc.fillRect(0,0,256,256);cc.fillStyle='#adb7b4';cc.fillRect(0,0,256,3);cc.fillRect(0,0,3,256);cc.fillStyle='#f5f4e9';cc.fillRect(4,4,248,1);cc.fillRect(4,4,1,248);for(let i=0;i<230;i++){cc.fillStyle=i%2?'#d7ddd6':'#e9eae3';cc.fillRect((i*71)%251,(i*113)%251,1,1);}
 const ceilingTexture=new THREE.CanvasTexture(ct);ceilingTexture.colorSpace=THREE.SRGBColorSpace;ceilingTexture.wrapS=ceilingTexture.wrapT=THREE.RepeatWrapping;ceilingTexture.repeat.set(1/.62,1/.62);ceilingTexture.anisotropy=4;
 const ceilingReplacements=new Map();
 function decorateCeilings(scene){scene.traverse(o=>{if(!o.isMesh||!o.material||Array.isArray(o.material)||o.material.userData?.category!=='ceiling')return;let m=ceilingReplacements.get(o.material);if(!m){m=o.material.clone();m.name='living-ceiling-grid';m.map=ceilingTexture;m.color.setHex(0xebece4);m.roughness=.94;ceilingReplacements.set(o.material,m);owned.push(m);}o.material=m;});}
 let triangles=0;
 for(const [key,b] of batches){const g=mergeGeometries(b.parts,false);b.parts.forEach(g=>g.dispose());if(!g)throw new Error('Living-floor batch mismatch: '+key);g.computeBoundingSphere();const m=new THREE.Mesh(g,b.m);m.name='living-batch-'+key;m.castShadow=b.cast;m.receiveShadow=!b.m.isMeshBasicMaterial;root.add(m);triangles+=g.attributes.position.count/3;}
 const report={...counts,triangles,drawBatches:root.children.length,coveredAreas:Object.keys(world.living.coverage).length,source:'Hissrum12 V5.0.2 + Danaher CoC p.3 + original decorative geometry',metricReconstruction:false};
 let disposed=false;
 return {root,report,decorateCeilings,update:art.update,dispose(){if(disposed)return;disposed=true;for(const m of root.children)m.geometry?.dispose();for(const m of owned){if(m.name.startsWith('living-text'))m.map?.dispose();m.dispose();}ceilingTexture.dispose();art.dispose();root.clear();}};
}
