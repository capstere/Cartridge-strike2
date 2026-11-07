import {MAX_PROJECT_JSON_BYTES} from './project-limits.mjs?v=5.7.3';
/** Cartridge Strike Möbelstudion — completely separate read-only source consumer.
 * No import of the FPS app, game state, controllers or game renderer.
 * Edits live only here, in browser-local storage and downloaded review JSON.
 */
import * as T from '../vendor/three/three.module.js';
import {createFurnishings} from '../src/fps/furnishings.mjs';
import {EDITOR_VERSION,GAME_VERSION,BASE_COMMIT,DEFAULT_ROOMS,ROOM_LABELS,
  EDITABLE_KINDS,bounds,centroid,inside,distanceSegment,catalog,normalizeAngle,
  round,validate,snapFurnitureToWall,exportPatch,parsePatch,isChanged} from './core.mjs?v=5.8.0';
import {LIBRARY_ALL as LIBRARY,LIBRARY_MAP,LIBRARY_CATEGORIES} from './library/catalog.mjs?v=5.8.0';
import {populateProcedural} from './library/procedural-mesh.mjs?v=5.8.0';
import {proceduralOf,placementRole} from './library/procedural.mjs?v=5.8.0';
import {proposeSmartPose,findSupport,inferPlacementRole} from './smart-placement.mjs?v=5.8.1';
import {furnitureSurfaces} from './furniture-surfaces.mjs?v=5.8.1';
import {poseOnWall,syncWallMounts,applyFurnitureAssemblyPose} from './wall-mounts.mjs?v=5.8.0';
import {applyFurnitureAppearance} from './build/project-visuals.mjs?v=5.8.0';
import {addModelToGroup,importLocalGLB,localLibrary,getLocalFile} from './library/models.mjs?v=5.8.0';
import {makeZip,readZip,PROJECT_ZIP_MAX_BYTES} from './library/zip.mjs?v=5.7.2';
import {readModelBundleZip} from './library/model-bundle.mjs?v=5.7.2';
import {assetHash} from './library/glb-utils.mjs';
import {createBuildMode} from './build/build-mode.mjs?v=5.8.0';
import {parseArchitecture,standardDoorMarkerSpan} from './build/architecture.mjs?v=5.8.0';
import {parsePosters} from './build/posters.mjs?v=5.7.3';
import {parseTreatments} from './build/treatments.mjs?v=5.8.0';
import {findCameraPlacement} from './placement.mjs';
import {isTable,isChair,chairRole,chairColors,validateDimensions,FINISH_COLORS,cameraPanVector,validFurnitureColor} from './appearance.mjs?v=5.8.0';
const $=s=>document.querySelector(s),data=globalThis.SpelFloor5,worldSource=globalThis.SpelWorld;
if(!data||!worldSource||!T.WebGLRenderer)throw new Error('Spelplanen eller Three.js saknas.');
const baseScene=worldSource.build({doors:Object.fromEntries(data.doors.filter(d=>d.accessCardConfirmed).map(d=>[d.id,true]))});
const furnishings=createFurnishings(data,baseScene,{inside,distanceSegment});
const baseline=catalog(data,furnishings),baseMap=new Map(baseline.map(o=>[o.id,o]));
const STORAGE='cartridge-furniture-studio-0.17.0-v1';
const labels={chair:'Stol',table:'Bord',sofa:'Soffa','coffee-table':'Soffbord',desk:'Skrivbord',cabinet:'Skåp',prop:'3D-objekt'};
let localEntries=[];
let building=null;
const projectPatch=()=>({...exportPatch(items,baseline),emptyFixed,architecture:building?.export()});
const originalCounts={...baseline.reduce((r,o)=>(r[o.kind]=(r[o.kind]||0)+1,r),{})};
let items=baseline.map(o=>({...o,original:{...o}})),emptyFixed=false,chosen=null,undoStack=[],redoStack=[],gesture=null,room='I09',cameraMode='top',zoom=16,azimuth=-.65,polar=.80,noticeTimer=null;
const $canvas=$('#viewport'),scene=new T.Scene();scene.background=new T.Color(0xdfe9e5);
const camera=new T.OrthographicCamera(-10,10,10,-10,.05,300),renderer=new T.WebGLRenderer({canvas:$canvas,antialias:true,alpha:false,powerPreference:'low-power'});
renderer.outputColorSpace=T.SRGBColorSpace;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.65));
const target=new T.Vector3(7.5,0,11.8),raycaster=new T.Raycaster(),floorPlane=new T.Plane(new T.Vector3(0,1,0),0);
const boxGeometry=new T.BoxGeometry(1,1,1),pickMeshes=[],furnitureGroups=new Map(),originMaterials=[],sourceWallMeshes=[],fixedScenery=[];
const mat=(color,rough=.8,metal=0,opts={})=>new T.MeshStandardMaterial({color,roughness:rough,metalness:metal,...opts});
const pickMaterial=new T.MeshBasicMaterial({transparent:true,opacity:0,depthWrite:false,colorWrite:false});
const m={floor:mat(0xf5f8f3),rooms:mat(0xebf0ee),dark:mat(0x324b50),metal:mat(0x819b9b,.45,.6),silver:mat(FINISH_COLORS.silver,.45,.65),white:mat(FINISH_COLORS.white),wood:mat(0xc1a582),orange:mat(0xdf753c),blue:mat(0x629ca3),conferenceBlue:mat(FINISH_COLORS.blue),black:mat(FINISH_COLORS.black),teal:mat(0x3b9291),selected:mat(0x17a7a2,.4),fixed:mat(0x9faeac,.85,0,{transparent:true,opacity:.77}),wall:mat(0xa9b7b5,.95,0,{transparent:true,opacity:.63}),glass:mat(0x8ec8cd,.26,.1,{transparent:true,opacity:.34,depthWrite:false}),door:mat(0xd2a36b)};
originMaterials.push(...Object.values(m),pickMaterial);
const dynamicGroup=new T.Group();dynamicGroup.name='editable-furnishings';scene.add(dynamicGroup);
function addBox(parent,x,y,z,w,h,d,material,clickable=false){const o=new T.Mesh(boxGeometry,material);o.position.set(x,y,z);o.scale.set(Math.max(.005,w),Math.max(.005,h),Math.max(.005,d));parent.add(o);if(clickable)pickMeshes.push(o);return o;}
function polygonMesh(polygon,material,y){const s=new T.Shape();polygon.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();const g=new T.ShapeGeometry(s);const o=new T.Mesh(g,material);o.rotation.x=Math.PI/2;o.position.y=y;o.material.side=T.DoubleSide;return o;}
function makeGround(){
 const floors=new T.Group();floors.name='accepted-floor';scene.add(floors);
 const shapes=data.floorPolygons.map(poly=>{const s=new T.Shape();poly.forEach(([x,z],i)=>i?s.lineTo(x,z):s.moveTo(x,z));s.closePath();return s;});
 const floor=new T.Mesh(new T.ShapeGeometry(shapes),m.floor);floor.rotation.x=Math.PI/2;floor.position.y=-.042;floor.material.side=T.DoubleSide;floors.add(floor);
 const subtle=new T.MeshBasicMaterial({color:0xa7c8c0,side:T.DoubleSide,transparent:true,opacity:.10,depthWrite:false});originMaterials.push(subtle);
 for(const r of data.rooms.filter(r=>r.status==='included')){const mesh=polygonMesh(r.polygon,subtle,-.029);floors.add(mesh);}
 const grid=new T.GridHelper(120,120,0x91b5b1,0x91b5b1);grid.position.y=-.037;grid.material.opacity=.14;grid.material.transparent=true;scene.add(grid);
 const wallGeo=new T.BoxGeometry(1,1,1);
 const walls=data.walls.filter(w=>Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>.02);
 for(const type of ['wall','glass']){
  const source=walls.filter(w=>(w.surfaceType==='glazed'||w.surfaceType==='window')===(type==='glass'));
  const mesh=new T.InstancedMesh(wallGeo,m[type],source.length);
  const dummy=new T.Object3D();source.forEach((w,i)=>{const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1];
    dummy.position.set((w.a[0]+w.b[0])/2,.36,(w.a[1]+w.b[1])/2);
    dummy.rotation.set(0,-Math.atan2(dz,dx),0);dummy.scale.set(Math.hypot(dx,dz),.72,Math.max(.065,w.thickness||.09));dummy.updateMatrix();mesh.setMatrixAt(i,dummy.matrix);
  });mesh.instanceMatrix.needsUpdate=true;mesh.name='static-'+type+'-outlines';scene.add(mesh);sourceWallMeshes.push(mesh);
 }
 // Door openings are visual markers only — no new physical barriers.
 const doorMat=new T.LineBasicMaterial({color:0x9a795e,transparent:true,opacity:.75});originMaterials.push(doorMat);
 const segments=[];for(const door of data.doors.filter(d=>!d.blocked)){const marker=standardDoorMarkerSpan(door);segments.push(marker.a[0],.022,marker.a[1],marker.b[0],.022,marker.b[1]);}
 const lines=new T.BufferGeometry();lines.setAttribute('position',new T.Float32BufferAttribute(segments,3));scene.add(new T.LineSegments(lines,doorMat));
 // Fixed benches, kitchen counters and closets provide context and collision feedback.
 const staticObstacles=data.obstacles.filter(o=>!EDITABLE_KINDS[o.kind]&&o.kind!=='uncertain-area');
 const fixed=new T.InstancedMesh(boxGeometry,m.fixed,staticObstacles.length);const dummy=new T.Object3D();
 staticObstacles.forEach((o,i)=>{const [x0,z0,x1,z1]=bounds(o.polygon),h=Math.min(.96,Math.max(.13,o.height||.75));dummy.position.set((x0+x1)/2,h/2,(z0+z1)/2);dummy.rotation.set(0,0,0);dummy.scale.set(x1-x0,h,z1-z0);dummy.updateMatrix();fixed.setMatrixAt(i,dummy.matrix);});fixed.instanceMatrix.needsUpdate=true;fixed.name='existing-fixed-fixtures';scene.add(fixed);fixedScenery.push(fixed);
 // Existing autogenerated non-editable items remain as pale scenery markers.
 const visibleGeneratedIds=new Set(baseline.filter(o=>o.source==='generated-group').map(o=>o.id));
 const extra=furnishings.boxes.filter(b=>b.asset!=='chairDesk'&&!visibleGeneratedIds.has(b.furnishingId)&&!b.id.startsWith('fps-I12-sofa-'));
 const generated=new T.InstancedMesh(boxGeometry,m.fixed,extra.length);
 extra.forEach((b,i)=>{dummy.position.set(b.x,b.y,b.z);dummy.rotation.set(0,b.angle||0,0);dummy.scale.set(b.w,b.h,b.d);dummy.updateMatrix();generated.setMatrixAt(i,dummy.matrix);});generated.instanceMatrix.needsUpdate=true;generated.name='non-editable-furniture';scene.add(generated);fixedScenery.push(generated);
 const light=new T.HemisphereLight(0xffffff,0x9cbbaf,2.4);scene.add(light);const fill=new T.DirectionalLight(0xffffff,1.5);fill.position.set(-6,28,12);scene.add(fill);
}
function setFixedVisibility(){for(const model of fixedScenery)model.visible=!emptyFixed;
 $('#emptyFixedStatus').textContent=emptyFixed?'TOMMA YTOR · fasta inventarier dolda':'URSPRUNG · fasta inventarier visas';
 $('#emptyFixed').disabled=emptyFixed;}
