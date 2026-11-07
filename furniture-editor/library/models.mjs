import {applyEquipmentArt,releaseEquipmentArt} from '../../src/fps/fictional-equipment.mjs';
/** Shared lazy 3D model management. Original source resources stay immutable. */
import * as T from '../../vendor/three/three.module.js';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import {LIBRARY_MAP} from './catalog.mjs?v=5.8.0';
import {isTable,isChair,chairColors,FINISH_COLORS,modelScale} from '../appearance.mjs?v=5.8.0';
import {inspectGLB,assetHash,safeFilename,assetPut,assetGet,assetAll,GLB_MAX_BYTES} from './glb-utils.mjs';
const loader=new GLTFLoader();
const sourceCache=new Map(),locals=new Map();
/** Material overrides are applied only to CLONES, never to cached originals. */
function recolorSemanticMesh(node,item){
 if(!node.isMesh||(!isTable(item)&&!isChair(item)))return;
 const named=(node.name+' '+(Array.isArray(node.material)?node.material.map(m=>m?.name||'').join(' '):node.material?.name||'')).toLowerCase();
 const leg=/(leg|foot|base|frame|support|stem|stand|ben|underrede)/.test(named);
 const finish=isTable(item)?(leg?FINISH_COLORS.silver:FINISH_COLORS.white):
   (leg?chairColors(item).legs:chairColors(item).body);
 const adjust=original=>{
  if(!original?.clone||!original.color)return original;
  const material=original.clone();material.userData={...material.userData,studioOwned:true};
  material.color.set(finish);
  // One GLB mesh cannot reliably separate a tabletop from its legs.
  // Discard only the base-color map on this preview clone so presets stay visible.
  if('map' in material)material.map=null;
  material.needsUpdate=true;
  return material;
 };
 node.material=Array.isArray(node.material)?node.material.map(adjust):adjust(node.material);
}
function positiveDimensions(s){return [s.x,s.y,s.z].every(v=>Number.isFinite(v)&&v>.0001);}
export async function readLibraryAsset(id){
 if(sourceCache.has(id))return sourceCache.get(id);
 const promise=(async()=>{
  let object,gltf;
  if(id.startsWith('local:')){
   let row=locals.get(id)||await assetGet(id);
   if(!row)throw Error('Egen GLB saknas. Importera den på nytt eller öppna ZIP-projektet.');
   locals.set(id,row);inspectGLB(row.data);
   gltf=await loader.parseAsync(row.data.slice(0), '');object=gltf.scene;
  }else{
   const e=LIBRARY_MAP.get(id);if(!e)throw Error('Okänt katalogobjekt.');
   const url=new URL(e.url,new URL('../',import.meta.url));
   // Model URLs must be audited same-origin paths, never external configuration.
   if(url.origin!==location.origin)throw Error('Externa 3D-källor är blockerade.');
   gltf=await loader.loadAsync(url.href);object=gltf.scene;
   // Normalize a catalogued model's native axis without changing its GLB bytes.
   if(e.modelYaw){const aligned=new T.Group();aligned.rotation.y=e.modelYaw;aligned.add(object);object=aligned;}
  }
  if(!object)throw Error('3D-modellen kunde inte öppnas.');
  object.updateWorldMatrix(true,true);const b=new T.Box3().setFromObject(object);
  const size=b.getSize(new T.Vector3());if(!positiveDimensions(size))throw Error('Modellen har en ogiltig storlek.');
  const materialSlots=new Map();object.traverse(node=>{for(const m of [].concat(node.material||[])){const slot=gltf.parser.associations.get(m)?.materials;if(slot!==undefined)materialSlots.set(m,slot);}});
  return {scene:object,originalBounds:b,originalSize:size,materialSlots};
 })().catch(e=>{sourceCache.delete(id);throw e;});
 sourceCache.set(id,promise);return promise;
}
export async function addModelToGroup(item,group,onReady){
 const assetId=item.assetId;
 try{
  const {scene,originalBounds,originalSize,materialSlots}=await readLibraryAsset(assetId);
  // A disposed/replaced preview group must not be resurrected on async load.
  if(!group.parent||group.userData.editId!==item.id)return false;
  const scale=isTable(item)?modelScale(originalSize,item):null;
  const scalar=scale?null:Math.min(item.w/originalSize.x,item.d/originalSize.z,item.height/originalSize.y);
  if(!scale&&(!Number.isFinite(scalar)||scalar<=0))throw Error('Modellen kunde inte skalas.');
  const clone=new T.Group();clone.add(scene.clone(true));
  applyEquipmentArt(clone,assetId,materialSlots);
  if(scale)clone.scale.set(scale.x,scale.y,scale.z);
  else clone.scale.setScalar(scalar);
  const center=originalBounds.getCenter(new T.Vector3());
  clone.position.set(-center.x*clone.scale.x, -originalBounds.min.y*clone.scale.y, -center.z*clone.scale.z);
  clone.traverse(node=>{if(node.isMesh){recolorSemanticMesh(node,item);
    node.castShadow=false;node.receiveShadow=true;node.userData.editId=item.id;}});
  group.add(clone);group.userData.realModel=true;
  onReady?.();return true;
 }catch(e){group.userData.modelError=e.message;onReady?.();return false;}
}
export async function importLocalGLB(file){
 if(!file||!(/\.glb$/i.test(file.name)))throw Error('Välj en .glb-fil.');
 if(file.size<28||file.size>GLB_MAX_BYTES)throw Error('GLB-filen måste vara mindre än 8 MB.');
 const raw=await file.arrayBuffer();const inspection=inspectGLB(raw),id='local:'+await assetHash(raw);
 const row={id,name:safeFilename(file.name.replace(/\.glb$/i,'')),size:raw.byteLength,data:raw};
 locals.set(id,row);
 const cached=sourceCache.get(id);
 if(!cached){const data=await readLibraryAsset(id);const original=data.originalSize;
  const max=Math.max(original.x,original.y,original.z),factor=max>3||max<.2?1.25/max:1;
  row.dimensions={width:Math.min(3.5,Math.max(.1,original.x*factor)),depth:Math.min(3.5,Math.max(.1,original.z*factor)),height:Math.min(3.5,Math.max(.1,original.y*factor))};
 }else{const data=await cached,orig=data.originalSize,mx=Math.max(orig.x,orig.y,orig.z),f=mx>3||mx<.2?1.25/mx:1;
  row.dimensions={width:Math.min(3.5,Math.max(.1,orig.x*f)),depth:Math.min(3.5,Math.max(.1,orig.z*f)),height:Math.min(3.5,Math.max(.1,orig.y*f))};}
 try{await assetPut(row);}catch(e){row.localOnly=true;}
 return {id,name:row.name,category:'egna',kind:'prop',width:row.dimensions.width,depth:row.dimensions.depth,height:row.dimensions.height,
  thumb:null,license:'Din egen fil · kontrollera rättigheterna',source:'Lokal GLB-import',persisted:!row.localOnly,...inspection};
}
export async function localLibrary(){
 const persisted=await assetAll().catch(()=>[]);
 for(const row of persisted)locals.set(row.id,row);
 return [...locals.values()].map(row=>({id:row.id,name:row.name,category:'egna',kind:'prop',width:row.dimensions?.width||.8,
  depth:row.dimensions?.depth||.8,height:row.dimensions?.height||.9,thumb:null,license:'Egen GLB',source:'Importerad lokalt'}));
}
export async function getLocalFile(id){return locals.get(id)||await assetGet(id);}
export function releaseModelResources(){
 releaseEquipmentArt();
 for(const prom of sourceCache.values())prom.then(({scene})=>scene.traverse(o=>{if(o.isMesh){o.geometry?.dispose();(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m?.dispose());}})).catch(()=>{});
 sourceCache.clear();locals.clear();
}
