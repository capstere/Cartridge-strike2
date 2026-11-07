import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {readLibraryAsset} from '../library/models.mjs?v=5.8.0';
import {fittedSize,wallFootprint} from '../model-alignment.mjs?v=5.8.0';
import {projectWallPieces} from './project-scene.mjs?v=5.8.0';
import {FIXTURES,DISPLAY_FACES,fixturePose} from './environment-layout.mjs';
import {makeArtAtlas,makeSignalAtlas,artKey,decorRandom} from './environment-art.mjs';

const modelIds={extinguisher:'hissrum12:extinguisher',bracket:'hissrum12:extinguisherBracket',gloves:'hissrum12:gloveHolder'};
const metal=0x778687,dark=0x35464b,ivory=0xe0e3d9,red=0xb53e38;
const transform=(x,y,z,rotation=0)=>new T.Matrix4().makeRotationY(rotation).setPosition(x,y,z);
function adornFixture(f,draw){
 const [w,h,d]=FIXTURES[f.kind],{box,round,card,model}=draw;
 switch(f.kind){
  case 'extinguisher':
   model('bracket',0,-.31,.054,.18,.36,.10);
   model('extinguisher',0,-.42,.143,.24,.60,.22);
   box(0,.425,.014,.22,.24,.025,ivory);card(f,0,.425,.029,.209,.229);break;
  case 'bell':
   round(0,0,.025,.25,.04,dark);round(0,0,.074,.225,.075,red);round(0,0,.118,.042,.023,metal);break;
  case 'reader':
   box(0,0,d/2,w,h,d,dark);box(0,h*.29,d+.001,w*.61,.012,.004,0x77bf98);
   for(let i=0;i<3;i++)box(0,-.015-i*.022,d+.001,w*.48,.006,.004,metal);break;
  case 'ppe':
   model('gloves',0,-.18,.093,.32,.20,.15);
   box(0,.11,.013,.27,.18,.024,ivory);card(f,0,.11,.027,.253,.162);break;
  case 'clock':
   round(0,0,d/2,w,d,metal);card(f,0,0,d+.002,w*.98,h*.98);break;
  case 'firstAid':
   box(0,0,d/2,w,h,d,ivory);box(w*.39,0,d+.011,.016,.11,.022,metal);
   card(f,-w*.055,0,d+.003,w*.71,h*.76);break;
  default:{
   const frame=f.kind==='board'?metal:f.kind==='print'?0x91744e:f.kind==='callpoint'?red:ivory;
   box(0,0,d/2,w,h,d,frame);card(f,0,0,d+.0018,w*.964,h*.934);
   if(f.kind==='board'){
    box(0,-h*.48,.037,w*.80,.018,.063,metal);
    box(-w*.25,-h*.45,.04,.105,.016,.017,0x366676);
   }
  }
 }
}

