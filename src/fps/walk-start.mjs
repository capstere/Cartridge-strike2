/** Find a legal standing position in a draft without requiring any gameplay layer. */
export function findWalkStart(world){
 const free=p=>p&&world.staticCanOccupy(p.x,p.z,.22,1.7,0);
 for(const p of [...world.anchors.analysts,...world.anchors.counterAnalysts])if(free(p))return {x:p.x,z:p.z,yaw:p.yaw||0};
 for(const floor of [...world.data.rooms,...world.data.corridors]){
  const xs=floor.polygon.map(p=>p[0]),zs=floor.polygon.map(p=>p[1]);
  const minX=Math.min(...xs),maxX=Math.max(...xs),minZ=Math.min(...zs),maxZ=Math.max(...zs);
  const center={x:(minX+maxX)/2,z:(minZ+maxZ)/2,yaw:0};if(free(center))return center;
  for(let x=minX+.3;x<maxX;x+=.5)for(let z=minZ+.3;z<maxZ;z+=.5)if(free({x,z}))return {x,z,yaw:0};
 }
 return null;
}
