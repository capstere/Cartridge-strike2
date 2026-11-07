import * as T from '../vendor/three/three.module.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {characterDataLoader,asBuffer} from '../tools/character-data-loader.mjs';
import {footwearMetrics} from '../tools/character-footwear-checks.mjs';
import {installCharacterTemplates,createAuthoredAvatar,disposeAvatar,animateAuthored} from '../src/fps/character-library.mjs?v=6.1.2';
import {ACTOR_FORMAT,validateActorAsset,actorHash} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
import {installCharacterOverride,clearCharacterOverrides} from '../src/fps/character-overrides.mjs?v=6.1.2';
import {FashionPreview} from './fashion-preview.mjs?v=6.1.2';
import {newProject} from './project-schema.mjs?v=6.1.2';
globalThis.FileReader=class{readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.();});}};
const loader=characterDataLoader(),files=await Promise.all(['male','female'].map(g=>readFile(new URL(`../assets/fps/models/quaternius-operator-${g}.glb`,import.meta.url)))),sources=await Promise.all(files.map(b=>loader.parseAsync(asBuffer(b),'')));
installCharacterTemplates(...sources);
function check(root,label){
 const m=footwearMetrics(root);assert.equal(m.belt,false,label+' belt');assert.equal(m.buckle,false,label+' buckle');
 for(const s of m.sides){assert(s.probes>=14,label+' all collar vertices');assert.equal(s.misses,0,label+' collar inside cuff '+s.side);assert.equal(s.soleMisses,0,label+' upper/sole connection '+s.side);assert.equal(s.topCalfWeight,1);assert.equal(s.lowerFootWeight,1);}
}
function allPoses(avatar){
 for(const clip of avatar.clips.values())for(const f of [0,.25,.5,.75,.99]){
  avatar.mixer.stopAllAction();avatar.mixer.clipAction(clip).reset().play();avatar.mixer.setTime(clip.duration*f);check(avatar.root,clip.name+' '+f);
 }
}
for(const gender of ['male','female'])for(const hostage of [false,true])test(`${gender} ${hostage?'hostage':'player'}: shoes stay joined through all 13 clips and belt is absent`,()=>{
 const a=createAuthoredAvatar(hostage?'hostage':'analysts','shoe-test',hostage,{gender,ignoreOverrides:true});
 try{assert.equal(a.clips.size,13);allPoses(a);}finally{disposeAvatar(a);}
});
for(const [i,gender] of ['male','female'].entries())test(`${gender}: fit extremes, GLB roundtrip and actual runtime override retain ankle joints`,async()=>{
 const a=createAuthoredAvatar('analysts','fit-test',false,{gender,ignoreOverrides:true}),fashion=new FashionPreview(),p=newProject({gender});
 try{
  for(const fit of [85,120,100]){
   a.mixer.stopAllAction();a.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.pose();});a.root.updateMatrixWorld(true);p.creative.fit=fit;fashion.create(p,a);allPoses(a);
  }
  a.mixer.stopAllAction();a.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.pose();});a.holder.rotation.y=0;a.holder.updateMatrixWorld(true);
  a.root.traverse(n=>{for(const m of [n.material].flat().filter(Boolean))for(const k of Object.keys(m))if(m[k]?.isTexture)m[k]=null;});
  const data=await new GLTFExporter().parseAsync(a.holder,{binary:true,onlyVisible:true,animations:sources[i].animations}),asset=await loader.parseAsync(data,'');
  const c={format:ACTOR_FORMAT,version:1,name:'Cuff regression',role:'player',target:'analysts-0',gender,rig:'quaternius-operator-'+gender,source:{file:`quaternius-operator-${gender}.glb`,sha256:await actorHash(files[i])},file:'CHARACTER.glb',bytes:data.byteLength,sha256:await actorHash(data),front:'+Z',up:'+Y',view:{shortSleeves:false}};
  assert.equal(validateActorAsset(asset,c,sources[i]).clips.length,13);check(asset.scene,'reimport');
  for(const hostage of [false,true]){
   const contract={...c,role:hostage?'hostage':'player',target:hostage?'hostage-0':'analysts-0'};installCharacterOverride(asset,contract,sources[i]);
   const instance=createAuthoredAvatar(hostage?'hostage':'analysts',contract.target,hostage);
   try{assert(instance.roleDesign);allPoses(instance);animateAuthored(instance,{alive:true,moving:3,weapon:'pistol',pitch:0,x:0,z:0},.3);check(instance.root,'runtime');}finally{disposeAvatar(instance);clearCharacterOverrides();}
  }
 }finally{fashion.dispose();disposeAvatar(a);clearCharacterOverrides();}
});

for(const gender of ['male','female'])test(`${gender}: removing the belt does not expose a fit-slider seam at the waist`,()=>{
 const a=createAuthoredAvatar('analysts','waist-test',false,{gender,ignoreOverrides:true}),fashion=new FashionPreview(),p=newProject({gender});p.creative.outfit='original';
 try{
  for(const fit of [85,100,120]){
   a.mixer.stopAllAction();a.root.traverse(n=>{if(n.isSkinnedMesh)n.skeleton.pose();});a.root.updateMatrixWorld(true);p.creative.fit=fit;fashion.create(p,a);
   const shirt=a.meshes.find(m=>m.material.name==='jacket-fabric'),pants=a.meshes.find(m=>m.material.name==='trousers-fabric'),s=fashion.sources.get(shirt),t=fashion.sources.get(pants),map=new Map();
   const key=(v,i)=>Array.from(v.slice(i*3,i*3+3),x=>x.toFixed(5)).join(',');
   for(let i=0;i<s.length/3;i++)map.set(key(s,i),i);const pairs=[];
   for(let i=0;i<t.length/3;i++)if(map.has(key(t,i)))pairs.push([map.get(key(t,i)),i]);
   assert(pairs.length>=40,'original waist seam vertices are paired');
   for(const name of ['Idle_Loop','Sprint_Loop','Crouch_Fwd_Loop']){
    a.mixer.stopAllAction();a.mixer.clipAction(a.clips.get(name)).reset().play();a.mixer.setTime(.23);a.root.updateMatrixWorld(true);shirt.skeleton.update();pants.skeleton.update();
    for(const [i,j]of pairs){const x=shirt.getVertexPosition(i,new T.Vector3()),y=pants.getVertexPosition(j,new T.Vector3());assert(x.distanceTo(y)<2e-5,`${gender} fit ${fit} ${name}: torn waist`);}
   }
  }
 }finally{fashion.dispose();disposeAvatar(a);}
});
