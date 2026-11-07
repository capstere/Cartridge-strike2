/** Bounded fictional set dressing from the private v11.3 derivative.
 * Anchors are existing bench/desk/shelf/cart footprints; no navigation,
 * collision or room-map mutation. Placement is a game-design assumption.
 */
import * as THREE from '../../vendor/three/three.module.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { cartridgeGeometry, CartridgeLOD, CARTRIDGE_LABEL } from './cartridge-v11.mjs';
import { insidePolygon } from './physics.mjs';
const bounds=p=>[Math.min(...p.map(q=>q[0])),Math.min(...p.map(q=>q[1])),Math.max(...p.map(q=>q[0])),Math.max(...p.map(q=>q[1]))];
const hash=s=>[...s].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
function blocked(world,x,y,z,r,ignoreId){return world.description.boxes.some(b=>{
 if(b.id===ignoreId||b.y+b.h/2<y+.025||b.y-b.h/2>y+.22)return false;
 const a=b.angle||0,c=Math.cos(a),s=Math.sin(a),dx=x-b.x,dz=z-b.z,lx=c*dx-s*dz,lz=s*dx+c*dz;
 return Math.abs(lx)<b.w/2+r&&Math.abs(lz)<b.d/2+r;
});}
function fits(polygon,x,z,r){return [[-r,-r],[-r,r],[r,-r],[r,r]].every(([dx,dz])=>insidePolygon(x+dx,z+dz,polygon));}
export function cartridgePlacements(world){
 const items=[],supports=[],rooms=new Map();
 const add=(base,dx,dz,{open=false,lying=false,yaw=0}={})=>{
  const item={id:`v11.3-prop-${items.length}`,kind:base.kind,roomId:base.roomId,supportId:base.supportId,x:base.x+dx,y:base.y+(lying?.029:0),z:base.z+dz,yaw,roll:lying?Math.PI/2:0,scale:1.35,open,footprint:base.footprint};items.push(item);return item;
 };
 for(const o of world.data.obstacles.filter(o=>o.kind==='lab-bench'&&['I01','I02','I04'].includes(o.roomId))){
  if((rooms.get(o.roomId)||0)>=3)continue;
  const [x0,z0,x1,z1]=bounds(o.polygon),r=.19,seed=hash(o.id);let spot;
  for(const u of [.18,.82,.36,.64]){for(const v of [.20,.80,.37,.63]){
   const x=x0+(x1-x0)*u,z=z0+(z1-z0)*v;if(fits(o.polygon,x,z,r)&&!blocked(world,x,.883,z,r))spot={x,z};if(spot)break;
  }if(spot)break;}
  if(!spot)continue;
  const n=rooms.get(o.roomId)||0,kind=['bench','rack','carton'][n],base={...spot,y:.883,kind,roomId:o.roomId,supportId:o.id,footprint:o.polygon};rooms.set(o.roomId,n+1);
  if(kind==='rack'||kind==='carton')supports.push({...base,w:.32,d:.23,h:kind==='rack'?.022:.052});
  for(let i=0;i<(kind==='bench'?3:6);i++)add({...base,y:base.y+(kind==='rack'?.004:kind==='carton'?.005:0)},(i%3-1)*.081,Math.floor(i/3)*.078-.035,{open:kind==='bench'&&i===1&&o.roomId!=='I04',lying:kind==='bench'&&i===2,yaw:kind==='bench'?(seed%7-3)*.11+i*.3:Math.PI*.06});
 }
 // Office samples and genuine existing carts, not new obstacles in an aisle.
 for(const f of world.furnishings.instances.filter(f=>['desk','lab-cart','plant-cabinet'].includes(f.prefab))){
  if(!f.transform||!Number.isFinite(f.transform.x))continue;
  const top=world.description.boxes.find(b=>b.furnishingId===f.id&&b.id.endsWith('-top'));
  const shelf=world.description.boxes.find(b=>b.furnishingId===f.id&&b.id.endsWith('-cabinet'));
  const surface=top||shelf;if(!surface)continue;
  const y=surface.y+surface.h/2+.003,roomId=f.roomId,kind=f.prefab==='lab-cart'?'cart':f.prefab==='plant-cabinet'?'shelf':'desk';
  const a=surface.angle||0,c=Math.cos(a),s=Math.sin(a),local=[[-surface.w*.30,-surface.d*.25],[surface.w*.30,surface.d*.25]];
  const footprint=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([dx,dz])=>[surface.x+c*dx*surface.w/2+s*dz*surface.d/2,surface.z-s*dx*surface.w/2+c*dz*surface.d/2]);
  for(const [dx,dz]of local){const x=surface.x+c*dx+s*dz,z=surface.z-s*dx+c*dz;if(!fits(footprint,x,z,.055)||blocked(world,x,y,z,.06,surface.id))continue;
   const base={x,z,y,kind,roomId,supportId:surface.id,footprint};add(base,0,0,{yaw:.15+hash(f.id)%7*.2});if(kind==='cart')add(base,.075,0,{yaw:-.21});break;
  }
 }
 // One dropped, nonblocking sample remains wholly under a reviewed bench.
 const bench=items.find(p=>p.kind==='bench');if(bench){const p={...bench,id:`v11.3-prop-${items.length}`,kind:'floor',y:.029,roll:Math.PI/2,yaw:.6,open:false};items.push(p);}
 return {items,supports,placementAssumption:'Fictional game set dressing; not verified instrument locations.'};
}
export function buildCartridgeProps(world){
 const group=new THREE.Group();group.name='cartridge-v11.3-props';const {items,supports,placementAssumption}=cartridgePlacements(world),cells=new Map(),ownedGeometries=[],ownedMaterials=[],ownedTextures=[];
 for(const p of items){const key=`${Math.floor(p.x/8)}:${Math.floor(p.z/8)}:${p.open}`;if(!cells.has(key))cells.set(key,[]);cells.get(key).push(p);}
 const budgets={near:{calls:0,triangles:0},mid:{calls:0,triangles:0},far:{calls:0,triangles:0}};
 const matrix=new THREE.Matrix4(),q=new THREE.Quaternion(),scale=new THREE.Vector3(),pos=new THREE.Vector3();
 for(const [key,cell]of cells){
  const cx=cell.reduce((s,p)=>s+p.x,0)/cell.length,cz=cell.reduce((s,p)=>s+p.z,0)/cell.length;
  const transforms=cell.map(p=>{pos.set(p.x-cx,p.y,p.z-cz);q.setFromEuler(new THREE.Euler(0,p.yaw,p.roll));scale.setScalar(p.scale);return matrix.compose(pos,q,scale).clone();});
  // The nearest/largest individual sample governs a shared batch. Measuring
  // the cell centre or its combined bounds would hide close details or keep
  // dozens of distant samples unnecessarily in the high-detail tier.
  const bounds=cartridgeGeometry({open:cell[0].open}).bounds;
  const lod=new CartridgeLOD(transforms.map(transform=>bounds.clone().applyMatrix4(transform)));lod.position.set(cx,0,cz);lod.name=`cartridge-cell-${key}`;
  for(const [level,detail]of ['near','mid','far'].entries()){
   const template=cartridgeGeometry({detail,open:cell[0].open}),batch=new THREE.Group();
   for(const {geometry,material}of template.parts){const mesh=new THREE.InstancedMesh(geometry,material,cell.length);mesh.name=`Counter Analyst ${detail}`;mesh.castShadow=false;mesh.receiveShadow=true;mesh.userData.cartridgeVersion='11.3';
    transforms.forEach((transform,i)=>mesh.setMatrixAt(i,transform));mesh.instanceMatrix.needsUpdate=true;mesh.computeBoundingSphere();batch.add(mesh);
   }
   lod.addLevel(batch,level);budgets[detail].calls+=template.parts.length;budgets[detail].triangles+=template.triangles*cell.length;
  }
  group.add(lod);
 }
 // Open cartons and low racks make the sample groups legible. Their footprint
 // is inside existing benches and they cannot open or obstruct any path.
 const cardboard=new THREE.MeshStandardMaterial({color:0xae8c62,roughness:.95}),rack=new THREE.MeshStandardMaterial({color:0x3b7079,roughness:.57});ownedMaterials.push(cardboard,rack);
 const boxes=new Map();function box(mat,x,y,z,w,h,d){const geo=new THREE.BoxGeometry(w,h,d);geo.translate(x,y,z);if(!boxes.has(mat))boxes.set(mat,[]);boxes.get(mat).push(geo);}
 for(const s of supports){const mat=s.kind==='rack'?rack:cardboard;
  box(mat,s.x,s.y+.002,s.z,s.w,.004,s.d);
  for(const side of[-1,1]){box(mat,s.x+side*s.w/2,s.y+s.h/2,s.z,.004,s.h,s.d);box(mat,s.x,s.y+s.h/2,s.z+side*s.d/2,s.w,s.h,.004);}
  if(s.kind==='rack'){for(let i=0;i<2;i++)box(mat,s.x+(i-.5)*.081,s.y+.014,s.z,.003,.027,s.d);box(mat,s.x,s.y+.014,s.z,.32,.027,.003);}
  else{box(mat,s.x,s.y+s.h+.002,s.z-s.d*.68,s.w,.004,s.d*.35);}
 }
 for(const[material,parts]of boxes){const geometry=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());geometry.computeBoundingSphere();ownedGeometries.push(geometry);const mesh=new THREE.Mesh(geometry,material);mesh.receiveShadow=true;group.add(mesh);}
 // One tiny shared contact texture, never a new shadow map per sample.
 const pixels=new Uint8Array(32*32*4);for(let y=0;y<32;y++)for(let x=0;x<32;x++){const i=(y*32+x)*4,d=Math.hypot((x-15.5)/16,(y-15.5)/16);pixels[i]=pixels[i+1]=pixels[i+2]=20;pixels[i+3]=Math.round(Math.max(0,1-d)*95);}
 const contactMap=new THREE.DataTexture(pixels,32,32);contactMap.needsUpdate=true;ownedTextures.push(contactMap);
 const contactMaterial=new THREE.MeshBasicMaterial({map:contactMap,transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1});ownedMaterials.push(contactMaterial);
 const contactParts=items.map(p=>{const g=new THREE.PlaneGeometry(p.roll?.085:.065,.065);g.rotateX(-Math.PI/2);g.rotateY(p.yaw);g.translate(p.x,p.y-(p.roll?.029:0)+.0001,p.z);return g;});
 const contacts=mergeGeometries(contactParts,false);contactParts.forEach(g=>g.dispose());ownedGeometries.push(contacts);group.add(new THREE.Mesh(contacts,contactMaterial));
 group.userData={privateDerivative:true,cartridgeVersion:'11.3',label:CARTRIDGE_LABEL,cosmetic:true,placements:items,counts:{total:items.length,open:items.filter(p=>p.open).length,...Object.fromEntries([...new Set(items.map(p=>p.kind))].map(kind=>[kind,items.filter(p=>p.kind===kind).length]))},budget:{...Object.fromEntries(Object.entries(budgets).flatMap(([detail,b])=>[[`${detail}Calls`,b.calls+boxes.size+1],[`${detail}Triangles`,b.triangles]])),cells:cells.size},placementAssumption,
  dispose(){group.traverse(o=>{if(o.isInstancedMesh)o.dispose();});ownedGeometries.forEach(g=>g.dispose());ownedMaterials.forEach(m=>m.dispose());ownedTextures.forEach(t=>t.dispose());group.clear();}};
 return group;
}
