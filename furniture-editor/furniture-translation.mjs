/** Pure, bounded instance movement. Preview and commit share the same authored pose. */
import {poseOnWall} from './wall-mounts.mjs?v=5.8.0';
import {fittedSize,wallFootprint} from './model-alignment.mjs?v=5.8.0';
import {mountedSurface,mountedElevation,footprintOnSurface} from './furniture-surfaces.mjs?v=5.8.1';
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
const rounded=n=>Math.round(n*1e6)/1e6;
export function furnitureAssembly(item,items){const result=[item],seen=new Set([item.id]);for(let i=0;i<result.length;i++)for(const child of items)if(child.mountId===result[i].id&&!seen.has(child.id)){result.push(child);seen.add(child.id);}return result;}
export function furnitureHandleFrame(item,walls){
 const height=item.wallMount?wallFootprint(item).height:fittedSize(item).h;
 const origin={x:item.x,y:item.wallMount?.y??((item.elevation||0)+height/2),z:item.z};
 if(!item.wallMount)return {origin,axes:{x:{x:1,y:0,z:0},z:{x:0,y:0,z:1},height:{x:0,y:1,z:0}},normal:{x:0,y:1,z:0}};
 const wall=walls.find(w=>w.id===item.wallMount.wallId&&w.kind==='wall'&&!w.deleted);if(!wall)return null;
 let [a,b]=[wall.a,wall.b];if(item.wallMount.frame===1&&(a[0]>b[0]||a[0]===b[0]&&a[1]>b[1]))[a,b]=[b,a];
 const dx=b[0]-a[0],dz=b[1]-a[1],length=Math.hypot(dx,dz);if(length<.001)return null;
 return {origin,axes:{x:{x:dx/length,y:0,z:dz/length},height:{x:0,y:1,z:0}},normal:{x:-dz/length,y:0,z:dx/length},length};
}
export function planFurnitureTranslation(item,items,walls,delta){
 if(![delta.x,delta.y,delta.z].every(Number.isFinite))throw Error('Ogiltig förflyttning.');
 const frame=furnitureHandleFrame(item,walls),members=furnitureAssembly(item,items);let next={...item};
 if(!frame)throw Error('Väggfästet saknas. Ångra ändringen eller välj en ny vägg.');
 if(item.wallMount){
  const tangent=frame.axes.x,along=delta.x*tangent.x+delta.z*tangent.z;
  const mount={...item.wallMount,t:item.wallMount.t+along/frame.length,y:item.wallMount.y+delta.y};
  mount.t=clamp(mount.t,0,1);mount.y=clamp(mount.y,.1,5.9);
  const pose=poseOnWall(item,mount,walls);if(!pose)throw Error('Föremålet får inte längre plats på väggen.');
  Object.assign(next,pose,{collision:item.collision||'none'});
 }else{
  let dx=delta.x,dz=delta.z,dy=delta.y;
  for(const m of members){dx=clamp(dx,-100-m.x,100-m.x);dz=clamp(dz,-100-m.z,100-m.z);dy=clamp(dy,-(m.elevation||0),6-(m.elevation||0));}
  if(item.mountId){
   const parent=items.find(o=>o.id===item.mountId);if(!parent)throw Error('Möbelytan saknas. Välj fri placering eller ångra.');
   const c=Math.cos(parent.yaw),s=Math.sin(parent.yaw),angle=item.yaw-parent.yaw;
   const {width,depth}=footprintOnSurface(item,angle);
   const surface=mountedSurface(item,parent),sx=surface?.x||0,sz=surface?.z||0;
   const x=item.x+dx-parent.x,z=item.z+dz-parent.z,lx=sx+clamp(c*x-s*z-sx,-Math.max(0,((surface?.width||parent.w)-width)/2),Math.max(0,((surface?.width||parent.w)-width)/2)),lz=sz+clamp(s*x+c*z-sz,-Math.max(0,((surface?.depth||parent.d)-depth)/2),Math.max(0,((surface?.depth||parent.d)-depth)/2));
   dx=parent.x+c*lx+s*lz-item.x;dz=parent.z-s*lx+c*lz-item.z;
   dy=Math.max(dy,mountedElevation(item,parent)-(item.elevation||0));
  }
  next.x=rounded(item.x+dx);next.z=rounded(item.z+dz);next.elevation=rounded((item.elevation||0)+dy);
 }
 const dx=next.x-item.x,dz=next.z-item.z,dy=(next.elevation||0)-(item.elevation||0);
 if(Math.abs(dx)+Math.abs(dy)+Math.abs(dz)<1e-9)return members.map(m=>({...m}));
 const moved=members.map((m,i)=>i===0?next:{...m,x:rounded(m.x+dx),z:rounded(m.z+dz),elevation:rounded((m.elevation||0)+dy)});
 if(moved.some(m=>Math.abs(m.x)>100||Math.abs(m.z)>100||m.elevation<0||m.elevation>6))throw Error('Föremålet eller en fäst del når projektets höjd- eller ytgräns.');
 return moved;
}
