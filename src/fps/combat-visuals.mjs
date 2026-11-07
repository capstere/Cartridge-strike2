/** Batched GPU billboards for smoke, sparks and short blast cores. Cosmetic only. */
import * as T from '../../vendor/three/three.module.js';
const hash=n=>{const x=Math.sin(n*127.1+19.19)*43758.5453;return x-Math.floor(x);};
const CAP=192;
export class CombatVisuals{
 constructor(scene,world,settings){
  this.world=world;this.settings=settings;this.root=new T.Group();this.root.name='combat-flow-effects';scene.add(this.root);this.items=[];this.seen=new Set();this.zoneKey='';
  const plane=new T.PlaneGeometry(1,1);this.geo=new T.InstancedBufferGeometry().copy(plane);plane.dispose();
  for(const[name,size]of [['offset',3],['velocity',3],['tint',3],['timing',4]])this.geo.setAttribute(name,new T.InstancedBufferAttribute(new Float32Array(CAP*size),size));
  this.geo.instanceCount=0;
  this.mat=new T.ShaderMaterial({transparent:true,depthWrite:false,depthTest:true,uniforms:{clock:{value:0}},
   vertexShader:`attribute vec3 offset,velocity,tint;attribute vec4 timing;uniform float clock;varying vec2 vUv;varying vec3 vTint;varying float vLife,vKind;
   void main(){float age=max(0.,clock-timing.x);vLife=clamp(age/timing.y,0.,1.);vKind=timing.w;vUv=uv;vTint=tint;vec3 p=offset+velocity*age;if(vKind>.5&&vKind<1.5)p.y-=2.5*age*age;
   vec4 mv=viewMatrix*vec4(p,1.);vec2 q=position.xy*timing.z; if(vKind<.5)q*=1.+vLife*2.4;else if(vKind<1.5){vec2 d=(viewMatrix*vec4(velocity,0.)).xy;d=length(d)>.01?normalize(d):vec2(0.,1.);q=vec2(-d.y,d.x)*q.x*.12+d*q.y*(2.-vLife);}else q*=1.+vLife*3.;mv.xy+=q;gl_Position=projectionMatrix*mv;}`,
   fragmentShader:`varying vec2 vUv;varying vec3 vTint;varying float vLife,vKind;
   float grain(vec2 p){return fract(sin(dot(p,vec2(12.9898,78.233)))*43758.5453);}
   void main(){vec2 q=vUv*2.-1.;float r=length(q);float edge=(1.-smoothstep(.12,1.,r));float alpha=edge*(1.-vLife);
   if(vKind<.5){alpha*=.28+grain(floor(vUv*22.))*.12;alpha*=smoothstep(0.,.12,vLife);}else if(vKind<1.5){alpha*=.94;}else{alpha*=.65*(1.-vLife);}
   if(alpha<.008)discard;gl_FragColor=vec4(vTint,alpha);
   #include <tonemapping_fragment>
   #include <colorspace_fragment>
   }`});
  this.mesh=new T.Mesh(this.geo,this.mat);this.mesh.frustumCulled=false;this.root.add(this.mesh);
  this.marker=new T.InstancedMesh(new T.PlaneGeometry(.14,.32),new T.MeshBasicMaterial({color:0x72dce3,transparent:true,opacity:.65,depthWrite:false}),48);this.marker.count=0;this.marker.frustumCulled=false;this.root.add(this.marker);
  this.matrix=new T.Matrix4();this.rotation=new T.Quaternion();this.scale=new T.Vector3(1,1,1);this.colour=new T.Color();
 }
 add(p,time,velocity,size,duration,colour,kind){
  const speed=Math.hypot(...velocity);
  if(speed>.001){const hit=this.world.raycast(p,{x:velocity[0]/speed,y:velocity[1]/speed,z:velocity[2]/speed},speed*duration);if(hit)duration=Math.min(duration,Math.max(.025,hit.distance/speed));}
  this.items.push({offset:[p.x,p.y,p.z],velocity,size,duration,colour,kind,born:time});if(this.items.length>CAP)this.items.shift();
 }
 events(events,g){
  for(const e of events){if(this.seen.has(e.serial))continue;this.seen.add(e.serial);if(this.seen.size>512)this.seen.delete(this.seen.values().next().value);
   const seed=e.serial||1,t=e.time;
   if(e.type==='impact'&&e.normal){
    const n=e.normal,p={x:e.x+n.x*.035,y:e.y+n.y*.035,z:e.z+n.z*.035},metal=/metal|steel|instrument/.test(e.surface||'');
    const count=this.settings.graphics==='low'?4:metal?12:7;
    for(let i=0;i<count;i++){
     const velocity=[n.x*(1+hash(seed+i)*3)+(hash(seed+i+21)-.5)*2,n.y*2+hash(seed+i+31)*1.7,n.z*(1+hash(seed+i)*3)+(hash(seed+i+41)-.5)*2];
     this.add(p,t,velocity,metal?.09:.045,.12+hash(seed+i+55)*.18,metal?0xffcb76:0xb9ae99,1);
    }
    for(let i=0;i<3;i++)this.add(p,t,[n.x*.25,.15+i*.08,n.z*.25],.10+i*.055,.45+i*.12,0x9b9c92,0);
   }
   if(['rocket-explosion','he','explosion'].includes(e.type)&&Number.isFinite(e.x)){
    const count=this.settings.graphics==='low'?14:34;
    for(let i=0;i<count;i++){
     const a=i*2.39996,v=1+hash(seed+i)*3;
     this.add(e,t,[Math.cos(a)*v,.3+hash(seed+i+33)*2.3,Math.sin(a)*v],.13+hash(seed+i+51)*.26,.35+hash(seed+i+63)*1.25,i<6?0xffb960:i%2?0x666a6b:0x8c8a7e,i<6?2:0);
    }
    if(!this.settings.reducedFlash)this.add(e,t,[0,0,0],.85,.14,0xffe2a1,2);
   }
  }
 }
 update(g){
  const t=g.state.time;this.mat.uniforms.clock.value=t;this.items=this.items.filter(p=>t>=p.born&&t-p.born<p.duration);
  let i=0;for(const p of this.items){this.geo.attributes.offset.setXYZ(i,...p.offset);this.geo.attributes.velocity.setXYZ(i,...p.velocity);this.colour.setHex(p.colour);this.geo.attributes.tint.setXYZ(i,this.colour.r,this.colour.g,this.colour.b);this.geo.attributes.timing.setXYZW(i,p.born,p.duration,p.size,p.kind);i++;}
  this.geo.instanceCount=i;for(const a of Object.values(this.geo.attributes))if(a.isInstancedBufferAttribute)a.needsUpdate=true;
  const f=g.state.combatFlow,z=f?.zones[f.index],key=z?.id||'';
  if(key!==this.zoneKey){this.zoneKey=key;this.marker.count=0;if(z){for(let j=0;j<48;j++){
   const a=j/48*Math.PI*2,x=z.x+Math.sin(a)*z.radius,zz=z.z+Math.cos(a)*z.radius;
   if(!this.world.canOccupy(x,zz,.12,.1,0)||!this.world.segmentClear({...z,y:.08},{x,y:.08,z:zz},{vision:false}))continue;
   const q=new T.Quaternion().setFromEuler(new T.Euler(-Math.PI/2,0,-a));this.matrix.compose(new T.Vector3(x,.018,zz),q,this.scale);this.marker.setMatrixAt(this.marker.count++,this.matrix);
  }this.marker.instanceMatrix.needsUpdate=true;}}
  this.marker.visible=!!z&&g.phase==='active';
  if(z){this.marker.material.color.setHex(f.contested?0xffb350:f.owner==='analysts'?0x72cde5:f.owner==='counterAnalysts'?0xe1ba72:0xacc9c8);this.marker.material.opacity=this.settings.reducedMotion?.55:.52+Math.sin(t*2.4)*.1;}
 }
 clear(){this.items=[];this.seen.clear();this.geo.instanceCount=0;this.marker.count=0;this.zoneKey='';}
 dispose(){this.clear();this.root.removeFromParent();this.geo.dispose();this.mat.dispose();this.marker.geometry.dispose();this.marker.material.dispose();this.marker.dispose();}
}
