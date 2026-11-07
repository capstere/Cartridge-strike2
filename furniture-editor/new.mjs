import {buildEnvironment} from './build/environment-visuals.mjs';
import {makeFloorTape,drawPlanTape} from './build/floor-tape.mjs?v=5.9.0';
import {authoringStatus} from './project-limits.mjs?v=5.7.3';
import {draftText,createDraftStore,readDraftZip} from './build/draft-save.mjs?v=5.7.2';
import {prepareProjectSave} from './build/safe-save.mjs?v=5.9.0';
import {captureFurniture,pasteFurniture} from './furniture-clipboard.mjs?v=5.8.1';
import {clearFloor5Interior,restoreFloor5Interior} from './build/empty-interior.mjs?v=5.8.0';
import {floorEdgeHandles,planFloorEdge} from './build/floor-edge.mjs?v=5.7.3';
import {architecturePreview} from './build/architecture-preview.mjs?v=5.9.0';
import {surfaceColor,validPaint,reconcileSurfaceColors} from './build/surface-style.mjs?v=5.8.0';
import {floorGaps,gapFloor} from './build/walkable-spaces.mjs?v=5.8.0';
import {installFurnitureHandles} from './furniture-handles.mjs?v=5.8.1';
import {planFurnitureTranslation,furnitureAssembly} from './furniture-translation.mjs?v=5.8.1';
import {rotateFurniture,mirrorFurniture} from './furniture-transforms.mjs?v=5.8.0';
import {modelFront,MODEL_FRONTS,wallFootprint} from './model-alignment.mjs?v=5.8.0';
import {makePoster,locatePoster} from './build/posters.mjs?v=5.7.3';
import {createCurtain,createBlind,treatmentPosition,curtainSideForHit} from './build/treatments.mjs?v=5.8.0';
import {buildProjectFurniture,buildProjectDecorations,applyFurnitureAppearance,floorTapeMesh} from './build/project-visuals.mjs?v=5.9.0';
import {resolveProjectScene,writeProjectScene,floor5Baseline,projectWallPieces} from './build/project-scene.mjs?v=5.8.0';
import {inheritFloor5Gameplay} from '../src/fps/world.mjs?v=5.9.0';
import {wallAtPoint,planPaintOverWall} from './build/paint-over-wall.mjs?v=5.8.0';
import {planResizeFloor,planResizeFloorEdge,planSlideInsert,planMoveWallEnd,roomBoundaryIds} from './build/direct-manipulation.mjs?v=5.8.0';
import {parsePosters} from './build/posters.mjs?v=5.7.3';
import {parseTreatments} from './build/treatments.mjs?v=5.8.0';
import * as T from '../vendor/three/three.module.js';
import {exportProject,parseProject,parseProjectZip,exportProjectZip} from './build/level-project.mjs?v=5.9.0';
import {validateLevel} from './build/validate-level.mjs?v=5.9.0';
import {validate,corners as baseCorners,inside,segmentIntersectsRectangle,intersects,distanceSegment} from './core.mjs?v=5.8.0';
import {wallPieces,standardPassageSpan,standardDoorMarkerSpan,isDoor,STANDARD_PASSAGE_WIDTH,WC_PASSAGE_WIDTH,WC_MIN_PASSAGE_WIDTH} from './build/architecture.mjs?v=5.8.0';
import {LIBRARY_ALL,LIBRARY_MAP} from './library/catalog.mjs?v=5.8.0';
import {upgradeLegacyOrangeChair,proceduralOf} from './library/procedural.mjs?v=5.8.0';
import {validFurnitureColor} from './appearance.mjs?v=5.8.0';
import {furnitureSurfaces,mountedElevation} from './furniture-surfaces.mjs?v=5.8.1';
import {proposeSmartPose,duplicateFurnitureAssembly} from './smart-placement.mjs?v=5.8.1';
import {poseOnWall,syncWallMounts,applyFurnitureAssemblyPose} from './wall-mounts.mjs?v=5.8.0';
import {placementPreview,preferredPlacementPoint} from './snap-highlights.mjs?v=5.8.1';
import {findNearbyFreePlacement} from './soft-placement.mjs';
import {importLocalGLB,getLocalFile,localLibrary,readLibraryAsset} from './library/models.mjs?v=5.8.0';
import {assetHash} from './library/glb-utils.mjs';
import {installSelectionDock} from './selection-dock.mjs?v=5.8.0';
import {planAdjacentRoom,ADJACENT_SIDES} from './adjacent-room.mjs?v=5.8.0';
import {planDraggedRoom} from './build/room-drag.mjs?v=5.8.0';

const $=id=>document.getElementById(id),canvas=$('plan'),ctx=canvas.getContext('2d');
const catalogEntries=LIBRARY_ALL;
const correctOldOrangeChair=doc=>(upgradeLegacyOrangeChair(doc),doc);
const mode=new URLSearchParams(location.search).get('mode')==='edit-floor5'?'edit-floor5':'new-level';
const STORAGE=mode==='edit-floor5'?'cartridge-floor5-level-v2':'cartridge-new-level-v2';let project,selected=null,tab='build',first=null,hover=null,drag=null,view='plan',zoom=1,offset={x:0,z:0},orbit=.65,history=[],future=[],localCatalog=[];
const draftStorage={getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)};
let draftStore=createDraftStore(draftStorage,STORAGE);
const draftStores=new Map([[mode,draftStore]]);
function storeForMode(currentMode){
 if(!draftStores.has(currentMode)){
  const key=currentMode==='edit-floor5'?'cartridge-floor5-level-v2':'cartridge-new-level-v2';
  const store=createDraftStore(draftStorage,key);
  store.load(raw=>{const doc=parseProject(raw);if(doc.mode!==currentMode)throw Error('Utkastet tillhör ett annat redigeringsläge.');return doc;});
  draftStores.set(currentMode,store);
 }
 return draftStores.get(currentMode);
}
project=draftStore.load(raw=>{const doc=parseProject(raw);if(doc.mode!==mode)throw Error('Utkastet tillhör ett annat redigeringsläge.');return inheritFloor5Gameplay(correctOldOrangeChair(doc));});
if(!project){project=inheritFloor5Gameplay(exportProject({mode,name:mode==='edit-floor5'?'Floor 5 – min version':'Min bana',projectId:'lvl-'+crypto.randomUUID().slice(0,12)}));if(!draftStore.rejected&&mode==='edit-floor5'){try{const old=localStorage.getItem('cartridge-furniture-studio-0.17.0-v1');if(old)project=inheritFloor5Gameplay(parseProject(old));}catch{}}}
if(project.mode==='edit-floor5')project.ground.bounds={x0:-48,z0:-33,x1:52,z1:40};
let multiSelected=new Set(),furnitureClipboard=null,pasteStep=0;
let roomPreview=null,pendingFurniture=null,pendingTemplate=null,pendingYaw=0,snapFeedback=null,drawGesture=null,planPan=null,spaceHeld=false,view3dZoom=1,view3dCenter=null;
let gameLook=false,gameLookTimer=0,walkReturnView='plan',walkReturnLook=false,walkPose=null;
let sceneModel,sceneProject;function model(){if(project.mode==='new-level')return resolveProjectScene(project);if(sceneProject!==project){sceneProject=project;sceneModel=resolveProjectScene(project);}return sceneModel;}
const p=()=>project,arch=()=>model().entries,floors=()=>p().mode==='new-level'?p().ground.floors:model().floors,objects=()=>model().items,markers=()=>[...p().gameplay.spawns,...[p().gameplay.objectives.bomb,p().gameplay.objectives.rescue,...p().gameplay.objectives.hostages].filter(Boolean)];
const snap=n=>Math.round(n*10)/10,clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const status=s=>$('status').textContent=s;
const guideKey=part=>`cartridge-studio-${part}-${p().projectId}`;
function updateFirstBuild(){
 const panel=$('firstBuild'),hidden=p().mode!=='new-level'||localStorage.getItem(guideKey('guide-hidden'))==='1';
 panel.hidden=hidden;$('showGuide').hidden=p().mode!=='new-level'||!hidden;if(hidden)return;
 const steps=[
  {done:floors().length>0,text:'Tryck Skapa rum så får du ett färdigt golv, väggar och en standarddörr.',button:'SKAPA RUM'},
  {done:arch().some(e=>['door','card-door','opening'].includes(e.kind)),text:'Klicka på en vägg för att sätta dit en dörr. Dra den sedan längs väggen.',button:'VÄLJ DÖRR'},
  {done:objects().length>0,text:'Välj en möbelbild och klicka där möbeln ska stå.',button:'VISA MÖBLER'},
  {done:localStorage.getItem(guideKey('walked'))==='1',text:'Gå runt i banan med FPS-spelets modeller och fysik.',button:'GÅ RUNT'},
  {done:localStorage.getItem(guideKey('saved'))==='1',text:'Spara ZIP och öppna den igen när du vill fortsätta.',button:'SPARA ZIP'}
 ];
 const index=steps.findIndex(s=>!s.done),step=steps[index]||{text:'Din första byggresa är klar. Fortsätt bygga fritt.',button:'BYGG VIDARE'};
 $('firstBuildProgress').textContent=index<0?'5 av 5 klara':`Steg ${index+1} av 5`;
 $('firstBuildText').textContent=step.text;$('firstBuildNext').textContent=step.button;
 panel.dataset.step=String(index);
}
const floorAt=(x,z)=>floors().find(f=>inside(x,z,f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]]));
const nextId=prefix=>{let i=1;const ids=new Set([...floors(),...arch(),...objects()].map(o=>o.id));while(ids.has(prefix+String(i).padStart(4,'0')))i++;return prefix+String(i).padStart(4,'0');};
function commit(before){if(p().surfaceColors||p().surfaceMaterials){const previous=JSON.parse(before);reconcileSurfaceColors(p(),previous,arch(),resolveProjectScene(previous).entries,floors());}syncWallMounts(objects(),arch());if(p().mode==='edit-floor5')writeProjectScene(p(),model());if(before===JSON.stringify(p()))return;if(view==='walk')leaveWalk();history.push(before);if(history.length>60)history.shift();future=[];persist();redraw();queueGameLook();}
function persist(){draftStore=storeForMode(p().mode);const result=draftStore.save(p());$('autosave').textContent=result.message;$('autosave').classList.toggle('error',!result.ok);}
window.addEventListener('beforeunload',event=>{if(draftStore.failed){event.preventDefault();event.returnValue='';}});
function point(e){const r=canvas.getBoundingClientRect(),b=p().ground.bounds,scale=Math.min(canvas.width/(b.x1-b.x0),canvas.height/(b.z1-b.z0))*zoom;
 return {x:snap(((e.clientX-r.left)*canvas.width/r.width-canvas.width/2)/scale+(b.x0+b.x1)/2-offset.x),z:snap(((e.clientY-r.top)*canvas.height/r.height-canvas.height/2)/scale+(b.z0+b.z1)/2-offset.z)};}
function screen(x,z){const b=p().ground.bounds,scale=Math.min(canvas.width/(b.x1-b.x0),canvas.height/(b.z1-b.z0))*zoom;
 return [canvas.width/2+(x-(b.x0+b.x1)/2+offset.x)*scale,canvas.height/2+(z-(b.z0+b.z1)/2+offset.z)*scale];}
const dist=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
let floorOnly=false;
const chosenFloorHandles=f=>floorOnly||f.source?floorEdgeHandles(f):{...rectCorners(f),...allowedEdgeHandles(f)};
const rectCorners=f=>({nw:{x:f.x0,z:f.z0},ne:{x:f.x1,z:f.z0},se:{x:f.x1,z:f.z1},sw:{x:f.x0,z:f.z1}});
const edgeHandles=f=>{
 const x=f.x0+(f.x1-f.x0)*.28,z=f.z0+(f.z1-f.z0)*.28;
 return {'edge-top':{x,z:f.z0},'edge-right':{x:f.x1,z},
  'edge-bottom':{x,z:f.z1},'edge-left':{x:f.x0,z}};
};
// Only offer arrows for edges where a small resize is actually possible.
// Connected, immovable edges stay visible as ordinary wall geometry.
function allowedEdgeHandles(f){
 if(f?.source||!floors().includes(f))return {};
 const positions=edgeHandles(f),others=floors().filter(x=>x.id!==f.id);
 const entries=arch(),bounds=p().ground.bounds;
 return Object.fromEntries(Object.entries(positions).filter(([handle,point])=>{
  const side=handle.slice(5);
  return [-.5,.5].some(delta=>{
   const candidate=side==='left'||side==='right'?{...point,x:point.x+delta}:{...point,z:point.z+delta};
   try{
    const result=planResizeFloorEdge(f,entries,side,candidate,{bounds,otherFloors:others});
    parsePosters(p().architecture.posters||[],result.entries);
    parseTreatments(p().architecture.treatments||[],result.entries);
    return true;
   }catch{return false;}
  });
 }));
}
const insertCenter=o=>({x:(o.a[0]+o.b[0])/2,z:(o.a[1]+o.b[1])/2});
const directInsert=o=>['door','card-door','opening','window','glazed'].includes(o?.kind);
function editHandleAt(e){
 const item=lookup(),r=canvas.getBoundingClientRect(),dpr=canvas.width/r.width;
 const x=(e.clientX-r.left)*dpr,z=(e.clientY-r.top)*canvas.height/r.height;
 const candidates=item&&floors().includes(item)?
  Object.entries(chosenFloorHandles(item)).map(([handle,q])=>({handle,q})):
  item?.kind==='wall'&&arch().includes(item)?['a','b'].map(handle=>({handle,q:{x:item[handle][0],z:item[handle][1]}})):[];
 return candidates.find(({handle,q})=>{
  const [sx,sz]=screen(q.x,q.z),radius=(handle.startsWith('edge-')||handle.startsWith('floor-'))?22:13;
  return Math.hypot(x-sx,z-sz)<radius*dpr;
 })?.handle||null;
}
function beginDirectDrag(item,q,handle=null){
 const type=handle&&floors().includes(item)?(handle.startsWith('floor-')?'floor-only':handle.startsWith('edge-')?'wall-edge':'resize'):
  handle&&item.kind==='wall'?'endpoint':directInsert(item)?'slide':null;
 if(!type)return null;
 const center=type==='slide'?insertCenter(item):type==='floor-only'?floorEdgeHandles(item)[handle]:null;
 return {direct:true,type,id:item.id,handle,initialEntries:structuredClone(arch()),
  initialFloor:['resize','wall-edge','floor-only'].includes(type)?structuredClone(item):null,before:JSON.stringify(p()),
  dx:center?q.x-center.x:0,dz:center?q.z-center.z:0};
}
function applyDirectDrag(info,q){
 try{
  let planned;
  if(info.type==='floor-only'){
   const result=planFloorEdge(info.initialFloor,Number(info.handle.slice(6)),{x:q.x-info.dx,z:q.z-info.dz},info.initialEntries,{bounds:p().ground.bounds});
   if(info.initialFloor.source){p().ground.floorEdits||={};p().ground.floorEdits[info.id]=result.polygon;}
   else{const stored=p().ground.floors.find(f=>f.id===info.id)||p().architecture.floors.find(f=>f.id===info.id);if(!stored)throw Error('Golvet saknas.');const {x0,x1,z0,z1}=result;Object.assign(stored,{x0,x1,z0,z1});}
   const live=floors().find(f=>f.id===info.id);Object.assign(live,{...(p().mode==='edit-floor5'?{polygon:result.polygon}:{}),x0:result.x0,x1:result.x1,z0:result.z0,z1:result.z1});
   status(result.snapped?'Golvet snäpper tätt mot väggen. Väggar och dörrar står kvar.':'Golvkanten flyttad. Dra nära väggen för att snäppa.');redraw();return true;
  }
  if(info.type==='resize'||info.type==='wall-edge'){
   const options={bounds:p().ground.bounds,otherFloors:floors().filter(f=>f.id!==info.id)};
   planned=info.type==='resize'?
    planResizeFloor(info.initialFloor,info.initialEntries,info.handle,q,options):
    planResizeFloorEdge(info.initialFloor,info.initialEntries,info.handle.slice(5),q,options);
  }else if(info.type==='endpoint')planned=planMoveWallEnd(info.initialEntries,info.id,info.handle,q,
   {bounds:p().ground.bounds,posters:p().architecture.posters,treatments:p().architecture.treatments});
  else planned=planSlideInsert(info.initialEntries,info.id,{x:q.x-info.dx,z:q.z-info.dz},
   {posters:p().architecture.posters,treatments:p().architecture.treatments});
  parsePosters(p().architecture.posters||[],planned.entries);
  parseTreatments(p().architecture.treatments||[],planned.entries);
  arch().splice(0,arch().length,...planned.entries);
  if(planned.floor){const stored=p().ground.floors.find(f=>f.id===info.id);Object.assign(stored,planned.floor);
   const displayed=model().floors.find(f=>f.id===info.id);
   if(displayed&&displayed!==stored)Object.assign(displayed,planned.floor,
    {polygon:[[planned.floor.x0,planned.floor.z0],[planned.floor.x1,planned.floor.z0],
     [planned.floor.x1,planned.floor.z1],[planned.floor.x0,planned.floor.z1]]});}
  status(['resize','wall-edge'].includes(info.type)?'Klart! Väggen, hörnen och dörrarna följer med.':
   info.type==='slide'?'Öppningen sitter kvar i väggen. Fysiken följer med.':'Väggänden flyttad.');
  redraw();return true;
 }catch(err){status(err.message);return false;}
}
function find(x,z){for(const d of decorations()){const at=decorationAt(d);if(at&&Math.hypot(x-at.x,z-at.z)<.3)return d;}for(const m of markers())if(dist(m,{x,z})<.35)return m;
 // Small and narrow objects must still be easy to pick at Floor 5 scale.
 // Prefer recently placed furniture when objects overlap in free-building mode.
  for(const o of objects().slice().reverse())if(inside(x,z,corners(o,.15)))return o;
 for(const a of [...arch().filter(directInsert),...arch().filter(a=>!directInsert(a))]){
  const dx=a.b[0]-a.a[0],dz=a.b[1]-a.a[1],len=Math.hypot(dx,dz),t=clamp(((x-a.a[0])*dx+(z-a.a[1])*dz)/len**2,0,1);
  if(Math.hypot(x-a.a[0]-dx*t,z-a.a[1]-dz*t)<.18)return a;
 }
 const tape=tapeStrips().findLast(strip=>distanceSegment(x,z,strip.a,strip.b)<.14);
 if(tape)return tape;
 return floors().find(f=>x>=f.x0&&x<=f.x1&&z>=f.z0&&z<=f.z1)||null;}