function furnishBackground(kind,draw,random){
 const {box,vessel}=draw,steel=0x7c8d90,oak=0xb49772,laminate=0xcad1cb;
 const cover=[0x457076,0x647b92,0x936c55,0x6c8173][Math.floor(random()*4)];
 function legs(width,depth,height){
  for(const x of [-1,1])for(const z of [-1,1])box(x*(width/2-.065),height/2,z*(depth/2-.065),.063,height,.063,steel);
 }
 function bottle(x,y,z,h,color){vessel(x,y+h*.42,z,h*.41,h*.83,color);vessel(x,y+h*.88,z,h*.23,h*.16,0x63757b);}
 switch(kind){
  case 'workstation':
   legs(1.34,.73,.71);box(0,.742,0,1.34,.064,.73,oak);
   box(.12,.99,-.13,.048,.42,.046,steel);box(.12,1.095,-.14,.50,.32,.044,dark);
   box(.12,1.095,-.115,.459,.277,.008,0x67878b);box(.09,.785,.12,.36,.02,.13,0x586368);
   box(-.43,.79,.08,.23,.035,.29,cover);break;
  case 'seat':
   legs(.46,.44,.405);box(0,.439,0,.48,.068,.46,cover);
   box(0,.61,-.19,.045,.32,.04,steel);box(0,.72,-.20,.45,.26,.056,cover);break;
  case 'labBench':
   box(0,.41,0,1.39,.79,.68,laminate);box(0,.843,0,1.48,.077,.78,0x77868a);
   for(const x of [-.46,0,.46]){box(x,.52,.348,.426,.51,.015,ivory);box(x,.69,.364,.14,.025,.023,steel);}
   box(-.34,1.03,-.11,.44,.29,.36,0xe6e5d9);box(-.34,1.05,.075,.28,.17,.014,0x476773);
   for(let i=0;i<3;i++)bottle(.08+i*.14,.883,.02,i%2?.18:.23,i%2?0xa8beb9:0x927c57);break;
  case 'bookcase':case 'labShelf':{
   const width=kind==='bookcase'?1.05:1.10,height=1.54;
   for(const side of [-1,1])box(side*(width/2-.025),height/2,0,.05,height,.41,steel);
   for(const y of [.12,.59,1.06,1.53])box(0,y,0,width,.043,.42,kind==='bookcase'?oak:laminate);
   for(let row=0;row<2;row++)for(let j=0;j<4;j++){
    const x=-width*.36+j*.195,y=.142+row*.47;
    if(kind==='labShelf')bottle(x,y,.03,.19+random()*.10,j%2?0xb2c0b7:0x9a8769);
    else{const h=.23+random()*.10;box(x,y+h/2,.035,.105,h,.22,j%2?cover:ivory);box(x,y+h*.70,.15,.073,.025,.008,ivory);}
   }
   break;
  }
  case 'cartons':
   box(0,.145,0,.51,.29,.46,0xbc9a70);box(.02,.396,-.017,.39,.21,.35,0xaa8d68);
   box(.02,.503,-.017,.045,.006,.35,0xd9c19b);break;
 }
}

function displayMatrix(item){
 const m=transform(item.x,item.elevation||0,item.z,item.yaw||0);
 if(!item.mirrored&&!(item.wallMount&&item.wallRoll))return m;
 const wall=wallFootprint(item),fit=fittedSize(item),frame=new T.Object3D();
 frame.position.y=(item.wallMount?wall.height:fit.h)/2;
 frame.rotation.set(0,wall.frontAngle,item.wallMount?item.wallRoll||0:0);
 frame.scale.x=item.mirrored?-1:1;frame.updateMatrix();
 return m.multiply(frame.matrix).multiply(transform(0,-fit.h/2,0,-wall.frontAngle));
}

