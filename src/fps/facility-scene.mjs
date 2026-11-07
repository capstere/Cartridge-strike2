/** Industrial reference area. All placement is derived from existing I12/S16,
 * wall spans and furniture bounds. These are fictional finishes, not verified
 * equipment locations or new openings. Simulation never imports this module. */
import * as T from '../../vendor/three/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {RoundedBoxGeometry} from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import {createFacilityAssetLibrary} from './facility-assets.mjs';
import {bounds} from './living-floor-plan.mjs';

export function facilityPlan(world){
  const room=world.data.rooms.find(r=>r.id==='I12'),route=world.data.routes.find(r=>r.id==='S16');
  if(!room||!route)return null;
  const b=bounds(room.polygon),path=route.segments[0].points;
  const inFocus=(x,z)=>(x>b[0]&&x<b[2]&&z>b[1]&&z<b[3])||
    (Math.abs(x-path[0][0])<1.55&&z>path[1][1]-.3&&z<path[0][1]);
  const walls=[];
  // Clip existing opaque spans into short sections. Glass and door apertures
  // never receive panels; no new wall or collision record is invented.
  for(const w of world.description.boxes){
    if(!/^WALL-\d+$/.test(w.id)||w.material!=='wall'||w.w<=.016||w.y-w.h/2>.13||w.y+w.h/2<.92)continue;
    const c=Math.cos(w.angle||0),s=Math.sin(w.angle||0),n=Math.ceil(w.w/1.15);
    for(let i=0;i<n;i++)for(const side of[-1,1]){
      const along=-w.w/2+(i+.5)*w.w/n,x=w.x+c*along+s*side*(w.d/2+.008),z=w.z-s*along+c*side*(w.d/2+.008);
      if(inFocus(x+s*side*.12,z+c*side*.12))walls.push({x,z,yaw:w.angle||0,side,width:w.w/n-.012,source:w.id});
    }
  }
  const props=world.living.props.filter(p=>p.roomId==='I12'),pallet=props.find(p=>p.type==='pallet');
  const cargo=pallet?world.living.boxes.filter(p=>p.livingOwner===pallet.id&&/-box-\d+$/.test(p.id)):[];
  const palletBase=pallet?world.living.boxes.find(p=>p.livingOwner===pallet.id&&p.id.endsWith('-wood-base')):null;
  const lockerPlacements=props.filter(p=>p.type==='locker').flatMap(p=>[-1,1].map(side=>({owner:p.id,x:p.x+side*p.w/4,y:0,z:p.z,size:[p.w/2-.008,p.h,p.d]})));
  return {room:b,path,walls,props,lockerPlacements,cargo,palletBase,
    replacedProps:[...new Set([...lockerPlacements.map(p=>p.owner),...(cargo.length&&palletBase?[pallet.id]:[])])],
    geographyChanged:false};
}

function finishTextures(){
  // Authored manufacturing finish: directional grain and restrained roughness,
  // with no photo, random grime, external download or per-frame texture work.
  const make=(normal=false)=>{const c=document.createElement('canvas');c.width=c.height=128;const ctx=c.getContext('2d');
    const im=ctx.createImageData(128,128);for(let y=0;y<128;y++)for(let x=0;x<128;x++){
      const i=(y*128+x)*4,v=Math.sin(y*2.71)*.55+Math.sin(y*.77)*.3;
      im.data[i]=normal?128:Math.round(156+v*12);im.data[i+1]=normal?Math.round(128+v*5):im.data[i];im.data[i+2]=normal?255:im.data[i];im.data[i+3]=255;
    }ctx.putImageData(im,0,0);const t=new T.CanvasTexture(c);t.wrapS=t.wrapT=T.RepeatWrapping;t.repeat.set(2,5);t.anisotropy=4;t.name=normal?'facility-brushed-normal':'facility-brushed-roughness';return t;};
  return {normal:make(true),rough:make()};
}

