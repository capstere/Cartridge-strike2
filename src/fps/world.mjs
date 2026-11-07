import {paintDescription} from '../../furniture-editor/build/surface-style.mjs?v=5.8.0';
import '../floor5-data.js';
import '../world.js?v=5.5.0';
import { createPhysics, ACTOR_RADIUS, insidePolygon, distanceSegment, SpatialIndex, circleHitsBox } from './physics.mjs?v=5.5.0';
import { createDoors } from './doors.mjs?v=5.1.0';
import { createNavigation } from './navigation.mjs';
import { createFurnishings } from './furnishings.mjs';
import { createTacticalMap } from './tactical-map.mjs';
import {createFloorTactics} from './bot-tactics.mjs';
import { createLivingPlan } from './living-floor-plan.mjs';
import {createFacilityDetails} from './facility-details.mjs';
import {prepareGlass,createGlassState} from './destructible-glass.mjs';
import {levelProjectToWorldData} from './level-adapter.mjs?v=5.9.0';

import {addCabinFittings} from './start-elevators.mjs';

let sharedWorld;
let levelCacheKey='',levelCache;
const flatPoint=p=>({x:p[0],y:0,z:p[1]});

export function inheritFloor5Gameplay(project){
 if(project.mode!=='edit-floor5'||project.gameplay.spawns.length)return project;
 const p=structuredClone(project),a=createWorld().anchors;
 p.gameplay.spawns=['analysts','counterAnalysts'].flatMap(team=>a[team].map((v,index)=>({id:`SP-${team==='analysts'?'A':'C'}-${String(index+1).padStart(2,'0')}`,team,index,x:v.x,z:v.z,yaw:v.yaw||0})));
 p.gameplay.objectives={bomb:{...a.bomb,id:'OBJ-BOMB'},rescue:{...a.rescue,id:'OBJ-RESCUE'},hostages:a.hostages.map((v,i)=>({...v,id:'OBJ-H'+(i+1)}))};
 return p;
}

function createLevelWorld(project,{fresh=false}={}){
 project=inheritFloor5Gameplay(project);
 const key=JSON.stringify(project);
 if(!fresh&&levelCacheKey===key&&levelCache)return levelCache;
 const {data,anchors,scene}=levelProjectToWorldData(project);
 const source=globalThis.SpelWorldForLevel(data);
 const description=source.build({doors:Object.fromEntries(data.doors.filter(d=>d.accessCardConfirmed).map(d=>[d.id,true]))});
 paintDescription(description,data);
 addCabinFittings(description,project.gameplay.startElevators||[],scene.floors);
 const glassPlan=prepareGlass(description,data),physics=createPhysics(description,data),doors=createDoors(data,physics);
 const doorClearance=new SpatialIndex(),scratch=[];
 for(const door of doors.doors)for(const sign of [-1,1]){
  doors.pose(door,Math.PI/2,sign);
  for(const leaf of door.leaves){const b={...leaf.box},hx=(Math.abs(b.cos)*b.w+Math.abs(b.sin)*b.d)/2,hz=(Math.abs(b.sin)*b.w+Math.abs(b.cos)*b.d)/2;
   doorClearance.insert(b,{minX:b.x-hx,maxX:b.x+hx,minZ:b.z-hz,maxZ:b.z+hz});}
 }
 doors.reset();
 const navPhysics={...physics,dynamicPassages:()=>doors.elevators.progress<1,canOccupy:(x,z,r=ACTOR_RADIUS,h=1.7,y=0)=>physics.staticCanOccupy(x,z,r,h,y)&&
  !doorClearance.query(x,z,r,scratch).some(b=>circleHitsBox(x,z,r,b))&&
  !doors.elevators.boxes.some(b=>circleHitsBox(x,z,r,b))};
 const navigation=createNavigation(data,navPhysics),roomAt=(x,z)=>[...data.rooms,...data.corridors].find(r=>insidePolygon(x,z,r.polygon))||null;
 physics.setDynamicBoxes(doors.boxes);
 const glass=createGlassState(glassPlan,physics,change=>navigation.updateGlass(change));
 const setElevatorProgress=t=>{if(doors.elevators.cabins.length&&doors.elevators.setProgress(t))navigation.invalidate();};
 const world={setElevatorProgress,newLevel:true,project,projectScene:scene,description,data,anchors,doors,glass,details:null,living:null,furnishings:{instances:[],boxes:[]},tactical:createFloorTactics(navigation,anchors),
  roomAt,materialAt:(x,z)=>roomAt(x,z)?.surface||'carpet',...physics,findPath:navigation.findPath,navigation,
  statistics:{...physics.statistics,navigation:navigation.statistics,furnishings:0}};
 if(!fresh){levelCacheKey=key;levelCache=world;}
 return world;
}

