/** Cosmetic ceiling fittings. Uses accepted room polygons and real ceiling support.
 * No fixture, collider, navigation or alarm records are written to the project.
 */
const inside=(x,z,p)=>{let hit=false;for(let i=0,j=p.length-1;i<p.length;j=i++){
 const a=p[i],b=p[j];if((a[1]>z)!==(b[1]>z)&&x<(b[0]-a[0])*(z-a[1])/(b[1]-a[1])+a[0])hit=!hit;
}return hit;};
function nearBox(x,z,b,padding){
 const c=Math.cos(b.angle||0),s=Math.sin(b.angle||0),dx=x-b.x,dz=z-b.z;
 return Math.abs(c*dx-s*dz)<b.w/2+padding&&Math.abs(s*dx+c*dz)<b.d/2+padding;
}
export function planSmokeDetectors(world){
 const ceilings=world.description.surfaces.filter(s=>s.material==='ceiling'&&s.y>2.3),result=[];
 const authored=world.projectScene?.items.filter(o=>/smoke.?detector|rökdetektor|brandvarnare/i.test(o.assetName||o.assetId||''))||[];
 for(const room of [...world.data.rooms,...world.data.corridors]){
  if(!/^C/.test(room.id)&&!['I01','I02','I04','I12','I13','I14','I16','I17','I22','I23','I24','I25','I26'].includes(room.id))continue;
  const p=room.polygon,xs=p.map(v=>v[0]),zs=p.map(v=>v[1]),x0=Math.min(...xs),z0=Math.min(...zs),w=Math.max(...xs)-x0,d=Math.max(...zs)-z0;
  const nx=Math.max(1,Math.ceil(w/10)),nz=Math.max(1,Math.ceil(d/10));
  for(let iz=0;iz<nz;iz++)for(let ix=0;ix<nx;ix++){
   const cx=x0+(ix+.5)*w/nx,cz=z0+(iz+.5)*d/nz;
   const offsets=[];
   for(let oz=-Math.min(3,d/nz/2-.25);oz<=Math.min(3,d/nz/2-.25);oz+=.35)
    for(let ox=-Math.min(3,w/nx/2-.25);ox<=Math.min(3,w/nx/2-.25);ox+=.35)offsets.push([ox,oz]);
   offsets.push([0,0]);offsets.sort((a,b)=>Math.hypot(...a)-Math.hypot(...b));
   for(const [ox,oz] of offsets){
    const x=cx+ox,z=cz+oz;
    if(!world.canOccupy(x,z,.2)||world.roomAt(x,z)?.id!==room.id||![[0,0],[.22,0],[-.22,0],[0,.22],[0,-.22]].every(([a,b])=>inside(x+a,z+b,p)))continue;
    const ceiling=ceilings.find(s=>[[0,0],[.15,0],[-.15,0],[0,.15],[0,-.15]].every(([a,b])=>inside(x+a,z+b,s.polygon)));
    if(!ceiling)continue;
    const y=ceiling.y;
    if(world.description.boxes.some(b=>b.y+b.h/2>y-.22&&b.y-b.h/2<y&&nearBox(x,z,b,['emissive','light'].includes(b.material)?.45:.18)))continue;
    if(authored.some(o=>Math.hypot(o.x-x,o.z-z)<3)||result.some(o=>Math.hypot(o.x-x,o.z-z)<2))continue;
    result.push({roomId:room.id,x,z,y});break;
   }
  }
 }
 return result;
}
