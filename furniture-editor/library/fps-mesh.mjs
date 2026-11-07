/** Shared, opt-in static FPS prop presentation. The cartridge factory retains
 * its original geometry and screen-size LOD. No game state, weapons or actors
 * are instantiated. Cached templates own their geometry/materials; editor
 * instances own hierarchy only, just like cached GLBs.
 */
import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {cartridgeGeometry,makeCounterAnalystCartridge,CartridgeLOD} from '../../src/fps/cartridge-v11.mjs';
import {buildFacilityDetails} from '../../src/fps/facility-details-view.mjs';
import {FPS_MAP} from './fps-catalog.mjs?v=5.8.0';

const cache=new Map(),materials=new Map();
function material(color,{metalness=0,roughness=.65,...options}={}){
 const key=JSON.stringify([color,metalness,roughness,options]);
 if(!materials.has(key)){
  const m=new T.MeshStandardMaterial({color,metalness,roughness,...options});
  m.userData.studioShared=true;materials.set(key,m);
 }
 return materials.get(key);
}
const registry={get(kind,options={}){
 const base=kind==='metal'?{color:0xa6afb0,metalness:.65,roughness:.42}:
  kind==='polymer'?{color:0x25343b,roughness:.73}:{color:0xf3f2e8,roughness:.5};
 const merged={...base,...options},color=merged.color;delete merged.color;
 return material(color,merged);
}};

/** Merge a static template by material once; all instances reuse those buffers. */
function builder(){
 const bins=new Map();
 function add(geometry,mat,x=0,y=0,z=0,rotation={}){
  if(geometry.index){const flat=geometry.toNonIndexed();geometry.dispose();geometry=flat;}
  geometry.applyMatrix4(new T.Matrix4().compose(new T.Vector3(x,y,z),
   new T.Quaternion().setFromEuler(new T.Euler(rotation.x||0,rotation.y||0,rotation.z||0)),new T.Vector3(1,1,1)));
  if(!bins.has(mat))bins.set(mat,[]);bins.get(mat).push(geometry);
 }
 const box=(x,y,z,w,h,d,mat)=>add(new T.BoxGeometry(w,h,d),mat,x,y,z);
 const cylinder=(x,y,z,r,h,mat,rotation={})=>add(new T.CylinderGeometry(r,r,h,12),mat,x,y,z,rotation);
 return {box,cylinder,add,finish(){const root=new T.Group();for(const[mat,parts]of bins){const geometry=mergeGeometries(parts,false);parts.forEach(p=>p.dispose());geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.studioShared=true;const mesh=new T.Mesh(geometry,mat);mesh.receiveShadow=true;root.add(mesh);}return root;}};
}

function labelMaterial(text,color='#f3f5ef',background='#b92231'){
 const key='label:'+text+color+background;
 if(materials.has(key))return materials.get(key);
 if(typeof document==='undefined')return material(color);
 const canvas=document.createElement('canvas');canvas.width=256;canvas.height=64;
 const ctx=canvas.getContext('2d');ctx.fillStyle=background;ctx.fillRect(0,0,256,64);
 ctx.fillStyle=color;ctx.font='700 42px Arial,sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,128,34,242);
 const map=new T.CanvasTexture(canvas);map.colorSpace=T.SRGBColorSpace;map.userData.studioShared=true;
 const m=new T.MeshStandardMaterial({map,color:0xffffff,roughness:.6});m.userData.studioShared=true;materials.set(key,m);return m;
}

