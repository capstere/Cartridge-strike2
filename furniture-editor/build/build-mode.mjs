/** Build mode for the independent Furniture Studio. Uses the same approved map
 * as a READ-ONLY underlay. Never edits live physics, nav, doors or game logic.
 */
import * as THREE from '../../vendor/three/three.module.js';
import {ARCHITECTURE_TYPES,ARCHITECTURE_NAMES,ARCHITECTURE_COLORS,readBaseline,
 cloneEntry,roundPosition,entryLength,validateEntry,validateFloorRect,pointToSegmentDistance,
 exportArchitecture,parseArchitecture,makeEntry,getNextId,doorOnWallSegment,floorRect,wallPieces,warningsForLayout,
 isDoor,isWall,standardPassageSpan,standardDoorMarkerSpan,STANDARD_PASSAGE_WIDTH} from './architecture.mjs?v=5.8.0';
import {snapDraftPoint,dimensionsFromWall,joinNearbyEnds,straightenEntry} from './precision.mjs?v=5.8.0';
import {createRectangleRoom,rectangleFromDimensions} from './rectangle-room.mjs?v=5.8.0';
import {FINISH_COLORS,architecturalFinish,WALL_FINISHES,DOOR_FINISHES} from '../appearance.mjs?v=5.8.0';
import {makePoster,parsePosters,serializePosters,validatePoster,locatePoster,posterId,POSTER_MAX} from './posters.mjs?v=5.7.3';
import {createPosterTexture,compressPosterImage} from './poster-art.mjs';
import {PAINT_KINDS,wallAtPoint,projectToWall,planPaintOverWall} from './paint-over-wall.mjs?v=5.8.0';
import {TREATMENTS_MAX,createCurtain,createBlind,parseTreatments,treatmentPosition,validateTreatment,nextTreatmentId} from './treatments.mjs?v=5.8.0';
const $=id=>document.getElementById(id);
const DIST=1e-5;
const floorKind='floor',roomKind='room-rect',posterKind='poster',paintKind='paint',curtainKind='curtain',blindKind='blind';
const palette={wall:0xc31421,glazed:0x22b14c,window:0x00a2e8,
 door:0x99d9ea,'card-door':0x99d9ea,'elevator-door':0x99d9ea,'terrace-door':0x99d9ea,
 opening:0x899796,frame:0x72888c,curtain:0xf8fbfa,blind:0x41494c,selected:0xffd16a};
const copyFloors=a=>a.map(x=>({...x}));
const cloneAll=a=>a.map(cloneEntry);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
function near(a,b,r){return Math.hypot(a[0]-b[0],a[1]-b[1])<=r;}
function minMax(p){return {minX:Math.min(p.a[0],p.b[0]),maxX:Math.max(p.a[0],p.b[0]),minZ:Math.min(p.a[1],p.b[1]),maxZ:Math.max(p.a[1],p.b[1])};}

