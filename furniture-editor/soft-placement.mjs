/** Bounded, deterministic Sims-like suggestion. Never rejects an exact placement. */
export function findNearbyFreePlacement(item,isFree,{step=.2,maxRadius=.8}={}){
 if(!item||![item.x,item.z].every(Number.isFinite)||typeof isFree!=='function')
  throw Error('Missing furniture position or checker');
 if(isFree(item))return {item,adjusted:false};
 const seen=new Set([item.x+':'+item.z]);
 const round=n=>Math.round(n*10)/10;
 for(let r=step;r<=maxRadius+1e-8;r+=step){
  const count=Math.max(12,Math.ceil(2*Math.PI*r/step));
  for(let i=0;i<count;i++){
   const angle=2*Math.PI*i/count;
   const candidate={...item,x:round(item.x+r*Math.cos(angle)),z:round(item.z+r*Math.sin(angle))};
   const key=candidate.x+':'+candidate.z;
   if(seen.has(key))continue;
   seen.add(key);
   if(isFree(candidate))return {item:candidate,adjusted:true};
  }
 }
 return {item,adjusted:false};
}
