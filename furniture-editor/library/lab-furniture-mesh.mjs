/** Original low-poly lab furniture. Each material is one merged draw call.
 * Four immutable CPU templates are built lazily; instances own their GPU
 * geometries/materials, so deleting a placement or ghost cannot damage another.
 * Lights are emissive surfaces, never additional runtime lights/shadow maps.
 */
import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {LAB_FURNITURE_MAP} from './lab-furniture.mjs?v=5.8.0';

const templates=new Map();
const finishes={
 white:{color:0xdee3df,roughness:.48,metalness:0},
 blue:{color:0x35556d,roughness:.53,metalness:0},
 steel:{color:0xa6afb0,roughness:.40,metalness:.85},
 frame:{color:0x454b4b,roughness:.60,metalness:0},
 black:{color:0x272e32,roughness:.76,metalness:0},
 rubber:{color:0x2e3234,roughness:.94,metalness:0},
 dark:{color:0x263238,roughness:.34,metalness:0},
 light:{color:0xf4ffff,emissive:0xc9f2ff,emissiveIntensity:.65,roughness:.35},
 glass:{color:0xafd6df,transparent:true,opacity:.15,depthWrite:false,roughness:.15,metalness:0},
 sole:{color:0xe5e8e3,roughness:.87,metalness:0},
 tread:{color:0xa7b1b0,roughness:.96,metalness:0},
 upper:{color:0xf2f3ef,roughness:.83,metalness:0},
 lining:{color:0x333d42,roughness:1,metalness:0,side:T.DoubleSide},
 lace:{color:0xe3e7e4,roughness:.94,metalness:0}
};

function builder(){
 const batches=new Map();
 function add(key,geometry){
  // Primitives and lofts share a minimal position/normal layout for batching.
  const raw=geometry.index?geometry.toNonIndexed():geometry;
  if(raw!==geometry)geometry.dispose();
  for(const attribute of Object.keys(raw.attributes))if(!['position','normal'].includes(attribute))raw.deleteAttribute(attribute);
  if(!raw.attributes.normal)raw.computeVertexNormals();
  if(!batches.has(key))batches.set(key,[]);
  batches.get(key).push(raw);
 }
 function box(key,x,y,z,w,h,d,rotation=null){
  const geometry=new T.BoxGeometry(w,h,d);
  if(rotation)geometry.applyMatrix4(new T.Matrix4().makeRotationFromEuler(new T.Euler(...rotation)));
  geometry.translate(x,y,z);add(key,geometry);
 }
 function cylinder(key,x,y,z,radius,length,axis='y',segments=10){
  const geometry=new T.CylinderGeometry(radius,radius,length,segments);
  if(axis==='x')geometry.rotateZ(Math.PI/2);
  if(axis==='z')geometry.rotateX(Math.PI/2);
  geometry.translate(x,y,z);add(key,geometry);
 }
 function xPrism(key,outline,x,width){
  const shape=new T.Shape();outline.forEach(([z,y],i)=>i?shape.lineTo(-z,y):shape.moveTo(-z,y));shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:width,bevelEnabled:false,steps:1,curveSegments:1});
  geometry.rotateY(Math.PI/2);geometry.translate(x-width/2,0,0);add(key,geometry);
 }
 function solePrism(key,outline,x,y,height,inset=1){
  const shape=new T.Shape();outline.forEach(([xx,z],i)=>i?shape.lineTo(xx*inset,-z*inset):shape.moveTo(xx*inset,-z*inset));shape.closePath();
  const geometry=new T.ExtrudeGeometry(shape,{depth:height,bevelEnabled:false,steps:1,curveSegments:1});
  geometry.rotateX(-Math.PI/2);geometry.translate(x,y,0);add(key,geometry);
 }
 function finish(){return [...batches].map(([key,parts])=>{
  const geometry=mergeGeometries(parts,false);parts.forEach(part=>part.dispose());
  geometry.computeBoundingBox();geometry.computeBoundingSphere();
  return {key,geometry};
 });}
 return {add,box,cylinder,xPrism,solePrism,finish};
}

