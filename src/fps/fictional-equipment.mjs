/** Replacement art on cloned presentation materials. Original GLB bytes, UVs,
 * geometry, material names and loader resources are preserved for provenance.
 * Profiles select technical asset/material slots, not text-to-name substitutions.
 */
import * as T from '../../vendor/three/three.module.js';
const profiles=Object.freeze({
 'genexpert:gx16':{0:'plate',1:'console'},
 'genexpert:infinity80':{0:'array',1:'plate',2:'screen'},
 'office:ricoh-printer':{0:'printer'}
});
const maps=new Map(),owned=new Set();let clones=new WeakMap();
export const equipmentArtRoles=id=>profiles[id]||null;
function caption(c,text,x,y,size,color='#d9e7e4',width=960){c.fillStyle=color;c.font=`600 ${size}px sans-serif`;c.fillText(text,x,y,width);}
function art(role){
 if(maps.has(role))return maps.get(role);
 const canvas=document.createElement('canvas');canvas.width=1024;canvas.height=role==='array'?650:role==='screen'?576:1024;
 const c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;
 c.fillStyle=role==='plate'||role==='printer'?'#ecefee':'#303b41';c.fillRect(0,0,w,h);
 if(role==='plate'){
  c.textAlign='center';caption(c,'UNIT 05',w/2,h*.965,22,'#3d565e');
 }else if(role==='screen'){
  c.fillStyle='#132b36';c.fillRect(0,0,w,h);caption(c,'ANALYSIS ARRAY',45,85,44);
  caption(c,'UNIT 05 / LOCAL STATUS',45,128,23,'#83b7b0');
  for(let i=0;i<4;i++){c.fillStyle='#274651';c.fillRect(45,175+i*75,934,54);c.fillStyle='#7ba9a0';c.fillRect(60,190+i*75,220+i*110,17);}
  caption(c,'READY',45,535,25);
 }else if(role==='console'){
  c.textAlign='center';caption(c,'ANALYSIS CONSOLE',512,90,32);
  for(let row=0;row<2;row++){
   const y=row?735:190;c.fillStyle='#172126';c.fillRect(44,y+12,936,213);
   for(let i=0;i<8;i++){caption(c,'U'+String(row*8+i+1).padStart(2,'0'),102+i*117,y-30,17,'#b8cecb');c.fillStyle='#78a49c';c.fillRect(50+i*117,y+20,104,3);}
  }
  c.fillStyle='#263238';c.fillRect(45,414,934,280);for(let y=423;y<683;y+=12){c.fillStyle='#526064';c.fillRect(48,y,928,3);}
 }else if(role==='array'){
  c.fillStyle='#18232a';c.fillRect(0,0,w,h);caption(c,'ANALYSIS ARRAY',28,52,26);
  for(let col=0;col<3;col++)for(let row=0;row<4;row++){
   const x=24+col*287,y=78+row*138;c.fillStyle='#354249';c.fillRect(x,y,267,87);
   for(let slot=0;slot<8;slot++){c.fillStyle='#71858a';c.fillRect(x+7+slot*32,y+11,24,30);c.fillStyle='#152128';c.fillRect(x+7+slot*32,y+45,24,35);c.fillStyle='#7da99e';c.fillRect(x+11+slot*32,y+50,16,3);}
  }
  c.fillStyle='#65757b';c.fillRect(895,0,24,h);c.fillStyle='#101d24';c.fillRect(927,0,97,h);
  for(let y=19;y<h;y+=19){c.fillStyle='#3e5059';c.fillRect(933,y,82,5);}
 }else if(role==='printer'){
  // Authored UV-space panels, with no baked manufacturer, document or screen image.
  c.fillStyle='#cbd1d0';c.fillRect(0,0,w,h);
  c.fillStyle='#263840';c.fillRect(59,190,123,25);c.fillRect(592,635,94,60);
  c.fillStyle='#a6bbb8';for(let i=0;i<4;i++)c.fillRect(600,645+i*10,66-i*8,3);
  c.textAlign='center';caption(c,'UNIT 05',116,176,12,'#435960',130);
  for(let y=153;y<165;y+=3){c.fillStyle='#929d9d';c.fillRect(57,y,124,1);}
 }
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.flipY=false;map.anisotropy=4;
 map.name='fictional-equipment-'+role;map.userData.studioShared=true;map.userData.playerText=true;maps.set(role,map);return map;
}
export function applyEquipmentArt(root,id,materialSlots){
 const roles=equipmentArtRoles(id);if(!roles)return;
 root.traverse(node=>{if(!node.isMesh)return;
  const replace=original=>{
   const role=roles[materialSlots.get(original)];if(!role)return original;
   let cached=clones.get(original);if(!cached){cached=new Map();clones.set(original,cached);}
   if(!cached.has(role)){
    const m=original.clone();m.map=art(role);m.color.setHex(0xffffff);
    // A printer's original normal/packed maps also carry embossed label/UI traces.
    if(role==='printer'){for(const key of Object.keys(m))if(key!=='map'&&m[key]?.isTexture)m[key]=null;m.roughness=.64;m.metalness=0;}
    m.userData={...m.userData,studioShared:true,fictionalEquipment:true,artRole:role};m.needsUpdate=true;cached.set(role,m);owned.add(m);
   }
   return cached.get(role);
  };
  node.material=Array.isArray(node.material)?node.material.map(replace):replace(node.material);
 });
}

export function releaseEquipmentArt(){for(const m of owned)m.dispose();for(const t of maps.values())t.dispose();owned.clear();maps.clear();clones=new WeakMap();}
