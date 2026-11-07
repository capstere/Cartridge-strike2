/**
 * Presentation for smart placement; the pose comes from the same pure algorithm
 * used by the editor for actual placement. Highlights never create colliders.
 */
import {wallFootprint} from './model-alignment.mjs?v=5.8.0';
import {inferPlacementRole,proposeSmartPose} from './smart-placement.mjs?v=5.8.1';
import {mountedSurface} from './furniture-surfaces.mjs?v=5.8.1';

const finite=n=>typeof n==='number'&&Number.isFinite(n);
const normalWall=w=>w&&!w.deleted&&w.kind==='wall';
const label=o=>String(o?.assetName||o?.name||'möbeln').slice(0,65);

/** Prefer the visible 3D hit over an imaginary ground point behind the model. */
export function preferredPlacementPoint(pick,objects=[],walls=[]){
 if(!pick)return null;
 const support=objects.some(o=>o.id===pick.id&&!o.deleted);
 const onWall=walls.some(w=>w.id===pick.id&&['wall','window','glazed'].includes(w.kind)&&!w.deleted);
 return (support||onWall)&&pick.surface||pick.ground||null;
}
/** Recompute using exactly the same placement math as the final click. */
export function placementPreview(item,point,objects=[],walls=[],{mode='auto',floors=[]}={}){
 if(!item||!point||![point.x,point.z].every(finite))return null;
 const pose=proposeSmartPose(item,point,objects,{mode,walls,floors});
 if(pose.wallMount){
  const wall=walls.find(w=>w.id===pose.wallMount.wallId&&normalWall(w));
  if(wall){
   const fit=wallFootprint(item),a=pose.wallMount.frame===1&&(wall.a[0]>wall.b[0]||wall.a[0]===wall.b[0]&&wall.a[1]>wall.b[1])?wall.b:wall.a,b=a===wall.a?wall.b:wall.a;
   const dx=b[0]-a[0],dz=b[1]-a[1],len=Math.hypot(dx,dz),nx=-dz/len*pose.wallMount.side,nz=dx/len*pose.wallMount.side;
   const back=fit.depth/2+.008;
   return {kind:'wall',targetId:wall.id,
    label:'Väggen är vald – klicka för att hänga upp',
    pose,
    surface:{x:pose.x-nx*back,z:pose.z-nz*back,y:pose.wallMount.y,
     w:fit.width+.13,d:.008,h:fit.height+.13,yaw:Math.atan2(nx,nz)}};
  }
 }
 if(pose.mountId){
  const support=objects.find(o=>o.id===pose.mountId&&!o.deleted);
  if(support){
   const shelf=mountedSurface(pose,support),c=Math.cos(support.yaw||0),s=Math.sin(support.yaw||0);
   return {kind:'surface',targetId:support.id,
    label:(shelf?shelf.label+' på ':'Ovanpå ')+label(support)+' – klicka för att placera',
    pose,
    surface:{x:support.x+(shelf?c*shelf.x+s*shelf.z:0),z:support.z+(shelf?-s*shelf.x+c*shelf.z:0),y:pose.elevation+.026,
     w:Math.max(.12,(shelf?.width||support.w)*.96),d:Math.max(.12,(shelf?.depth||support.d)*.96),h:.032,yaw:support.yaw||0}};
  }
 }
 const desired=mode==='wall'?'wall':mode==='surface'?'countertop':
  mode==='floor'?'floor':inferPlacementRole(item);
 return {kind:desired==='wall'?'needs-wall':['countertop','desk-edge'].includes(desired)?'needs-surface':'floor',
  targetId:null,pose,
  label:pose.blocked|| (desired==='wall'?'Peka på en hel väggyta':
   ['countertop','desk-edge'].includes(desired)?'Peka på en möbelyta – annars kan du placera på golvet':
   'Fri placering på golvet'),
  surface:null};
}
