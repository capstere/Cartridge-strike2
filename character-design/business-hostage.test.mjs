import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../vendor/three/three.module.js';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {characterDataLoader,asBuffer} from '../tools/character-data-loader.mjs';
import {installCharacterTemplates,installDefaultHostageTemplate,createAuthoredAvatar,animateAuthored,posedBounds,disposeAvatar,disposeCharacterLibrary} from '../src/fps/character-library.mjs?v=6.1.2';
import {installCharacterOverride,clearCharacterOverrides} from '../src/fps/character-overrides.mjs?v=6.1.2';
import {ACTOR_FORMAT,actorHash} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
const physicalBounds=s=>{const parent=new T.Group();parent.add(s.holder);const b=posedBounds(parent);parent.remove(s.holder);return b;};
const loader=characterDataLoader(),load=async p=>loader.parseAsync(asBuffer(await readFile(new URL('../'+p,import.meta.url))),'');
const [male,female,business]=await Promise.all(['assets/fps/models/quaternius-operator-male.glb','assets/fps/models/quaternius-operator-female.glb','Business_Man_Quaternius_Anims.glb'].map(load));
installCharacterTemplates(male,female);installDefaultHostageTemplate(business);
test('both defaults use the actual native Business rig, shared resources and independent bones; players/studio retain operator rig',()=>{
 const a=createAuthoredAvatar('hostage','hostage-0',true),b=createAuthoredAvatar('hostage','hostage-1',true),p=createAuthoredAvatar('analysts','analysts-0'),studio=createAuthoredAvatar('hostage','fixture',true,{ignoreOverrides:true});
 try{
  for(const s of [a,b]){assert(s.defaultHostage);assert.equal(s.clips.size,13);assert.equal(s.upper.size,0);assert.equal(s.meshes.length,3);assert.equal(s.footSamples.reduce((n,f)=>n+f.indices.length,0),243);assert.equal(s.materials.size,0);assert(Math.abs(physicalBounds(s).getSize(new T.Vector3()).y-1.69)<.001);}
  assert.notEqual(a.bones.get('Hips'),b.bones.get('Hips'));assert.equal(a.bones.get('pelvis'),a.bones.get('Hips'));
  for(let i=0;i<3;i++){assert.equal(a.meshes[i].geometry,b.meshes[i].geometry);assert.equal(a.meshes[i].material,b.meshes[i].material);}
  assert.equal(a.clips.get('Walk_Loop'),business.animations.find(c=>c.name==='Walk_Loop'));
  assert(!p.defaultHostage);assert(!studio.defaultHostage);assert.equal(p.bones.size,65);assert.equal(studio.bones.size,65);
  let sharedDisposed=0;a.meshes[0].material.addEventListener('dispose',()=>sharedDisposed++);disposeAvatar(a);assert.equal(sharedDisposed,0);
  animateAuthored(b,{x:0,z:0,height:1.6,onGround:true},1);assert(Number.isFinite(b.holder.position.y));
 }finally{for(const s of [a,b,p,studio])disposeAvatar(s);}
});
test('actual idle/walk/jog support stays at floor and cosmetic animation never mutates actor state',()=>{
 const a=createAuthoredAvatar('hostage','hostage-0',true),actor={x:3,z:5,y:0,height:1.6,radius:.2,onGround:true};
 try{let time=0;for(const speed of [0,1.4,2.4,0])for(let i=0;i<100;i++){
  time+=1/60;actor.x+=speed/60;const before=JSON.stringify(actor);animateAuthored(a,actor,time);assert.equal(JSON.stringify(actor),before);
  const floor=physicalBounds(a).min.y;assert(Math.abs(floor-.004)<1e-5,`${a.activeBase} floor ${floor}`);
  a.root.traverse(o=>{if(o.isBone)assert([...o.position,...o.quaternion].every(Number.isFinite));});
 }assert.equal(a.activeBase,'Idle_Loop');}finally{disposeAvatar(a);}
});
test('all thirteen native clips bind finite posed geometry, including the full-body death',()=>{
 const a=createAuthoredAvatar('hostage','hostage-0',true);
 try{for(const clip of a.clips.values())for(const f of [0,.25,.5,.75,.99]){
  a.mixer.stopAllAction();a.mixer.clipAction(clip).reset().play();a.mixer.setTime(clip.duration*f);const b=posedBounds(a.root);
  assert([...b.min,...b.max].every(Number.isFinite),clip.name);assert(b.getSize(new T.Vector3()).length()<4,clip.name);
 }}finally{disposeAvatar(a);}
});
test('Character Studio hostage-all and individual overrides still win; removing them restores Business',async()=>{
 globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}};
 const studio=createAuthoredAvatar('hostage','reference',true,{gender:'female',ignoreOverrides:true});studio.holder.rotation.y=0;
 try{
  studio.root.traverse(o=>{for(const m of [o.material].flat().filter(Boolean))for(const k of Object.keys(m))if(m[k]?.isTexture)m[k]=null;});
  const bytes=await new GLTFExporter().parseAsync(studio.holder,{binary:true,onlyVisible:true,animations:female.animations}),asset=await loader.parseAsync(bytes,'');
  const contract={format:ACTOR_FORMAT,version:1,name:'Synthetic hostage',role:'hostage',target:'hostage-all',gender:'female',rig:'quaternius-operator-female',source:{file:'quaternius-operator-female.glb',sha256:await actorHash(await readFile(new URL('../assets/fps/models/quaternius-operator-female.glb',import.meta.url)))},file:'CHARACTER.glb',bytes:bytes.byteLength,sha256:await actorHash(bytes),front:'+Z',up:'+Y',view:{shortSleeves:false}};
  installCharacterOverride(asset,contract,female);
  for(const id of ['hostage-0','hostage-1']){const s=createAuthoredAvatar('hostage',id,true);assert(s.roleDesign);assert(!s.defaultHostage);disposeAvatar(s);}
  clearCharacterOverrides();installCharacterOverride(asset,{...contract,target:'hostage-1'},female);
  const a=createAuthoredAvatar('hostage','hostage-0',true),b=createAuthoredAvatar('hostage','hostage-1',true);assert(a.defaultHostage);assert(b.roleDesign);disposeAvatar(a);disposeAvatar(b);
  clearCharacterOverrides();const restored=createAuthoredAvatar('hostage','hostage-1',true);assert(restored.defaultHostage);disposeAvatar(restored);
 }finally{clearCharacterOverrides();disposeAvatar(studio);}
});
test.after(()=>disposeCharacterLibrary());
