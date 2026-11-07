/** Direct manipulation of authored rectangles and inserts. All plans are pure:
 * the editor applies a complete result in one undo step only after validation.
 */
import {entryLength,getNextId,isDoor,minDoorWidth,roundPosition,validateEntry,validateFloorRect} from './architecture.mjs?v=5.8.0';
import {projectToWall} from './paint-over-wall.mjs?v=5.8.0';

const near=(a,b,t=.025)=>Math.abs(a-b)<=t;
const same=(a,b)=>near(a[0],b[0])&&near(a[1],b[1]);
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]];
const length=v=>Math.hypot(...v);
const copy=entries=>entries.map(e=>({...e,a:[...e.a],b:[...e.b]}));
const isInsert=e=>e.kind!=='wall'&&(isDoor(e.kind)||e.kind==='window'||e.kind==='glazed');

/** A wall insert stays on its line; the adjoining solids close its old gap. */
export function planSlideInsert(entries,id,point,{posters=[],treatments=[],width:requestedWidth}={}){
 const original=entries.find(e=>e.id===id&&!e.deleted);
 if(!original||!isInsert(original))throw Error('Markera en dörr, ett fönster eller ett glasparti.');
 if(!point||![point.x,point.z].every(Number.isFinite))throw Error('Klicka nära väggen.');
 const originalWidth=entryLength(original),width=requestedWidth??originalWidth;
 if(!Number.isFinite(width)||width<(isDoor(original.kind)?minDoorWidth(original):.25)||width>8)
  throw Error('Öppningen måste ha en giltig bredd (vanlig dörr minst 1,10, WC-dörr minst 0,65).');
 const u=sub(original.b,original.a).map(v=>v/originalWidth);
 const along=p=>dot(sub(p,original.a),u);
 const collinear=e=>e.id!==id&&!e.deleted&&[e.a,e.b].every(p=>Math.abs(sub(p,original.a)[0]*u[1]-sub(p,original.a)[1]*u[0])<.055);
 const neighbors=entries.filter(e=>e.kind==='wall'&&collinear(e));
 const left=neighbors.filter(e=>same(e.a,original.a)||same(e.b,original.a))
  .filter(e=>Math.min(along(e.a),along(e.b))<-.1);
 const right=neighbors.filter(e=>same(e.a,original.b)||same(e.b,original.b))
  .filter(e=>Math.max(along(e.a),along(e.b))>width+.1);
 if(left.length>1||right.length>1)throw Error('Flera väggar möts här. Välj ett entydigt väggavsnitt.');
 const L=left[0],R=right[0];
 const backing=neighbors.find(e=>Math.min(along(e.a),along(e.b))<=.02&&Math.max(along(e.a),along(e.b))>=width-.02&&
  (Math.min(along(e.a),along(e.b))<-.1||Math.max(along(e.a),along(e.b))>width+.1));
 if(!L&&!R&&!backing)throw Error('Den här delen saknar en sammanhängande vägg att glida längs.');
 const lo=L?Math.min(along(L.a),along(L.b)):backing?Math.min(along(backing.a),along(backing.b)):0;
 const hi=R?Math.max(along(R.a),along(R.b)):backing?Math.max(along(backing.a),along(backing.b)):originalWidth;
 const cursor=along([point.x,point.z]),start=roundPosition(cursor-width/2);
 if(start<lo-.02||start+width>hi+.02)throw Error('Öppningen måste stanna på väggen.');
 const newA=[roundPosition(original.a[0]+u[0]*start),roundPosition(original.a[1]+u[1]*start)];
 const newB=[roundPosition(newA[0]+u[0]*width),roundPosition(newA[1]+u[1]*width)];
 // An independent original wall is clipped by the runtime; split walls need
 // real, contiguous replacement spans, including when an insert starts at an end.
 for(const e of entries.filter(e=>isInsert(e)&&e.id!==id&&collinear(e))){
  const a=Math.min(along(e.a),along(e.b)),b=Math.max(along(e.a),along(e.b));
  if(start<b-.015&&start+width>a+.015)throw Error('En annan dörr eller ett fönster är i vägen.');
 }
 const updated=copy(entries),item=updated.find(e=>e.id===id);item.a=newA;item.b=newB;
 const side=(neighbor,end,from,to,fallback)=>{
  const span=length(sub(to,from));
  if(neighbor){if(span<.25-.001)throw Error('Lämna minst 0,25 modellenheter vägg vid öppningen.');
   if([...posters,...treatments].some(d=>d.wallId===neighbor.id))throw Error('Flytta väggdekorationen innan du flyttar öppningen.');
   const e=updated.find(e=>e.id===neighbor.id);
   // Keep the neighbor's orientation, source metadata, finish and ID.
   const connected=same(neighbor.a,end)?'a':'b';e[connected]=[...to];validateEntry(e);return;
  }
  if(span<.025)return;
  if(!fallback||span<.25-.001)throw Error('Lämna minst 0,25 modellenheter vägg vid öppningen.');
  const newId=getNextId(updated,[],'wall');
  updated.push({...fallback,id:newId,source:false,sourceKind:'new',a:[...from],b:[...to]});
 };
 if(L){const outer=along(L.a)<along(L.b)?L.a:L.b;side(L,original.a,outer,newA,R||L);}
 else if(!backing&&start>0.025)side(null,original.a,original.a,newA,R);
 if(R){const outer=along(R.a)>along(R.b)?R.a:R.b;side(R,original.b,outer,newB,L||R);}
 else if(!backing&&start+width<hi-.025)side(null,original.b,newB,original.b,L);
 for(const e of updated.filter(e=>e.id===id||e.id===L?.id||e.id===R?.id))validateEntry(e);
 return {entries:updated,insert:item};
}

