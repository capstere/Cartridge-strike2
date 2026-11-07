import {ROOM_NAMES} from './player-names.mjs';
/** Render-only study of PQC/GX. Every panel is supported by an existing face.
 * Source geometry, collision, navigation and light count are never modified.
 * Generic instrument markings are fictional game dressing, not equipment records.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { insidePolygon } from './physics.mjs';
import { applyMetreUV } from './materials.mjs';

export const ROOM_VISUAL_IDS = Object.freeze(['I01','I02']);
const palettes = {
 I01:{floor:0xc0c9b7,body:0xe3e4db,accent:0x688079,edge:0x87948d,tile:1},
 I02:{floor:0xb3c7ce,body:0xe5e8e5,accent:0x687f91,edge:0x85969e,tile:0},
};
const hash=s=>[...s].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,13);
function clipToCeiling(subject,clip){
 const signed=clip.reduce((sum,p,i)=>{const q=clip[(i+1)%clip.length];return sum+p[0]*q[1]-q[0]*p[1];},0),sign=signed>0?1:-1;
 let result=subject;
 for(let i=0;i<clip.length&&result.length;i++){
  const a=clip[i],b=clip[(i+1)%clip.length],side=p=>sign*((b[0]-a[0])*(p[1]-a[1])-(b[1]-a[1])*(p[0]-a[0])),out=[];
  for(let j=0;j<result.length;j++){
   const p=result[j],q=result[(j+1)%result.length],sp=side(p),sq=side(q);
   if(sp>=-1e-8)out.push(p);
   if((sp<0)!==(sq<0)){const t=sp/(sp-sq);out.push([p[0]+(q[0]-p[0])*t,p[1]+(q[1]-p[1])*t]);}
  }result=out;
 }return result;
}
const point=(b,u,v,y)=>{const a=b.angle||0;return [b.x+u*Math.cos(a)+v*Math.sin(a),y,b.z-u*Math.sin(a)+v*Math.cos(a)];};
const face=(b,side,width,height,y,offset=.002)=>{
 const v=side*(b.d/2+offset),u=width/2;
 return side>0?[point(b,-u,v,y-height/2),point(b,u,v,y-height/2),point(b,u,v,y+height/2),point(b,-u,v,y+height/2)]:
  [point(b,u,v,y-height/2),point(b,-u,v,y-height/2),point(b,-u,v,y+height/2),point(b,u,v,y+height/2)];
};

/** Pure data plan; CPU tests can check supported surfaces without a WebGL context. */
export function createRoomVisualPlan(world){
 const {data,description}=world,rooms=new Map(data.rooms.filter(r=>ROOM_VISUAL_IDS.includes(r.id)).map(r=>[r.id,r]));
 const obstacles=data.obstacles.filter(o=>rooms.has(o.roomId));
 const owner=b=>rooms.has(b.roomId)?b.roomId:obstacles.find(o=>b.id.startsWith(o.id+'-'))?.roomId;
 const contains=(id,points)=>points.every(p=>insidePolygon(p[0],p[2],rooms.get(id).polygon));
 const overrides=new Map(),panels=[],shadows=[],finishes=[],counts={roomSigns:0,benchLabels:0,instrumentPanels:0,contacts:0,wallBases:0,corners:0,ceilingEdges:0,wallFinishes:0,ceilingFinishes:0,doorFinishes:0};
 const material=(id,category,options)=>overrides.set(id,{category,options});
 const panel=(roomId,host,points,tile,kind)=>{panels.push({roomId,hostId:host.id,points,tile,kind});counts[kind]++;};
 const shade=(roomId,host,points,alpha,kind)=>{
  if(!contains(roomId,points))return;
  shadows.push({roomId,hostId:host.id,points,alpha,kind});counts[kind]++;
 };
 const finish=(roomId,host,points,color,kind)=>{finishes.push({roomId,hostId:host.id,points,color,kind});counts[kind]++;};
 for(const id of ROOM_VISUAL_IDS){
  material('finish-'+id,'labVinyl',{color:palettes[id].floor,side:THREE.DoubleSide});
  // The room polygon only masks the existing ceiling plane: no new volume.
  for(const ceiling of description.surfaces.filter(s=>s.material==='ceiling')){
   const polygon=clipToCeiling(rooms.get(id).polygon,ceiling.polygon);
   const area=Math.abs(polygon.reduce((sum,p,i)=>{const q=polygon[(i+1)%polygon.length];return sum+p[0]*q[1]-q[0]*p[1];},0))/2;
   if(area>1e-6)finish(id,ceiling,polygon.map(p=>[p[0],ceiling.y-.002,p[1]]),0xf4f3e9,'ceilingFinishes');
  }
 }
 for(const b of description.boxes){
  const roomId=owner(b);if(!roomId)continue;
  const palette=palettes[roomId],id=b.id;
  // The inherited builder uses "wall" for instrument pieces, including colored
  // modules. Classify those pieces here instead of tinting architectural walls.
  if(/-cabinet-glass$/.test(id))material(id,'polymer',{color:0x263941,roughness:.34,metalness:.12});
  else if(/-module\d+-\d+$/.test(id))material(id,'table',{color:hash(id)%5===0?0x90a49c:palette.accent,roughness:.48});
  else if(/-(instrument|instrument-small|hood)$/.test(id)||/-instrument-red-cap$/.test(id))material(id,'table',{color:id.endsWith('-red-cap')?0x7a3934:palette.body,roughness:.49});
  else if(/-edge\d+$/.test(id))material(id,'table',{color:palette.edge,roughness:.58});
  else if(/-(display|screen)$/.test(id))material(id,'polymer',{color:0x182a32,roughness:.32,metalness:.08});
  if(/-instrument$/.test(id)&&b.h<1){
   panel(roomId,b,face(b,-1,b.w*.76,b.h*.47,b.y+.015),2+palette.tile,'instrumentPanels');
  }
  if(/-cabinet-glass$/.test(id)){
   // A narrow control header lies on the existing cabinet face, above its modules.
   panel(roomId,b,face(b,-1,b.w*.9,.16,b.y+b.h/2-.10),2+palette.tile,'instrumentPanels');
  }
  if(/-edge\d+$/.test(id)&&b.w>.75&&b.h>=.045&&hash(id)%2===0){
   panel(roomId,b,face(b,1,Math.min(.62,b.w-.08),.038,b.y),4+palette.tile,'benchLabels');
  }
  // Existing inherited bench legs and floor-standing cabinets were omitted from
  // the old furnishingId/asset contact pass. Feather one footprint per support.
  if(!b.furnishingId&&(/-leg/.test(id)||/-instrument$/.test(id))&&b.y-b.h/2<.08){
   const inner=[-b.w/2,b.w/2,-b.d/2,b.d/2],pad=.16;
   const x0=inner[0],x1=inner[1],z0=inner[2],z1=inner[3],y=.013;
   const quad=(coords,a)=>shade(roomId,b,coords.map(([u,v])=>point(b,u,v,y)),a,'contacts');
   quad([[x0,z0],[x1,z0],[x1,z1],[x0,z1]],[.23,.23,.23,.23]);
   quad([[x0,z0],[x1,z0],[x1+pad,z0-pad],[x0-pad,z0-pad]],[.23,.23,0,0]);
   quad([[x1,z1],[x0,z1],[x0-pad,z1+pad],[x1+pad,z1+pad]],[.23,.23,0,0]);
   quad([[x0,z1],[x0,z0],[x0-pad,z0-pad],[x0-pad,z1+pad]],[.23,.23,0,0]);
   quad([[x1,z0],[x1,z1],[x1+pad,z1+pad],[x1+pad,z0-pad]],[.23,.23,0,0]);
  }
 }
 // Work on the actual rendered solid boxes, not the wall master spans: an open
 // doorway, glazing or lintel cannot accidentally acquire a floor shadow/sign.
 for(const roomId of ROOM_VISUAL_IDS){
  const candidates=[];
  for(const b of description.boxes.filter(b=>/^WALL-\d+$/.test(b.id)&&b.material==='wall'&&b.h>2&&b.w>.3))for(const side of [-1,1]){
   const v=side*(b.d/2+.004),step=.45;
   for(let u=-b.w/2+.025;u<b.w/2-.03;u+=step){
    const end=Math.min(b.w/2-.025,u+step);
    const probe=[point(b,u,v+side*.02,.1),point(b,end,v+side*.02,.1)];
    if(!contains(roomId,probe))continue;
    const cv=side*(b.d/2+.0007),coat=[point(b,u,cv,.091),point(b,end,cv,.091),point(b,end,cv,2.848),point(b,u,cv,2.848)];
    // Restrained directional paint variation gives adjacent white walls a
    // readable edge without dimming actors or adding dynamic lights.
    finish(roomId,b,coat,Math.abs(Math.sin(b.angle||0))>.7?0xd5dcd8:0xebe9de,'wallFinishes');
    const pts=[point(b,u,v,.012),point(b,end,v,.012),point(b,end,v+side*.30,.012),point(b,u,v+side*.30,.012)];
    shade(roomId,b,pts,[.24,.24,0,0],'wallBases');
    shade(roomId,b,[point(b,u,v+.001*side,2.54),point(b,end,v+.001*side,2.54),point(b,end,v+.001*side,2.846),point(b,u,v+.001*side,2.846)],[0,0,.21,.21],'ceilingEdges');
   }
   const signWidth=Math.min(2.25,b.w-.20);
   if(signWidth>1.2&&contains(roomId,face(b,side,signWidth,.45,1.93,.025))){
    candidates.push({b,side,width:signWidth,score:b.w+(roomId==='I01'&&b.x< -31?4:0)});
   }
   // Corner darkening remains a shallow surface treatment, below eye height.
   for(const direction of [-1,1]){
    const u=direction*(b.w/2-.025),p=point(b,u,v,.1);
    const joined=data.walls.some(w=>w.id!==b.id&&[w.a,w.b].some(q=>Math.hypot(q[0]-p[0],q[1]-p[2])<.18));
    if(!joined)continue;
    const inner=u-direction*Math.min(.18,b.w/3);
    shade(roomId,b,[point(b,u,v+.001*side,.10),point(b,inner,v+.001*side,.10),point(b,inner,v+.001*side,2.846),point(b,u,v+.001*side,2.846)],[.21,0,0,.16],'corners');
   }
  }
  // Recoat existing jambs and the lower lintel face. No trim crosses an aperture.
  for(const door of data.doors){
   const dx=door.b[0]-door.a[0],dz=door.b[1]-door.a[1],length=Math.hypot(dx,dz),nx=-dz/length,nz=dx/length;
   const sides=[-1,1].filter(side=>insidePolygon(door.center[0]+nx*.16*side,door.center[1]+nz*.16*side,rooms.get(roomId).polygon));
   if(!sides.length)continue;
   for(const b of description.boxes.filter(b=>b.id===door.id+'-jamb0'||b.id===door.id+'-jamb1'||b.id===door.id+'-lintel')){
    if(b.id.endsWith('lintel')){
     for(const side of sides){const aligned=(nx*Math.sin(b.angle||0)+nz*Math.cos(b.angle||0))*side>0?1:-1;finish(roomId,b,face(b,aligned,b.w,.065,b.y-b.h/2+.0325),0xa3aeac,'doorFinishes');}
     finish(roomId,b,[point(b,-b.w/2,-b.d/2,b.y-b.h/2-.002),point(b,b.w/2,-b.d/2,b.y-b.h/2-.002),point(b,b.w/2,b.d/2,b.y-b.h/2-.002),point(b,-b.w/2,b.d/2,b.y-b.h/2-.002)],0x9aa8a9,'doorFinishes');
    }else for(const side of [-1,1]){
     finish(roomId,b,face(b,side,b.w,b.h,b.y),0x98a6a6,'doorFinishes');
     const rotated={...b,angle:Math.PI/2};finish(roomId,b,face(rotated,side,b.d,b.h,b.y),0xb5bebb,'doorFinishes');
    }
   }
  }
  // Two directions make each room identifiable from its normal approaches.
  const selected=[];
  for(const candidate of candidates.sort((a,b)=>b.score-a.score)){
   if(selected.some(s=>Math.hypot(s.b.x-candidate.b.x,s.b.z-candidate.b.z)<3))continue;
   selected.push(candidate);const {b,side,width}=candidate;
   panel(roomId,b,face(b,side,width,.45,1.93,.003),palettes[roomId].tile,'roomSigns');
   if(selected.length===2)break;
  }
 }
 const finishByHost=new Map();for(const finish of finishes){if(!finishByHost.has(finish.hostId))finishByHost.set(finish.hostId,[]);finishByHost.get(finish.hostId).push(finish);}
 return {roomIds:[...ROOM_VISUAL_IDS],overrides,panels,shadows,finishes,finishByHost,counts,cosmetic:true};
}

