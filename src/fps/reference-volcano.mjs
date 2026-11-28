// Adapted from tephraAshfall, tephraAshUpdate, tephraSteam and tephraLightning
// in the MIT Riposte source. Both particle fields use one draw each.
import * as THREE from '../../vendor/three/three.module.js';

export function referenceVolcano(spec,root,settings,clock,own,onLightning) {
  // Presentation-only sequence independent of actors, damage and authority.
  let seed=7117;
  function random() {
    seed=(Math.imul(seed,1664525)+1013904223)>>>0;
    return seed/4294967296;
  }
  const F=spec.canopy,raw=atob(F.heights);
  const canopy=new THREE.DataTexture(Uint8Array.from(raw,c=>c.charCodeAt(0)),F.width,F.height,THREE.RedFormat);
  canopy.minFilter=canopy.magFilter=THREE.NearestFilter;canopy.needsUpdate=true;own.push(canopy);
  const pointScale={value:400};
  const ashCount=settings.graphics==='low'?700:1400;
  const points=new Float32Array(ashCount*3),size=new Float32Array(ashCount),ember=new Float32Array(ashCount);
  for(let i=0;i<ashCount;i++){
    points[i*3]=(random()-.5)*36;points[i*3+1]=random()*16-4;points[i*3+2]=(random()-.5)*36;
    size[i]=.6+random()*.9;ember[i]=i%14?0:.35+random()*.65;
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.BufferAttribute(points,3));
  g.setAttribute('flakeSize',new THREE.BufferAttribute(size,1));
  g.setAttribute('ember',new THREE.BufferAttribute(ember,1));
  const material=new THREE.ShaderMaterial({
    uniforms:{time:clock,scale:pointScale,wind:{value:new THREE.Vector2(...spec.wind)},roofs:{value:canopy},
      field:{value:new THREE.Vector4(F.x,F.z,F.width*F.step,F.height*F.step)}},
    transparent:true,depthWrite:false,
    vertexShader:`uniform float time,scale;uniform sampler2D roofs;uniform vec4 field;uniform vec2 wind;
      attribute float flakeSize,ember;varying float alpha,heat;
      void main(){
        float up=step(.01,ember),speed=mix(.8,1.2,up);
        vec3 p=position;p.xz+=wind*speed*time+vec2(sin(time*1.3+flakeSize*5.1),cos(time*1.1+flakeSize*7.3))*.35;
        p.y+=mix(-(.55+fract(flakeSize*7.)*.36),.25,up)*time;
        p=cameraPosition+mod(p-cameraPosition+vec3(18.,4.,18.),vec3(36.,16.,36.))-vec3(18.,4.,18.);
        float roof=texture2D(roofs,(p.xz-field.xy)/field.zw).r*255.;
        float sky=(roof>254.||p.y>roof/8.)?1.:0.;
        vec4 mv=viewMatrix*vec4(p,1.);float d=-mv.z;
        heat=ember*(.55+.45*sin(time*9.+flakeSize*40.));
        alpha=sky*smoothstep(.7,2.2,d)*(1.-smoothstep(13.,19.,d));
        gl_PointSize=clamp((.02+ember*.008)*flakeSize*scale/max(d,.1),1.,6.);
        gl_Position=projectionMatrix*mv;
      }`,
    fragmentShader:`varying float alpha,heat;void main(){
      float r=length(gl_PointCoord-.5)*2.,a=(1.-smoothstep(.2,1.,r))*alpha;
      if(a<.01)discard;gl_FragColor=heat>0.?vec4(vec3(3.2,1.1,.28)*heat,a):vec4(.2,.19,.185,a*.75);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const ash=new THREE.Points(g,material);ash.name='Volcanic ash and embers';ash.frustumCulled=false;ash.renderOrder=4;
  root.add(ash);own.push(material);

  const origins=[],motion=[],tints=[];
  for(const vent of spec.vents){
    const count=Math.max(1,Math.round((vent.low?5:vent.lava?3:7)*vent.k*(settings.graphics==='low'?2:4)));
    for(let i=0;i<count;i++){
      const angle=random()*Math.PI*2,r=random()*vent.r;
      origins.push(vent.x+Math.cos(angle)*r,vent.y+.1,vent.z+Math.sin(angle)*r);
      motion.push(random(),vent.low?1.2:vent.lava?4.5:3.2,vent.low?.6:vent.lava?1.6:2,vent.low?38:vent.lava?80:60);
      tints.push(...(vent.lava?[.2,.16,.14]:[.90,.92,.94]));
    }
  }
  const steamGeo=new THREE.BufferGeometry();
  steamGeo.setAttribute('position',new THREE.Float32BufferAttribute(origins,3));
  steamGeo.setAttribute('plume',new THREE.Float32BufferAttribute(motion,4));
  steamGeo.setAttribute('tint',new THREE.Float32BufferAttribute(tints,3));
  const steamMat=new THREE.ShaderMaterial({
    uniforms:{time:clock,scale:pointScale,wind:{value:new THREE.Vector2(...spec.wind)}},transparent:true,depthWrite:false,
    vertexShader:`uniform float time,scale;uniform vec2 wind;attribute vec4 plume;attribute vec3 tint;
      varying float alpha;varying vec3 color;
      void main(){float life=fract(plume.x+time*.18),age=life*5.;
        vec3 p=position+vec3(wind.x*.55,plume.z,wind.y*.55)*age;
        vec4 mv=viewMatrix*vec4(p,1.);float d=length(cameraPosition-position);
        alpha=smoothstep(0.,.15,life)*(1.-smoothstep(.45,1.,life))*.20*(1.-smoothstep(plume.w-10.,plume.w,d));
        color=tint;gl_PointSize=clamp((.2+life*plume.y)*scale/max(.5,-mv.z),1.,80.);gl_Position=projectionMatrix*mv;}`,
    fragmentShader:`varying float alpha;varying vec3 color;void main(){
      float a=alpha*(1.-smoothstep(.05,.5,length(gl_PointCoord-.5)));if(a<.008)discard;gl_FragColor=vec4(color,a);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  const steam=new THREE.Points(steamGeo,steamMat);steam.name='Geothermal steam';steam.frustumCulled=false;
  root.add(steam);own.push(steamMat);
  let last=0,next=5,age=-1,double=false;
  return (camera,t)=>{
    pointScale.value=globalThis.innerHeight*.5/Math.tan(camera.fov*Math.PI/360);
    const dt=last?Math.min(.1,Math.max(0,t-last)):0;last=t;next-=dt;
    if(next<=0){
      next=3+random()*8;age=0;double=random()<.5;
      onLightning?.(1.5+random()*2.5);
    }
    if(age<0||settings.reducedMotion)return 0;
    age+=dt;
    if(age>.5){age=-1;return 0;}
    const value=age<.07?1:double&&age>.15&&age<.22?.85:Math.max(0,1-(age-.07)*6);
    return value*(settings.reducedFlash?.08:1);
  };
}