const edges=f=>[
 {axis:0,line:f.z0,start:f.x0,end:f.x1,next:n=>n.z0,key:'top'},
 {axis:0,line:f.z1,start:f.x0,end:f.x1,next:n=>n.z1,key:'bottom'},
 {axis:1,line:f.x0,start:f.z0,end:f.z1,next:n=>n.x0,key:'left'},
 {axis:1,line:f.x1,start:f.z0,end:f.z1,next:n=>n.x1,key:'right'}
];
function edgeRemap(entries,edge,next){
 const ns=edge.axis===0?next.x0:next.z0,ne=edge.axis===0?next.x1:next.z1;
 const oldLength=edge.end-edge.start,newLength=ne-ns,parts=entries.filter(e=>!e.deleted&&[e.a,e.b].every(p=>
  near(p[1-edge.axis],edge.line)&&p[edge.axis]>=edge.start-.025&&p[edge.axis]<=edge.end+.025));
 const inserts=parts.filter(isInsert).map(e=>({lo:Math.min(e.a[edge.axis],e.b[edge.axis])-edge.start,
  hi:Math.max(e.a[edge.axis],e.b[edge.axis])-edge.start})).sort((a,b)=>a.lo-b.lo);
 if(inserts.some((v,i)=>v.lo<-.025||v.hi>oldLength+.025||(i&&v.lo<inserts[i-1].hi-.025)))
  throw Error('Överlappande öppningar på rumsväggen måste rättas först.');
 const fixed=inserts.reduce((n,v)=>n+v.hi-v.lo,0),free=oldLength-fixed,available=newLength-fixed;
 if(available<-.001||free<-.001)throw Error('Rummet är för smalt för dörrar och fönster.');
 if(free<.001&&Math.abs(available)>.001)throw Error('Den här sidan består helt av fasta öppningar.');
 const ratio=free>.001?available/free:1,anchors=[[0,0]],push=(oldPos,newPos)=>anchors.push([oldPos,newPos]);
 let old=0,now=0;
 for(const v of inserts){const gap=v.lo-old;if(gap>.24&&gap*ratio<.25-.001)throw Error('Väggen bredvid öppningen blir kortare än 0,25.');
  now+=gap*ratio;push(v.lo,now);now+=v.hi-v.lo;push(v.hi,now);old=v.hi;}
 const gap=oldLength-old;if(gap>.24&&gap*ratio<.25-.001)throw Error('Väggen bredvid öppningen blir kortare än 0,25.');
 push(oldLength,newLength);
 return {edge,ns,ne,map:value=>{const t=Math.max(0,Math.min(oldLength,value-edge.start));
  for(let i=1;i<anchors.length;i++)if(t<=anchors[i][0]+1e-6){
   const [x0,y0]=anchors[i-1],[x1,y1]=anchors[i],f=(t-x0)/(x1-x0||1);
   return roundPosition(ns+y0+(y1-y0)*f);}
  return ne;}};
}

/** Resize one authored rectangular floor, remapping every touching wall edge.
 * Doors, windows and glass retain their widths while solid wall gaps stretch.
 */
