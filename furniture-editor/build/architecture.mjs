import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Pure, read-only source of architectural design proposals for Cartridge Strike.
 * The canonical map, collision, door ownership and navigation are NEVER mutated.
 * The edits returned by exportArchitecture are user-authored proposals only.
 */
import {architecturalFinish,WALL_FINISHES,DOOR_FINISHES} from '../appearance.mjs?v=5.8.0';
export const ARCHITECTURE_SCHEMA=1;
export const STANDARD_PASSAGE_WIDTH=1.20;
export const WC_PASSAGE_WIDTH=.85;
export const WC_MIN_PASSAGE_WIDTH=.65;
export const minDoorWidth=entry=>entry?.doorStyle==='wc'?WC_MIN_PASSAGE_WIDTH:1.10;
export function standardPassageSpan(a,b,width=STANDARD_PASSAGE_WIDTH,{minWidth=1.10}={}){
 const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz);
 if(!Number.isFinite(len)||len<.20)throw Error('Ange två olika punkter för öppningens riktning.');
 if(!Number.isFinite(width)||width<minWidth||width>8)throw Error('Passagens bredd måste vara '+minWidth.toFixed(2).replace('.',',')+'–8,00 modellenheter.');
 const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,ux=dx/len,uz=dz/len;
 return {a:[roundPosition(cx-ux*width/2),roundPosition(cz-uz*width/2)],
         b:[roundPosition(cx+ux*width/2),roundPosition(cz+uz*width/2)]};
}
/** Consistent 1.20-unit visual glyph, independent of the actual source-door
 * width. Do not use this for collision, serialization or wall clipping. */
export function standardDoorMarkerSpan(door){
 const {a,b}=door||{},dx=b?.[0]-a?.[0],dz=b?.[1]-a?.[1],len=Math.hypot(dx,dz);
 if(!Number.isFinite(len)||len<1e-6||door?.doorStyle==='wc')return {a,b};
 const cx=(a[0]+b[0])/2,cz=(a[1]+b[1])/2,ux=dx/len,uz=dz/len;
 return {a:[cx-ux*STANDARD_PASSAGE_WIDTH/2,cz-uz*STANDARD_PASSAGE_WIDTH/2],
         b:[cx+ux*STANDARD_PASSAGE_WIDTH/2,cz+uz*STANDARD_PASSAGE_WIDTH/2]};
}
export const ARCHITECTURE_TYPES=Object.freeze(['wall','glazed','window','door','card-door','elevator-door','terrace-door','opening']);
export const ARCHITECTURE_NAMES=Object.freeze({
 wall:'Vägg',glazed:'Fönstervägg · golv till tak',window:'Fönster med bröstning',
 door:'Vanlig dörr','card-door':'Passerkortsdörr','elevator-door':'Hissdörr',
 'terrace-door':'Terrassdörr',opening:'Öppen passage'
});
export const ARCHITECTURE_COLORS=Object.freeze({wall:'#c31421',glazed:'#22b14c',window:'#00a2e8',
 door:'#99d9ea','card-door':'#99d9ea','elevator-door':'#99d9ea','terrace-door':'#99d9ea',opening:'#9aa6a6'});