function makeModel(item){
 const group=new T.Group();group.name='möbel-'+item.id;group.userData.editId=item.id;
 const put=(x,y,z,w,h,d,material)=>addBox(group,x,y,z,w,h,d,material,true);
 const w=item.w,d=item.d,role=chairRole(item),cloth=role==='kitchen'?m.orange:role==='conference'?m.conferenceBlue:m.black;
 const chairLegs=role==='conference'?m.black:role==='office'?m.black:m.metal;
 if(proceduralOf(item)){
  populateProcedural(item,group,put);
 }else if(item.assetId){
  const proxy=put(0,item.height/2,0,w,item.height,d,pickMaterial);proxy.userData.editId=item.id;
  const fallback=put(0,item.height/2,0,w*.96,item.height*.96,d*.96,m.teal);fallback.userData.editorFallback=true;
  addModelToGroup(item,group,()=>{if(group.userData.realModel){fallback.visible=false;fallback.material=pickMaterial;}
    applyFurnitureAppearance(group,item);if(chosen===item.id)updateHighlight();scheduleRender();});
 }else if(item.kind==='chair'){
  const seatH=.47;put(0,seatH,0,w*.91,.11,d*.86,cloth);
  put(0,.74,d*.39,w*.91,.46,.072,cloth);
  for(const x of [-w*.34,w*.34])for(const z of[-d*.30,d*.30])put(x,.22,z,.025,.43,.025,chairLegs);
  put(0,.056,0,w*.90,.045,.06,chairLegs);
  // Turquoise marker is at the front of the chair (opposite its back).
  put(0,.50,-d*.47,w*.28,.015,.035,m.teal);
 }else if(item.kind==='sofa'){
  put(0,.27,0,w,.45,d,m.blue);put(0,.66,d*.41,w,.44,d*.18,m.blue);
  for(const x of[-w*.43,w*.43])put(x,.49,0,w*.14,.34,d,m.blue);
  put(0,.52,-d*.07,w*.86,.14,d*.75,m.orange);
 }else if(item.kind==='table'||item.kind==='coffee-table'||item.kind==='desk'){
  const height=item.kind==='coffee-table'?.46:.75;
  put(0,height,0,w,.065,d,m.white);
  for(const x of[-w*.43,w*.43])for(const z of[-d*.38,d*.38])put(x,height/2,z,.052,height-.03,.052,m.silver);
 }else{
  put(0,item.height/2,0,w,item.height,d,m.white);put(0,item.height-.06,d*.51,w*.83,.07,.018,m.dark);
 }
 group.position.set(item.x,item.elevation||0,item.z);group.rotation.y=item.yaw;
 group.traverse(c=>{if(c.isMesh)c.userData.editId=item.id});
 applyFurnitureAppearance(group,item);
 // Merged procedural geometry is selectable just like the older box presets.
 group.traverse(c=>{if(c.isMesh&&!pickMeshes.includes(c))pickMeshes.push(c);});
 return group;
}
function syncModels(){
 syncWallMounts(items,building?.getEntries()||[]);
 dynamicGroup.traverse(o=>{if(o.userData?.studioGeometry)o.geometry?.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])if(m?.userData?.studioOwned)m.dispose();});
 dynamicGroup.clear();pickMeshes.length=0;furnitureGroups.clear();for(const o of items){if(o.deleted)continue;const group=makeModel(o);dynamicGroup.add(group);furnitureGroups.set(o.id,group);}
 updateHighlight();scheduleRender();
}
let boxHelper=null,selectionMarker=null;
function updateHighlight(){
 if(boxHelper){scene.remove(boxHelper);boxHelper.geometry.dispose();boxHelper=null;}
 if(selectionMarker){scene.remove(selectionMarker);selectionMarker.geometry.dispose();selectionMarker=null;}
 const item=items.find(o=>o.id===chosen&&!o.deleted),group=item&&furnitureGroups.get(item.id);
 if(!group)return;
 boxHelper=new T.BoxHelper(group,0x0d8f91);boxHelper.material.depthTest=false;boxHelper.renderOrder=7;scene.add(boxHelper);
 selectionMarker=new T.Mesh(new T.RingGeometry(Math.max(item.w,item.d)*.64,Math.max(item.w,item.d)*.64+.045,32),new T.MeshBasicMaterial({color:0x0d9995,side:T.DoubleSide,depthTest:false}));
 selectionMarker.rotation.x=-Math.PI/2;selectionMarker.position.set(item.x,.036,item.z);selectionMarker.renderOrder=6;scene.add(selectionMarker);
}
function updatePose(item){const g=furnitureGroups.get(item.id);if(g){g.position.set(item.x,item.elevation||0,item.z);g.rotation.y=item.yaw;g.updateMatrixWorld(true);}if(boxHelper)boxHelper.update();if(selectionMarker&&chosen===item.id)selectionMarker.position.set(item.x,.036,item.z);scheduleRender();}
let scheduled=false;
function scheduleRender(){if(scheduled)return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;resize();renderer.render(scene,camera);});}
function resize(){const rect=$canvas.getBoundingClientRect();const w=Math.max(1,Math.floor(rect.width)),h=Math.max(1,Math.floor(rect.height));if(w!==renderer.domElement.width/renderer.getPixelRatio()||h!==renderer.domElement.height/renderer.getPixelRatio())renderer.setSize(w,h,false);
 const a=w/h;camera.left=-zoom*a/2;camera.right=zoom*a/2;camera.top=zoom/2;camera.bottom=-zoom/2;camera.updateProjectionMatrix();updateCamera();}
