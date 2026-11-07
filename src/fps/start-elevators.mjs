/** Two-leaf doors in stationary cabins. Simulation, rendering and rays share these boxes. */
export function createStartElevators(doors){
 const cabins=doors.filter(d=>d.startElevator).map(d=>{
  const ux=(d.b[0]-d.a[0])/d.width,uz=(d.b[1]-d.a[1])/d.width;
  const w=d.width/2,angle=-Math.atan2(uz,ux);
  const panels=[-1,1].map(side=>{
   const x=d.center[0],z=d.center[1],extent=w*2+.08;
   return {id:d.id+'-slider-'+side,doorId:d.id,side,x,z,y:1.135,w,h:2.27,d:.07,angle,cos:ux,sin:-uz,material:'metal',
    broadphaseBounds:{minX:x-Math.abs(ux)*extent-.08,maxX:x+Math.abs(ux)*extent+.08,minZ:z-Math.abs(uz)*extent-.08,maxZ:z+Math.abs(uz)*extent+.08}};
  });
  return {id:d.id,x:d.center[0],z:d.center[1],ux,uz,panels};
 });
 let progress=-1;
 const setProgress=value=>{
  const next=Math.max(0,Math.min(1,value));if(next===progress)return false;
  for(const c of cabins)for(const panel of c.panels){
   const offset=panel.side*(panel.w/2+next*(panel.w+.035));
   panel.x=c.x+c.ux*offset;panel.z=c.z+c.uz*offset;
  }
  progress=next;return true;
 };
 setProgress(1); // Studio walks and engine validation inspect the traversable, active-round state.
 return {cabins,boxes:cabins.flatMap(c=>c.panels),setProgress,get progress(){return progress;}};
}

export function addCabinFittings(description,configs,floors){
 for(const c of configs){
  const f=floors.find(v=>v.id===c.floorId),x=(f.x0+f.x1)/2,z=(f.z0+f.z1)/2,w=f.x1-f.x0,d=f.z1-f.z0;
  const metal=[.53,.57,.58],trim=[.22,.25,.26],lit=[.95,.96,.91];
  const box=(name,px,py,pz,width,height,depth,color,material='metal')=>description.boxes.push({
   id:c.doorId+'-cab-'+name,x:px,y:py,z:pz,w:width,h:height,d:depth,color,material,decorative:true});
  box('rear-laminate',x,1.35,f.z0+.057,w-.12,2.65,.014,[.69,.64,.53],'wall');
  box('rear-rail',x,.96,f.z0+.14,w-.27,.045,.05,metal);
  for(const side of [-1,1]){
   box('side-'+side,x+side*(w/2-.057),1.35,z,.014,2.65,d-.12,metal);
   box('rail-'+side,x+side*(w/2-.14),.96,z,.05,.045,d-.42,metal);
  }
  box('ceiling-light',x,2.79,z,w*.72,.035,d*.67,lit,'emissive');
  const panelX=f.x1-.069,panelZ=f.z1-.38;
  box('controls',panelX,1.38,panelZ,.02,.46,.22,trim);
  box('button',panelX-.013,1.29,panelZ,.01,.045,.045,lit,'emissive');
  // A seven-segment 5, facing into the cabin above the controls.
  for(const [i,[dy,dz,h,b]] of [[.09,0,.012,.078],[0,0,.012,.078],[-.09,0,.012,.078],[.045,-.034,.09,.012],[-.045,.034,.09,.012]].entries())
   box('five-'+i,panelX-.015,1.49+dy,panelZ+dz,.006,h,b,lit,'emissive');
 }
}