function makeFloor(a,b,role){
 const {rect,edges}=planDraggedRoom(a,b,p().ground.bounds);
 const id=nextId('BYGG-G-'),name=$('floorName').value.trim()||`${role==='room'?'Rum':'Korridor'} ${floors().length+1}`;
 const f={id,name,role,surface:$('surface').value,...rect};
 const scene=model(),beforeFloors=p().ground.floors.length,
  beforeWalls=arch().length,beforeSceneFloors=scene.floors.length;
 try{
  p().ground.floors.push(f);
  if(p().mode==='edit-floor5')scene.floors.push({...f,polygon:[[rect.x0,rect.z0],[rect.x1,rect.z0],[rect.x1,rect.z1],[rect.x0,rect.z1]]});
  if(role==='room')for(const [u,v] of edges)makeSegment('wall',u,v);
  return f;
 }catch(error){
  // A drawing failure must never leave an invisible partial room or walls.
  p().ground.floors.length=beforeFloors;
  arch().length=beforeWalls;
  if(p().mode==='edit-floor5')scene.floors.length=beforeSceneFloors;
  throw error;
 }
}
function makeSegment(kind,a,b){
 const wc=kind==='wc-door',officeDoor=kind==='office-door',officeGlass=kind==='office-glass';
 if(wc||officeDoor)kind='door';if(officeGlass)kind='glazed';
 if(kind==='wall'&&arch().some(e=>e.kind==='wall'&&((dist({x:e.a[0],z:e.a[1]},{x:a[0],z:a[1]})<.01&&dist({x:e.b[0],z:e.b[1]},{x:b[0],z:b[1]})<.01)||(dist({x:e.b[0],z:e.b[1]},{x:a[0],z:a[1]})<.01&&dist({x:e.a[0],z:e.a[1]},{x:b[0],z:b[1]})<.01))))return arch().find(e=>e.kind==='wall');const len=Math.hypot(a[0]-b[0],a[1]-b[1]);if(len<.25||len>100)throw Error('Byggdelen måste vara 0,25–100 modellenheter lång.');
 const span=isDoor(kind)?standardPassageSpan(a,b,wc?WC_PASSAGE_WIDTH:STANDARD_PASSAGE_WIDTH,{minWidth:wc?WC_MIN_PASSAGE_WIDTH:1.10}):{a,b};
 const id=nextId(['wall','window','glazed'].includes(kind)?'BYGG-V-':'BYGG-D-'),entry={id,kind,...span,height:isDoor(kind)?2.4:2.85,thickness:.11,sill:Number($('sill').value)||.9,finish:'white'};
 if(wc)entry.doorStyle='wc';
 if(officeDoor){entry.doorStyle='office';entry.finish='gray';}
 if(officeGlass)entry.glazingStyle='office-band';
 arch().push(entry);return entry;}
function occupyData(){const zones=floors().map(f=>({id:f.id,status:'included',polygon:f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]]}));
 return {rooms:zones,excludedRooms:[],obstacles:model().fixed,walls:projectWallPieces(arch()),doors:arch().filter(a=>['door','card-door','opening'].includes(a.kind)).map(a=>({...a,blocked:false}))};}
function placementIssue(item,other=objects()){
 if(!floorAt(item.x,item.z))return 'Utanför golvet. Rita golv här eller flytta föremålet senare.';
 return validate(item,other,occupyData(),null,{emptyFixed:p().mode==='new-level'||p().legacyPatch?.emptyFixed===true});
}
function placementStatus(item){
 const where=item.wallMount?'på väggen':item.mountId?'ovanpå möbeln':'på golvet';
 status(`${item.assetName||item.kind} placerad ${where}. Dra för att flytta eller välj exakta mått.`);
}
function mountPose(item,point,mode=$('placementMode').value){
 return proposeSmartPose(item,point,objects(),{mode,walls:arch(),floors:floors()});
}
function easyFurniturePose(item){
 if(!$('autoPlace').checked||item.mountId||item.wallMount||item.collision==='none')return {item,adjusted:false};
 const floor=floorAt(item.x,item.z);
 if(!floor)return {item,adjusted:false};
 return findNearbyFreePlacement(item,candidate=>
  floorAt(candidate.x,candidate.z)?.id===floor.id&&!placementIssue(candidate),
  {step:.2,maxRadius:.8});
}
function pendingPlacement(q){
 const entry=pendingFurniture,base={...(pendingTemplate||{}),id:'ghost',kind:pendingTemplate?.kind||entry.kind||'prop',assetId:entry.assetId||entry.id,assetName:entry.name,x:q.x,z:q.z,yaw:pendingYaw,w:entry.width,d:entry.depth,height:entry.height,modelSize:entry.modelSize||pendingTemplate?.modelSize,wallFacing:entry.wallFacing||pendingTemplate?.wallFacing,
  ...(entry.assetRole?{assetRole:entry.assetRole}:{}),...(entry.colorable&&!pendingTemplate?{color:entry.defaultColor||'#f2f3ef'}:{}),...(entry.collision&&!pendingTemplate?{collision:entry.collision}:{})};
 const feedback=placementPreview(base,q,objects(),arch(),{mode:pendingTemplate?.wallMount?'wall':$('placementMode').value,floors:floors()});
 if(pendingTemplate&&!base.wallMount&&!base.mountId&&!feedback.pose.wallMount&&!feedback.pose.mountId)feedback.pose.elevation=base.elevation||0;
 const fitted=easyFurniturePose({...base,...feedback.pose});return {item:fitted.item,feedback,adjusted:fitted.adjusted};
}
function addFurniture(entry,x,z,y=null,pointData={}){const floor=floorAt(x,z),id=nextId('NY-OBJ-');
 const assetId=entry.id==='clone'?pendingTemplate?.assetId:entry.assetId||entry.id;
 const fitted=pendingPlacement({x,z,...(Number.isFinite(y)?{y}:{}),...pointData});
 if(fitted.item.blocked)throw Error(fitted.item.blocked);
 if(entry.loading&&fitted.item.wallMount)throw Error('Modellen laddas. Vänta tills förhandsvisningen är klar.');
 if(entry.loadError)throw Error(entry.loadError);
 let item={...fitted.item,id,assetId};delete item.blocked;
 if(entry.chairRole&&!pendingTemplate)item.chairRole=entry.chairRole;
 item.roomId=floorAt(item.x,item.z)?.id||floor?.id||'';
 if(pendingTemplate){const copies=duplicateFurnitureAssembly(pendingTemplate,objects(),{x:item.x,z:item.z,yaw:item.yaw,mountId:item.mountId,mountSurface:item.mountSurface,wallMount:item.wallMount||null,elevation:item.elevation||0,collision:item.collision});for(const copy of copies)copy.roomId=floor?.id||'';objects().push(...copies);item=copies[0];}else objects().push(item);if(entry.id.startsWith('local:')){
  if(!p().assets.local.some(a=>a.assetId===entry.id))p().assets.local.push({assetId:entry.id,file:`assets/models/${entry.id.slice(6)}.glb`,bytes:entry.byteCount||entry.size,license:'private, unverified'});
 }else if(entry.id!=='clone'&&!p().assets.library.includes(assetId))p().assets.library.push(assetId);
 selected=item.id;placementStatus(item);
  if(fitted.adjusted)status(`${item.assetName||item.kind} placerad lite bredvid klicket. Flytta precis som du vill.`);}
function placeMarker(kind,x,z){if(!floorAt(x,z))throw Error('Placera spelpunkter på ett golv.');const g=p().gameplay,o=g.objectives;
 if(['analysts','counterAnalysts'].includes(kind)){
  const subset=g.spawns.filter(s=>s.team===kind);if(subset.length>=5)throw Error('Fem spawns är redan placerade för laget. Flytta en markör i stället.');
  const index=subset.length,id=`SP-${kind==='analysts'?'A':'C'}-${String(index+1).padStart(2,'0')}`;g.spawns.push({id,team:kind,index,x,z,yaw:kind==='analysts'?0:Math.PI});selected=id;
 }else if(kind==='hostages'){
  if(o.hostages.length>=2)throw Error('Två gisslan finns redan. Flytta dem med musen.');
  const id='OBJ-H'+(o.hostages.length+1);o.hostages.push({id,x,z,yaw:0,roomId:floorAt(x,z).id});selected=id;
 }else{const id=kind==='bomb'?'OBJ-BOMB':'OBJ-RESCUE';o[kind]={id,x,z,radius:kind==='bomb'?1.1:1.65,roomId:floorAt(x,z).id};selected=id;}
}
const tapeStrips=()=>p().ground.tape||[];
const nextTape={style:'solid',color:'#ffcf00'};
function updateTapeControls(item){
 const drawing=$('tool').value==='tape',editing=!drawing&&tapeStrips().includes(item);
 $('tapeSettings').hidden=!drawing&&!editing;
 if(!drawing&&!editing)return;
 const appearance=editing?item:nextTape;
 $('tapeHeading').textContent=editing?'Markerad tejpremsa':'Ny tejpremsa';
 $('tapeStyle').value=appearance.style;$('tapeColor').value=appearance.color;
 $('tapeColorRow').hidden=appearance.style==='hazard';
}
function changeTapeAppearance(){
 const item=lookup(),appearance={style:$('tapeStyle').value,color:$('tapeColor').value};
 if($('tool').value!=='tape'&&tapeStrips().includes(item)){
  const before=JSON.stringify(p());Object.assign(item,appearance);commit(before);
 }else{Object.assign(nextTape,appearance);redraw();}
}
$('tapeStyle').onchange=changeTapeAppearance;$('tapeColor').onchange=changeTapeAppearance;
const decorations=()=>[...(p().architecture.posters||[]),...(p().architecture.treatments||[])];
function decorationAt(d){if(d.type){const at=treatmentPosition(d,arch());return at?{x:at.center[0],z:at.center[1]}:null;}return locatePoster(d,arch());}
let spacesKey='',spacesCache=[],doorPreviewOpen=false;
function spaces(){const scene=model(),key=JSON.stringify([floors(),p().ground.openedAreas]);if(key!==spacesKey){spacesKey=key;spacesCache=[...(scene.closed||[]).map(r=>({...r,kind:'closed-area'})),...floorGaps(floors(),p().mode==='edit-floor5'?floor5Baseline().data.floorPolygons:[],scene.closed||[])];}return spacesCache;}
function updateSurfaceUI(o){
 const paintable=!!o&&(arch().includes(o)||floors().includes(o))&&o.kind!=='opening';$('surfaceDock').hidden=view==='walk'||!paintable||!!pendingFurniture;
 if(paintable){$('surfaceName').textContent=o.name||({'wall':'Vägg',window:'Fönster · bröstning',glazed:'Glasvägg',door:'Dörr','card-door':'Passerkortsdörr'}[o.kind]||o.kind||'Golvyta');$('surfaceColor').value=surfaceColor(p(),o);$('previewDoor').hidden=!['door','card-door'].includes(o.kind)||!!o.originallyBlocked;$('previewDoor').textContent=doorPreviewOpen?'Visa dörren stängd':'Visa dörren öppen';$('surfaceHint').textContent=o.kind==='glazed'?'Glaset behåller sin transparens. Färgvalet gäller ramen.':'Färgen följer med till ZIP och FPS-vyn.';}
 $('floorMaterialLabel').hidden=!o||!floors().includes(o);$('resetSurface').textContent=o&&floors().includes(o)?'Återställ materialfärg':'Originalfärg';
 $('floorDragMode').hidden=!o||!floors().includes(o);$('floorDragMode').textContent=floorOnly||o?.source?'Dra bara golvet ✓':'Dra bara golvet';$('floorDragMode').disabled=!!o?.source;
 $('doorStyleLabel').hidden=!o||!['door','card-door'].includes(o.kind)||!!o.originallyBlocked;$('doorStyle').value=o?.doorStyle||'solid';
 $('glazingStyleLabel').hidden=!o||o.kind!=='glazed';$('glazingStyle').value=o?.glazingStyle||'standard';$('wallPatternLabel').hidden=!o||o.kind!=='wall';$('wallPattern').value=p().surfaceMaterials?.[o?.id]||'default';
 if(o&&floors().includes(o))$('surfaceHint').textContent=p().surfaceColors?.[o.id]?'Enfärgad yta. Välj Golvmaterial ovan eller Återställ materialfärg för att visa mönstret.':'Välj kakel, laminat, sten eller matta under Golvmaterial. Färgknapparna ersätter mönstret med en enfärgad yta.';
 const options=spaces(),key=options.map(s=>s.id).join('|');if($('spaceSelect').dataset.key!==key){$('spaceSelect').dataset.key=key;$('spaceSelect').replaceChildren(new Option('Välj en yta …',''),...options.map(s=>new Option(s.name,s.id)));}
 const area=options.find(s=>s.id===selected);$('spaceSelect').value=area?.id||'';$('openSpace').disabled=!area;$('openSpace').textContent=area?.kind==='floor-gap'?'Anslut golven':'Gör ytan gångbar';$('spaceHint').textContent=area?(area.kind==='floor-gap'?`Glipa: ${area.gap.toFixed(3)} modellenheter. En gångbar golvbit läggs till; väggar flyttas inte.`:'Öppnas endast i din bankopia. Väggar, dörrar och möbler är kvar.'):'Markera ett hinder i listan eller i 3D-vyn.';
}
function setSurfacePaint(color){const o=lookup();if(!o||!validPaint(color)||!arch().includes(o)&&!floors().includes(o))return;const before=JSON.stringify(p());p().surfaceColors||={};p().surfaceColors[o.id]=color;commit(before);}
$('closeSurface').onclick=()=>{selected=null;redraw();};
$('surfaceColor').onchange=e=>setSurfacePaint(e.target.value);document.querySelectorAll('[data-paint]').forEach(b=>b.onclick=()=>setSurfacePaint(b.dataset.paint));
$('resetSurface').onclick=()=>{const o=lookup();if(!o)return;const before=JSON.stringify(p());if(p().surfaceColors)delete p().surfaceColors[o.id];commit(before);};
$('floorDragMode').onclick=()=>{floorOnly=!floorOnly;redraw();};
$('doorStyle').onchange=()=>{const o=lookup();if(!o||!['door','card-door'].includes(o.kind))return;
 const selectedStyle=$('doorStyle').value;
 if(selectedStyle!=='wc'&&!o.source&&Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1])<1.1){status('Den smala öppningen kräver WC-utförande. Välj WC eller bredda dörren.');redraw();return;}
 const before=JSON.stringify(p());o.doorStyle=selectedStyle;if(selectedStyle==='wc')o.finish='white';if(selectedStyle==='office')o.finish='gray';commit(before);};
$('wallPattern').onchange=()=>{const o=lookup();if(o?.kind!=='wall')return;const before=JSON.stringify(p());p().surfaceMaterials||={};if($('wallPattern').value==='default')delete p().surfaceMaterials[o.id];else{p().surfaceMaterials[o.id]=$('wallPattern').value;if(p().surfaceColors)delete p().surfaceColors[o.id];}commit(before);status('Väggmaterialet sparas i bankopian och visas även i FPS.');};
$('glazingStyle').onchange=()=>{const o=lookup();if(!o||o.kind!=='glazed')return;const before=JSON.stringify(p());o.glazingStyle=$('glazingStyle').value;commit(before);};
$('previewDoor').onclick=()=>{doorPreviewOpen=!doorPreviewOpen;redraw();};
$('spaceSelect').onchange=()=>{selected=$('spaceSelect').value||null;$('showPhysics').checked=true;const area=spaces().find(s=>s.id===selected);if(area){const pts=area.polygon||[[area.x0,area.z0],[area.x1,area.z1]],xs=pts.map(p=>p[0]),zs=pts.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);view3dCenter={x:(x0+x1)/2,z:(z0+z1)/2,span:Math.max(7,(x1-x0)*1.4,(z1-z0)*1.4)};view3dZoom=1;$('threeView').click();}else redraw();};
$('showSpaces').onclick=()=>{$('showPhysics').checked=true;$('threeView').click();};
$('openSpace').onclick=()=>{const area=spaces().find(s=>s.id===selected);if(!area)return;const before=JSON.stringify(p());
 if(area.kind==='floor-gap'){const floor=gapFloor(area,nextId('BYGG-G-'));p().ground.floors.push(floor);selected=floor.id;}
 else{p().ground.openedAreas||=[];p().ground.openedAreas.push(area.id);selected=area.id;}
 sceneProject=null;commit(before);status('Ytan är gångbar i din bankopia. Väggar och möbler behåller sin kollision. Ångra återställer.');};