function updateCamera(){
 const span=Math.max(zoom,5),dist=span*1.8;
 if(cameraMode==='top'){camera.position.set(target.x,dist,target.z);camera.up.set(0,0,-1);}else{camera.position.set(target.x+Math.sin(polar)*Math.sin(azimuth)*dist,Math.cos(polar)*dist,target.z+Math.sin(polar)*Math.cos(azimuth)*dist);camera.up.set(0,1,0);}
 camera.lookAt(target);camera.updateMatrixWorld();
}
function view(mode){cameraMode=mode;$('#topView').classList.toggle('active',mode==='top');$('#threeView').classList.toggle('active',mode==='3d');$('#topView').setAttribute('aria-pressed',mode==='top');$('#threeView').setAttribute('aria-pressed',mode==='3d');building?.setView();scheduleRender();}
function roomAt(x,z){return data.rooms.find(r=>r.status==='included'&&inside(x,z,r.polygon))||null;}
function updateLocationLabel(){const r=roomAt(target.x,target.z);
 const label=r?'DU ÄR VID: '+(ROOM_LABELS[r.id]||r.name||'Område')+' · '+r.id:'DU ÄR VID: en fri yta utanför möblerbara rum';
 for(const id of ['#areaHere','#areaHereBuild']){const el=$(id);if(!el)continue;
  el.textContent=label;el.title='Kamerans mittpunkt: X '+target.x.toFixed(2)+' · Z '+target.z.toFixed(2);}
 if(r&&room!==r.id){room=r.id;$('#room').value=r.id;renderList();}
}
function goToRoom(id=room){const r=data.rooms.find(r=>r.id===id);if(!r)return;const [x0,z0,x1,z1]=bounds(r.polygon);target.set((x0+x1)/2,0,(z0+z1)/2);zoom=Math.max(4,Math.min(42,Math.max(z1-z0+3,(x1-x0+3)*.80)));updateLocationLabel();scheduleRender();}
function whole(){const coords=data.floorPolygons.flat(),[x0,z0,x1,z1]=bounds(coords);target.set((x0+x1)/2,0,(z0+z1)/2);zoom=Math.max(z1-z0+7,(x1-x0+7)*.70);updateLocationLabel();scheduleRender();}
function select(id,focus=false){const item=items.find(o=>o.id===id&&!o.deleted);chosen=item?.id||null;
 if(item){room=item.roomId;$('#room').value=room;if(focus){target.set(item.x,0,item.z);zoom=Math.min(zoom,6);}}
 renderList();renderProperties();updateHighlight();scheduleRender();
}
function snapshot(){return {objects:items.map(({original,...o})=>({...o,original:original?{...original}:undefined})),emptyFixed};}
function checkpoint(before){const a=JSON.stringify(before),b=JSON.stringify(snapshot());if(a===b)return false;
 undoStack.push(before);if(undoStack.length>60)undoStack.shift();redoStack=[];store();renderProperties();renderList();return true;
}
function restore(snap){const saved=Array.isArray(snap)?{objects:snap,emptyFixed:false}:snap;
 items=saved.objects.map(o=>({...o,original:o.original?{...o.original}:undefined}));emptyFixed=!!saved.emptyFixed;setFixedVisibility();
 if(!items.some(o=>o.id===chosen&&!o.deleted))chosen=null;syncModels();renderList();renderProperties();}
