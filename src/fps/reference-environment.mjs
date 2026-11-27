// Adapted from Riposte's cyUpdateMills, waterGeometry, wtrWaves, skyPhotoLoad
// and material/cloth factories. See the source trace and rights inventory.
import * as THREE from '../../vendor/three/three.module.js';
import {referenceVolcano} from './reference-volcano.mjs';
import {eruptionShader} from './reference-eruption.mjs';

function typed(encoded, ArrayType) {
  const binary = atob(encoded);
  const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
  return new ArrayType(bytes.buffer);
}

function geometry(part) {
  const result = new THREE.BufferGeometry();
  result.setAttribute('position', new THREE.BufferAttribute(typed(part.position, Float32Array), 3));
  result.setAttribute('normal', new THREE.BufferAttribute(typed(part.normal, Int8Array), 3, true));
  result.setAttribute('color', new THREE.BufferAttribute(typed(part.color, Uint8Array), 3, true));
  if(part.uv){
    const uv=typed(part.uv,Float32Array);
    if(['signs','decals','portScreen','tephraScreen'].includes(part.material))for(let i=0;i<uv.length;i+=2)
      uv[i]=uv[i]*.5+(['decals','portScreen'].includes(part.material)?.5:0);
    result.setAttribute('uv',new THREE.BufferAttribute(uv,2));
  }
  result.setIndex(new THREE.BufferAttribute(typed(part.index, Uint16Array), 1));
  result.computeBoundingSphere();
  return result;
}

function windmills(spec, root, material) {
  return spec.map(mill => {
    const group = new THREE.Group();
    group.name = 'Windmill sails';
    group.position.fromArray(mill.position);
    group.rotation.order = 'YXZ';
    group.rotation.y = mill.yaw;
    for (const part of mill.parts) group.add(new THREE.Mesh(geometry(part), material));
    root.add(group);
    return {group, phase: mill.phase, speed: mill.speed};
  });
}