export async function buildEnvironment(project,entries,items){
 const e=project.environment;if(!e)return null;
 const wallById=new Map(entries.filter(w=>!w.deleted).map(w=>[w.id,w]));
 const itemById=new Map(items.map(o=>[o.id,o]));
 const models=new Map();
 const needed=new Set(e.fixtures.flatMap(f=>f.kind==='extinguisher'?['extinguisher','bracket']:f.kind==='ppe'?['gloves']:[]));
 await Promise.all([...needed].map(async key=>models.set(key,await readLibraryAsset(modelIds[key]))));
 const isSignal=r=>['snow','glitch'].includes(r.art);
 const atlas=makeArtAtlas([...e.fixtures.filter(f=>!['bell','reader'].includes(f.kind)),...e.displays.filter(d=>!isSignal(d)).map(d=>({kind:'display',art:d.art}))]);
 const signals=e.displays.some(isSignal)?makeSignalAtlas(e.seed):null;
 const materials={solid:new T.MeshStandardMaterial({vertexColors:true,roughness:.82,metalness:.06}),
  card:new T.MeshBasicMaterial({map:atlas.map,toneMapped:false,alphaTest:.45,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1})};
 if(signals)materials.signal=new T.MeshBasicMaterial({map:signals.map,toneMapped:false,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 const unitBox=new T.BoxGeometry(),unitPlane=new T.PlaneGeometry(),cylinder=new T.CylinderGeometry(.5,.5,1,14);
 const root=new T.Group(),buckets=new Map(),screens=[],regions=new Map(),random=decorRandom(e.seed);
 root.name='floor5-environment';
 let base=new T.Matrix4(),region;
 function locate(key,m){
  base=m;const cell=key+'/'+Math.floor(m.elements[12]/8)+','+Math.floor(m.elements[14]/8);
  if(!regions.has(cell)){const g=new T.Group();g.name='environment-'+cell;regions.set(cell,g);root.add(g);}
  region=regions.get(cell);
 }
 function add(kind,geometry,m,color,uv){
  const g=geometry.index?geometry.toNonIndexed():geometry.clone();g.applyMatrix4(m);
  if(m.determinant()<0){
   // Flattened world batches have positive determinant. Restore the winding of a mirrored model.
   for(const a of Object.values(g.attributes))for(let i=0;i<a.count;i+=3){
    for(let j=0;j<a.itemSize;j++){const l=(i+1)*a.itemSize+j,r=(i+2)*a.itemSize+j;[a.array[l],a.array[r]]=[a.array[r],a.array[l]];}
   }
  }
  if(kind==='solid'){
   const c=color?.isColor?color:new T.Color(color),n=g.attributes.position.count,col=new Float32Array(n*3);
   for(let i=0;i<n;i++){col[i*3]=c.r;col[i*3+1]=c.g;col[i*3+2]=c.b;}
   for(const attr of Object.keys(g.attributes))if(!['position','normal'].includes(attr))g.deleteAttribute(attr);
   g.setAttribute('color',new T.BufferAttribute(col,3));
  }else{
   const a=g.attributes.uv;for(let i=0;i<a.count;i++)a.setXY(i,uv[0]+a.getX(i)*(uv[2]-uv[0]),uv[1]+a.getY(i)*(uv[3]-uv[1]));
  }
  const key=region.name+'/'+kind;
  if(!buckets.has(key))buckets.set(key,{region,kind,parts:[]});
  buckets.get(key).parts.push(g);
 }
 const matrix=(x,y,z,w,h,d)=>base.clone().multiply(new T.Matrix4().makeTranslation(x,y,z)).scale(new T.Vector3(w,h,d));
 const draw={
  box:(x,y,z,w,h,d,c)=>add('solid',unitBox,matrix(x,y,z,w,h,d),c),
  vessel:(x,y,z,d,h,c)=>add('solid',cylinder,matrix(x,y,z,d,h,d),c),
  round:(x,y,z,d,depth,c)=>add('solid',cylinder,matrix(x,y,z,d,d,depth).multiply(new T.Matrix4().makeRotationX(Math.PI/2)),c),
  card:(r,x,y,z,w,h)=>add('card',unitPlane,matrix(x,y,z,w,h,1),null,atlas.tiles.get(artKey(r))),
  model:(id,x,y,z,w,h,d)=>{
   const src=models.get(id),size=src.originalSize,b=src.originalBounds,center=b.getCenter(new T.Vector3()),s=Math.min(w/size.x,h/size.y,d/size.z);
   const placement=matrix(x,y,z,s,s,s).multiply(new T.Matrix4().makeTranslation(-center.x,-b.min.y,-center.z));
   src.scene.traverse(mesh=>{if(mesh.isMesh)add('solid',mesh.geometry,placement.clone().multiply(mesh.matrixWorld),mesh.material.color);});
  }
 };
 for(const f of e.fixtures){
  const p=fixturePose(f,wallById.get(f.wallId));if(!p)continue;
  locate(f.roomId,transform(p.x,p.y,p.z,p.yaw));adornFixture(f,draw);
 }
 for(const b of e.background){
  locate(b.roomId,transform(b.x,0,b.z,b.yaw));furnishBackground(b.kind,draw,random);
 }
 for(const display of e.displays){
  const o=itemById.get(display.host),face=DISPLAY_FACES[o?.assetId];if(!face)continue;
  const size=fittedSize(o),side=face.side*(display.side||1);
  const z=(face.absoluteZ??face.z*size.d)*(display.side||1);
  const m=displayMatrix(o).multiply(transform(face.x*size.w,face.y*size.h,z+side*.0015,side===1?0:Math.PI));
  // Mirror the fitted host position, but keep writing readable on the front face.
  if(m.determinant()<0)m.scale(new T.Vector3(-1,1,1));
  locate(o.roomId||'screens',m);
  const w=face.w*size.w,h=face.h*size.h;
  if(isSignal(display)){
   add('signal',unitPlane,matrix(0,0,0,w,h,1),null,signals.tiles[display.art]);
   screens.push({region,sphere:new T.Sphere(new T.Vector3().setFromMatrixPosition(m),Math.hypot(w,h)/2),
    normal:new T.Vector3(0,0,1).transformDirection(m)});
  }else draw.card({kind:'display',art:display.art},0,0,0,w,h);
 }

 const pieces=projectWallPieces(entries.map(w=>({...w,source:false}))),facade=e.facade;
 const byHost=new Map();for(const p of pieces){if(!byHost.has(p.id))byHost.set(p.id,[]);byHost.get(p.id).push(p);}
 function strip(a,b,side,make){
  const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.01)return;
  const steps=Math.ceil(length/6);
  for(let i=0;i<steps;i++){const t=(i+.5)/steps;
   locate('facade',transform(a[0]+dx*t,0,a[1]+dz*t,Math.atan2(-dz*side,dx*side)));make(length/steps);}
 }
 // Keep the edging outside the envelope and clear of the interior ceiling/floor planes.
 const area=facade.outline.reduce((sum,[x,z],i)=>{
  const next=facade.outline[(i+1)%facade.outline.length];return sum+x*next[1]-next[0]*z;
 },0);
 const exteriorSide=area>0?-1:1;
 for(let i=0;i<facade.outline.length;i++)strip(facade.outline[i],facade.outline[(i+1)%facade.outline.length],exteriorSide,w=>{
  draw.box(0,2.915,.09,w+.004,.11,.15,facade.color);draw.box(0,-.085,.09,w+.004,.15,.15,facade.color);
 });
 for(const edge of facade.edges){
  const wall=wallById.get(edge.wallId);if(!wall)continue;
  const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],length2=dx*dx+dz*dz;
  const along=p=>((p[0]-wall.a[0])*dx+(p[1]-wall.a[1])*dz)/length2;
  const at=t=>[wall.a[0]+dx*t,wall.a[1]+dz*t];
  for(const piece of byHost.get(wall.id)||[]){
   const t0=along(piece.a),t1=along(piece.b),lo=Math.max(edge.lo,Math.min(t0,t1)),hi=Math.min(edge.hi,Math.max(t0,t1));
   if(hi<=lo)continue;
   const outer=(wall.thickness||.11)/2+.017,H=wall.height,sill=wall.sill??.9;
   strip(at(lo),at(hi),edge.side,w=>{
    if(wall.kind==='wall'){draw.box(0,H/2,outer,w,H,.027,facade.color);return;}
    if(wall.kind==='window'){
     draw.box(0,sill/2,outer,w,sill,.027,facade.color);
     draw.box(0,H-.142,outer,w,.284,.027,facade.color);
     // Exterior return projects beyond the glass and leaves its clear opening intact.
     draw.box(0,sill+.016,outer+.175,w,.042,.35,facade.color);
     draw.box(0,H-.06,outer+.09,w,.10,.19,facade.color);
    }else{draw.box(0,.052,outer,w,.08,.055,facade.color);}
   });
  }
 }
 for(const {region,kind,parts} of buckets.values()){
  const geo=mergeGeometries(parts,false);parts.forEach(g=>g.dispose());
  const mesh=new T.Mesh(geo,materials[kind]);mesh.name='environment-'+kind;region.add(mesh);
 }
 unitBox.dispose();unitPlane.dispose();cylinder.dispose();
 const frustum=new T.Frustum(),projection=new T.Matrix4(),sight=new T.Vector3();let lastTick=-1;
 return {root,update(camera,time,settings,world){
  if(!signals)return;
  const moving=!settings.reducedMotion&&settings.graphics!=='low';
  if(!moving){signals.map.offset.y=0;lastTick=-1;return;}
  const tick=Math.floor(time*8);if(tick===lastTick)return;lastTick=tick;
  frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const visible=screens.some(({region,sphere,normal})=>region.visible&&frustum.intersectsSphere(sphere)&&
   sight.subVectors(camera.position,sphere.center).dot(normal)>0&&world.segmentClear(camera.position,sphere.center,{vision:true}));
  if(visible)signals.map.offset.y=-(tick%signals.frames)/signals.frames;
 },dispose(){
  root.removeFromParent();root.traverse(o=>o.geometry?.dispose());Object.values(materials).forEach(m=>m.dispose());atlas.map.dispose();signals?.map.dispose();
 }};
}
