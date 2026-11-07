/** Focused I12 + its S16 approach. A small precomputed visibility volume supplies
 * four authored practical lights, without four extra realtime shadow maps.
 * Geometry, door apertures, collision and the map remain owned by world.
 * Approximate single-bounce presentation, NOT a validated photometric bake.
 */
import * as T from '../../vendor/three/three.module.js';
export const KIT_LIGHT_GRID=Object.freeze({x:28,y:12,z:36});
export function focusPlan(world){
 const r=world.data.rooms.find(r=>r.id==='I12'),route=world.data.routes.find(r=>r.id==='S16');
 if(!r||!route)return null;
 const xs=r.polygon.map(p=>p[0]),zs=r.polygon.map(p=>p[1]),b=[Math.min(...xs),Math.min(...zs),Math.max(...xs),Math.max(...zs)],cx=(b[0]+b[2])/2;
 const path=route.segments[0].points,entry=path[1];
 const sources=[{x:cx-1.8,y:2.60,z:b[1]+2.3,power:12,color:[1,.91,.78]},
 {x:cx+1.8,y:2.60,z:b[3]-2.4,power:10,color:[.79,.91,1]},
 {x:cx+.8,y:2.55,z:b[1]+.45,power:4,color:[1,.94,.84]},
 {x:entry[0],y:2.60,z:entry[1]+2.8,power:10,color:[1,.87,.70]}];
 const bounds=[Math.min(b[0],...path.map(p=>p[0]))-.25,Math.min(b[1],...path.map(p=>p[1]))-.25,Math.max(b[2],...path.map(p=>p[0]))+1.2,Math.max(b[3],...path.map(p=>p[1]))+.25];
 return {room:b,bounds,sources,path: path.map(p=>[...p]),geographyChanged:false};
}
function clippedRay(a,b,box){
 const c=Math.cos(box.angle||0),s=Math.sin(box.angle||0),ax=(a[0]-box.x)*c-(a[2]-box.z)*s,az=(a[0]-box.x)*s+(a[2]-box.z)*c;
 const dx=(b[0]-a[0])*c-(b[2]-a[2])*s,dz=(b[0]-a[0])*s+(b[2]-a[2])*c;
 const origins=[ax,a[1]-box.y,az],deltas=[dx,b[1]-a[1],dz],half=[box.w/2,box.h/2,box.d/2];let lo=.015,hi=.98;
 for(let k=0;k<3;k++){const d=deltas[k],v=origins[k],h=half[k];if(Math.abs(d)<1e-7){if(Math.abs(v)>h)return false;}else{let p=(-h-v)/d,q=(h-v)/d;if(p>q)[p,q]=[q,p];lo=Math.max(lo,p);hi=Math.min(hi,q);if(lo>hi)return false;}}
 return true;
}
export function bakeFocusVisibility(world,plan=focusPlan(world)){
 if(!plan)return null;const {x:nx,y:ny,z:nz}=KIT_LIGHT_GRID,[x0,z0,x1,z1]=plan.bounds,data=new Uint8Array(nx*ny*nz*4);
 const boxes=world.description.boxes.filter(b=>b.y-b.h/2<2.65&&b.y+b.h/2>.05&&b.x+b.w/2>x0-.5&&b.x-b.w/2<x1+.5&&b.z+b.d/2>z0-.5&&b.z-b.d/2<z1+.5&&!['glass','frosted','light','emissive'].includes(b.material));
 let rays=0;
 for(let y=0;y<ny;y++)for(let z=0;z<nz;z++)for(let x=0;x<nx;x++){
  const at=(z*nx*ny+y*nx+x)*4,p=[x0+(x+.5)/nx*(x1-x0),.08+(y+.5)/ny*2.60,z0+(z+.5)/nz*(z1-z0)];
  for(let k=0;k<4;k++){
   const l=plan.sources[k];let visible=0;
   for(const jitter of[-.17,0,.17]){const target=[l.x+jitter,l.y,l.z-jitter*.6];rays++;if(!boxes.some(b=>clippedRay(p,target,b)))visible++;}
   data[at+k]=Math.round(255*(.22+.78*visible/3));
  }
 }
 return {data,width:nx*ny,height:nz,rays,occluders:boxes.length,grid:KIT_LIGHT_GRID};
}
export function installFocusLighting(scene,world){
 const plan=focusPlan(world);if(!plan)return {report:{active:false},dispose(){}};
 const field=bakeFocusVisibility(world,plan),texture=new T.DataTexture(field.data,field.width,field.height,T.RGBAFormat);
 texture.minFilter=texture.magFilter=T.LinearFilter;texture.generateMipmaps=false;texture.needsUpdate=true;texture.name='strike-kit-static-visibility';
 const root=new T.Group();root.name='strike-kit-practicals';const owned=[],restores=[],patched=new Set();
 const casing=new T.MeshStandardMaterial({color:0x364c58,metalness:.55,roughness:.45});owned.push(casing);
 for(const [i,l]of plan.sources.entries()){
  const body=new T.Mesh(new T.BoxGeometry(i===2?1.8:.74,.065,i===2?.16:.30),casing);body.position.set(l.x,l.y+.055,l.z);root.add(body);
  const m=new T.MeshBasicMaterial({color:new T.Color(...l.color),toneMapped:false}),glow=new T.Mesh(new T.PlaneGeometry(i===2?1.72:.67,i===2?.13:.25),m);glow.rotation.x=-Math.PI/2;glow.position.set(l.x,l.y+.019,l.z);root.add(glow);owned.push(m);
 }
 scene.add(root);
 const bounds=new T.Vector4(...plan.bounds),room=new T.Vector4(...plan.room),route=plan.path.map(p=>new T.Vector2(...p));
 scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){
  if(!m?.isMeshStandardMaterial||m.transparent||m.emissiveIntensity>1||patched.has(m))continue;patched.add(m);
  const prev=m.onBeforeCompile,key=m.customProgramCacheKey,oldKey=key.call(m);
  m.onBeforeCompile=function(shader,renderer){
   prev.call(this,shader,renderer);
   Object.assign(shader.uniforms,{kitVolume:{value:texture},kitBounds:{value:bounds},kitRoom:{value:room},kitRoute:{value:route},kitLamp:{value:plan.sources.map(l=>new T.Vector3(l.x,l.y,l.z))},kitColour:{value:plan.sources.map(l=>new T.Vector3(...l.color).multiplyScalar(l.power))}});
   shader.vertexShader=shader.vertexShader.replace('#include <common>','#include <common>\nvarying vec3 vKitWorld;').replace('#include <project_vertex>',`#include <project_vertex>\nvec4 kitP=vec4(transformed,1.0);\n#ifdef USE_INSTANCING\nkitP=instanceMatrix*kitP;\n#endif\nvKitWorld=(modelMatrix*kitP).xyz;`);
   shader.fragmentShader=shader.fragmentShader.replace('#include <common>',`#include <common>
    varying vec3 vKitWorld;uniform sampler2D kitVolume;uniform vec4 kitBounds;uniform vec4 kitRoom;
    uniform vec2 kitRoute[4];uniform vec3 kitLamp[4];uniform vec3 kitColour[4];
    float kitDistance(vec2 p,vec2 a,vec2 b){vec2 v=b-a;return length(p-a-v*clamp(dot(p-a,v)/max(.0001,dot(v,v)),0.0,1.0));}
    vec4 kitVisibility(vec3 p){vec2 uv=clamp((p.xz-kitBounds.xy)/(kitBounds.zw-kitBounds.xy),vec2(.001),vec2(.999));
      float yy=clamp((p.y-.08)/2.60*12.0-.5,0.0,11.0),y0=floor(yy),y1=min(11.0,y0+1.0);
      float xx=clamp(uv.x,0.5/28.0,27.5/28.0);return mix(texture2D(kitVolume,vec2((xx+y0)/12.0,uv.y)),texture2D(kitVolume,vec2((xx+y1)/12.0,uv.y)),fract(yy));}
   `);
   shader.fragmentShader=shader.fragmentShader.replace('#include <lights_fragment_end>',`#include <lights_fragment_end>
    vec2 kp=vKitWorld.xz;float rr=min(min(kp.x-kitRoom.x,kitRoom.z-kp.x),min(kp.y-kitRoom.y,kitRoom.w-kp.y));
    float mask=smoothstep(-.12,.20,rr);float pathD=min(kitDistance(kp,kitRoute[0],kitRoute[1]),min(kitDistance(kp,kitRoute[1],kitRoute[2]),kitDistance(kp,kitRoute[2],kitRoute[3])));
    mask=max(mask,1.0-smoothstep(.60,1.0,pathD));
    if(mask>.001){vec3 norm=inverseTransformDirection(normal,viewMatrix);vec4 vis=kitVisibility(vKitWorld);vec3 irradiance=vec3(0.0);
     for(int k=0;k<4;k++){vec3 delta=kitLamp[k]-vKitWorld;float dd=dot(delta,delta);float cone=smoothstep(0.0,.3,normalize(-delta).y*-1.0);irradiance+=kitColour[k]*vis[k]*max(0.0,dot(norm,normalize(delta)))*cone/(2.5+dd);}
     reflectedLight.indirectDiffuse=mix(reflectedLight.indirectDiffuse,reflectedLight.indirectDiffuse*.66+diffuseColor.rgb*irradiance*.27,mask);
    }
   `);
  };
  m.customProgramCacheKey=()=>oldKey+'|strike-kit-focused-v1';m.needsUpdate=true;restores.push(()=>{m.onBeforeCompile=prev;m.customProgramCacheKey=key;m.needsUpdate=true;});
 }});
 return {root,plan,report:{active:true,kind:'precomputed-local-visibility-practical-lighting',voxels:28*12*36,sources:4,rays:field.rays,occluders:field.occluders,geometryChanged:false,fullGlobalIllumination:false},dispose(){for(const f of restores)f();root.traverse(o=>o.geometry?.dispose());for(const m of owned)m.dispose();texture.dispose();scene.remove(root);}};
}
