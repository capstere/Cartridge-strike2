/** Find a real standing-height pane with walkable space on both sides. */
export function glassCrossing(world){
  for(const pane of world.glass.panes.values()){
    if(pane.broken||pane.h<1.7||pane.y-pane.h/2>.12)continue;
    const dx=Math.sin(pane.angle),dz=Math.cos(pane.angle);
    const x=pane.x-dx*.8,z=pane.z-dz*.8;
    if(!world.canOccupy(x,z,.22,1.7)||!world.canOccupy(x+dx*1.6,z+dz*1.6,.22,1.7))continue;
    const from={x,y:1.58,z},dir={x:dx,y:0,z:dz};
    if(pane.parts.some(p=>p.id===world.raycast(from,dir,1.6)?.id))
      return {pane,from,dir,pose:{x,z,y:0,pitch:0,yaw:Math.atan2(-dx,-dz)}};
  }
  throw Error('No standing-height glass crossing found on Floor 5.');
}
