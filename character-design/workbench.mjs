import {roleOf,dwarfVariant} from '../src/fps/character-roles.mjs?v=6.1.2';
import {createDwarfAsset,createDwarfAvatar} from '../src/fps/dwarf-rig.mjs?v=6.1.2';
import {loadScan,applyScanHead} from './scan-head.mjs?v=53';
import {ClothPreview} from './cloth-preview.mjs?v=6.1.2';
import {SculptEngine,prepareSculptGeometry} from './sculpt-engine.mjs?v=6.1.2';
/** Live visual preview of the original game skeleton and authored static parts. */
import * as T from '../vendor/three/three.module.js';
import {loadCharacterLibrary,createAuthoredAvatar,disposeAvatar} from '../src/fps/character-library.mjs?v=6.1.2';
import {makeAccessory,fitAccessory} from './anatomy-accessories.mjs?v=6.1.2';
import {REQUIRED_CLIPS,upgradeAccessories} from './project-schema.mjs?v=6.1.2';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {inspectGLB} from '../furniture-editor/library/glb-utils.mjs';
import {dataToBytes} from './project-store.mjs?v=53';
import {FashionPreview} from './fashion-preview.mjs?v=6.1.2';
const PREVIEW_BG=new T.Color(0x121a26);
const RAD=Math.PI/180,SW=480,SH=680,PW=720,PH=660;
function characterId(gender){
 for(let i=0;i<200;i++){
  const id='design-'+i;
  const seed=[...id].reduce((n,c)=>(Math.imul(n,31)+c.charCodeAt(0))>>>0,7);
  if((seed%3===0)===(gender==='female'))return id;
 }
 throw Error('Kunde inte välja grundrigg.');
}
export class DesignWorkbench{
 constructor(preview,bases){
  this.preview=preview;this.bases=bases;
  this.renderer=null;this.scene=null;this.avatar=null;this.project=null;
  this.imports=new Map();this.importData=new Map();this.objectRoot=null;this.partMeshes=new Map();
  this.cloth=new ClothPreview();this.sculpt=new SculptEngine();this.fashion=new FashionPreview(()=>this.scheduleRender());this.focus='body';this.faceView='front';this.faceCanvas=null;this.animationSpeed=1;
  this.pan=new T.Vector2();this.renderPending=false;this.yaw=.44;this.pitch=.13;this.zoom=1;this.flipped=false;this.playing=false;
  this.currentAction=null;this.initialized=false;this.lastFrame=0;this.frame=0;
 }
 async initialize(){
  this.renderer=new T.WebGLRenderer({canvas:this.preview,antialias:true,preserveDrawingBuffer:true});
  this.renderer.setPixelRatio(1);this.renderer.setSize(PW,PH,false);
  this.renderer.outputColorSpace=T.SRGBColorSpace;
  this.renderer.toneMapping=T.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.3;
  const room=new T.Scene();room.background=new T.Color(.3,.3,.3);for(const [position,size,intensity]of [[[-3,3,2],[2,4,.1],4],[[3,2,-2],[2,3,.1],2],[[0,5,0],[3,.1,3],3]]){const panel=new T.Mesh(new T.BoxGeometry(...size),new T.MeshBasicMaterial({color:new T.Color(intensity,intensity,intensity)}));panel.position.fromArray(position);room.add(panel);}const pmrem=new T.PMREMGenerator(this.renderer);this.studioEnvironment=pmrem.fromScene(room,.04);pmrem.dispose();room.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
  this.scene=new T.Scene();this.scene.background=new T.Color(0xf1f7f5);
  this.hemi=new T.HemisphereLight(0xffffff,0x83979e,2.25);this.scene.add(this.hemi);
  const key=new T.DirectionalLight(0xffffff,2.2);key.position.set(-3,6,5);this.scene.add(key);
  const fill=new T.DirectionalLight(0xe5edff,1.2);fill.position.set(3,4,-4);this.scene.add(fill);
  this.grid=new T.GridHelper(5,25,0xa3bdbc,0xd7e5e1);this.grid.position.y=-.013;this.scene.add(this.grid);
  this.objectRoot=new T.Group();this.objectRoot.name='object-workshop';this.scene.add(this.objectRoot);
  this.camera=new T.OrthographicCamera(-1.6,1.6,1.47,-1.47,.01,100);
  this.sheetCamera=new T.OrthographicCamera(-1.17*SW/SH,1.17*SW/SH,1.17,-1.17,.01,100);
  this.faceCamera=new T.OrthographicCamera(-.38,.38,.38,-.38,.01,100);
  await loadCharacterLibrary();
  // A shared artist-authored short silhouette, fitted to either target scalp.
  // The female source hairstyle is longer and is kept for Originalfrisyr only.
  const hairDonor=createAuthoredAvatar('analysts',characterId('male'),false,{ignoreOverrides:true,gender:'male'});
  const donorSkin=hairDonor.meshes.find(m=>m.material?.name==='face-skin'),bounds=new T.Box3().setFromBufferAttribute(donorSkin.geometry.attributes.position);
  this.studioHairSource={geometry:hairDonor.meshes.find(m=>m.material?.name==='hair'&&!/eyebrow/i.test(m.name)).geometry.clone(),scalpBounds:{top:bounds.max.y,width:bounds.max.x-bounds.min.x,depth:bounds.max.z-bounds.min.z,centerZ:(bounds.max.z+bounds.min.z)/2}};
  disposeAvatar(hairDonor);
  try{this.scan=await loadScan();}catch(e){this.scanError=e.message;}
  this.initialized=true;
 }
 update(project,{recreate=false,rebuild=false}={}){
  if(!this.initialized)return;
  const old=this.project;this.project=project;const headProfile=project.creative?.realism?.head||'original';upgradeAccessories(project);
  if(project.kind==='character'&&(!this.avatar||recreate||this.headProfile!==headProfile||old?.base.gender!==project.base.gender||old?.base.team!==project.base.team||!!this.avatar.isDwarf!==(roleOf(project)==='dwarf'))){
   this.clearParts();this.fashion.dispose();this.cloth.clear();
   if(this.avatar){this.avatar.holder.removeFromParent();disposeAvatar(this.avatar);}
   this.avatar=roleOf(project)==='dwarf'?createDwarfAvatar(createDwarfAsset(dwarfVariant(project))):createAuthoredAvatar(project.base.team==='hostage'?'analysts':project.base.team,characterId(project.base.gender),roleOf(project)==='hostage',{ignoreOverrides:true,gender:project.base.gender});
   if(this.avatar.isDwarf)this.avatar.ownedGeometry.push(...this.avatar.meshes.map(m=>m.geometry));
   this.avatar.studioHairSource=this.avatar.isDwarf?null:this.studioHairSource;
   this.headProfile=headProfile;if(headProfile==='scan'){if(!this.scan)throw Error('Det skannade huvudet kunde inte laddas: '+this.scanError);applyScanHead(this.avatar,this.scan);for(const m of this.avatar.meshes)if(m.material?.name==='eyes'||m.material?.name==='hair'&&/eyebrow/i.test(m.name))m.userData.sculptDisabled=true;}
   this.sculptRevision=-1;prepareSculptGeometry(this.avatar);
   this.avatar.holder.rotation.y=0; // Studio canonical front is +Z (game actors face -Z).
   this.scene.add(this.avatar.holder);
   rebuild=true;
  }
  if(this.avatar)this.avatar.holder.visible=project.kind==='character';
  this.objectRoot.visible=project.kind==='object';
  // All fashion overlays attach in the same canonical idle rest pose.
  // This avoids misaligned decals after a user previously previewed crouching or death.
  if(project.kind==='character'&&this.avatar)this.neutralRest();
  this.updateAppearance();
  const anatomyKey=JSON.stringify({gender:project.base.gender,face:project.creative?.face,sculpt:project.creative?.sculpt?.revision});
  if(this.accessoryAnatomyKey!==anatomyKey&&project.parts.some(p=>p.preset))rebuild=true;this.accessoryAnatomyKey=anatomyKey;
  if(rebuild||old?.kind!==project.kind)this.rebuildParts();
  if(project.kind==='character'&&this.avatar){this.pose(project.pose,false);if(project.creative?.realism)this.cloth.configure(project,this.avatar,this.fashion.sources);}else this.cloth.clear();
  this.renderSheet();
 }
 updateAppearance(){
  if(!this.avatar||!this.project)return;
  const {palette:p,body,base}=this.project;const realism=this.project.creative?.realism;this.scene.environment=realism&&(realism.head==='scan'||realism.fiberHair||realism.fabric!=='original'||realism.garment!=='none')?this.studioEnvironment.texture:null;this.scene.environmentIntensity=.35;this.renderer.toneMappingExposure=realism?.head==='scan'?.95:1.3;this.hemi.intensity=realism?.head==='scan'?1.4:2.25;
  const customClothes=this.project.creative?.outfit&&this.project.creative.outfit!=='original';
  const customHair=this.project.creative?.hair&&this.project.creative.hair!=='original'||this.project.parts.some(p=>p.visible&&(['cap','helmet','hair'].includes(p.preset)||p.hairReplacement));
  const hideTactical=base.template==='blank'||base.template==='civilian'||customClothes;
  const seen=new Set();
  for(const mesh of this.avatar.meshes){
   const m=mesh.material,name=m?.name||'',objectName=mesh.name||'';
   mesh.visible=!mesh.userData.legacyFootwear&&!(hideTactical&&/^(continuous-(chest|back)-rig|vest-pocket|pocket-flap|shoulder-webbing|radio|radio-aerial|headset|chest-role-patch|back-role-patch)$/.test(objectName))&&!(customHair&&name==='hair')&&!(customHair&&objectName==='headset');
   if(!m?.color||seen.has(m))continue;
   seen.add(m);
   if(name==='jacket-fabric')m.color.set(p.jacket);
   if(name==='trousers-fabric')m.color.set(p.pants);
   if(name==='vest-shell')m.color.set(p.vest);
   if(name==='hair')m.color.set(p.hair);
   if(name==='face-skin')m.color.set(p.skin);if(name==='scan-neck-skin')m.color.set(p.skin).multiply(new T.Color('#d8b6a9'));
  }
  for(const mesh of this.avatar.meshes){
   const n=mesh.name||'',m=mesh.material;
   if(!m?.color)continue;
   if(/^(boot-shell|boot-shaft|shoe-upper)/.test(n))m.color.set(p.boots);
   else if(n.startsWith('continuous-')||n==='vest-pocket'||n==='shoulder-webbing')m.color.set(p.vest);
   else if(n==='pocket-flap')m.color.set(p.accent);
  }
  const scale=this.avatar.scale;
  this.avatar.holder.scale.set(scale*body.width/100,scale*body.height/100,scale*body.width/100);
  this.avatar.holder.updateWorldMatrix(true,true);
  if(this.avatar.isDwarf)for(const mesh of this.avatar.meshes){const name=mesh.material?.name;if(name==='dwarf-beard'){mesh.material.color.set(p.hair);mesh.visible=this.project.creative.face.facialHair==='Helskägg';}if(name==='dwarf-shoe')mesh.material.color.set(p.boots);if(name==='dwarf-metal')mesh.material.color.set(p.accent);if(name==='dwarf-trim'||name==='dwarf-hat-brim')mesh.material.color.set(p.vest);if(name?.startsWith('dwarf-hat')){mesh.visible=!customHair;if(name==='dwarf-hat')mesh.material.color.set(p.jacket);}}
  if(this.project.kind==='character'){this.fashion.create(this.project,this.avatar,this.sculpt);this.fashion.syncAppearance(this.project,this.avatar);}
  else this.fashion.dispose();
  if(this.avatar.scanHead)for(const m of this.avatar.meshes)if(m.userData.sculptDisabled)m.visible=false;
 }
 async prepareAssets(project){
  for(const part of project.parts){
   if(part.shape!=='glb')continue;
   const data=project.embeddedReferences?.[part.asset];if(!data)throw Error('GLB-filen saknas: '+part.asset);
   if(this.importData.get(part.asset)===data)continue;
   const bytes=dataToBytes(data);inspectGLB(bytes);
   const asset=await new GLTFLoader().parseAsync(bytes.buffer,'');
   const old=this.imports.get(part.asset);old?.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat()){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});
   this.imports.set(part.asset,asset.scene);this.importData.set(part.asset,data);
  }
 }
 fitPart(part){
  if(!this.avatar||!part.preset)return false;this.neutralRest();fitAccessory(part,this.avatar);return true;
 }
 createPartMesh(part){
  if(part.preset&&this.avatar){
   const mesh=makeAccessory(part.preset,part.color,this.avatar);mesh.name=part.name;mesh.userData.designId=part.id;mesh.position.fromArray(part.position);mesh.rotation.set(...part.rotation.map(x=>x*RAD));mesh.scale.fromArray(part.dimensions);if(part.mirrored)mesh.scale.x*=-1;mesh.visible=part.visible;return mesh;
  }
  if(part.shape==='glb'){
   const source=this.imports.get(part.asset);if(!source)throw Error('Tillbehöret har inte lästs in.');
   const mesh=new T.Group(),model=source.clone(true),a=[],b=[];source.traverse(o=>a.push(o));model.traverse(o=>b.push(o));const map=new Map(a.map((o,i)=>[o,b[i]]));for(const [o,n]of map)if(o.isSkinnedMesh){n.skeleton=new T.Skeleton(o.skeleton.bones.map(v=>map.get(v)),o.skeleton.boneInverses.map(v=>v.clone()));n.bindMatrix.copy(o.bindMatrix);n.bindMatrixInverse.copy(o.bindMatrixInverse);}
   mesh.add(model);
   model.updateMatrixWorld(true);const box=new T.Box3().setFromObject(model),size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3());
   model.position.sub(center);model.scale.set(1/Math.max(.001,size.x),1/Math.max(.001,size.y),1/Math.max(.001,size.z));model.position.multiply(model.scale);if(part.mirrored){model.scale.x*=-1;model.position.x*=-1;}
   model.traverse(o=>{if(o.isMesh){o.geometry=o.geometry.clone();o.material=Array.isArray(o.material)?o.material.map(m=>m.clone()):o.material.clone();}});
   mesh.name=part.name;mesh.userData.designId=part.id;mesh.position.fromArray(part.position);mesh.rotation.set(...part.rotation.map(x=>x*RAD));mesh.scale.fromArray(part.dimensions);mesh.visible=part.visible;return mesh;
  }

  let g;
  switch(part.shape){
   case 'sphere':g=new T.SphereGeometry(.5,18,12);break;
   case 'cylinder':g=new T.CylinderGeometry(.5,.5,1,18);break;
   case 'cone':g=new T.ConeGeometry(.5,1,18);break;
   case 'torus':g=new T.TorusGeometry(.42,.12,10,24);break;
   default:g=new T.BoxGeometry(1,1,1);
  }
  const material=new T.MeshStandardMaterial({color:part.color,roughness:.76,metalness:.035,side:T.DoubleSide});
  const mesh=new T.Mesh(g,material);mesh.name=part.name;mesh.userData.designId=part.id;
  mesh.castShadow=false;mesh.receiveShadow=true;
  mesh.position.fromArray(part.position);
  mesh.rotation.set(...part.rotation.map(x=>x*RAD));
  mesh.scale.fromArray(part.dimensions);if(part.mirrored)mesh.scale.x*=-1;
  mesh.visible=part.visible;
  return mesh;
 }
 clearParts(){
  for(const mesh of this.partMeshes.values()){
   mesh.removeFromParent();mesh.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat())m?.dispose();});
  }
  this.partMeshes.clear();
 }
 rebuildParts(){
  this.clearParts();
  const p=this.project;if(!p)return;
  if(p.kind==='character'&&this.avatar){
   // Define attachments in the neutral character space, then parent to a named bone.
   // This preserves their rest placement while following existing motion clips.
   this.avatar.holder.scale.setScalar(this.avatar.scale);
   this.neutralRest();
  }
  for(const part of p.parts){
   if(part.preset&&(part.fitVersion===0||part.followsFace&&this.sculptRevision!==p.creative?.sculpt?.revision))this.fitPart(part);
   const mesh=this.createPartMesh(part);
   this.partMeshes.set(part.id,mesh);
   if(p.kind==='object'){this.objectRoot.add(mesh);continue;}
   if(!this.avatar)continue;
   this.avatar.root.add(mesh);
   if(part.anchor!=='root'){
    const bone=this.avatar.bones.get(part.anchor);
    if(!bone)throw Error('Skelettet saknar fästpunkt: '+part.anchor);
    this.avatar.root.updateWorldMatrix(true,true);
    bone.attach(mesh);
   }
  }
  this.sculptRevision=p.creative?.sculpt?.revision;
  this.updateAppearance();
  if(p.kind==='character')this.pose(p.pose,false);
  this.playing=false;
 }
 updatePartTransforms(){
  // Reparent whenever a neutral-space position changes: bone-local space is
  // not equal to the character coordinates displayed on the sliders.
  this.rebuildParts();
 }
 neutralRest(){
  if(!this.avatar)return;this.avatar.mixer.stopAllAction();
  this.avatar.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.pose();});this.avatar.root.updateWorldMatrix(true,true);
 }
 pose(name,play=false){
  if(!this.avatar||!this.avatar.clips.has(name))return false;
  const poseChanged=this.currentAction?.getClip()?.name!==name;this.playing=play;
  const mixer=this.avatar.mixer;
  mixer.stopAllAction();
  this.currentAction=mixer.clipAction(this.avatar.clips.get(name));
  this.currentAction.reset().setEffectiveWeight(1);
  if(name==='Death01'){this.currentAction.setLoop(T.LoopOnce,1);this.currentAction.clampWhenFinished=true;}
  else this.currentAction.setLoop(T.LoopRepeat,Infinity);
  this.currentAction.play();
  mixer.setTime(.23);
  this.avatar.root.updateWorldMatrix(true,true);
  this.avatar.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  if(poseChanged&&this.cloth.mesh)this.cloth.reset();
  return true;
 }
 playToggle(){
  if(!this.avatar||this.project?.kind!=='character')return false;
  this.playing=!this.playing;
  if(this.playing&&!this.currentAction?.isRunning())this.pose(this.project.pose,true);
  this.lastFrame=0;return this.playing;
 }
 tick(time){
  if(!this.initialized||!this.playing||this.project?.kind!=='character')return;
  const delta=this.lastFrame?Math.max(0,Math.min(.06,(time-this.lastFrame)/1000)):0;
  this.lastFrame=time;
  this.avatar.mixer.update(delta*this.animationSpeed);
  this.avatar.root.updateMatrixWorld(true);
  this.cloth.step(delta);this.renderPreview();
  // Reference sheets are refreshed on pause/edit/export, not during playback.
 }
 getFraming(){
  if(this.project?.kind==='character'){
   if(this.focus==='shoes')return {center:new T.Vector3(0,.16,0),span:.65};
   if(this.focus==='head'&&this.sculpt.headFraming())return this.sculpt.headFraming();
   if(this.focus==='head'&&this.avatar){const v=this.avatar.bones.get('Head')?.getWorldPosition(new T.Vector3());if(v)return {center:v,span:.74};}
   return this.avatar?.isDwarf?{center:new T.Vector3(0,.45,0),span:1.2}:{center:new T.Vector3(0,.90,0),span:2.43};
  }
  const box=new T.Box3();
  for(const mesh of this.partMeshes.values())if(mesh.visible)box.expandByObject(mesh);
  if(box.isEmpty())return {center:new T.Vector3(0,.4,0),span:2.4};
  const size=new T.Vector3(),center=new T.Vector3();box.getSize(size);box.getCenter(center);
  return {center,span:Math.max(1.5,size.y*1.35,size.x*1.8,size.z*1.8)};
 }
 renderPreview(){
  if(!this.initialized||!this.project)return;
  const {center,span}=this.getFraming();center.x+=this.pan.x;center.y+=this.pan.y;
  this.grid.visible=true;
  const rect=this.preview.getBoundingClientRect(),aspect=rect.width/Math.max(1,rect.height);
  const width=Math.max(240,Math.min(PW,Math.round(rect.width*Math.min(1.5,globalThis.devicePixelRatio||1))));
  this.renderer.setSize(width,Math.round(width/aspect),false);
  this.camera.left=-span*aspect/2;this.camera.right=span*aspect/2;
  this.camera.top=span/2;this.camera.bottom=-span/2;
  this.camera.zoom=this.zoom;
  const dist=4;
  this.camera.position.set(center.x+Math.sin(this.yaw)*dist*Math.cos(this.pitch),center.y+Math.sin(this.pitch)*dist,center.z+Math.cos(this.yaw)*dist*Math.cos(this.pitch));
  this.camera.lookAt(center);this.camera.updateProjectionMatrix();
  // Interactive preview only: dark studio backdrop. Sheets/exports keep scene.background.
  const bg=this.scene.background;this.scene.background=PREVIEW_BG;
  this.renderer.render(this.scene,this.camera);this.scene.background=bg;
 }
 renderSheet(){
  if(!this.initialized||!this.project)return;
  const focus=this.focus;this.focus='body';
  const {center,span}=this.getFraming();this.focus=focus;const s=span/2,ratio=SW/SH,flip=this.flipped?-1:1;
  const positions={front:[0,0,4*flip],back:[0,0,-4*flip],left:[-4*flip,0,0],right:[4*flip,0,0]};
  this.grid.visible=false;
  this.renderer.setSize(SW,SH,false);
  this.sheetCamera.left=-s*ratio;this.sheetCamera.right=s*ratio;
  this.sheetCamera.top=s;this.sheetCamera.bottom=-s;this.sheetCamera.zoom=1;
  for(const [name,canvas]of this.bases){
   const p=positions[name];
   this.sheetCamera.position.set(center.x+p[0],center.y+p[1],center.z+p[2]);
   this.sheetCamera.lookAt(center);this.sheetCamera.updateProjectionMatrix();
   this.renderer.render(this.scene,this.sheetCamera);
   const ctx=canvas.getContext('2d');
   ctx.clearRect(0,0,SW,SH);
   ctx.drawImage(this.renderer.domElement,0,0,SW,SH);
  }
  this.renderFace();
  this.renderPreview();
 }
 renderFace(view=this.faceView){
  if(!this.initialized||!this.avatar||this.project?.kind!=='character'||!this.faceCanvas)return;
  const legacy=this.project.artwork?.portraitFraming==='legacy-headbone-v4';
  const origin=!legacy&&this.sculpt.headFraming()?.center||this.avatar.bones.get('Head')?.getWorldPosition(new T.Vector3());if(!origin)return;
  const size=1024,zoom=legacy?.40:.23;
  this.faceCamera.left=-zoom;this.faceCamera.right=zoom;this.faceCamera.top=zoom;this.faceCamera.bottom=-zoom;
  const side=this.flipped?-1:1;
  const positions={front:[0,0,3.2*side],left:[-3.2*side,0,0],right:[3.2*side,0,0]};
  const p=positions[view]||positions.front;
  this.faceCamera.position.copy(origin).add(new T.Vector3(...p));
  this.faceCamera.lookAt(origin);this.faceCamera.updateProjectionMatrix();
  this.renderer.setSize(size,size,false);this.grid.visible=false;
  this.renderer.render(this.scene,this.faceCamera);
  const ctx=this.faceCanvas.getContext('2d');ctx.clearRect(0,0,size,size);
  ctx.drawImage(this.renderer.domElement,0,0,size,size);
  this.renderPreview();
 }
 scrub(fraction){
  if(!this.avatar||!this.currentAction)return;
  this.playing=false;
  const clip=this.currentAction.getClip();
  this.avatar.mixer.setTime(Math.min(clip.duration-.001,Math.max(0,fraction)*clip.duration));
  this.avatar.root.updateMatrixWorld(true);if(this.cloth.mesh){this.cloth.reset();this.cloth.settle(90);}this.renderSheet();
 }
 getPartInstances(){
  this.scene?.updateMatrixWorld(true);
  return (this.project?.parts||[]).filter(part=>part.visible&&this.partMeshes.has(part.id)).map(part=>({
   id:part.id,name:part.name,anchor:part.anchor,mesh:this.partMeshes.get(part.id)
  }));
 }
 scheduleRender(){
  if(this.renderPending)return;this.renderPending=true;
  requestAnimationFrame(()=>{this.renderPending=false;this.renderSheet();});
 }
 async exportParts(){
  const group=new T.Group(),geometries=[];
  this.scene.updateMatrixWorld(true);
  for(const {mesh:root}of this.getPartInstances())root.traverseVisible(mesh=>{
   if(!mesh.isMesh)return;
   const geometry=mesh.geometry.clone();geometries.push(geometry);
   if(mesh.isSkinnedMesh){const pos=geometry.attributes.position,v=new T.Vector3();for(let i=0;i<pos.count;i++){mesh.getVertexPosition(i,v);pos.setXYZ(i,v.x,v.y,v.z);}geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.computeVertexNormals();}
   const baked=new T.Mesh(geometry,mesh.material);baked.name=mesh.name;mesh.matrixWorld.decompose(baked.position,baked.quaternion,baked.scale);group.add(baked);
  });
  if(!group.children.length)throw Error('Lägg till minst en synlig del.');
  try{return await new GLTFExporter().parseAsync(group,{binary:true});}finally{for(const g of geometries)g.dispose();}
 }
 async exportPreview(){
  if(!this.project)throw Error('Projekt saknas.');
  const playing=this.playing,time=this.avatar?.mixer.time||0;
  this.playing=false;
  if(this.project.kind==='character')this.pose('Idle_Loop',false);
  try{
   return await new GLTFExporter().parseAsync(this.project.kind==='character'?this.avatar.holder:this.objectRoot,{binary:true,onlyVisible:true,animations:this.project.kind==='character'?[...this.avatar.clips.values()]:[],maxTextureSize:4096});
  }finally{if(this.avatar){this.pose(this.project.pose,false);this.avatar.mixer.setTime(time);}this.playing=playing;this.renderSheet();}
 }
 prepareHandoff(){if(this.cloth.mesh){this.playing=false;this.pose('Idle_Loop',false);this.cloth.reset();this.cloth.settle(180);}}
 getClips(){return this.avatar?[...this.avatar.clips.keys()]:[];}
 getBones(){return this.avatar?[...this.avatar.bones.keys()]:[];}
 dispose(){
  this.clearParts();this.fashion.dispose();this.cloth.clear();
  if(this.avatar){this.avatar.holder.removeFromParent();disposeAvatar(this.avatar);}
  for(const model of this.imports.values())model.traverse(o=>{o.geometry?.dispose();for(const m of [o.material].flat()){if(!m)continue;for(const v of Object.values(m))if(v?.isTexture)v.dispose();m.dispose();}});this.imports.clear();this.importData.clear();
  this.studioHairSource?.geometry.dispose();this.studioEnvironment?.dispose();this.renderer?.dispose();
 }
}
