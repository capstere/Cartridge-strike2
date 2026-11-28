// Riposte's groundMat height blend and original map masks, adapted from r147
// to a single WebGL2 tile array. Sample the material in world metres.
import * as THREE from '../../vendor/three/three.module.js';

export async function referenceGround({id,bytes,material,own,disposed}){
  const raw=await bytes;
  if(disposed())return;
  const jsonLength=new DataView(raw).getUint32(0,true);
  const info=JSON.parse(new TextDecoder().decode(new Uint8Array(raw,4,jsonLength)));
  const {width,height,side,bounds,scales,dirt}=info,offset=4+jsonLength,maskBytes=width*height*4;
  if(info.version!==1||info.id!==id||![width,height].every(n=>Number.isInteger(n)&&n>0&&n<=600)||
      side!==256||raw.byteLength!==offset+maskBytes+side*side*16)
    throw Error('Invalid map ground.');
  const weights=new THREE.DataTexture(new Uint8Array(raw,offset,maskBytes),width,height);
  weights.minFilter=weights.magFilter=THREE.LinearFilter;
  const tiles=new THREE.DataArrayTexture(new Uint8Array(raw,offset+maskBytes),side,side,4);
  tiles.colorSpace=THREE.SRGBColorSpace;tiles.wrapS=tiles.wrapT=THREE.RepeatWrapping;
  tiles.generateMipmaps=true;tiles.minFilter=THREE.LinearMipmapLinearFilter;tiles.magFilter=THREE.LinearFilter;
  for(const tex of [weights,tiles]){tex.needsUpdate=true;own.push(tex);}
  const previous=material.onBeforeCompile.bind(material);
  material.onBeforeCompile=(shader,renderer)=>{
    previous(shader,renderer);
    Object.assign(shader.uniforms,{
      groundMask:{value:weights},groundTiles:{value:tiles},groundScales:{value:new THREE.Vector4(...scales)},
      groundBounds:{value:new THREE.Vector4(bounds[0],bounds[1],1/bounds[2],1/bounds[3])},groundDirt:{value:new THREE.Vector3(...dirt)}
    });
    shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec2 groundXZ;')
      .replace('#include <project_vertex>','groundXZ=(modelMatrix*vec4(transformed,1.)).xz;\n#include <project_vertex>');
    shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
      varying vec2 groundXZ;uniform sampler2D groundMask;uniform highp sampler2DArray groundTiles;
      uniform vec4 groundBounds,groundScales;uniform vec3 groundDirt;`)
      .replace('#include <map_fragment>',`
        vec4 sp=texture2D(groundMask,(groundXZ-groundBounds.xy)*groundBounds.zw);
        vec2 p=vec2(groundXZ.x,-groundXZ.y),dx=dFdx(p),dy=dFdy(p);
        vec4 w=vec4(max(0.,1.-sp.r-sp.g-sp.b),sp.rgb);
        // The source's contribution threshold removes zero-weight layers.
        // Skip the three unnecessary taps on pure roads, squares and ash.
        if(max(max(w.y,w.z),w.w)<.002){
          diffuseColor.rgb*=textureGrad(groundTiles,vec3(p/groundScales.x,0.),dx/groundScales.x,dy/groundScales.x).rgb*mix(vec3(1.),groundDirt,sp.a);
        }else if(w.y==1.&&w.z+w.w==0.){
          diffuseColor.rgb*=textureGrad(groundTiles,vec3(p/groundScales.y,1.),dx/groundScales.y,dy/groundScales.y).rgb;
        }else if(w.z==1.&&w.y+w.w==0.){
          diffuseColor.rgb*=textureGrad(groundTiles,vec3(p/groundScales.z,2.),dx/groundScales.z,dy/groundScales.z).rgb;
        }else{
          vec4 c0=textureGrad(groundTiles,vec3(p/groundScales.x,0.),dx/groundScales.x,dy/groundScales.x);
          vec4 c1=textureGrad(groundTiles,vec3(p/groundScales.y,1.),dx/groundScales.y,dy/groundScales.y);
          vec4 c2=textureGrad(groundTiles,vec3(p/groundScales.z,2.),dx/groundScales.z,dy/groundScales.z);
          vec4 c3=textureGrad(groundTiles,vec3(p/groundScales.w,3.),dx/groundScales.w,dy/groundScales.w);
          vec4 hh=vec4(c0.a,c1.a,c2.a,c3.a)*.6+w;
          float hm=max(max(hh.x,hh.y),max(hh.z,hh.w))-.18;
          vec4 bw=max(hh-hm,0.)*step(.002,w);bw/=max(dot(bw,vec4(1.)),.0001);
          diffuseColor.rgb*=c0.rgb*mix(vec3(1.),groundDirt,sp.a)*bw.x+c1.rgb*bw.y+c2.rgb*bw.z+c3.rgb*bw.w;
        }`);
  };
  material.customProgramCacheKey=()=>id+'-reference-ground-v2';
  material.needsUpdate=true;
}
