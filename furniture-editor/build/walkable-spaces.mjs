/** Explicit local-project access changes. Never edits the canonical map. */
import {inside} from '../core.mjs?v=5.8.0';
const poly=f=>f.polygon||[[f.x0,f.z0],[f.x1,f.z0],[f.x1,f.z1],[f.x0,f.z1]];
export function closedAreas(data){return [...data.excludedRooms,...data.rooms.filter(r=>r.status==='uncertain'),...data.obstacles.filter(o=>o.kind==='uncertain-area')].filter((r,i,a)=>a.findIndex(v=>v.id===r.id)===i);}
export function validateOpenedAreas(project,data){
 const ids=project.ground.openedAreas;if(ids===undefined)return;
 if(project.mode!=='edit-floor5'||!Array.isArray(ids)||ids.length>100||new Set(ids).size!==ids.length||ids.some(id=>!closedAreas(data).some(r=>r.id===id)))throw Error('Okänd stängd golvyta.');
}
/** Only parallel, axis-aligned, opposing edges within 12 cm; never extend a room box. */
export function floorGaps(floors,walkable=[],blocked=[]){
 const result=[],edges=floors.flatMap(f=>poly(f).map((a,i,p)=>({f,a,b:p[(i+1)%p.length]})));
 for(let i=0;i<edges.length;i++)for(let j=i+1;j<edges.length;j++){
  const e=edges[i],v=edges[j];if(e.f.id===v.f.id)continue;
  const axis=Math.abs(e.a[0]-e.b[0])<1e-6?0:Math.abs(e.a[1]-e.b[1])<1e-6?1:-1;if(axis<0||Math.abs(v.a[axis]-v.b[axis])>1e-6)continue;
  const gap=Math.abs(e.a[axis]-v.a[axis]);if(gap<.001||gap>.12)continue;
  const other=1-axis,lo=Math.max(Math.min(e.a[other],e.b[other]),Math.min(v.a[other],v.b[other])),hi=Math.min(Math.max(e.a[other],e.b[other]),Math.max(v.a[other],v.b[other]));if(hi-lo<1.1)continue;
  const a=Math.min(e.a[axis],v.a[axis]),b=Math.max(e.a[axis],v.a[axis]),mid=[0,0];mid[axis]=(a+b)/2;mid[other]=(lo+hi)/2;
  if(floors.some(f=>inside(mid[0],mid[1],poly(f)))||blocked.some(f=>inside(mid[0],mid[1],poly(f))))continue;
  // Existing threshold patches may already bridge a portion; expose only gaps with uncovered samples.
  if([.15,.35,.5,.65,.85].every(t=>walkable.some(p=>{const q=[...mid];q[other]=lo+(hi-lo)*t;return inside(q[0],q[1],p);})))continue;
  const low=[0,0],high=[0,0];low[axis]=a-.25;high[axis]=b+.25;low[other]=lo;high[other]=hi;
  const id='gap:'+ [e.f.id,v.f.id].sort().join(':')+':'+axis+':'+a.toFixed(3);
  if(!result.some(x=>x.id===id))result.push({id,name:`Golvglipa: ${e.f.name||e.f.id} ↔ ${v.f.name||v.f.id}`,gap,kind:'floor-gap',x0:low[0],z0:low[1],x1:high[0],z1:high[1],a:axis===0?[(a+b)/2,lo]:[lo,(a+b)/2],b:axis===0?[(a+b)/2,hi]:[hi,(a+b)/2]});
 }
 return result;
}
export function gapFloor(gap,id){return {id,name:'Anslutning mellan golv',role:'corridor',surface:'carpet',x0:gap.x0,z0:gap.z0,x1:gap.x1,z1:gap.z1};}

// The north freight facade backs onto one rectangular excluded service volume.
// Subtract exactly the authored cabin footprint, keeping every surrounding point excluded.
export function cabinExclusions(rooms,configs,floors){
 if(!configs?.length)return rooms;
 return rooms.map(room=>{
  const cfg=configs.find(c=>c.excludedAreaId===room.id);if(!cfg)return room;
  const floor=floors.find(f=>f.id===cfg.floorId),xs=room.polygon.map(p=>p[0]),zs=room.polygon.map(p=>p[1]);
  const x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);
  if(!floor||new Set(xs).size!==2||new Set(zs).size!==2||room.polygon.length!==4||
     floor.x0<=x0||floor.x1>=x1||floor.z0<=z0||floor.z0>=z1||floor.z1<z1)throw Error('Hisskorgen passar inte mot serviceutrymmets gräns.');
  return {...room,polygon:[[x0,z0],[x1,z0],[x1,z1],[floor.x1,z1],[floor.x1,floor.z0],
   [floor.x0,floor.z0],[floor.x0,z1],[x0,z1]]};
 });
}