function selectedFurniture(){return objects().filter(o=>multiSelected.has(o.id)||o.id===selected);}
function normalizeSelection(){
 if(!selected){multiSelected.clear();return;}
 if(!multiSelected.has(selected))multiSelected.clear();
 for(const id of multiSelected)if(!objects().some(o=>o.id===id))multiSelected.delete(id);
 if(objects().some(o=>o.id===selected))multiSelected.add(selected);
}
function toggleFurniture(id){
 const item=objects().find(o=>o.id===id);
 if(!item){status('Ctrl/⌘-klick väljer möbler. Klicka utan tangenten för att redigera väggar och golv.');return;}
 normalizeSelection();if(multiSelected.has(id))multiSelected.delete(id);else multiSelected.add(id);
 selected=[...multiSelected].at(-1)||null;
 status(`${multiSelected.size} möbler markerade. Ctrl/⌘+C kopierar, Ctrl/⌘+V klistrar in.`);redraw();
}
function copySelection(){
 try{furnitureClipboard=captureFurniture(objects(),selectedFurniture().map(o=>o.id),arch(),p().projectId,p().assets.local);pasteStep=0;
 status(`${furnitureClipboard.items.length} föremål kopierade, inklusive fästa tillbehör. Ctrl/⌘+V klistrar in.`);}
 catch(e){status(e.message);}updateClipboardUI();
}
function pasteSelection(){
 if(view==='walk'||drag||drag3d||furnitureHandles.active)return;
 const before=JSON.stringify(p());
 try{
  const result=pasteFurniture(furnitureClipboard,objects(),arch(),p().projectId,{step:pasteStep+1,usedIds:[...floors(),...arch(),...decorations(),...markers()].map(o=>o.id)});
  for(const o of result.items)o.roomId=floorAt(o.x,o.z)?.id||o.roomId||'';
  objects().push(...result.items);
  for(const asset of result.assets)if(!p().assets.local.some(a=>a.assetId===asset.assetId))p().assets.local.push(asset);
  if(p().mode==='edit-floor5')writeProjectScene(p(),model());
  parseProject(p()); // Enforce the existing project/asset limits before committing a single undo step.
  pendingFurniture=null;pendingTemplate=null;first=null;drawGesture=null;setBuildTool('select');
  multiSelected=new Set(result.ids);selected=result.ids.at(-1);pasteStep++;commit(before);
  status(`${result.items.length} föremål inklistrade${result.inPlace?' på samma plats för att bevara fästena':' bredvid originalen'}. Klicka på en kopia för att justera den. Ångra återställer allt.`);
 }catch(e){project=JSON.parse(before);redraw();status('Kunde inte klistra in: '+e.message);}
}
function updateClipboardUI(){
 const count=selectedFurniture().length,visible=view!=='walk';
 $('clipboardDock').hidden=!visible;$('clipboardCount').textContent=count?`${count} ${count===1?'möbel markerad':'möbler markerade'}`:'Inget markerat';
 $('copyFurniture').disabled=!count;$('pasteFurniture').disabled=!furnitureClipboard||furnitureClipboard.projectId!==p().projectId;
}
$('copyFurniture').onclick=copySelection;$('pasteFurniture').onclick=pasteSelection;
$('clearFurnitureSelection').onclick=()=>{selected=null;multiSelected.clear();redraw();};
function removeSelectedFurniture(){
 const before=JSON.stringify(p()),ids=new Set(selectedFurniture().flatMap(o=>furnitureAssembly(o,objects()).map(o=>o.id)));
 for(let i=objects().length-1;i>=0;i--)if(ids.has(objects()[i].id))objects().splice(i,1);
 p().assets.local=p().assets.local.filter(a=>objects().some(o=>o.assetId===a.assetId));selected=null;multiSelected.clear();commit(before);
 status(`${ids.size} föremål borttagna. Ångra återställer dem och deras fästen.`);
}
function lookup(){normalizeSelection();if(multiSelected.size>1)return null;return [...decorations(),...tapeStrips(),...floors(),...arch(),...objects(),...markers(),...spaces()].find(o=>o.id===selected);}
const selectionDock=installSelectionDock({
 getColor:item=>LIBRARY_MAP.get(item.assetId)?.colorable?(item.color||LIBRARY_MAP.get(item.assetId).defaultColor||'#f2f3ef'):null,
 onColor:color=>{const item=lookup();if(!item||!LIBRARY_MAP.get(item.assetId)?.colorable||!validFurnitureColor(color))return;const before=JSON.stringify(p());item.color=color;commit(before);status('Skornas färg är sparad och följer med till FPS.');},
 getSupportLevels:item=>furnitureSurfaces(objects().find(o=>o.id===item.mountId)),
 onSupportLevel:index=>{const item=lookup(),support=item&&objects().find(o=>o.id===item.mountId),level=furnitureSurfaces(support)[index];if(!level)return;
  const before=JSON.stringify(p());item.mountSurface=index;item.elevation=Math.round(((support.elevation||0)+level.y)*1000)/1000;commit(before);status(`${level.label} valt. Skorna följer med när du flyttar hyllan.`);},
 onRotate:delta=>transformSelected('rotate',delta),onMirror:()=>transformSelected('mirror'),
 getIssue:placementIssue,
 getMountIssue:item=>item.wallMount&&!poseOnWall(item,item.wallMount,arch())?'Väggfästet saknas eller får inte längre plats. Välj en annan väggyta eller ångra ändringen.':null,
 onHeight:value=>{
  const item=lookup();
  if(!item||!objects().includes(item)||!Number.isFinite(value)||value<.1||value>8)return;
  const before=JSON.stringify(p()),oldMounts=new Map(objects().filter(child=>child.mountId===item.id).map(child=>[child.id,mountedElevation(child,item)]));
  const wallPose=item.wallMount&&poseOnWall({...item,height:value},item.wallMount,arch());
  if(item.wallMount&&!wallPose){status('Föremålet blir för stort för väggen.');redraw();return;}
  item.height=value;
  if(wallPose)Object.assign(item,wallPose,{collision:item.collision||'none'});
  // A countertop-mounted accessory stays on top when its supporting table changes height.
  for(const child of objects().filter(child=>child.mountId===item.id&&Number.isFinite(child.elevation))){
   const delta=mountedElevation(child,item)-oldMounts.get(child.id);
   for(const member of furnitureAssembly(child,objects()))member.elevation=Math.max(0,Math.round(((member.elevation||0)+delta)*1000)/1000);
  }
  placementStatus(item);commit(before);
 },
 onMountMode:mode=>{
  const item=lookup();
  if(!item||!objects().includes(item))return false;
  const proposed=mountPose(item,{x:item.x,z:item.z},mode);
  if(proposed.blocked){status(proposed.blocked);return false;}
  if(mode==='wall'&&!proposed.wallMount)return false;
  if(mode==='surface'&&!proposed.mountId)return false;
  const before=JSON.stringify(p());
  applyFurnitureAssemblyPose(item,objects(),proposed);
  item.roomId=floorAt(item.x,item.z)?.id||item.roomId||'';
  placementStatus(item);commit(before);
  return true;
 },
 onWallSide:()=>{const item=lookup();if(!item?.wallMount)return;const before=JSON.stringify(p()),pose=poseOnWall(item,{...item.wallMount,side:-item.wallMount.side},arch());if(pose){applyFurnitureAssemblyPose(item,objects(),pose);commit(before);status('Föremålet sitter på andra sidan av väggen.');}},
 onFacing:()=>{const item=lookup();if(!item)return;const before=JSON.stringify(p());item.wallFacing=MODEL_FRONTS[(MODEL_FRONTS.indexOf(modelFront(item))+1)%4];const pose=item.wallMount&&poseOnWall(item,item.wallMount,arch());if(item.wallMount&&!pose){project=JSON.parse(before);status('Den riktningen får inte plats på väggen.');redraw();return;}if(pose)applyFurnitureAssemblyPose(item,objects(),pose);commit(before);status('Modellens framsida vänd. Originalfilen är oförändrad.');},
 onWallHeight:value=>{
  const item=lookup();
  if(!item||!objects().includes(item)||!item.wallMount)return false;
  const pose=poseOnWall(item,{...item.wallMount,y:value},arch());
  if(!pose){status('Höjden passar inte på väggen.');return false;}
  const before=JSON.stringify(p()),collision=item.collision||'none';
  applyFurnitureAssemblyPose(item,objects(),{...pose,collision});commit(before);
  status('Höjden på väggen är ändrad.');
  return true;
 }
});
function updateProps(){const o=lookup(),isTape=tapeStrips().includes(o);updateTapeControls(o);updateSurfaceUI(o);$('selection').hidden=!o&&multiSelected.size<2;$('posterText').disabled=!o||!p().architecture.posters?.includes(o);$('posterText').value=o?.text||'';$('selectedLabel').disabled=!o||!floors().some(f=>f.id===o.id)||!!o.source;$('selectedLabel').value=o?.name||'';$('selectedSurface').disabled=!o||!floors().includes(o);$('selectedSurface').value=p().floorFinishes?.[o?.id]||o?.surface||'carpet';$('curtainStyleLabel').hidden=o?.type!=='curtain';$('curtainFlip').hidden=!['curtain','blind'].includes(o?.type);$('curtainStyle').value=o?.style||'sheer';$('selectedSill').disabled=!o||o.kind!=='window';$('selectedSill').value=o?.sill??.9;$('collisionSetting').hidden=!o||!objects().includes(o);$('collisionMode').value=o?.collision||'solid';$('selectionName').textContent=isTape?'5S-tejp':o?`${o.name||o.assetName||o.text||o.type||o.team||o.kind||o.role}`:multiSelected.size>1?`${multiSelected.size} möbler`:'Ingenting';
 $('x').value=o?(o.x??o.x0??o.a?.[0]??''):'';$('z').value=o?(o.z??o.z0??o.a?.[1]??''):'';
 $('w').value=o?(o.w??(o.x1!==undefined?o.x1-o.x0:o.b?Math.hypot(o.b[0]-o.a[0],o.b[1]-o.a[1]):'')):'';
 $('d').value=o?(o.d??(o.z1!==undefined?o.z1-o.z0:'')):'';
 for(const id of ['x','z','w','d','rotate','duplicate'])$(id).disabled=!o||isTape;
 $('remove').disabled=!o&&multiSelected.size<2;
 selectionDock.sync(o,{compact:view==='3d'&&innerWidth<720,isFurniture:view!=='walk'&&!!o&&objects().includes(o)&&!pendingFurniture&&(tab!=='build'||$('tool').value==='select')});
}
async function transformSelected(action,delta=-Math.PI/12){const item=lookup();if(!item||!objects().includes(item)||pendingFurniture||view==='walk')return;
 const before=JSON.stringify(p());let issue=null,measured=false;
 // Old projects may predate measured GLB bounds. Resolve before changing a wall instance.
 if(item.wallMount&&item.assetId&&!item.assetId.startsWith('studio:')&&!item.modelSize){
  try{const {originalSize}=await readLibraryAsset(item.assetId);if(before!==JSON.stringify(p())||lookup()?.id!==item.id)return;item.modelSize=originalSize.toArray();measured=true;}catch(e){status('Kunde inte läsa modellens mått: '+e.message);return;}
 }
 if(action==='mirror')mirrorFurniture(item,objects());else issue=rotateFurniture(item,objects(),arch(),delta);
 if(issue){if(measured)delete item.modelSize;status(issue);return;}commit(before);status(action==='mirror'?(item.mirrored?'Möbeln är speglad. Tryck igen för att återställa.':'Speglingen är borttagen.'):'Möbeln är vriden. Fästet behålls.');
}
function rotateWithChildren(o,delta){if(objects().includes(o)){const issue=rotateFurniture(o,objects(),arch(),delta);if(issue){status(issue);return false;}placementStatus(o);return true;}o.yaw=(o.yaw||0)+delta;return true;}
function corners(item){if(!item.wallMount)return baseCorners(item);const f=wallFootprint(item),across=Math.abs(Math.sin(f.frontAngle))>.5;return baseCorners({...item,w:across?f.depth:f.width,d:across?f.width:f.depth});}

function moveObject(o,x,z,pointData={}){if(arch().includes(o)){
  if(o.kind==='wall'&&floors().some(f=>roomBoundaryIds(f,[o]).includes(o.id))){
   status('Dra rummets orange hörn för att flytta dess väggar tillsammans.');return false;}
  if(p().mode==='new-level'&&o.kind==='wall'&&arch().some(e=>e!==o&&[e.a,e.b].some(v=>[o.a,o.b].some(w=>dist({x:v[0],z:v[1]},{x:w[0],z:w[1]})<.02)))){
   status('Väggen sitter ihop med en annan byggdel. Flytta hörnet eller öppningen.');return false;}
  const dx=snap(x-o.a[0]),dz=snap(z-o.a[1]);o.a=[snap(o.a[0]+dx),snap(o.a[1]+dz)];o.b=[snap(o.b[0]+dx),snap(o.b[1]+dz)];return true;}const floor=floorAt(x,z);
 if(o.kind&&objects().includes(o)){
  const requested=o.wallMount?'wall':o.mountId?'surface':'auto';
  const proposed=mountPose(o,{x,z,...pointData},requested);if(proposed.blocked){status(proposed.blocked);return false;}
  if(!o.wallMount&&!o.mountId&&!proposed.wallMount&&!proposed.mountId)proposed.elevation=o.elevation||0;
  let candidate={...o,x,z,...proposed};
  candidate.roomId=floorAt(candidate.x,candidate.z)?.id||floor?.id||'';
  applyFurnitureAssemblyPose(o,objects(),candidate);
  for(const child of furnitureAssembly(o,objects()).slice(1))child.roomId=o.roomId;placementStatus(o);return true;
 }
 if(markers().includes(o)){if(!floor)return false;o.x=x;o.z=z;if(o.roomId)o.roomId=floor.id;return true;}
 return false;}
function finishBuild(a,q,tool){try{const before=JSON.stringify(p());
 if(tool==='tape'){
  const strip=makeFloorTape(a,q,nextTape,tapeStrips(),floors());
  (p().ground.tape??=[]).push(strip);selected=strip.id;
 }else{
  selected=['room','corridor'].includes(tool)?makeFloor(a,q,tool).id:makeSegment(tool,[a.x,a.z],[q.x,q.z]).id;
 }
 first=null;drawGesture=null;commit(before);
 status(tool==='tape'?'5S-tejp lagd. Dra nästa remsa eller tryck Esc.':tool==='room'?'Rummet är klart! Du kan fortsätta bygga eller trycka Esc för att möblera.':
  'Golvytan är klar. Fortsätt bygga eller tryck Esc för att välja.');
 }catch(err){first=null;drawGesture=null;status(err.message);redraw();}}
function handleBuild(q,tool,gesture){try{
 if(['poster','curtain','blind'].includes(tool)){const hit=wallAtPoint(arch(),[q.x,q.z],{radius:.4});if(!hit)throw Error('Klicka på en vägg eller ett fönster för att fästa tillbehöret.');const before=JSON.stringify(p());p().architecture.posters||=[];p().architecture.treatments||=[];let fresh;if(tool==='poster'){fresh=makePoster(hit.wall,p().architecture.posters,hit.t);p().architecture.posters.push(fresh);}else if(tool==='blind'){fresh=createBlind(arch(),p().architecture.treatments,hit.wall.id,{side:curtainSideForHit(hit.wall,q,floors())});p().architecture.treatments.push(fresh);}else{const w=hit.wall,L=hit.length,glass=['window','glazed'].includes(w.kind),half=Math.min(.45,3/L),t=clamp(hit.t,half,1-half),pt=v=>w.a.map((n,i)=>n+(w.b[i]-n)*v);fresh=createCurtain(arch(),p().architecture.treatments,w.id,glass?pt(.015):pt(t-half),glass?pt(.985):pt(t+half),{side:curtainSideForHit(w,q,floors()),style:$('newCurtainStyle').value});p().architecture.treatments.push(fresh);}selected=fresh.id;commit(before);return;}
 if(!first&&['door','wc-door','office-door','card-door','opening','window','glazed','office-glass'].includes(tool)){const nearest=wallAtPoint(arch(),[q.x,q.z],{radius:.4});if(nearest){if((p().architecture.treatments||[]).some(t=>t.wallId===nearest.wall.id))throw Error('Ta bort gardinen eller persiennen innan du delar väggen. Ångra återställer båda.');const before=JSON.stringify(p()),w=nearest.wall,len=nearest.length,width=tool==='wc-door'?WC_PASSAGE_WIDTH:tool==='office-door'?1.2:isDoor(tool)?1.2:Math.min(1.6,len),t=clamp(nearest.t,width/2/len,1-width/2/len),span=(v)=>w.a.map((n,i)=>n+(w.b[i]-n)*v);const plan=planPaintOverWall(arch(),w.id,span(t-width/2/len),span(t+width/2/len),tool==='wc-door'||tool==='office-door'?'door':tool==='office-glass'?'glazed':tool,{posters:p().architecture.posters||[],doorWidth:width});arch().splice(0,arch().length,...plan.entries.filter(e=>!e.deleted));p().architecture.posters=plan.posters;selected=plan.paintedId;const part=lookup();if(part&&tool==='wc-door'){part.doorStyle='wc';part.finish='white';}if(part&&tool==='office-door'){part.doorStyle='office';part.finish='gray';}if(part&&tool==='office-glass')part.glazingStyle='office-band';if(part&&tool==='window')part.sill=Number($('sill').value);commit(before);status('Infäst i väggen. Öppningen och fysiken uppdateras automatiskt.');return;}
  if(!['glazed','office-glass'].includes(tool))throw Error('Klicka på en synlig vägg först. Dörr och fönster skapar öppningen automatiskt.');}
 if(!first){first=q;drawGesture=gesture;status('Startpunkt vald. Klicka slutpunkt eller dra. Esc avbryter.');redraw();return;}
 finishBuild(first,q,tool);
 }catch(err){first=null;drawGesture=null;status(err.message);redraw();}}
canvas.addEventListener('pointerdown',e=>{if(view!=='plan')return;if(e.button===0&&(e.ctrlKey||e.metaKey)){e.preventDefault();const q=point(e);toggleFurniture(find(q.x,q.z)?.id);return;}if(e.button===1||e.button===2||(e.button===0&&(spaceHeld||e.shiftKey))){e.preventDefault();canvas.setPointerCapture(e.pointerId);planPan={x:e.clientX,y:e.clientY,startX:e.clientX,startY:e.clientY,button:e.button,moved:false};return;}if(e.button!==0)return;canvas.setPointerCapture(e.pointerId);const q=point(e),tool=tab==='build'?$('tool').value:tab==='play'?$('gameTool').value:'furnish';
 if(pendingFurniture){try{const before=JSON.stringify(p());addFurniture(pendingFurniture,q.x,q.z);commit(before);}catch(err){status(err.message);}return;}
 if(tool==='select'||tool==='furnish'){const handle=editHandleAt(e),hit=handle?lookup():find(q.x,q.z);if(hit){multiSelected.clear();selected=hit.id;drag=beginDirectDrag(hit,q,handle)||
  {before:JSON.stringify(p()),start:q,hit,dx:q.x-(hit.x??hit.a?.[0]??q.x),dz:q.z-(hit.z??hit.a?.[1]??q.z)};redraw();return;}if(tool==='furnish'){status('Välj ett objekt i listan och klicka PLACERA.');return;}selected=null;redraw();return;}
 if(tab==='play'){try{const found=markers().find(m=>dist(m,q)<.35);if(found){selected=found.id;drag={before:JSON.stringify(p()),start:q,hit:found,dx:q.x-found.x,dz:q.z-found.z};redraw();return;}const before=JSON.stringify(p());placeMarker(tool,q.x,q.z);commit(before);}catch(err){status(err.message);}return;}
 handleBuild(q,tool,{x:e.clientX,y:e.clientY,tool,view:'plan'});});
