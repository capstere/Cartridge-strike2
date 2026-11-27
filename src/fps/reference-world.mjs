import {createDoors} from './doors.mjs';
import {createGlassState} from './destructible-glass.mjs';
import {createFloorTactics} from './bot-tactics.mjs';
import {createReferenceTerrain} from './reference-terrain.mjs';
import {referenceNavigation} from './reference-navigation.mjs';
import {referenceRays} from './reference-rays.mjs';

function validate(spec){
  const fail=()=>{throw Error('Invalid Meltem terrain data.');};
  const finite=(v,limit)=>Number.isFinite(v)&&Math.abs(v)<=limit;
  const bounded=(list,limit)=>Array.isArray(list)&&list.length<=limit;
  if(spec?.version!==1||spec.sourceId!=='meltem'||!spec.bounds||!bounded(spec.solids,10000)||
    !bounded(spec.ramps,200)||!bounded(spec.holes,100)||!bounded(spec.zones,400)||!bounded(spec.rayProps,2000))fail();
  for(const b of spec.solids)if(!Array.isArray(b)||b.length!==11||b.slice(0,6).some(v=>!finite(v,5000))||
    b[0]>b[1]||b[2]>b[3]||b[4]>b[5]||typeof b[6]!=='string')fail();
  for(const axis of ['x','z'])if(!finite(spec.bounds[axis+'0'],1000)||!finite(spec.bounds[axis+'1'],1000)||
    spec.bounds[axis+'1']-spec.bounds[axis+'0']<=0||spec.bounds[axis+'1']-spec.bounds[axis+'0']>300)fail();
  const n=spec.nav;
  if(!n||!bounded(n.x,25000)||n.x.length<1||!bounded(n.adj,250000)||n.x.length!==n.y?.length||
    n.x.length!==n.z?.length||n.x.length+1!==n.offsets?.length||n.adj.length!==n.kind?.length||
    n.adj.length!==n.cost?.length||n.offsets[0]!==0||n.offsets.at(-1)!==n.adj.length)fail();
  for(let i=0;i<n.x.length;i++)if(![n.x[i],n.y[i],n.z[i]].every(v=>finite(v,1500))||
    !Number.isInteger(n.offsets[i])||n.offsets[i+1]<n.offsets[i])fail();
  for(let i=0;i<n.adj.length;i++)if(!Number.isInteger(n.adj[i])||n.adj[i]<0||n.adj[i]>=n.x.length||
    !finite(n.cost[i],200)||n.cost[i]<=0||!Number.isInteger(n.kind[i])||n.kind[i]<0||n.kind[i]>3)fail();
  for(const r of spec.ramps)if(!['x','z'].includes(r.axis)||![r.x0,r.x1,r.z0,r.z1,r.h0,r.h1].every(v=>finite(v,1500))||r.x0>=r.x1||r.z0>=r.z1)fail();
  for(const h of spec.holes)if(![h.x,h.z,h.y,h.r].every(v=>finite(v,1500))||h.r<=0)fail();
  const w=spec.water;if(!w||!finite(w.y,100)||!finite(w.floor,100)||w.floor>w.y||!bounded(w.land,30)||
    ![w.box,...w.land].every(b=>Array.isArray(b)&&b.length===4&&b.every(v=>finite(v,11000))&&b[0]<=b[1]&&b[2]<=b[3]))fail();
  for(const row of spec.zones)if(!Array.isArray(row)||row.length!==5||typeof row[0]!=='string'||
    row[0].length>100||row.slice(1).some(v=>!finite(v,1500)))fail();
  for(const b of spec.rayProps)if(!b.p||![b.p.x,b.p.y,b.p.z,b.rad].every(v=>finite(v,1500))||
    b.R?.length!==9||b.R.some(v=>!finite(v,1.01))||!bounded(b.sh,100)||!b.sh.every(s=>['b','s','y'].includes(s[0])&&s.slice(1).every(v=>finite(v,200))))fail();
}
const rectangle=(x0,x1,z0,z1)=>[[x0,z0],[x1,z0],[x1,z1],[x0,z1]];
export function createReferenceWorld(project){
  const spec=project.referenceMap;validate(spec);
  const terrain=createReferenceTerrain(spec),navigation=referenceNavigation(spec.nav,terrain);
  const bounds=spec.bounds,footprint=rectangle(bounds.x0,bounds.x1,bounds.z0,bounds.z1);
  const rooms=spec.zones.map(([name,x0,x1,z0,z1],i)=>({id:'M-'+i,name,status:'included',surface:'stone',polygon:rectangle(x0,x1,z0,z1)}));
  const outside={id:'M-0-all',name:'Meltem',status:'included',surface:'stone',polygon:footprint};
  const data={__custom:true,rooms,corridors:[outside],walls:[],doors:[],obstacles:[],routes:[],targets:[],excludedRooms:[],floorPolygons:[footprint],ground:project.ground};
  const description={boxes:[],surfaces:[],labels:[],furnishings:[],floorPolygons:[footprint]};
  // Draw the ground-level silhouettes from the same authoritative solids.
  for(const b of terrain.solids){
    if(b.rayOnly||b.invisible||b.y0>1.2||b.y1<1.2)continue;
    const x0=Math.max(b.x0,bounds.x0),x1=Math.min(b.x1,bounds.x1),z0=Math.max(b.z0,bounds.z0),z1=Math.min(b.z1,bounds.z1);
    if(x0>=x1||z0>=z1)continue;
    const corners=rectangle(x0,x1,z0,z1);
    for(let i=0;i<4;i++)data.walls.push({id:b.id+'-'+i,a:corners[i],b:corners[(i+1)%4]});
  }
  const spawns=team=>project.gameplay.spawns.filter(s=>s.team===team).map(s=>({x:s.x,y:terrain.groundHeight(s.x,s.z,0),z:s.z,yaw:s.yaw}));
  const anchors={analysts:spawns('analysts'),counterAnalysts:spawns('counterAnalysts'),hostages:[],bomb:null,rescue:null};
  const staticBoxes=terrain.solids.map(b=>({id:b.id,x:(b.x0+b.x1)/2,y:(b.y0+b.y1)/2,z:(b.z0+b.z1)/2,
    w:b.x1-b.x0,h:b.y1-b.y0,d:b.z1-b.z0,material:b.material,cos:1,sin:0,angle:0,noRay:!!b.noRay,rayOnly:!!b.rayOnly}));
  // This map has no dynamic doors, elevators or destructible glazing. The
  // network door interface still exists, including an independent empty
  // context for prediction. Static geometry is shared throughout each room.
  const empty=boxes=>{if(boxes.length)throw Error('Unexpected moving geometry on Meltem.');return boxes;};
  const physics={...terrain,...referenceRays(spec,terrain),staticBoxes,staticCanOccupy:terrain.canOccupy,
    onFloor:(x,z)=>terrain.scopeAllowed(x,z,0),setDynamicBoxes:empty,createDynamicContext:empty,
    withDynamicContext:(context,run)=>run(),enableNetworkGlassThresholds:()=>{}};
  const doors=createDoors(data,physics),glass=createGlassState({specs:[]},physics);
  const roomAt=(x,z)=>rooms.find((_,i)=>{const v=spec.zones[i];return x>=v[1]&&x<=v[2]&&z>=v[3]&&z<=v[4];})||outside;
  return {...physics,newLevel:true,layeredTerrain:true,referenceId:'meltem',project,data,description,anchors,doors,glass,
    furnishings:{instances:[],boxes:[]},tactical:{...createFloorTactics(navigation,anchors),
      patrolPoints:spec.poi.map(([x,y,z])=>({x,y,z}))},navigation,findPath:navigation.findPath,roomAt,
    materialAt:(x,z)=>x< -30?'wood':Math.abs(z)>41&&x> -18?'dirt':'concrete',
    setElevatorProgress:()=>{},statistics:{staticBoxes:staticBoxes.length,navigation:navigation.statistics,furnishings:0}};
}
