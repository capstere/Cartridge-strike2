import {isTable} from './appearance.mjs?v=5.8.0';
/** Model-space front; bounds are measured from the unchanged GLB, before normalization. */
import {LIBRARY_MAP} from './library/catalog.mjs?v=5.8.0';
export const MODEL_FRONTS=['-z','+z','+x','-x'];
export function modelFront(item){return item.wallFacing||LIBRARY_MAP.get(item.assetId)?.wallFacing||'-z';}
export function validModelAlignment(item){return (item.mirrored===undefined||typeof item.mirrored==='boolean')&&(item.wallRoll===undefined||Number.isFinite(item.wallRoll)&&Math.abs(item.wallRoll)<=Math.PI+1e-9)&&(item.wallFacing===undefined||MODEL_FRONTS.includes(item.wallFacing))&&
 (item.modelSize===undefined||Array.isArray(item.modelSize)&&item.modelSize.length===3&&item.modelSize.every(n=>Number.isFinite(n)&&n>0&&n<1e6));}
export function fittedSize(item){
 const size=item.modelSize;if(!size||isTable(item))return {w:item.w,d:item.d,h:item.height};
 const s=Math.min(item.w/size[0],item.height/size[1],item.d/size[2]);
 return {w:size[0]*s,h:size[1]*s,d:size[2]*s};
}
export function wallFootprint(item){const fit=fittedSize(item),front=modelFront(item),across=front.endsWith('x');
 const width=across?fit.d:fit.w,angle=item.wallRoll||0,c=Math.abs(Math.cos(angle)),s=Math.abs(Math.sin(angle));
 return {width:width*c+fit.h*s,depth:across?fit.w:fit.d,height:fit.h*c+width*s,
  frontAngle:{'-z':Math.PI,'+z':0,'+x':Math.PI/2,'-x':-Math.PI/2}[front]};}