canvas.addEventListener('pointermove',e=>{if(view!=='plan')return;if(planPan){const r=canvas.getBoundingClientRect(),b=p().ground.bounds,scale=Math.min(canvas.width/(b.x1-b.x0),canvas.height/(b.z1-b.z0))*zoom;offset.x+=(e.clientX-planPan.x)*canvas.width/r.width/scale;offset.z+=(e.clientY-planPan.y)*canvas.height/r.height/scale;planPan.moved ||= Math.hypot(e.clientX-planPan.startX,e.clientY-planPan.startY)>6;planPan.x=e.clientX;planPan.y=e.clientY;drawPlan();return;}const q=point(e);$('coordinates').textContent=`X ${q.x.toFixed(1)} · Z ${q.z.toFixed(1)}`;
 if(drag){if(drag.direct)applyDirectDrag(drag,q);else if(moveObject(drag.hit,snap(q.x-drag.dx),snap(q.z-drag.dz)))redraw();return;}
 hover=q;if(first||pendingFurniture||tab==='build'&&['door','wc-door','office-door','window','glazed','office-glass','opening','card-door'].includes($('tool').value))redraw();});
canvas.addEventListener('pointerleave',()=>{if(drag||planPan)return;hover=null;snapFeedback=null;updateGuide();if(view==='plan')drawPlan();});
canvas.addEventListener('pointerup',e=>{if(planPan){const rotate=planPan.button===2&&!planPan.moved;planPan=null;if(rotate){const o=lookup();if(o?.yaw!==undefined){if(objects().includes(o))transformSelected('rotate');else{const before=JSON.stringify(p());rotateWithChildren(o,-Math.PI/12);commit(before);}}}return;}if(drawGesture?.view==='plan'&&first&&Math.hypot(e.clientX-drawGesture.x,e.clientY-drawGesture.y)>6)finishBuild(first,point(e),drawGesture.tool);drawGesture=null;if(drag){commit(drag.before);drag=null;}});
canvas.addEventListener('pointercancel',()=>{planPan=null;if(drag?.before){project=JSON.parse(drag.before);redraw();}if(drawGesture)first=null;drag=null;drawGesture=null;redraw();});
canvas.addEventListener('contextmenu',e=>e.preventDefault());
function drawPlan(){const r=canvas.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2);canvas.width=Math.round(r.width*dpr);canvas.height=Math.round(r.height*dpr);ctx.clearRect(0,0,canvas.width,canvas.height);ctx.fillStyle='#e6efea';ctx.fillRect(0,0,canvas.width,canvas.height);
 const b=p().ground.bounds;ctx.strokeStyle='#bfd1ca';ctx.lineWidth=1;for(let x=b.x0;x<=b.x1;x++)for(let z=b.z0;z<=b.z1;z++){const [sx,sz]=screen(x,z);if(sx>=0&&sx<canvas.width&&sz>=0&&sz<canvas.height)ctx.fillRect(sx,sz,1,1);}
 for(const f of floors()){const poly=(f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]]).map(v=>screen(...v));ctx.beginPath();poly.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.fillStyle=surfaceColor(p(),f);ctx.fill();ctx.strokeStyle=selected===f.id?'#ed993a':'#adc3b8';ctx.lineWidth=selected===f.id?3:1;ctx.stroke();if(zoom>1||!f.source){ctx.fillStyle='#426367';ctx.font=`${12*dpr}px system-ui`;const [x,z]=screen(f.x0,f.z0);ctx.fillText(f.name,x+8,z+17*dpr);}}
 if(roomPreview&&view==='plan'){
  const r=roomPreview.rect,pts=[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]].map(q=>screen(...q));
  ctx.save();ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();
  ctx.fillStyle='#42be9f40';ctx.strokeStyle='#157d68';ctx.lineWidth=3;ctx.setLineDash([8,5]);ctx.fill();ctx.stroke();ctx.restore();
 }
 for(const strip of tapeStrips())drawPlanTape(ctx,strip,screen,dpr,selected===strip.id);
 for(const e of [...projectWallPieces(arch()),...arch().filter(e=>isDoor(e.kind))]){const marker=isDoor(e.kind)?standardDoorMarkerSpan(e):e;const a=screen(...marker.a),b=screen(...marker.b);ctx.beginPath();ctx.moveTo(...a);ctx.lineTo(...b);ctx.lineWidth=selected===e.id?7:Math.max(3,5*dpr);ctx.strokeStyle=selected===e.id?'#f2a03e':({wall:'#bc5961',glazed:'#35aa8a',window:'#46a0c0',door:'#dc9b4f','card-door':'#dc9b4f',opening:'#fff'}[e.kind]);ctx.stroke();}
 for(const o of objects()){const pts=corners(o).map(v=>screen(...v));ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.fillStyle=(multiSelected.has(o.id)||selected===o.id)?'#ffc874':'#5a7e88';ctx.fill();ctx.strokeStyle='#233e4a';ctx.stroke();if(multiSelected.has(o.id)||selected===o.id){const [cx,cz]=screen(o.x,o.z),a=o.yaw+wallFootprint(o).frontAngle,[tx,tz]=screen(o.x+Math.sin(a)*Math.min(o.d,.6),o.z+Math.cos(a)*Math.min(o.d,.6));ctx.beginPath();ctx.moveTo(cx,cz);ctx.lineTo(tx,tz);ctx.strokeStyle='#fff';ctx.lineWidth=3*dpr;ctx.stroke();if(o.mirrored){ctx.fillStyle='#122f33';ctx.font=`bold ${14*dpr}px system-ui`;ctx.fillText('↔',cx+5*dpr,cz-5*dpr);}}}
 for(const m of markers()){const [x,z]=screen(m.x,m.z);ctx.beginPath();ctx.arc(x,z,selected===m.id?12*dpr:9*dpr,0,Math.PI*2);ctx.fillStyle=m.team==='analysts'?'#298bb7':m.team==='counterAnalysts'?'#d5684d':m.id.includes('BOMB')?'#dfb03e':m.id.includes('RESCUE')?'#41b89a':'#bf78b5';ctx.fill();ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.stroke();ctx.fillStyle='#16343b';ctx.font=`bold ${10*dpr}px system-ui`;ctx.fillText(m.team?String(m.index+1):m.id.includes('H')?'H':m.id.includes('BOMB')?'B':'R',x+11*dpr,z);}
 for(const d of decorations()){const at=decorationAt(d);if(!at)continue;const [x,z]=screen(at.x,at.z);ctx.fillStyle=selected===d.id?'#f0ae4a':d.type?'#7987a9':'#bb78a2';ctx.fillRect(x-5*dpr,z-5*dpr,10*dpr,10*dpr);}
 const chosen=lookup(),handles=chosen&&floors().includes(chosen)?
  chosenFloorHandles(chosen):
  chosen?.kind==='wall'&&arch().includes(chosen)?{
   a:{x:chosen.a[0],z:chosen.a[1]},b:{x:chosen.b[0],z:chosen.b[1]}}:{};
 for(const [key,q] of Object.entries(handles)){
  const [x,z]=screen(q.x,q.z),edge=key.startsWith('edge-')||key.startsWith('floor-');
  ctx.save();ctx.lineWidth=2*dpr;ctx.strokeStyle='#12383d';
  if(edge){
   ctx.beginPath();ctx.arc(x,z,14*dpr,0,Math.PI*2);
   ctx.fillStyle='#36b88c';ctx.fill();ctx.stroke();
   ctx.fillStyle='#093d31';ctx.font=`bold ${18*dpr}px system-ui`;
   ctx.textAlign='center';ctx.textBaseline='middle';
   ctx.fillText(key==='edge-left'||key==='edge-right'||q.axis===0?'↔':'↕',x,z);
  }else{
   ctx.fillStyle='#f6aa42';ctx.fillRect(x-6*dpr,z-6*dpr,12*dpr,12*dpr);
   ctx.strokeRect(x-6*dpr,z-6*dpr,12*dpr,12*dpr);
  }
  ctx.restore();
 }
 if($('showPhysics').checked){ctx.save();ctx.strokeStyle='#d42f52';ctx.lineWidth=3*dpr;ctx.setLineDash([5,3]);for(const w of projectWallPieces(arch())){ctx.beginPath();ctx.moveTo(...screen(...w.a));ctx.lineTo(...screen(...w.b));ctx.stroke();}for(const o of objects().filter(o=>o.collision!=='none')){const pts=corners(o).map(v=>screen(...v));ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();ctx.stroke();}ctx.restore();}
 if(pendingFurniture&&hover){
  const calculated=pendingPlacement(hover);let ghost=calculated.item;snapFeedback=calculated.feedback;
  if(snapFeedback.kind==='surface'){
   const support=objects().find(o=>o.id===snapFeedback.targetId);
   if(support){const outline=corners(support).map(v=>screen(...v));ctx.save();
    ctx.beginPath();outline.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();
    ctx.fillStyle='#44d2a844';ctx.strokeStyle='#0d9979';ctx.lineWidth=4*dpr;ctx.fill();ctx.stroke();ctx.restore();
   }
  }else if(snapFeedback.kind==='wall'){
   const wall=arch().find(w=>w.id===snapFeedback.targetId);
   if(wall){ctx.save();ctx.beginPath();ctx.moveTo(...screen(...wall.a));ctx.lineTo(...screen(...wall.b));
    ctx.strokeStyle='#13b48d';ctx.lineWidth=11*dpr;ctx.globalAlpha=.66;ctx.stroke();ctx.restore();}
  }
  const pts=corners(ghost).map(v=>screen(...v));ctx.beginPath();pts.forEach((v,i)=>i?ctx.lineTo(...v):ctx.moveTo(...v));ctx.closePath();
  ctx.fillStyle=ghost.blocked?'#cf536566':'#36b98b88';ctx.fill();ctx.strokeStyle='#14785b';ctx.lineWidth=2*dpr;ctx.stroke();
  updateGuide();
 }
 if(hover&&tab==='build'&&!first&&['door','wc-door','office-door','card-door','opening','window','glazed','office-glass'].includes($('tool').value)){
  const hit=wallAtPoint(arch(),[hover.x,hover.z],{radius:.4});if(hit){const width=$('tool').value==='wc-door'?WC_PASSAGE_WIDTH:$('tool').value==='office-door'?1.2:isDoor($('tool').value)?1.2:Math.min(1.6,hit.length),fraction=clamp(hit.t,width/2/hit.length,1-width/2/hit.length);
   const x=hit.wall.a[0]+(hit.wall.b[0]-hit.wall.a[0])*fraction,z=hit.wall.a[1]+(hit.wall.b[1]-hit.wall.a[1])*fraction;
   const vx=(hit.wall.b[0]-hit.wall.a[0])/hit.length,vz=(hit.wall.b[1]-hit.wall.a[1])/hit.length;
   ctx.beginPath();ctx.moveTo(...screen(x-vx*width/2,z-vz*width/2));ctx.lineTo(...screen(x+vx*width/2,z+vz*width/2));
   ctx.strokeStyle='#f4ad42';ctx.lineWidth=9*dpr;ctx.globalAlpha=.7;ctx.stroke();ctx.globalAlpha=1;}}
 if(first&&hover){
  if($('tool').value==='tape'){
   drawPlanTape(ctx,{...nextTape,a:[first.x,first.z],b:[hover.x,hover.z]},screen,dpr);return;
  }
  const room=['room','corridor'].includes($('tool').value),bounds=p().ground.bounds;
  const withinMap=q=>room?{
   x:clamp(q.x,bounds.x0,bounds.x1),z:clamp(q.z,bounds.z0,bounds.z1)}:q;
  const start=withinMap(first),end=withinMap(hover),a=screen(start.x,start.z),b=screen(end.x,end.z);
  ctx.beginPath();if(room)ctx.rect(a[0],a[1],b[0]-a[0],b[1]-a[1]);
  else{ctx.moveTo(...a);ctx.lineTo(...b);}
  ctx.setLineDash([7,5]);ctx.lineWidth=2;ctx.strokeStyle='#106f79';ctx.stroke();ctx.setLineDash([]);
 }
}
const scene=new T.Scene();scene.background=new T.Color(0xd9e8e4);const camera=new T.PerspectiveCamera(55,1,.1,250);let renderer=null;
function ensureRenderer(){
 if(renderer)return true;
 try{const context=$('scene3d').getContext('webgl2',{antialias:true});if(!context)throw Error('WebGL saknas');
  renderer=new T.WebGLRenderer({canvas:$('scene3d'),context,antialias:true});renderer.setPixelRatio(Math.min(devicePixelRatio||1,1.5));return true;
 }catch{status('3D och FPS kräver WebGL 2. Aktivera maskinvaruacceleration i webbläsaren. Du kan fortsätta bygga och spara i planvyn.');return false;}
}
scene.add(new T.HemisphereLight(0xffffff,0x819a97,2.2));const sun=new T.DirectionalLight(0xffffff,2);sun.position.set(5,15,6);scene.add(sun);const group=new T.Group(),preview3d=new T.Group();scene.add(group,preview3d);let hover3d=null;
let furnitureRoot=null,furnitureSignature='';
const furnitureHandles=installFurnitureHandles({canvas:$('scene3d'),camera,
 getSelection:()=>view==='3d'&&!pendingFurniture&&objects().includes(lookup())&&(tab==='furnish'||tab==='build'&&$('tool').value==='select')?lookup():null,
 getWalls:arch,onHint:status,isCameraGesture:()=>spaceHeld,onCameraGesture:e=>scenePointerDown(e),onWheel:e=>zoom3D(e),
 onBegin:()=>{const item=lookup();if(!item||!objects().includes(item))return null;stopMovement();return {before:JSON.stringify(p()),items:structuredClone(objects()),id:item.id};},
 onDrag:(start,delta)=>{try{
  const item=start.items.find(o=>o.id===start.id),moved=planFurnitureTranslation(item,start.items,arch(),delta);
  for(const pose of moved){const live=objects().find(o=>o.id===pose.id);if(live)Object.assign(live,pose,{roomId:floorAt(pose.x,pose.z)?.id||pose.roomId||''});}
  // Update poses only during a gesture: do not reload GLBs or rebuild the scene per pixel.
  for(const holder of furnitureRoot?.children||[]){const live=objects().find(o=>o.id===holder.userData.editId);if(live){holder.position.set(live.x,live.elevation||0,live.z);holder.rotation.y=live.yaw||0;}}
  updateProps();update3DPreview();status(`Höjd över golvet: ${(moved[0].elevation||0).toFixed(2)} · Släpp för att spara · Esc avbryter.`);
 }catch(e){status(e.message);}},
 onFinish:start=>{commit(start.before);status('Placeringen sparad. Ångra återställer hela dragningen.');},
 onCancel:start=>{project=JSON.parse(start.before);redraw();status('Dragningen avbruten. Möbeln är tillbaka på sin tidigare plats.');}
});

