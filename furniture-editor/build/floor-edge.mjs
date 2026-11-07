import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Floor-only edge edits. Never move walls, openings, furniture or source polygons. */
const EPS=1e-7;
export const floorPolygon=f=>f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];
const area=p=>p.reduce((s,a,i)=>{const b=p[(i+1)%p.length];return s+a[0]*b[1]-a[1]*b[0];},0)/2;
const axis=(a,b)=>Math.abs(a[0]-b[0])<EPS?0:Math.abs(a[1]-b[1])<EPS?1:-1;
export function floorEdgeHandles(f){
 const p=floorPolygon(f),out={};
 for(let i=0;i<p.length;i++){const a=p[i],b=p[(i+1)%p.length],k=axis(a,b);
  if(k<0||axis(p[(i+p.length-1)%p.length],a)!==1-k||axis(b,p[(i+2)%p.length])!==1-k)continue;
  out['floor-'+i]={x:(a[0]+b[0])/2,z:(a[1]+b[1])/2,axis:k};
 }return out;
}
function validatePolygon(p,base,bounds){
 if(!Array.isArray(p)||p.length!==base.length||p.length>200||p.some(v=>!Array.isArray(v)||v.length!==2||!v.every(Number.isFinite)))throw Error('Ogiltig golvkontur.');
 if(Math.abs(area(p))<.25||area(p)*area(base)<=0)throw Error('Golvet blir för litet eller vänds ut och in.');
 for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length],k=axis(base[i],base[(i+1)%p.length]);
  if(k<0||axis(a,b)!==k||(b[1-k]-a[1-k])*(base[(i+1)%p.length][1-k]-base[i][1-k])<=0||Math.hypot(b[0]-a[0],b[1]-a[1])<.01)throw Error('Golvkanterna får inte korsa eller vändas.');
  if(a[0]<bounds.x0||a[0]>bounds.x1||a[1]<bounds.z0||a[1]>bounds.z1)throw Error('Golvet måste stanna inom banans grundyta.');
  for(let j=i+2;j<p.length;j++){
   if(i===0&&j===p.length-1)continue;const c=p[j],d=p[(j+1)%p.length];
   if(Math.max(Math.min(a[0],b[0]),Math.min(c[0],d[0]))<=Math.min(Math.max(a[0],b[0]),Math.max(c[0],d[0]))+EPS&&
    Math.max(Math.min(a[1],b[1]),Math.min(c[1],d[1]))<=Math.min(Math.max(a[1],b[1]),Math.max(c[1],d[1]))+EPS)throw Error('Golvkanterna får inte korsa varandra.');
  }
 }
}
/** Snap to the nearest physical wall face within .20 model units, not the .1 grid.
 * A small overlap (.002) under the wall prevents raster cracks; collisions stay put.
 */
export function planFloorEdge(floor,index,point,walls,{bounds}={}){
 const original=floorPolygon(floor),p=original.map(v=>[...v]),a=p[index],b=p[(index+1)%p.length],k=a&&b?axis(a,b):-1;
 if(k<0||!floorEdgeHandles(floor)['floor-'+index])throw Error('Dra ett handtag på en rak golvkant.');
 let target=k===0?point.x:point.z;if(!Number.isFinite(target))throw Error('Ogiltig golvkant.');
 const lo=Math.min(a[1-k],b[1-k]),hi=Math.max(a[1-k],b[1-k]);
 // Determine the interior side from winding and edge direction, also for concave rooms.
 const insideSign=Math.sign(area(p))*(k===0?-Math.sign(b[1]-a[1]):Math.sign(b[0]-a[0]));
 const options=[];
 for(const w of walls.filter(w=>!w.deleted&&['wall','window','glazed'].includes(w.kind))){
  if(axis(w.a,w.b)!==k||Math.min(hi,Math.max(w.a[1-k],w.b[1-k]))-Math.max(lo,Math.min(w.a[1-k],w.b[1-k]))<.05)continue;
  const face=w.a[k]+insideSign*(w.thickness||.11)/2;
  if(Math.abs(target-face)<=.2)options.push({value:face-insideSign*.002,id:w.id,distance:Math.abs(target-face)});
 }
 const match=options.sort((a,b)=>a.distance-b.distance||a.id.localeCompare(b.id))[0];target=match?.value??Math.round(target*1000)/1000;
 a[k]=target;b[k]=target;validatePolygon(p,original,bounds);
 const xs=p.map(v=>v[0]),zs=p.map(v=>v[1]);
 if(!floor.source&&(Math.max(...xs)-Math.min(...xs)<.5||Math.max(...zs)-Math.min(...zs)<.5))throw Error('Golvet måste vara minst 0,5 åt varje håll.');
 return {polygon:p,x0:Math.min(...xs),x1:Math.max(...xs),z0:Math.min(...zs),z1:Math.max(...zs),snapped:match?.id||null};
}
export function validateFloorEdits(project,source){
 const edits=project.ground.floorEdits;if(edits===undefined)return;
 if(project.mode!=='edit-floor5'||!edits||typeof edits!=='object'||Array.isArray(edits)||Object.keys(edits).length>AUTHORING_LIMITS.floors)throw Error('Ogiltiga lokala golvkanter.');
 const originals=new Map([...(source?.rooms||[]),...(source?.corridors||[])].filter(f=>f.status!=='uncertain').map(f=>[f.id,f]));
 for(const [id,p] of Object.entries(edits)){const f=originals.get(id);if(!f)throw Error('Okänd ursprunglig golvyta: '+id);validatePolygon(p,f.polygon,project.ground.bounds);}
}
export function applyFloorEdits(floors,edits={}){return floors.map(f=>{const polygon=edits[f.id];if(!polygon)return f;const p=polygon.map(v=>[...v]);return {...f,polygon:p,x0:Math.min(...p.map(v=>v[0])),x1:Math.max(...p.map(v=>v[0])),z0:Math.min(...p.map(v=>v[1])),z1:Math.max(...p.map(v=>v[1]))};});}
/** Remove replaced room footprints from Floor 5's legacy rectangular floor tiles.
 * Retain every threshold/circulation tile outside the edited footprint. The new
 * zone is added by the adapter, so shrinking cannot leave an invisible old floor.
 */