function breezeMaterial(phase) {
  const material = new THREE.MeshLambertMaterial({vertexColors:true});
  // Quantized displacements already include each sheet's pinned vertices,
  // gravity, drag and two constraint passes from Riposte's original ClothSim.
  material.onBeforeCompile = shader => {
    shader.uniforms.gustPhase = phase;
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>
        uniform float gustPhase;
        attribute vec3 gust0, gust1, gust2, gust3;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        float t=mod(gustPhase,4.0), f=fract(t);
        f=f*f*(3.0-2.0*f);
        vec3 displacement=t<1.0?mix(gust0,gust1,f):t<2.0?mix(gust1,gust2,f):
          t<3.0?mix(gust2,gust3,f):mix(gust3,gust0,f);
        transformed+=displacement;`);
  };
  return material;
}

function addFabrics(fabrics, root, material) {
  for (const fabric of fabrics) {
    const geom = geometry(fabric.mesh);
    const offset = new THREE.Vector3().fromArray(fabric.offset);
    // Keep displacement in signed bytes in GPU memory; every vertex in this
    // mesh has the same scale, so apply the inverse to the base positions once.
    const scale = fabric.deltaScale;
    const positions = geom.getAttribute('position');
    for (let i=0;i<positions.count;i++) positions.setXYZ(i,
      (positions.getX(i)-offset.x)/scale,(positions.getY(i)-offset.y)/scale,(positions.getZ(i)-offset.z)/scale);
    for (const [i, pose] of fabric.deltas.entries())
      geom.setAttribute('gust'+i,new THREE.BufferAttribute(typed(pose,Int8Array),3,true));
    geom.computeBoundingSphere();
    geom.boundingSphere.radius+=2;
    const mesh = new THREE.Mesh(geom,material);
    mesh.name='Wind-blown fabric';
    mesh.position.copy(offset);
    mesh.scale.setScalar(scale);
    mesh.updateMatrix();
    mesh.matrixAutoUpdate=false;
    root.add(mesh);
  }
}

function grid(east, level, low) {
  // Original progressive grid: near the harbor spend vertices on individual
  // crests, offshore grow cell size up to 45 m. Low quality doubles spacing.
  const xs=[],zp=[0],step=low?3.2:1.6;
  for(let x=east,s=step;x>-900;x-=s){xs.push(x);if(x < -72)s=Math.min(s*1.12,45);}
  xs.push(-900);xs.reverse();
  for(let z=0,s=step;z<900;){if(z>75)s=Math.min(s*1.12,45);z=Math.min(900,z+s);zp.push(z);}
  const zs=zp.slice(1).map(z=>-z).reverse().concat(zp),positions=[],indices=[];
  for(const z of zs)for(const x of xs)positions.push(x,level,z);
  for(let j=0;j<zs.length-1;j++)for(let i=0;i<xs.length-1;i++){
    const a=j*xs.length+i,b=a+1,c=a+xs.length,d=c+1;
    indices.push(a,c,b,b,c,d);
  }
  const g=new THREE.BufferGeometry();
  g.setAttribute('position',new THREE.Float32BufferAttribute(positions,3));
  g.setIndex(indices);g.computeBoundingSphere();
  return g;
}

function harbor(spec,root,low,clock,own) {
  const F=spec.field;
  const distance = new THREE.DataTexture(typed(F.distance,Uint8Array),F.width,F.height,THREE.RedFormat);
  distance.minFilter=distance.magFilter=THREE.LinearFilter;distance.needsUpdate=true;own.push(distance);
  const material=new THREE.ShaderMaterial({
    uniforms:{
      time:clock,field:{value:distance},bounds:{value:new THREE.Vector4(F.x,F.z,F.resolution/F.width,F.resolution/F.height)},
      open:{value:new THREE.Vector2(...spec.open)},
      waves:{value:spec.waves.map(w=>new THREE.Vector4(...w.slice(0,4)))},
      motion:{value:spec.waves.map(w=>new THREE.Vector4(...w.slice(4)))},
      deep:{value:new THREE.Color(...spec.deep)},shallow:{value:new THREE.Color(...spec.shallow)},
      foam:{value:new THREE.Color(...spec.foam)},sun:{value:new THREE.Vector3(...spec.sun)}
    },
    vertexShader:`
      uniform float time;uniform vec2 open;uniform vec4 waves[8],motion[8],bounds;uniform sampler2D field;
      varying vec3 incident,norm;varying float harborDistance,crest;
      void main(){
        vec2 cell=(position.xz-bounds.xy)*bounds.zw;
        float d=all(greaterThanEqual(cell,vec2(0.)))&&all(lessThanEqual(cell,vec2(1.)))?texture2D(field,cell).r*16.:16.;
        float calm=mix(.35,1.,smoothstep(.5,8.,d)),sea=1.-smoothstep(open.x,open.y,position.x);
        vec3 p=position,n=vec3(0.,1.,0.);float height=0.,amplitude=.0001;
        for(int i=0;i<8;i++){
          vec4 a=waves[i],b=motion[i];float A=a.w*(b.w>.5?sea:calm);
          float theta=a.z*dot(a.xy,position.xz)-b.x*time+b.z,s=sin(theta),c=cos(theta);
          p.xz+=b.y*A*a.xy*c;p.y+=A*s;
          n.xz-=a.xy*a.z*A*c;n.y-=b.y*a.z*A*s;height+=A*s;amplitude+=A;
        }
        norm=normalize(n);incident=cameraPosition-p;harborDistance=d;crest=height/amplitude;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.);
      }`,
    fragmentShader:`
      uniform vec3 deep,shallow,foam,sun;varying vec3 incident,norm;varying float harborDistance,crest;
      void main(){
        vec3 n=normalize(norm),viewDir=normalize(incident);
        float grazing=pow(1.-max(0.,dot(n,viewDir)),4.);
        vec3 water=mix(shallow,deep,smoothstep(0.,12.,harborDistance));
        water=mix(water,vec3(.34,.54,.78),grazing*.75);
        water+=vec3(1.,.93,.78)*pow(max(0.,dot(reflect(-sun,n),viewDir)),120.);
        gl_FragColor=vec4(mix(water,foam,(1.-smoothstep(.1,1.8,harborDistance))*smoothstep(.0,.8,crest)*.65),1.);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
  });
  own.push(material);
  const sea=new THREE.Mesh(grid(spec.east,spec.level,low),material);
  sea.name='Harbor waves';root.add(sea);
}