let ghostRoot=null,ghostKey='',ghostGeneration=0;
function clearGhost(){ghostGeneration++;if(ghostRoot){scene.remove(ghostRoot);disposeGhost(ghostRoot);}ghostRoot=null;ghostKey='';}
function disposeGhost(root){root.traverse(o=>{if(o.userData.studioGeometry||o.userData.ghostGeometry)o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.userData?.ghostOwned||m?.userData?.studioOwned)m.dispose();});}
function showModelGhost(item){
 const key=JSON.stringify([item.assetId,item.w,item.d,item.height,item.modelSize,item.chairRole,item.color]);
 if(ghostKey!==key){clearGhost();ghostKey=key;ghostRoot=new T.Group();scene.add(ghostRoot);const target=ghostRoot,version=ghostGeneration;
  buildProjectFurniture([{...item,id:'ghost'}],target,{assets:p().assets.local}).then(()=>{
   if(version!==ghostGeneration){disposeGhost(target);return;}
   target.traverse(o=>{if(o.isMesh){o.userData.ghostGeometry=!item.assetId||item.assetId.startsWith('studio:');o.material=(Array.isArray(o.material)?o.material:[o.material]).map(m=>{const copy=m.clone();copy.transparent=true;copy.opacity=.5;copy.depthWrite=false;copy.userData={...copy.userData,ghostOwned:true};if(m.userData.studioOwned)m.dispose();return copy;});if(o.material.length===1)o.material=o.material[0];}});
   update3DPreview();
  }).catch(e=>{if(version===ghostGeneration)status('Kunde inte visa modellen: '+e.message);});
 }
 const holder=ghostRoot.children[0];if(holder){holder.position.set(item.x,item.elevation||0,item.z);holder.rotation.y=item.yaw||0;applyFurnitureAppearance(holder,item);}
 ghostRoot.visible=!item.blocked;
}
function refreshFurnitureVisuals(){const signature=JSON.stringify(objects());if(signature===furnitureSignature)return;furnitureSignature=signature;
 if(furnitureRoot){scene.remove(furnitureRoot);furnitureRoot.traverse(o=>{if(o.isMesh){if(o.userData.studioGeometry)o.geometry?.dispose();if(o.material?.userData?.studioOwned)o.material.dispose();}});}
 furnitureRoot=new T.Group();scene.add(furnitureRoot);const target=furnitureRoot;
 buildProjectFurniture(objects(),target,{assets:p().assets.local}).then(()=>{if(target===furnitureRoot&&renderer&&view==='3d')renderer.render(scene,camera);})
  .catch(e=>{if(target===furnitureRoot)status('Kunde inte visa möbelmodellen: '+e.message);});
}
function box(x,y,z,w,h,d,color,angle=0,opacity=1,id=null){const material=new T.MeshStandardMaterial({color,transparent:opacity<1,opacity,side:T.DoubleSide});material.userData.studioOwned=true;const mesh=new T.Mesh(new T.BoxGeometry(w,h,d),material);mesh.position.set(x,y,z);mesh.rotation.y=angle;if(id)mesh.userData.editId=id;group.add(mesh);return mesh;}
function previewBox(x,y,z,w,h,d,color,angle=0,opacity=.35){const mesh=new T.Mesh(new T.BoxGeometry(Math.max(.04,w),Math.max(.025,h),Math.max(.04,d)),new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:T.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=angle;preview3d.add(mesh);return mesh;}
function highlightSnapSurface(spec){
 const a=spec?.surface;if(!a)return;
 const colored=previewBox(a.x,a.y,a.z,a.w,a.h,a.d,0x36d6a1,a.yaw,.38);
 colored.userData.snapKind=spec.kind;colored.userData.snapTargetId=spec.targetId;
 const wire=new T.LineSegments(new T.EdgesGeometry(colored.geometry),
  new T.LineBasicMaterial({color:0x078665,transparent:true,opacity:.95,depthTest:true}));
 wire.position.copy(colored.position);wire.rotation.copy(colored.rotation);
 wire.userData.snapKind=spec.kind;wire.userData.snapTargetId=spec.targetId;
 preview3d.add(wire);
}
function update3DPreview(q=hover3d){preview3d.traverse(o=>{if(o.isMesh||o.isLineSegments){o.geometry?.dispose();o.material?.dispose();}});preview3d.clear();snapFeedback=null;
 if(view!=='3d'||!renderer){clearGhost();updateGuide();return;}
 if(!q||!pendingFurniture)clearGhost();
 for(const current of selectedFurniture()){
  const tint=previewBox(current.x,(current.elevation||0)+current.height/2,current.z,current.w,current.height,current.d,0xf2a03e,current.yaw||0,.12);
  const holder=furnitureRoot?.children.find(o=>o.userData.editId===current.id)||tint;holder.updateWorldMatrix(true,true);
  const outline=new T.Box3Helper(new T.Box3().setFromObject(holder).expandByScalar(.015),0xffa52e);
  outline.material.depthTest=false;outline.material.transparent=true;outline.material.opacity=.95;outline.renderOrder=20;outline.userData.selectedFurnitureId=current.id;preview3d.add(outline);
 }
 if(q&&pendingFurniture){
  const calculated=pendingPlacement(q);snapFeedback=calculated.feedback;
  highlightSnapSurface(snapFeedback);
  if(!pendingFurniture.loading&&!pendingFurniture.loadError)showModelGhost(calculated.item);
  else clearGhost();

 }
 else if(q&&first&&tab==='build'){
  const tool=$('tool').value,room=['room','corridor'].includes(tool),bounds=p().ground.bounds;
  const clip=v=>room?{x:clamp(v.x,bounds.x0,bounds.x1),z:clamp(v.z,bounds.z0,bounds.z1)}:v;
  const a=clip(first),b=clip(q),x=(a.x+b.x)/2,z=(a.z+b.z)/2,w=Math.abs(b.x-a.x),d=Math.abs(b.z-a.z);
  if(tool==='tape'){
   if(w||d)preview3d.add(floorTapeMesh({id:'tape-preview',...nextTape,a:[a.x,a.z],b:[b.x,b.z]}));
  }else if(room)previewBox(x,.035,z,w,.06,d,0x188d84,0,.28);
  else{const len=Math.hypot(w,d),angle=-Math.atan2(b.z-a.z,b.x-a.x);previewBox(x,.8,z,len,1.6,.07,0x188d84,angle,.35);}
 }
 else if(q&&tab==='build'&&['door','wc-door','office-door','card-door','opening','window','glazed','office-glass'].includes($('tool').value)){const hit=wallAtPoint(arch(),[q.x,q.z],{radius:.4});if(hit){const w=$('tool').value==='wc-door'?WC_PASSAGE_WIDTH:$('tool').value==='office-door'?1.2:isDoor($('tool').value)?1.2:Math.min(1.6,hit.length),angle=-Math.atan2(hit.wall.b[1]-hit.wall.a[1],hit.wall.b[0]-hit.wall.a[0]);previewBox(hit.point[0],.7,hit.point[1],w,1.4,.12,0xf4ad42,angle,.3);}}
 updateGuide();furnitureHandles.update();renderer.render(scene,camera);
}
function frameBuiltFloors(){const polys=floors().map(f=>f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]]).flat();
 const b=p().ground.bounds,points=polys.length?polys:[[b.x0,b.z0],[b.x1,b.z1]];
 const xs=points.map(q=>q[0]),zs=points.map(q=>q[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
 return {x:(x0+x1)/2,z:(z0+z1)/2,span:Math.max(8,x1-x0+3,z1-z0+3)};
}
function position3DCamera(){const focus=view3dCenter??=frameBuiltFloors(),span=focus.span/view3dZoom;
 camera.position.set(focus.x+Math.sin(orbit)*span*.75,span*.72,focus.z+Math.cos(orbit)*span*.75);camera.lookAt(focus.x,0,focus.z);camera.updateMatrixWorld(true);furnitureHandles.update();
}
function visibleSpan(){const b=p().ground.bounds;return view==='3d'?(view3dCenter??=frameBuiltFloors()).span/view3dZoom:Math.max(b.x1-b.x0,b.z1-b.z0)/zoom;}
function moveView(direction,distance){if(view==='walk')return;
 const forward=view==='3d'?{x:-Math.sin(orbit),z:-Math.cos(orbit)}:{x:0,z:-1};
 const right=view==='3d'?{x:Math.cos(orbit),z:-Math.sin(orbit)}:{x:1,z:0};
 const axis=direction==='forward'?forward:direction==='backward'?{x:-forward.x,z:-forward.z}:direction==='right'?right:{x:-right.x,z:-right.z};
 const dx=axis.x*distance,dz=axis.z*distance;
 if(view==='plan'){offset.x-=dx;offset.z-=dz;drawPlan();}
 else {const focus=view3dCenter??=frameBuiltFloors();focus.x+=dx;focus.z+=dz;position3DCamera();renderer.render(scene,camera);}
}
const movementKeys=new Map([['KeyW','forward'],['ArrowUp','forward'],['KeyS','backward'],['ArrowDown','backward'],['KeyA','left'],['ArrowLeft','left'],['KeyD','right'],['ArrowRight','right']]);
const heldMovement=new Set();let movementFrame=0,movementLast=0;
function animateMovement(now){movementFrame=0;if(!heldMovement.size||view==='walk')return;
 const dt=Math.min(.05,Math.max(0,(now-movementLast)/1000));movementLast=now;
 const down=direction=>[...heldMovement].some(code=>movementKeys.get(code)===direction);
 const horizontal=Number(down('right'))-Number(down('left'));
 const vertical=Number(down('forward'))-Number(down('backward'));
 const speed=Math.max(1.5,Math.min(20,visibleSpan()*.3))*dt/(Math.hypot(horizontal,vertical)||1);
 if(horizontal)moveView(horizontal>0?'right':'left',speed*Math.abs(horizontal));
 if(vertical)moveView(vertical>0?'forward':'backward',speed*Math.abs(vertical));
 movementFrame=requestAnimationFrame(animateMovement);
}
function stopMovement(){heldMovement.clear();if(movementFrame)cancelAnimationFrame(movementFrame);movementFrame=0;}
let detailLayer=null,detailSignature='',detailRevision=0;
function refreshEnvironment(){
 const project=p(),env=project.environment;
 const hosts=new Set(env?.displays.map(d=>d.host));
 const signature=env?JSON.stringify([env,arch(),objects().filter(o=>hosts.has(o.id))]):'';
 const show=()=>{for(const cell of detailLayer?.root.children||[])if(cell.name.startsWith('environment-facade/'))cell.visible=!$('cutaway').checked;};
 if(detailSignature===signature){show();return;}
 const revision=++detailRevision;detailSignature=signature;detailLayer?.dispose();detailLayer=null;
 if(!env)return;
 buildEnvironment(project,arch(),objects()).then(layer=>{
  if(detailRevision!==revision){layer.dispose();return;}
  detailLayer=layer;scene.add(layer.root);show();if(view==='3d')renderer.render(scene,camera);
 }).catch(error=>{if(detailRevision===revision){detailSignature='';$('status').textContent='Miljödekoren kunde inte visas: '+error.message;}});
}
window.addEventListener('pagehide',event=>{if(!event.persisted){detailRevision++;detailSignature='';detailLayer?.dispose();detailLayer=null;}});
function draw3D(){if(!ensureRenderer())return;group.traverse(o=>{if(o.isMesh||o.isLineSegments){o.geometry?.dispose();if(o.material?.userData?.studioOwned){if(!o.material.map?.userData?.studioShared)o.material.map?.dispose();o.material.dispose();}}});group.clear();
 group.add(architecturePreview(p(),{...model(),floors:floors()},{lowWalls:$('cutaway').checked,openDoors:doorPreviewOpen,selected}));
 if($('showPhysics').checked)for(const area of spaces()){
  if(area.kind==='floor-gap'){const dx=area.b[0]-area.a[0],dz=area.b[1]-area.a[1];box((area.a[0]+area.b[0])/2,.045,(area.a[1]+area.b[1])/2,Math.hypot(dx,dz),.07,.18,selected===area.id?0xffbd46:0xdf3d83,-Math.atan2(dz,dx),.85,area.id);}
  else{const shape=new T.Shape();area.polygon.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();const mat=new T.MeshBasicMaterial({color:selected===area.id?0xffbd46:0xdd4965,side:T.DoubleSide,transparent:true,opacity:.42,depthWrite:false});mat.userData.studioOwned=true;const node=new T.Mesh(new T.ShapeGeometry(shape),mat);node.rotation.x=Math.PI/2;node.position.y=.035;node.userData.editId=area.id;group.add(node);}
 }
 for(const m of markers())box(m.x,.25,m.z,.34,.5,.34,selected===m.id?0xf4ad42:m.team==='analysts'?0x298bb7:m.team==='counterAnalysts'?0xd5684d:m.id.includes('BOMB')?0xdfb03e:m.id.includes('RESCUE')?0x41b89a:0xbf78b5,0,1,m.id);
 const chosen=lookup();
 if(chosen&&floors().includes(chosen))for(const [handle,q] of
  Object.entries(chosenFloorHandles(chosen))){
  const edge=handle.startsWith('edge-')||handle.startsWith('floor-');
  const floorGrip=handle.startsWith('floor-');
  const mesh=box(q.x,floorGrip?.1:.24,q.z,edge?0.57:0.34,floorGrip?.08:edge?0.42:0.34,edge?0.57:0.34,
   edge?0x35ba87:0xf8a849,0,1,chosen.id);
  mesh.userData.editHandle=handle;if(handle.startsWith('floor-')){mesh.material=mesh.material.clone();mesh.material.userData.studioOwned=true;mesh.material.depthTest=false;mesh.renderOrder=20;
   const shape=new T.Shape(),points=[[-.23,0],[-.10,.10],[-.10,.035],[.10,.035],[.10,.10],[.23,0],[.10,-.10],[.10,-.035],[-.10,-.035],[-.10,-.10]];points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
   const mat=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,depthTest:false});mat.userData.studioOwned=true;const arrow=new T.Mesh(new T.ShapeGeometry(shape),mat);arrow.position.set(q.x,.15,q.z);arrow.rotation.set(-Math.PI/2,0,q.axis===1?Math.PI/2:0);arrow.renderOrder=21;arrow.userData={editId:chosen.id,editHandle:handle};group.add(arrow);
  }
 }
 if(chosen?.kind==='wall'&&arch().includes(chosen))for(const handle of ['a','b']){
  const q=chosen[handle],mesh=box(q[0],.22,q[1],.34,.44,.34,0xf8a849,0,1,chosen.id);
  mesh.userData.editHandle=handle;if(handle.startsWith('floor-')){mesh.material=mesh.material.clone();mesh.material.userData.studioOwned=true;mesh.material.depthTest=false;mesh.renderOrder=20;
   const shape=new T.Shape(),points=[[-.23,0],[-.10,.10],[-.10,.035],[.10,.035],[.10,.10],[.23,0],[.10,-.10],[.10,-.035],[-.10,-.035],[-.10,-.10]];points.forEach(([x,y],i)=>i?shape.lineTo(x,y):shape.moveTo(x,y));shape.closePath();
   const mat=new T.MeshBasicMaterial({color:0xffffff,side:T.DoubleSide,depthTest:false});mat.userData.studioOwned=true;const arrow=new T.Mesh(new T.ShapeGeometry(shape),mat);arrow.position.set(q.x,.15,q.z);arrow.rotation.set(-Math.PI/2,0,q.axis===1?Math.PI/2:0);arrow.renderOrder=21;arrow.userData={editId:chosen.id,editHandle:handle};group.add(arrow);
  }
 }
 refreshFurnitureVisuals();refreshEnvironment();
 buildProjectDecorations(p(),arch(),group,()=>renderer.render(scene,camera));
 position3DCamera();
 const r=$('scene3d').getBoundingClientRect();renderer.setSize(Math.max(1,r.width),Math.max(1,r.height),false);camera.aspect=r.width/r.height;camera.updateProjectionMatrix();update3DPreview();
}
/** Starter room is a SINGLE undoable project change: actual floor + connected wall pieces + real standard door. */
function makeStarterRoom(){
 if(p().mode!=='new-level'||floors().length||arch().length)return false;
 const before=JSON.stringify(p());
 try{
  const b=p().ground.bounds,cx=snap((b.x0+b.x1)/2),cz=snap((b.z0+b.z1)/2);
  // 8 x 8 units is large enough for a standard 1.20-wide doorway.
  if(Math.min(b.x1-b.x0,b.z1-b.z0)<8)throw Error('Gör banans grundyta lite större först.');
  const x0=snap(cx-4),x1=snap(cx+4),z0=snap(cz-4),z1=snap(cz+4);
  if(!$('floorName').value.trim())$('floorName').value='Mitt första rum';
  makeFloor({x:x0,z:z0},{x:x1,z:z1},'room');
  const bottom=arch().find(w=>w.kind==='wall'&&w.a[1]===z0&&w.b[1]===z0&&Math.abs(w.b[0]-w.a[0])>7.9);
  if(!bottom)throw Error('Kunde inte hitta rummets vägg.');
  const painted=planPaintOverWall(arch(),bottom.id,[snap(cx-.6),z0],[snap(cx+.6),z0],'door',
   {posters:p().architecture.posters||[]});
  arch().splice(0,arch().length,...painted.entries.filter(w=>!w.deleted));
  p().architecture.posters=painted.posters;
  selected=null;pendingFurniture=null;pendingTemplate=null;first=null;
  if(tab!=='build')switchTab('build');
  setBuildTool('select');
  if(view!=='plan')$('planView').click();
  // Show the ROOM, not the full 80-unit empty canvas.
  zoom=clamp(Math.max(b.x1-b.x0,b.z1-b.z0)/12,1,10);
  offset={x:(b.x0+b.x1)/2-cx,z:(b.z0+b.z1)/2-cz};view3dCenter=null;
  commit(before);
  status('Klart! Ett rum med fyra väggar och en riktig dörr. Välj nu MÖBLERA och klicka på en bild.');
  return true;
 }catch(error){
  project=JSON.parse(before);sceneProject=null;sceneModel=null;
  redraw();status('Rummet kunde inte skapas: '+error.message);return false;
 }
}
function currentRoomForAddition(){
 const active=lookup(),rooms=floors().filter(f=>f.role==='room'&&!f.source);
 if(rooms.includes(active))return active;
 if(objects().includes(active)&&active.roomId){
  const home=rooms.find(f=>f.id===active.roomId);
  if(home)return home;
 }
 return rooms.at(-1)||null;
}
function roomOptions(room){
 if(!room)return [];
 const attachments=[...(p().architecture.treatments||[]),...(p().architecture.posters||[])];
 return ADJACENT_SIDES.map(side=>planAdjacentRoom(room,side,floors(),arch(),p().ground.bounds,
  {treatments:attachments}));
}
function closeRoomChoices({redrawScene=false}={}){
 const picker=$('roomChoices'),changed=!picker.hidden||!!roomPreview;
 picker.hidden=true;roomPreview=null;$('kidRoom').setAttribute('aria-expanded','false');
 if(changed&&redrawScene)redraw();
}
function renderRoomChoices(){
 const room=currentRoomForAddition(),options=roomOptions(room);
 $('roomChoiceHint').textContent=!room?'Välj ett rum i planen för att bygga vidare.':
  options.some(x=>x.ok)?'Bygger vidare från '+(room.name||'ditt rum')+'. Välj en ledig sida så kommer en dörr automatiskt.':
  'Inga lediga sidor här. Välj ett annat rum eller rita ett eget.';
 for(const button of document.querySelectorAll('[data-room-side]')){
  const plan=options.find(x=>x.side===button.dataset.roomSide);
  button.disabled=!plan?.ok;button.title=plan?.ok?'Skapa ett anslutet rum med riktig dörr':plan?.reason||'Välj ett rum först';
 }
 return options;
}
function openRoomChoices(){
 if(view==='walk')leaveWalk();
 if(view!=='plan')$('planView').click();
 if(tab!=='build')switchTab('build');
 setBuildTool('select');
 const picker=$('roomChoices');
 picker.hidden=false;$('kidRoom').setAttribute('aria-expanded','true');
 renderRoomChoices();redraw();
}
function makeAdjacentRoom(side){
 const plan=roomOptions(currentRoomForAddition()).find(item=>item.side===side);
 if(!plan?.ok){status(plan?.reason||'Välj ett annat rum och prova igen.');renderRoomChoices();return false;}
 const before=JSON.stringify(p()),input=$('floorName'),originalName=input.value;
 try{
  input.value=originalName.trim()&&originalName.trim()!=='Mitt första rum'?originalName:
   'Rum '+(floors().filter(f=>f.role==='room').length+1);
  const {x0,x1,z0,z1}=plan.rect;
  const next=makeFloor({x:x0,z:z0},{x:x1,z:z1},'room');
  const shared=arch().find(w=>w.id===plan.sharedWallId&&w.kind==='wall');
  if(!shared)throw Error('Den gemensamma väggen finns inte kvar.');
  const door=planPaintOverWall(arch(),shared.id,plan.doorStart,plan.doorEnd,'door',
   {posters:p().architecture.posters||[]});
  arch().splice(0,arch().length,...door.entries.filter(e=>!e.deleted));
  p().architecture.posters=door.posters;
  selected=next.id;pendingFurniture=null;pendingTemplate=null;first=null;
  roomPreview=null;closeRoomChoices();
  input.value='';setBuildTool('select');
  const f=frameBuiltFloors(),b=p().ground.bounds;
  zoom=clamp(Math.min((b.x1-b.x0)/(f.span+1),(b.z1-b.z0)/(f.span+1)),1,10);
  offset={x:(b.x0+b.x1)/2-f.x,z:(b.z0+b.z1)/2-f.z};
  view3dCenter=null;
  commit(before);
  status('Klart! Rum '+(floors().length)+' har en riktig dörr till det första. Lägg till fler rum eller möblera!');
  return true;
 }catch(err){
  project=JSON.parse(before);sceneProject=null;sceneModel=null;
  input.value=originalName;roomPreview=null;renderRoomChoices();redraw();
  status('Kunde inte lägga till rum: '+err.message);
  return false;
 }
}
function startCustomRoom(){
 closeRoomChoices();
 if(view==='walk')leaveWalk();
 if(tab!=='build')switchTab('build');
 setBuildTool('room');if(view!=='plan')$('planView').click();
 status('Rita ett eget rum: dra mellan två hörn i planen. Väggarna byggs automatiskt.');
}
function updateKidSteps(){
 const ready=floors().some(f=>f.role==='room');
 $('kidRoom').querySelector('strong').textContent=ready?'1. Fler rum':'1. Skapa rum';
 $('kidWalk').querySelector('strong').textContent=view==='walk'?'3. Till bygget':'3. Gå runt';
 $('kidRoom').classList.toggle('kid-step-primary',!ready);
}
$('kidRoom').addEventListener('click',()=>{
 if(makeStarterRoom()){closeRoomChoices();return;}
 if(p().mode==='new-level'&&floors().some(f=>f.role==='room')){
  if($('roomChoices').hidden)openRoomChoices();else closeRoomChoices({redrawScene:true});
  return;
 }
 startCustomRoom();
});
for(const button of document.querySelectorAll('[data-room-side]')){
 const show=()=>{
  const plan=roomOptions(currentRoomForAddition()).find(x=>x.side===button.dataset.roomSide);
  roomPreview=plan?.ok?plan:null;
  if(view==='plan')redraw();
 };
 button.addEventListener('pointerenter',show);
 button.addEventListener('focus',show);
 button.addEventListener('pointerleave',()=>{roomPreview=null;if(view==='plan')redraw();});
 button.addEventListener('blur',()=>{roomPreview=null;if(view==='plan')redraw();});
 button.addEventListener('click',()=>makeAdjacentRoom(button.dataset.roomSide));
}
$('roomChoiceClose').addEventListener('click',()=>closeRoomChoices({redrawScene:true}));
$('roomDrawCustom').addEventListener('click',startCustomRoom);
$('kidFurnish').addEventListener('click',()=>{
 closeRoomChoices();if(p().mode==='new-level'&&!floors().length&&!makeStarterRoom())return;
 if(matchMedia('(max-width:700px)').matches)document.querySelector('[data-mobile-tab="furnish"]').click();
 else switchTab('furnish');
 status('Välj en möbelbild och klicka på platsen i rummet. Du kan alltid flytta den igen.');
});
$('kidWalk').addEventListener('click',()=>{
 closeRoomChoices();if(view==='walk'){leaveWalk();return;}
 if(p().mode==='new-level'&&!floors().length&&!makeStarterRoom())return;
 $('walkView').click();
 if(view==='walk')updateKidSteps();
});
$('kidSave').addEventListener('click',()=>{closeRoomChoices();$('save').click();});

