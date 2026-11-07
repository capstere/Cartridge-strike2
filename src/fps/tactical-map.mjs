/** FPS-only tactical routing overlay. These are choices through reviewed, already
 * open corridors, NOT claims about facility access or invented security passages.
 * No master polygon, wall, opening, collider, or orientation route is modified. */
import { insidePolygon } from './physics.mjs';

export const TACTICAL_MAP_VERSION = 'fps-0.7-existing-corridor-lanes';
export const TACTICAL_LANES = Object.freeze([
  { id:'direct', label:'SYD · DIREKT', color:'#e8b45e', approachDoors:['D08'], entryDoorId:'D09', description:'South approach to North Laboratory; direct route through the central passage.' },
  { id:'flank', label:'NORD · FLANK', color:'#77cce8', approachDoors:['D07','D55'], entryDoorId:'D13', description:'North approach through Analysis Chamber and the connecting laboratory passage.' },
]);
const distance=(a,b)=>Math.hypot(a.x-b.x,a.z-b.z);
export const pathLength=(start,path)=>path.reduce((sum,p,i)=>sum+distance(i?path[i-1]:start,p),0);

export function createTacticalMap(data,physics,navigation,anchors){
  const doorPoint=id=>{const d=data.doors.find(d=>d.id===id);if(!d||d.blocked)throw new Error(`Tactical door ${id} is not an accepted opening`);return {x:d.center[0],z:d.center[1]};};
  function joinPath(from,waypoints){
    const path=[];let previous=from;
    for(const p of waypoints){const segment=navigation.findPath(previous,p);if(!segment.length)return [];path.push(...segment);previous=p;}
    return path;
  }
  function plan(laneId,from,to,{lab=true}={}){
    const lane=TACTICAL_LANES.find(l=>l.id===laneId);if(!lane)return null;
    const gates=lane.approachDoors.map(doorPoint);
    if(lab)gates.push(doorPoint(lane.entryDoorId));
    const path=joinPath(from,[...gates,to]);
    return path.length?{laneId,gates,path,length:pathLength(from,path)}:null;
  }
  // Candidate scoring reuses prepared routes; it must not perform ten long
  // A* searches together on the first live combat frame. Actual movement still
  // requests a collision-valid path from each actor's current capsule.
  const prepared=new Map();
  for(const lane of TACTICAL_LANES)for(const lab of[true,false])prepared.set(`${lane.id}:${lab}`,plan(lane.id,anchors.counterAnalysts[0],lab?anchors.bomb:anchors.hostages[0],{lab}));
  const lanes=TACTICAL_LANES.map(l=>({...l,points:[anchors.counterAnalysts[0],...prepared.get(`${l.id}:true`).path]}));
  function candidate(laneId,from,to,{lab=true}={}){
    const reference=prepared.get(`${laneId}:${lab}`);if(!reference)return null;
    const target=lab?anchors.bomb:anchors.hostages[0];
    return {...reference,length:reference.length+distance(from,anchors.counterAnalysts[0])+distance(to,target)};
  }
  const freeNear=(p,roomId)=>{const room=data.rooms.find(r=>r.id===roomId),n=navigation.nodes.filter(n=>insidePolygon(n.x,n.z,room.polygon)).sort((a,b)=>distance(a,p)-distance(b,p))[0];if(!n||distance(n,p)>1.5)throw new Error('Tactical guard position is blocked');return {x:n.x,z:n.z};};
  const south=doorPoint('D09'),north=doorPoint('D13'),pqc=doorPoint('D10');
  const guardPoints={south:freeNear({...south,z:south.z-1.1},'I01'),north:freeNear({...north,z:north.z+1.1},'I02'),pqc:freeNear({...pqc,z:pqc.z-1.1},'I02')};
  // Every point is resolved against the SAME furnished collision/navigation world.
  for(const lane of lanes)for(const p of lane.points)if(!physics.canOccupy(p.x,p.z))throw new Error(`Blocked ${lane.id} tactical waypoint`);
  return {version:TACTICAL_MAP_VERSION,geometryChanged:false,fictionalOpenings:[],lanes,guardPoints,plan,candidate};
}