const ROUND=1e3;
const finite=v=>typeof v==='number'&&Number.isFinite(v);
export const roundPosition=n=>Math.round((n+Number.EPSILON)*ROUND)/ROUND;
export const isDoor=kind=>['door','card-door','elevator-door','terrace-door','opening'].includes(kind);
export const isWall=kind=>['wall','glazed','window'].includes(kind);
export function pointToSegmentDistance(p,a,b){
 const dx=b[0]-a[0],dz=b[1]-a[1],den=dx*dx+dz*dz||1;
 const t=Math.min(1,Math.max(0,((p[0]-a[0])*dx+(p[1]-a[1])*dz)/den));
 return Math.hypot(p[0]-a[0]-t*dx,p[1]-a[1]-t*dz);
}
export function entryLength(e){return Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1]);}
export function cloneEntry(e){return {...e,a:[...e.a],b:[...e.b]};}
export function readBaseline(data){
 if(!data?.walls||!data?.doors)throw Error('Spelplanens väggar och dörrar saknas.');
 const result=[];
 for(const w of data.walls){
  const kind=w.surfaceType==='glazed'?'glazed':w.surfaceType==='window'?'window':'wall';
  result.push({id:w.id,source:true,sourceKind:'wall',kind,a:[...w.a],b:[...w.b],
   height:w.height||2.85,thickness:w.thickness||.1,sill:.9,finish:'white'});
 }
 for(const d of data.doors){
  let kind='door';
  if(d.kind?.startsWith('open-passage'))kind='opening';
  else if(d.doorType==='elevator'||['D01','D02','D03'].includes(d.id))kind='elevator-door';
  else if(d.doorType==='terrace'||d.id==='D01T')kind='terrace-door';
  else if(d.accessCardConfirmed||d.doorType==='access-card')kind='card-door';
  result.push({id:d.id,source:true,sourceKind:'door',kind,a:[...d.a],b:[...d.b],
   height:d.height||2.4,thickness:.09,sill:.9,finish:architecturalFinish(kind),originallyBlocked:!!d.blocked});
 }
 const keys=new Set();for(const e of result){if(keys.has(e.id))throw Error('Dubbelt arkitektur-ID '+e.id);keys.add(e.id);}
 return result;
}
export function validateEntry(entry,{isNew=false}={}){
 if(!entry||typeof entry!=='object'||!ARCHITECTURE_TYPES.includes(entry.kind))throw Error('Okänd byggdel eller typ.');
 if(typeof entry.id!=='string'||entry.id.length>100||(isNew&&!/^BYGG-(V|D)-\d{1,5}$/.test(entry.id)))throw Error('Ogiltigt byggdels-ID.');
 if(!Array.isArray(entry.a)||!Array.isArray(entry.b)||entry.a.length!==2||entry.b.length!==2||
  ![...entry.a,...entry.b].every(v=>finite(v)&&Math.abs(v)<=100))throw Error('Ogiltiga koordinater.');
 const len=entryLength(entry);
 if(len<(entry.source?.008:.25)||len>100)throw Error('Byggdelen måste vara 0,25–100 modellenheter lång.');
 if(!finite(entry.height)||entry.height<.45||entry.height>6)throw Error('Byggdelens höjd måste vara 0,45–6 m.');
 if(!finite(entry.thickness)||entry.thickness<.025||entry.thickness>.7)throw Error('Väggtjockleken måste vara 0,025–0,70 m.');
 if(!finite(entry.sill)||entry.sill<0||entry.sill>entry.height-.15)throw Error('Fönsterbröstningen är inte giltig.');
 if(entry.doorStyle!==undefined&&(!['door','card-door'].includes(entry.kind)||!['solid','frosted','wc','office'].includes(entry.doorStyle)))throw Error('Välj vanlig dörr eller frostad glasdörr.');
 if(entry.glazingStyle!==undefined&&(entry.kind!=='glazed'||!['standard','office-band'].includes(entry.glazingStyle)))throw Error('Välj standardglas eller kontorsglas med frostat band.');
 if(entry.doorStyle==='wc'&&entryLength(entry)<WC_MIN_PASSAGE_WIDTH-1e-6)throw Error('WC-dörren måste vara minst 0,65 modellenheter bred.');
 if(entry.finish!==undefined&&
   !((isWall(entry.kind)?WALL_FINISHES:DOOR_FINISHES).includes(entry.finish)))
  throw Error('Färgvalet passar inte byggdelen.');
 return true;
}
export function validateFloorRect(e){
 if(!e||typeof e.id!=='string'||!/^BYGG-G-\d{1,5}$/.test(e.id)||
  ![e.x0,e.z0,e.x1,e.z1].every(x=>finite(x)&&Math.abs(x)<=100)||
  e.x1-e.x0<.5||e.z1-e.z0<.5||e.x1-e.x0>100||e.z1-e.z0>100)
  throw Error('Golvet måste vara minst 0,5 och högst 100 modellenheter åt varje håll, inom kartan.');
 if(typeof e.name!=='string'||e.name.length>60)throw Error('Ogiltigt golvnamn.');
 return true;
}
const eq=(a,b)=>Math.abs(a-b)<.0001;
export function entryChanged(e,original){
 return (e.doorStyle||'solid')!==(original.doorStyle||'solid')||(e.glazingStyle||'standard')!==(original.glazingStyle||'standard')||e.kind!==original.kind||architecturalFinish(e.kind,e.finish)!==architecturalFinish(original.kind,original.finish)||!eq(e.height,original.height)||!eq(e.thickness,original.thickness)||!eq(e.sill,original.sill)||
  [...e.a,...e.b].some((v,i)=>!eq(v,[...original.a,...original.b][i]));
}
// Preserve measured source-floor geometry. A style-only edit must not round or move its doorway.
export const serializeEntry=e=>({id:e.id,kind:e.kind,a:e.a.map(Number),b:e.b.map(Number),
 height:roundPosition(e.height),thickness:roundPosition(e.thickness),sill:roundPosition(e.sill),finish:architecturalFinish(e.kind,e.finish),...(e.doorStyle?{doorStyle:e.doorStyle}:{}),...(e.glazingStyle?{glazingStyle:e.glazingStyle}:{})});
