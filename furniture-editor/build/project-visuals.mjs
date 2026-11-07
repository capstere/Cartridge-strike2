import {TAPE_WIDTH,hazardTile} from './floor-tape.mjs?v=5.9.0';
import {createCurtainMesh} from './curtain-mesh.mjs?v=5.7.0';
import {fittedSize,wallFootprint} from '../model-alignment.mjs?v=5.8.0';
import * as T from '../../vendor/three/three.module.js';
import {addModelToGroup,getLocalFile,importLocalGLB} from '../library/models.mjs?v=5.8.0';
import {assetHash} from '../library/glb-utils.mjs';
import {proceduralOf} from '../library/procedural.mjs?v=5.8.0';
import {populateProcedural,populateDiningChair} from '../library/procedural-mesh.mjs?v=5.8.0';
import {locatePoster} from './posters.mjs?v=5.7.3';
import {createPosterTexture} from './poster-art.mjs';
import {treatmentPosition} from './treatments.mjs?v=5.8.0';

let hazardMap;
export function floorTapeMesh(strip){
 const dx=strip.b[0]-strip.a[0],dz=strip.b[1]-strip.a[1],length=Math.hypot(dx,dz);
 const geometry=new T.PlaneGeometry(length,TAPE_WIDTH);
 const striped=strip.style==='hazard';
 if(striped){
  if(!hazardMap){
   hazardMap=new T.CanvasTexture(hazardTile());hazardMap.colorSpace=T.SRGBColorSpace;
   hazardMap.wrapS=hazardMap.wrapT=T.RepeatWrapping;hazardMap.userData.studioShared=true;
  }
  const uv=geometry.getAttribute('uv');
  for(let i=0;i<uv.count;i++)uv.setXY(i,uv.getX(i)*length/(2*TAPE_WIDTH),uv.getY(i)*.5);
 }
 const material=new T.MeshStandardMaterial({color:striped?0xffffff:strip.color,map:striped?hazardMap:null,
  roughness:.75,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1});
 material.userData.studioOwned=true;
 geometry.rotateX(-Math.PI/2);
 const mesh=new T.Mesh(geometry,material);mesh.name=strip.id;mesh.userData.editId=strip.id;
 mesh.position.set((strip.a[0]+strip.b[0])/2,.009,(strip.a[1]+strip.b[1])/2);
 mesh.rotation.y=-Math.atan2(dz,dx);mesh.receiveShadow=true;
 return mesh;
}

export function buildProjectDecorations(project,entries,root,onReady){
 for(const strip of project.ground?.tape||[])root.add(floorTapeMesh(strip));
 for(const poster of project.architecture.posters||[]){
  const at=locatePoster(poster,entries);if(!at)continue;
  const map=createPosterTexture(T,poster,onReady),material=new T.MeshBasicMaterial({map,side:T.DoubleSide});
  material.userData.studioOwned=true;
  const plane=new T.Mesh(new T.PlaneGeometry(poster.width,poster.height),material);
  plane.position.set(at.x,poster.y,at.z);plane.rotation.y=at.angle;plane.userData.editId=poster.id;root.add(plane);
 }
 for(const item of project.architecture.treatments||[]){
  const at=treatmentPosition(item,entries);if(!at)continue;
  const holder=new T.Group();holder.userData.editId=item.id;holder.position.set(at.center[0],0,at.center[1]);holder.rotation.y=at.angle;root.add(holder);
  if(item.type==='curtain'){holder.add(createCurtainMesh(item,at));continue;}
  const bottom=at.wall.kind==='window'?at.wall.sill:.2,top=at.wall.height-.08;
  const material=new T.MeshStandardMaterial({color:0x58656a,side:T.DoubleSide,roughness:.85});
  material.userData.studioOwned=true;
  const count=Math.max(4,Math.ceil((top-bottom)/.08));
  for(let i=0;i<count;i++){
   const mesh=new T.Mesh(new T.BoxGeometry(at.width+.01,.04,.03),material);
   mesh.position.set(0,bottom+(top-bottom)*(i+.5)/count,0);holder.add(mesh);
  }
 }
}

/** Same furniture models and dimensions in the studio and private/published FPS. */
export async function buildProjectFurniture(items,root,{assets=[]}={}){
 for(const id of new Set(items.map(o=>o.assetId).filter(id=>id?.startsWith('local:')))){
  if(await getLocalFile(id))continue;
  const row=assets.find(a=>a.assetId===id);
  if(!row||row.file!==`assets/models/${id.slice(6)}.glb`)throw Error('Modellfil saknas: '+id);
  const response=await fetch(new URL('../../'+row.file,import.meta.url));
  if(!response.ok)throw Error('Modellfil saknas: '+row.file);
  const bytes=new Uint8Array(await response.arrayBuffer());
  if(bytes.length!==row.bytes||await assetHash(bytes)!==id.slice(6))throw Error('Modellens innehållshash stämmer inte: '+row.file);
  await importLocalGLB(new File([bytes],row.file.split('/').at(-1),{type:'model/gltf-binary'}));
 }
 const pending=[];
 for(const item of items){
  const holder=new T.Group();holder.userData.editId=item.id;
  holder.position.set(item.x,item.elevation||0,item.z);holder.rotation.y=item.yaw||0;root.add(holder);
  const put=(x,y,z,w,h,d,material=0x668c90)=>{const m=typeof material==='number'?new T.MeshStandardMaterial({color:material}):material;
   if(typeof material==='number')m.userData.studioOwned=true;
   const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),m);mesh.userData.studioGeometry=true;mesh.userData.editId=item.id;mesh.position.set(x,y,z);holder.add(mesh);return mesh;};
  if(proceduralOf(item))populateProcedural(item,holder,put);
  else if(item.assetId)pending.push(addModelToGroup(item,holder).then(ok=>{if(!ok)throw Error(`Modellen ${item.assetName||item.id} saknas: ${holder.userData.modelError}`);applyFurnitureAppearance(holder,item);}));
  else if(['table','desk','coffee-table'].includes(item.kind)){
   put(0,item.height-.04,0,item.w,.08,item.d,0xd5d4c9);
   for(const x of [-1,1])for(const z of [-1,1])put(x*(item.w/2-.06),item.height/2,z*(item.d/2-.06),.05,item.height,.05,0x68777c);
  }else if(item.kind==='chair')populateDiningChair(item,put);
  else put(0,item.height/2,0,item.w,item.height,item.d,0x668c90);
  applyFurnitureAppearance(holder,item);
 }
 await Promise.all(pending);return root;
}

/** Wrapper transforms preserve GLB vertices, normals, UVs, materials and cached originals. */
export function applyFurnitureAppearance(holder,item){
 let frame=holder.children.find(o=>o.userData.furnitureFrame);
 if(!frame&&!item.mirrored&&!(item.wallMount&&item.wallRoll))return;
 if(!frame){frame=new T.Group();frame.userData.furnitureFrame=true;const content=new T.Group();holder.children.slice().forEach(child=>content.add(child));frame.add(content);holder.add(frame);}
 const fit=fittedSize(item),wall=wallFootprint(item),content=frame.children[0];
 // A lazy GLB may arrive after the preview frame was created.
 holder.children.filter(child=>child!==frame).forEach(child=>content.add(child));
 frame.position.y=item.wallMount?wall.height/2:fit.h/2;
 frame.rotation.set(0,wall.frontAngle,item.wallMount?(item.wallRoll||0):0);
 frame.scale.x=item.mirrored?-1:1;
 content.rotation.y=-wall.frontAngle;content.position.y=-fit.h/2;
}
