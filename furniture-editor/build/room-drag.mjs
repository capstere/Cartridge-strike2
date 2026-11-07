/** Pure drag planner for rooms and corridors. The editable map is the size limit.
 * Never commit a partially-built room. Mouse/touch drags outside the drawing
 * surface stop at the closest map edge, as in child-friendly building tools.
 */
import {validateFloorRect,validateEntry,roundPosition} from './architecture.mjs?v=5.8.0';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const clamped=(n,a,b)=>roundPosition(Math.max(a,Math.min(b,n)));
export const MIN_ROOM_SPAN=.5,MAX_ROOM_SPAN=100;

export function planDraggedRoom(a,b,bounds){
 if(!a||!b||!bounds||![a.x,a.z,b.x,b.z,bounds.x0,bounds.x1,bounds.z0,bounds.z1].every(finite)
  ||bounds.x1<=bounds.x0||bounds.z1<=bounds.z0)
  throw Error('Välj två giltiga hörn innanför banan.');
 const start={x:clamped(a.x,bounds.x0,bounds.x1),z:clamped(a.z,bounds.z0,bounds.z1)};
 const end={x:clamped(b.x,bounds.x0,bounds.x1),z:clamped(b.z,bounds.z0,bounds.z1)};
 const rect={x0:Math.min(start.x,end.x),x1:Math.max(start.x,end.x),
  z0:Math.min(start.z,end.z),z1:Math.max(start.z,end.z)};
 if(rect.x1-rect.x0<MIN_ROOM_SPAN-.001||rect.z1-rect.z0<MIN_ROOM_SPAN-.001)
  throw Error('Dra lite längre så att rummet blir minst 0,5 modellenheter åt båda håll.');
 if(rect.x1-rect.x0>MAX_ROOM_SPAN+.001||rect.z1-rect.z0>MAX_ROOM_SPAN+.001)
  throw Error('Banan är som mest 100 modellenheter bred. Ändra kartans grundyta.');
 // Reuse exactly the parser's floor and wall validation rules before touching
 // the project. This catches inconsistent map bounds as early as possible.
 validateFloorRect({id:'BYGG-G-0001',name:'Rum',...rect});
 const {x0,x1,z0,z1}=rect;
 const edges=[
  [[x0,z0],[x1,z0]],[[x1,z0],[x1,z1]],
  [[x1,z1],[x0,z1]],[[x0,z1],[x0,z0]]
 ];
 for(const [a,b] of edges)validateEntry({
  id:'BYGG-V-0001',kind:'wall',a,b,height:2.85,thickness:.11,sill:.9,finish:'white'
 },{isNew:true});
 return {rect,edges,clipped:start.x!==a.x||start.z!==a.z||end.x!==b.x||end.z!==b.z};
}
