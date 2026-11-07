import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Atomic design-only paint-over operation: no live FPS geometry is modified.
 * Paint an opening, glass wall or window over part of an existing wall,
 * replacing the painted span rather than overlapping solid geometry.
 */
import {isWall,isDoor,makeEntry,getNextId,validateEntry,roundPosition,entryLength,pointToSegmentDistance,cloneEntry,STANDARD_PASSAGE_WIDTH,WC_PASSAGE_WIDTH,WC_MIN_PASSAGE_WIDTH} from './architecture.mjs?v=5.8.0';
import {architecturalFinish} from '../appearance.mjs?v=5.8.0';
import {validatePoster} from './posters.mjs?v=5.7.3';

export const PAINT_KINDS=Object.freeze(['window','glazed','wall','door','card-door','opening']);
const roundPoint=p=>p.map(roundPosition);
const along=(e,t)=>roundPoint([e.a[0]+(e.b[0]-e.a[0])*t,e.a[1]+(e.b[1]-e.a[1])*t]);
export function projectToWall(point,wall){
 if(!Array.isArray(point)||!point.every(Number.isFinite)||!wall?.a||!wall?.b)return null;
 const vx=wall.b[0]-wall.a[0],vz=wall.b[1]-wall.a[1],len2=vx*vx+vz*vz;
 if(len2<.0625)return null;
 const t=Math.min(1,Math.max(0,((point[0]-wall.a[0])*vx+(point[1]-wall.a[1])*vz)/len2));
 const projected=along(wall,t);
 return {point:projected,t,distance:Math.hypot(point[0]-projected[0],point[1]-projected[1]),length:Math.sqrt(len2)};
}
export function wallAtPoint(entries,point,{radius=.25}={}){
 let winner=null,best=radius;
 for(const wall of entries){
  if(wall.deleted||!isWall(wall.kind))continue;
  const projected=projectToWall(point,wall);
  if(projected?.distance<best){winner={wall,...projected};best=projected.distance;}
 }
 return winner;
}
/** Returns replacement entries + poster re-anchoring without mutating any argument.
 * Throws before making changes on ambiguous/short spans, attached posters or existing doors.
 */