export function exportArchitecture(entries,baseline,floorRects=[]){
 const source=new Map(baseline.map(e=>[e.id,e])),edits=[],added=[],removed=[];
 for(const e of entries){const orig=source.get(e.id);if(e.deleted){if(orig)removed.push(e.id);continue;}
  if(orig){if(entryChanged(e,orig))edits.push(serializeEntry(e));}
  else added.push(serializeEntry(e));
 }
 const sort=(a,b)=>a.id.localeCompare(b.id);
 return {schemaVersion:ARCHITECTURE_SCHEMA,edits:edits.sort(sort),added:added.sort(sort),removed:removed.sort(),
  floors:floorRects.map(e=>({id:e.id,name:e.name,x0:roundPosition(e.x0),z0:roundPosition(e.z0),x1:roundPosition(e.x1),z1:roundPosition(e.z1)})).sort(sort)};
}
export function parseArchitecture(patch,baseline){
 const items=baseline.map(cloneEntry),floors=[];
 if(patch===undefined||patch===null)return {entries:items,floors}; // older Furniture Studio JSON is valid
 if(!patch||typeof patch!=='object'||Array.isArray(patch)||patch.schemaVersion!==ARCHITECTURE_SCHEMA||
  !Array.isArray(patch.edits)||!Array.isArray(patch.added)||!Array.isArray(patch.removed)||!Array.isArray(patch.floors))
  throw Error('Arkitekturdelen i projektet har ett okänt format.');
 if(patch.edits.length>AUTHORING_LIMITS.sourceChanges||patch.added.length>AUTHORING_LIMITS.buildingParts||patch.removed.length>AUTHORING_LIMITS.sourceChanges||patch.floors.length>AUTHORING_LIMITS.floors)
  throw Error('Byggprojektet överskrider redigerarens resursgräns. Spara en säkerhetskopia; originalet ska inte rensas.');
 const byId=new Map(items.map(x=>[x.id,x]));const seen=new Set();
 for(const [list,newObject] of [[patch.edits,false],[patch.added,true]])for(const e of list){
  validateEntry(e,{isNew:newObject});if(seen.has(e.id))throw Error('Dubbelt ändrad byggdel.');seen.add(e.id);
  if(newObject){if(byId.has(e.id))throw Error('En ny byggdel har ett befintligt ID.');
   const out={...serializeEntry(e),source:false,sourceKind:'new'};items.push(out);byId.set(out.id,out);
  }else{const orig=byId.get(e.id);if(!orig)throw Error('Ändringen pekar på en okänd vägg eller dörr.');
   Object.assign(orig,serializeEntry(e));}
 }
 for(const id of patch.removed){if(typeof id!=='string'||seen.has(id)||!byId.has(id)||!byId.get(id).source)throw Error('Ogiltig borttagen vägg/dörr.');
  seen.add(id);byId.get(id).deleted=true;}
 for(const e of patch.floors){validateFloorRect(e);if(seen.has(e.id)||byId.has(e.id))throw Error('Dubbelt golv-ID.');seen.add(e.id);floors.push({...e});}
 return {entries:items,floors};
}
export function getNextId(entries,floors,kind){const prefix=kind==='floor'?'BYGG-G-':isDoor(kind)?'BYGG-D-':'BYGG-V-';
 const used=new Set([...entries.map(x=>x.id),...floors.map(x=>x.id)]);let n=1;
 while(used.has(prefix+String(n).padStart(4,'0'))&&n<99999)n++;
 return prefix+String(n).padStart(4,'0');
}
export function makeEntry(id,kind,a,b){return {id,source:false,sourceKind:'new',kind,a:[...a],b:[...b],
 height:isDoor(kind)?2.4:2.85,thickness:isDoor(kind)?.09:.11,sill:.9,finish:architecturalFinish(kind)};}
/** Place a correctly aligned default door in a selected straight wall.
 * This is a sketch aperture only; runtime door mechanics stay unchanged.
 */
