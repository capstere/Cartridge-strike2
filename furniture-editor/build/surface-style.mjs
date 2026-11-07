import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
import {sealWindowBands} from './wall-joints.mjs?v=5.7.0';
/** Optional schema-2 appearance overrides. Geometry and original materials stay unchanged. */
import {FINISH_COLORS,architecturalFinish} from '../appearance.mjs?v=5.8.0';
import {floorBaseColor,WALL_PATTERNS} from './pattern-presets.mjs?v=5.6.0';
export const validPaint=value=>typeof value==='string'&&/^#[0-9a-f]{6}$/i.test(value);
export function surfaceColor(project,item){return project.surfaceColors?.[item.id]||
 (item.kind?FINISH_COLORS[architecturalFinish(item.kind,item.finish)]:floorBaseColor(project.floorFinishes?.[item.id]||item.surface));}
export function validateSurfaceColors(project,ids){
 if(project.surfaceColors===undefined)return;
 const colors=project.surfaceColors;
 if(!colors||typeof colors!=='object'||Array.isArray(colors)||Object.keys(colors).length>AUTHORING_LIMITS.surfaceOverrides)throw Error('Ogiltiga ytfärger.');
 for(const [id,color] of Object.entries(colors))if(!ids.has(id)||!validPaint(color))throw Error('Ogiltig ytfärg eller okänd byggdel: '+id);
}
export function validateSurfaceMaterials(project,wallIds){
 if(project.surfaceMaterials===undefined)return;
 const v=project.surfaceMaterials;
 if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).length>AUTHORING_LIMITS.surfaceOverrides)throw Error('Ogiltiga väggmaterial.');
 for(const [id,pattern] of Object.entries(v))if(!wallIds.has(id)||!WALL_PATTERNS.includes(pattern))throw Error('Okänt väggmaterial eller vägg: '+id);
}
/** The same source records feed studio preview and the FPS renderer. */
export function paintDescription(description,data){
 // The door cutter leaves 0.015 clearance on each side. Cover that clearance
 // above the jamb only; use the backing wall's plane, depth, height and paint.
 // A 0.0001 depth bias prevents coplanar internal end faces producing hairlines.
 // Custom projects only: canonical Floor 5 collision/geometry stays untouched.
 if(data.__custom)for(const door of data.doors){
  const header=description.boxes.find(b=>b.id===door.id+'-lintel');if(!header)continue;
  const dx=door.b[0]-door.a[0],dz=door.b[1]-door.a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
  const candidates=data.walls.filter(w=>w.surfaceType==='opaque'&&Math.abs((w.b[0]-w.a[0])*uz-(w.b[1]-w.a[1])*ux)<.01&&
   [w.a,w.b].some(p=>Math.hypot(p[0]-door.a[0],p[1]-door.a[1])<.18||Math.hypot(p[0]-door.b[0],p[1]-door.b[1])<.18));
  const wall=candidates.sort((a,b)=>Math.abs((a.a[0]-door.a[0])*uz-(a.a[1]-door.a[1])*ux)-Math.abs((b.a[0]-door.a[0])*uz-(b.a[1]-door.a[1])*ux))[0];
  if(!description.boxes.some(b=>b.id===door.id+'-head-jamb'))description.boxes.push({...header,id:door.id+'-head-jamb',y:2.2875,h:.045,w:len+.065,d:.065,color:[.4,.41,.4]});
  if(wall){const offset=(wall.a[0]-door.a[0])*(-uz)+(wall.a[1]-door.a[1])*ux;
   // Source apertures can end before their neighboring solids (D26: .133/.028).
   // Span the measured joining ends above the door, not just the cutter margin.
   const ends=candidates.flatMap(w=>[w.a,w.b]).map(p=>(p[0]-door.a[0])*ux+(p[1]-door.a[1])*uz);
   const left=ends.filter(t=>t<=.001&&t>=-.18),right=ends.filter(t=>t>=len-.001&&t<=len+.18);
   const lo=Math.min(-.015,left.length?Math.max(...left):0)-.002,hi=Math.max(len+.015,right.length?Math.min(...right):len)+.002;
   header.x=door.a[0]+ux*(lo+hi)/2-uz*offset;header.z=door.a[1]+uz*(lo+hi)/2+ux*offset;header.d=wall.thickness+.0001;header.w=hi-lo;
   header.h=Math.max(.001,wall.height-2.29);header.y=2.29+header.h/2;
   if(wall.studioColor)header.studioColor=wall.studioColor;
   if(wall.studioPattern)header.studioPattern=wall.studioPattern;
  }
 }
 for(const wall of data.walls)if(wall.studioColor)for(const box of description.boxes){
  if((box.id===wall.id||box.id.startsWith(wall.id+'-'))&&!['glass','frosted','blue-graphic'].includes(box.material)&&!box.id.endsWith('-skirt'))box.studioColor=wall.studioColor;
 }
 for(const wall of data.walls)if(wall.studioPattern)for(const box of description.boxes){
  if((box.id===wall.id||box.id.startsWith(wall.id+'-'))&&!['glass','frosted','blue-graphic'].includes(box.material)&&!box.id.endsWith('-skirt'))box.studioPattern=wall.studioPattern;
 }
 for(const zone of [...data.rooms,...data.corridors])if(zone.studioColor){const surface=description.surfaces.find(s=>s.id==='finish-'+zone.id);if(surface)surface.studioColor=zone.studioColor;}
 for(const door of data.doors)if(door.studioColor)for(const box of description.boxes)if(box.id===door.id+'-leaf'||box.id===door.id+'-sealed-leaf')box.studioColor=door.studioColor;
 return sealWindowBands(description,data);
}
/** Carry a wall's paint to surviving pieces when a door splits its span. */
/** Carry user paint and tile selections across wall splits and strip dead IDs. */
export function reconcileSurfaceColors(project,previous,entries,oldEntries,floors){
 if(!project.surfaceColors&&!project.surfaceMaterials)return;
 const oldIds=new Set(oldEntries.map(e=>e.id));
 const contains=(outer,inner)=>inner.a&&inner.b&&[inner.a,inner.b].every(([x,z])=>{
  const dx=outer.b[0]-outer.a[0],dz=outer.b[1]-outer.a[1],len2=dx*dx+dz*dz,t=((x-outer.a[0])*dx+(z-outer.a[1])*dz)/len2;
  return len2>0&&t>=-1e-5&&t<=1+1e-5&&Math.abs((x-outer.a[0])*dz-(z-outer.a[1])*dx)<1e-5*Math.sqrt(len2);
 });
 for(const key of ['surfaceColors','surfaceMaterials']){
  const layer=project[key];if(!layer)continue;
  for(const e of entries)if(!oldIds.has(e.id)&&!layer[e.id]){
   const parent=oldEntries.find(old=>old.kind===e.kind&&previous[key]?.[old.id]&&old.a&&contains(old,e));
   if(parent)layer[e.id]=previous[key][parent.id];
  }
  const ids=new Set((key==='surfaceMaterials'?entries.filter(e=>e.kind==='wall'):[...entries,...floors]).map(e=>e.id));
  for(const id of Object.keys(layer))if(!ids.has(id))delete layer[id];
 }
}
