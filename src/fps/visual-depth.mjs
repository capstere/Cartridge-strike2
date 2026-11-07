/** Render-only contact shading. Linear HDR world -> half-resolution AO ->
 * depth-aware filtering and ACES/sRGB once. No state/RNG/physics writes.
 * Low graphics and devices without float colour buffers retain direct rendering.
 * This is a screen-space approximation, NOT ray-traced global illumination. */
import * as THREE from '../../vendor/three/three.module.js';
export const DEPTH_STYLE=Object.freeze({radius:.35,strength:1.9,minLight:.68,samples:20});
const vertex=`varying vec2 vUv;void main(){vUv=uv;gl_Position=vec4(position.xy,0.0,1.0);}`;
const reconstruct=`
 uniform sampler2D tDepth;uniform mat4 inverseProjection;uniform vec2 depthResolution;
 vec3 pointAtPixel(vec2 pixel){
 // Nearest-filtered depth belongs to the sampled pixel centre, not the
 // unsnapped half-resolution/sample UV. Mixing these creates false creases
 // on a perfectly flat oblique wall.
 vec2 uv=(clamp(pixel,vec2(0.0),depthResolution-1.0)+.5)/depthResolution;
 float z=texture2D(tDepth,clamp(uv,vec2(.0001),vec2(.9999))).x;
 vec4 p=inverseProjection*vec4(uv*2.0-1.0,z*2.0-1.0,1.0);return p.xyz/max(p.w,.00001);}
 vec3 pointAt(vec2 uv){return pointAtPixel(floor(uv*depthResolution));}`;
const occlusion=`varying vec2 vUv;${reconstruct}
 uniform vec2 resolution;uniform float projectionScale;uniform float radius;uniform float strength;uniform float minLight;
 void main(){
  float visibility=1.0;
  if(texture2D(tDepth,vUv).x<.99999){
   vec2 texel=1.0/resolution,pixel=floor(vUv*depthResolution);vec3 p=pointAtPixel(pixel);
   // Half-resolution centres lie on full-resolution texel boundaries. Offset
   // integer pixel indices, NOT floating UVs: UV rounding can otherwise sample
   // the centre twice, collapse the tangent and invent a front-facing normal.
   vec3 l=pointAtPixel(pixel-vec2(1,0)),r=pointAtPixel(pixel+vec2(1,0));
   vec3 b=pointAtPixel(pixel-vec2(0,1)),u=pointAtPixel(pixel+vec2(0,1));
   vec3 dx=abs(l.z-p.z)<abs(r.z-p.z)?p-l:r-p,dy=abs(b.z-p.z)<abs(u.z-p.z)?p-b:u-p;
   vec3 n=cross(dx,dy);n=length(n)>.00000000000001?normalize(n):vec3(0,0,1);if(dot(n,-p)<0.0)n=-n;
   float pixels=clamp(projectionScale*radius/max(.25,-p.z),1.0,32.0),sum=0.0;
   // Deterministic interleaved rotation is spatially filtered below. No moving noise.
   float phase=fract(52.9829189*fract(dot(floor(vUv*resolution*.5),vec2(.06711056,.00583715))))*6.2831853;
   for(int i=0;i<20;i++){
    float a=float(i)*2.39996323+phase,ring=sqrt((float(i)+.5)/20.0);
    vec2 uv=vUv+vec2(cos(a),sin(a))*texel*pixels*ring;
    if(uv.x<=0.0||uv.x>=1.0||uv.y<=0.0||uv.y>=1.0||texture2D(tDepth,uv).x>=.99999)continue;
    vec3 d=pointAt(uv)-p;float len=length(d);
    // Reject coplanar samples using a small world-space bias.
    float height=dot(n,d),planeBias=max(.008,abs(p.z)*.0005);
    sum+=smoothstep(planeBias,planeBias*2.0,height)*max(0.0,height/max(len,.001)-.10)*(1.0-smoothstep(radius*.3,radius*1.5,len))*smoothstep(.012,.05,len);
   }
   visibility=clamp(1.0-strength*sum/20.0,minLight,1.0);
  }
  gl_FragColor=vec4(vec3(visibility),1.0);
 }`;