export function createBuildMode({data,scene,canvas,camera,getZoom,getView,rayAt,planePoint,onPan,onOrbit,
 scheduleRender,notify,onChange,onGoRoom,onGoPoint,originalWalls}){
 const baseline=readBaseline(data);let entries=cloneAll(baseline),floors=[],posters=[],treatments=[];
 let active=false,selection=null,mode='select',first=null,hover=null,drag=null,paintType='window',overlayDraft=null;
 let history=[],future=[],dirty=false,strokeColor=0,curtainWallId=null;
 const root=new THREE.Group();root.name='architectural-sketch-not-physics';scene.add(root);
 const geo=new THREE.BoxGeometry(1,1,1),sphere=new THREE.SphereGeometry(.13,12,8),materials=new Map();
 const mat=(name)=>{if(materials.has(name))return materials.get(name);
  const [base,finish]=name.split(':');
  const color=finish&&getView()==='3d'&&FINISH_COLORS[finish]?FINISH_COLORS[finish]:(palette[base]??palette.wall);
  const material=new THREE.MeshBasicMaterial({color,transparent:true,opacity:name==='wall'?.48:name==='frame'?.60:.55,depthWrite:false,side:THREE.DoubleSide});
  if(name==='curtain')material.opacity=.36;
  if(name==='blind')material.opacity=.94;
  materials.set(name,material);return material;};
 const selectionMat=new THREE.MeshBasicMaterial({color:palette.selected,depthTest:false});
 const selectLineMat=new THREE.LineBasicMaterial({color:palette.selected,depthTest:false});
 const floorMat=new THREE.MeshBasicMaterial({color:0x79c8bd,transparent:true,opacity:.28,side:THREE.DoubleSide,depthWrite:false});
 const raycaster=new THREE.Raycaster();const points=[],boxInstances=[],posterPick=[],posterCache=new Map(),treatmentPick=[];
 const curtainMat=new THREE.MeshBasicMaterial({color:0xf8fbfa,transparent:true,opacity:.47,depthWrite:false,side:THREE.DoubleSide});
 const blindMat=new THREE.MeshStandardMaterial({color:0x41494c,metalness:.26,roughness:.72,side:THREE.DoubleSide});
 const copyPosters=a=>a.map(x=>({...x}));
 function exportAll(){return {...exportArchitecture(entries,baseline,floors),posters:serializePosters(posters),treatments:treatments.map(x=>({...x})).sort((a,b)=>a.id.localeCompare(b.id))};}
 function posterById(id){return posters.find(p=>p.id===id);}
 function resetPosterCache(){for(const row of posterCache.values()){row.material.map?.dispose();row.material.dispose();}posterCache.clear();}
 function entryById(id){return entries.find(e=>e.id===id)||floors.find(f=>f.id===id)||posterById(id)||treatments.find(t=>t.id===id);}
 function count(){const p=exportAll();return p.edits.length+p.added.length+p.removed.length+p.floors.length+p.posters.length+p.treatments.length;}
 function snapshots(){return {entries:cloneAll(entries),floors:copyFloors(floors),posters:copyPosters(posters),treatments:treatments.map(t=>({...t}))};}
 function capture(){return JSON.stringify(snapshots());}
 function restore(snapshot){const data=typeof snapshot==='string'?JSON.parse(snapshot):snapshot;
  entries=cloneAll(data.entries);floors=copyFloors(data.floors);posters=copyPosters(data.posters||[]);treatments=(data.treatments||[]).map(t=>({...t}));selection=entryById(selection)&&!entryById(selection).deleted?selection:null;
  render();showProperties();renderList();}
 function record(before){if(before===capture())return false;history.push(before);if(history.length>60)history.shift();future=[];
  dirty=true;render();showProperties();renderList();onChange?.();return true;}
 function undo(){if(!history.length)return;future.push(capture());restore(history.pop());onChange?.();notify?.('Ångrade byggändringen.');}
 function redo(){if(!future.length)return;history.push(capture());restore(future.pop());onChange?.();notify?.('Gjorde om byggändringen.');}
 function hasSketch(){return count()>0;}
 function syncVisibility(){const show=active||hasSketch();root.visible=show;
  for(const g of originalWalls)g.visible=!show;
  $('buildToolbar').hidden=!active;$('furnitureSidebar').hidden=active;$('buildSidebar').hidden=!active;
  $('buildLegend').hidden=!active;$('furnitureLegend').hidden=active;
  $('modeFurniture').classList.toggle('active',!active);$('modeBuild').classList.toggle('active',active);
  $('modeFurniture').setAttribute('aria-pressed',String(!active));$('modeBuild').setAttribute('aria-pressed',String(active));
  $('chairsOnly').checked=active?false:$('chairsOnly').checked;
  scheduleRender();}
 function enable(yes){if(active===yes)return;active=yes;selection=null;first=null;hover=null;drag=null;
  $('viewport').style.cursor=active?'crosshair':'auto';
  if(active){$('buildRoom').value=$('room').value;setTool('select');notify?.('Byggläge: välj en vägg eller välj ett ritverktyg. Två klick ritar en ny del.');}
  syncVisibility();render();showProperties();renderList();}
 function setTool(next){if(!['select',...ARCHITECTURE_TYPES,floorKind,roomKind,posterKind,paintKind,curtainKind,blindKind].includes(next))return;
  mode=next;first=null;hover=null;overlayDraft=null;curtainWallId=null;
  $('buildTool').value=next;
  $('buildRoomSettings').hidden=next!==roomKind;
  $('buildPaintSettings').hidden=next!==paintKind;
  $('buildSmartPaint').classList.toggle('active',next===paintKind);
  $('buildRoomCreateExact').disabled=!first;
  for(const b of document.querySelectorAll('[data-build-tool]')){
    const is=b.dataset.buildTool===next;b.classList.toggle('active',is);b.setAttribute('aria-pressed',String(is));}
  $('buildInstructions').textContent=next==='select'?'Klicka för att välja. Dra en ändpunkt för att justera, eller dra mitt på för att flytta hela delen.':
   next==='floor'?'Klicka två hörn för att rita en ny golvrektangel.':
   next===roomKind?'Klicka första och motsatta hörnet i planvyn. Fyra väggar och valfritt golv skapas tillsammans. Eller ange exakta mått efter första klicket.':
   next===posterKind?'Klicka på önskad vägg i PLANVY eller direkt på väggytan i 3D. Därefter kan du ändra text, mått och ladda upp din affischbild.':
   next===paintKind?'Dra direkt längs en befintlig vägg, eller klicka två punkter. Välj Fönster, Glasvägg eller Dörr i samma panel utan att byta verktyg.':
   next===curtainKind?'Dra längs en vägglinje för vit genomskinlig gardin från tak till golv. Du kan också klicka två punkter.':
   next===blindKind?'Klicka på fönsterlinjen. Persiennen får fönstrets bredd automatiskt.':
   `Klicka en startpunkt och därefter en slutpunkt: ${ARCHITECTURE_NAMES[next]}.`;
  render();}
 function smartEnabled(ev){return $('buildSmartSnap').checked&&!ev.altKey;}
 function point(ev,excludeId=null){
  const pt=planePoint(ev);if(!pt)return null;
  const draft=first&&mode!=='select'&&mode!==floorKind&&mode!==roomKind&&mode!==posterKind&&mode!==paintKind&&mode!==curtainKind?first:null;
  const result=snapDraftPoint([pt.x,pt.z],entries,{start:draft,
   excludeId,grid:mode==='select'?0:(($('snap').checked&&!ev.altKey)?0.1:0),
   snapToGeometry:mode!=='select'&&smartEnabled(ev),
   axisLock:$('buildRightAngles').checked&&!ev.altKey&&!!draft});
  if(result && first&&mode===roomKind){
   const w=Math.abs(result.point[0]-first[0]),d=Math.abs(result.point[1]-first[1]);
   $('buildSnapFeedback').textContent='Rum: '+w.toFixed(2)+' × '+d.toFixed(2)+' m · '+$('buildRoomHeight').value+' m högt';
  }else if(result && draft){
   const length=Math.hypot(result.point[0]-draft[0],result.point[1]-draft[1]);
   $('buildSnapFeedback').textContent=result.kind+' · '+length.toFixed(2)+' m · Alt = rita fritt';
  }else if(result && mode!==floorKind){
   $('buildSnapFeedback').textContent=result.kind==='fri'?'Fri placering':result.kind==='rutnät'?'Rutnät 10 cm':'Fäster till '+result.kind;
  }
  return result?.point||null;
 }
 function effectivePaintKind(){return mode===paintKind?paintType:mode;}
 function updatePaintType(kind){
  if(!PAINT_KINDS.includes(kind))return;
  paintType=kind;$('buildPaintKind').value=kind;
  for(const button of document.querySelectorAll('[data-paint-kind]')){
   const selected=button.dataset.paintKind===kind;
   button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  if(mode!==paintKind)setTool(paintKind);
  if(overlayDraft){first=null;hover=null;overlayDraft=null;render();}
  notify?.('SMART RITA: '+(ARCHITECTURE_NAMES[kind]||kind)+' valt. Dra över en vägg eller klicka två punkter.');
 }
 function paintEndpoint(event){
  const pt=planePoint(event);return pt?[pt.x,pt.z]:null;
 }
 function beginOverlay(event,forced=false){
  if(!forced&&!PAINT_KINDS.includes(effectivePaintKind()))return false;
  if(event.altKey&&!forced)return false;
  const p=paintEndpoint(event);if(!p)return false;
  const hit=wallAtPoint(entries,p,{radius:clamp(getZoom()/Math.max(200,canvas.clientHeight)*6,.12,.29)});
  if(!hit){
   if(forced)notify?.('Börja genom att klicka på själva vägglinjen (röd eller grå).');
   return false;
  }
  overlayDraft={wallId:hit.wall.id};
  first=hit.point;hover=hit.point;
  $('buildSnapFeedback').textContent='SMART RITA · '+(ARCHITECTURE_NAMES[effectivePaintKind()]||'Fönster')+' · klicka slutpunkt på samma vägg';
  render();return true;
 }
 function completeOverlay(event){
  if(!overlayDraft)return false;
  const p=paintEndpoint(event);if(!p)return false;
  try{
   if(treatments.some(t=>t.wallId===overlayDraft.wallId))throw Error('Ta bort gardin eller persienn innan du delar den här väggen.');
   const plan=planPaintOverWall(entries,overlayDraft.wallId,first,p,effectivePaintKind(),{posters});
   const before=capture();
   entries=plan.entries;posters=plan.posters;selection=plan.paintedId;
   first=null;hover=null;overlayDraft=null;drag=null;
   record(before);
   notify?.((ARCHITECTURE_NAMES[plan.kind]||'Byggdel')+' klar! '+(plan.full?'Hela väggen ändrad.':'Väggen delades automatiskt utan överlapp.')+' Rita nästa direkt – verktyget är fortfarande aktivt. Ctrl+Z ångrar.');
   return true;
  }catch(error){notify?.(error.message);return false;}
 }
 function addBox(queue,name,id,x,y,z,w,h,d,ang=0){if(w<.001||h<.001||d<.001)return;
  const list=queue.get(name)||[];list.push({id,x,y,z,w,h,d,ang});queue.set(name,list);}
 function addSegmentBox(queue,name,id,e,height,centerY,depthOverride){const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1];
  addBox(queue,name,id,(e.a[0]+e.b[0])/2,centerY,(e.a[1]+e.b[1])/2,
   Math.hypot(dx,dz),height,depthOverride??Math.max(.04,e.thickness),-Math.atan2(dz,dx));}
 function drawEntry(queue,seg,full){const id=seg.id,h=full?seg.height:.38;
  if(seg.kind==='wall'){addSegmentBox(queue,'wall:'+architecturalFinish(seg.kind,seg.finish),id,seg,h,h/2);return;}
  if(seg.kind==='glazed'){
   addSegmentBox(queue,'glazed',id,seg,full?Math.max(.15,h-.18):h,full?h/2:h/2,.035);
   if(full){addSegmentBox(queue,'frame',id,seg,.11,.07,.07);addSegmentBox(queue,'frame',id,seg,.11,seg.height-.07,.07);}
   return;
  }
  if(seg.kind==='window'){
   if(!full){addSegmentBox(queue,'window',id,seg,h,h/2);return;}
   const sill=clamp(seg.sill,.05,seg.height-.15),lintel=.18;
   addSegmentBox(queue,'wall:'+architecturalFinish(seg.kind,seg.finish),id,seg,sill,sill/2);
   addSegmentBox(queue,'window',id,seg,Math.max(.06,seg.height-sill-lintel),
    sill+(seg.height-sill-lintel)/2,.035);
   addSegmentBox(queue,'frame',id,seg,lintel,seg.height-lintel/2,.08);
  }
 }
 function drawTreatments(queue,full){
  for(const decor of treatments){
   const place=treatmentPosition(decor,entries);if(!place)continue;
   const {wall,width,center,angle}=place;
   if(!full){
    addBox(queue,decor.type,decor.id,center[0],.34,center[1],width,.22,.065,angle);
    continue;
   }
   if(decor.type==='curtain'){
    const count=Math.min(36,Math.max(4,Math.round(width/.115))),step=width/count;
    // Semi-translucent vertical panels run from ceiling to just above the floor.
    for(let i=0;i<count;i++){
     const off=-width/2+(i+.5)*step;
     addBox(queue,'curtain',decor.id,center[0]+Math.cos(-angle)*off,wall.height/2,center[1]+Math.sin(-angle)*off,
      Math.min(.055,step*.72),wall.height-.04,.035,angle);
    }
    addBox(queue,'frame',decor.id,center[0],wall.height-.022,center[1],width,.038,.055,angle);
   }else{
    const top=wall.height-.10,bottom=wall.kind==='window'?wall.sill||.9:.15;
    const n=Math.min(28,Math.max(5,Math.round((top-bottom)/.10)));
    for(let i=0;i<n;i++){
     const y=bottom+(i+.5)*(top-bottom)/n;
     addBox(queue,'blind',decor.id,center[0],y,center[1],width*.985,.028,.045,angle);
    }
    addBox(queue,'frame',decor.id,center[0],top,center[1],width,.045,.058,angle);
   }
  }
 }
 function drawDoor(queue,seg,full){const id=seg.id;
  if(!full){const m=seg.kind==='opening'?'opening':seg.kind;addSegmentBox(queue,m,id,standardDoorMarkerSpan(seg),.30,.15,.10);return;}
  const L=entryLength(seg),dx=seg.b[0]-seg.a[0],dz=seg.b[1]-seg.a[1],ux=dx/L,uz=dz/L;
  const w=.075,jh=seg.height/2;
  for(const p of [seg.a,seg.b])addBox(queue,'frame',id,p[0],jh,p[1],w,seg.height,w);
  addSegmentBox(queue,'frame',id,seg,.10,seg.height-.05,.085);
  if(seg.kind!=='opening')addSegmentBox(queue,seg.kind+':'+architecturalFinish(seg.kind,seg.finish),id,seg,seg.height-.22,(seg.height-.22)/2,.035);
 }
 function clear3D(){boxInstances.length=0;points.length=0;posterPick.length=0;treatmentPick.length=0;
  for(const o of [...root.children]){root.remove(o);if(o.isInstancedMesh)o.dispose?.();if(o.geometry&&o.geometry!==geo&&o.geometry!==sphere)o.geometry.dispose();if(o.material&&!materialsHas(o.material)&&o.material!==selectionMat&&o.material!==selectLineMat&&o.material!==floorMat&&o.material!==curtainMat&&o.material!==blindMat)o.material.dispose();}
 }
 function materialsHas(mat){return [...materials.values()].includes(mat)||[...posterCache.values()].some(row=>row.material===mat);}
 function posterMaterial(p){
  const signature=JSON.stringify([p.text,p.subtitle,p.color,p.image,p.width,p.height]);
  const cached=posterCache.get(p.id);if(cached?.signature===signature)return cached.material;
  if(cached){cached.material.map?.dispose();cached.material.dispose();}
  const texture=createPosterTexture(THREE,p,scheduleRender);
  const material=new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide,depthWrite:true});
  posterCache.set(p.id,{signature,material});return material;
 }
 function renderPosters(full){
  for(const p of posters){
   const at=locatePoster(p,entries);if(!at)continue;
   const material=posterMaterial(p);
   if(full){
    const plane=new THREE.Mesh(new THREE.PlaneGeometry(p.width,p.height),material);
    plane.position.set(at.x,p.y,at.z);plane.rotation.y=at.angle;
    plane.renderOrder=5;plane.userData.posterId=p.id;root.add(plane);posterPick.push(plane);
   }else{
    const marker=new THREE.Mesh(sphere,selectionMat);
    marker.position.set(at.x,.43,at.z);marker.scale.setScalar(.48);
    marker.userData.posterId=p.id;root.add(marker);posterPick.push(marker);
   }
  }
 }
 function createTreatmentAt(event){
  const point=paintEndpoint(event);if(!point)return false;
  if(mode===blindKind){
   const hit=wallAtPoint(entries,point,{radius:.32});
   try{const fresh=createBlind(entries,treatments,hit?.wall.id);
    const before=capture();treatments.push(fresh);selection=fresh.id;record(before);
    notify?.('Mörkgrå persienn monterad på fönstret. Rita/klicka nästa utan att byta verktyg.');return true;
   }catch(error){notify?.(error.message);return false;}
  }
  if(mode!==curtainKind)return false;
  if(!first){
   const wall=wallAtPoint(entries,point,{radius:.3});
   if(!wall){notify?.('Börja på en vägg- eller fönsterlinje.');return false;}
   curtainWallId=wall.wall.id;first=wall.point;hover=wall.point;render();
   notify?.('Startpunkt för gardin markerad. Dra eller klicka på slutpunkten längs samma vägg.');
   return true;
  }
  try{
   const fresh=createCurtain(entries,treatments,curtainWallId,first,point);
   const before=capture();treatments.push(fresh);selection=fresh.id;first=null;hover=null;curtainWallId=null;
   record(before);notify?.('Vit genomskinlig tak-till-golv-gardin klar! Fortsätt rita fler linjer.');return true;
  }catch(error){notify?.(error.message);return false;}
 }
 function tryPosterOnWall(event){
  let wall=null,t=.5,side=1;
  if(getView()==='3d'){
   const hits=rayAt(event).intersectObjects(boxInstances,false);
   for(const hit of hits){
    const id=hit.object.userData.ids?.[hit.instanceId],w=entries.find(e=>e.id===id&&!e.deleted&&isWall(e.kind));
    if(!w)continue;
    wall=w;
    const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],L2=dx*dx+dz*dz;
    t=clamp(((hit.point.x-w.a[0])*dx+(hit.point.z-w.a[1])*dz)/L2,0,1);
    const nx=-dz/Math.sqrt(L2),nz=dx/Math.sqrt(L2);
    side=(camera.position.x-(w.a[0]+dx*t))*nx+(camera.position.z-(w.a[1]+dz*t))*nz>=0?1:-1;
    break;
   }
  }else{
   const p=planePoint(event);
   if(!p)return false;
   let best=.55;
   for(const e of entries.filter(e=>!e.deleted&&isWall(e.kind))){
    const d=pointToSegmentDistance([p.x,p.z],e.a,e.b);
    if(d>=best)continue;
    const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],L2=dx*dx+dz*dz;
    wall=e;best=d;t=clamp(((p.x-e.a[0])*dx+(p.z-e.a[1])*dz)/L2,0,1);
   }
  }
  if(!wall){notify?.('Klicka på en röd/grå vägg. Affischer kan inte sitta på en dörr.');return false;}
  try{
   if(posters.length>=POSTER_MAX)throw Error(`Redigerarens resursgräns är ${POSTER_MAX} affischer. Spara en säkerhetskopia.`);
   const poster=makePoster(wall,posters,t,side);
   const before=capture();posters.push(poster);selection=poster.id;
   setTool('select');record(before);
   notify?.('Affisch tillagd på väggen. Ändra värdeordet eller ladda upp en bild till vänster.');
   return true;
  }catch(error){notify?.(error.message);return false;}
 }
 function changePoster(delta){
  const p=posterById(selection);if(!p)return false;
  const next={...p,...delta};try{validatePoster(next,entries);}catch(error){notify?.(error.message);showProperties();return false;}
  const before=capture();Object.assign(p,next);record(before);return true;
 }
 function drawSelection(){if(!selection)return;
  const e=entryById(selection);if(!e||e.deleted)return;
  if(e.type){
   const at=treatmentPosition(e,entries);if(!at)return;
   const marker=new THREE.Mesh(sphere,selectionMat);
   marker.position.set(at.center[0],.55,at.center[1]);marker.scale.setScalar(.75);
   marker.renderOrder=8;root.add(marker);return;
  }
  if(posterById(selection)){
   const at=locatePoster(e,entries);if(!at)return;
   const marker=new THREE.Mesh(sphere,selectionMat);marker.position.set(at.x,.55,at.z);
   marker.scale.setScalar(.7);marker.renderOrder=8;root.add(marker);return;
  }
  if('a' in e){const pos=[e.a,e.b];
   const geometry=new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(e.a[0],.22,e.a[1]),new THREE.Vector3(e.b[0],.22,e.b[1])]);
   const line=new THREE.Line(geometry,selectLineMat);line.renderOrder=5;root.add(line);
   for(const [i,p] of pos.entries()){const c=new THREE.Mesh(sphere,selectionMat);c.position.set(p[0],.25,p[1]);c.renderOrder=6;c.userData.archHandle=i;root.add(c);points.push(c);}
  }else{
   const pts=[[e.x0,e.z0],[e.x1,e.z0],[e.x1,e.z1],[e.x0,e.z1],[e.x0,e.z0]];
   const line=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts.map(p=>new THREE.Vector3(p[0],.16,p[1]))),selectLineMat);line.renderOrder=6;root.add(line);
  }
 }
 function drawFirst(){if(!first)return;
  const endpoint=hover||first;
  const pos=mode===roomKind?
   [[first[0],first[1]],[endpoint[0],first[1]],endpoint,[first[0],endpoint[1]],[first[0],first[1]]]:
   [first,endpoint];
  const preview=new THREE.Line(new THREE.BufferGeometry().setFromPoints(pos.map(p=>new THREE.Vector3(p[0],.20,p[1]))),selectLineMat);
  preview.renderOrder=7;root.add(preview);
 }
 function render(){clear3D();const queue=new Map(),full=getView()==='3d';
  // True plan colours match the annotated map. In 3D, neutral structural walls
  // let furniture and glazing remain readable instead of painting halls red.
  mat('wall').color.setHex(full?0x97a8a8:0xc31421);mat('wall').opacity=full?.44:.48;
  mat('glazed').opacity=full?.34:.65;mat('window').opacity=full?.40:.65;
  // Plan keeps category colors; 3D renders chosen wall/door finishes.
  for(const [name,material] of materials){const [base,finish]=name.split(':');
   if(finish&&FINISH_COLORS[finish])material.color.set(full?FINISH_COLORS[finish]:palette[base]??palette.wall);
  }
  for(const w of wallPieces(entries))drawEntry(queue,w,full);
  for(const d of entries.filter(e=>!e.deleted&&isDoor(e.kind)))drawDoor(queue,d,full);
  drawTreatments(queue,full);
  for(const [name,list] of queue){const im=new THREE.InstancedMesh(geo,mat(name),list.length),tmp=new THREE.Object3D();
   for(let i=0;i<list.length;i++){const b=list[i];tmp.position.set(b.x,b.y,b.z);tmp.rotation.set(0,b.ang,0);
    tmp.scale.set(b.w,b.h,b.d);tmp.updateMatrix();im.setMatrixAt(i,tmp.matrix);}
   im.instanceMatrix.needsUpdate=true;im.userData.ids=list.map(x=>x.id);im.name='architecture-'+name;root.add(im);boxInstances.push(im);
  }
  for(const f of floors){const shape=new THREE.Shape();const p=[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];
   p.forEach(([x,z],i)=>i?shape.lineTo(x,z):shape.moveTo(x,z));shape.closePath();
   const mesh=new THREE.Mesh(new THREE.ShapeGeometry(shape),floorMat);mesh.rotation.x=Math.PI/2;mesh.position.y=-.025;
   mesh.userData.archId=f.id;mesh.name=f.id;root.add(mesh);
  }
  renderPosters(full);drawSelection();drawFirst();syncVisibility();scheduleRender();
 }
 function nearSegment(point,includeFloors=false){const cutoff=clamp(getZoom()/Math.max(200,canvas.clientHeight)*14,.12,.85);let selectedId=null,least=cutoff;
  for(const t of treatments){const at=treatmentPosition(t,entries);
   if(at&&pointToSegmentDistance(point,at.wall.a,at.wall.b)<least&&Math.hypot(at.center[0]-point[0],at.center[1]-point[1])<at.width/2+.12){
    least=pointToSegmentDistance(point,at.wall.a,at.wall.b);selectedId=t.id;
   }
  }
  for(const poster of posters){const at=locatePoster(poster,entries);
   if(at&&Math.hypot(at.x-point[0],at.z-point[1])<least){least=Math.hypot(at.x-point[0],at.z-point[1]);selectedId=poster.id;}}
  for(const e of entries){if(e.deleted)continue;const d=pointToSegmentDistance(point,e.a,e.b);
   if(d<least){least=d;selectedId=e.id;}}
  if(includeFloors)for(const f of floors){if(point[0]>=f.x0&&point[0]<=f.x1&&point[1]>=f.z0&&point[1]<=f.z1&&!selectedId)selectedId=f.id;}
  return selectedId;
 }
 function select(id){selection=id&&entryById(id)&&!entryById(id).deleted?id:null;showProperties();renderList();render();}
 function reportWarnings(){const warn=warningsForLayout(entries,floors,data);$('buildWarnings').textContent=warn.length?warn.join(' '):'Detta är endast ett skissförslag. Verkliga kollisioner och dörrpassager testas först vid spelintegration.';
  $('buildCount').textContent=count()+' byggändringar';}
 function showProperties(){const e=entryById(selection);$('buildNoSelection').hidden=!!e;$('buildSelected').hidden=!e;
  $('buildSelectionId').textContent=e?.id||'Ingen vald';
  const treatment=!!e?.type&&['curtain','blind'].includes(e.type);
  const poster=!!e?.wallId&&!treatment;
  $('posterFields').hidden=!poster;$('treatmentFields').hidden=!treatment;$('buildKindFields').hidden=poster||treatment;
  if(treatment){
   $('buildEndpointFields').hidden=true;$('buildFloorFields').hidden=true;$('buildFinishFields').hidden=true;
   $('treatmentSide').value=String(e.side);
   const place=treatmentPosition(e,entries);
   $('treatmentDescription').textContent=(e.type==='curtain'?'Vit, halvgenomskinlig tak-till-golv-gardin':'Mörkgrå persienn')+
     (place?' · '+place.width.toFixed(2)+' meter bred':'');
   $('buildDelete').textContent='Ta bort tillbehör';
  }else
  if(poster){
   $('buildEndpointFields').hidden=true;$('buildFloorFields').hidden=true;$('buildFinishFields').hidden=true;
   $('posterText').value=e.text;$('posterSubtitle').value=e.subtitle;$('posterColor').value=e.color;
   $('posterWidth').value=e.width;$('posterHeight').value=e.height;$('posterY').value=e.y;
   $('posterT').value=Math.round(e.t*100);$('posterSide').value=String(e.side);
   $('posterRemoveImage').disabled=!e.image;$('buildDelete').textContent='Ta bort affisch';
  }else if(e){$('buildKind').value=e.kind||'floor';const isFloor='x0' in e;$('buildKind').disabled=isFloor;
   $('buildEndpointFields').hidden=isFloor;$('buildFloorFields').hidden=!isFloor;
   const colorable=!isFloor&&e.kind!=='opening';
   $('buildFinishFields').hidden=!colorable;
   if(colorable){const current=architecturalFinish(e.kind,e.finish);
    const allowed=isWall(e.kind)?WALL_FINISHES:DOOR_FINISHES;
    for(const option of $('buildFinish').options)option.disabled=!allowed.includes(option.value);
    $('buildFinish').value=current;
   }
   if(isFloor){$('buildFloorX0').value=e.x0;$('buildFloorZ0').value=e.z0;$('buildFloorX1').value=e.x1;$('buildFloorZ1').value=e.z1;$('buildFloorName').value=e.name;}
   else{$('buildA_X').value=roundPosition(e.a[0]);$('buildA_Z').value=roundPosition(e.a[1]);$('buildB_X').value=roundPosition(e.b[0]);$('buildB_Z').value=roundPosition(e.b[1]);
    $('buildHeight').value=e.height;$('buildThickness').value=e.thickness;$('buildSill').value=e.sill;
    $('buildSillField').hidden=e.kind!=='window';
   }
   $('buildDelete').textContent=e.source?'Ta bort i skissen':'Ta bort byggdelen';
  }
  $('buildUndo').disabled=!history.length;$('buildRedo').disabled=!future.length;
  const wallSelected=!!e&&'a' in e&&isWall(e.kind);
  for(const btn of document.querySelectorAll('[data-quick-kind]'))btn.disabled=!wallSelected;
  $('buildDoorInWall').disabled=!wallSelected;
  const editable=!!e&&'a' in e&&!e.source;
  for(const id of ['buildStraighten','buildJoinEnds','buildMatchHeight'])$(id).disabled=!editable;
  $('buildSimpleHelp').textContent=poster?'Affischen är kopplad till sin vägg. Ändra värdeord, storlek eller välj en lokal bild.':
   e?('Markerad: '+(ARCHITECTURE_NAMES[e.kind]||'Golv')+' · '+e.id+' — välj en åtgärd nedan'):'Välj en vägg eller klicka AFFISCH PÅ VÄGG för att skapa en värdeordsaffisch.';
  reportWarnings();
 }
 function renderList(){const list=$('buildList');list.replaceChildren();const filter=$('buildSearch').value.trim().toLowerCase();
  const roomSelect=data.rooms.find(r=>r.id===$('buildRoom').value);
  const center=roomSelect?[(roomSelect.polygon.reduce((s,p)=>s+p[0],0)/roomSelect.polygon.length),
   (roomSelect.polygon.reduce((s,p)=>s+p[1],0)/roomSelect.polygon.length)]:[0,0];
  let seen=0;const found=[];
  for(const e of [...entries.filter(e=>!e.deleted),...floors,...posters,...treatments]){const id=e.id,label=e.type?(e.type==='curtain'?'Vit gardin':'Mörkgrå persienn'):e.wallId?'Värdeordsaffisch':ARCHITECTURE_NAMES[e.kind]||'Ny golvyta';
   if(filter&&!(id+' '+label).toLowerCase().includes(filter))continue;
   const tr=e.type?treatmentPosition(e,entries):null;
   const at=e.wallId&&!e.type?locatePoster(e,entries):null;
   const x=tr?.center[0]??at?.x??('a' in e?(e.a[0]+e.b[0])/2:(e.x0+e.x1)/2),z=tr?.center[1]??at?.z??('a' in e?(e.a[1]+e.b[1])/2:(e.z0+e.z1)/2);
   found.push({e,label,dist:Math.hypot(x-center[0],z-center[1])});}
  found.sort((a,b)=>(a.e.id===selection?-1:b.e.id===selection?1:0)||a.dist-b.dist||a.e.id.localeCompare(b.e.id));
  for(const {e,label} of found.slice(0,75)){
   const button=document.createElement('button');button.type='button';button.className='build-list-item';button.classList.toggle('active',e.id===selection);
   const swatch=document.createElement('span');swatch.className='arch-swatch';swatch.style.background=ARCHITECTURE_COLORS[e.kind]||'#7ec7b4';
   const name=document.createElement('span');name.textContent=label;const id=document.createElement('small');id.textContent=e.id;
   button.append(swatch,name,id);button.onclick=()=>{setTool('select');select(e.id);const at=e.wallId&&!e.type?locatePoster(e,entries):null;
    const tr=e.type?treatmentPosition(e,entries):null;
    onGoPoint?.(tr?.center[0]??at?.x??('a' in e?(e.a[0]+e.b[0])/2:(e.x0+e.x1)/2),tr?.center[1]??at?.z??('a' in e?(e.a[1]+e.b[1])/2:(e.z0+e.z1)/2));};list.append(button);seen++;
  }
  $('buildListCount').textContent=filter?`${found.length} träffar`: `Visar ${seen} närmaste av ${found.length} delar`;
  $('viewportStatus').textContent=`BYGGLÄGE · ${count()} ändringar i byggskissen · ${found.length} befintliga/nya byggdelar`;
  $('buildUndo').disabled=!history.length;$('buildRedo').disabled=!future.length;
 }
 function changeEntry(id,delta){const e=entryById(id);if(!e)return false;
  const old=capture(),next='a' in e?{...e,...delta,a:[...(delta.a??e.a)],b:[...(delta.b??e.b)]}:{...e,...delta};
  if('a' in e&&delta.kind&&delta.kind!==e.kind&&delta.finish===undefined)
   next.finish=architecturalFinish(delta.kind);
  try{if('a' in e){validateEntry(next);
    for(const p of posters.filter(p=>p.wallId===e.id))validatePoster(p,entries.map(w=>w.id===e.id?next:w));
    for(const t of treatments.filter(t=>t.wallId===e.id))validateTreatment(t,entries.map(w=>w.id===e.id?next:w));
   }else validateFloorRect(next);
  }catch(err){notify?.(err.message);return false;}
  Object.assign(e,next);record(old);return true;
 }
 function quickChange(kind){
  const e=entryById(selection);
  if(!e||!('a' in e)){notify?.('Välj först en vägg eller dörr på kartan.');return false;}
  if(isDoor(e.kind)&&['wall','glazed','window'].includes(kind)){
   notify?.('En dörr är vald. Välj en vägg om du vill ändra till fönster eller glasvägg.');return false;
  }
  if(changeEntry(e.id,{kind})){setTool('select');notify?.('Klart! Väggen är nu '+ARCHITECTURE_NAMES[kind].toLowerCase()+'. Ångra fungerar.');return true;}
  return false;
 }
 function quickDoor(){
  const e=entryById(selection);if(!e||!('a' in e)||!isWall(e.kind)){
   notify?.('Välj först den vägg där dörren ska sitta.');return null;
  }
  let door;
  try{door=doorOnWallSegment(e,getNextId(entries,floors,'door'));}
  catch(error){notify?.(error.message);return null;}
  const before=capture();entries.push(door);selection=door.id;setTool('select');record(before);
  notify?.('STANDARD: 1,20 dörrmarkering, centrerad i väggen. Ändra öppningens faktiska mått i sidopanelen.');
  return door.id;
 }
 function precisionAction(action){
  const e=entryById(selection);
  if(!e||e.source||!('a' in e)){notify?.('Välj en nyritad byggdel först. Originalväggar ändras inte av snabbjustering.');return;}
  if(action==='height'){
   const wall=dimensionsFromWall(e.a,entries.filter(x=>x.id!==e.id))||dimensionsFromWall(e.b,entries.filter(x=>x.id!==e.id));
   if(!wall){notify?.('Ingen närliggande vägg hittades för att matcha höjden.');return;}
   if(changeEntry(e.id,{height:isDoor(e.kind)?Math.min(2.4,wall.height):wall.height,thickness:wall.thickness}))notify?.('Höjd och tjocklek matchade mot '+wall.sourceId+'.');
   return;
  }
  const fixed=action==='straight'?straightenEntry(e):joinNearbyEnds(e,entries);
  if(!fixed){notify?.('Ingen giltig justering kunde göras.');return;}
  if(fixed.a[0]===e.a[0]&&fixed.a[1]===e.a[1]&&fixed.b[0]===e.b[0]&&fixed.b[1]===e.b[1]){
   notify?.('Byggdelen är redan korrekt eller saknar en närliggande anslutning.');return;
  }
  if(changeEntry(e.id,{a:fixed.a,b:fixed.b}))notify?.(action==='straight'?'Byggdelen är nu helt vågrät eller lodrät i planvyn.':'Ändpunkterna har kopplats till närliggande väggar.');
 }
 function removeSelected(){if(!selection)return;const before=capture();const e=entryById(selection);if(!e)return;
  if(e.type)treatments=treatments.filter(x=>x.id!==selection);
  else if(e.wallId)posters=posters.filter(x=>x.id!==selection);
  else if('a' in e){if(e.source)e.deleted=true;else entries=entries.filter(x=>x.id!==selection);
   posters=posters.filter(p=>p.wallId!==e.id);treatments=treatments.filter(p=>p.wallId!==e.id);}
  else floors=floors.filter(x=>x.id!==selection);
  selection=null;record(before);notify?.('Byggdelen är borttagen ur skissen. Spelet ändras inte.');}
 function duplicate(){const e=entryById(selection);if(!e)return;const before=capture();
  if(e.type){
   if(treatments.length>=TREATMENTS_MAX){notify?.(`Redigerarens resursgräns är ${TREATMENTS_MAX} gardiner/persienner. Spara en säkerhetskopia.`);return;}
   const next={...e,id:nextTreatmentId(treatments),side:e.side===1?-1:1};
   try{validateTreatment(next,entries);}catch(error){notify?.(error.message);return;}
   treatments.push(next);selection=next.id;
  }else if(e.wallId){
   if(posters.length>=POSTER_MAX){notify?.(`Redigerarens resursgräns är ${POSTER_MAX} affischer. Spara en säkerhetskopia.`);return;}
   const at=locatePoster(e,entries);if(!at)return;
   const next={...e,id:posterId(posters),t:roundPosition(clamp(e.t+e.width/at.length+.03,0,1))};
   try{validatePoster(next,entries);}catch{notify?.('Det finns inte tillräckligt med väggyta bredvid affischen.');return;}
   posters.push(next);selection=next.id;
  }else if('a' in e){const item=makeEntry(getNextId(entries,floors,e.kind),e.kind,[e.a[0]+.5,e.a[1]+.5],[e.b[0]+.5,e.b[1]+.5]);
   item.height=e.height;item.thickness=e.thickness;item.sill=e.sill;item.finish=e.finish;
   try{validateEntry(item);}catch(error){notify?.(error.message);return;}
   entries.push(item);selection=item.id;
  }else{const item={...e,id:getNextId(entries,floors,'floor'),x0:e.x0+.4,z0:e.z0+.4,x1:e.x1+.4,z1:e.z1+.4};
   try{validateFloorRect(item);}catch(error){notify?.(error.message);return;}
   floors.push(item);selection=item.id;
  }
  record(before);notify?.('Byggdelen duplicerad.');}
 function commitRectangle(start,end){
  const before=capture();
  // Pure generator validates all four walls + floor before any editor state is mutated.
  try{
   const made=createRectangleRoom(entries,floors,start,end,{
    height:Number($('buildRoomHeight').value),thickness:Number($('buildRoomThickness').value),
    withFloor:$('buildRoomFloor').checked,name:$('buildRoomName').value
   });
   entries.push(...made.walls);if(made.floor)floors.push(made.floor);
   selection=made.floor?.id||made.walls[0].id;
   setTool('select');record(before);
   notify?.('Rummet är klart: '+made.width+' × '+made.depth+' m, '+made.height+' m högt. Fyra väggar'+(made.floor?' och golv':'')+'. Ångra tar bort hela rummet.');
   return true;
  }catch(error){notify?.(error.message);render();return false;}
 }
 function choosePoint(ev){
  if(mode===curtainKind||mode===blindKind){createTreatmentAt(ev);return;}
  if(overlayDraft){completeOverlay(ev);return;}
  if(mode===paintKind){beginOverlay(ev,true);return;}
  if(PAINT_KINDS.includes(mode)&&beginOverlay(ev))return;
  const p=point(ev);if(!p)return;
  if(!first){first=p;hover=p;$('buildRoomCreateExact').disabled=mode!==roomKind;render();
   notify?.(mode===roomKind?'Första rumshörnet valt. Klicka diagonalt mittemot, eller välj SKAPA MED EXAKTA MÅTT.':'Startpunkt vald. Klicka nu på slutpunkten. Escape avbryter.');return;}
  const start=first;
  if(mode===roomKind){if(commitRectangle(start,p)){first=null;hover=null;}return;}
  first=null;hover=null;const before=capture();
  try{
   if(mode==='floor'){const f=floorRect(getNextId(entries,floors,'floor'),start,p);validateFloorRect(f);floors.push(f);selection=f.id;}
   else{const span=isDoor(mode)?standardPassageSpan(start,p):{a:start,b:p};
    const e=makeEntry(getNextId(entries,floors,mode),mode,span.a,span.b);
    const neighbor=dimensionsFromWall(start,entries);
    if(neighbor){e.height=isDoor(e.kind)?Math.min(2.4,neighbor.height):neighbor.height;e.thickness=neighbor.thickness;}
    validateEntry(e,{isNew:true});entries.push(e);selection=e.id;}
   setTool('select');record(before);notify?.('Byggdel ritad! Dra dess ändpunkter eller ändra måtten i sidopanelen.');
  }catch(err){notify?.(err.message);render();}
 }
 function handlePointerDown(ev){if(!active||!ev.isPrimary||ev.button===1)return;
  if(ev.button===2||(getView()==='3d'&&(ev.shiftKey||ev.ctrlKey||ev.metaKey)&&ev.button===0)){
   drag={type:'pan',mx:ev.clientX,my:ev.clientY};canvas.setPointerCapture(ev.pointerId);ev.preventDefault();return;
  }
  const p=point(ev);
  if(mode===posterKind){tryPosterOnWall(ev);ev.preventDefault();return;}
  if(mode===blindKind){createTreatmentAt(ev);ev.preventDefault();return;}
  if(mode!=='select'){if(getView()==='3d'){notify?.('Rita nya väggar och öppningar i PLANVY. Byt till 3D-VY för att granska.');return;}
   const startingStroke=mode===paintKind&&!first;
   const startingCurtain=mode===curtainKind&&!first;
   choosePoint(ev);
   if(startingCurtain&&curtainWallId&&first){
    drag={type:'treatment-stroke',mx:ev.clientX,my:ev.clientY,originX:ev.clientX,originY:ev.clientY,moved:false};
    canvas.setPointerCapture(ev.pointerId);
   }
   if(startingStroke&&overlayDraft&&first){
    drag={type:'paint-stroke',mx:ev.clientX,my:ev.clientY,originX:ev.clientX,originY:ev.clientY,moved:false};
    canvas.setPointerCapture(ev.pointerId);
   }
   ev.preventDefault();return;}
  let targetId=null,handle=null;
  if(p&&selection){const current=entryById(selection),radius=clamp(getZoom()/Math.max(200,canvas.clientHeight)*16,.17,.75);
   if(current&&'a' in current){if(near(p,current.a,radius)){targetId=selection;handle='a';}else if(near(p,current.b,radius)){targetId=selection;handle='b';}}
  }
  if(!targetId&&getView()==='3d'){
   const posterHits=rayAt(ev).intersectObjects(posterPick,false);
   if(posterHits.length)targetId=posterHits[0].object.userData.posterId;
  }
  if(!targetId&&getView()==='3d'){
   const intersects=rayAt(ev).intersectObjects(boxInstances,false);
   for(const hit of intersects){const id=hit.object.userData.ids?.[hit.instanceId];if(id){targetId=id;break;}}
  }
  if(!targetId&&p)targetId=nearSegment(p,true);
  if(targetId){if(selection!==targetId)select(targetId);const e=entryById(targetId);
   drag={type:handle||(e.wallId?'pan':('a' in e?'move':'moveFloor')),id:targetId,before:capture(),
    start:p||null,mx:ev.clientX,my:ev.clientY,orig:'a' in e?cloneEntry(e):{...e}};
   canvas.setPointerCapture(ev.pointerId);ev.preventDefault();return;}
  select(null);drag={type:getView()==='top'?'pan':'orbit',mx:ev.clientX,my:ev.clientY};canvas.setPointerCapture(ev.pointerId);
 }
 function handlePointerMove(ev){if(!active)return;
  if(first&&mode!=='select'){
   if(overlayDraft){
    const raw=paintEndpoint(ev),wall=entries.find(e=>e.id===overlayDraft.wallId&&!e.deleted);
    const projection=raw&&wall?projectToWall(raw,wall):null;
    if(projection){hover=projection.point;
     $('buildSnapFeedback').textContent='ÖVER VÄGG · '+(ARCHITECTURE_NAMES[effectivePaintKind()]||'Fönster')+' · '+Math.hypot(hover[0]-first[0],hover[1]-first[1]).toFixed(2)+' m · klicka eller släpp här';
     render();
    }
   }else if(mode===curtainKind&&curtainWallId){
    const p=paintEndpoint(ev),wall=entries.find(x=>x.id===curtainWallId&&!x.deleted);
    if(p&&wall){hover=projectToWall(p,wall)?.point||first;render();}
   }else{const p=point(ev);if(p){hover=p;render();}}
  }
  if(!drag)return;const dx=ev.clientX-drag.mx,dy=ev.clientY-drag.my;drag.mx=ev.clientX;drag.my=ev.clientY;
  if(drag.type==='treatment-stroke'){
   if(Math.hypot(ev.clientX-drag.originX,ev.clientY-drag.originY)>9)drag.moved=true;
   return;
  }
  if(drag.type==='paint-stroke'){
   if(Math.hypot(ev.clientX-drag.originX,ev.clientY-drag.originY)>9)drag.moved=true;
   return;
  }
  if(drag.type==='pan'){onPan(dx,dy);return;}
  if(drag.type==='orbit'){onOrbit(dx,dy);return;}
  const p=point(ev,drag.id);if(!p||!drag.start)return;
  const e=entryById(drag.id);if(!e)return;
  const off=[p[0]-drag.start[0],p[1]-drag.start[1]];
  const next='a' in e?{...drag.orig,a:[...drag.orig.a],b:[...drag.orig.b]}:{...drag.orig};
  if(drag.type==='a'||drag.type==='b'){
   const dest=[drag.orig[drag.type][0]+off[0],drag.orig[drag.type][1]+off[1]];
   next[drag.type]=snapDraftPoint(dest,entries,{excludeId:drag.id,grid:($('snap').checked&&!ev.altKey)?0.1:0,
    snapToGeometry:smartEnabled(ev),axisLock:false})?.point||dest;
  }
  else if(drag.type==='move'){next.a=[drag.orig.a[0]+off[0],drag.orig.a[1]+off[1]];next.b=[drag.orig.b[0]+off[0],drag.orig.b[1]+off[1]];}
  else if(drag.type==='moveFloor'){next.x0+=off[0];next.z0+=off[1];next.x1+=off[0];next.z1+=off[1];}
  try{if('a' in e){validateEntry(next);
    for(const poster of posters.filter(p=>p.wallId===e.id))validatePoster(poster,entries.map(w=>w.id===e.id?next:w));
    for(const t of treatments.filter(t=>t.wallId===e.id))validateTreatment(t,entries.map(w=>w.id===e.id?next:w));
   }else validateFloorRect(next);
  }catch{return;}
  Object.assign(e,next);render();showProperties();
 }
 function handlePointerEnd(ev){if(!active||!drag)return;const previous=drag.before;const was=drag.type;const painted=drag.type==='paint-stroke'&&drag.moved,curtained=drag.type==='treatment-stroke'&&drag.moved;drag=null;
  if(painted)completeOverlay(ev);
  if(curtained)createTreatmentAt(ev);
  if(['a','b','move','moveFloor'].includes(was))record(previous);
 }
 function bind(){
  const picker=$('buildRoom');picker.replaceChildren();for(const r of data.rooms.filter(r=>r.status==='included')){const opt=document.createElement('option');opt.value=r.id;opt.textContent=r.name+' · '+r.id;picker.append(opt);}picker.value='I09';
  picker.onchange=e=>{onGoRoom?.(e.target.value);renderList();};
  $('modeFurniture').onclick=()=>enable(false);$('modeBuild').onclick=()=>enable(true);
  $('buildTool').onchange=e=>setTool(e.target.value);
  $('buildSmartPaint').onclick=()=>setTool(paintKind);
  $('buildPaintKind').onchange=e=>updatePaintType(e.target.value);
  for(const button of document.querySelectorAll('[data-paint-kind]'))button.onclick=()=>updatePaintType(button.dataset.paintKind);
  for(const button of document.querySelectorAll('[data-paint-kind]')){
   const selected=button.dataset.paintKind===paintType;
   button.classList.toggle('active',selected);button.setAttribute('aria-pressed',String(selected));
  }
  for(const btn of document.querySelectorAll('[data-quick-kind]'))btn.onclick=()=>quickChange(btn.dataset.quickKind);
  $('buildDoorInWall').onclick=quickDoor;
  $('buildStraighten').onclick=()=>precisionAction('straight');
  $('buildJoinEnds').onclick=()=>precisionAction('join');
  $('buildMatchHeight').onclick=()=>precisionAction('height');
  $('buildRoomCreateExact').onclick=()=>{
   if(mode!==roomKind||!first){notify?.('Välj RUM och klicka ett första hörn på kartan.');return;}
   try{const end=rectangleFromDimensions(first,$('buildRoomWidth').value,$('buildRoomDepth').value);
    if(commitRectangle(first,end)){first=null;hover=null;}
   }catch(error){notify?.(error.message);}
  };
  for(const id of ['buildRoomHeight','buildRoomThickness'])$(id).onchange=()=>{if(first)render();};
  for(const id of ['buildSmartSnap','buildRightAngles'])$(id).onchange=()=>{if(first)render();};
  document.querySelectorAll('[data-build-tool]').forEach(button=>{button.onclick=()=>setTool(button.dataset.buildTool);});
  $('buildSearch').oninput=renderList;
  $('buildKind').onchange=e=>{const s=entryById(selection);if(s&&'a' in s)changeEntry(s.id,{kind:e.target.value});};
  $('buildFinish').onchange=e=>{const s=entryById(selection);if(s&&'a' in s)changeEntry(s.id,{finish:e.target.value});};
  for(const [id,key] of [['posterText','text'],['posterSubtitle','subtitle'],['posterColor','color']]){
   $(id).onchange=e=>changePoster({[key]:e.target.value});
  }
  for(const [id,key] of [['posterWidth','width'],['posterHeight','height'],['posterY','y']]){
   $(id).onchange=e=>{const value=Number(e.target.value);
    if(Number.isFinite(value))changePoster({[key]:value});showProperties();};
  }
  $('posterT').onchange=e=>{const value=Number(e.target.value);
   if(Number.isFinite(value))changePoster({t:roundPosition(value/100)});showProperties();};
  $('posterSide').onchange=e=>{changePoster({side:Number(e.target.value)});showProperties();};
  $('posterImage').onchange=async e=>{
   const id=selection,p=posterById(id),file=e.target.files?.[0];e.target.value='';
   if(!p||!file)return;
   try{
    const image=await compressPosterImage(file);
    if(selection!==id||!posterById(id))throw Error('Affischen har ändrats. Välj den igen.');
    changePoster({image});notify?.('Affischbilden är komprimerad och sparas i JSON/ZIP-projektet.');
   }catch(err){notify?.('Bildimport: '+err.message);}
  };
  $('posterRemoveImage').onclick=()=>{if(changePoster({image:''}))notify?.('Textaffischen visas igen.');};
  $('treatmentSide').onchange=e=>{const current=treatments.find(t=>t.id===selection);
   if(!current)return;const before=capture();current.side=Number(e.target.value);record(before);};
  const kmap={buildA_X:['a',0],buildA_Z:['a',1],buildB_X:['b',0],buildB_Z:['b',1]};
  for(const [id,[end,index]] of Object.entries(kmap))$(id).onchange=e=>{const s=entryById(selection);if(!s||!('a' in s))return;
   const value=Number(e.target.value),p=[...s[end]];p[index]=value;if(!Number.isFinite(value))return;
   changeEntry(s.id,{[end]:p});showProperties();};
  for(const [id,key] of [['buildHeight','height'],['buildThickness','thickness'],['buildSill','sill']])$(id).onchange=e=>{
   const s=entryById(selection);if(!s||!('a' in s))return;const value=Number(e.target.value);
   if(Number.isFinite(value))changeEntry(s.id,{[key]:value});showProperties();};
  for(const [id,key] of [['buildFloorX0','x0'],['buildFloorZ0','z0'],['buildFloorX1','x1'],['buildFloorZ1','z1'],['buildFloorName','name']])$(id).onchange=e=>{
   const s=entryById(selection);if(!s||!('x0' in s))return;const value=key==='name'?e.target.value:Number(e.target.value);
   if(key==='name'||Number.isFinite(value))changeEntry(s.id,{[key]:value});showProperties();};
  $('buildDelete').onclick=removeSelected;$('buildDuplicate').onclick=duplicate;
  $('buildUndo').onclick=undo;$('buildRedo').onclick=redo;
  $('buildReset').onclick=()=>{if(!confirm('Återställa alla vägg-/dörr-/golv-/affischändringar i skissen? Möblerna påverkas inte.'))return;
   const before=capture();entries=cloneAll(baseline);floors=[];posters=[];treatments=[];resetPosterCache();selection=null;record(before);notify?.('Byggskissen återställd. Originalspelet har aldrig ändrats.');};
  canvas.addEventListener('pointerdown',handlePointerDown);
  canvas.addEventListener('pointermove',handlePointerMove);
  canvas.addEventListener('pointerup',handlePointerEnd);canvas.addEventListener('pointercancel',handlePointerEnd);
  document.addEventListener('keydown',ev=>{if(!active||ev.target.closest('input,select,textarea,dialog'))return;
   if((ev.ctrlKey||ev.metaKey)&&(ev.key.toLowerCase()==='z'||ev.key.toLowerCase()==='y')){
    ev.preventDefault();if(ev.key.toLowerCase()==='y'||ev.shiftKey)redo();else undo();return;}
   if((ev.ctrlKey||ev.metaKey)&&ev.key.toLowerCase()==='d'){ev.preventDefault();duplicate();return;}
   if(ev.key==='Escape'){if(first){first=null;hover=null;overlayDraft=null;curtainWallId=null;render();notify?.('Ritningen avbruten.');}else select(null);return;}
   if(ev.key==='Delete'||ev.key==='Backspace'){ev.preventDefault();removeSelected();return;}
   const e=entryById(selection);if(!e)return;
   const step=ev.shiftKey?.5:.1;const pos=ev.key==='ArrowLeft'?[-step,0]:ev.key==='ArrowRight'?[step,0]:
    ev.key==='ArrowUp'?[0,-step]:ev.key==='ArrowDown'?[0,step]:null;
   if(pos){if(e.type||e.wallId)return;ev.preventDefault();if('a' in e)changeEntry(e.id,{a:[e.a[0]+pos[0],e.a[1]+pos[1]],b:[e.b[0]+pos[0],e.b[1]+pos[1]]});
    else changeEntry(e.id,{x0:e.x0+pos[0],x1:e.x1+pos[0],z0:e.z0+pos[1],z1:e.z1+pos[1]});}
  });
 }
 function load(patch){const read=parseArchitecture(patch,baseline),loadedPosters=parsePosters(patch?.posters,read.entries),loadedTreatments=parseTreatments(patch?.treatments,read.entries);
  entries=read.entries;floors=read.floors;posters=loadedPosters;treatments=loadedTreatments;resetPosterCache();history=[];future=[];
  selection=null;first=null;hover=null;overlayDraft=null;curtainWallId=null;dirty=hasSketch();render();showProperties();renderList();}
 function resetWithoutConfirm(){entries=cloneAll(baseline);floors=[];posters=[];treatments=[];resetPosterCache();history=[];future=[];selection=null;render();showProperties();renderList();}
 bind();render();showProperties();renderList();syncVisibility();
 return {get active(){return active;},enable,getBaseline:()=>cloneAll(baseline),getEntries:()=>cloneAll(entries),getFloors:()=>copyFloors(floors),
  export:exportAll,load,reset:resetWithoutConfirm,hasSketch,posters:()=>copyPosters(posters),treatments:()=>treatments.map(t=>({...t})),
  drawCurtain:(wallId,start,end)=>{const created=createCurtain(entries,treatments,wallId,start,end);const before=capture();treatments.push(created);selection=created.id;record(before);return created.id;},
  attachBlind:(wallId)=>{const created=createBlind(entries,treatments,wallId);const before=capture();treatments.push(created);selection=created.id;record(before);return created.id;},
  addPoster:(wallId,options)=>{const wall=entries.find(e=>e.id===wallId);const poster=makePoster(wall,posters,.5,1,options);const before=capture();posters.push(poster);selection=poster.id;record(before);return poster.id;},
  updatePoster:(id,delta)=>{selection=id;return changePoster(delta);},
  setView:()=>render(),select,setTool,setPaintType:updatePaintType,
  paintWall:(wallId,start,end,kind=paintType)=>{if(treatments.some(t=>t.wallId===wallId))throw Error('Ta bort tillbehöret innan du delar väggen.');
   const plan=planPaintOverWall(entries,wallId,start,end,kind,{posters});const before=capture();
   entries=plan.entries;posters=plan.posters;selection=plan.paintedId;record(before);return plan;},
  undo,redo,count,quickChange,quickDoor,
  createRectangle:(a,b,options)=>{
   const before=capture(),made=createRectangleRoom(entries,floors,a,b,options);
   entries.push(...made.walls);if(made.floor)floors.push(made.floor);selection=made.floor?.id||made.walls[0].id;
   record(before);return made;
  },
  getSelected:()=>selection,getTool:()=>mode,getDrawingState:()=>({mode,paintType,overlayWallId:overlayDraft?.wallId||null,first:first?[...first]:null,selected:selection}),
  testCreate:(kind,a,b)=>{const before=capture();const e=makeEntry(getNextId(entries,floors,kind),kind,a,b);validateEntry(e);entries.push(e);selection=e.id;record(before);return e.id;},
  testChange:(id,delta)=>changeEntry(id,delta)};
}
