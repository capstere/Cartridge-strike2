/** Seal raster-thin butt joints of a window's solid sill/header bands only.
 * Never span an authored gap or change a door aperture. Both the Studio and
 * engine use the same description; canonical Floor 5 stays untouched.
 */
export function sealWindowBands(description,data){
 if(!data.__custom)return description;
 const ids=new Set(data.walls.map(w=>w.id));
 const originals=description.boxes.filter(b=>b.material==='wall'&&
  (ids.has(b.id)||b.id.endsWith('-sill-wall')||b.id.endsWith('-header'))).map(b=>({...b}));
 for(const band of description.boxes){
  if(band.jointSealed||!(band.id.endsWith('-sill-wall')||band.id.endsWith('-header')))continue;
  const angle=band.angle||0,ux=Math.cos(angle),uz=-Math.sin(angle);
  let left=false,right=false;
  for(const other of originals){
   if(other.id===band.id||Math.abs(Math.sin((other.angle||0)-angle))>1e-6||
    Math.abs(other.d-band.d)>1e-6||Math.abs((other.x-band.x)*(-uz)+(other.z-band.z)*ux)>1e-5||
    other.y-other.h/2>band.y-band.h/2+1e-5||other.y+other.h/2<band.y+band.h/2-1e-5)continue;
   const center=(other.x-band.x)*ux+(other.z-band.z)*uz;
   // Contacts only, <=0.0015 rounding error. Actual holes need a project edit.
   if(Math.abs(center+other.w/2+band.w/2)<=.0015)left=true;
   if(Math.abs(center-other.w/2-band.w/2)<=.0015)right=true;
  }
  if(!left&&!right)continue;
  const shift=((right?.002:0)-(left?.002:0))/2;
  band.x+=ux*shift;band.z+=uz*shift;band.w+=(left?.002:0)+(right?.002:0);
  band.d+=.0001;band.jointSealed=true;
 }
 return description;
}