export function remainingSourceTiles(data,edits={}){
 let tiles=data.floorPolygons;
 const inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;};
 for(const f of [...data.rooms,...data.corridors].filter(f=>Object.hasOwn(edits,f.id))){
  const p=f.polygon,xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),left=Math.min(...xs),right=Math.max(...xs),top=Math.min(...zs),bottom=Math.max(...zs);
  tiles=tiles.flatMap(tile=>{
   const tx=tile.map(v=>v[0]),tz=tile.map(v=>v[1]),x0=Math.min(...tx),x1=Math.max(...tx),z0=Math.min(...tz),z1=Math.max(...tz);
   if(x1<=left||x0>=right||z1<=top||z0>=bottom)return [tile];
   const x=[...new Set([x0,x1,...xs.filter(v=>v>x0&&v<x1)])].sort((a,b)=>a-b),z=[...new Set([z0,z1,...zs.filter(v=>v>z0&&v<z1)])].sort((a,b)=>a-b),out=[];
   for(let i=1;i<x.length;i++)for(let j=1;j<z.length;j++)if(!inside((x[i-1]+x[i])/2,(z[j-1]+z[j])/2,p))out.push([[x[i-1],z[j-1]],[x[i],z[j-1]],[x[i],z[j]],[x[i-1],z[j]]]);
   return out;
  });
 }return tiles;
}
/** Keep an existing doorway walkable when floor edges meet the wall faces.
 * Only bridge the thickness of an aligned wall with floor on BOTH approaches.
 * This does not open excluded areas or bridge arbitrary circulation gaps.
 */
export function thresholdFloorPolygons(entries,floors){
 const polygons=floors.map(floorPolygon),inside=(x,z,p)=>{let yes=false;for(let i=0,j=p.length-1;i<p.length;j=i++){const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;},covered=p=>polygons.some(poly=>inside(...p,poly)),out=[];
 for(const door of entries.filter(e=>!e.deleted&&!e.originallyBlocked&&['door','card-door','opening'].includes(e.kind))){
  const dx=door.b[0]-door.a[0],dz=door.b[1]-door.a[1],len=Math.hypot(dx,dz),ux=dx/len,uz=dz/len;
  const walls=entries.filter(w=>!w.deleted&&['wall','window','glazed'].includes(w.kind)&&Math.abs((w.b[0]-w.a[0])*uz-(w.b[1]-w.a[1])*ux)<.01&&
   Math.abs((w.a[0]-door.a[0])*uz-(w.a[1]-door.a[1])*ux)<.02&&
   Math.max((w.a[0]-door.a[0])*ux+(w.a[1]-door.a[1])*uz,(w.b[0]-door.a[0])*ux+(w.b[1]-door.a[1])*uz)>=-.025&&
   Math.min((w.a[0]-door.a[0])*ux+(w.a[1]-door.a[1])*uz,(w.b[0]-door.a[0])*ux+(w.b[1]-door.a[1])*uz)<=len+.025);
  if(!walls.length)continue;const half=Math.max(...walls.map(w=>w.thickness))/2+.02,point=(t,n)=>[door.a[0]+dx*t-uz*n,door.a[1]+dz*t+ux*n];
  if([.1,.5,.9].every(t=>covered(point(t,0)))||![.1,.5,.9].every(t=>covered(point(t,half))&&covered(point(t,-half))))continue;
  out.push([point(0,-half),point(1,-half),point(1,half),point(0,half)]);
 }return out;
}