function binderOven(){
 // A new approximate VD-style game prop, not a copy of an unavailable Binder
 // model. The visible cabinet, red controller and glass-door silhouette follow
 // the public manufacturer reference linked in the catalogue.
 const b=builder(),{box,cylinder}=b;
 const white=material(0xe4e7e4),metal=material(0xb5c0c2,{metalness:.7,roughness:.4}),
  dark=material(0x212b30),red=material(0xb92231,{roughness:.5}),
  inside=material(0x59666b,{metalness:.68,roughness:.54}),screen=material(0x142422),
  lcd=material(0xb9d38e,{emissive:0x597839,emissiveIntensity:.35}),
  glass=material(0xa9cbd2,{transparent:true,opacity:.19,roughness:.18,depthWrite:false,side:T.DoubleSide});
 // Cabinet is hollow in front, so shelves remain visible through the window.
 box(-.292,.4075,-.025,.054,.755,.46,white);box(.292,.4075,-.025,.054,.755,.46,white);
 box(0,.4075,-.244,.584,.755,.022,white);box(0,.0675,-.025,.584,.075,.46,white);
 box(0,.8,-.025,.638,.03,.46,white);box(0,.72,-.025,.53,.13,.46,red);
 box(0,.375,-.225,.525,.535,.02,inside);
 for(const y of [.18,.36,.54]){
  box(0,y,-.015,.497,.009,.365,metal);
  for(const x of[-.251,.251])box(x,y-.012,-.015,.014,.018,.38,metal);
 }
 for(const x of[-.264,.264])box(x,.375,-.015,.014,.53,.4,metal);
 // Rectangular glass door and gasket, with a right-hand locking handle.
 box(0,.377,.238,.516,.526,.012,glass);
 // An open inner frame preserves the view instead of covering the glass with
 // an opaque door slab. The gasket uses four strips around the same opening.
 for(const x of[-.273,.273])box(x,.377,.248,.03,.574,.026,metal);
 for(const y of[.105,.649])box(0,y,.248,.516,.03,.026,metal);
 for(const x of[-.252,.252])box(x,.377,.231,.014,.514,.012,dark);
 for(const y of[.127,.627])box(0,y,.231,.49,.014,.012,dark);
 for(const y of[.25,.50]){box(.294,y,.255,.04,.04,.04,dark);}
 box(.294,.375,.28,.031,.29,.03,dark);
 for(const y of[.22,.53])box(-.3,y,.249,.035,.065,.035,metal);
 // Controller, buttons, label and lower ventilation slots are all inexpensive.
 box(-.12,.735,.215,.205,.08,.015,screen);box(-.12,.748,.224,.167,.036,.004,lcd);
 for(let i=0;i<5;i++)box(-.191+i*.035,.709,.226,.019,.012,.005,white);
 b.add(new T.PlaneGeometry(.16,.04),labelMaterial('UNIT 05'),.165,.747,.222);
 cylinder(.238,.698,.222,.012,.01,dark,{x:Math.PI/2});
 for(let i=0;i<11;i++)box(-.226+i*.045,.068,.21,.027,.006,.005,dark);
 for(const x of[-.267,.267])for(const z of[-.195,.17])box(x,.015,z,.055,.03,.055,dark);
 return b.finish();
}

/** Copy only selected source triangles, retaining their normals/UVs. */
function selectTriangles(source,predicate){
 const g=source.index?source.toNonIndexed():source,position=g.attributes.position,keep=[];
 for(let i=0;i<position.count;i+=3){const triangle=[0,1,2].map(k=>new T.Vector3().fromBufferAttribute(position,i+k));if(predicate(triangle))keep.push(i,i+1,i+2);}
 const geometry=new T.BufferGeometry();
 for(const[name,attribute]of Object.entries(g.attributes)){
  const array=new attribute.array.constructor(keep.length*attribute.itemSize);
  keep.forEach((index,out)=>{for(let c=0;c<attribute.itemSize;c++)array[out*attribute.itemSize+c]=attribute.array[index*attribute.itemSize+c];});
  geometry.setAttribute(name,new T.BufferAttribute(array,attribute.itemSize,attribute.normalized));
 }
 if(g!==source)g.dispose();geometry.computeBoundingBox();geometry.computeBoundingSphere();geometry.userData.studioShared=true;return geometry;
}

function facility(model){
 const specs={
  'lab-bench':{type:'lab-bench',w:2,d:.76,h:.9,instrument:0},
  centrifuge:{type:'lab-bench',w:2,d:.76,h:.9,instrument:1},
  'lab-freezer':{type:'freezer',w:.72,d:.66,h:1.9,displayOnly:true},
  'lab-cabinet':{type:'lab-cabinet',w:.8,d:.6,h:1.8,displayOnly:true}
 };
 const source=buildFacilityDetails({props:[{id:model,x:0,z:0,yaw:0,...specs[model]}],facades:[],counts:{}},registry);
 if(model!=='centrifuge')return source.root;
 const root=new T.Group();
 for(const mesh of source.root.children){
  const geometry=selectTriangles(mesh.geometry,triangle=>triangle.every(v=>Math.abs(v.x)<=.29&&Math.abs(v.z)<=.30&&v.y>.93));
  if(geometry.attributes.position.count){const copy=new T.Mesh(geometry,mesh.material);copy.receiveShadow=true;root.add(copy);}else geometry.dispose();
 }
 source.dispose();return root;
}