export function createWorld({fresh=false,levelProject=null}={}){
 if(levelProject)return createLevelWorld(levelProject,{fresh});
  if(sharedWorld&&!fresh)return sharedWorld;
  const source=globalThis.SpelWorld,data=source.data;
  const inherited=source.build({doors:Object.fromEntries(data.doors.filter(d=>d.accessCardConfirmed).map(d=>[d.id,true]))});
  const furnishings=createFurnishings(data,inherited,{inside:insidePolygon,distanceSegment});
  const description={...inherited,boxes:[...inherited.boxes,...furnishings.boxes],surfaces:[...inherited.surfaces],labels:[...inherited.labels.map(l=>({...l,text:l.text.replace(' · PASSERKORT',' · OPEN')})),...furnishings.labels],furnishings:furnishings.instances};
  // I12 is a freight staging room in the supplied reference, not a lounge.
  description.boxes=description.boxes.filter(b=>!b.id.startsWith('fps-I12-sofa-'));
  furnishings.instances=furnishings.instances.filter(f=>!(f.roomId==='I12'&&f.prefab==='sofa'));
  const details=createFacilityDetails(data,description);
  description.boxes.push(...details.boxes);
  const diningChairs=data.obstacles.filter(o=>o.kind==='authored-chair'&&['I09','I10','I19'].includes(o.roomId));
  for(const b of description.boxes)if((b.material==='fabric'&&diningChairs.some(o=>b.id.startsWith(o.id+'-')))||b.asset==='chairDesk'&&['I09','I10','I19'].includes(b.roomId))b.upholsteryColor=0xd76b28;
  const glassPlan=prepareGlass(description,data);
  const living=createLivingPlan(data,description);
  description.boxes.push(...living.boxes);
  const physics=createPhysics(description,data);
  const doors=createDoors(data,physics);
  // Plan around both possible fully-open leaf poses. These are navigation-only
  // clearances, not extra physical walls. A route must clear the hinge/leaf
  // before turning; otherwise diagonal smoothing can trap an actor on a leaf.
  const doorClearance=new SpatialIndex(),doorScratch=[];
  for(const d of doors.doors)for(const sign of [-1,1]){
    doors.pose(d,Math.PI/2,sign);
    for(const leaf of d.leaves){const b={...leaf.box},hx=(Math.abs(b.cos)*b.w+Math.abs(b.sin)*b.d)/2,hz=(Math.abs(b.sin)*b.w+Math.abs(b.cos)*b.d)/2;
      doorClearance.insert(b,{minX:b.x-hx,maxX:b.x+hx,minZ:b.z-hz,maxZ:b.z+hz});}
  }
  doors.reset();
  const navigationOccupy=(x,z,r=ACTOR_RADIUS,h=1.7,y=0)=>physics.staticCanOccupy(x,z,r,h,y)&&
    !doorClearance.query(x,z,r,doorScratch).some(b=>circleHitsBox(x,z,r,b));
  const navigation=createNavigation(data,{...physics,canOccupy:navigationOccupy});
  const roomAt=(x,z)=>data.rooms.find(r=>r.status!=='uncertain'&&insidePolygon(x,z,r.polygon))||data.corridors.find(r=>insidePolygon(x,z,r.polygon))||null;
  function freeGroup(target,count,{roomId=null,range=4,separation=.95,yaw=0}={}){
    const room=roomId?data.rooms.find(r=>r.id===roomId):null,candidates=[];
    const add=(x,z)=>{if((!room||insidePolygon(x,z,room.polygon))&&physics.canOccupy(x,z,ACTOR_RADIUS+.015))candidates.push({x,y:0,z,yaw});};
    add(target.x,target.z);
    for(let x=target.x-range;x<=target.x+range;x+=.25)for(let z=target.z-range;z<=target.z+range;z+=.25)if(Math.hypot(x-target.x,z-target.z)<=range)add(x,z);
    candidates.sort((a,b)=>Math.hypot(a.x-target.x,a.z-target.z)-Math.hypot(b.x-target.x,b.z-target.z));
    const selected=[];
    for(const p of candidates){if(selected.every(q=>Math.hypot(p.x-q.x,p.z-q.z)>=separation)&&navigation.nearest(p)){selected.push(p);if(selected.length===count)return selected;}}
    throw new Error(`No ${count} free connected positions near ${roomId||'D06'}`);
  }
  const labTarget=id=>flatPoint(data.targets.find(t=>t.id===id).point);
  const d06=data.doors.find(d=>d.id==='D06');
  const counterOrigin={x:d06.center[0]-1.55,z:d06.center[1]-.18};
  const analysts=freeGroup(labTarget('L2'),5,{roomId:'I02',yaw:-Math.PI/2});
  const counterAnalysts=freeGroup(counterOrigin,5,{roomId:'I31',yaw:Math.PI/2,range:2.5});
  const bomb={...freeGroup(labTarget('L1'),1,{roomId:'I01'})[0],radius:1.10,roomId:'I01'};
  const hostageRoute=data.routes.find(r=>r.id==='S16').segments.at(-1).points.at(-1);
  const hostages=freeGroup(flatPoint(hostageRoute),2,{roomId:'I12',separation:.85,yaw:Math.PI/2}).map(p=>({...p,roomId:'I12'}));
  const rescue={...counterAnalysts[0],radius:1.65,doorId:'D06'};
  const anchors={analysts,counterAnalysts,bomb,hostages,rescue};
  const tactical=createTacticalMap(data,physics,navigation,anchors);
  for(const point of [...analysts,...counterAnalysts,bomb,...hostages])if(!navigation.findPath(point,rescue).length)throw new Error(`Disconnected FPS anchor at ${point.x},${point.z}`);
  description.labels.push(
    {text:'North Laboratory\nOBJECTIVE',x:bomb.x,y:.025,z:bomb.z,yaw:0,width:1.8,height:.50,color:'#ffd580',accent:'#624821',floor:true},
    {text:'RESCUE / SUPPLIES',x:rescue.x,y:.025,z:rescue.z,yaw:0,width:2,height:.48,color:'#92e8e4',accent:'#164b53',floor:true}
  );
  const materialAt=(x,z)=>{const r=roomAt(x,z);return r&&(['I01','I02','I03','I04','I29'].includes(r.id)||/RESTROOM|STÄD|PENTRY/.test(r.name))?'vinyl':'carpet';};
  physics.setDynamicBoxes(doors.boxes);
  const glass=createGlassState(glassPlan,physics,change=>navigation.updateGlass(change));
  const world={doors,glass,details,description,data,anchors,tactical,furnishings,living,roomAt,materialAt,...physics,findPath:navigation.findPath,navigation,statistics:{...physics.statistics,navigation:navigation.statistics,furnishings:furnishings.instances.length}};
  if(!fresh)sharedWorld=world;
  return world;
}

export { ACTOR_RADIUS } from './physics.mjs';
