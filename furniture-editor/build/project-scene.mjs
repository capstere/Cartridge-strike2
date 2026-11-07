import {applyFloorEdits} from './floor-edge.mjs?v=5.7.3';
import {closedAreas,cabinExclusions} from './walkable-spaces.mjs?v=5.8.0';
/** Resolve editable geometry once for the studio, collision export and FPS adapter. */
import '../../src/floor5-data.js';
import '../../src/world.js?v=5.5.0';
import {createFurnishings} from '../../src/fps/furnishings.mjs';
import {catalog,inside,distanceSegment,EDITABLE_KINDS,exportPatch,isChanged} from '../core.mjs?v=5.8.0';
import {readBaseline,parseArchitecture,exportArchitecture,wallPieces,isDoor} from './architecture.mjs?v=5.8.0';

/** Shared walls may overlap after adjacent rooms are drawn. A fitted window
 * replaces every underlying solid span, just as a door cuts every wall layer. */
export function projectWallPieces(entries,{glazingClearance=0}={}){
 const live=entries.filter(e=>!e.deleted),doors=live.filter(e=>isDoor(e.kind)),glazing=live.filter(e=>['window','glazed'].includes(e.kind));
 // A window replaces a wall; it is not a loose door leaf. The old 0.015
 // door allowance exposed full-height slits beside its sill and header.
 // Keep real door clearance unchanged, including when a door crosses glass.
 const solids=live.filter(e=>e.kind==='wall');
 const opaque=glazingClearance===.015
  ?wallPieces([...solids,...doors,...glazing.map(e=>({...e,kind:'opening'}))])
  :wallPieces([...wallPieces([...solids,...doors]),...glazing.map(e=>({...e,kind:'opening'}))],{clearance:glazingClearance});
 const pieces=[...opaque,...wallPieces([...glazing,...doors])],seen=new Set();
 return pieces.filter(e=>{const points=[e.a,e.b].map(p=>p.map(n=>Math.round(n*10000)/10000).join(',')).sort();
  const key=[e.kind,...points,e.height,e.thickness,e.sill].join('|');if(seen.has(key))return false;seen.add(key);return true;});
}

let baseline;
export function floor5Baseline(){
 if(baseline)return baseline;
 const source=globalThis.SpelWorld,data=source.data;
 const description=source.build({doors:Object.fromEntries(data.doors.filter(d=>d.accessCardConfirmed).map(d=>[d.id,true]))});
 const furnishings=createFurnishings(data,description,{inside,distanceSegment});
 baseline={data,entries:readBaseline(data),items:catalog(data,furnishings),description,furnishings};
 return baseline;
}
const rectangle=f=>({...f,polygon:[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]]});
export function resolveProjectScene(project){
 const finish=f=>project.floorFinishes?.[f.id]?{...f,surface:project.floorFinishes[f.id]}:f;
 if(project.mode==='new-level')return {entries:project.architecture.added,items:project.furniture.added,
  floors:project.ground.floors.map(rectangle).map(finish),fixed:[],baselineEntries:[],baselineItems:[]};
 const base=floor5Baseline(),patch=project.furniture;
 const overrides=new Map(patch.placements.map(o=>[o.id,o])),removed=new Set(patch.removed);
 const items=base.items.filter(o=>!removed.has(o.id)).map(o=>({...o,...overrides.get(o.id),original:{...o}}));
 items.push(...structuredClone(patch.added));
 const entries=parseArchitecture(project.architecture,base.entries).entries.filter(e=>!e.deleted);
 const opened=new Set(project.ground.openedAreas||[]),closed=closedAreas(base.data);
 const zones=[...base.data.rooms.map(r=>({...r,role:'room'})),...base.data.corridors.map(r=>({...r,role:'corridor'}))]
  .filter(r=>r.status!=='uncertain').map(r=>({...r,source:true,surface:['I01','I02','I03','I04','I29'].includes(r.id)?'vinyl':'carpet',
   x0:Math.min(...r.polygon.map(p=>p[0])),x1:Math.max(...r.polygon.map(p=>p[0])),z0:Math.min(...r.polygon.map(p=>p[1])),z1:Math.max(...r.polygon.map(p=>p[1]))}));
 zones.push(...closed.filter(r=>opened.has(r.id)).map(r=>({...r,source:true,role:'room',status:'included',surface:'carpet',x0:Math.min(...r.polygon.map(p=>p[0])),x1:Math.max(...r.polygon.map(p=>p[0])),z0:Math.min(...r.polygon.map(p=>p[1])),z1:Math.max(...r.polygon.map(p=>p[1]))})));
 const extra=project.architecture.floors.filter(f=>!project.ground.floors.some(g=>g.id===f.id)).map(f=>({...f,role:'room',surface:'carpet'}));
 const fixed=project.legacyPatch?.emptyFixed?[]:base.data.obstacles.filter(o=>!EDITABLE_KINDS[o.kind]&&o.kind!=='uncertain-area');

 return {entries,items,closed:cabinExclusions(closed.filter(r=>!opened.has(r.id)),project.gameplay?.startElevators,project.ground.floors),floors:[...applyFloorEdits(zones,project.ground.floorEdits).map(finish),...project.ground.floors.map(rectangle).map(finish),...extra.map(rectangle).map(finish)],fixed,
  baselineEntries:base.entries,baselineItems:base.items};
}
export function writeProjectScene(project,scene){
 if(project.mode==='new-level')return project;
 const previous=project.architecture;
 const present=new Set(scene.entries.map(e=>e.id));
 const all=[...scene.entries,...scene.baselineEntries.filter(e=>!present.has(e.id)).map(e=>({...e,deleted:true}))];
 project.architecture={...previous,...exportArchitecture(all,scene.baselineEntries,previous.floors),posters:previous.posters||[],treatments:previous.treatments||[]};
 const patch=exportPatch(scene.items,scene.baselineItems);
 // Level-project overrides preserve the complete authored pose, including mounts.
 const originals=new Map(scene.baselineItems.map(o=>[o.id,o]));
 patch.placements=scene.items.filter(o=>{const b=originals.get(o.id);return b&&(isChanged(o,b)||['height','collision','mountId','elevation','mirrored','wallRoll','wallFacing','wallMount'].some(k=>o[k]!==b[k]));})
  .map(({original,source,...o})=>o);
 patch.added=scene.items.filter(o=>!originals.has(o.id)).map(({original,source,...o})=>o);
 project.furniture={placements:patch.placements,added:patch.added,removed:patch.removed};
 project.legacyPatch={...project.legacyPatch,...patch,emptyFixed:project.legacyPatch?.emptyFixed===true,architecture:project.architecture};
 return project;
}
