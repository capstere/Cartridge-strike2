import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,mkdtemp,mkdir,writeFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import * as T from '../vendor/three/three.module.js';
import {GLTFExporter} from '../vendor/three/addons/exporters/GLTFExporter.js';
import {newProject,validateProject,addPart,animationContract} from './project-schema.mjs?v=6.1.2';
import {ROLE_TARGETS,roleSelection,assignmentKeys} from '../src/fps/character-roles.mjs?v=6.1.2';
import {createDwarfAsset,createDwarfAvatar,animateDwarf} from '../src/fps/dwarf-rig.mjs?v=6.1.2';
import {makeFootwear} from '../src/fps/character-footwear.mjs?v=6.1.2';
import {ACTOR_FORMAT,validateActorContract,validateActorAsset,inspectActorGLB,actorHash} from '../src/fps/character-runtime-contract.mjs?v=6.1.2';
import {installCharacterTemplates,createAuthoredAvatar,animateAuthored,disposeAvatar,characterVisualSignature} from '../src/fps/character-library.mjs?v=6.1.2';
import {installCharacterOverride,getCharacterOverride,clearCharacterOverrides} from '../src/fps/character-overrides.mjs?v=6.1.2';
import {characterDataLoader,asBuffer} from '../tools/character-data-loader.mjs';
import {packZip} from './zip-export.mjs';
import {readRuntimePackage} from './runtime-package.mjs?v=6.1.2';
import {installPackage} from '../tools/install-character-package.mjs';
globalThis.FileReader=class {readAsArrayBuffer(blob){blob.arrayBuffer().then(b=>{this.result=b;this.onloadend?.({target:this});});}};
const loader=characterDataLoader();
const bytesOf=async gender=>readFile(new URL('../assets/fps/models/quaternius-operator-'+gender+'.glb',import.meta.url));
const human=async gender=>loader.parseAsync(asBuffer(await bytesOf(gender)),'');
function withoutImages(root){root.traverse(n=>{for(const m of [n.material].flat().filter(Boolean))for(const k of Object.keys(m))if(m[k]?.isTexture)m[k]=null;});}
async function exported(source,root,role,target,gender='male'){
 withoutImages(root);const bytes=await new GLTFExporter().parseAsync(root,{binary:true,onlyVisible:true,animations:source.animations});
 const contract={format:ACTOR_FORMAT,version:1,name:'Synthetic regression',role,target,gender,rig:role==='dwarf'?'cartridge-dwarf-v1':'quaternius-operator-'+gender,
 source:role==='dwarf'?{generator:'cartridge-dwarf-v1'}:{file:`quaternius-operator-${gender}.glb`,sha256:await actorHash(await bytesOf(gender))},file:'CHARACTER.glb',bytes:bytes.byteLength,sha256:await actorHash(bytes),front:'+Z',up:'+Y',view:{shortSleeves:false}};
 return {bytes,contract,asset:await loader.parseAsync(bytes,'')};
}
test('role targets cover ten players, two hostages, five repeating appearances or fourteen individual dwarfs',()=>{
 assert.equal(ROLE_TARGETS.player.filter(t=>!t.endsWith('-all')).length,10);assert.equal(ROLE_TARGETS.hostage.length-1,2);
 assert.equal(ROLE_TARGETS.dwarf.filter(t=>t.startsWith('dwarf-variant-')).length,5);assert.equal(ROLE_TARGETS.dwarf.filter(t=>/^dwarf-\d+$/.test(t)).length,14);
 assert.deepEqual(assignmentKeys('dwarf','dwarf-6',1),['dwarf-6','dwarf-variant-1','dwarf-all']);
 for(const role of Object.keys(ROLE_TARGETS))for(const target of ROLE_TARGETS[role]){const p=newProject({role,target});validateProject(p);assert.deepEqual(roleSelection(p),{role,target});}
 const old=newProject();delete old.runtime;assert.equal(roleSelection(old).role,'player');old.base.team='hostage';assert.equal(roleSelection(old).target,'hostage-0');
 assert.throws(()=>validateProject({...old,runtime:{version:1,role:'hostage',target:'analysts-0'}}));
});
test('dwarf parts and contract use actual dwarf anchors, not a shrink-wrapped operator',()=>{
 const p=newProject({role:'dwarf',variant:3}),part=addPart(p,'box');assert(part.position[1]<.6);validateProject(p);
 assert.equal(p.base.original_glb,'procedural-dwarf-v1');assert.equal(animationContract(p).required_animation_clips.length,3);
 assert.throws(()=>validateProject({...p,base:{...p.base,variant:5}}));
});
test('replacement footwear has outward side normals, modest continuous shape and low polygon cost',()=>{
 for(const g of Object.values(makeFootwear())){const p=g.attributes.position,index=g.index.array;let sides=0;
  assert(index.length/3<200);assert(p.array.every(Number.isFinite));assert(g.boundingBox.max.y<=.185);
  for(let i=0;i<index.length;i+=3){const a=new T.Vector3().fromBufferAttribute(p,index[i]),b=new T.Vector3().fromBufferAttribute(p,index[i+1]),c=new T.Vector3().fromBufferAttribute(p,index[i+2]),mid=a.clone().add(b).add(c).multiplyScalar(1/3),n=b.sub(a).cross(c.sub(a)).normalize();if(Math.abs(n.y)<.7){assert(mid.x*n.x+(mid.z-.02)*n.z>0);sides++;}}
  assert(sides>20);g.dispose();
 }
});
for(const variant of [0,4])test(`dwarf ${variant} GLB roundtrip, independent skeleton and all three motions`,async()=>{
 const source=createDwarfAsset(variant),a=createDwarfAvatar(source);a.holder.rotation.y=0;
 assert.equal(a.bones.size,18);const saved=await exported(source,a.holder,'dwarf','dwarf-variant-'+variant);assert.equal(inspectActorGLB(saved.bytes).animations.length,3);
 const report=validateActorAsset(saved.asset,saved.contract,source);assert.equal(report.animationSamples,12);assert(report.maxExtent<1.1);
 const first=createDwarfAvatar(saved.asset),second=createDwarfAvatar(saved.asset),actor={alive:true,moving:1,steps:.12,variant};
 const before=JSON.stringify(actor);animateDwarf(first,actor,2);assert.equal(JSON.stringify(actor),before);assert.notEqual(first.bones.get('thigh_l'),second.bones.get('thigh_l'));assert.notDeepEqual(first.bones.get('thigh_l').quaternion.toArray(),second.bones.get('thigh_l').quaternion.toArray());
 const changed=saved.asset.animations[0].tracks[0].values;changed[0]+=.1;assert.throws(()=>validateActorAsset(saved.asset,saved.contract,source),/Animationsspår/);
 disposeAvatar(a);disposeAvatar(first);disposeAvatar(second);
});
for(const gender of ['male','female'])test(`${gender} human export uses new shoes, preserves thirteen clips and installs as hostage/player`,async()=>{
 const male=await human('male'),female=await human('female');installCharacterTemplates(male,female);const source=gender==='male'?male:female;
 const avatar=createAuthoredAvatar('analysts','fixture',false,{gender,ignoreOverrides:true});avatar.holder.rotation.y=0;
 assert.equal(avatar.shoes.length,2);assert(avatar.meshes.filter(n=>n.material.name==='boots-leather').every(n=>!n.visible));
 assert(!avatar.root.getObjectByName('boot-shaft-l'));assert(avatar.root.getObjectByName('shoe-upper-l'));
 const saved=await exported(source,avatar.holder,'player','analysts-0',gender),report=validateActorAsset(saved.asset,saved.contract,source);
 assert.equal(report.clips.length,13);assert.equal(report.animationSamples,52);
 assert.equal(saved.asset.scene.getObjectByName('boot-shaft-l'),undefined);
 clearCharacterOverrides();installCharacterOverride(saved.asset,saved.contract,source);
 assert.equal(characterVisualSignature('analysts','analysts-0'),saved.contract.sha256);assert.equal(getCharacterOverride('hostage','hostage-0'),null);
 const instance=createAuthoredAvatar('analysts','analysts-0');assert.equal(instance.roleDesign,true);
 animateAuthored(instance,{alive:true,moving:0,weapon:'pistol',pitch:0,x:0,z:0},.2);assert(Number.isFinite(instance.holder.position.y));
 const hostageContract={...saved.contract,role:'hostage',target:'hostage-1'};installCharacterOverride(saved.asset,hostageContract,source);
 const hostage=createAuthoredAvatar('hostage','hostage-1',true);assert.equal(hostage.isHostage,true);assert.equal(hostage.upper.size,0);
 disposeAvatar(instance);disposeAvatar(hostage);disposeAvatar(avatar);clearCharacterOverrides();
});
test('tampered, external and appended GLB data rejected',async()=>{
 const s=createDwarfAsset(),a=createDwarfAvatar(s);a.holder.rotation.y=0;const saved=await exported(s,a.holder,'dwarf','dwarf-all');
 assert.throws(()=>validateActorContract({...saved.contract,target:'../../escape'}));
 assert.throws(()=>inspectActorGLB(new Uint8Array([...new Uint8Array(saved.bytes),1,2,3,4])));
 assert.throws(()=>validateActorAsset(saved.asset,{...saved.contract,source:{generator:'invented'}},s));disposeAvatar(a);
});
test('native role ZIP -> installer dry run -> apply -> registry keeps original design private',async()=>{
 const s=createDwarfAsset(),a=createDwarfAvatar(s);a.holder.rotation.y=0;const saved=await exported(s,a.holder,'dwarf','dwarf-variant-0'),base=await new GLTFExporter().parseAsync(s.scene,{binary:true,animations:s.animations}),project=newProject({role:'dwarf'});
 const zip=packZip([{name:'CHARACTER.glb',data:saved.bytes},{name:'CHARACTER.json',data:JSON.stringify(saved.contract)},{name:'PROJECT.json',data:JSON.stringify(project)},{name:'BASE_RIG.glb',data:base}]);
 const read=await readRuntimePackage(zip);assert.equal(read.contract.target,'dwarf-variant-0');const damaged=zip.slice();damaged[200]^=1;await assert.rejects(()=>readRuntimePackage(damaged));
 const dir=await mkdtemp(join(tmpdir(),'character-roles-'));try{
  await mkdir(join(dir,'assets/fps'),{recursive:true});await writeFile(join(dir,'assets/fps/character-overrides.json'),'{"schema":1,"characters":[]}');await writeFile(join(dir,'build-info.json'),'{"files":[],"bytes":0}');await writeFile(join(dir,'input.zip'),zip);
  assert.equal((await installPackage(join(dir,'input.zip'),{root:dir})).applied,false);assert.equal(JSON.parse(await readFile(join(dir,'assets/fps/character-overrides.json'))).characters.length,0);
  const result=await installPackage(join(dir,'input.zip'),{root:dir,apply:true});assert.equal(result.applied,true);assert.equal(result.originalProjectPublished,false);assert.equal(JSON.parse(await readFile(join(dir,'assets/fps/character-overrides.json'))).characters.length,1);
  await installPackage(join(dir,'input.zip'),{root:dir,apply:true});assert.equal(JSON.parse(await readFile(join(dir,'assets/fps/character-overrides.json'))).characters.length,1);
 }finally{await rm(dir,{recursive:true,force:true});}disposeAvatar(a);
});

test('menu camera has no cosmetic assignment before player selection',()=>{
 for(const id of [undefined,null,'']){assert.deepEqual(assignmentKeys('player',id),[]);assert.equal(getCharacterOverride('player',id),null);}
});
