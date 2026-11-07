/** Stateless view-local furniture placement: never accesses camera controls or room selector. */
export function findCameraPlacement(entry,focus,rooms,objects,data,helpers,{maxRadius=2.6}={}){
 const {inside,round,validate}=helpers;
 if(![entry?.width,entry?.depth,entry?.height,focus?.x,focus?.z].every(Number.isFinite)||
    !Array.isArray(rooms)||typeof inside!=='function'||typeof validate!=='function'||typeof round!=='function')return null;
 const room=rooms.find(r=>r.status==='included'&&inside(focus.x,focus.z,r.polygon));
 if(!room)return null;
 let trials=0;
 const tryPoint=(x,z)=>{
  const obj={id:'temporary',kind:'prop',roomId:room.id,x:round(x),z:round(z),yaw:0,
   w:entry.width,d:entry.depth,height:entry.height};
  trials++;
  return validate(obj,objects,data)?null:{x:obj.x,z:obj.z,roomId:room.id};
 };
 const first=tryPoint(focus.x,focus.z);
 if(first)return first;
 for(let radius=.2;radius<=maxRadius+1e-6;radius+=.2){
  const count=Math.max(12,Math.ceil(radius*18));
  for(let i=0;i<count;i++){
   const theta=2*Math.PI*i/count;
   const placed=tryPoint(focus.x+radius*Math.cos(theta),focus.z+radius*Math.sin(theta));
   if(placed)return placed;
   if(trials>950)return null;
  }
 }
 return null;
}