export function planPaintOverWall(entries,wallId,start,end,kind,{posters=[],doorWidth=STANDARD_PASSAGE_WIDTH}={}){
 if(!PAINT_KINDS.includes(kind))throw Error('Välj fönster, glasvägg, vägg eller dörr i Smart ritning.');
 const wall=entries.find(e=>e.id===wallId&&!e.deleted&&isWall(e.kind));
 if(!wall)throw Error('Starta på en befintlig vägglinje.');
 const a=projectToWall(start,wall),b=projectToWall(end,wall);
 if(!a||!b||a.distance>.28||b.distance>.28)throw Error('Rita från och till samma vägglinje. Försök närmare väggen.');
 const length=entryLength(wall);
 let left=Math.min(a.t,b.t)*length,right=Math.max(a.t,b.t)*length;
 if(isDoor(kind)){
  // Smart paint uses the pointer gesture to POSITION a standard opening,
  // not to arbitrarily stretch its width. Short walls cannot silently
  // generate narrower door markers or 10-cm uneditable wall slivers.
  const width=kind==='door'?doorWidth:STANDARD_PASSAGE_WIDTH,center=(left+right)/2;
  if(!Number.isFinite(width)||width<(width===WC_PASSAGE_WIDTH?WC_MIN_PASSAGE_WIDTH:1.10)||width>8)throw Error('Ogiltig dörrbredd.');
  if(length<width-1e-6)throw Error(width===STANDARD_PASSAGE_WIDTH?'Väggen är kortare än STANDARD-öppningen 1,20.':'Väggen är kortare än WC-öppningen 0,85.');
  if(length<width+.5-1e-6){
   if(Math.abs(length-width)>.001)throw Error(width===STANDARD_PASSAGE_WIDTH?'För STANDARD 1,20 behövs minst 25 cm vägg på varje sida.':'För WC-dörr 0,85 behövs minst 25 cm vägg på varje sida.');
   left=0;right=length;
  }else{
   left=Math.max(.25,Math.min(length-.25-width,center-width/2));
   right=left+width;
  }
 }
 // Absorb tiny < 25 cm edge slivers; never create short uneditable fragments.
 if(left<.25)left=0;
 if(length-right<.25)right=length;
 if(right-left<.25)throw Error('Den målade delen måste vara minst 25 cm. Dra lite längre.');
 if(kind===wall.kind)throw Error('Det här avsnittet är redan '+(kind==='window'?'ett fönster':kind==='glazed'?'en glasvägg':'en sådan vägg')+'.');
 // Existing doors on a wall must not be silently overwritten.
 const startPoint=along(wall,left/length),endPoint=along(wall,right/length);
 for(const door of entries.filter(e=>!e.deleted&&isDoor(e.kind)&&e.id!==wall.id)){
  const center=[(door.a[0]+door.b[0])/2,(door.a[1]+door.b[1])/2];
  if(pointToSegmentDistance(center,startPoint,endPoint)<.16){
   throw Error('Det finns redan en dörr/öppning här. Välj en annan del av väggen.');
  }
 }
 const pieces=[];
 function part(type,p0,p1){
  const entry=makeEntry(getNextId([...entries,...pieces],[],type),type,p0,p1);
  entry.height=isDoor(type)?Math.min(wall.height,2.4):wall.height;
  entry.thickness=wall.thickness;
  entry.sill=Math.min(wall.sill,entry.height-.16);
  entry.finish=architecturalFinish(type,type===wall.kind?wall.finish:undefined);
  validateEntry(entry,{isNew:true});pieces.push(entry);return entry;
 }
 const full=left===0&&right===length;
 let updated,paintedId,parts;
 if(full){
  updated=entries.map(e=>e.id===wallId?{...cloneEntry(e),kind,finish:architecturalFinish(kind)}:e);
  paintedId=wallId;parts=[{entry:updated.find(e=>e.id===wallId),lo:0,hi:length}];
  validateEntry(parts[0].entry);
 }else{
  if(left>=.25)part(wall.kind,[...wall.a],startPoint);
  const middle=part(kind,startPoint,endPoint);
  paintedId=middle.id;
  if(length-right>=.25)part(wall.kind,endPoint,[...wall.b]);
  updated=entries.filter(e=>e.id!==wallId||e.source).map(e=>e.id===wallId?{...cloneEntry(e),deleted:true}:e);
  updated.push(...pieces);
  parts=pieces.map(e=>{const x=projectToWall(e.a,wall),y=projectToWall(e.b,wall);return {entry:e,lo:x.t*length,hi:y.t*length};});
  if(updated.filter(e=>!e.source&&!e.deleted).length>AUTHORING_LIMITS.buildingParts)throw Error(`Redigerarens resursgräns är ${AUTHORING_LIMITS.buildingParts} nya byggdelar. Spara en säkerhetskopia innan du fortsätter.`);
 }
 const nextPosters=posters.map(p=>{
  if(p.wallId!==wallId)return {...p};
  if(full){
   if(isDoor(kind))throw Error('Flytta affischen innan du gör hela väggen till en dörr.');
   validatePoster(p,updated);return {...p};
  }
  const center=p.t*length;
  // A poster must remain wholly on a single non-door segment.
  const holder=parts.find(part=>!isDoor(part.entry.kind)&&center-p.width/2>=part.lo+.03&&center+p.width/2<=part.hi-.03);
  if(!holder)throw Error('En affisch sitter över den nya skarven. Flytta affischen först.');
  const span=holder.hi-holder.lo;
  const reassigned={...p,wallId:holder.entry.id,t:roundPosition((center-holder.lo)/span)};
  validatePoster(reassigned,updated);
  return reassigned;
 });
 return {entries:updated,posters:nextPosters,paintedId,wallId,kind,full,span:[startPoint,endPoint],pieces:full?[]:pieces};
}
