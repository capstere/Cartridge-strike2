/** Local, bind-space appearance edits only. No bone, UV, index or weight mutation.
 * Quaternius actor measurements are in metres. Existing projects default to 100%.
 * Not a skeletal retargeter: validate extreme silhouettes through each animation.
 */
export const BODY_REGIONS=Object.freeze({
 shoulders:Object.freeze({min:78,max:112,label:'Axlar'}),
 chest:Object.freeze({min:78,max:120,label:'Bröstkorg'}),
 arms:Object.freeze({min:70,max:120,label:'Överarmar'}),
 waist:Object.freeze({min:78,max:120,label:'Midja'})
});
export const DEFAULT_REGIONS=Object.freeze({shoulders:100,chest:100,arms:100,waist:100});
const clamp=(v,min=0,max=1)=>Math.max(min,Math.min(max,v));
const smooth=t=>{const x=clamp(t);return x*x*(3-2*x);};
const windowWeight=(y,a,b,fade)=>smooth((y-a)/fade)*smooth((b-y)/fade);
export function bodyRegions(body={}){
 const result={};
 for(const [key,range] of Object.entries(BODY_REGIONS)){
  const value=body?.[key]??100;
  if(typeof value!=='number'||!Number.isFinite(value)||value<range.min||value>range.max)
   throw Error('Ogiltigt kroppsreglage: '+key);
  result[key]=value;
 }
 return result;
}
/** A bounded, symmetric local silhouette adjustment on clothed torso/arms/waist.
 * Position coordinates are from the source bind pose; apply after garment fit.
 * Head, eyes, hands, skeleton and joints are deliberately not touched.
 */
export function shapeBodyVertex(x,y,z,profile={},materialName='jacket-fabric'){
 const b=bodyRegions(profile);
 if(!['jacket-fabric','vest-shell','trousers-fabric'].includes(materialName))return [x,y,z];
 const torso=materialName!=='trousers-fabric';
 const ax=Math.abs(x);
 const sh=torso?(b.shoulders-100)/100*windowWeight(y,1.27,1.60,.13)*smooth((ax-.11)/.23):0;
 const chest=torso?(b.chest-100)/100*windowWeight(y,1.17,1.51,.13)*(1-smooth((ax-.23)/.19)):0;
 const arm=torso?(b.arms-100)/100*windowWeight(y,1.08,1.57,.12)*smooth((ax-.27)/.17):0;
 const waist=(b.waist-100)/100*windowWeight(y,.88,1.22,.14)*(1-smooth((ax-.28)/.16));
 // Mild radial changes around the upper arm; don't move hands or elbow origins.
 return [
  x*(1+.70*sh+.40*chest+.75*waist),
  y+(y-1.30)*.30*arm,
  z*(1+.18*sh+.75*chest+.75*arm+.85*waist)
 ];
}
export function applyBodyRegions(position,body,materialName){
 if(!position||typeof position.count!=='number'||typeof position.getX!=='function'||typeof position.setXYZ!=='function')
  throw Error('Meshens positioner saknas.');
 const b=bodyRegions(body);
 if(Object.values(b).every(v=>v===100))return false;
 if(!['jacket-fabric','vest-shell','trousers-fabric'].includes(materialName))return false;
 for(let i=0;i<position.count;i++){
  const next=shapeBodyVertex(position.getX(i),position.getY(i),position.getZ(i),b,materialName);
  if(!next.every(Number.isFinite))throw Error('Kroppsformningen gav ogiltig geometri.');
  position.setXYZ(i,...next);
 }
 position.needsUpdate=true;
 return true;
}
