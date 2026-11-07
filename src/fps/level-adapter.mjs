/** Pure conversion into the existing world/physics/navigation data contract. */
import {remainingSourceTiles,thresholdFloorPolygons} from '../../furniture-editor/build/floor-edge.mjs?v=5.7.3';
import {parseProject} from '../../furniture-editor/build/level-project.mjs?v=5.9.0';
import {wallPieces} from '../../furniture-editor/build/architecture.mjs?v=5.8.0';
import {corners} from '../../furniture-editor/core.mjs?v=5.8.0';
import {resolveProjectScene,floor5Baseline,projectWallPieces} from '../../furniture-editor/build/project-scene.mjs?v=5.8.0';

import {cabinExclusions} from '../../furniture-editor/build/walkable-spaces.mjs?v=5.8.0';

const polygon=r=>[[r.x0,r.z0],[r.x1,r.z0],[r.x1,r.z1],[r.x0,r.z1]];
const point=p=>({x:p.x,y:0,z:p.z,yaw:p.yaw||0});
const doorKind=k=>['door','card-door','elevator-door','terrace-door'].includes(k);
export function sceneArchitectureData(project,scene){
 const {floors,entries}=scene;
 const zones=floors.map(f=>({id:f.id,name:f.name,status:'included',surface:f.surface,studioColor:project.surfaceColors?.[f.id],polygon:f.polygon||polygon(f)}));
 const doors=entries.filter(e=>doorKind(e.kind)||e.kind==='opening').map(e=>({
  id:e.id,doorStyle:e.doorStyle,studioColor:project.surfaceColors?.[e.id],name:e.id,a:e.a,b:e.b,center:[(e.a[0]+e.b[0])/2,(e.a[1]+e.b[1])/2],
  width:Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]),kind:e.kind==='opening'?'open-passage-no-leaf':'door-aperture',
  status:'included',accessCardConfirmed:e.kind==='card-door',blocked:!!e.originallyBlocked&&!project.architecture.edits.some(row=>row.id===e.id),
  passageOpenConfirmed:e.kind==='opening',height:e.height,doorType:e.kind==='card-door'?'card':e.kind==='elevator-door'?'elevator':e.kind==='terrace-door'?'terrace':'ordinary',
  removed:false,lockedUntilImplemented:['elevator-door','terrace-door'].includes(e.kind)
 }));
 const wallIds=new Map();
 const walls=projectWallPieces(entries.map(e=>({...e,source:false}))).map(e=>({id:`${e.id}-${wallIds.set(e.id,(wallIds.get(e.id)||0)+1).get(e.id)}`,sourceId:e.id,studioColor:project.surfaceColors?.[e.id],studioPattern:e.kind==='wall'?project.surfaceMaterials?.[e.id]:undefined,a:e.a,b:e.b,height:e.height,thickness:e.thickness,sill:e.sill,
  glazingStyle:e.kind==='glazed'?e.glazingStyle:undefined,surfaceType:e.kind==='glazed'||e.kind==='window'?e.kind:'opaque'}));
 return {zones,doors,walls};
}
export function levelProjectToWorldData(input){
 const project=parseProject(input);
 const scene=resolveProjectScene(project),floors=scene.floors,entries=scene.entries;
 const legacy=project.mode==='edit-floor5'?floor5Baseline().data:null;
 const {zones,doors,walls}=sceneArchitectureData(project,scene);
 const cabins=project.gameplay.startElevators||[];
 for(const cfg of cabins){
  const door=doors.find(d=>d.id===cfg.doorId);
  if(!door||door.doorType!=='elevator'||!floors.some(f=>f.id===cfg.floorId)||!floors.some(f=>f.id===cfg.lobbyId))
   throw Error('Startkabinens dörr, golv eller hisshall saknas.');
  door.startElevator=true;door.lockedUntilImplemented=false;
 }
 const obstacles=[...scene.fixed,...scene.items.map(o=>({id:o.id,name:o.assetName||o.kind,
  polygon:corners(o),x:o.x,z:o.z,w:o.w,d:o.d,elevation:o.elevation||0,height:o.height,kind:o.kind,roomId:o.roomId,yaw:o.yaw,collision:o.collision||'solid',studioVisual:true}))];
 const hints=project.navHints.length?project.navHints:doors.filter(d=>!d.blocked).map(d=>{
  const dx=d.b[0]-d.a[0],dz=d.b[1]-d.a[1],n=Math.hypot(dx,dz),x=d.center[0],z=d.center[1];
  return {id:'NH-'+d.id,points:[[x-dz/n*.7,z+dx/n*.7],[x,z],[x+dz/n*.7,z-dx/n*.7]]};
 });
 const routes=[...(legacy?.routes||[]),...hints.map(h=>({id:h.id,name:h.note||h.id,role:'passage',doorIds:[],segments:[{points:h.points,status:'included'}]}))];
 const g=project.gameplay,objectives=g.objectives;
 const anchors={analysts:g.spawns.filter(s=>s.team==='analysts').sort((a,b)=>a.index-b.index).map(point),
  counterAnalysts:g.spawns.filter(s=>s.team==='counterAnalysts').sort((a,b)=>a.index-b.index).map(point),
  bomb:objectives.bomb?{...point(objectives.bomb),radius:objectives.bomb.radius??1.1,roomId:objectives.bomb.roomId}:null,
  rescue:objectives.rescue?{...point(objectives.rescue),radius:objectives.rescue.radius??1.65,doorId:objectives.rescue.doorId}:null,
  hostages:objectives.hostages.map(point)};
 const data={__custom:true,shellOnly:project.mode==='edit-floor5'&&project.legacyPatch?.emptyFixed===true,rooms:zones.filter((_,i)=>floors[i].role==='room'),corridors:zones.filter((_,i)=>floors[i].role==='corridor'),
  excludedRooms:cabinExclusions((legacy?.excludedRooms||[]).filter(r=>!(project.ground.openedAreas||[]).includes(r.id)),cabins,floors),floorPolygons:[...(legacy?remainingSourceTiles(legacy,project.ground.floorEdits):[]),...zones.map(z=>z.polygon),...thresholdFloorPolygons(entries,floors)],walls,doors,obstacles,routes,
  targets:[objectives.bomb&&{id:'L1',name:'Bomb',point:[objectives.bomb.x,objectives.bomb.z]},objectives.rescue&&{id:'L2',name:'Rescue',point:[objectives.rescue.x,objectives.rescue.z]}].filter(Boolean),
  spawn:anchors.analysts[0]||{x:0,z:0,yaw:0},layoutPresentation:{},ground:project.ground};
 return {data,anchors,project,scene};
}
