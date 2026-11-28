// Run inside the original map after its native light bake resolves.
// The source's lampAt includes the map-specific lamp strength and occlusion.
exports.capture=async function captureReferenceLighting(){
  await LIGHT.ready;
  if(!LIGHT.data)throw Error('The original light bake is unavailable.');
  const step=Math.max(1.5,LIGHT.d), nx=Math.ceil(LIGHT.nx*LIGHT.d/step),
    ny=Math.ceil(LIGHT.ny*LIGHT.d/step),nz=Math.ceil(LIGHT.nz*LIGHT.d/step);
  const bounce=CURMAP.def.atmo.bounce, c=new THREE.Color(), volume=new Uint8Array(nx*ny*nz*4);
  let maximum=0,lit=0;
  for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
    const px=LIGHT.x0+(x+.5)*step,py=(y+.5)*step,pz=LIGHT.z0+(z+.5)*step;
    const [sky,reflected]=lightAt(px,py,pz);
    const lamp=lampAt(px,py,pz,c);
    const channels=[lamp.r,lamp.g,lamp.b];
    if(Math.max(...channels)>.03)lit++;
    const index=((y*nz+z)*nx+x)*4;
    for(let k=0;k<3;k++){
      const irradiance=channels[k]+bounce[k]*reflected/Math.PI;
      maximum=Math.max(maximum,irradiance);
      volume[index+k]=Math.round(255*Math.sqrt(Math.min(1,irradiance/8)));
    }
    volume[index+3]=Math.round(sky*255);
  }
  let raw='';
  for(let i=0;i<volume.length;i+=8192)raw+=String.fromCharCode(...volume.subarray(i,i+8192));
  return {version:1,id:CURMAP.id,x:LIGHT.x0,z:LIGHT.z0,step,nx,nz,ny,range:8,maximum,lit,source:
    {nx:LIGHT.nx,nz:LIGHT.nz,ny:LIGHT.ny,nyL:LIGHT.nyL,step:LIGHT.d,
     lights:LAMPS.length,lampGain:WMU.uVolL.value.x},rgba:btoa(raw)};
};