export function roomMaterialOverride(record,registry,plan){
 const item=plan?.overrides.get(record.id);return item?registry.get(item.category,item.options):null;
}

function atlas(){
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=512;const c=canvas.getContext('2d');
 for(let tile=0;tile<6;tile++){
  const x=(tile%2)*512,y=Math.floor(tile/2)*170,green=tile%2===1;
  c.fillStyle=green?'#49675f':'#486375';c.fillRect(x,y,512,170);
  c.fillStyle=green?'#b4c3ad':'#b8cbd0';c.fillRect(x,y+153,512,17);
  c.fillStyle='#f0f0e7';c.textBaseline='middle';
  if(tile<2){c.font='bold 39px sans-serif';c.fillText(tile?ROOM_NAMES.I01:ROOM_NAMES.I02,x+27,y+66);c.font='24px sans-serif';c.fillText(tile?'CARTRIDGE / 05':'ANALYSTS / 05',x+30,y+124);}
  else if(tile<4){
   c.fillStyle='#1b2c32';c.fillRect(x+16,y+18,283,125);c.strokeStyle='#63878c';c.lineWidth=2;c.strokeRect(x+17,y+19,281,123);
   c.fillStyle='#b8cfc6';c.font='bold 22px monospace';c.fillText('LAB / STANDBY',x+34,y+47);
   c.fillStyle='#72968f';for(let n=0;n<5;n++)c.fillRect(x+35,y+75+n*10,92+n*23,3);
   for(let n=0;n<4;n++){c.fillStyle=n===0?'#b2bb87':'#7d9696';c.beginPath();c.arc(x+345+n*39,y+58,9,0,Math.PI*2);c.fill();}
   c.fillStyle='#ced5ce';c.font='18px monospace';c.fillText('DEMO',x+338,y+118);
  }else{c.font='bold 52px sans-serif';c.fillText(green?'ANALYSIS UNIT':'ANALYSTS / UNIT 05',x+23,y+78);}
 }
 const map=new THREE.CanvasTexture(canvas);map.colorSpace=THREE.SRGBColorSpace;return map;
}

