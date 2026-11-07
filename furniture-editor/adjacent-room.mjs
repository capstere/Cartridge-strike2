/**
 * Pure layout helper for a second Sims-style room.
 * Does not mutate the project, open doorways or create colliders.
 * The caller performs the real makeFloor + planPaintOverWall atomically.
 */
import {STANDARD_PASSAGE_WIDTH} from './build/architecture.mjs?v=5.8.0';

export const ADJACENT_SIDES=Object.freeze(['right','left','above','below']);
const round=n=>Math.round(n*1000)/1000;
const close=(a,b)=>Math.abs(a-b)<.002;
const samePoint=(a,b)=>close(a[0],b[0])&&close(a[1],b[1]);
const sameSpan=(wall,a,b)=>
 (samePoint(wall.a,a)&&samePoint(wall.b,b))||
 (samePoint(wall.b,a)&&samePoint(wall.a,b));

export function planAdjacentRoom(room,side,rooms,walls,bounds,{treatments=[]}={}){
 const fail=reason=>({ok:false,reason,side});
 if(!ADJACENT_SIDES.includes(side))return fail('Välj en av de fyra sidorna.');
 if(!room||room.source||room.role!=='room'||![room.x0,room.x1,room.z0,room.z1].every(Number.isFinite))
  return fail('Välj först ett rum du har byggt.');
 const w=round(room.x1-room.x0),h=round(room.z1-room.z0);
 if(w<STANDARD_PASSAGE_WIDTH+.5||h<STANDARD_PASSAGE_WIDTH+.5||
    w>100||h>100)return fail('Rummet behöver minst en lång, rak vägg för en standarddörr.');
 const rect={x0:room.x0,x1:room.x1,z0:room.z0,z1:room.z1};
 let wallStart,wallEnd;
 if(side==='right'){
  rect.x0=room.x1;rect.x1=round(room.x1+w);
  wallStart=[room.x1,room.z0];wallEnd=[room.x1,room.z1];
 }else if(side==='left'){
  rect.x1=room.x0;rect.x0=round(room.x0-w);
  wallStart=[room.x0,room.z0];wallEnd=[room.x0,room.z1];
 }else if(side==='above'){
  rect.z1=room.z0;rect.z0=round(room.z0-h);
  wallStart=[room.x0,room.z0];wallEnd=[room.x1,room.z0];
 }else{
  rect.z0=room.z1;rect.z1=round(room.z1+h);
  wallStart=[room.x0,room.z1];wallEnd=[room.x1,room.z1];
 }
 if(!bounds||[bounds.x0,bounds.x1,bounds.z0,bounds.z1].some(x=>!Number.isFinite(x)))
  return fail('Banans gränser kunde inte läsas.');
 if(rect.x0<bounds.x0-.001||rect.x1>bounds.x1+.001||
    rect.z0<bounds.z0-.001||rect.z1>bounds.z1+.001)
  return fail('Det är för trångt åt det hållet. Välj en annan sida.');
 for(const other of rooms){
  if(other.id===room.id)continue;
  const overlapX=Math.min(rect.x1,other.x1)-Math.max(rect.x0,other.x0);
  const overlapZ=Math.min(rect.z1,other.z1)-Math.max(rect.z0,other.z0);
  if(overlapX>.002&&overlapZ>.002)
   return fail('Där finns redan ett rum. Välj en annan sida.');
 }
 const shared=(walls||[]).find(entry=>
  entry.kind==='wall'&&!entry.deleted&&sameSpan(entry,wallStart,wallEnd));
 if(!shared)return fail('Den här sidan har redan en öppning eller ändrad vägg. Välj en annan.');
 if(treatments.some(item=>item.wallId===shared.id))
  return fail('Det finns en gardin på väggen. Välj en annan sida.');
 const centerX=round((wallStart[0]+wallEnd[0])/2);
 const centerZ=round((wallStart[1]+wallEnd[1])/2);
 const half=STANDARD_PASSAGE_WIDTH/2;
 const doorStart=close(wallStart[0],wallEnd[0])?
  [centerX,round(centerZ-half)]:[round(centerX-half),centerZ];
 const doorEnd=close(wallStart[0],wallEnd[0])?
  [centerX,round(centerZ+half)]:[round(centerX+half),centerZ];
 return {ok:true,side,roomId:room.id,rect,sharedWallId:shared.id,
  doorStart,doorEnd,width:w,depth:h};
}
