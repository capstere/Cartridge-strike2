// Riposte lightFinish, lightAt, lampAt and volLamp (MIT) provide the occluded
// RGB lamp irradiance and bounced light. The low grid is sampled once per pixel.
import * as THREE from '../../vendor/three/three.module.js';

export async function referenceLighting({id,folder,signal,materials,own,disposed}){
  const response=await fetch(new URL('lighting.json.gz',folder),{signal});
  if(!response.ok)throw Error('Map lighting could not be loaded.');
  const raw=await response.arrayBuffer(),prefix=new Uint8Array(raw,0,2);
  const grid=prefix[0]===31&&prefix[1]===139?
    await new Response(new Blob([raw]).stream().pipeThrough(new DecompressionStream('gzip'))).json():
    JSON.parse(new TextDecoder().decode(raw));
  if(disposed())return;
  const count=grid.nx*grid.nz*grid.ny,bytes=atob(grid.rgba);
  if(grid.id!==id||grid.version!==1||count<1||count>500000||bytes.length!==count*4)throw Error('Invalid map lighting.');
  const volume=new THREE.Data3DTexture(Uint8Array.from(bytes,c=>c.charCodeAt(0)),grid.nx,grid.nz,grid.ny);
  volume.format=THREE.RGBAFormat;volume.unpackAlignment=1;
  volume.minFilter=volume.magFilter=THREE.LinearFilter;volume.needsUpdate=true;
  own.push(volume);
  const uniforms={
    sourceLight:{value:volume},lightOrigin:{value:new THREE.Vector3(grid.x,0,grid.z)},
    lightInv:{value:new THREE.Vector3(1/(grid.step*grid.nx),1/(grid.step*grid.ny),1/(grid.step*grid.nz))},
    lightRange:{value:grid.range}
  };
  for(const material of Object.values(materials)){
    if(!material.isMeshLambertMaterial)continue;
    material.onBeforeCompile=shader=>{
      Object.assign(shader.uniforms,uniforms);
      shader.vertexShader=shader.vertexShader.replace('#include <common>',
        '#include <common>\nvarying vec3 sourceLightPosition;').replace('#include <project_vertex>',
        'sourceLightPosition=(modelMatrix*vec4(transformed,1.)).xyz;\n#include <project_vertex>');
      shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
        varying vec3 sourceLightPosition;uniform highp sampler3D sourceLight;
        uniform vec3 lightOrigin,lightInv;uniform float lightRange;`).replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
        vec3 lightUV=(sourceLightPosition-lightOrigin)*lightInv;
        vec4 lamp=texture(sourceLight,clamp(lightUV.xzy,0.,1.));
        reflectedLight.indirectDiffuse+=lamp.rgb*lamp.rgb*lightRange*diffuseColor.rgb;`);
    };
    material.needsUpdate=true;
  }
}