function store(){try{const doc=projectPatch();localStorage.setItem(STORAGE,JSON.stringify(doc));$('#autosave').textContent='Ändringar sparade lokalt. Ladda ned projektfilen för att kunna fortsätta på en annan dator.';}catch{$('#autosave').textContent='Lokal lagring fungerar inte — ladda ned JSON-filen direkt.';}}
function notify(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>{$('#notice').hidden=true;},4600);}
function nameFor(o){return o.assetName||LIBRARY_MAP.get(o.assetId)?.name||labels[o.kind]||'Möbel';}
function renderRooms(){const rooms=[...new Set(data.rooms.filter(r=>r.status==='included').map(r=>r.id))].sort((a,b)=>DEFAULT_ROOMS.indexOf(a)===-1?1:DEFAULT_ROOMS.indexOf(b)===-1?-1:DEFAULT_ROOMS.indexOf(a)-DEFAULT_ROOMS.indexOf(b));const el=$('#room');el.replaceChildren();for(const id of rooms){const r=data.rooms.find(r=>r.id===id),opt=document.createElement('option');opt.value=id;opt.textContent=(ROOM_LABELS[id]||r?.name||id)+' · '+id;el.append(opt);}if(!rooms.includes(room))room=rooms[0];el.value=room;}
function renderList(){const el=$('#furnitureList');el.replaceChildren();const search=$('#search').value.trim().toLowerCase(),chairsOnly=$('#chairsOnly').checked;
 const visible=items.filter(o=>!o.deleted&&o.roomId===room&&(!chairsOnly||o.kind==='chair')&&(o.id.toLowerCase().includes(search)||nameFor(o).toLowerCase().includes(search)||o.roomId.toLowerCase().includes(search)));
 $('#listCount').textContent=visible.length+' objekt';
 if(!visible.length){const empty=document.createElement('p');empty.className='helper';empty.textContent='Inga möbler matchar filtret.';el.append(empty);}
 visible.forEach((o,i)=>{const b=document.createElement('button');b.type='button';b.setAttribute('role','option');b.setAttribute('aria-selected',o.id===chosen?'true':'false');b.classList.toggle('active',o.id===chosen);
  const n=document.createElement('span');n.textContent=nameFor(o)+' '+(i+1);const id=document.createElement('small');id.textContent=o.id.slice(-20);b.append(n,id);b.onclick=()=>select(o.id,true);el.append(b);
 });
 const patch=exportPatch(items,baseline),count=patch.placements.length+patch.added.length+patch.removed.length+(building?.count()||0);$('#changeCount').textContent=count+' ändringar';$('#undo').disabled=!undoStack.length;$('#redo').disabled=!redoStack.length;
 if(!building?.active)$('#viewportStatus').textContent=(chosen?`Markerad: ${chosen} · `:'')+visible.length+' synliga objekt i listan · '+baseline.length+' redigerbara möbler totalt';
}
function renderProperties(){const o=items.find(x=>x.id===chosen&&!x.deleted);$('#emptySelection').hidden=!!o;$('#selectionPanel').hidden=!o;$('#selectionTag').textContent=o?o.roomId:'Ingen vald';
 if(!o)return;
 $('#selectedName').textContent=nameFor(o)+' · '+o.roomId;$('#selectedId').textContent=o.id;$('#x').value=round(o.x,2);$('#z').value=round(o.z,2);
 const table=isTable(o),chair=isChair(o);
 $('#assetRoleFields').hidden=o.kind!=='prop';
 if(o.kind==='prop')$('#assetRole').value=o.assetRole||'auto';
 $('#tableSizeFields').hidden=!table;$('#chairRoleFields').hidden=!chair;
 if(table){$('#tableWidth').value=round(o.w,3);$('#tableDepth').value=round(o.d,3);}
 if(chair)$('#chairRole').value=chairRole(o);
 const entry=LIBRARY_MAP.get(o.assetId);$('#objectColorFields').hidden=!entry?.colorable;
 if(entry?.colorable)$('#objectColor').value=o.color||entry.defaultColor||'#f2f3ef';
 const levels=furnitureSurfaces(items.find(item=>item.id===o.mountId));$('#shelfFields').hidden=levels.length<2;
 $('#shelfLevel').replaceChildren(...levels.map(level=>new Option(level.label,String(level.index))));$('#shelfLevel').value=String(o.mountSurface??levels.at(-1)?.index??0);
 $('#degrees').textContent=Math.round(normalizeAngle(o.yaw)*180/Math.PI)+'°';
 $('#rotateLeft').disabled=$('#rotateRight').disabled=!!o.wallMount;
 $('#duplicate').disabled=!['chair','table','coffee-table','desk','sofa','prop'].includes(o.kind);
}
function positionIssue(candidate){if(candidate.wallMount)return poseOnWall(candidate,candidate.wallMount,building?.getEntries()||[])?null:'Väggfästet saknas.';const list=items.filter(o=>!o.deleted);return validate(candidate,list,data,baseMap.get(candidate.id),{emptyFixed});}
function changePose(id,delta,{quiet=false}={}){const o=items.find(o=>o.id===id&&!o.deleted);if(!o)return false;let next={...o,...delta};next.yaw=normalizeAngle(next.yaw);
 if(o.wallMount&&delta.yaw!==undefined){if(!quiet)notify('Vägghyllans riktning följer väggen. Dra den längs väggen för att flytta.');return false;}
 if(quiet&&$('#wallSnap')?.checked&&(delta.x!==undefined||delta.z!==undefined)){
  const snapped=snapFurnitureToWall(next,data);
  if(!positionIssue(snapped))next=snapped;
 }
 if(delta.x!==undefined||delta.z!==undefined){
  const smart=proposeSmartPose(next,{x:next.x,z:next.z},items,{enabled:$('#smartAttach').checked||!!o.wallMount,mode:o.wallMount?'wall':'auto',walls:building?.getEntries()||[],floors:data.rooms});
  if(smart.blocked){$('#validation').textContent=smart.blocked;$('#validation').hidden=false;if(!quiet)notify(smart.blocked);return false;}
  next={...next,...smart};
 }
 const problem=positionIssue(next);if(problem){$('#validation').textContent=problem;$('#validation').hidden=false;if(!quiet)notify(problem);return false;}
 $('#validation').hidden=true;
 applyFurnitureAssemblyPose(o,items,{x:next.x,z:next.z,yaw:next.yaw,mountId:next.mountId||null,mountSurface:next.mountId?next.mountSurface??null:null,wallMount:next.wallMount||null,elevation:next.elevation||0});for(const item of items.filter(item=>!item.deleted))updatePose(item);renderProperties();return true;
}
function mutate(id,delta){const prev=snapshot();const ok=changePose(id,delta);if(ok)checkpoint(prev);return ok;}
function changeDimensions(id,delta){
 const current=items.find(o=>o.id===id&&!o.deleted);if(!current||!isTable(current))return false;
 let next;try{next=validateDimensions(delta.w??current.w,delta.d??current.d,current);}catch(e){notify(e.message);return false;}
 const candidate={...current,...next},problem=positionIssue(candidate);
 if(problem){$('#validation').textContent=problem;$('#validation').hidden=false;notify(problem);return false;}
 $('#validation').hidden=true;
 const before=snapshot();Object.assign(current,next);if(!checkpoint(before))return true;
 syncModels();renderProperties();return true;
}
function changeAssetRole(id,role){
 const o=items.find(x=>x.id===id&&!x.deleted);
 if(!o||o.kind!=='prop'||!['auto','table','chair','other'].includes(role))return false;
 const before=snapshot();o.assetRole=role;
 if(!checkpoint(before))return true;
 syncModels();renderProperties();return true;
}
function changeChairRole(id,role){const o=items.find(x=>x.id===id&&!x.deleted);if(!o||!isChair(o)||!['kitchen','office','conference'].includes(role))return false;
 const before=snapshot();o.chairRole=role;if(!checkpoint(before))return true;
 syncModels();renderProperties();return true;
}
function createDuplicate(){const source=items.find(x=>x.id===chosen&&!x.deleted);if(!source)return;
 const tag=source.assetId?'OBJ':source.kind==='chair'?'STOL':source.kind==='sofa'?'SOFFA':'BORD';let i=1,id;
 do{id=`NY-${tag}-${String(i++).padStart(3,'0')}`;}while(items.some(o=>o.id===id));
 const offsets=[[.7,0],[-.7,0],[0,.7],[0,-.7],[1.2,0],[-1.2,0],[0,1.2],[0,-1.2]];
 for(const [dx,dz]of offsets){const candidate={...source,id,source:'added',x:round(source.x+dx),z:round(source.z+dz),original:undefined};
  if(!validate(candidate,items.filter(o=>!o.deleted),data)){const before=snapshot();items.push(candidate);checkpoint(before);syncModels();renderRooms();select(id,true);notify('Kopia skapad. Dra den till önskad plats.');return;}
 }
 notify('Det finns ingen säker ledig plats intill möbeln.');
}
function removeSelection(){const o=items.find(x=>x.id===chosen&&!x.deleted);if(!o)return;const before=snapshot();o.deleted=true;for(const child of items.filter(x=>x.mountId===o.id&&!x.deleted)){child.mountId=null;child.mountSurface=null;child.elevation=0;}chosen=null;checkpoint(before);syncModels();renderList();renderProperties();notify('Möbeln är borttagen i redigeraren. Spelet är orört.');}
function undo(){if(!undoStack.length)return;redoStack.push(snapshot());restore(undoStack.pop());store();notify('Ångrat.');}
function redo(){if(!redoStack.length)return;undoStack.push(snapshot());restore(redoStack.pop());store();notify('Gjort om.');}
function downloadBlob(blob,name){const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),5000);}
function activeLocalIds(objects){return [...new Set(objects.filter(o=>!o.deleted&&o.assetId?.startsWith('local:')).map(o=>o.assetId))].sort();}
async function download(){try{
 const patch=projectPatch(),text=JSON.stringify(patch,null,2)+'\n',ids=activeLocalIds(items);
 if(!ids.length){downloadBlob(new Blob([text],{type:'application/json'}),'CartridgeStrike-design-0.17.json');notify('JSON sparad! Skicka den hit när du vill föra in din möblering i spelet.');return;}
 const files=[{name:'projekt.json',data:text}];
 for(const id of ids){const asset=await getLocalFile(id);if(!asset?.data)throw Error('En importerad GLB saknas. Importera den igen innan du sparar.');
  files.push({name:'models/'+id.slice(6)+'.glb',data:new Uint8Array(asset.data)});
 }
 const zip=makeZip(files);downloadBlob(new Blob([zip],{type:'application/zip'}),'CartridgeStrike-design-med-GLB.zip');notify('ZIP sparad med alla egna GLB-filer! Skicka ZIP-filen hit om du vill använda dem i spelet.');
 }catch(e){notify('Kunde inte spara projekt: '+e.message);}}