const toolLabels={tape:'5S-TEJP',select:'VÄLJ',room:'RUM',corridor:'GOLV',wall:'VÄGG',door:'DÖRR','office-door':'KONTORSDÖRR','office-glass':'KONTORSGLAS','wc-door':'WC-DÖRR','card-door':'KORTDÖRR',opening:'ÖPPNING',window:'FÖNSTER',glazed:'GLAS',poster:'AFFISCH',curtain:'GARDIN',blind:'PERSIENN'};
function updateGuide(){
 $('placeRotate').hidden=!pendingFurniture||snapFeedback?.kind==='wall'||$('placementMode').value==='wall';
const tool=$('tool').value,active=tab==='build'&&tool!=='select',placing=!!pendingFurniture,chosen=lookup();
 $('activeMode').textContent=placing?'PLACERA '+pendingFurniture.name:tab==='build'?toolLabels[tool]||'BYGG':tab==='play'?'SPEL':'MÖBLERA';
 $('activeHelp').textContent=placing?(snapFeedback?.label||'Peka på en bänk, vägg eller golvet och klicka för att placera.'):first?'Klicka slutpunkten eller dra från start.':active?['room','corridor','wall','tape'].includes(tool)?'Klicka två punkter eller dra i planen eller 3D.':'Klicka direkt på en vägg i planen eller 3D.':
  chosen&&!chosen.source&&floors().includes(chosen)?
   'Dra en GRÖN pil för att flytta en vägg, eller ett ORANGE hörn för två väggar. Dörrar följer med.':
  directInsert(chosen)?'Dra öppningen längs väggen. Den gamla luckan stängs automatiskt.':
  chosen?.kind==='wall'?'Dra en orange ändpunkt för att ändra en fri vägg.':'Ctrl/⌘-klick: välj fler möbler. Ctrl/⌘+C / V: kopiera / klistra in.';
 $('cancelAction').hidden=!active&&!placing&&!first;$('deleteAction').disabled=!lookup()&&multiSelected.size<2;
}
function updateFloor5InteriorUI(){
 const isFloor5=p().mode==='edit-floor5',empty=isFloor5&&p().legacyPatch?.emptyFixed===true;
 $('floor5InteriorTools').hidden=!isFloor5;
 $('newBlank').hidden=isFloor5;
 $('restoreFloor5Interior').hidden=!empty;
 $('clearFloor5Interior').disabled=!isFloor5||(empty&&objects().length===0&&decorations().length===0);
}
function redraw(){updateFloor5InteriorUI();
 const capacity=$('authoringStatus');if(capacity)capacity.textContent=authoringStatus(p()).message;
 normalizeSelection();updateClipboardUI();
 $('modeHelp').textContent=p().mode==='edit-floor5'?'FLOOR 5: du arbetar på en lokal kopia. Originalgolv och spelregler bevaras. Möbler och byggändringar sparas i ditt projekt.':'NY BANA: skapa egna rum och möblera fritt. Lägg till startpunkter och mål när du vill spela med bottar.';
if(view!=='3d'){clearGhost();furnitureHandles.update();}if(!pendingFurniture)snapFeedback=null;syncWallMounts(objects(),arch());updateKidSteps();$('modeLabel').textContent=p().mode==='edit-floor5'?'DESIGNSTUDION / FLOOR 5':'DESIGNSTUDION / NY BANA';updateProps();updateGuide();updateFirstBuild();$('undo').disabled=!history.length;$('redo').disabled=!future.length;if(view==='plan')drawPlan();else if(view==='3d')draw3D();}
function switchTab(t){closeRoomChoices();if(view==='walk')leaveWalk();tab=t;pendingFurniture=null;pendingTemplate=null;for(const b of document.querySelectorAll('[data-tab]'))b.classList.toggle('active',b.dataset.tab===t);for(const s of document.querySelectorAll('[data-panel]'))s.hidden=s.dataset.panel!==t;first=null;redraw();}
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>switchTab(b.dataset.tab));
$('firstBuildDismiss').onclick=()=>{localStorage.setItem(guideKey('guide-hidden'),'1');updateFirstBuild();};
$('showGuide').onclick=()=>{localStorage.removeItem(guideKey('guide-hidden'));updateFirstBuild();};
$('firstBuildNext').onclick=()=>{switch(Number($('firstBuild').dataset.step)){
 case 0:$('kidRoom').click();break;
 case 1:switchTab('build');setBuildTool('door');break;
 case 2:switchTab('furnish');$('catalogSearch').focus();break;
 case 3:$('walkView').click();break;
 case 4:$('save').click();break;
 default:switchTab('build');setBuildTool('select');
 }};
async function armFurniture(entry){pendingTemplate=null;pendingFurniture={...entry};const request=pendingFurniture;pendingYaw=0;snapFeedback=null;hover3d=null;hover=null;first=null;$('catalog').value=entry.id;
 document.querySelectorAll('.catalog-card').forEach(card=>card.classList.toggle('active',card.dataset.asset===entry.id));
 status(`Klicka där ${entry.name} ska stå. R vrider · Esc avbryter.`);redraw();
 if(!proceduralOf({assetId:entry.id})){request.loading=true;status('Laddar modellens förhandsvisning…');try{const asset=await readLibraryAsset(entry.id);request.modelSize=asset.originalSize.toArray();}catch(e){request.loadError=e.message;status(e.message);}finally{request.loading=false;if(pendingFurniture===request){if(!request.loadError)status('Modellen är klar. Peka och klicka för att placera.');redraw();}}}
}
const autoPlace=$('autoPlace');
try{const saved=localStorage.getItem('cartridge-studio-smart-position');if(saved!==null)autoPlace.checked=saved==='1';}catch{}
autoPlace.addEventListener('change',()=>{try{localStorage.setItem('cartridge-studio-smart-position',autoPlace.checked?'1':'0');}catch{}redraw();});
const catalogWords=text=>String(text).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv').split(/\s+/).filter(Boolean);
function renderCatalog(){const list=$('catalog'),cards=$('catalogCards'),query=$('catalogSearch').value.trim().toLocaleLowerCase('sv'),category=$('catalogCategory').value;
 list.replaceChildren();cards.replaceChildren();const entries=[...catalogEntries,...localCatalog].filter(e=>(category==='all'||e.category===category||(category==='onboard'&&e.pack==='onboard')||e.pack===category||(category==='used'&&objects().some(o=>o.assetId===e.id)))&&catalogWords(query).every(word=>catalogWords(`${e.name} ${e.category} ${e.keywords||''}`).join(' ').includes(word)));
 for(const entry of entries){const opt=document.createElement('option');opt.value=entry.id;opt.textContent=entry.name+' · '+entry.category;list.append(opt);
  const card=document.createElement('button');card.type='button';card.className='catalog-card';card.dataset.asset=entry.id;card.title=`Placera ${entry.name}${entry.staticOnly?' · statiskt dekorobjekt':''}`;card.setAttribute('aria-label',`Placera ${entry.name}`);
  const image=document.createElement('span');image.className='catalog-image';if(entry.thumb){const img=document.createElement('img');img.src=entry.thumb;img.alt='';img.loading='lazy';image.append(img);}else if(entry.id==='studio:orange-kitchen-chair')image.innerHTML='<svg viewBox="0 0 100 80" aria-hidden="true"><path fill="#aab6bd" d="M22 47h5v27h-5zm48 0h5v27h-5zM35 49h5v27h-5zm47-7h5v28h-5z"/><path fill="#df753c" d="M22 10h49v32H22zM17 42h60l10 10H27z"/></svg>';else image.textContent=entry.category==='egna'?'3D':entry.category==='bord'?'▤':'▣';
  if(entry.featured){const badge=document.createElement('span');badge.className='catalog-color-badge';badge.textContent='ORANGE';image.append(badge);}
  const name=document.createElement('strong');name.textContent=entry.name;const size=document.createElement('small');size.textContent=`${[entry.width,entry.depth,entry.height].map(n=>n.toLocaleString('sv-SE',{maximumFractionDigits:3})).join(' × ')} · ${entry.category}${entry.staticOnly?' · dekor':''}`;
  card.append(image,name,size);card.onclick=()=>armFurniture(entry);card.classList.toggle('active',pendingFurniture?.id===entry.id);cards.append(card);
 }if(list.options.length&&!entries.some(e=>e.id===list.value))list.selectedIndex=0;$('catalogCount').textContent=entries.length?`${entries.length} objekt · bredd × djup × höjd i modellenheter`:'Inga träffar. Prova färre sökord eller Alla kategorier.';
}
$('curtainStyle').onchange=()=>{const o=lookup();if(o?.type!=='curtain')return;const before=JSON.stringify(p());o.style=$('curtainStyle').value;commit(before);status('Gardintyp ändrad. Originalglaset är orört.');};
$('curtainFlip').onclick=()=>{const o=lookup();if(!['curtain','blind'].includes(o?.type))return;const before=JSON.stringify(p());o.side=-o.side;commit(before);status('Gardin eller persienn monterad på andra sidan glasväggen.');};
$('posterText').onchange=()=>{const o=lookup();if(!p().architecture.posters?.includes(o))return;const before=JSON.stringify(p());o.text=$('posterText').value.slice(0,140);commit(before);};
$('selectedSurface').onchange=()=>{const o=lookup();if(!o||!floors().includes(o))return;
 const before=JSON.stringify(p()),finish=$('selectedSurface').value;
 p().floorFinishes||={};p().floorFinishes[o.id]=finish;o.surface=finish;
 // A newly chosen finish replaces the previous flat paint, just like wall materials.
 if(p().surfaceColors)delete p().surfaceColors[o.id];
 for(const f of p().ground.floors)if(f.id===o.id)f.surface=finish;
 commit(before);status('Golvfinish ändrad utan att väggar eller gångyta flyttas.');};$('selectedSill').onchange=()=>{const o=lookup();if(!o||o.kind!=='window')return;const value=Number($('selectedSill').value);if(!Number.isFinite(value)||value<0||value>o.height-.15)return;const before=JSON.stringify(p());o.sill=value;commit(before);};
$('cutaway').onchange=redraw;$('showPhysics').onchange=redraw;$('selectedLabel').onchange=()=>{const o=lookup();if(!o||o.source)return;const before=JSON.stringify(p());o.name=$('selectedLabel').value.slice(0,60);commit(before);};
$('catalogSearch').oninput=renderCatalog;
$('catalogCategory').onchange=renderCatalog;
$('resetCatalog').onclick=()=>{$('catalogSearch').value='';$('catalogCategory').value='all';renderCatalog();$('catalogSearch').focus();};
$('placementMode').addEventListener('change',()=>{
 snapFeedback=null;
 if(pendingFurniture)status('Välj platsen i banan. Föremålet fäster enligt det valda läget.');
 redraw();
});
function setBuildTool(tool){
 $('tool').value=tool;first=null;drawGesture=null;pendingFurniture=null;pendingTemplate=null;
 if(tool==='tape'){selected=null;multiSelected.clear();}
 for(const button of document.querySelectorAll('[data-tool]'))button.classList.toggle('active',button.dataset.tool===tool);
 renderCatalog();redraw();
 if(tool==='tape')$('tapeSettings').scrollIntoView({block:'nearest'});
}
for(const button of document.querySelectorAll('[data-curtain-preset]'))button.onclick=()=>{$('newCurtainStyle').value=button.dataset.curtainPreset;setBuildTool('curtain');status(button.textContent+' · klicka på fönstret eller väggen.');};
for(const button of document.querySelectorAll('[data-tool]'))button.onclick=()=>{const tool=$('tool').value===button.dataset.tool&&button.dataset.tool!=='select'?'select':button.dataset.tool;setBuildTool(tool);status(tool==='select'?'Välj en byggdel eller möbel. Delete tar bort den markerade delen.':button.title+' · Esc avslutar verktyget.');};
for(const button of document.querySelectorAll('[data-tool="door"],[data-tool="wc-door"],[data-tool="office-door"],[data-tool="window"],[data-tool="office-glass"],[data-tool="glazed"],[data-tool="opening"]')){
 button.draggable=true;
 button.addEventListener('dragstart',e=>{setBuildTool(button.dataset.tool);e.dataTransfer.setData('text/plain',button.dataset.tool);e.dataTransfer.effectAllowed='copy';});
}
for(const surface of [canvas,$('scene3d')]){
 surface.addEventListener('dragover',e=>{if(!['door','wc-door','office-door','window','glazed','office-glass','opening'].includes($('tool').value))return;e.preventDefault();e.dataTransfer.dropEffect='copy';
  if(surface===canvas){hover=point(e);drawPlan();}else{const pick=pick3d(e);hover3d=pick.surface||pick.ground;update3DPreview();}});
 surface.addEventListener('drop',e=>{const tool=e.dataTransfer.getData('text/plain');if(!['door','wc-door','office-door','window','glazed','office-glass','opening'].includes(tool))return;e.preventDefault();
  const q=surface===canvas?point(e):(()=>{const hit=pick3d(e);return hit.surface||hit.ground;})();
  if(q)handleBuild(q,tool,null);});
}
$('tool').onchange=()=>{const tool=$('tool').value;setBuildTool(tool);status('Valt: '+(toolLabels[tool]||tool)+'. Klicka i planen eller 3D. Esc avslutar.');};
$('placeRotate').onclick=()=>{if(pendingFurniture){pendingYaw+=Math.PI/2;redraw();}};
$('cancelAction').onclick=()=>cancelTool();$('deleteAction').onclick=()=>$('remove').click();
$('placeFurniture').onclick=()=>{const entry=[...catalogEntries,...localCatalog].find(e=>e.id===$('catalog').value);if(entry)armFurniture(entry);};
$('glb').onchange=async e=>{try{for(const file of e.target.files){const entry=await importLocalGLB(file);localCatalog=localCatalog.filter(existing=>existing.id!==entry.id);localCatalog.push(entry);}renderCatalog();status('Egna GLB-filer tillagda i biblioteket.');}catch(err){status(err.message);}e.target.value='';};
$('doorInWall').onclick=()=>{const wall=arch().find(e=>e.id===selected&&['wall','window','glazed'].includes(e.kind));if(!wall){status('Markera en vägg i planen först.');return;}
 try{const len=Math.hypot(wall.b[0]-wall.a[0],wall.b[1]-wall.a[1]);if(len<1.45)throw Error('Väggen måste vara minst 1,45 enheter för en standarddörr på 1,20.');const before=JSON.stringify(p());selected=makeSegment('door',wall.a,wall.b).id;commit(before);status('Standarddörr 1,20 ritad mitt i väggen. Kollisionen klipps automatiskt.');}catch(err){status(err.message);}};
$('collisionMode').onchange=()=>{const o=lookup();if(!o||!objects().includes(o))return;
 const before=JSON.stringify(p());o.collision=$('collisionMode').value;commit(before);
 status(o.collision==='none'?'Möbeln är dekorativ: ingen gångkollision i FPS.':'Möbeln blockerar spelare i FPS.');};