export function planResizeFloor(floor,entries,corner,point,{bounds,otherFloors=[]}={}){
 if(floor?.source||!['nw','ne','se','sw'].includes(corner))throw Error('Välj hörnet på ett eget rektangulärt rum.');
 if(![point?.x,point?.z].every(Number.isFinite))throw Error('Ogiltigt hörn.');
 const next={...floor};
 next[corner.includes('w')?'x0':'x1']=roundPosition(point.x);
 next[corner.includes('n')?'z0':'z1']=roundPosition(point.z);
 validateFloorRect(next);
 if(bounds&&(next.x0<bounds.x0||next.x1>bounds.x1||next.z0<bounds.z0||next.z1>bounds.z1))
  throw Error('Rummets hörn måste stanna inom banans grundyta.');
 const oldEdges=edges(floor),newEdges=edges(next);
 for(let i=0;i<4;i++){const a=oldEdges[i],b=newEdges[i];
  if(near(a.line,b.line)&&near(a.start,b.start)&&near(a.end,b.end))continue;
  if(otherFloors.some(f=>{if(f.role!=='room')return false;
   const side=edges(f).find(e=>e.axis===a.axis&&near(e.line,a.line));
   return side&&Math.min(side.end,a.end)-Math.max(side.start,a.start)>.1;}))
   throw Error('Den här sidan delas med ett annat rum. Dra dess fria hörn eller flytta det andra rummet först.');
 }
 const maps=oldEdges.map(e=>edgeRemap(entries,e,next));
 const updated=copy(entries);
 for(const e of updated)for(const key of ['a','b']){
  const original=e[key],position=[...original];
  for(const m of maps){const {edge}=m;
   if(near(original[1-edge.axis],edge.line)&&original[edge.axis]>=edge.start-.025&&original[edge.axis]<=edge.end+.025){
    position[edge.axis]=m.map(original[edge.axis]);
    position[1-edge.axis]=roundPosition(m.edge.next(next));
   }}
  e[key]=position;
 }
 for(const e of updated.filter(e=>!e.deleted))validateEntry(e);
 return {floor:next,entries:updated};
}

/** Pull ONE wall of a rectangular room; the opposite side stays fixed.
 * Reuses the exact corner geometry remapper (including 1.20-wide doors)
 * and its shared-wall checks, so dragging never invents an overlapping collider.
 */
export function planResizeFloorEdge(floor,entries,side,point,options={}){
 const index={left:'nw',right:'se',top:'nw',bottom:'se'};
 if(!Object.hasOwn(index,side))throw Error('Välj en av rummets fyra väggsidor.');
 if(![point?.x,point?.z].every(Number.isFinite))throw Error('Dra väggen till en giltig plats.');
 const corner=index[side];
 const target=side==='left'?{x:point.x,z:floor.z0}:
  side==='right'?{x:point.x,z:floor.z1}:
  side==='top'?{x:floor.x0,z:point.z}:{x:floor.x1,z:point.z};
 return planResizeFloor(floor,entries,corner,target,options);
}

/** Drag a free wall endpoint; connected corners are edited with the room handle. */
export function planMoveWallEnd(entries,id,end,point,{bounds,posters=[],treatments=[]}={}){
 const wall=entries.find(e=>e.id===id&&!e.deleted&&e.kind==='wall');
 if(!wall||!['a','b'].includes(end))throw Error('Markera ändpunkten på en vägg.');
 if([...posters,...treatments].some(d=>d.wallId===id))throw Error('Flytta väggdekorationen innan du ändrar väggen.');
 if(entries.some(e=>e.id!==id&&!e.deleted&&(same(e.a,wall[end])||same(e.b,wall[end]))))
  throw Error('Ändpunkten sitter ihop med en annan byggdel. Dra rummets hörn i stället.');
 const q=[roundPosition(point.x),roundPosition(point.z)];
 if(bounds&&(q[0]<bounds.x0||q[0]>bounds.x1||q[1]<bounds.z0||q[1]>bounds.z1))
  throw Error('Väggen måste stanna inom banans grundyta.');
 const updated=copy(entries),item=updated.find(e=>e.id===id);item[end]=q;validateEntry(item);
 return {entries:updated,wall:item};
}

/** The rectangle's authored perimeter, excluding a side still used by another room. */
export function roomBoundaryIds(floor,entries,otherFloors=[]){
 if(floor.role!=='room'||floor.source)return [];
 const sides=edges(floor);
 return entries.filter(e=>!e.deleted&&!e.source&&sides.some(side=>{
  if(![e.a,e.b].every(p=>near(p[1-side.axis],side.line)&&
   p[side.axis]>=side.start-.025&&p[side.axis]<=side.end+.025))return false;
  const lo=Math.min(e.a[side.axis],e.b[side.axis]),hi=Math.max(e.a[side.axis],e.b[side.axis]);
  return !otherFloors.some(other=>other.role==='room'&&edges(other).some(shared=>
   shared.axis===side.axis&&near(shared.line,side.line)&&
   Math.min(shared.end,hi)-Math.max(shared.start,lo)>.02));
 })).map(e=>e.id);
}