async function importFile(file){if(!file)return;if(file.size>PROJECT_ZIP_MAX_BYTES)throw Error('Projektfilen är för stor (max 96 MB).');
 let doc,stored=[];
 if(/\.zip$/i.test(file.name)){
  const contents=readZip(await file.arrayBuffer());doc=JSON.parse(new TextDecoder('utf-8').decode(contents.get('projekt.json')));
  const expected=[...new Set((doc.added||[]).map(p=>p.assetId).filter(id=>typeof id==='string'&&id.startsWith('local:')))];
  const packages=[...contents.keys()].filter(n=>n!=='projekt.json');
  if(packages.length!==expected.length)throw Error('ZIP-filen saknar eller innehåller extra 3D-modeller.');
  for(const id of expected){const name='models/'+id.slice(6)+'.glb',bytes=contents.get(name);if(!bytes||'local:'+await assetHash(bytes)!==id)throw Error('GLB-filen har ändrats efter sparningen.');stored.push({id,data:bytes});}
 }else{if(file.size>MAX_PROJECT_JSON_BYTES)throw Error('JSON-filen är för stor (max 16 MiB). Behåll originalfilen.');doc=JSON.parse(await file.text());}
 const parsed=parsePatch(doc,baseline),arch=parseArchitecture(doc.architecture,building.getBaseline());
 parsePosters(doc.architecture?.posters,arch.entries);
 parseTreatments(doc.architecture?.treatments,arch.entries);
 if(stored.length){for(const f of stored){const name=doc.added.find(x=>x.assetId===f.id)?.assetName||'Egen-modell';
   await importLocalGLB(new File([f.data],name+'.glb',{type:'model/gltf-binary'}));}
  localEntries=await localLibrary();renderLibrary();
 }else for(const id of activeLocalIds(parsed))if(!await getLocalFile(id))throw Error('Projektet använder en egen GLB-fil. Öppna den sparade ZIP-filen i stället.');
 const before=snapshot();items=parsed;emptyFixed=doc.emptyFixed===true;setFixedVisibility();chosen=null;building.load(doc.architecture);checkpoint(before);syncModels();renderRooms();renderList();renderProperties();goToRoom(room);store();notify('Projektet öppnat med möbler och byggdelar! Spara när du är nöjd.');
}
function readAutosave(){try{const saved=localStorage.getItem(STORAGE);if(!saved)return;const doc=JSON.parse(saved);items=parsePatch(doc,baseline);emptyFixed=doc.emptyFixed===true;setFixedVisibility();building.load(doc.architecture);$('#autosave').textContent='Dina tidigare ändringar har återställts från den här webbläsaren.';}catch{localStorage.removeItem(STORAGE);}}
function rayAt(event){const r=$canvas.getBoundingClientRect(),p=new T.Vector2((event.clientX-r.left)/r.width*2-1,-((event.clientY-r.top)/r.height*2-1));raycaster.setFromCamera(p,camera);return raycaster;}
function planePoint(ev){const pt=new T.Vector3();return rayAt(ev).ray.intersectPlane(floorPlane,pt)?pt:null;}
function lookupHit(ev){const intersections=rayAt(ev).intersectObjects(pickMeshes,false);for(const i of intersections){const id=i.object.userData.editId;if(items.some(o=>o.id===id&&!o.deleted))return id;}return null;}
function pan(dx,dy){
 const right=new T.Vector3(1,0,0).applyQuaternion(camera.quaternion),up=new T.Vector3(0,1,0).applyQuaternion(camera.quaternion);
 const delta=cameraPanVector(dx,dy,zoom,$canvas.getBoundingClientRect().height,right,up,cameraMode==='top');
 target.x+=delta.x;target.z+=delta.z;updateLocationLabel();scheduleRender();
}
const LIBRARY_EMOJI={hissrum12:'▧',stolar:'◩',bord:'▰',kontor:'▥',kok:'▤',badrum:'◪',labb:'⬡',industri:'▦',dekor:'✦',egna:'★'};
function renderLibrary(){const query=$('#librarySearch').value.trim().toLocaleLowerCase('sv'),cat=$('#libraryCategory').value;
 const source=[...LIBRARY,...localEntries];const words=s=>String(s).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLocaleLowerCase('sv');const visible=source.filter(x=>(cat==='alla'||x.category===cat)&&words(query).split(/\s+/).every(word=>words(x.name+' '+x.category+' '+x.model+' '+(x.keywords||'')).includes(word)));
 $('#libraryCount').textContent=`${visible.length} av ${source.length} objekt`;$('#openLibrary span').textContent=`${source.length} objekt och 3D-modeller`;
 const list=$('#libraryTiles');list.replaceChildren();
 for(const entry of visible){const card=document.createElement('button');card.type='button';card.className='library-tile';card.title=entry.license+' · '+entry.source;
  const preview=document.createElement('div');preview.className='library-thumb';
  if(entry.thumb){const img=document.createElement('img');img.src=entry.thumb;img.loading='lazy';img.alt='Förhandsbild av '+entry.name;img.decoding='async';img.onerror=()=>{img.remove();preview.textContent=LIBRARY_EMOJI[entry.category]||'◼';};preview.append(img);}else preview.textContent=LIBRARY_EMOJI[entry.category]||'◼';
  const name=document.createElement('strong');name.textContent=entry.name;
  const lic=document.createElement('small');lic.textContent=entry.category+' · '+entry.license;
  const dim=document.createElement('span');dim.textContent=`${[entry.width,entry.depth,entry.height].map(n=>n.toLocaleString('sv-SE',{maximumFractionDigits:3})).join(' × ')} m`;
  card.append(preview,name,lic,dim);card.onclick=()=>addPreset(entry.id);list.append(card);
 }
 if(!visible.length){const p=document.createElement('p');p.className='helper';p.textContent='Inga objekt hittades. Prova en annan sökning eller importera en GLB.';list.append(p);}
}
/** Place at the camera's CURRENT location; never jump to the room dropdown's center. */
function findPlacement(entry){
 return findCameraPlacement(entry,target,data.rooms,items.filter(o=>!o.deleted),data,{inside,round,
  validate:(candidate,used,source)=>validate(candidate,used,source,null,{emptyFixed})});
}
async function addPreset(id){
 const entry=LIBRARY_MAP.get(id)||localEntries.find(e=>e.id===id);
 if(!entry){notify('Okänt objekt.');return null;}
 const serial=()=>{let i=1,key;do{key='NY-OBJ-'+String(i++).padStart(4,'0');}while(items.some(o=>o.id===key));return key;};
 const objectId=serial();
 const draft={id:objectId,kind:'prop',assetId:entry.id,assetName:entry.name,source:'added',
  x:round(target.x),z:round(target.z),yaw:0,w:entry.width,d:entry.depth,height:entry.height,
  roomId:roomAt(target.x,target.z)?.id||room};
 if(entry.assetRole)draft.assetRole=entry.assetRole;if(entry.wallFacing)draft.wallFacing=entry.wallFacing;if(entry.modelSize)draft.modelSize=entry.modelSize;
 if(entry.colorable)draft.color=entry.defaultColor||'#f2f3ef';if(entry.collision)draft.collision=entry.collision;
 const support=$('#smartAttach').checked?findSupport(draft,{x:target.x,z:target.z},items,{radius:1.8}):null;
 let item=null;
 if(inferPlacementRole(draft)==='wall'){
  const walls=building?.getEntries()||[],points=[{x:target.x,z:target.z},...walls.filter(w=>w.kind==='wall').map(w=>{const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],t=Math.max(0,Math.min(1,((target.x-w.a[0])*dx+(target.z-w.a[1])*dz)/(dx*dx+dz*dz||1)));return {x:w.a[0]+dx*t,z:w.a[1]+dz*t};}).filter(p=>Math.hypot(p.x-target.x,p.z-target.z)<5).sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z))];
  for(const point of points){const pose=proposeSmartPose(draft,point,items,{walls,floors:data.rooms});if(pose.wallMount){item={...draft,...pose};break;}}
  if(!item){notify('Flytta kameran närmare en hel väggyta där hyllan får plats.');return null;}
 }
 if(!item&&support){
  const mounted={...draft,...support,roomId:roomAt(support.x,support.z)?.id||draft.roomId};
  if(!positionIssue(mounted))item=mounted;
 }
 if(!item){
  const pos=findPlacement(entry);
  if(!pos){notify('Här där du befinner dig finns ingen ledig plats. Flytta vyn till ett rum och försök igen.');return null;}
  item={...draft,x:pos.x,z:pos.z,roomId:pos.roomId};
 }
 const before=snapshot();items.push(item);checkpoint(before);$('#chairsOnly').checked=false;
 syncModels();renderRooms();select(objectId,false);$('#libraryDialog').close();
 notify(entry.name+(item.wallMount?' fästes på väggen.':item.mountId?' fästes automatiskt på möbelytan.':' placerad nära kameran.')+' Dra objektet för att finjustera.');
 return objectId;
}
async function addCustom(file,{place=true}={}){if(!file)return;const entry=await importLocalGLB(file),existing=localEntries.findIndex(x=>x.id===entry.id);
 if(existing<0)localEntries.push(entry);else localEntries[existing]=entry;
 $('#libraryCategory').value='egna';$('#librarySearch').value='';renderLibrary();
 if(!entry.persisted)notify('GLB inläst, men webbläsarlagringen är full. Spara ZIP innan du stänger sidan.');
 // Multi-import adds assets to the personal catalog, never fills the room automatically.
 return place?await addPreset(entry.id):entry.id;
}
async function importCustomBatch(files){
 const list=[...files].filter(file=>/\.glb$/i.test(file.name));
 if(!list.length)throw Error('Välj minst en .glb-fil.');
 if(list.length>20)throw Error('Välj högst 20 GLB-filer åt gången. Dela upp importen.');
 let ok=0,failed=[];
 for(const file of list){try{await addCustom(file,{place:false});ok++;}catch(err){failed.push(file.name+': '+err.message);}}
 $('#libraryCategory').value='egna';renderLibrary();
 const summary=ok+' av '+list.length+' GLB-modeller importerades. Klicka på en modell för att placera den.';
 $('#libraryImportStatus').textContent=summary+(failed.length?' Misslyckades: '+failed.join(' | '):'');
 notify(ok+' modeller i Mina GLB-modeller.'+(failed.length?' '+failed.length+' misslyckades – se detaljer i biblioteket.':''));
 return {ok,failed};
}
async function importCustomZip(file){
 if(!file || !/\.zip$/i.test(file.name))throw Error('Välj en ZIP-fil med .glb-modeller.');
 if(file.size>96*1024*1024)throw Error('ZIP-filen får vara högst 96 MB.');
 const {files,rejected}=await readModelBundleZip(await file.arrayBuffer());
 const batch=files.length?await importCustomBatch(files.map(x=>new File([x.bytes],x.name,{type:'model/gltf-binary'}))):{ok:0,failed:[]};
 const problems=[...rejected,...batch.failed];
 $('#libraryImportStatus').textContent=batch.ok+' av '+(files.length+rejected.length)+' GLB-modeller importerades från ZIP.'+
  (problems.length?' Kunde inte importera: '+problems.join(' | '):'')+
  ' Modellerna stannar i din webbläsare och publiceras inte.';
 if(!files.length)notify('Inga modeller kunde läsas in. Se detaljer i biblioteket.');
}
function setUpEvents(){
 $('#room').onchange=e=>{room=e.target.value;renderList();goToRoom(room);select(null);};
 $('#search').oninput=renderList;$('#chairsOnly').onchange=renderList;
 $('#topView').onclick=()=>view('top');$('#threeView').onclick=()=>view('3d');$('#focus').onclick=()=>goToRoom(room);$('#whole').onclick=whole;
 $('#rotateLeft').onclick=()=>{const o=items.find(x=>x.id===chosen);if(o)mutate(o.id,{yaw:o.yaw-Math.PI/12});};
 $('#rotateRight').onclick=()=>{const o=items.find(x=>x.id===chosen);if(o)mutate(o.id,{yaw:o.yaw+Math.PI/12});};
 for(const k of ['x','z'])$('#'+k).onchange=e=>{const o=items.find(x=>x.id===chosen);if(!o)return;const value=Number(e.target.value);if(Number.isFinite(value))mutate(o.id,{[k]:value});renderProperties();};
 for(const [id,key] of [['tableWidth','w'],['tableDepth','d']])$('#'+id).onchange=e=>{
   const o=items.find(x=>x.id===chosen&&!x.deleted);if(o)changeDimensions(o.id,{[key]:Number(e.target.value)});renderProperties();
 };
 $('#chairRole').onchange=e=>{const o=items.find(x=>x.id===chosen&&!x.deleted);if(o)changeChairRole(o.id,e.target.value);};
 $('#assetRole').onchange=e=>{const o=items.find(x=>x.id===chosen&&!x.deleted);if(o)changeAssetRole(o.id,e.target.value);};
 $('#objectColor').onchange=e=>{const o=items.find(x=>x.id===chosen&&!x.deleted);if(!o||!LIBRARY_MAP.get(o.assetId)?.colorable||!validFurnitureColor(e.target.value))return;const before=snapshot();o.color=e.target.value;checkpoint(before);syncModels();};
 $('#shelfLevel').onchange=e=>{const o=items.find(x=>x.id===chosen&&!x.deleted),parent=o&&items.find(x=>x.id===o.mountId),level=furnitureSurfaces(parent)[Number(e.target.value)];if(!level)return;const before=snapshot();o.mountSurface=level.index;o.elevation=round((parent.elevation||0)+level.y);checkpoint(before);syncModels();};
 $('#duplicate').onclick=createDuplicate;$('#remove').onclick=removeSelection;$('#download').onclick=download;$('#downloadTop').onclick=download;$('#undo').onclick=undo;$('#redo').onclick=redo;
 $('#openLibrary').onclick=()=>{$('#libraryDialog').showModal();renderLibrary();$('#librarySearch').focus();};
 $('#emptyFixed').onclick=()=>{
  if(!window.confirm('Töm hela inredningen i DESIGNSTUDION? Alla ursprungliga möbler tas bort ur skissen och fasta inventarier döljs. Ctrl+Z ångrar. Spelet påverkas inte.'))return;
  const before=snapshot();items=items.map(o=>({...o,deleted:true}));emptyFixed=true;chosen=null;
  setFixedVisibility();checkpoint(before);syncModels();renderList();renderProperties();
  notify('Ytorna är tomma i Designstudion. Alla objekt finns kvar i biblioteket. Ctrl+Z återställer.');
 };
 $('#openPosters').onclick=()=>{building.enable(true);building.setTool('poster');notify('Klicka på en vägg för att placera din affisch. Skriv text eller välj en lokal bild.');};
 $('#closeLibrary').onclick=()=>$('#libraryDialog').close();
 $('#librarySearch').oninput=renderLibrary;$('#libraryCategory').onchange=renderLibrary;
 $('#customGLB').onchange=async e=>{try{const files=[...e.target.files];if(files.length===1)await addCustom(files[0]);else await importCustomBatch(files);}catch(err){$('#libraryImportStatus').textContent=err.message;notify('GLB-import: '+err.message);}finally{e.target.value='';}};
 $('#customZip').onchange=async e=>{try{await importCustomZip(e.target.files?.[0]);}catch(err){$('#libraryImportStatus').textContent=err.message;notify('ZIP-import: '+err.message);}finally{e.target.value='';}};
 const drop=$('#dropZone');drop.addEventListener('dragover',e=>{if([...e.dataTransfer.items].some(x=>x.kind==='file')){e.preventDefault();drop.classList.add('drag-glb');}});drop.addEventListener('dragleave',()=>drop.classList.remove('drag-glb'));
 drop.addEventListener('drop',async e=>{e.preventDefault();drop.classList.remove('drag-glb');const files=[...e.dataTransfer.files];const pack=files.find(f=>/\.zip$/i.test(f.name));const glbs=files.filter(f=>/\.glb$/i.test(f.name));
  try{if(pack)await importCustomZip(pack);else if(glbs.length>1)await importCustomBatch(glbs);else if(glbs.length===1)await addCustom(glbs[0]);}catch(err){$('#libraryImportStatus').textContent=err.message;notify('Modellimport: '+err.message);}});
 $('#reset').onclick=()=>{if(!window.confirm('Återställa ALLA dina ändringar i Möbelstudion? Spelet påverkas inte.'))return;
 const before=snapshot();items=baseline.map(o=>({...o,original:{...o}}));emptyFixed=false;setFixedVisibility();chosen=null;building.reset();checkpoint(before);store();syncModels();renderRooms();renderList();renderProperties();notify('Hela projektet återställt till ursprungsläget. Spelet påverkas inte.');};
 $('#importFile').onchange=async e=>{try{await importFile(e.target.files?.[0]);}catch(err){notify('Kunde inte öppna filen: '+err.message);}finally{e.target.value='';}};
 $canvas.oncontextmenu=e=>e.preventDefault();
 $canvas.addEventListener('pointerdown',e=>{
  if(building?.active)return;
  if(!e.isPrimary&&e.pointerType!=='mouse')return;$canvas.focus();const hit=e.button===0?lookupHit(e):null;
  $canvas.setPointerCapture(e.pointerId);
  if(cameraMode==='3d'&&(e.shiftKey||e.ctrlKey||e.metaKey)&&e.button===0){
    gesture={type:'pan',lastX:e.clientX,lastY:e.clientY};
  }else if(hit){select(hit);const o=items.find(o=>o.id===hit),pt=planePoint(e);
    gesture={type:'drag',id:hit,before:snapshot(),old:{x:o.x,z:o.z,yaw:o.yaw},offsetX:pt?o.x-pt.x:0,offsetZ:pt?o.z-pt.z:0,lastX:e.clientX,lastY:e.clientY};
  }else{gesture={type:e.button===2?'pan':cameraMode==='top'?'pan':'orbit',lastX:e.clientX,lastY:e.clientY};}
  e.preventDefault();
 });
 $canvas.addEventListener('pointermove',e=>{if(building?.active||!gesture)return;const dx=e.clientX-gesture.lastX,dy=e.clientY-gesture.lastY;gesture.lastX=e.clientX;gesture.lastY=e.clientY;
  if(gesture.type==='drag'){
   const pt=planePoint(e);if(!pt)return;
   const snap=$('#snap').checked&&!e.altKey;const x=pt.x+gesture.offsetX,z=pt.z+gesture.offsetZ;
   changePose(gesture.id,{x:snap?round(Math.round(x*10)/10,3):round(x,3),z:snap?round(Math.round(z*10)/10,3):round(z,3)},{quiet:true});
  }else if(gesture.type==='pan')pan(dx,dy);
  else{azimuth-=dx*.008;polar=Math.max(.23,Math.min(1.42,polar+dy*.006));scheduleRender();}
 });
 const end=e=>{if(building?.active||!gesture)return;const g=gesture;gesture=null;
  if(g.type==='drag'){checkpoint(g.before);}
 };
 $canvas.addEventListener('pointerup',end);$canvas.addEventListener('pointercancel',end);
 $canvas.addEventListener('wheel',e=>{e.preventDefault();zoom=Math.max(2.5,Math.min(124,zoom*Math.exp(e.deltaY*.0012)));scheduleRender();},{passive:false});
 document.addEventListener('keydown',e=>{if(building?.active||e.target.closest('input,textarea,select,dialog'))return;
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='d'){e.preventDefault();createDuplicate();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='z'){e.preventDefault();if(e.shiftKey)redo();else undo();return;}
  if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='y'){e.preventDefault();redo();return;}
  const o=items.find(x=>x.id===chosen&&!x.deleted);if(!o)return;
  const k=e.key.toLowerCase(),step=e.shiftKey?.5:.1;
  const change=k==='q'?{yaw:o.yaw-Math.PI/12}:k==='e'?{yaw:o.yaw+Math.PI/12}:
   k==='arrowleft'?{x:o.x-step}:k==='arrowright'?{x:o.x+step}:
   k==='arrowup'?{z:o.z-step}:k==='arrowdown'?{z:o.z+step}:null;
  if(change){e.preventDefault();mutate(o.id,change);return;}
  if(k==='delete'||k==='backspace'){e.preventDefault();removeSelection();}
  if(k==='escape'){select(null);}
 });
 new ResizeObserver(scheduleRender).observe($canvas.parentElement);
}
async function bootstrap(){makeGround();
 building=createBuildMode({data,scene,canvas:$canvas,camera,getZoom:()=>zoom,getView:()=>cameraMode,
  rayAt,planePoint,onPan:pan,onOrbit:(dx,dy)=>{azimuth-=dx*.008;polar=Math.max(.23,Math.min(1.42,polar+dy*.006));scheduleRender();},
  scheduleRender,notify,onChange:()=>{store();renderList();},onGoRoom:id=>{room=id;$('#room').value=id;goToRoom(id);},
  onGoPoint:(x,z)=>{target.set(x,0,z);zoom=Math.min(zoom,7);scheduleRender();},originalWalls:sourceWallMeshes});
 readAutosave();localEntries=await localLibrary();renderRooms();setFixedVisibility();syncModels();setUpEvents();goToRoom('I09');view('top');renderList();renderProperties();renderLibrary();$('#loading').hidden=true;
 window.__furnitureEditor={getState:()=>({version:EDITOR_VERSION,sourceCommit:BASE_COMMIT,gameVersion:GAME_VERSION,objects:items.length,chairs:items.filter(o=>o.kind==='chair'&&!o.deleted).length,
   authored:originalCounts.chair||0,selected:chosen,changed:exportPatch(items,baseline).placements.length+exportPatch(items,baseline).added.length+exportPatch(items,baseline).removed.length,view:cameraMode,gameModuleLoaded:!!globalThis.__fps}),
  select:id=>select(id,true),getPatch:projectPatch,getItem:id=>items.find(o=>o.id===id),build:building,
  renderNow:()=>{resize();renderer.render(scene,camera);},
  screenWorldPoint:(x,z)=>{resize();const r=$canvas.getBoundingClientRect(),p=new T.Vector3(x,.15,z).project(camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},
  catalogCount:LIBRARY.length,addPreset:async id=>addPreset(id),openLibrary:()=>$('#openLibrary').click(),
  roomAt:(x,z)=>roomAt(x,z)?.id||null,
  emptyRooms:()=>{const before=snapshot();items=items.map(o=>({...o,deleted:true}));emptyFixed=true;setFixedVisibility();checkpoint(before);syncModels();return true;},
  getEmptyFixed:()=>emptyFixed,
  screenPoint:id=>{const group=furnitureGroups.get(id);if(!group)return null;const r=$canvas.getBoundingClientRect();const p=group.position.clone().add(new T.Vector3(0,.5,0)).project(camera);return {x:r.left+(p.x+1)*r.width/2,y:r.top+(1-p.y)*r.height/2};},
  move:(id,x,z)=>mutate(id,{x,z}),resize:(id,w,d)=>changeDimensions(id,{w,d}),
  setChairRole:changeChairRole,setAssetRole:changeAssetRole,duplicate:createDuplicate,
  getCameraTarget:()=>({x:target.x,z:target.z}),panForTest:pan,
  rotate:(id,degrees)=>{const o=items.find(o=>o.id===id);return o&&mutate(id,{yaw:o.yaw+degrees*Math.PI/180});}};
}
bootstrap().catch(e=>{console.error(e);$('#loading').textContent='Möbelstudion kunde inte starta: '+e.message;});