export async function buildFacilityScene(world,settings){
  const plan=facilityPlan(world);if(!plan)return null;
  const library=createFacilityAssetLibrary({THREE:T,GLTFLoader});
  try{await library.preload();}catch(e){library.dispose();throw e;}
  const root=new T.Group();root.name='industrial-reference';
  const staticRoot=new T.Group();staticRoot.name='industrial-static';root.add(staticRoot);
  const tex=finishTextures(),owned=[],batches=new Map(),handles=[],qualityMeshes=[],lods=[];let assetPlacements=0;
  const paint=new T.MeshStandardMaterial({vertexColors:true,roughness:.59,metalness:.10});paint.name='facility-enamel';
  const metal=new T.MeshStandardMaterial({color:0xa8b7b9,roughness:.56,metalness:.82,normalMap:tex.normal,roughnessMap:tex.rough,normalScale:new T.Vector2(.12,.12)});metal.name='facility-brushed-steel';
  const dark=new T.MeshStandardMaterial({color:0x23343c,roughness:.68,metalness:.35});dark.name='facility-rubber-reveals';
  owned.push(paint,metal,dark);
  function add(g,m,x,y,z,yaw=0,color=0xffffff){
    if(g.index){const next=g.toNonIndexed();g.dispose();g=next;}
    if(m.vertexColors){const col=new T.Color(color),a=new Float32Array(g.attributes.position.count*3);for(let i=0;i<a.length;i+=3){a[i]=col.r;a[i+1]=col.g;a[i+2]=col.b;}g.setAttribute('color',new T.BufferAttribute(a,3));}
    g.rotateY(yaw);g.translate(x,y,z);
    const key=`${Math.floor(x/6)}:${Math.floor(z/6)}:${m.name}`;
    if(!batches.has(key))batches.set(key,{material:m,parts:[]});batches.get(key).parts.push(g);
  }
  const box=(x,y,z,w,h,d,m=paint,color=0xffffff,yaw=0,bevel=.003)=>add(bevel?new RoundedBoxGeometry(w,h,d,1,Math.min(bevel,w/4,h/4,d/4)):new T.BoxGeometry(w,h,d),m,x,y,z,yaw,color);
  const [x0,z0,x1,z1]=plan.room,cx=(x0+x1)/2,liftX=cx+1.04;
  for(const w of plan.walls){
    const nx=Math.sin(w.yaw)*w.side,nz=Math.cos(w.yaw)*w.side;
    box(w.x,.49,w.z,w.width,.72,.014,paint,0x527579,w.yaw);
    box(w.x+nx*.011,.885,w.z+nz*.011,w.width,.035,.026,metal,0xffffff,w.yaw);
    box(w.x+nx*.010,.18,w.z+nz*.010,w.width,.065,.024,dark,0xffffff,w.yaw);
    // Recess rather than extra wall: tiny vertical seam ends at the dado rail.
    box(w.x+nx*.002,.49,w.z+nz*.002,.006,.68,.006,dark,0xffffff,w.yaw,0);
  }
  // Freight front gains actual folded sheet edges, handles and a dark perimeter
  // seal. Closed decorative door panels stay on the original opaque wall.
  for(const side of[-1,1]){
    const x=liftX+side*.70,z=z0+.19;
    box(x,1.37,z,1.13,1.14,.018,metal);
    for(let k=0;k<6;k++)box(x-.47+k*.188,1.37,z+.012,.008,1.08,.004,dark,0xffffff,0,0);
    box(x,1.37,z+.014,1.09,.018,.012,metal);
    box(liftX+side*1.48,1.33,z0+.205,.055,2.61,.065,dark);
    box(liftX+side*1.51,1.33,z0+.235,.025,2.61,.05,metal);
    box(x,.31,z+.004,1.18,.35,.012,metal);
  }
  box(liftX,2.65,z0+.23,3.08,.12,.13,paint,0x243f4a);

  // One shared sign atlas. The exact user-selected values remain untouched.
  const atlas=document.createElement('canvas');atlas.width=1024;atlas.height=512;
  const ctx=atlas.getContext('2d');ctx.fillStyle='#18333f';ctx.fillRect(0,0,1024,512);
  const titles=['Technical Storage','← Technical Storage','UNIT 05 / SUPPLIES','05'];
  for(let i=0;i<4;i++){const y=i*128;ctx.fillStyle='#ddb55e';ctx.fillRect(0,y,9,128);ctx.fillStyle='#eef2eb';ctx.font=`600 ${i===3?100:58}px Arial`;ctx.textAlign=i===3?'center':'left';ctx.textBaseline='middle';if(i===3){ctx.save();ctx.translate(512,y+65);ctx.scale(4.8,1);ctx.fillText(titles[i],0,0);ctx.restore();}else ctx.fillText(titles[i],44,y+65,920);}
  const atlasTexture=new T.CanvasTexture(atlas);atlasTexture.colorSpace=T.SRGBColorSpace;atlasTexture.anisotropy=8;
  const sign=new T.MeshStandardMaterial({map:atlasTexture,roughness:.8});sign.name='facility-wayfinding';owned.push(sign);
  const label=(x,y,z,w,h,tile,yaw=0)=>{const g=new T.PlaneGeometry(w,h),uv=g.attributes.uv;for(let i=0;i<uv.count;i++)uv.setY(i,(uv.getY(i)+3-tile)/4);add(g,sign,x,y,z,yaw);};
  label(liftX,2.20,z0+.23,2.20,.18,0);
  label(cx-3.0,1.92,z0+.145,.72,.48,3);
  label(cx-3.0,1.52,z0+.145,1.10,.16,2);
  const routeX=plan.path[0][0];
  label(-15.071,1.65,-20.95,1.35,.23,1,-Math.PI/2);
  // Utility/cable cover follows the existing route ceiling, above head clearance.
  const routeStart=plan.path[0][1]-.9,routeEnd=plan.path[1][1]+.7,span=routeStart-routeEnd;
  for(const side of[-1,1])box(routeX+side*.28,2.72,(routeStart+routeEnd)/2,.035,.06,span,dark);
  for(let z=routeEnd;z<routeStart;z+=.48)box(routeX,2.755,z,.57,.018,.035,metal);

  const matrix=(x,y,z,yaw=0,scale=[1,1,1])=>new T.Matrix4().compose(new T.Vector3(x,y,z),new T.Quaternion().setFromEuler(new T.Euler(0,yaw,0)),new T.Vector3(...scale));
  const fixtureMatrices=[];
  for(let z=routeEnd+.4;z<routeStart;z+=2.6)fixtureMatrices.push(matrix(routeX,2.67,z,Math.PI/2));
  // Repeated fixtures are instanced within the area; no giant floor-wide batch.
  const lights=library.instantiateBatch('strip_light',fixtureMatrices);handles.push(lights);staticRoot.add(lights.object);
  // The authored lens faces down (-Y). Give that diffuser its own restrained
  // emission; the dark housing remains opaque and no dynamic light is added.
  lights.object.traverse(o=>{if(o.material?.name==='N01_IVORY'){o.material.emissive.setHex(0xc5e5e3);o.material.emissiveIntensity=1.15;}});
  function asset(id,x,y,z,yaw=0,targetSize=null){
    const standard=library.instantiate(id),low=library.instantiate(id,{quality:'low'});
    handles.push(standard,low);assetPlacements++;const holder=new T.Group();holder.position.set(x,y,z);holder.rotation.y=yaw;
    for(const h of[standard,low]){
      if(targetSize){const b=new T.Box3().setFromObject(h.object),s=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3());h.object.position.set(-center.x,-b.min.y,-center.z);const scaled=new T.Group();scaled.add(h.object);scaled.scale.set(targetSize[0]/s.x,targetSize[1]/s.y,targetSize[2]/s.z);holder.add(scaled);}else holder.add(h.object);
      h.object.traverse(o=>{if(o.isLOD)lods.push(o);});
    }
    holder.children[1].visible=false;qualityMeshes.push([holder.children[0],holder.children[1]]);root.add(holder);return holder;
  }
  asset('access_terminal',liftX+1.76,1.17,z0+.14);
  const door=world.data.doors.find(d=>d.id==='D38');
  if(door)asset('access_terminal',door.center[0]+.065,1.20,door.center[1]+door.width/2+.25,Math.PI/2);
  asset('wall_vent',x0+.85,2.18,z1-.09,Math.PI);
  asset('wall_vent',-15.07,2.21,-18.7,-Math.PI/2);
  for(const p of plan.lockerPlacements)asset('security_locker',p.x,p.y,p.z,0,p.size);
  // Replace cargo rather than nesting the new case inside the old cartons.
  // Each instance fits an existing solid cargo box; the physical gaps remain.
  if(plan.palletBase&&plan.cargo.length){
    // Pallet geometry is supplied by the shared Riposte adapter; cargo remains NORD-01.
    const prototype=library.instantiate('supply_crate'),bounds=new T.Box3().setFromObject(prototype.object),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
    const transforms=plan.cargo.map(b=>matrix(b.x,b.y,b.z,b.angle||0,[b.w/size.x,b.h/size.y,b.d/size.z]).multiply(new T.Matrix4().makeTranslation(-center.x,-center.y,-center.z)));
    prototype.release();const crates=library.instantiateBatch('supply_crate',transforms);handles.push(crates);staticRoot.add(crates.object);assetPlacements+=plan.cargo.length;
  }
  const rack=plan.props.find(p=>p.type==='creform'&&p.variant==='requisition');
  if(rack){const tops=world.living.boxes.filter(b=>b.livingOwner===rack.id&&b.id.includes('-tote-')).map(b=>b.y+b.h/2);
    if(tops.length)asset('medical_case',rack.x,Math.max(...tops)+.006,rack.z,0,[.48,.20,.32]);}

  let triangles=0;
  for(const [key,b]of batches){const g=mergeGeometries(b.parts,false);b.parts.forEach(p=>p.dispose());g.computeBoundingSphere();const m=new T.Mesh(g,b.material);m.name='facility-static-'+key;m.receiveShadow=true;staticRoot.add(m);triangles+=g.attributes.position.count/3;}
  // Fixed geometry skips recursive matrix work; LOD visibility is updated
  // explicitly below, so camera-dependent state is never frozen.
  root.updateMatrixWorld(true);root.traverse(o=>{o.matrixAutoUpdate=false;o.matrixWorldAutoUpdate=false;});root.updateMatrixWorld=()=>{};
  let quality=null,disposed=false;
  const update=camera=>{if(disposed)return;if(quality!==settings.graphics){quality=settings.graphics;for(const [hi,lo]of qualityMeshes){hi.visible=quality!=='low';lo.visible=quality==='low';}}for(const lod of lods)if(lod.parent?.visible)lod.update(camera);};
  return {root,plan,library,update,report:{triangles,staticBatches:batches.size,assetPlacements,instancedFixtures:fixtureMatrices.length,geographyChanged:false},dispose(){if(disposed)return;disposed=true;library.dispose();staticRoot.traverse(o=>{if(!o.isInstancedMesh)o.geometry?.dispose();});for(const m of owned)m.dispose();atlasTexture.dispose();tex.normal.dispose();tex.rough.dispose();root.removeFromParent();root.clear();}};
}