function quadGeometry(record,shadow=false){
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(record.points.flat(),3));g.setIndex([0,1,2,0,2,3]);
 if(shadow)g.setAttribute('color',new THREE.Float32BufferAttribute(record.alpha.flatMap(a=>[1,1,1,a]),4));
 else{const x=(record.tile%2)*.5,y=Math.floor(record.tile/2)*170/512,top=1-y,bottom=1-y-170/512;g.setAttribute('uv',new THREE.Float32BufferAttribute([x,bottom,x+.5,bottom,x+.5,top,x,top],2));}
 g.computeVertexNormals();return g;
}

export function createRoomFinishMaterial(registry){
 const paint=registry?.get('wall');
 return new THREE.MeshStandardMaterial({color:0xffffff,vertexColors:true,roughness:.86,...paint?{normalMap:paint.normalMap,roughnessMap:paint.roughnessMap,normalScale:paint.normalScale.clone()}: {},side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
}

/** Replace rectangular render faces only. Masks come from the existing room
 * study; the complete source geometry remains available to the shadow builder.
 * No polygon boolean, world-data mutation or per-frame work is involved.
 */
export function replaceRoomSurface(record,geometry,plan,baseMaterial,finishMaterial){
 const masks=plan.finishByHost.get(record.id);if(!masks?.length)return null;
 const position=geometry.attributes.position,normal=geometry.attributes.normal,uv=geometry.attributes.uv,index=geometry.index;
 const faces=geometry.groups.length?geometry.groups:[{start:0,count:index.count}],batches=new Map(),stats={sourceArea:0,baseArea:0,finishArea:0,cells:0};
 const vector=(attr,i)=>new THREE.Vector3().fromBufferAttribute(attr,i),epsilon=1e-6;
 const keep=(g,mat)=>{if(!batches.has(mat))batches.set(mat,[]);batches.get(mat).push(g);};
 const cuts=(lo,hi,values)=>[lo,...values.filter(v=>v>lo+epsilon&&v<hi-epsilon).sort((a,b)=>a-b),hi].filter((v,i,a)=>!i||Math.abs(v-a[i-1])>epsilon);
 for(const face of faces){
  const indices=[...new Set(Array.from(index.array.slice(face.start,face.start+face.count)))];
  if(indices.length!==4)throw new Error(`Room finish host is not a rectangular face: ${record.id}`);
  const origin=vector(position,indices[0]),n=vector(normal,indices[0]).normalize();
  // Triangle index order may list a diagonal second; choose an actual edge.
  const edge=indices.slice(1).map(i=>vector(position,i).sub(origin)).sort((a,b)=>a.lengthSq()-b.lengthSq())[0],u=edge.normalize(),v=new THREE.Vector3().crossVectors(n,u).normalize();
  const project=p=>{const d=p.clone().sub(origin);return [d.dot(u),d.dot(v),d.dot(n)];};
  const vertices=indices.map(i=>({p:project(vector(position,i)),uv:[uv.getX(i),uv.getY(i)]}));
  const minU=Math.min(...vertices.map(a=>a.p[0])),maxU=Math.max(...vertices.map(a=>a.p[0])),minV=Math.min(...vertices.map(a=>a.p[1])),maxV=Math.max(...vertices.map(a=>a.p[1]));
  if(vertices.some(a=>Math.min(Math.abs(a.p[0]-minU),Math.abs(a.p[0]-maxU))>epsilon||Math.min(Math.abs(a.p[1]-minV),Math.abs(a.p[1]-maxV))>epsilon))throw new Error(`Non-rectangular room face: ${record.id}`);
  const area=(maxU-minU)*(maxV-minV);stats.sourceArea+=area;
  const faceMasks=[];
  for(const mask of masks){
   const p=mask.points.map(a=>project(new THREE.Vector3(...a))),offset=p.reduce((sum,a)=>sum+a[2],0)/p.length;
   if(Math.abs(offset)>.0031||p.some(a=>Math.abs(a[2]-offset)>epsilon))continue;
   const x0=Math.max(minU,Math.min(...p.map(a=>a[0]))),x1=Math.min(maxU,Math.max(...p.map(a=>a[0]))),y0=Math.max(minV,Math.min(...p.map(a=>a[1]))),y1=Math.min(maxV,Math.max(...p.map(a=>a[1])));
   if(x1-x0>epsilon&&y1-y0>epsilon)faceMasks.push({x0,x1,y0,y1,offset,color:mask.color});
  }
  const xs=cuts(minU,maxU,faceMasks.flatMap(m=>[m.x0,m.x1])),ys=cuts(minV,maxV,faceMasks.flatMap(m=>[m.y0,m.y1]));
  const nearest=(x,y)=>vertices.reduce((best,a)=>Math.hypot(a.p[0]-x,a.p[1]-y)<Math.hypot(best.p[0]-x,best.p[1]-y)?a:best).uv;
  const uv00=nearest(minU,minV),uv10=nearest(maxU,minV),uv01=nearest(minU,maxV);
  for(let ix=0;ix<xs.length-1;ix++)for(let iy=0;iy<ys.length-1;iy++){
   const x0=xs[ix],x1=xs[ix+1],y0=ys[iy],y1=ys[iy+1],cx=(x0+x1)/2,cy=(y0+y1)/2;
   const mask=faceMasks.find(m=>cx>=m.x0-epsilon&&cx<=m.x1+epsilon&&cy>=m.y0-epsilon&&cy<=m.y1+epsilon),coords=[[x0,y0],[x1,y0],[x1,y1],[x0,y1]];
   const g=new THREE.BufferGeometry();g.setIndex([0,1,2,0,2,3]);g.setAttribute('position',new THREE.Float32BufferAttribute(coords.flatMap(([x,y])=>origin.clone().addScaledVector(u,x).addScaledVector(v,y).addScaledVector(n,mask?.offset||0).toArray()),3));
   g.setAttribute('normal',new THREE.Float32BufferAttribute(coords.flatMap(()=>n.toArray()),3));
   if(mask){const color=new THREE.Color(mask.color);g.setAttribute('color',new THREE.Float32BufferAttribute(coords.flatMap(()=>color.toArray()),3));applyMetreUV(g);stats.finishArea+=(x1-x0)*(y1-y0);}
   else{g.setAttribute('uv',new THREE.Float32BufferAttribute(coords.flatMap(([x,y])=>[0,1].map(k=>uv00[k]+(x-minU)/(maxU-minU)*(uv10[k]-uv00[k])+(y-minV)/(maxV-minV)*(uv01[k]-uv00[k]))),2));stats.baseArea+=(x1-x0)*(y1-y0);}
   keep(g,mask?finishMaterial:baseMaterial);stats.cells++;
  }
 }
 const parts=[];for(const [material,geometries]of batches){const merged=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());parts.push({geometry:merged,material});}
 return {parts,stats};
}

export function buildRoomVisuals(world,registry,{plan=createRoomVisualPlan(world),atlasTexture}={}){
 const group=new THREE.Group();group.name='pqc-gx-room-visuals';
 const map=atlasTexture||atlas(),panelMaterial=new THREE.MeshStandardMaterial({map,roughness:.73,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1});
 const shadowMaterial=new THREE.MeshBasicMaterial({color:0x15232b,vertexColors:true,transparent:true,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true,polygonOffset:true,polygonOffsetFactor:-1});
 let triangles=0;
 for(const roomId of plan.roomIds)for(const [kind,records,material]of[['panels',plan.panels,panelMaterial],['shadows',plan.shadows,shadowMaterial]]){
  const geometries=records.filter(r=>r.roomId===roomId).map(r=>quadGeometry(r,kind==='shadows'));if(!geometries.length)continue;
  const geometry=mergeGeometries(geometries);geometries.forEach(g=>g.dispose());geometry.computeBoundingSphere();
  const mesh=new THREE.Mesh(geometry,material);mesh.name=`room-visuals-${roomId}-${kind}`;mesh.receiveShadow=kind!=='shadows';mesh.castShadow=false;group.add(mesh);triangles+=geometry.index.count/3;
 }
 group.userData={cosmetic:true,rooms:plan.roomIds,counts:plan.counts,drawCalls:group.children.length,triangles,dispose(){for(const m of group.children)m.geometry.dispose();panelMaterial.dispose();shadowMaterial.dispose();if(!atlasTexture)map.dispose();group.clear();}};
 return group;
}