$('clearFloor5Interior').onclick=()=>{
 if(p().mode!=='edit-floor5')return;
 const count=objects().length,immovable=model().fixed.length,decor=decorations().length;
 if(!count&&!immovable&&!decor){status('Floor 5 är redan tom på inredning.');return;}
 if(!window.confirm('Göra din Floor 5-kopia helt tom? '+count+' möbler, '+immovable+' fasta inventarier och '+decor+' dekorationer tas bort ur projektkopian. Golv, väggar, fönster, dörrar och spelpunkter bevaras. Ångra eller Återställ ursprungsinredningen om du vill.'))return;
 const before=JSON.stringify(p()),result=clearFloor5Interior(p(),model());
 selected=null;multiSelected.clear();pendingFurniture=null;pendingTemplate=null;furnitureClipboard=null;
 first=null;hover=null;hover3d=null;p().validation={};
 commit(before);
 status('Tom Floor 5-kopia: '+result.furniture+' möbler och '+result.fixed+' fasta inventarier borttagna. Byggnad och spelpunkter bevarade. Spara ZIP som säkerhetskopia.');
};
$('restoreFloor5Interior').onclick=()=>{
 if(p().mode!=='edit-floor5')return;
 if(!window.confirm('Återställa alla ursprungliga möbler och fasta inventarier? Egna tillagda möbler behålls, men de kan hamna ovanpå ursprungsinredningen. Golv och byggdelar påverkas inte.'))return;
 const before=JSON.stringify(p()),result=restoreFloor5Interior(p(),model());
 selected=null;multiSelected.clear();pendingFurniture=null;pendingTemplate=null;first=null;p().validation={};
 commit(before);
 status('Återställde '+result.furniture+' originalmöbler och '+result.fixed+' fasta inventarier. '+result.personalPreserved+' egna möbler behölls.');
};
$('newBlank').onclick=()=>{if(!window.confirm('Töm hela NY BANA? Ångra med Ctrl+Z innan du laddar om sidan.'))return;
 const before=JSON.stringify(p()),v=p();
 localStorage.removeItem(guideKey('walked'));localStorage.removeItem(guideKey('saved'));
 project=exportProject({projectId:v.projectId,name:v.name,ground:{bounds:v.ground.bounds,wallHeightDefault:v.ground.wallHeightDefault,floors:[]},createdAt:v.createdAt});
 selected=null;pendingFurniture=null;pendingTemplate=null;pendingYaw=0;first=null;hover=null;drag=null;offset={x:0,z:0};zoom=1;view3dCenter=null;view3dZoom=1;commit(before);
 status('Tom värld. Rita golv, väggar och öppningar. Kollision skapas automatiskt.');};
$('remove').onclick=()=>{if(multiSelected.size>1){removeSelectedFurniture();return;}const o=lookup();if(!o)return;if(['closed-area','floor-gap'].includes(o.kind)){$('openSpace').click();return;}if(o.source&&o.polygon){status('Floor 5:s ursprungliga golv bevaras. Ändra väggar eller lägg till nya golvytor.');return;}const before=JSON.stringify(p());
 const removedIds=new Set([o.id,...(floors().includes(o)?roomBoundaryIds(o,arch(),floors().filter(f=>f.id!==o.id)):[])]);
 for(const list of [p().ground.floors,arch(),objects(),p().gameplay.spawns,p().gameplay.objectives.hostages,p().architecture.posters||[],p().architecture.treatments||[],tapeStrips()]){
  for(let i=list.length-1;i>=0;i--)if(removedIds.has(list[i].id))list.splice(i,1);
 }
 p().architecture.posters=(p().architecture.posters||[]).filter(d=>!removedIds.has(d.wallId));p().architecture.treatments=(p().architecture.treatments||[]).filter(d=>!removedIds.has(d.wallId));
 for(const key of ['bomb','rescue'])if(p().gameplay.objectives[key]===o)p().gameplay.objectives[key]=null;
 if(objects().includes(o)===false)for(const child of objects().filter(x=>x.mountId===o.id)){child.mountId=null;child.mountSurface=null;child.elevation=0;}
 p().assets.local=p().assets.local.filter(a=>objects().some(item=>item.assetId===a.assetId));
 if(p().surfaceColors)for(const id of removedIds)delete p().surfaceColors[id];
 selected=null;if(p().mode==='edit-floor5')model().floors=model().floors.filter(f=>f.source||p().ground.floors.some(g=>g.id===f.id));commit(before);};
$('duplicate').onclick=()=>{const o=lookup();if(!o||!objects().includes(o))return;pendingTemplate=structuredClone(o);pendingYaw=o.yaw;pendingFurniture={id:o.assetId||'clone',name:o.assetName||o.kind,width:o.w,depth:o.d,height:o.height};status('Placera kopian med musen. Fästa objekt följer med. Esc avslutar.');redraw();};
$('rotate').onclick=()=>{if(objects().includes(lookup())){transformSelected('rotate');return;}const o=lookup();if(o?.yaw===undefined)return;const before=JSON.stringify(p());rotateWithChildren(o,-Math.PI/12);commit(before);};
for(const id of ['x','z','w','d'])$(id).onchange=()=>{const o=lookup(),value=Number($(id).value);if(!o||!Number.isFinite(value))return;const before=JSON.stringify(p());
 if(objects().includes(o)){if(id==='x'||id==='z'){if(Math.abs(value)>100){status('Koordinaten måste ligga inom ±100 modellenheter.');redraw();return;}moveObject(o,id==='x'?value:o.x,id==='z'?value:o.z);}else{if(value<=0||value>8){status('Ange ett mått mellan 0 och 8.');redraw();return;}if(o.wallMount&&!poseOnWall({...o,[id]:value},o.wallMount,arch())){status('Föremålet blir för stort för väggen.');redraw();return;}o[id]=value;placementStatus(o);}}
 else if(markers().includes(o)){if(id==='x'||id==='z')moveObject(o,id==='x'?value:o.x,id==='z'?value:o.z);}
 else if(floors().includes(o)&&['w','d'].includes(id)){
  const info=beginDirectDrag(o,{x:o.x1,z:o.z1},'se'),q={x:id==='w'?o.x0+value:o.x1,z:id==='d'?o.z0+value:o.z1};
  if(!info||!applyDirectDrag(info,q)){redraw();return;}
 }
 else if(arch().includes(o)&&['x','z'].includes(id)&&directInsert(o)){
  const center=insertCenter(o),info=beginDirectDrag(o,center),q={...center,[id]:center[id]+value-o.a[id==='x'?0:1]};
  if(!applyDirectDrag(info,q)){redraw();return;}
 }
 else if(arch().includes(o)&&['x','z'].includes(id)){
  status('Dra väggens ändpunkt eller rummets hörn i vyn så att anslutningarna följer med.');redraw();return;
 }
 else if(arch().includes(o)&&id==='w'&&directInsert(o)){
  try{const center=insertCenter(o),planned=planSlideInsert(arch(),o.id,center,
   {width:value,posters:p().architecture.posters,treatments:p().architecture.treatments});
   parsePosters(p().architecture.posters||[],planned.entries);parseTreatments(p().architecture.treatments||[],planned.entries);
   arch().splice(0,arch().length,...planned.entries);
  }catch(e){status(e.message);redraw();return;}
 }
 commit(before);};
$('undo').onclick=()=>{if(!history.length)return;if(view==='walk')leaveWalk();future.push(JSON.stringify(p()));project=JSON.parse(history.pop());persist();redraw();queueGameLook();};
$('redo').onclick=()=>{if(!future.length)return;if(view==='walk')leaveWalk();history.push(JSON.stringify(p()));project=JSON.parse(future.pop());persist();redraw();queueGameLook();};
document.addEventListener('keyup',e=>{if(e.code==='Space')spaceHeld=false;heldMovement.delete(e.code);});
function cancelTool(){if(drag?.before||drag3d?.before)project=JSON.parse((drag||drag3d).before);
 const wasActive=$('tool').value!=='select'||pendingFurniture||first;if(!wasActive){selected=null;status('Markeringen borttagen.');}else status('Verktyget avslutat. Välj en del eller ett nytt byggverktyg.');setBuildTool('select');hover=null;hover3d=null;drag=null;drag3d=null;}
document.addEventListener('keydown',e=>{const typing=['INPUT','SELECT','TEXTAREA'].includes(e.target.tagName)||e.target.isContentEditable;
 if(e.key==='Escape'&&view!=='walk'){e.preventDefault();if(typing)e.target.blur();cancelTool();return;}
 if(typing)return;
 if(view!=='walk'&&(e.ctrlKey||e.metaKey)&&!e.altKey&&['c','v'].includes(e.key.toLowerCase())){
  e.preventDefault();if(!e.repeat&&!drag&&!drag3d&&!furnitureHandles.active)(e.key.toLowerCase()==='c'?copySelection:pasteSelection)();return;
 }

 if(e.key==='Delete'||e.key==='Backspace'){e.preventDefault();if(lookup()||multiSelected.size>1)$('remove').click();else status('Klicka på objektet först, tryck sedan Delete eller Backspace.');return;}
 if(movementKeys.has(e.code)&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&view!=='walk'){
  e.preventDefault();heldMovement.add(e.code);if(!movementFrame){movementLast=performance.now();movementFrame=requestAnimationFrame(animateMovement);}return;
 }
 if(view!=='walk'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&e.key.toLowerCase()==='m'){e.preventDefault();transformSelected('mirror');return;}
 if(view!=='walk'&&!e.ctrlKey&&!e.metaKey&&!e.altKey&&!pendingFurniture&&e.key.toLowerCase()==='r'&&objects().includes(lookup())){e.preventDefault();transformSelected('rotate',e.shiftKey?Math.PI/12:-Math.PI/12);return;}
 if(e.code==='Space'){e.preventDefault();spaceHeld=true;}if(e.key.toLowerCase()==='r'){if(pendingFurniture){pendingYaw+=Math.PI/2;redraw();}else if(lookup()?.yaw!==undefined)$('rotate').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();$(e.shiftKey?'redo':'undo').click();}if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();$('redo').click();}});
window.addEventListener('blur',()=>{stopMovement();spaceHeld=false;});
document.addEventListener('visibilitychange',()=>{if(document.hidden)stopMovement();});
for(const id of ['name','width','depth'])$(id).onchange=()=>{const before=JSON.stringify(p());if(id==='name')p().name=$('name').value.trim()||'Min bana';else{
  const n=clamp(Number($(id).value),8,100),b=p().ground.bounds;if(id==='width')b.x1=b.x0+n;else b.z1=b.z0+n;}
 try{project=parseProject(p());commit(before);}catch(e){project=JSON.parse(before);status(e.message);redraw();}};
$('check').onclick=()=>{try{
 const result=validateLevel(p(),{engine:true});p().validation=result;persist();
 const root=$('results');root.replaceChildren();
 const title=document.createElement('strong');title.className=result.summary.playable?'pass':'error';
 title.textContent=result.summary.playable?'SPELBAR I MOTORN':`${result.summary.errors} saker att ordna före en match`;root.append(title);
 const failed=result.results.filter(r=>r.status==='fail'),brief=document.createElement('p');
 brief.textContent=failed.length?'Det här krävs för en spelbar match. Du kan fortsätta bygga och spara när du vill.':'Du kan spela eller fortsätta bygga fritt. Möbler får stå nära varandra.';
 root.append(brief);
 if(failed.length){const lines=document.createElement('div');lines.textContent=failed.map(r=>`• ${r.detail}${r.fix?' — '+r.fix:''}`).join('\n');root.append(lines);}
 const details=document.createElement('details'),summary=document.createElement('summary');
 summary.textContent=`Visa tekniska detaljer (${result.results.length})`;details.append(summary);
 const all=document.createElement('div');all.textContent=result.results.map(r=>`${r.status==='fail'?'✕':r.status==='warn'?'!':r.status==='info'?'i':'✓'} ${r.check} ${r.id||''}: ${r.detail}${r.fix?' → '+r.fix:''}`).join('\n');
 details.append(all);root.append(details);
 status(result.summary.playable?'Banan kan spelas!':'Fortsätt bygg fritt. Speltestet visar bara det som måste lösas före match.');
}catch(e){status(e.message);}};
function download(bytes,name,type){const a=document.createElement('a'),url=URL.createObjectURL(new Blob([bytes],{type}));a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),5000);}
$('saveJson').onclick=()=>{try{download(draftText(p()),p().projectId+'.json','application/json');status('JSON-utkast hämtat utan spelkrav. Egna GLB ingår bara i ZIP/säkerhetskopia.');}catch(e){status('JSON kunde inte skapas: '+e.message);}};
async function saveDesign(backupOnly=false){
 const signature=JSON.stringify(p()),snapshot=JSON.parse(signature);$('save').disabled=true;$('saveBackup').disabled=true;
 try{
  const result=await prepareProjectSave(snapshot,getLocalFile,{backupOnly});
  download(result.bytes,(snapshot.projectId||'floor5')+(result.kind==='recovery'?'-SAKERHETSKOPIA':'')+'.zip','application/zip');
  if(result.kind==='project'){
   if(JSON.stringify(p())===signature){p().assets=result.document.assets;p().validation=result.document.validation;persist();}
   try{localStorage.setItem(guideKey('saved'),'1');updateFirstBuild();}catch{}
   status('ZIP hämtad. Byggfel hindrar inte sparning. Använd TESTA OM BANAN ÄR SPELKLAR före match.');
  }else status('SÄKERHETSKOPIA hämtad: alla projektdata bevarade. '+(result.missing.length?result.missing.length+' modell-/bildfiler saknas; behåll originalpaketen. ':'')+'Inte godkänd för spel. '+result.reason);
 }catch(e){
  // Last-resort source export does not depend on ZIP, models, renderer or parser.
  try{download(draftText(snapshot),(snapshot.projectId||'floor5')+'-RADDNING.json','application/json');status('JSON-räddning hämtad. ZIP misslyckades: '+e.message+'. Behåll modellfiler och fliken.');}
  catch(rawError){status('Kunde inte skapa hämtningen: '+rawError.message+' Behåll fliken öppen.');}
 }finally{$('save').disabled=false;$('saveBackup').disabled=false;}
}
$('save').onclick=()=>saveDesign(false);$('saveBackup').onclick=()=>saveDesign(true);
$('open').onchange=async e=>{const file=e.target.files?.[0];if(!file)return;try{let incoming,files=new Map();if(file.name.toLowerCase().endsWith('.zip')){const bytes=await file.arrayBuffer(),recovered=await readDraftZip(bytes);if(recovered){incoming=parseProject(recovered.project);files=recovered.files;}else ({project:incoming,files}=await parseProjectZip(bytes));}else incoming=parseProject(await file.text());
  for(const [path,bytes] of files)if(path.endsWith('.glb'))await importLocalGLB(new File([bytes],path.split('/').at(-1),{type:'model/gltf-binary'}));
  for(const asset of incoming.assets.local)if(!await getLocalFile(asset.assetId))throw Error('Egen GLB saknas. Öppna ZIP-filen i stället.');
  const next=inheritFloor5Gameplay(correctOldOrangeChair(incoming));
  const nextStore=storeForMode(next.mode);
  nextStore.acceptImport(next);draftStore=nextStore;$('recoveryDialog')?.close();
  if(view==='walk')leaveWalk();project=next;history=[];future=[];selected=null;pendingFurniture=null;pendingTemplate=null;pendingYaw=0;first=null;view3dCenter=null;view3dZoom=1;zoom=1;offset={x:0,z:0};$('name').value=p().name;$('width').value=p().ground.bounds.x1-p().ground.bounds.x0;$('depth').value=p().ground.bounds.z1-p().ground.bounds.z0;
  localCatalog=await localLibrary();for(const entry of localCatalog)entry.size=(await getLocalFile(entry.id))?.size;renderCatalog();persist();redraw();queueGameLook();status('Projektet öppnat. Kontrollera spelbarhet före provspelning.');
 }catch(err){status('Kunde inte öppna: '+err.message);}e.target.value='';};
$('preview').onclick=()=>{try{const report=validateLevel(p(),{engine:true});p().validation=report;if(!report.summary.playable)throw Error('Åtgärda '+report.summary.errors+' fel innan provspelning.');localStorage.setItem('cartridge-level-preview',JSON.stringify(p()));window.open('../fps/?level=preview','_blank','noopener');status('Privat provspelning öppnad från aktuellt projekt.');}catch(e){status(e.message);}};
function walkURL({embed=false,pose=null}={}){
 const params=new URLSearchParams({draft:String(Date.now())});
 if(embed)params.set('embed','1');
 if(new URLSearchParams(location.search).has('test'))params.set('test','1');
 if(pose&&[pose.x,pose.z,pose.yaw].every(Number.isFinite)){
  params.set('x',String(pose.x));params.set('z',String(pose.z));params.set('yaw',String(pose.yaw));}
 return '../fps/walk.html?'+params;
}
function preferredWalkPose(){const framePose=$('gameLookFrame').contentWindow?.studioWalkPose?.();
 if(framePose)return framePose;
 const focus=view3dCenter??frameBuiltFloors();return {x:focus.x,z:focus.z,yaw:orbit};
}
function closeGameLook({render=true}={}){
 clearTimeout(gameLookTimer);gameLookTimer=0;if(!gameLook)return;
 gameLook=false;$('gameLookPanel').hidden=true;$('gameLookFrame').src='about:blank';
 $('gameLook').classList.remove('active');$('gameLook').setAttribute('aria-pressed','false');
 $('scene3d').parentElement.classList.remove('game-look');if(render&&view==='3d')redraw();
}
function queueGameLook(){
 if(!gameLook)return;if(!floors().length){closeGameLook();return;}
 clearTimeout(gameLookTimer);gameLookTimer=setTimeout(()=>{
  if(!gameLook||view!=='3d')return;
  try{const pose=preferredWalkPose();localStorage.setItem('cartridge-level-walk',JSON.stringify(parseProject(p())));
   $('gameLookFrame').src=walkURL({embed:true,pose});
  }catch(err){status('Spelutseendet kunde inte uppdateras: '+err.message);}
 },450);
}
$('gameLook').onclick=()=>{if(gameLook){closeGameLook();return;}
 if(!floors().length){status('Rita ett golv först, sedan kan du visa banan som i spelet.');return;}
 if(view!=='3d')$('threeView').click();if(view!=='3d')return;
 gameLook=true;$('gameLookPanel').hidden=false;$('scene3d').parentElement.classList.add('game-look');
 $('gameLook').classList.add('active');$('gameLook').setAttribute('aria-pressed','true');
 redraw();queueGameLook();status('Spelutseendet visar spelets riktiga renderare. Bygg vidare i 3D till vänster.');};
