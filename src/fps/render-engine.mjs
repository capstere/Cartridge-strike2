import {missionRoomName} from './player-names.mjs';
import {syncWeaponAppearance} from './view-character-appearance.mjs?v=6.1.2';
import {refreshActorCharacter} from './character-actors.mjs?v=6.1.2';
import {privateCharacterAppearance} from './character-library.mjs?v=6.1.2';
import { FrameTimeWindow } from './frame-time-window.mjs';
import { TracerBatch } from './tracer-batch.mjs';
import { createThrownCartridge, updateThrownCartridge } from './throwable-cartridge.mjs';
import * as THREE from '../../vendor/three/three.module.js';
import { GLTFLoader } from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { mergeGeometries } from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import { makeActor,makeWeapon,cartridge,animateActor,animateWeapon,animateCorpse,disposeWeaponResources } from './models.mjs?v=6.1.2';
import { createMaterialRegistry,applyMetreUV } from './materials.mjs?v=5.5.0';
import { buildDecor } from './decor.mjs';
import { createRoomVisualPlan,buildRoomVisuals,roomMaterialOverride,createRoomFinishMaterial,replaceRoomSurface } from './room-visuals.mjs';
import { buildCartridgeProps } from './cartridge-props.mjs';
import { disposeCartridgeResources } from './cartridge-v11.mjs';
import { CombatEffects } from './effects.mjs';
const boxGeo=new THREE.BoxGeometry(1,1,1),sphereGeo=new THREE.SphereGeometry(1,12,8),smokeGeo=new THREE.PlaneGeometry(2,2);
// Inherited RGB arrays were authored for the old direct-output WebGL palette.
// Treat those as sRGB exactly once. GLTF materials/textures retain loader semantics.
const color=c=>Array.isArray(c)?new THREE.Color().setRGB(...c,THREE.SRGBColorSpace):new THREE.Color(c??0xffffff);
function label(parent,text,x,y,z,w,h,{bg='#18303a',fg='#d8e9e6',yaw=0}={}){const c=document.createElement('canvas');c.width=512;c.height=128;const t=c.getContext('2d');t.fillStyle=bg;t.fillRect(0,0,512,128);t.fillStyle=fg;t.textAlign='center';t.textBaseline='middle';t.font=`600 ${Math.min(54,700/text.length)}px sans-serif`;t.fillText(text,256,64);const texture=new THREE.CanvasTexture(c);texture.colorSpace=THREE.SRGBColorSpace;const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshBasicMaterial({map:texture,side:THREE.DoubleSide}));mesh.position.set(x,y,z);mesh.rotation.y=yaw;parent.add(mesh);return mesh;}
function surfaceGeometry(p,y){const vs=p.map(q=>new THREE.Vector2(...q)),g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p.flatMap(q=>[q[0],y,q[1]]),3));g.setAttribute('uv',new THREE.Float32BufferAttribute(p.flat(),2));g.setIndex(THREE.ShapeUtils.triangulateShape(vs,[]).flat());g.computeVertexNormals();if(g.getAttribute('normal').getY(0)<0){const index=g.index.array;for(let i=0;i<index.length;i+=3){const n=index[i+1];index[i+1]=index[i+2];index[i+2]=n;}g.computeVertexNormals();}return g;}
function contactTexture(){const c=document.createElement('canvas');c.width=c.height=64;const ctx=c.getContext('2d'),g=ctx.createRadialGradient(32,32,4,32,32,32);g.addColorStop(0,'rgba(9,15,20,.42)');g.addColorStop(.55,'rgba(9,15,20,.22)');g.addColorStop(1,'rgba(9,15,20,0)');ctx.fillStyle=g;ctx.fillRect(0,0,64,64);return new THREE.CanvasTexture(c);}
// Only build-time environment roots use this. Lights, actors and effect pools
// stay dynamic; LOD changes visibility without moving these fixed transforms.
export function freezeStaticTransforms(root){root.updateWorldMatrix(true,true);root.traverse(object=>{object.matrixAutoUpdate=false;object.matrixWorldAutoUpdate=false;});
 // This whole subtree is immutable under the fixed world scene. Skip the
 // recursive per-frame walk too; explicit updateWorldMatrix remains available.
 root.updateMatrixWorld=()=>{};
}
export class Renderer{
 constructor(canvas,world,settings){
  this.world=world;this.settings=settings;this.neutralLighting=world.project?.intent?.floor5Preparation?.runtimeLighting==='neutral-daylight';this.renderer=new THREE.WebGLRenderer({canvas,antialias:!settings.mobile,powerPreference:settings.mobile?'low-power':'high-performance'});this.renderer.info.autoReset=false;this.quality=settings.graphics;this.renderer.setPixelRatio(Math.min(devicePixelRatio,settings.mobile?(settings.graphics==='low'?.78:1):(settings.graphics==='low'?.85:1.5)));this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.04;this.renderer.shadowMap.enabled=!this.neutralLighting&&settings.graphics!=='low';this.renderer.shadowMap.type=THREE.PCFSoftShadowMap;this.renderer.shadowMap.autoUpdate=false;this.shadowAt=-Infinity;
  this.scene=new THREE.Scene();this.scene.background=new THREE.Color(0x28353d);if(this.neutralLighting){
   this.scene.add(new THREE.HemisphereLight(0xffffff,0xe3e3df,2.1));
   const daylight=new THREE.DirectionalLight(0xfffaf2,.65);daylight.position.set(-4,7,3);this.scene.add(daylight);
  }else this.scene.add(new THREE.HemisphereLight(0xd6e5ee,0x899298,1.35));this.camera=new THREE.PerspectiveCamera(76,1,.035,180);this.camera.rotation.order='YXZ';
  this.viewScene=new THREE.Scene();this.viewScene.add(new THREE.HemisphereLight(0xe2eff7,0x6c665b,1.45));const gunLight=new THREE.DirectionalLight(0xffe7c8,2.1);gunLight.position.set(-1,2,1);this.viewScene.add(gunLight);this.viewCamera=new THREE.PerspectiveCamera(60,1,.01,5);
  this.shadowOnlyMaterial=new THREE.MeshBasicMaterial({colorWrite:false,depthWrite:false});this.shadowDepthMaterial=new THREE.MeshDepthMaterial({depthPacking:THREE.RGBADepthPacking,side:THREE.DoubleSide});this.actorShadowGeometry=new THREE.CapsuleGeometry(.19,1.3,4,8);this.actorShadows=new Map();this.smokeMap=this.cloudTexture();this.registry=createMaterialRegistry(this.renderer,settings);this.makeEnvironment();this.lights=[];for(let i=0;!this.neutralLighting&&i<2;i++){const light=new THREE.SpotLight(i?0xddeaf1:0xffedcd,32,11,1.02,.65,1.4);light.castShadow=true;light.shadow.mapSize.set(1024,1024);light.shadow.bias=-.0006;light.shadow.normalBias=.025;light.shadow.camera.near=.08;this.scene.add(light,light.target);this.lights.push(light);}this.lightAt=-1;
  this.muzzle=new THREE.Mesh(new THREE.PlaneGeometry(.14,.14),new THREE.MeshBasicMaterial({map:this.muzzleTexture(),color:0xffd399,transparent:true,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));this.viewScene.add(this.muzzle);this.muzzle.visible=false;
  this.contactMap=contactTexture();this.contactMaterial=new THREE.MeshBasicMaterial({map:this.contactMap,transparent:true,depthWrite:false,opacity:.75});this.actors=new Map();this.grenades=new Map();this.smokes=new Map();this.drops=new Map();this.effects=[];this.tracerBatch=new TracerBatch(this.scene);this.combatEffects=new CombatEffects(this.scene,world,settings);this.weaponCache=new Map();this.lastWeapon='';this.recoil=0;this.hitUntil=0;this.damageUntil=0;this.damageDirection=null;this.switchAt=0;this.lastFrame=performance.now();this.frameTimes=new FrameTimeWindow();this.stats={fps:0,drawCalls:0,triangles:0};this.actorFrustum=new THREE.Frustum();this.actorProjection=new THREE.Matrix4();this.actorSphere=new THREE.Sphere(new THREE.Vector3(),2.2);this.bombModel=cartridge('bomb',1.8);this.scene.add(this.bombModel);this.assetsReady=this.build();this.resize();this.onResize=()=>this.resize();window.addEventListener('resize',this.onResize);
 }
 muzzleTexture(){const c=document.createElement('canvas');c.width=c.height=64;const x=c.getContext('2d'),g=x.createRadialGradient(32,32,0,32,32,30);g.addColorStop(0,'rgba(255,255,230,1)');g.addColorStop(.25,'rgba(255,210,110,.9)');g.addColorStop(1,'rgba(240,100,10,0)');x.fillStyle=g;x.beginPath();for(let i=0;i<16;i++){const a=i*Math.PI/8,r=i%2?8:31;x.lineTo(32+Math.cos(a)*r,32+Math.sin(a)*r);}x.closePath();x.fill();return new THREE.CanvasTexture(c);}
 makeEnvironment(){const room=new THREE.Scene();room.background=new THREE.Color(0x77868a);const geometry=new THREE.BoxGeometry(8,5,10);const walls=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:0xc0c8c7,side:THREE.BackSide,roughness:.8}));room.add(walls);room.add(new THREE.HemisphereLight(0xe9f0f6,0x596268,2));for(const x of[-2,2]){const light=new THREE.Mesh(new THREE.PlaneGeometry(1.5,4),new THREE.MeshBasicMaterial({color:0xffffff}));light.position.set(x,2.45,0);light.rotation.x=Math.PI/2;room.add(light);}const pmrem=new THREE.PMREMGenerator(this.renderer);this.environment=pmrem.fromScene(room,.04);this.scene.environment=this.viewScene.environment=this.environment.texture;this.scene.environmentIntensity=.82;this.viewScene.environmentIntensity=.65;pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});}
 cloudTexture(){const c=document.createElement('canvas');c.width=c.height=128;const x=c.getContext('2d');for(let i=0;i<22;i++){const a=i*2.4,r=Math.sqrt((i+.5)/22)*27,px=64+Math.cos(a)*r,py=64+Math.sin(a)*r,g=x.createRadialGradient(px,py,8,px,py,35);g.addColorStop(0,'rgba(255,255,255,.65)');g.addColorStop(1,'rgba(255,255,255,0)');x.fillStyle=g;x.fillRect(px-35,py-35,70,70);}return new THREE.CanvasTexture(c);}
 materialFor(b){if(b.upholsteryColor)return this.registry.get('fabric',{color:b.upholsteryColor});const key=b.material||'wall',r=this.registry,roomMaterial=roomMaterialOverride(b,r,this.roomVisualPlan);if(roomMaterial)return roomMaterial;let category=key==='frosted'?'frostedGlass':key;if(['emissive','light'].includes(key))return r.get('table',{color:0xffe4ba,emissive:0xffe4ba,emissiveIntensity:1.5});if(key==='wall'||key==='ceiling'||key==='carpet'||key==='office-carpet'||key==='vinyl'||key==='glass'||key==='frosted')return r.get(category,{side:THREE.DoubleSide});if(key==='wood')return r.get('wood');if(key==='metal')return r.get('metal');if(key==='table')return r.get((b.w>1.3&&b.d>.55&&b.y>.6&&b.y<1.2)?'wood':'table');if(key==='fabric')return r.get('fabric');return r.get('polymer',{color:color(b.color),roughness:key==='plant'?.9:.65});}
 async build(){
  const dynamicRoots=new Set(this.scene.children);
  this.roomVisualPlan=this.world.newLevel?{roomIds:[],overrides:new Map(),panels:[],shadows:[],finishes:[],finishByHost:new Map(),counts:{},cosmetic:true}:createRoomVisualPlan(this.world);this.roomFinishMaterial=createRoomFinishMaterial(this.registry);
  const desc=this.world.description,buckets=new Map(),shadowBuckets=new Map();const add=(geometry,material,x,z,cast=true,{visible=true,shadows=cast}={})=>{const key=`${material.uuid}/${Math.floor(x/12)}/${Math.floor(z/12)}/${cast}`;if(visible){if(!buckets.has(key))buckets.set(key,{geometries:[],material,cast});buckets.get(key).geometries.push(geometry);}if(!this.neutralLighting&&shadows&&!material.transparent){const cell=`${Math.floor(x/12)}/${Math.floor(z/12)}`;if(!shadowBuckets.has(cell))shadowBuckets.set(cell,[]);const g=geometry.index?geometry.toNonIndexed():geometry.clone();for(const name of Object.keys(g.attributes))if(name!=='position')g.deleteAttribute(name);shadowBuckets.get(cell).push(g);}};
  // Replacement faces are the sole visible surface. Original geometry still
  // feeds the existing depth proxy once, so shadow/physical topology is unchanged.
  const addSurface=(record,geometry,x,z,cast)=>{const material=this.materialFor(record),replacement=replaceRoomSurface(record,geometry,this.roomVisualPlan,material,this.roomFinishMaterial);if(!replacement){add(geometry,material,x,z,cast);return;}add(geometry,material,x,z,cast,{visible:false});geometry.dispose();for(const part of replacement.parts)add(part.geometry,part.material,x,z,cast,{shadows:false});};
  for(const b of desc.boxes){if(b.asset||b.glassId||b.detailVisual||b.studioVisual)continue;const g=new THREE.BoxGeometry(b.w,b.h,b.d);applyMetreUV(g);g.rotateY(b.angle||0);g.translate(b.x,b.y,b.z);addSurface(b,g,b.x,b.z,!['glass','frosted','emissive','blue-graphic'].includes(b.material));}
  for(const s of desc.surfaces){const g=surfaceGeometry(s.polygon,s.y),xs=s.polygon.map(p=>p[0]),zs=s.polygon.map(p=>p[1]);addSurface(s,g,(Math.min(...xs)+Math.max(...xs))/2,(Math.min(...zs)+Math.max(...zs))/2,s.y>2);}
  const loader=new GLTFLoader(),cache=new Map();for(const b of desc.boxes.filter(b=>b.asset)){let gltf=cache.get(b.asset);if(!gltf){gltf=await loader.loadAsync(new URL(`../../assets/fps/models/${b.asset}.glb`,import.meta.url).href);cache.set(b.asset,gltf);}const object=gltf.scene.clone(true);const bounds=new THREE.Box3().setFromObject(object),size=bounds.getSize(new THREE.Vector3()),center=bounds.getCenter(new THREE.Vector3());object.position.set(-center.x,-bounds.min.y,-center.z);const holder=new THREE.Group();holder.add(object);holder.scale.set(b.w/size.x,b.h/size.y,b.d/size.z);const anchor=new THREE.Group();anchor.add(holder);anchor.position.set(b.x,b.y-b.h/2,b.z);anchor.rotation.y=b.angle||0;anchor.updateMatrixWorld(true);object.traverse(mesh=>{if(mesh.isMesh){const geometry=mesh.geometry.clone().applyMatrix4(mesh.matrixWorld);let material=mesh.material;if(b.asset==='chairDesk'&&material.color?.r>material.color?.b*1.1){material=this.registry.get('fabric',b.upholsteryColor?{color:b.upholsteryColor}:{});applyMetreUV(geometry);}add(geometry,material,b.x,b.z);}});}
  for(const bucket of buckets.values()){const geometry=mergeGeometries(bucket.geometries,false);if(!geometry)throw new Error('Static material batch attributes do not match');const mesh=new THREE.Mesh(geometry,bucket.material);mesh.castShadow=false;mesh.receiveShadow=true;mesh.name='room-static-batch';this.scene.add(mesh);bucket.geometries.forEach(g=>g.dispose());}
  // Opaque static geometry shares one depth caster per area; PBR meshes keep their materials.
  for(const geometries of shadowBuckets.values()){const mesh=new THREE.Mesh(mergeGeometries(geometries),this.shadowOnlyMaterial);mesh.name='static-shadow-proxy';mesh.castShadow=true;mesh.customDepthMaterial=this.shadowDepthMaterial;this.scene.add(mesh);geometries.forEach(g=>g.dispose());}
  for(const l of desc.labels)label(this.scene,l.text.replace(' · PASSERKORT',' · ÖPPEN'),l.x,l.y,l.z,l.width,l.height,{fg:l.color,bg:l.accent,yaw:l.yaw});
  for(const[p,c,txt]of[[this.world.anchors.bomb,0xe5a04e,missionRoomName(this.world)+' · PLANTERA'],[this.world.anchors.rescue,0x76c8ae,'RÄDDNINGSZON']]){const ring=new THREE.Mesh(new THREE.RingGeometry(p.radius-.04,p.radius,64),new THREE.MeshBasicMaterial({color:c,side:THREE.DoubleSide,transparent:true,opacity:.6}));ring.rotation.x=-Math.PI/2;ring.position.set(p.x,.018,p.z);this.scene.add(ring);const sign=label(this.scene,txt,p.x,.02,p.z,p.radius*1.6,.26,{fg:'#f1e7d2',bg:'#384a4b'});sign.rotation.x=-Math.PI/2;}
  const shadows=[];for(const b of desc.boxes.filter(b=>b.asset||b.furnishingId&&b.h>.5)){if(b.y-b.h/2>.15)continue;const g=new THREE.PlaneGeometry(Math.min(b.w+.24,2.8),Math.min(b.d+.24,2.8));g.rotateX(-Math.PI/2);g.translate(b.x,.012,b.z);shadows.push(g);}if(shadows.length){const mesh=new THREE.Mesh(mergeGeometries(shadows),this.contactMaterial);this.scene.add(mesh);shadows.forEach(g=>g.dispose());}
  this.fixtures=desc.boxes.filter(b=>b.material==='emissive'&&b.y>2.3).map(b=>({x:b.x,y:2.66,z:b.z}));if(!this.neutralLighting&&!this.fixtures.length)this.fixtures=this.world.navigation.nodes.filter((n,i)=>i%18===0).map(n=>({...n,y:2.66}));this.decor=buildDecor(this.world,this.registry);this.scene.add(this.decor);this.roomVisuals=buildRoomVisuals(this.world,this.registry,{plan:this.roomVisualPlan});this.scene.add(this.roomVisuals);this.cartridgeProps=this.world.newLevel?new THREE.Group():buildCartridgeProps(this.world);this.scene.add(this.cartridgeProps);
  for(const root of this.scene.children)if(!dynamicRoots.has(root))freezeStaticTransforms(root);
  await this.registry.ready;if(!this.settings.mobile)await this.warmPrograms();else this.warmup={milliseconds:0,programs:this.renderer.info.programs?.length||0,textures:0,lazyMobile:true};
 }
 smokeMaterial(){return new THREE.MeshLambertMaterial({map:this.smokeMap,color:0xa5afa9,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide,forceSinglePass:true});}
 async warmPrograms(){
  // Compile the real room/material variants while Start still shows loading.
  // Corridors can have zero, one or two visible lamps. Otherwise crossing a
  // doorway can synchronously compile dozens of programs during combat.
  const started=performance.now(),visible=this.lights.map(l=>l.visible),shadows=this.renderer.shadowMap.enabled,textures=new Set([this.smokeMap]);
  this.scene.traverse(o=>{for(const m of [].concat(o.material||[]))for(const v of Object.values(m))if(v?.isTexture&&!v.isRenderTargetTexture)textures.add(v);});
  for(const texture of textures)this.renderer.initTexture(texture);
  this.smokeWarmMaterial=this.smokeMaterial();
  const smoke=new THREE.InstancedMesh(smokeGeo,this.smokeWarmMaterial,1);
  try{
   for(const shadowed of (this.neutralLighting?[false]:[false,true]))for(let count=0;count<=this.lights.length;count++){
    this.renderer.shadowMap.enabled=shadowed;this.lights.forEach((light,i)=>{light.visible=i<count;});
    await this.renderer.compileAsync(this.scene,this.camera);
    await this.renderer.compileAsync(smoke,this.camera,this.scene);
   }
  }finally{this.lights.forEach((light,i)=>{light.visible=visible[i];});this.renderer.shadowMap.enabled=shadows;smoke.dispose();}
  // Keep the warm-up material alive: disposing it releases its shader refs.
  this.warmup={milliseconds:performance.now()-started,programs:this.renderer.info.programs.length,textures:textures.size};
 }
 updateLights(p,t){
  const standard=this.settings.graphics!=='low',shadows=standard&&!this.neutralLighting;
  if(this.quality!==this.settings.graphics){this.quality=this.settings.graphics;this.renderer.setPixelRatio(Math.min(devicePixelRatio,this.settings.mobile?(standard?1:.78):(standard?1.5:.85)));this.resize();this.shadowAt=-Infinity;this.lightAt=-1;}
  this.renderer.shadowMap.enabled=shadows;
  // Animated casters update at 30 Hz; contact shadows and all gameplay/render
  // motion stay per-frame. Do not redraw two static room maps at 60+ Hz.
  this.renderer.shadowMap.needsUpdate=shadows&&t-this.shadowAt>=1/30-1e-8;
  if(this.renderer.shadowMap.needsUpdate)this.shadowAt=t;
  if(this.neutralLighting||t-this.lightAt<.3)return;this.lightAt=t;
  const nearest=this.fixtures.filter(f=>Math.hypot(f.x-p.x,f.z-p.z)<12&&this.world.segmentClear(f,{x:p.x,y:1.4,z:p.z},{vision:false})).sort((a,b)=>Math.hypot(a.x-p.x,a.z-p.z)-Math.hypot(b.x-p.x,b.z-p.z));
  let changed=false;
  this.lights.forEach((l,i)=>{const f=nearest[i];if(l.visible!==!!f||f&&(l.position.x!==f.x||l.position.z!==f.z))changed=true;l.visible=!!f;if(f){l.position.set(f.x,f.y,f.z);l.target.position.set(f.x,0,f.z);}});
  if(changed&&shadows){this.renderer.shadowMap.needsUpdate=true;this.shadowAt=t;}
 }
 actorModel(a){
  let model=this.actors.get(a.id);if(model){refreshActorCharacter(model,a.team,a.id);return model;}
  model=makeActor(a.team||'hostage',a.id,!a.team);model.traverse(o=>{if(o.isMesh)o.castShadow=false;});this.actors.set(a.id,model);this.scene.add(model);
  const shadow=new THREE.Mesh(new THREE.PlaneGeometry(.62,.62),this.contactMaterial);shadow.rotation.x=-Math.PI/2;this.scene.add(shadow);model.userData.contact=shadow;return model;
 }
 corpsePose(model,a,time){const age=time-a.deathAt;if(age<0||age>18)return false;if(!model.userData.fall){let choice=null;for(let i=0;i<12;i++){const angle=a.yaw+i*Math.PI/6;let free=0;for(let d=.2;d<1.7;d+=.15){if(!this.world.canOccupy(a.x+Math.sin(angle)*d,a.z+Math.cos(angle)*d,.25,.68,0))break;free=d;}if(!choice||free>choice.free)choice={angle,free};}model.userData.fall=choice;}
 model.userData.contact&&(model.userData.contact.visible=false);return animateCorpse(model,a,time,model.userData.fall);}
 resize(){const w=innerWidth,h=innerHeight;this.renderer.setSize(w,h,false);this.camera.userData.cartridgeViewportHeight=this.renderer.domElement.height;this.camera.aspect=this.viewCamera.aspect=w/h;this.camera.updateProjectionMatrix();this.viewCamera.updateProjectionMatrix();}
 events(events,game){this.combatEffects.handle(events,game);for(const e of events){if(e.type==='shot'||e.type==='knife'){const actor=this.actors.get(e.actorId);if(actor)actor.userData.shotAt=game.state.time;}if(e.type==='throw'&&e.actorId===game.player?.id)this.throwAt=game.state.time;if(e.type==='tracer'&&e.from&&e.to&&e.weapon!=='knife')this.tracerBatch.add(e.from,e.to,game.state.time);if(e.type==='shot'||e.type==='knife'){if(e.actorId===game.player?.id){this.recoil=.035;this.shotAt=game.state.time;if(e.weapon==='knife')this.swingAt=game.state.time;else this.muzzleUntil=game.state.time+.055;}}if(e.type==='hit'&&e.sourceId===game.player?.id)this.hitUntil=game.state.time+.15;if(e.type==='damage'&&e.actorId===game.player?.id){this.damageUntil=game.state.time+.55;this.damageDirection=e.direction;}if(['explosion','he','flash'].includes(e.type)&&Number.isFinite(e.x)){const blast=e.type!=='flash';for(let i=0;i<(blast?12:4);i++){const mesh=new THREE.Mesh(new THREE.PlaneGeometry(blast?.44:.28,blast?.44:.28),new THREE.MeshBasicMaterial({map:this.muzzle.material.map,color:blast?0xffb06a:0xfff8de,transparent:true,opacity:.9,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending}));const a=i*2.4,r=(i%3)*.12;mesh.position.set(e.x+Math.cos(a)*r,(e.y??1)+Math.sin(i)*r,e.z+Math.sin(a)*r);this.scene.add(mesh);this.effects.push({mesh,until:game.state.time+(blast?.28:.11),start:game.state.time,billboard:true,origin:mesh.position.clone(),velocity:new THREE.Vector3(Math.cos(a)*2.2,1+Math.sin(i)*1.5,Math.sin(a)*2.2)});}}}}

 render(game,viewActor,dt){const s=game.state,p=viewActor||game.player||this.world.anchors.analysts[0],h=p.height||1.72,t=s.time;const eye=h-.12,bob=this.settings.reducedMotion?0:Math.sin(t*11)*(p.moving?.018:0)*(1-(p.aimAmount||0)*.9);this.camera.position.set(p.x,p.y+eye+bob,p.z);this.camera.rotation.set(p.pitch||0,p.yaw||0,0);this.camera.updateMatrixWorld();
 this.actorFrustum.setFromProjectionMatrix(this.actorProjection.multiplyMatrices(this.camera.projectionMatrix,this.camera.matrixWorldInverse));this.stats.posedActors=0;this.stats.culledActors=0;
 this.tracerBatch.update(t);this.updateLights(p,t);this.combatEffects.update(t,this.effectTime==null?0:Math.max(0,Math.min(.1,t-this.effectTime)),this.camera);this.effectTime=t;
 for(const a of [...s.actors,...s.hostages]){
  if(!this.neutralLighting){
   let caster=this.actorShadows.get(a.id);
   if(!caster){
    caster=new THREE.Mesh(this.actorShadowGeometry,this.shadowOnlyMaterial);
    caster.customDepthMaterial=this.shadowDepthMaterial;caster.castShadow=true;
    this.scene.add(caster);this.actorShadows.set(a.id,caster);
   }
   caster.visible=a.alive!==false&&!a.rescued;
   caster.position.set(a.x,(a.y||0)+(a.height||1.7)/2,a.z);caster.scale.set(1,(a.height||1.7)/1.68,1);
  }
  const model=this.actorModel(a);const dead=a.alive===false;this.actorSphere.center.set(a.x,(a.y||0)+.9,a.z);const inFrame=this.actorFrustum.intersectsSphere(this.actorSphere);model.visible=a.id!==p.id&&!a.rescued&&inFrame&&(!dead||Number.isFinite(a.deathAt)&&t-a.deathAt<18);if(!inFrame)this.stats.culledActors++;else if(model.visible)this.stats.posedActors++;model.userData.contact.visible=model.visible&&!dead;model.userData.contact.position.set(a.x,.014,a.z);if(!model.visible)continue;if(dead){model.visible=this.corpsePose(model,a,t);continue;}model.userData.fall=null;model.position.set(a.x,a.y||0,a.z);model.rotation.set(0,a.yaw||0,0);const previousWeapon=model.userData.weaponModel;animateActor(model,a,t,dt,{cameraYaw:this.camera.rotation.y,shotAt:model.userData.shotAt??-Infinity});if(previousWeapon!==model.userData.weaponModel)model.userData.weaponModel?.traverse(o=>{if(o.isMesh)o.castShadow=false;});}
 for(const g of s.grenades){let model=this.grenades.get(g.id);if(!model){model=createThrownCartridge(g,t);this.grenades.set(g.id,model);this.scene.add(model);}updateThrownCartridge(model,g,t);}for(const [id,m]of this.grenades)if(!s.grenades.some(g=>g.id===id)){this.disposeTransient(m);this.grenades.delete(id);}
 for(const smoke of s.smokes){
  const id=smoke.id||smoke.until;let cloud=this.smokes.get(id);
  if(!cloud){
   // One draw for the same collision-clipped billboard cloud. The physical
   // smoke volume and AI sight tests remain owned by Game/physics.
   const material=this.smokeMaterial(),puffs=[];
   for(let i=0;i<48;i++){
    const radius=smoke.radius||3,ang=i*2.39996,ring=Math.sqrt((i+.5)/48)*radius*.84,x=smoke.x+Math.cos(ang)*ring,z=smoke.z+Math.sin(ang)*ring,y=.25+(i%5)*.49,pt={x,y,z};
    if(!this.world.segmentClear({x:smoke.x,y:Math.max(.2,smoke.y),z:smoke.z},pt,{vision:false}))continue;
    let size=Math.min(.57+(i%3)*.12,y,2.85-y);
    for(let k=0;k<8;k++){const angle=k*Math.PI/4,hit=this.world.raycast(pt,{x:Math.cos(angle),y:0,z:Math.sin(angle)},size*1.1,{vision:false});if(hit)size=Math.min(size,hit.distance*.92);}
    // A spinning billboard can touch geometry above/below its centre. Bound
    // its entire disc by exact 3D distance to nearby oriented solid boxes.
    for(const b of this.world.staticBoxes){
     const dx=x-b.x,dz=z-b.z,ex=Math.max(0,Math.abs(b.cos*dx-b.sin*dz)-b.w/2),ey=Math.max(0,Math.abs(y-b.y)-b.h/2),ez=Math.max(0,Math.abs(b.sin*dx+b.cos*dz)-b.d/2),distance2=ex*ex+ey*ey+ez*ez;
     if(distance2<size*size)size=Math.sqrt(distance2)*.92;
    }
    if(size>=.08)puffs.push({position:new THREE.Vector3(x,y,z),size:size/Math.SQRT2,phase:i*2.4});
   }
   cloud=new THREE.InstancedMesh(smokeGeo,material,puffs.length);cloud.name='collision-clipped-smoke';cloud.instanceMatrix.setUsage(THREE.DynamicDrawUsage);cloud.userData.puffs=puffs;
   // Conservative static sphere includes all clipped, camera-facing quads.
   cloud.boundingSphere=new THREE.Sphere(new THREE.Vector3(smoke.x,1.4,smoke.z),(smoke.radius||3)+1.5);
   this.smokes.set(id,cloud);this.scene.add(cloud);
  }
  const matrix=this.smokeMatrix??=new THREE.Matrix4(),quat=this.smokeQuaternion??=new THREE.Quaternion(),spin=this.smokeSpin??=new THREE.Quaternion(),axis=this.smokeAxis??=new THREE.Vector3(0,0,1),scale=this.smokeScale??=new THREE.Vector3();
  cloud.userData.puffs.forEach((p,i)=>{spin.setFromAxisAngle(axis,p.phase+t*.04);quat.copy(this.camera.quaternion).multiply(spin);scale.setScalar(p.size);matrix.compose(p.position,quat,scale);cloud.setMatrixAt(i,matrix);});
  cloud.instanceMatrix.needsUpdate=true;cloud.material.opacity=Math.min(.95,Math.max(0,(smoke.until-t)/2)*.9);
 }
 for(const [id,m]of this.smokes)if(!s.smokes.some(q=>(q.id||q.until)===id)){this.disposeTransient(m);this.smokes.delete(id);}
 const bomb=s.bomb;this.bombModel.visible=!!bomb&&['planted','dropped'].includes(bomb.status);if(this.bombModel.visible){this.bombModel.position.set(bomb.x,(bomb.y||0)+.05,bomb.z);this.bombModel.rotation.y=.3;}
 for(const d of s.drops){let m=this.drops.get(d.id);if(!m){m=makeWeapon(d.item?.id||'ar47',{viewmodel:false});m.rotation.z=Math.PI/2;m.scale.setScalar(.8);this.drops.set(d.id,m);this.scene.add(m);}m.position.set(d.x,.15,d.z);}for(const [id,m] of this.drops)if(!s.drops.some(d=>d.id===id)){this.disposeTransient(m);this.drops.delete(id);}
 this.effects=this.effects.filter(f=>{if(t>f.until){this.disposeTransient(f.mesh);return false;}if(f.billboard){f.mesh.quaternion.copy(this.camera.quaternion);f.mesh.position.copy(f.origin).addScaledVector(f.velocity,Math.max(0,t-f.start));}f.mesh.material.opacity=(f.until-t)/Math.max(.001,f.until-f.start);return true;});
 if(p.weapon!==this.lastWeapon){if(this.weaponModel)this.viewScene.remove(this.weaponModel);this.weaponModel=this.weaponCache.get(p.weapon);if(!this.weaponModel){this.weaponModel=makeWeapon(p.weapon||'p9');this.weaponCache.set(p.weapon,this.weaponModel);}this.viewScene.add(this.weaponModel);this.lastWeapon=p.weapon;this.switchAt=t;}
 if(this.weaponModel){syncWeaponAppearance(this.weaponModel,privateCharacterAppearance(p.id));this.recoil*=Math.exp(-dt*18);const pose=animateWeapon(this.weaponModel,p,t,dt,{reducedMotion:this.settings.reducedMotion,recoil:this.recoil,shotAt:this.shotAt??-Infinity,switchAt:this.switchAt,throwAt:this.throwAt??-Infinity,swingAt:this.swingAt??-Infinity});this.weaponModel.visible=p.alive!==false&&s.phase!=='menu'&&!(p.weapon==='sniper'&&p.aimAmount>.92);this.muzzle.visible=this.weaponModel.visible&&t<(this.muzzleUntil||0);this.weaponModel.updateMatrixWorld(true);const muzzle=pose?.muzzle||this.weaponModel.userData.muzzle||new THREE.Vector3(0,.08,-.4);this.muzzle.position.copy(pose?.muzzle||this.weaponModel.localToWorld(muzzle.clone()));this.muzzle.rotation.z=t*83;}
 this.facilityScene?.update(this.camera);this.renderer.info.reset();this.renderer.autoClear=true;this.renderer.render(this.scene,this.camera);if(this.weaponModel?.visible){this.renderer.autoClear=false;this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);}this.stats.drawCalls=this.renderer.info.render.calls;this.stats.triangles=this.renderer.info.render.triangles;const now=performance.now();this.stats.fps=this.frameTimes.push(now-this.lastFrame);this.lastFrame=now;
 }
 smokeOpacity(actor,smokes){let value=0;for(const sm of smokes){const d=Math.hypot(actor.x-sm.x,actor.z-sm.z);if(d<(sm.radius||3)&&this.world.segmentClear({x:actor.x,y:(actor.y||0)+1,z:actor.z},{x:sm.x,y:Math.max(.5,sm.y),z:sm.z},{vision:false}))value=Math.max(value,Math.min(.97,((sm.radius||3)-d)*.8));}return value;}
 resetTransient(){this.tracerBatch.clear();this.combatEffects.clear();this.effectTime=null;this.lightAt=-1;this.shadowAt=-Infinity;for(const model of this.actors.values()){model.userData.fall=null;model.rotation.set(0,0,0);}for(const f of this.effects)this.disposeTransient(f.mesh);this.effects=[];for(const map of [this.grenades,this.smokes,this.drops]){for(const m of map.values())this.disposeTransient(m);map.clear();}this.recoil=0;this.hitUntil=0;this.damageUntil=0;this.damageDirection=null;this.shotAt=-1;this.throwAt=-1;this.swingAt=-1;this.muzzleUntil=0;this.switchAt=-1;this.muzzle.visible=false;this.bombModel.visible=false;this.lastWeapon='';this.frameTimes.clear();this.lastFrame=performance.now();}
 disposeTransient(object){this.scene.remove(object);if(object.isInstancedMesh)object.dispose();const mats=new Set(),geos=new Set();object.traverse(o=>{if(o.material&&!o.material.userData.sharedWeapon)mats.add(o.material);if(o.geometry&&!o.geometry.userData.sharedWeapon&&o.geometry!==boxGeo&&o.geometry!==sphereGeo&&o.geometry!==smokeGeo)geos.add(o.geometry);});for(const m of mats){if(m.map!==this.smokeMap&&m.map!==this.muzzle.material.map)m.map?.dispose();m.dispose();}for(const g of geos)g.dispose();}
 dispose(){this.tracerBatch.dispose();window.removeEventListener('resize',this.onResize);this.combatEffects.dispose();this.registry.dispose();this.decor?.userData.dispose?.();this.roomVisuals?.userData.dispose?.();this.roomFinishMaterial?.dispose();this.cartridgeProps?.userData.dispose?.();disposeCartridgeResources();disposeWeaponResources();this.smokeWarmMaterial?.dispose();this.environment.dispose();this.smokeMap.dispose();this.actorShadowGeometry.dispose();this.shadowOnlyMaterial.dispose();this.shadowDepthMaterial.dispose();this.renderer.dispose();}
}
