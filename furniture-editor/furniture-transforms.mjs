/** Authored instance transforms only. Never modifies a shared mesh or source asset. */
import {wallFootprint} from './model-alignment.mjs?v=5.8.0';
import {poseOnWall} from './wall-mounts.mjs?v=5.8.0';
export const turnAngle=a=>Math.atan2(Math.sin(a),Math.cos(a));
function descendants(root,items){const result=[root],seen=new Set([root.id]);for(let i=0;i<result.length;i++)for(const item of items)if(item.mountId===result[i].id&&!seen.has(item.id)){seen.add(item.id);result.push(item);}return result.slice(1);}
export function rotateFurniture(item,items,walls,delta){
 const children=descendants(item,items);
 if(item.wallMount){
  if(item.collision&&item.collision!=='none')return 'Väggmöbeln blockerar spelaren. Välj Dekoration under Finjustera innan du lutar den.';
  if(children.length)return 'Flytta först föremålen som står på väggmöbeln. Den kan inte lutas med föremål ovanpå.';
  const next={...item,wallRoll:turnAngle((item.wallRoll||0)+delta)},pose=poseOnWall(next,item.wallMount,walls);
  if(!pose||Math.abs(pose.wallMount.t-item.wallMount.t)>1e-6||Math.abs(pose.wallMount.y-item.wallMount.y)>1e-6)return 'Rotationen får inte plats vid väggfästet. Flytta föremålet eller välj en mindre vinkel.';
  Object.assign(item,next,pose,{collision:item.collision});return null;
 }
 const c=Math.cos(delta),s=Math.sin(delta);
 for(const child of children){const x=child.x-item.x,z=child.z-item.z;child.x=item.x+c*x+s*z;child.z=item.z-s*x+c*z;child.yaw=turnAngle(child.yaw+delta);}
 item.yaw=turnAngle(item.yaw+delta);return null;
}
export function mirrorFurniture(item,items){
 // Mirror horizontal coordinates in the calibrated front frame, never through the wall.
 const axis=item.yaw+wallFootprint(item).frontAngle,c=Math.cos(axis),s=Math.sin(axis);
 for(const child of descendants(item,items)){
  const dx=child.x-item.x,dz=child.z-item.z,x=c*dx-s*dz,z=s*dx+c*dz;
  child.x=item.x-c*x+s*z;child.z=item.z+s*x+c*z;
  child.yaw=turnAngle(2*axis-child.yaw-2*wallFootprint(child).frontAngle);child.mirrored=!child.mirrored;
 }
 item.mirrored=!item.mirrored;
}
