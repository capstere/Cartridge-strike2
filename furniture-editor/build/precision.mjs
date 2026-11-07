/** Deterministic, editor-only precision helpers. Never changes the canonical map. */
import {entryLength,isWall,roundPosition,validateEntry,pointToSegmentDistance} from './architecture.mjs?v=5.8.0';

const distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
const rounded=p=>p.map(roundPosition);
const living=(entries,excludeId)=>entries.filter(e=>!e.deleted&&e.id!==excludeId&&Array.isArray(e.a)&&Array.isArray(e.b));
function closestProjection(p,e){
 const dx=e.b[0]-e.a[0],dz=e.b[1]-e.a[1],den=dx*dx+dz*dz;
 if(den<1e-8)return null;
 const t=Math.max(0,Math.min(1,((p[0]-e.a[0])*dx+(p[1]-e.a[1])*dz)/den));
 return {point:[e.a[0]+dx*t,e.a[1]+dz*t],t};
}
/** Endpoint first; then orthogonal alignment; then wall-axis projection; finally grid.
 * Distance tests use the unrounded pointer, so non-grid source joints remain exact.
 */
export function snapDraftPoint(raw,entries,{start=null,grid=.1,snapToGeometry=true,axisLock=true,excludeId=null,radius=.22}={}){
 if(!Array.isArray(raw)||raw.length!==2||!raw.every(Number.isFinite))return null;
 const base=rounded(raw),list=living(entries,excludeId);
 if(snapToGeometry){
  let best=null,dist=radius;
  for(const e of list)for(const p of [e.a,e.b]){
   const d=distance(raw,p);
   if(d<dist){best=p;dist=d;}
  }
  if(best)return {point:rounded(best),kind:'ände'};
 }
 // For long segments, an accidental shallow angle should not be created by hand jitter.
 let target=[...raw];
 if(axisLock&&start){
  const dx=Math.abs(raw[0]-start[0]),dz=Math.abs(raw[1]-start[1]);
  if(dx<=radius&&dz>=.25)target[0]=start[0];
  else if(dz<=radius&&dx>=.25)target[1]=start[1];
 }
 if(snapToGeometry){
  let projection=null,dist=Math.min(radius,.16);
  for(const e of list.filter(e=>isWall(e.kind))){
   const pr=closestProjection(target,e);
   if(!pr)continue;
   const d=distance(target,pr.point);
   if(d<dist){projection=pr.point;dist=d;}
  }
  if(projection)return {point:rounded(projection),kind:'vägglinje'};
 }
 const p=grid>0?target.map(v=>Math.round(v/grid)*grid):target;
 return {point:rounded(p),kind:axisLock&&start&&(target[0]===start[0]||target[1]===start[1])?'rät vinkel':grid>0?'rutnät':'fri'};
}
/** New wall follows the height of the wall it attaches to, avoiding mismatched tops. */
export function dimensionsFromWall(start,entries,{radius=.24}={}){
 let winner=null,best=radius;
 for(const e of living(entries).filter(e=>isWall(e.kind))){
  const d=pointToSegmentDistance(start,e.a,e.b);
  if(d<best){best=d;winner=e;}
 }
 return winner?{height:winner.height,thickness:winner.thickness,sourceId:winner.id}:null;
}
/** Deliberate quick-fix: connect ONLY near joins. Keep original segment and source data intact. */
export function joinNearbyEnds(entry,entries,{radius=.3}={}){
 if(!entry||!entry.a||!entry.b)return null;
 const candidate={...entry,a:[...entry.a],b:[...entry.b]};
 for(const end of ['a','b']){
  const snapped=snapDraftPoint(candidate[end],entries,{excludeId:entry.id,grid:0,
   snapToGeometry:true,axisLock:false,radius});
  if(snapped && (snapped.kind==='ände'||snapped.kind==='vägglinje'))candidate[end]=snapped.point;
 }
 try {validateEntry(candidate);return candidate;} catch {return null;}
}
/** Explicit straighten button; a/b points are never moved by an invisible background repair. */
export function straightenEntry(entry){
 if(!entry?.a||!entry?.b)return null;
 const dx=Math.abs(entry.b[0]-entry.a[0]),dz=Math.abs(entry.b[1]-entry.a[1]);
 const candidate={...entry,a:[...entry.a],b:rounded(dx>=dz?[entry.b[0],entry.a[1]]:[entry.a[0],entry.b[1]])};
 try {validateEntry(candidate);return candidate;}catch{return null;}
}