const composite=`varying vec2 vUv;${reconstruct}
 uniform sampler2D tColor;uniform sampler2D tAO;uniform vec2 aoResolution;
 void main(){
  float centerZ=pointAt(vUv).z,total=0.0,weight=0.0;
  // Reject taps across silhouettes instead of spreading dark halos onto the wall.
  for(int y=-1;y<=1;y++)for(int x=-1;x<=1;x++){
   vec2 uv=clamp(vUv+vec2(float(x),float(y))/aoResolution,vec2(.0001),vec2(.9999));
   float w=exp(-abs(pointAt(uv).z-centerZ)/max(.025,abs(centerZ)*.008));
   w*=x==0&&y==0?4.0:(x==0||y==0?2.0:1.0);
   total+=texture2D(tAO,uv).r*w;weight+=w;
  }
  float ao=total/max(weight,.00001);
  gl_FragColor=vec4(max(texture2D(tColor,vUv).rgb*ao,vec3(0.0)),1.0);
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
 }`;
export class VisualDepth{
 constructor(renderer){
  this.renderer=renderer;this.disposed=false;this.width=0;this.height=0;this.renderCount=0;
  this.supported=renderer.extensions?.has?renderer.extensions.has('EXT_color_buffer_float'):true;
  this.target=new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,minFilter:THREE.LinearFilter,magFilter:THREE.LinearFilter,depthBuffer:true,stencilBuffer:false,samples:Math.min(4,renderer.capabilities.maxSamples||0)});
  this.target.texture.name='visual-depth-linear-world';this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;
  this.target.depthTexture=new THREE.DepthTexture(1,1,THREE.UnsignedIntType);
  this.aoTarget=new THREE.WebGLRenderTarget(1,1,{minFilter:THREE.NearestFilter,magFilter:THREE.NearestFilter,depthBuffer:false,stencilBuffer:false});
  this.aoTarget.texture.name='visual-depth-filtered-contact-source';
  const shared={tDepth:{value:this.target.depthTexture},inverseProjection:{value:new THREE.Matrix4()},depthResolution:{value:new THREE.Vector2(1,1)}};
  this.aoMaterial=new THREE.ShaderMaterial({name:'visual-depth-contact',vertexShader:vertex,fragmentShader:occlusion,depthTest:false,depthWrite:false,toneMapped:false,uniforms:{...shared,resolution:{value:new THREE.Vector2(1,1)},projectionScale:{value:1},radius:{value:DEPTH_STYLE.radius},strength:{value:DEPTH_STYLE.strength},minLight:{value:DEPTH_STYLE.minLight}}});
  this.material=new THREE.ShaderMaterial({name:'visual-depth-composite',vertexShader:vertex,fragmentShader:composite,depthTest:false,depthWrite:false,toneMapped:true,uniforms:{...shared,tColor:{value:this.target.texture},tAO:{value:this.aoTarget.texture},aoResolution:{value:new THREE.Vector2(1,1)}}});
  this.geometry=new THREE.PlaneGeometry(2,2);this.quad=new THREE.Mesh(this.geometry,this.material);this.quad.frustumCulled=false;
  this.scene=new THREE.Scene();this.scene.add(this.quad);this.camera=new THREE.Camera();this.size=new THREE.Vector2();
  this.report={kind:'bilateral-screen-space-contact-occlusion',samples:20,postPasses:2,lowBypass:true};
 }
 render(scene,camera){
  if(this.disposed)throw Error('VisualDepth is disposed');const r=this.renderer;
  if(!this.supported){r.render(scene,camera);return;}
  this.renderCount++;const previous=r.getRenderTarget();r.getDrawingBufferSize(this.size);
  const w=Math.max(1,this.size.x|0),h=Math.max(1,this.size.y|0),aw=Math.ceil(w/2),ah=Math.ceil(h/2);
  if(w!==this.width||h!==this.height){this.target.setSize(w,h);this.aoTarget.setSize(aw,ah);this.width=w;this.height=h;this.aoMaterial.uniforms.resolution.value.set(w,h);this.material.uniforms.aoResolution.value.set(aw,ah);this.material.uniforms.depthResolution.value.set(w,h);}
  this.material.uniforms.inverseProjection.value.copy(camera.projectionMatrixInverse);this.aoMaterial.uniforms.projectionScale.value=camera.projectionMatrix.elements[5]*h*.5;
  try{
   r.setRenderTarget(this.target);r.render(scene,camera);
   this.quad.material=this.aoMaterial;r.setRenderTarget(this.aoTarget);r.render(this.scene,this.camera);
   this.quad.material=this.material;r.setRenderTarget(previous);r.render(this.scene,this.camera);
  }finally{this.quad.material=this.material;r.setRenderTarget(previous);}
 }
 dispose(){if(this.disposed)return;this.disposed=true;this.target.dispose();this.aoTarget.dispose();this.geometry.dispose();this.aoMaterial.dispose();this.material.dispose();}
}