function ponds(spec,root,clock,own){
  // Original pondGeom supplies the actual waterfront puddles and fountain
  // outlines. One shared shader, with separate authored depth/edge parameters.
  for(const pool of spec){
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(typed(pool.vertices,Float32Array),3));
    g.setAttribute('rim',new THREE.BufferAttribute(typed(pool.rim,Float32Array),1));
    g.setIndex(new THREE.BufferAttribute(typed(pool.indices,Uint16Array),1));
    const m=new THREE.ShaderMaterial({
      uniforms:{time:clock,deep:{value:new THREE.Color(...pool.deep)},shallow:{value:new THREE.Color(...pool.shallow)},
        params:{value:new THREE.Vector4(pool.maxDepth,pool.slope,pool.visibility,pool.opacity)},murk:{value:pool.murk},
        movement:{value:new THREE.Vector2(pool.rings,pool.calm)}},transparent:true,depthWrite:false,
      vertexShader:`attribute float rim;varying float edge;varying vec3 p;void main(){
        edge=rim;p=(modelMatrix*vec4(position,1.)).xyz;
        gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
      fragmentShader:`varying float edge;varying vec3 p;uniform float time,murk;
        uniform vec2 movement;uniform vec4 params;uniform vec3 deep,shallow;
        void main(){float depth=min(params.x,edge*params.y);
        float density=1.-exp(-depth/max(params.z,.01));
        float ripple=sin(p.x*3.1+p.z*4.4-time*2.)*.5+sin(p.x*6.4-p.z*2.5+time*2.7)*.5;
        float spec=pow(1.-max(0.,normalize(cameraPosition-p).y),4.);
        vec3 color=mix(shallow,deep,density)+vec3(.12,.16,.2)*spec+
          vec3(.015)*(movement.y*ripple+movement.x*sin(edge*13.-time*4.));
        gl_FragColor=vec4(color,params.w*mix(murk,1.,density));
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`
    });
    own.push(m);
    const mesh=new THREE.Mesh(g,m);mesh.name='Water basin';mesh.position.fromArray(pool.position);mesh.rotation.y=pool.yaw;
    mesh.updateMatrix();mesh.matrixAutoUpdate=false;root.add(mesh);
  }
}

function boats(spec,sea,root,materials,plain){
  // Match waterHeight and waterUpdate: sample the four ends of each original
  // hull's length/beam, in its orientation. Only its display transform moves.
  const F=sea.field,distance=typed(F.distance,Uint8Array),waves=sea.waves;
  function height(x,z,t){
    const ix=Math.floor((x-F.x)*F.resolution),iz=Math.floor((z-F.z)*F.resolution);
    const d=ix>=0&&iz>=0&&ix<F.width&&iz<F.height?distance[iz*F.width+ix]/255*16:16;
    const calm=.35+.65*THREE.MathUtils.smoothstep(d,.5,8),open=1-THREE.MathUtils.smoothstep(x,...sea.open);
    let h=0;
    for(const [dx,dz,k,a,w,,ph,offshore] of waves)h+=a*(offshore?open:calm)*Math.sin(k*(dx*x+dz*z)-w*t+ph);
    return h;
  }
  const vessels=spec.map(v=>{
    const group=new THREE.Group();group.name='Moored boat';group.rotation.order='YXZ';
    for(const part of v.parts)group.add(new THREE.Mesh(geometry(part),materials[part.material]||plain));
    group.position.set(v.x,sea.level-v.draft,v.z);group.rotation.y=v.yaw;root.add(group);
    return {group,v,c:Math.cos(v.yaw),s:Math.sin(v.yaw)};
  });
  return (t,camera)=>{
    for(const {group,v,c,s} of vessels){
      if(Math.hypot(camera.position.x-v.x,camera.position.z-v.z)>120)continue;
      const hl=v.length/2,hb=v.beam/2;
      const hf=height(v.x+s*hl,v.z+c*hl,t),ha=height(v.x-s*hl,v.z-c*hl,t);
      const hp=height(v.x+c*hb,v.z-s*hb,t),hs=height(v.x-c*hb,v.z+s*hb,t);
      group.position.y=sea.level+(hf+ha+hp+hs)/4-v.draft;
      group.rotation.set(-Math.atan2(hf-ha,v.length)+Math.sin(t*v.frequency*1.3+v.phase)*v.roll*.4,
        v.yaw,Math.atan2(hp-hs,v.beam)+Math.sin(t*v.frequency+v.phase)*v.roll,'YXZ');
    }
  };
}

function skyDome(texture,spec,root,own,horizon,volcano,clock,light) {
  texture.wrapS=THREE.RepeatWrapping;texture.generateMipmaps=false;texture.minFilter=THREE.LinearFilter;
  const material=new THREE.ShaderMaterial({
    uniforms:{skyImage:{value:texture},horizon:{value:horizon},uTime:clock,
      ...(volcano?{uVolc:{value:new THREE.Vector3()},uPlume:{value:new THREE.Vector4(.97,.15,1,1.7)},
        uErupt:{value:new THREE.Vector4(1,1,0,0)},sunDir:{value:new THREE.Vector3(...light.sun).normalize()}}:{}),rot:{value:spec.rot||0},gain:{value:spec.gain||1}},
    side:THREE.BackSide,depthWrite:false,
    vertexShader:`varying vec3 dir;void main(){dir=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}`,
    fragmentShader:`uniform sampler2D skyImage;uniform vec3 horizon;uniform float rot,gain;varying vec3 dir;
      ${volcano?eruptionShader:''}
      void main(){
      vec3 d=normalize(dir);vec2 uv=vec2(fract(atan(d.z,d.x)*.15915494+.5+rot),asin(clamp(d.y,0.,1.))*.63661977);
      vec3 photo=pow(texture2D(skyImage,uv).rgb,vec3(2.2))*gain;
      ${volcano?'if(d.y>-.01){photo=plume(photo,d,d.y);photo=fountain(photo,d,d.y);}':''}
      gl_FragColor=vec4(mix(horizon,photo,smoothstep(-.005,.035,d.y)),1.);
      #include <tonemapping_fragment>
      #include <colorspace_fragment>
    }`
  });
  own.push(texture,material);
  const sphere=new THREE.Mesh(new THREE.SphereGeometry(1,32,12),material);
  sphere.name='Photographic sky';sphere.renderOrder=1000;sphere.frustumCulled=false;root.add(sphere);
  return sphere;
}

export function createReferenceEnvironment({id,scene,root,settings,materials,signal,folder,onLightning}) {
  const group=new THREE.Group();group.name='Map environment';root.add(group);
  const own=[],phase={value:0},clock={value:0};
  let sky=null,mills=[],bobBoats=null,volcanic=null,crater=null,far=0,disposed=false;
  async function build(){
    const response=await fetch(new URL('environment.json.gz',folder),{signal});
    if(!response.ok)throw Error('Map environment could not be loaded.');
    const bytes=await response.arrayBuffer(),prefix=new Uint8Array(bytes,0,2);
    const data=prefix[0]===31&&prefix[1]===139?
      await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).json():
      JSON.parse(new TextDecoder().decode(bytes));
    if(disposed)return;
    if(data.version!==1||data.id!==id)throw Error('Unsupported map environment.');
    scene.fog=new THREE.FogExp2(new THREE.Color(...data.fog.color),data.fog.density);
    far=data.far;
    // The r147 donor uses the default legacy punctual/ambient normalization.
    // Its Lambert irradiance includes PI; r180 switched to physical light units.
    const ambient=scene.children.find(child=>child.isHemisphereLight);
    if(ambient){ambient.color.setHex(data.light.hemi[0]);ambient.groundColor.setHex(data.light.hemi[1]);ambient.intensity=Math.PI*data.light.hemi[2];}
    const sun=scene.children.find(child=>child.isDirectionalLight);
    if(sun){sun.color.setHex(data.light.sunColor);sun.intensity=Math.PI*data.light.sunIntensity;sun.position.fromArray(data.light.sun).normalize();}
    const solid=new THREE.MeshLambertMaterial({vertexColors:true});
    const cloth=breezeMaterial(phase);
    own.push(solid,cloth);
    addFabrics(data.fabrics,group,cloth);
    mills=windmills(data.mills,group,solid);
    if(data.sea){
      harbor(data.sea,group,settings.graphics==='low',clock,own);
      bobBoats=boats(data.floats,data.sea,group,materials,solid);
    }
    ponds(data.ponds,group,clock,own);
    if(data.volcano){
      volcanic=referenceVolcano(data.volcano,group,settings,clock,own,onLightning);
      const v=data.volcano.crater;
      crater={x:v.x,z:v.z,radius:v.rc,height:v.s0*v.L*(1-Math.exp(-(Math.hypot(v.x,v.z)-v.rc)/v.L))};
    }
    if(data.sky){
      const texture=await new THREE.TextureLoader().loadAsync(new URL('sky.webp',folder).href);
      if(disposed){texture.dispose();return;}
      sky=skyDome(texture,data.sky,group,own,scene.fog.color,data.volcano,clock,data.light);
    }
  }
  function update(camera){
    if(far&&camera.far!==far){camera.far=far;camera.updateProjectionMatrix();}
    const t=settings.reducedMotion?0:performance.now()*.001;
    clock.value=t;phase.value=t/(16/30);
    bobBoats?.(t,camera);
    if(materials.lava?.map)materials.lava.map.offset.y=1-(t*.012)%1;
    const flash=volcanic?.(camera,t)||0;
    if(sky&&crater){
      const dx=crater.x-camera.position.x,dz=crater.z-camera.position.z,dy=crater.height-camera.position.y;
      const distance=Math.hypot(dx,dz,dy),uniforms=sky.material.uniforms;
      uniforms.uVolc.value.set(Math.atan2(dz,dx),crater.radius/distance,dy/distance);
      uniforms.uErupt.value.z=flash;uniforms.uErupt.value.w=Math.floor(t/15);
    }
    for(const m of mills)m.group.rotation.x=m.phase+m.speed*(.8*t-(.2/.21)*Math.cos(t*.21+m.phase));
    if(sky){sky.position.copy(camera.position);sky.scale.setScalar(camera.far*.9);}
  }
  function dispose(){
    if(disposed)return;
    disposed=true;group.removeFromParent();group.traverse(node=>node.geometry?.dispose());
    for(const asset of own)asset.dispose();
    own.length=0;mills=[];sky=null;bobBoats=null;volcanic=null;
  }
  return {ready:build(),update,dispose,time:clock};
}


// The wind and cloth vertex functions come from 02md-vent and 02mc-tissus.
// Both consume the signed aSw weights the original Maker stored per vertex.
export function applyReferenceWind(leaves,flag,time) {
  leaves.onBeforeCompile=shader=>{
    shader.uniforms.windTime=time;
    shader.vertexShader=shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float windTime; attribute float aSw;
      vec3 leafWind(vec3 wp,float weight){
        vec2 d=vec2(.8,.6),p=vec2(-d.y,d.x);
        float a=dot(wp.xz,d),b=dot(wp.xz,p);
        float g1=.5+.5*sin(a*.07-windTime*.9+b*.05);
        float g2=.5+.5*sin(a*.19-windTime*2.3+b*.11);
        float g=clamp((.12+.62*g1*g1+.26*g2*g1)*(.09/.07),0.,1.4);
        float ph=windTime*2.1+dot(wp.xz,vec2(.37,.29))+wp.y*.11;
        float fa=windTime*7.3+dot(wp,vec3(2.1,3.3,1.7));
        float so=(.25+.75*g)*.12*max(weight,0.),fl=(.3+.9*g)*.05*abs(weight);
        vec2 xz=d*(g*.2*max(weight,0.)+sin(ph)*so)+p*cos(ph*.8+1.9)*so*.4+vec2(sin(fa),cos(fa*1.37+1.1))*fl;
        return vec3(xz.x,-length(xz)*.3+sin(fa*.7)*fl*.35,xz.y);
      }`).replace('#include <begin_vertex>', `#include <begin_vertex>
        float foliageLod=1.-smoothstep(45.,90.,distance(transformed,cameraPosition));
        transformed+=leafWind(transformed,aSw)*foliageLod;`);
  };
  flag.onBeforeCompile=shader=>{
    shader.uniforms.windTime=time;
    shader.vertexShader=shader.vertexShader.replace('#include <common>', `#include <common>
      uniform float windTime;attribute float aSw;`).replace('#include <begin_vertex>', `#include <begin_vertex>
        float lod=1.-smoothstep(30.,55.,distance(transformed,cameraPosition));
        float ph=dot(transformed.xz,vec2(.37,.29))+transformed.y*.21;
        float gust=.6+.4*sin(windTime*.4+transformed.x*.05-transformed.z*.04);
        float wave=sin(aSw*7.-windTime*6.+ph)*.75+sin(aSw*13.-windTime*9.5+ph*1.7)*.25;
        float swing=sin(windTime*1.6+ph)*.65+sin(windTime*2.9+ph*1.3)*.35;
        transformed+=objectNormal*(wave*.07+swing*.06)*gust*aSw*lod;`);
  };
}
