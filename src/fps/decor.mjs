/** Cosmetic office/lab props, attached to accepted furniture and existing walls.
 * No collision/nav records, random gameplay input, private screen data or external assets.
 * Geometry is merged per room/material for culling and bounded draw calls.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {planSmokeDetectors} from './smoke-detectors.mjs';
import { applyMetreUV } from './materials.mjs';

const bounds=p=>[Math.min(...p.map(v=>v[0])),Math.min(...p.map(v=>v[1])),Math.max(...p.map(v=>v[0])),Math.max(...p.map(v=>v[1]))];
const hash=text=>[...String(text)].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
function canvasMap(draw,w=1024,h=512){const c=document.createElement('canvas');c.width=w;c.height=h;draw(c.getContext('2d'),w,h);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;return t;}
function screenAtlas(){return canvasMap(c=>{for(let k=0;k<4;k++){
 const x=k*256;c.fillStyle=['#132732','#142b30','#203346','#242a31'][k];c.fillRect(x,0,256,512);
 c.fillStyle='#7da6a8';c.fillRect(x+12,18,232,29);c.fillStyle='#d1e0dc';c.font='bold 11px sans-serif';c.fillText(['WORKSPACE · 05','LAB · DEMO','PROJECT NOTES','SYSTEM OVERVIEW'][k],x+18,38);
 c.fillStyle='#25434a';c.fillRect(x+12,62,57,431);c.fillStyle='#86a6a7';c.font='9px sans-serif';for(let i=0;i<6;i++)c.fillText(['HOME','FILES','TASKS','STATUS','LOG','HELP'][i],x+18,83+i*29);
 if(k===1){c.strokeStyle='#75c5ad';c.lineWidth=2;c.beginPath();for(let i=0;i<150;i++){const px=x+81+i,py=240-Math.sin(i*.07)*12-65/(1+Math.exp(-(i-65)/9));i?c.lineTo(px,py):c.moveTo(px,py);}c.stroke();for(let i=0;i<4;i++){c.fillStyle=i===2?'#d1ae6b':'#6faaa1';c.fillRect(x+84,280+i*36,135-i*13,12);}}
 else if(k===2){c.fillStyle='#cad6d1';c.fillRect(x+80,70,161,402);c.fillStyle='#3e5b65';for(let i=0;i<12;i++)c.fillRect(x+92,93+i*25,100+(i%3)*10,3);}
 else{for(let row=0;row<10;row++){c.fillStyle=row%2?'#234751':'#1c363f';c.fillRect(x+80,76+row*33,160,27);c.fillStyle=row%3?'#7ca7ab':'#e2b46f';c.fillRect(x+87,84+row*33,70+(row%3)*23,5);}}
 c.fillStyle='#657d81';c.font='9px sans-serif';c.fillText('SYNTHETIC / OFFLINE',x+82,492);
}},1024,512);}
function paperAtlas(){return canvasMap(c=>{for(let k=0;k<4;k++){const x=k*256;c.fillStyle=k===3?'#dce4df':'#e9e5d9';c.fillRect(x,0,256,512);c.fillStyle='#4b6269';c.font='bold 18px sans-serif';c.fillText(['NOTES','WEEK 05','CARTRIDGE','TEAM BOARD'][k],x+20,45);c.font='12px sans-serif';c.fillText(k===2?'DEMO / EMPTY':'UNIT 05',x+20,70);for(let i=0;i<12;i++){c.fillStyle=i%4?'#8b9c9b':'#537e87';c.fillRect(x+22,100+i*25,132+(i%4)*17,3);}if(k===3){c.strokeStyle='#497e83';c.lineWidth=3;c.strokeRect(x+22,135,92,95);c.strokeRect(x+138,280,94,80);c.beginPath();c.moveTo(x+114,180);c.lineTo(x+180,180);c.lineTo(x+180,280);c.stroke();}c.fillStyle='#a2aca5';c.font='10px sans-serif';c.fillText('FICTIONAL CONTENT',x+20,485);}},1024,512);}

export function buildDecor(world,registry){
 const group=new THREE.Group();group.name='cosmetic-room-details';
 const batches=new Map(),ownedMaterials=new Set(),ownedTextures=new Set(),counts={screens:0,cups:0,files:0,coats:0,cables:0,cartridgeBoxes:0,whiteboards:0,scuffs:0,smokeDetectors:0};
 const own=(params)=>{const m=new THREE.MeshStandardMaterial(params);ownedMaterials.add(m);return m;};
 const maps={screen:screenAtlas(),paper:paperAtlas()};Object.values(maps).forEach(t=>ownedTextures.add(t));
 const mats={white:registry.get('table'),dark:registry.get('polymer'),steel:registry.get('metal'),
  cup:registry.get('table',{color:0xabb7aa,roughness:.29}),coffee:registry.get('polymer',{color:0x37251b,roughness:.22}),
  folder:registry.get('table',{color:0x567881,roughness:.86}),coat:registry.get('fabric',{color:0x6b6154}),
  paper:own({map:maps.paper,roughness:.94}),screen:own({map:maps.screen,emissiveMap:maps.screen,emissive:0xffffff,emissiveIntensity:.32,roughness:.35}),
  scuff:own({color:0x505e61,transparent:true,opacity:.035,roughness:.98,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1})};
 function append(room,geometry,material,x,y,z,rotation={}){
  let g=geometry.index?geometry.toNonIndexed():geometry; if(g!==geometry)geometry.dispose();
  const matrix=new THREE.Matrix4().compose(new THREE.Vector3(x,y,z),new THREE.Quaternion().setFromEuler(new THREE.Euler(rotation.x||0,rotation.y||0,rotation.z||0)),new THREE.Vector3(1,1,1));g.applyMatrix4(matrix);
  const key=`${room}:${material.uuid}`;if(!batches.has(key))batches.set(key,{room,material,parts:[]});batches.get(key).parts.push(g);
 }
 function box(room,x,y,z,w,h,d,material,yaw=0){append(room,applyMetreUV(new THREE.BoxGeometry(w,h,d)),material,x,y,z,{y:yaw});}
 function plane(room,x,y,z,w,h,material,tile=0,rotation={}){
  const geo=new THREE.PlaneGeometry(w,h),uv=geo.getAttribute('uv');for(let i=0;i<uv.count;i++)uv.setX(i,(uv.getX(i)+tile)/4);append(room,geo,material,x,y,z,rotation);
 }
 function cup(room,x,y,z){
  append(room,new THREE.CylinderGeometry(.037,.031,.088,12,1,true),mats.cup,x,y+.044,z);
  append(room,new THREE.TorusGeometry(.035,.004,4,12),mats.cup,x,y+.089,z,{x:Math.PI/2});
  append(room,new THREE.CircleGeometry(.031,12),mats.coffee,x,y+.074,z,{x:-Math.PI/2});
  append(room,new THREE.TorusGeometry(.024,.007,5,12),mats.cup,x+.041,y+.05,z);counts.cups++;
 }
 function folder(room,x,y,z,variant,yaw=.1){
  box(room,x,y+.013,z,.23,.026,.3,mats.folder,yaw);
  plane(room,x,y+.028,z,.205,.278,mats.paper,variant,{x:-Math.PI/2,z:-yaw});counts.files++;
 }
 function cable(room,x,y,z,yaw=0){
  const points=[[-.02,0,0],[.06,-.015,.04],[.10,-.06,.08],[.06,-.14,.11],[0,-.24,.09]].map(p=>new THREE.Vector3(...p));
  append(room,new THREE.TubeGeometry(new THREE.CatmullRomCurve3(points),9,.004,4,false),mats.dark,x,y,z,{y:yaw});counts.cables++;
 }
 const boxes=world.description.boxes;
 for(const b of boxes.filter(b=>b.id.endsWith('-screen')&&b.w>.2&&b.h>.12)){
  const room=b.roomId||world.roomAt(b.x,b.z)?.id||'C01',seed=hash(b.id),yaw=b.angle||0;
  const nx=Math.sin(yaw),nz=Math.cos(yaw),front=b.d/2+.004;
  plane(room,b.x+nx*front,b.y,b.z+nz*front,b.w*.89,b.h*.84,mats.screen,seed%4,{y:yaw});counts.screens++;
  cable(room,b.x,b.y-b.h*.5,b.z-.03,yaw);
  const deskY=b.y-.30,ox=Math.cos(yaw)*.36,oz=-Math.sin(yaw)*.36;
  // The inherited bench envelope is the authority; skip anything that would spill into aisles.
  const obstacle=world.data.obstacles.find(o=>b.id.startsWith(o.id+'-'));
  const envelope=obstacle?bounds(obstacle.polygon):null;
  const cx=b.x+ox,cz=b.z+oz+.19*Math.cos(yaw);
  const fits=envelope&&cx-.13>envelope[0]&&cx+.13<envelope[2]&&cz-.17>envelope[1]&&cz+.17<envelope[3];
  if(fits){if(seed%3===0)cup(room,cx,deskY+.006,cz);else folder(room,cx,deskY+.008,cz,seed%3,(seed%5-2)*.07);}
 }
 // Freestanding conference tables and inherited bench-top patches stay inside their exact footprint.
 for(const f of world.furnishings.instances){
  if(['meeting-table','pantry-table','desk'].includes(f.prefab)){
   const {x,z}=f.transform,room=f.roomId,w=Math.max(.3,f.footprint.w-.92),seed=hash(f.id);
   folder(room,x-w*.20,.79,z+.08,seed%3,-.12);if(w>.8)cup(room,x+w*.27,.79,z-.13);
  }
 }
 // Jackets follow existing chair back planes; the footprint remains unchanged.
 for(const b of boxes.filter(b=>b.id.endsWith('-back')&&b.material==='fabric'&&hash(b.id)%7===0)){
  const room=b.roomId||world.roomAt(b.x,b.z)?.id||'I26',yaw=b.angle||0;
  const shape=new THREE.Shape();shape.moveTo(-.12,.20);shape.lineTo(-.21,.11);shape.lineTo(-.17,-.11);shape.lineTo(-.11,-.06);shape.lineTo(-.12,-.29);shape.lineTo(.12,-.28);shape.lineTo(.11,-.05);shape.lineTo(.17,-.11);shape.lineTo(.21,.11);shape.lineTo(.12,.20);shape.lineTo(.04,.16);shape.lineTo(-.04,.16);shape.closePath();
  append(room,new THREE.ExtrudeGeometry(shape,{depth:.018,bevelEnabled:true,bevelSegments:1,steps:1,bevelSize:.008,bevelThickness:.006}),mats.coat,b.x,b.y+.12,b.z+b.d/2+.005,{y:yaw});counts.coats++;
 }
 // Small whiteboards mounted to existing solid wall surfaces facing the room.
 for(const roomId of ['I14','I16','I17','I22','I24']){
  const room=world.data.rooms.find(r=>r.id===roomId);if(!room)continue;
  const centre={x:room.polygon.reduce((s,p)=>s+p[0],0)/room.polygon.length,z:room.polygon.reduce((s,p)=>s+p[1],0)/room.polygon.length};
  const candidates=world.data.walls.filter(w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>1.8).map(w=>{const x=(w.a[0]+w.b[0])/2,z=(w.a[1]+w.b[1])/2;return {w,x,z,dist:Math.hypot(x-centre.x,z-centre.z)};}).sort((a,b)=>a.dist-b.dist);
  for(const c of candidates.slice(0,5)){
   const dx=c.w.b[0]-c.w.a[0],dz=c.w.b[1]-c.w.a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length,sign=(centre.x-c.x)*nx+(centre.z-c.z)*nz>0?1:-1;
   const x=c.x+nx*sign*.15,z=c.z+nz*sign*.15;
   if(world.roomAt(x,z)?.id!==roomId)continue;
   const hit=world.raycast({x,y:1.65,z},{x:-nx*sign,y:0,z:-nz*sign},.5,{vision:false});if(!hit||!String(hit.id).startsWith('WALL-'))continue;
   const surface=world.description.boxes.find(b=>b.id===hit.id);if(!surface||surface.material!=='wall')continue;
   const yaw=Math.atan2(nx*sign,nz*sign),px=hit.point.x+nx*sign*.016,pz=hit.point.z+nz*sign*.016;
   box(roomId,px,1.65,pz,1.45,.86,.023,mats.steel,yaw);
   plane(roomId,px+nx*sign*.014,1.65,pz+nz*sign*.014,1.38,.79,mats.paper,3,{y:yaw});counts.whiteboards++;break;
  }
 }
 // Restrained sole scuffs beside furniture and at accepted door approaches, on real floor only.
 for(const d of world.data.doors.filter(d=>hash(d.id)%3===0)){
  const x=d.center[0],z=d.center[1];if(!world.canOccupy(x,z,.16))continue;
  const room=world.roomAt(x,z)?.id||'C01',g=new THREE.PlaneGeometry(.025,.19);
  append(room,g,mats.scuff,x-.05,.012,z,{x:-Math.PI/2,z:.35});counts.scuffs++;
 }
 // Two shared low-poly white shells and a recessed vent ring, merged with room decor.
 // Their top is flush to existing ceilings; nothing reaches player height.
 const detectorPlan=planSmokeDetectors(world),detectorWhite=registry.get('table',{color:0xf1f1eb,roughness:.72});
 const detectorParts=[
  {geometry:new THREE.CylinderGeometry(.13,.13,.022,12),material:detectorWhite,drop:.011},
  {geometry:new THREE.CylinderGeometry(.108,.096,.025,12),material:mats.dark,drop:.0345},
  {geometry:new THREE.CylinderGeometry(.10,.086,.025,12),material:detectorWhite,drop:.0495}
 ];
 for(const p of detectorPlan){
  for(const part of detectorParts)append(p.roomId,part.geometry.clone(),part.material,p.x,p.y-part.drop,p.z);
  counts.smokeDetectors++;
 }
 detectorParts.forEach(p=>p.geometry.dispose());
 let triangles=0;
 for(const {room,material,parts} of batches.values()){
  const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());if(!geometry)continue;
  geometry.computeBoundingSphere();const mesh=new THREE.Mesh(geometry,material);mesh.name=`decor-${room}`;mesh.receiveShadow=true;mesh.castShadow=material!==mats.scuff&&material!==mats.screen;
  group.add(mesh);triangles+=geometry.getAttribute('position').count/3;
 }
 group.userData={cosmetic:true,counts,detectorPlan,drawCalls:group.children.length,triangles,dispose(){for(const child of group.children)child.geometry.dispose();for(const mat of ownedMaterials)mat.dispose();for(const tex of ownedTextures)tex.dispose();group.clear();}};
 return group;
}