function sceneProp(model){
 const b=builder(),{box,cylinder}=b,steel=material(0xa6afb0,{metalness:.7,roughness:.4}),white=material(0xe2e9e3),dark=material(0x242d32);
 if(model==='lab-cart'){
  // Same visible parts and coordinates as furnishings.mjs' lab-cart prefab.
  box(0,.16,0,.7,.07,.46,steel);box(0,.81,0,.7,.06,.46,steel);
  for(const x of[-.31,.31])for(const z of[-.19,.19])box(x,.46,z,.035,.82,.035,steel);
  box(0,1,.195,.7,.035,.035,steel);
  for(const x of[-.28,.28])for(const z of[-.16,.16])box(x,.065,z,.08,.12,.06,dark);
 }else if(model==='bench-instrument'){
  // Actual PQC white/red instrument dimensions from furnishings.mjs.
  box(0,.24,0,.47,.45,.38,white);box(0,.49,0,.47,.06,.38,material(0x8a241a));
 }else if(model==='tube-rack'){
  // Original living-floor-scene.mjs capped-tube cluster, rebased to y=0.
  box(0,.035,0,.27,.07,.18,material(0x91b6b8));
  for(let row=0;row<2;row++)for(let k=0;k<5;k++){
   b.add(new T.CylinderGeometry(.012,.009,.09,7),white,-.10+k*.05,.105,-.045+row*.09);
   b.add(new T.CylinderGeometry(.014,.014,.018,7),material(row?0x7aa8b8:0xd8c375),-.10+k*.05,.155,-.045+row*.09);
  }
 }else if(model==='tip-box'){
  box(0,.1,0,.23,.20,.16,material(0x8fbdc7));box(0,.11,.082,.18,.12,.004,white);
 }else if(model==='binders'){
  for(let i=0;i<3;i++){
   box((i-1)*.075,.16,0,.065,.32,.25,material([0x406b82,0x667f75,0xc1aa78][i]));
   box((i-1)*.075,.16,.128,.035,.20,.003,material(0xe4e6dd));
  }
 }
 return b.finish();
}

function cartridgeRack(){
 const transforms=[];
 for(let i=0;i<6;i++)transforms.push(new T.Matrix4().compose(new T.Vector3((i%3-1)*.081,.005,Math.floor(i/3)*.078-.035),new T.Quaternion().setFromAxisAngle(new T.Vector3(0,1,0),Math.PI*.06),new T.Vector3(1.35,1.35,1.35)));
 const bounds=cartridgeGeometry().bounds,lod=new CartridgeLOD(transforms.map(m=>bounds.clone().applyMatrix4(m)));
 for(const[index,detail]of ['near','mid','far'].entries()){
  const key='cartridge-rack-'+detail;
  if(!cache.has(key)){
   const group=new T.Group();for(const{geometry,material}of cartridgeGeometry({detail}).parts){
    const parts=transforms.map(m=>geometry.clone().applyMatrix4(m)),merged=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
    merged.computeBoundingBox();merged.computeBoundingSphere();merged.userData.studioShared=true;
    const mesh=new T.Mesh(merged,material);mesh.receiveShadow=true;group.add(mesh);
   }cache.set(key,group);
  }
  lod.addLevel(cache.get(key).clone(true),index);
 }
 const root=new T.Group();root.add(lod);
 if(!cache.has('cartridge-rack-tray')){
  const b=builder(),m=material(0x3b7079,{roughness:.57});b.box(0,.002,0,.32,.004,.23,m);
  for(const side of[-1,1]){b.box(side*.16,.011,0,.004,.022,.23,m);b.box(0,.011,side*.115,.32,.022,.004,m);}
  for(let i=0;i<2;i++)b.box((i-.5)*.081,.014,0,.003,.027,.23,m);b.box(0,.014,0,.32,.027,.003,m);
  cache.set('cartridge-rack-tray',b.finish());
 }
 root.add(cache.get('cartridge-rack-tray').clone(true));return root;
}

function sourceModel(model){
 // LOD subclasses need fresh hierarchy (Three's clone cannot reconstruct the
 // cartridge's constructor samples), while their geometry/materials are shared.
 if(model==='cartridge'||model==='cartridge-open')return makeCounterAnalystCartridge({open:model.endsWith('-open')});
 if(model==='cartridge-rack')return cartridgeRack();
 if(!cache.has(model))cache.set(model,model==='binder-vacuum-oven'?binderOven():['lab-bench','centrifuge','lab-freezer','lab-cabinet'].includes(model)?facility(model):sceneProp(model));
 return cache.get(model).clone(true);
}

export function populateFpsFurniture(item,group){
 const entry=FPS_MAP.get(item?.assetId);if(!entry||entry.url)return false;
 const source=sourceModel(entry.model);source.updateMatrixWorld(true);
 const bounds=new T.Box3().setFromObject(source),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
 if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))throw Error('FPS-föremålet har ogiltiga mått.');
 const holder=new T.Group();holder.name=entry.name;holder.scale.set(item.w/size.x,item.height/size.y,item.d/size.z);
 source.position.set(-center.x,-bounds.min.y,-center.z);holder.add(source);
 holder.traverse(o=>{if(o.isMesh){o.userData.editId=item.id;o.castShadow=false;o.receiveShadow=true;}});
 group.add(holder);return true;
}