export function doorOnWallSegment(wall,id,{kind='door',width=STANDARD_PASSAGE_WIDTH,fraction=.5,doorStyle='solid'}={}){
 if(!isWall(wall.kind))throw Error('Välj först en vägg eller glasvägg.');
 const length=entryLength(wall),minEnds=.12;
 if(!Number.isFinite(width)||width<(doorStyle==='wc'?WC_MIN_PASSAGE_WIDTH:1.1)||width>8)throw Error('Dörrens bredd är för liten för den valda dörrtypen.');
 // Never silently shrink a standard door to fit: that creates inconsistent
 // door markers and openings. The user can draw a longer wall instead.
 if(length+1e-9<width+2*minEnds)throw Error('Väggen är för kort för en STANDARD-dörr på 1,20. Rita en längre vägg.');
 const along=Math.max(width/2+minEnds,Math.min(length-width/2-minEnds,length*fraction));
 const dx=(wall.b[0]-wall.a[0])/length,dz=(wall.b[1]-wall.a[1])/length;
 const point=t=>[roundPosition(wall.a[0]+t*dx),roundPosition(wall.a[1]+t*dz)];
 const door=makeEntry(id,kind,point(along-width/2),point(along+width/2));
 door.height=Math.min(2.4,wall.height);if(doorStyle!=='solid')door.doorStyle=doorStyle;validateEntry(door,{isNew:true});return door;
}
export function floorRect(id,a,b){return {id,x0:Math.min(a[0],b[0]),z0:Math.min(a[1],b[1]),x1:Math.max(a[0],b[0]),z1:Math.max(a[1],b[1]),name:'Egen golvyta'};}
/**
 * Split wall-like segments at collinear door / passage spans to display real
 * openings in the *proposal preview*. This does NOT alter source-wall collision.
 * Only parallel, almost collinear doors can cut; perpendicular crossing cannot.
 */
export function wallPieces(entries,{clearance=.015}={}){
 const active=entries.filter(x=>!x.deleted),doorSpans=active.filter(x=>isDoor(x.kind));const output=[];
 for(const wall of active.filter(x=>isWall(x.kind))){
  const len=entryLength(wall),ux=(wall.b[0]-wall.a[0])/len,uz=(wall.b[1]-wall.a[1])/len;
  const clips=[];
  for(const d of doorSpans){const length=entryLength(d),vx=(d.b[0]-d.a[0])/length,vz=(d.b[1]-d.a[1])/length;
   if(Math.abs(ux*vz-uz*vx)>.035)continue;
   const dist=p=>Math.abs((p[0]-wall.a[0])*uz-(p[1]-wall.a[1])*ux);
   if(Math.max(dist(d.a),dist(d.b))>Math.max(wall.thickness/2+.045,.12))continue;
   const t0=(d.a[0]-wall.a[0])*ux+(d.a[1]-wall.a[1])*uz;
   const t1=(d.b[0]-wall.a[0])*ux+(d.b[1]-wall.a[1])*uz;
   const l=Math.max(0,Math.min(t0,t1)-clearance),r=Math.min(len,Math.max(t0,t1)+clearance);
   if(r-l>.01)clips.push([l,r]);
  }
  clips.sort((a,b)=>a[0]-b[0]);let cursor=0;
  const add=(from,to)=>{if(to-from<.005)return;
   output.push({...wall,a:[roundPosition(wall.a[0]+ux*from),roundPosition(wall.a[1]+uz*from)],
    b:[roundPosition(wall.a[0]+ux*to),roundPosition(wall.a[1]+uz*to)]});};
  for(const [a,b] of clips){if(a>cursor)add(cursor,a);cursor=Math.max(cursor,b);}if(cursor<len)add(cursor,len);
 }
 return output;
}
/** A conservative, non-authoritative warning preview. Never blocks free editing. */
export function warningsForLayout(entries,floors,data){const warnings=[];
 const baseBounds=data.floorPolygons?.flat()||[];
 if(baseBounds.length){let xs=baseBounds.map(p=>p[0]),zs=baseBounds.map(p=>p[1]);
  const xmin=Math.min(...xs),xmax=Math.max(...xs),zmin=Math.min(...zs),zmax=Math.max(...zs);
  for(const e of entries.filter(x=>!x.deleted&&!x.source))if([...e.a,...e.b].some((v,i)=>i%2?(v<zmin-.5||v>zmax+.5):(v<xmin-.5||v>xmax+.5)))
   warnings.push(e.id+' ligger delvis utanför den ursprungliga våningen.');
  for(const f of floors)if(f.x0<xmin-.5||f.x1>xmax+.5||f.z0<zmin-.5||f.z1>zmax+.5)warnings.push(f.id+' utökar golvytan utanför ursprunglig våning.');
 }
 const baselineWalls=entries.filter(x=>x.sourceKind==='wall'&&x.deleted).length;
 if(baselineWalls)warnings.push(baselineWalls+' ursprungliga väggsegment har tagits bort i skissen; kontrollera rumsgränser och navigering före spelintegration.');
 if(entries.some(x=>x.sourceKind==='door'&&x.deleted))warnings.push('En eller flera ursprungliga dörrar har tagits bort; kontrollera dörråtkomst och speluppdrag.');
 return warnings;
}