/** Conservative occlusion of an entire furnishing cell by one opaque wall rectangle.
 * At a plane separating eye and box, perspective projects the box into the hull of
 * its projected corners. All eight corners must fit inside the same solid span.
 * Never join disjoint walls or fill openings, windows or glazed sections.
 */
function span(x,z,ux,uz,width,height){
 return {x,z,ux,uz,nx:-uz,nz:ux,half:width/2-.008,height:height-.008};
}
export function furnitureVisibility(world){
 const walls=world.data.walls.filter(w=>w.surfaceType==='opaque').map(w=>{
  const dx=w.b[0]-w.a[0],dz=w.b[1]-w.a[1],width=Math.hypot(dx,dz);
  return span((w.a[0]+w.b[0])/2,(w.a[1]+w.b[1])/2,dx/width,dz/width,width,w.height);
 });
 const lifts=world.doors.elevators;
 let lastX,lastY,lastZ,lastProgress,near=[];
 function update(eye){
  if(eye.x===lastX&&eye.y===lastY&&eye.z===lastZ&&lastProgress===lifts.progress)return false;
  lastX=eye.x;lastY=eye.y;lastZ=eye.z;lastProgress=lifts.progress;
  const slides=lifts.progress===0?lifts.cabins.map(c=>span(c.x,c.z,c.ux,c.uz,c.panels[0].w*2,c.panels[0].h)):
   lifts.boxes.map(b=>span(b.x,b.z,b.cos,-b.sin,b.w,b.h));
  near=[];
  for(const s of [...walls,...slides]){
   const dx=eye.x-s.x,dz=eye.z-s.z,normal=dx*s.nx+dz*s.nz,along=dx*s.ux+dz*s.uz;
   const distance=normal*normal+Math.max(0,Math.abs(along)-s.half)**2;
   if(Math.abs(normal)<.12||distance>144)continue;
   near.push({s,normal,along,distance});
  }
  near.sort((a,b)=>a.distance-b.distance);return true;
 }
 function hidden(bounds){
  wall:for(const {s,normal,along} of near){
   for(let i=0;i<4;i++){
    const dx=(i&1?bounds.max.x:bounds.min.x)-lastX,dz=(i&2?bounds.max.z:bounds.min.z)-lastZ;
    const t=-normal/(dx*s.nx+dz*s.nz);
    if(!(t>0&&t<1)||Math.abs(along+t*(dx*s.ux+dz*s.uz))>=s.half||
       lastY+t*(bounds.min.y-lastY)<=.008||lastY+t*(bounds.max.y-lastY)>=s.height)continue wall;
   }
   return true;
  }
  return false;
 }
 return {update,hidden};
}