function biosafetyCabinet(){
 const b=builder(),{box,cylinder,xPrism}=b;
 // Wheeled four-leg steel base, open beneath the working chamber.
 for(const x of [-.638,.638])for(const z of [-.282,.282]){
  box('frame',x,.483,z,.038,.782,.038);
  box('steel',x,.091,z,.054,.042,.052);
  cylinder('rubber',x,.042,z,.042,.034,'x',12);
  cylinder('steel',x,.042,z,.020,.036,'x',12);
 }
 for(const x of [-.638,.638])box('frame',x,.345,0,.028,.03,.60);
 box('frame',0,.345,.282,1.29,.03,.028);
 for(const z of [-.337,.337])box('frame',0,.866,z,1.4,.04,.046);
 for(const x of [-.677,.677])box('frame',x,.866,0,.046,.04,.72);

 // White shells retain the round/chamfered top and sloped front in the reference.
 const side=[[-.345,.886],[.36,.886],[.36,2.1],[-.245,2.1],[-.284,2.089],[-.31,2.06],[-.321,2.015],[-.345,1.74]];
 for(const x of [-.68,.68])xPrism('white',side,x,.04);
 xPrism('white',[[-.345,1.74],[.36,1.74],[.36,2.092],[-.245,2.092],[-.284,2.081],[-.31,2.052],[-.321,2.007]],0,1.32);
 box('white',0,1.49,.344,1.32,1.208,.032);

 // Reflective interior and a recessed, perforated work tray (top exactly .904).
 box('steel',0,1.3,.322,1.31,.8,.008);
 for(const x of [-.654,.654])box('steel',x,1.301,.005,.008,.793,.627);
 box('steel',0,.894,.004,1.32,.02,.652);
 for(const z of [-.316,.302])for(let i=0;i<33;i++)
  box('dark',(i-16)*.037,.9043,z,.009,.0006,.019);
 box('steel',0,.91,-.337,1.32,.018,.014);
 for(const x of [-.649,.649])for(let i=0;i<5;i++)
  box('dark',x,1.011,-.04+i*.06,.0015,.046,.01);

 // Blue sash hinges, lit work chamber and transparent upper sash.
 for(const x of [-.651,.651])box('blue',x,1.723,-.327,.095,.178,.054);
 cylinder('light',0,1.693,-.09,.012,1.1,'x',12);
 for(const x of [-.566,.566])cylinder('steel',x,1.693,-.09,.014,.032,'x',12);
 box('glass',0,1.446,-.286,1.213,.526,.006,[.105,0,0]);
 box('steel',0,1.185,-.313,1.225,.012,.012);
 box('steel',0,1.706,-.258,1.225,.012,.012);

 // Compact controls and power outlets. These remain geometry, no texture loads.
 box('blue',-.414,1.9,-.350,.322,.161,.016);
 box('dark',-.46,1.926,-.359,.191,.089,.002);
 for(const y of [1.858,1.88])for(let i=0;i<4;i++)
  box('steel',-.37-i*.047,y,-.359,.032,.010,.002);
 for(const x of [-.287,-.307,-.327])box('white',x,1.95,-.359,.006,.009,.002);
 cylinder('steel',-.614,1.919,-.351,.015,.016,'z',12);
 box('dark',-.614,1.917,-.3595,.003,.013,.001);
 // A small blue identification plate on the left of the hood.
 box('blue',.362,1.897,-.350,.37,.042,.009);
 box('white',.362,1.897,-.355,.329,.006,.001);
 for(const x of [-.365,-.49]){
  box('blue',x,1.06,.315,.055,.069,.006);
  box('white',x,1.06,.310,.045,.058,.005);
  for(const dx of [-.011,.011])box('dark',x+dx,1.057,.3068,.005,.008,.0014);
  box('dark',x,1.078,.3068,.005,.006,.0014);
 }
 // A modest top ventilation grille, flush within the declared height.
 box('frame',0,2.095,.14,.9,.006,.25);
 for(let i=0;i<20;i++)box('steel',(i-9.5)*.043,2.099,.14,.018,.002,.23);
 return b.finish();
}

function shoeRack(){
 const b=builder(),{box,cylinder}=b;
 for(const x of [-.486,.486])for(const z of [-.156,.156]){
  cylinder('black',x,.336,z,.014,.648,'y',8);
  cylinder('rubber',x,.006,z,.014,.012,'y',8);
 }
 for(const x of [-.486,.486])cylinder('black',x,.646,0,.014,.312,'z',8);
 for(const y of [.12,.36,.6]){
  for(const z of [-.151,.151])box('black',0,y-.007,z,.948,.014,.008);
  for(const x of [-.467,.467])box('black',x,y-.007,0,.014,.014,.31);
  for(let i=0;i<13;i++)cylinder('black',(i-6)*.073,y-.004,0,.004,.3,'z',6);
 }
 box('black',0,.055,.156,.972,.018,.012);
 return b.finish();
}

function shoeShelf(){
 const b=builder(),{box,cylinder,xPrism}=b;
 box('white',0,.1275,0,1,.025,.34);
 box('white',0,.07,.156,.96,.14,.028);
 for(const x of [-.355,.355]){
  xPrism('white',[[.142,.004],[.142,.116],[-.145,.116]],x,.023);
  for(const y of [.031,.085]){
   cylinder('steel',x,y,.139,.008,.003,'z',10);
   box('dark',x,y,.137,.008,.0015,.001);
  }
 }
 return b.finish();
}

