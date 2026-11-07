import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
/** Atomic rectangle-room sketch generator. No source geometry, physics, or navmesh edits. */
import {floorRect,getNextId,makeEntry,roundPosition,validateEntry,validateFloorRect} from './architecture.mjs?v=5.8.0';

const bounded=(n,min,max,label)=>{
 if(typeof n!=='number'||!Number.isFinite(n)||n<min||n>max)throw Error(label+' måste vara '+min+'–'+max+' m.');
 return roundPosition(n);
};
export function createRectangleRoom(entries,floors,start,opposite,{
 height=2.85,thickness=.11,withFloor=true,name='Nytt rum'
}={}){
 if(!Array.isArray(start)||!Array.isArray(opposite)||start.length!==2||opposite.length!==2||
  ![...start,...opposite].every(n=>typeof n==='number'&&Number.isFinite(n)&&Math.abs(n)<=100))
  throw Error('Rummets koordinater är ogiltiga eller utanför kartgränsen ±100 m.');
 const x0=roundPosition(Math.min(start[0],opposite[0]));
 const z0=roundPosition(Math.min(start[1],opposite[1]));
 const x1=roundPosition(Math.max(start[0],opposite[0]));
 const z1=roundPosition(Math.max(start[1],opposite[1]));
 const width=bounded(roundPosition(x1-x0),.5,50,'Längden');
 const depth=bounded(roundPosition(z1-z0),.5,50,'Bredden');
 const wallHeight=bounded(height,.45,6,'Höjden');
 const wallThickness=bounded(thickness,.025,.7,'Väggtjockleken');
 if(typeof name!=='string'||name.length>60)throw Error('Rumsnamnet får vara högst 60 tecken.');
 if(entries.filter(e=>!e.source&&!e.deleted).length+4>AUTHORING_LIMITS.buildingParts)
  throw Error(`Redigerarens resursgräns är ${AUTHORING_LIMITS.buildingParts} byggdelar. Spara en säkerhetskopia.`);
 if(withFloor&&floors.length+1>AUTHORING_LIMITS.floors)throw Error(`Redigerarens resursgräns är ${AUTHORING_LIMITS.floors} golvytor. Spara en säkerhetskopia.`);
 // Adjacent wall segments reuse the exact same corner arrays, no floating seams.
 const corners=[[x0,z0],[x1,z0],[x1,z1],[x0,z1]],staged=[...entries],walls=[];
 for(let i=0;i<4;i++){
  const edge=makeEntry(getNextId(staged,floors,'wall'),'wall',corners[i],corners[(i+1)%4]);
  edge.height=wallHeight;edge.thickness=wallThickness;edge.sill=Math.min(.9,roundPosition(wallHeight-.15));
  validateEntry(edge,{isNew:true});walls.push(edge);staged.push(edge);
 }
 let floor=null;
 if(withFloor){
  floor=floorRect(getNextId(staged,floors,'floor'),[x0,z0],[x1,z1]);
  floor.name=name.trim()||'Nytt rum';validateFloorRect(floor);
 }
 return {walls,floor,width,depth,height:wallHeight,thickness:wallThickness};
}
/** A measured rectangle from one anchor, growing toward positive X and positive Z. */
export function rectangleFromDimensions(anchor,width,depth){
 if(!Array.isArray(anchor)||anchor.length!==2||!anchor.every(Number.isFinite))
  throw Error('Välj först en startpunkt på kartan.');
 const w=bounded(Number(width),.5,50,'Längden'),d=bounded(Number(depth),.5,50,'Bredden');
 return [roundPosition(anchor[0]+w),roundPosition(anchor[1]+d)];
}