$('gameLookClose').onclick=()=>closeGameLook();
$('walkView').onclick=()=>{try{if(view==='walk')return;if(!floors().length)throw Error('Rita ett golv först, sedan kan du gå runt direkt – spelmål behövs inte.');
 localStorage.setItem('cartridge-level-walk',JSON.stringify(parseProject(p())));
 walkReturnView=view;walkReturnLook=gameLook;walkPose=preferredWalkPose();if(gameLook)closeGameLook({render:false});
 if(view==='3d'&&renderer){renderer.dispose();renderer=null;}
 stopMovement();first=null;drawGesture=null;view='walk';updateClipboardUI();$('surfaceDock').hidden=true;selectionDock.sync(null);furnitureHandles.update();canvas.hidden=true;$('scene3d').hidden=true;$('movePad').hidden=true;$('workGuide').hidden=true;$('walkFrame').hidden=false;$('walkFrame').src=walkURL({pose:walkPose});
 for(const id of ['planView','threeView','walkView'])$(id).classList.toggle('active',id==='walkView');status('Promenadvy: samma renderare och kollision som FPS. W A S D för att gå, musen för att se dig omkring.');
 }catch(e){status(e.message);}};
function leaveWalk(){if(view!=='walk')return;$('walkFrame').src='about:blank';$('walkFrame').hidden=true;$('movePad').hidden=false;$('workGuide').hidden=false;
 view=walkReturnView==='3d'?'3d':'plan';canvas.hidden=view!=='plan';$('scene3d').hidden=view!=='3d';if(view==='3d')ensureRenderer();
 for(const id of ['planView','threeView','walkView'])$(id).classList.toggle('active',id===(view==='3d'?'threeView':'planView'));redraw();
 if(view==='3d'&&walkReturnLook)$('gameLook').click();walkReturnLook=false;}
window.addEventListener('message',e=>{if(e.origin!==location.origin||![ $('walkFrame').contentWindow,$('gameLookFrame').contentWindow].includes(e.source))return;
 if(e.data?.type==='cartridge-walk-close'&&e.source===$('walkFrame').contentWindow)leaveWalk();
 if(e.data?.type==='cartridge-walk-ready'){localStorage.setItem(guideKey('walked'),'1');updateFirstBuild();}
});
$('demo').onclick=async()=>{try{const response=await fetch('../levels/synthetic-demo.json');if(!response.ok)throw Error('Demobanan saknas.');const before=JSON.stringify(p());project=parseProject(await response.text());selected=null;pendingFurniture=null;pendingTemplate=null;pendingYaw=0;first=null;offset={x:0,z:0};zoom=1;view3dCenter=null;view3dZoom=1;$('name').value=p().name;commit(before);status('Syntetisk testbana öppnad. Den är separat från ditt sparade projekt.');}catch(e){status(e.message);}};
$('planView').onclick=()=>{if(view==='walk')leaveWalk();closeGameLook({render:false});first=null;drawGesture=null;view='plan';canvas.hidden=false;$('scene3d').hidden=true;$('planView').classList.add('active');$('threeView').classList.remove('active');redraw();};
$('threeView').onclick=()=>{if(view==='walk')leaveWalk();if(!ensureRenderer())return;first=null;drawGesture=null;view3dCenter??=frameBuiltFloors();view='3d';canvas.hidden=true;$('scene3d').hidden=false;$('threeView').classList.add('active');$('planView').classList.remove('active');redraw();if(innerWidth<720)selectionDock.collapse();};
$('fit').onclick=()=>{view3dZoom=1;view3dCenter=frameBuiltFloors();const b=p().ground.bounds;zoom=floors().length?clamp(Math.min(b.x1-b.x0,b.z1-b.z0)/view3dCenter.span,.5,10):1;offset=floors().length?{x:(b.x0+b.x1)/2-view3dCenter.x,z:(b.z0+b.z1)/2-view3dCenter.z}:{x:0,z:0};redraw();};
let repeatDelay=0,repeatTimer=0,repeated=false;
function stopMoveButton(){clearTimeout(repeatDelay);clearInterval(repeatTimer);repeatDelay=repeatTimer=0;}
for(const button of document.querySelectorAll('[data-move]')){
 button.addEventListener('pointerdown',e=>{if(e.button!==0)return;stopMoveButton();repeated=false;
  repeatDelay=setTimeout(()=>{repeated=true;moveView(button.dataset.move,Math.max(.5,Math.min(7,visibleSpan()*.12)));repeatTimer=setInterval(()=>moveView(button.dataset.move,visibleSpan()*.016),50);},300);
 });
 button.addEventListener('pointerup',stopMoveButton);button.addEventListener('pointercancel',stopMoveButton);button.addEventListener('pointerleave',stopMoveButton);
 button.addEventListener('click',e=>{if(e.detail===0||!repeated)moveView(button.dataset.move,Math.max(.5,Math.min(7,visibleSpan()*.12)));});
}
window.addEventListener('blur',stopMoveButton);
canvas.addEventListener('wheel',e=>{e.preventDefault();const before=point(e);zoom=clamp(zoom*(e.deltaY<0?1.1:.9),.5,10);const after=point(e);offset.x+=after.x-before.x;offset.z+=after.z-before.z;redraw();},{passive:false});
function zoom3D(e){e.preventDefault();if(furnitureHandles.active)return;view3dZoom=clamp(view3dZoom*(e.deltaY<0?1.15:.87),.5,10);redraw();}
$('scene3d').addEventListener('wheel',zoom3D,{passive:false});
let orbitDrag=null,pan3d=null,drag3d=null;
const ray3d=new T.Raycaster(),groundPlane=new T.Plane(new T.Vector3(0,1,0),0);
function hit3d(e){const r=$('scene3d').getBoundingClientRect();ray3d.setFromCamera(new T.Vector2((e.clientX-r.left)/r.width*2-1,-(e.clientY-r.top)/r.height*2+1),camera);const v=new T.Vector3();return ray3d.ray.intersectPlane(groundPlane,v)?{x:drag3d?.type==='floor-only'?v.x:snap(v.x),z:drag3d?.type==='floor-only'?v.z:snap(v.z)}:null;}
function pick3d(e){const ground=hit3d(e);const hits=ray3d.intersectObjects([...group.children,...(furnitureRoot?.children||[])],true);const hit=hits.find(h=>h.object.userData.editHandle?.startsWith('floor-'))||hits.find(h=>{let node=h.object;while(node&&!node.userData.editId)node=node.parent;return !!node?.userData.editId;});
 let node=hit?.object;while(node&&!node.userData.editId)node=node.parent;
 return {ground,id:node?.userData.editId||null,handle:node?.userData.editHandle||null,
  surface:hit?{x:hit.point.x,z:hit.point.z,y:hit.point.y,...(arch().some(w=>w.id===node?.userData.editId&&['wall','window','glazed'].includes(w.kind))?{wallId:node.userData.editId,normal:hit.face.normal.clone().transformDirection(hit.object.matrixWorld)}:{})}:null};}
function wallDragPoint(e,item){const wall=arch().find(w=>w.id===item.wallMount?.wallId);if(!wall)return null;
 hit3d(e);const dx=wall.b[0]-wall.a[0],dz=wall.b[1]-wall.a[1],normal=new T.Vector3(-dz,0,dx).normalize(),plane=new T.Plane().setFromNormalAndCoplanarPoint(normal,new T.Vector3(wall.a[0],0,wall.a[1]));
 const hit=ray3d.ray.intersectPlane(plane,new T.Vector3());return hit?{x:hit.x,z:hit.z,y:hit.y}:null;
}
function scenePointerDown(e){if(furnitureHandles.active)return;if(e.button===0&&(e.ctrlKey||e.metaKey)){e.preventDefault();toggleFurniture(pick3d(e).id);return;}if(e.button===1||e.button===2||(e.button===0&&(spaceHeld||e.shiftKey))){e.preventDefault();$('scene3d').setPointerCapture(e.pointerId);pan3d={x:e.clientX,y:e.clientY};return;}if(e.button!==0)return;
 $('scene3d').setPointerCapture(e.pointerId);if(e.altKey){orbitDrag={x:e.clientX};return;}
 const pick=pick3d(e),tool=tab==='build'?$('tool').value:tab==='play'?$('gameTool').value:'furnish';
 const onWall=arch().some(a=>a.id===pick.id&&['wall','window','glazed'].includes(a.kind));
 const attachesToWall=tab==='build'&&['door','wc-door','office-door','card-door','opening','window','glazed','office-glass','poster','curtain','blind'].includes(tool);
 const q=pendingFurniture?preferredPlacementPoint(pick,objects(),arch()):
  onWall&&attachesToWall&&pick.surface?pick.surface:pick.ground;if(!q)return;
 if(pendingFurniture){try{const before=JSON.stringify(p());addFurniture(pendingFurniture,q.x,q.z,q.y,q);commit(before);}catch(err){status(err.message);}return;}
 if(tab==='play'){const marker=markers().find(m=>m.id===pick.id);if(marker){selected=marker.id;drag3d={item:marker,before:JSON.stringify(p()),dx:pick.ground.x-marker.x,dz:pick.ground.z-marker.z};redraw();}else try{const before=JSON.stringify(p());placeMarker(tool,q.x,q.z);commit(before);}catch(err){status(err.message);}return;}
 if(tab==='build'&&tool!=='select'){handleBuild(q,tool,{x:e.clientX,y:e.clientY,tool,view:'3d'});return;}
 if(pick.id){multiSelected.clear();selected=pick.id;const item=lookup(),anchor=item?.a?{x:item.a[0],z:item.a[1]}:item;
  drag3d=item&&pick.ground?beginDirectDrag(item,pick.ground,pick.handle):null;
  if(!drag3d&&item&&(objects().includes(item)||arch().includes(item))&&pick.ground)drag3d={item,before:JSON.stringify(p()),dx:pick.ground.x-anchor.x,dz:pick.ground.z-anchor.z};
  else orbitDrag={x:e.clientX};
  if(drag3d&&item.wallMount){const hit=wallDragPoint(e,item);if(hit)drag3d.wall={x:hit.x-item.x,z:hit.z-item.z,y:hit.y-item.wallMount.y};}
  redraw();return;}
 if(tab==='furnish'){status('Välj en möbel i listan; klicka sedan i 3D för att placera den.');return;}
 selected=null;orbitDrag={x:e.clientX};redraw();}
$('scene3d').addEventListener('pointerdown',scenePointerDown);
$('scene3d').addEventListener('pointermove',e=>{if(drag3d){
  if(drag3d.wall){const hit=wallDragPoint(e,drag3d.item);if(hit&&moveObject(drag3d.item,hit.x-drag3d.wall.x,hit.z-drag3d.wall.z,{y:hit.y-drag3d.wall.y,wallId:drag3d.item.wallMount.wallId}))redraw();return;}
  const q=hit3d(e);
  if(q){if(drag3d.direct)applyDirectDrag(drag3d,q);else if(moveObject(drag3d.item,snap(q.x-drag3d.dx),snap(q.z-drag3d.dz)))redraw();}
  return;}
 if(pan3d){const dx=e.clientX-pan3d.x,dy=e.clientY-pan3d.y;pan3d={x:e.clientX,y:e.clientY};const scale=visibleSpan()/Math.max(1,$('scene3d').clientHeight)*1.4;
  const right={x:Math.cos(orbit),z:-Math.sin(orbit)},forward={x:-Math.sin(orbit),z:-Math.cos(orbit)},focus=view3dCenter??=frameBuiltFloors();
  focus.x+=(-dx*right.x+dy*forward.x)*scale;focus.z+=(-dx*right.z+dy*forward.z)*scale;position3DCamera();renderer.render(scene,camera);return;}
 if(orbitDrag){orbit+=(e.clientX-orbitDrag.x)*.005;orbitDrag.x=e.clientX;position3DCamera();renderer.render(scene,camera);return;}
 const pick=pick3d(e),onWall=arch().some(a=>a.id===pick.id&&['wall','window','glazed'].includes(a.kind));
 const tool=tab==='build'?$('tool').value:null,attachesToWall=['door','wc-door','office-door','card-door','opening','window','glazed','office-glass','poster','curtain','blind'].includes(tool);
 hover3d=pendingFurniture?preferredPlacementPoint(pick,objects(),arch()):
  onWall&&attachesToWall&&pick.surface?pick.surface:pick.ground;
 if(hover3d)$('coordinates').textContent=`X ${hover3d.x.toFixed(1)} · Z ${hover3d.z.toFixed(1)}`;update3DPreview();});
$('scene3d').addEventListener('pointerleave',()=>{
 if(drag3d||pan3d||orbitDrag)return;
 hover3d=null;snapFeedback=null;update3DPreview();
});
$('scene3d').addEventListener('pointerup',e=>{if(drawGesture?.view==='3d'&&first&&Math.hypot(e.clientX-drawGesture.x,e.clientY-drawGesture.y)>6){const q=hit3d(e);if(q)finishBuild(first,q,drawGesture.tool);}drawGesture=null;orbitDrag=null;pan3d=null;if(drag3d){commit(drag3d.before);drag3d=null;}});
$('scene3d').addEventListener('pointercancel',()=>{orbitDrag=null;pan3d=null;if(drag3d?.before){project=JSON.parse(drag3d.before);redraw();}if(drawGesture)first=null;drag3d=null;drawGesture=null;redraw();});
$('scene3d').addEventListener('contextmenu',e=>e.preventDefault());
new ResizeObserver(redraw).observe(canvas.parentElement);
$('name').value=p().name;$('width').value=p().ground.bounds.x1-p().ground.bounds.x0;$('depth').value=p().ground.bounds.z1-p().ground.bounds.z0;
localCatalog=await localLibrary().catch(()=>[]);for(const entry of localCatalog)entry.size=(await getLocalFile(entry.id))?.size;renderCatalog();redraw();
window.__levelStudio={get scene(){return model()},get project(){return p()},get selected(){return selected},get selectedIds(){return selectedFurniture().map(o=>o.id)},get validation(){return validateLevel(p(),{engine:true})},get viewState(){const b=p().ground.bounds;return {view,planCenter:{x:(b.x0+b.x1)/2-offset.x,z:(b.z0+b.z1)/2-offset.z},threeCenter:{...(view3dCenter??frameBuiltFloors())},orbit,zoom,view3dZoom,panActive:!!planPan};},get visualColors(){const colors=[];furnitureRoot?.traverse(node=>{if(node.isMesh&&node.userData.editId)for(const material of Array.isArray(node.material)?node.material:[node.material])if(material?.color)colors.push({id:node.userData.editId,color:material.color.getHexString(),opacity:material.opacity,depthWrite:material.depthWrite,map:material.map?.name||null,curtainStyle:material.userData.curtainStyle||null});});return colors;},worldAtScreen:(x,y)=>point({clientX:x,clientY:y}),select:id=>{multiSelected.clear();selected=id;redraw();},leaveWalk,
 screenWorldPoint:(x,z)=>{const [sx,sz]=screen(x,z),r=canvas.getBoundingClientRect();return {x:r.left+sx*r.width/canvas.width,y:r.top+sz*r.height/canvas.height};},
 screen3DPoint:(x,y,z)=>{const p=new T.Vector3(x,y,z).project(camera),r=$('scene3d').getBoundingClientRect();return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},
 get pendingAsset(){return pendingFurniture?{id:pendingFurniture.id,ready:!pendingFurniture.loading&&!pendingFurniture.loadError,error:pendingFurniture.loadError}:null;},
 get visualFurniture(){return (furnitureRoot?.children||[]).map(holder=>{holder.updateWorldMatrix(true,true);const bounds=new T.Box3().setFromObject(holder);return {id:holder.userData.editId,realModel:!!holder.userData.realModel,meshes:(()=>{const out=[];holder.traverse(o=>{if(o.isMesh)out.push({name:o.name,position:o.getWorldPosition(new T.Vector3()).toArray(),determinant:o.matrixWorld.determinant()});});return out;})(),min:bounds.min.toArray(),max:bounds.max.toArray(),position:holder.position.toArray(),yaw:holder.rotation.y};});},
 get floorHandles(){return group.children.filter(o=>o.isMesh&&o.geometry.type==='BoxGeometry'&&o.userData.editHandle?.startsWith('floor-')).map(o=>({handle:o.userData.editHandle,position:o.position.toArray()}));},
 get decorationVisuals(){const rows=[];group.traverse(o=>{const m=o.material;if(o.isMesh&&m?.userData?.curtainStyle)rows.push({id:o.userData.editId,curtainStyle:m.userData.curtainStyle,opacity:m.opacity,depthWrite:m.depthWrite,map:m.map?.name||null});});return rows;},
 get architectureVisuals(){const rows=[];group.traverse(o=>{if(o.userData.architecturePart)rows.push({id:o.userData.editId,part:o.userData.architecturePart,color:o.material.color.getHexString(),map:o.material.map?.name||null,roughness:o.material.roughness,metalness:o.material.metalness,position:o.position.toArray(),size:o.geometry.parameters});});return rows;},
 get snapPreview(){return {kind:snapFeedback?.kind||null,targetId:snapFeedback?.targetId||null,
  label:snapFeedback?.label||'',pose:snapFeedback?.pose,ghostPose:ghostRoot?.children[0]?{position:ghostRoot.children[0].position.toArray(),yaw:ghostRoot.children[0].rotation.y}:null,ghostLoaded:!!ghostRoot?.children[0]?.userData.realModel,highlightCount:preview3d.children.filter(x=>x.userData.snapTargetId).length};},redraw};

// A rejected autosave is never silently replaced by the fallback scene.
if(draftStore.rejected){
 const dialog=document.createElement('dialog');dialog.id='recoveryDialog';
 const heading=document.createElement('h2');heading.textContent='Ditt tidigare utkast är skyddat';
 const info=document.createElement('p');info.textContent='Utkastet kunde inte öppnas: '+draftStore.problem+'. Inget har skrivits över. Hämta originalet eller öppna en reparerad JSON/ZIP.';
 const backup=document.createElement('button');backup.textContent='HÄMTA ORIGINALUTKAST';backup.onclick=()=>download(draftStore.rejected,'Floor5_SKYDDAT_UTKAST.json','application/json');
 const chooser=document.createElement('input');chooser.type='file';chooser.accept='.json,.txt,.zip';chooser.hidden=true;chooser.onchange=e=>$('open').onchange(e);
 const open=document.createElement('button');open.textContent='ÖPPNA REPARERAD JSON/ZIP';open.onclick=()=>chooser.click();
 dialog.append(heading,info,backup,open,chooser);dialog.addEventListener('cancel',e=>e.preventDefault());document.body.append(dialog);dialog.showModal();
}