function shoeUpper(x,outline){
 // A continuous shell lofts from the sole to a real open collar. It avoids
 // floating ankle rings or a filled top with a dark circle painted over it.
 const vertices=[],indices=[],rings=[0,.06,.30,.60,1],count=outline.length;
 rings.forEach((blend,ring)=>outline.forEach(([xx,z])=>{
  const angle=Math.atan2(-xx/.059,-z/.15),topX=-Math.sin(angle)*.0365,topZ=.079-Math.cos(angle)*.0495;
  const back=(Math.cos(angle)+1)/2; // toe=1, heel=0
  const y=[.029,.05,.098-back*.026,.114-back*.016,.1216][ring];
  vertices.push(x+xx*.94*(1-blend)+topX*blend,y,z*.97*(1-blend)+topZ*blend);
 }));
 for(let ring=0;ring<rings.length-1;ring++)for(let j=0;j<count;j++){
  const a=ring*count+j,next=ring*count+(j+1)%count,c=a+count,d=next+count;
  indices.push(a,next,c,next,d,c);
 }
 const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));geometry.setIndex(indices);geometry.computeVertexNormals();
 return geometry;
}

function shoes(){
 const b=builder(),{box,cylinder,solePrism}=b;
 const outline=[[-.032,.15],[.032,.15],[.044,.134],[.049,.08],[.057,.018],[.059,-.054],[.054,-.107],
  [.042,-.134],[.022,-.148],[0,-.15],[-.025,-.147],[-.045,-.13],[-.056,-.10],[-.059,-.047],[-.053,.031],[-.043,.13]];
 for(const x of [-.071,.071]){
  solePrism('tread',outline,x,0,.009,.99);
  solePrism('sole',outline,x,.009,.02);
  const upper=shoeUpper(x,outline),surface=new T.Mesh(upper,new T.MeshBasicMaterial({side:T.DoubleSide}));
  surface.updateMatrixWorld(true);
  const ray=new T.Raycaster(new T.Vector3(),new T.Vector3(0,-1,0));
  const heightAt=(xx,z)=>{ray.ray.origin.set(xx,.25,z);return ray.intersectObject(surface,false)[0]?.point.y??.1;};
  // Dark inset and rounded collar read as an actual shoe opening from above.
  const inside=new T.CircleGeometry(1,20);inside.rotateX(-Math.PI/2);inside.scale(.0315,1,.0405);inside.translate(x,.102,.079);b.add('lining',inside);
  const innerWall=new T.CylinderGeometry(1,1,.02,20,1,true);innerWall.scale(.0315,1,.0405);innerWall.translate(x,.112,.079);b.add('lining',innerWall);
  const collar=new T.TorusGeometry(.5,.07,8,20);collar.rotateX(-Math.PI/2);collar.scale(.073,.06,.099);collar.translate(x,.1258,.079);b.add('upper',collar);
  for(let i=0;i<4;i++){
   const z=-.037+i*.018;
   const curve=new T.CatmullRomCurve3([-.028,-.014,0,.014,.028].map(dx=>new T.Vector3(x+dx,heightAt(x+dx,z)+.0017,z)));
   b.add('lace',new T.TubeGeometry(curve,8,.0015,4,false));
   for(const dx of [-.029,.029])cylinder('lining',x+dx,heightAt(x+dx,z)+.001,z,.0025,.002,'y',6);
  }
  surface.material.dispose();b.add('upper',upper);
  // Heel pull tab and a subtle side stripe give the pair a recognizable profile.
  box('upper',x,.108,.139,.022,.031,.006);
  box('lace',x,.11,.1425,.011,.012,.001);
  for(const dx of [-.054,.054])box('sole',x+dx,.042,-.03,.003,.006,.078);
 }
 return b.finish();
}

const factories={'biosafety-cabinet':biosafetyCabinet,'shoe-rack':shoeRack,'shoe-shelf':shoeShelf,shoes};

/** Same renderer is used by both editors and their FPS project preview. */
export function populateLabFurniture(item,group,_put){
 const entry=LAB_FURNITURE_MAP.get(item?.assetId);if(!entry)return false;
 if(!templates.has(entry.shape))templates.set(entry.shape,factories[entry.shape]());
 const model=new T.Group();model.name=entry.shape;model.userData.editId=item.id;
 model.scale.set(item.w/entry.width,item.height/entry.height,item.d/entry.depth);
 const shoeColor=/^#[0-9a-f]{6}$/i.test(item.color||'')?item.color:entry.color;
 for(const {key,geometry}of templates.get(entry.shape)){
  const material=new T.MeshStandardMaterial({...finishes[key],...(key==='upper'?{color:shoeColor}:{})});
  material.name='lab-'+key;material.userData.studioOwned=true;
  const mesh=new T.Mesh(geometry.clone(),material);mesh.name=entry.shape+'-'+key;
  mesh.userData.editId=item.id;mesh.userData.studioGeometry=true;
  mesh.castShadow=false;mesh.receiveShadow=true;model.add(mesh);
 }
 group.add(model);return true;
}
