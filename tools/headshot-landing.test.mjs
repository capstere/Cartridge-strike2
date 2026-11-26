import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {Box3,LoopOnce,Vector3} from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {createAuthoredAvatar, disposeAvatar, installCharacterTemplates} from '../src/fps/character-library.mjs?v=6.1.2';
import {makeActor,animateActor,animateCorpse} from '../src/fps/models.mjs?v=6.1.2';
import {headshotSpace} from '../src/fps/headshot-pose.mjs';
import {skinSampler} from '../src/fps/skin-sampler.mjs';

// SHA-256 of the two supplied wrist tracks, and of keys 0–27 of every supplied track.
// Both baselines come from the wrist-polished input, before the floor-contact pass.
const input = {
  male: ['7398f77fa320113b80cb4a70d6a4bcee3b58c4ff7e37741ee03cb4f3fa015b2f',
    '8696c68a1653a1519630ef1659f6e921606ed9312ee87d570b1ffeeffe90646f'],
  female: ['51837f12f28d57284adebec0443ec0c0634b16dcb6ae3a80a68f91d8928c026f',
    'e6d7b028460f4d00e378ec0ee1f984b6a4a502671b36490ecb4b99c5dc025f4a']
};

async function readAsset(file) {
  const bytes = await readFile(new URL('../assets/' + file, import.meta.url));
  const loader = new GLTFLoader();
  // CPU skinning needs the original mesh and material groups; skip pixel decoding in Node.
  loader.register(parser => {
    for (const material of parser.json.materials || []) {
      for (const params of [material, material.pbrMetallicRoughness || {}]) {
        for (const key of Object.keys(params)) if (key.endsWith('Texture')) delete params[key];
      }
    }
    return {name: 'test-geometry-only'};
  });
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
}

function checkPilotTracks(clip, gender) {
  assert.equal(clip.name, 'Headshot_KnockDown_Pilot');
  assert.equal(clip.duration, 2.5);
  assert.equal(clip.tracks.length, 25);
  const wrists = createHash('sha256'), flight = createHash('sha256');
  for (const track of clip.tracks) {
    assert.equal(track.times.length, 76);
    assert(track.times.every((time, i) => Math.abs(time - i / 30) < 1e-6));
    if (/^hand_[lr]\.quaternion$/.test(track.name)) wrists.update(track.values);
    flight.update(track.values.subarray(0, 28 * track.getValueSize()));
  }
  assert.deepEqual([wrists.digest('hex'), flight.digest('hex')], input[gender]);
}

function landmarks(avatar) {
  const low = {}, v = new Vector3();
  avatar.holder.updateMatrixWorld(true);
  avatar.holder.traverseVisible(mesh => {
    if (!mesh.isMesh) return;
    const {position, skinIndex, skinWeight} = mesh.geometry.attributes;
    const sample = skinSampler(mesh);
    for (let i = 0; i < position.count; i++) {
      sample(i, v).applyMatrix4(mesh.matrixWorld);
      low.all = Math.min(low.all ?? Infinity, v.y);
      low.maxZ = Math.max(low.maxZ ?? -Infinity, v.z);
      let name;
      if (mesh.name.startsWith('boot-sole-')) name = mesh.name;
      else if (mesh.name.startsWith('Hair_')) name = 'hair';
      else if (mesh.material.name === 'vest-shell' || mesh.name === 'continuous-back-rig') name = 'back';
      else if (mesh.material.name === 'gloves-leather') name = position.getX(i) > 0 ? 'glove-l' : 'glove-r';
      else if (skinIndex) {
        let strongest = 0;
        for (let j = 1; j < 4; j++) {
          if (skinWeight.getComponent(i, j) > skinWeight.getComponent(i, strongest)) strongest = j;
        }
        if (mesh.skeleton.bones[skinIndex.getComponent(i, strongest)].name === 'pelvis') name = 'pelvis';
      }
      if (name) low[name] = Math.min(low[name] ?? Infinity, v.y);
    }
  });
  return low;
}

test('both equipped knockdowns preserve the pilot flight and wrists, then settle on the floor', async () => {
  const genders = Object.keys(input);
  const operators = await Promise.all(genders.map(g => readAsset('fps/models/quaternius-operator-' + g + '.glb')));
  installCharacterTemplates(...operators);
  for (const gender of genders) {
    const bank = await readAsset('animations/headshot-' + gender + '.animation.glb');
    assert.equal(bank.animations.length, 1);
    const [clip] = bank.animations;
    checkPilotTracks(clip, gender);
    const avatar = createAuthoredAvatar('analysts', 'landing-' + gender, false, {gender, ignoreOverrides: true});
    avatar.mixer.stopAllAction();
    avatar.holder.position.y = 0;
    const action = avatar.mixer.clipAction(clip).setLoop(LoopOnce, 1).play();
    action.clampWhenFinished = true;
    avatar.mixer.setTime(.6);
    assert(landmarks(avatar).all > 1.3, gender + ' airborne clearance');
    for (const time of [.95, 1.05, 1.25, 1.55, 1.8, 2.17, 2.5]) {
      avatar.mixer.setTime(time);
      const support = landmarks(avatar);
      assert(support.all > -.002 && support.all < .02, gender + ' landing at ' + time);
      if (time === clip.duration) {
        for (const part of ['pelvis', 'back', 'boot-sole-l', 'boot-sole-r', 'glove-l', 'glove-r', 'hair']) {
          assert(support[part] < .012, gender + ' resting ' + part + ' at ' + support[part]);
        }
      }
    }
    disposeAvatar(avatar);
  }
});

test('a first corpse snapshot equips the victim and seeks, holds and releases the action',async()=>{
  const genders=['male','female'];
  const models=await Promise.all(genders.map(g=>readAsset('fps/models/quaternius-operator-'+g+'.glb')));
  const [male,female]=await Promise.all(genders.map(g=>readAsset('animations/headshot-'+g+'.animation.glb')));
  installCharacterTemplates(...models,{male,female});
  const actor={id:'player-3',team:'analysts',weapon:'ar47',x:3,y:0,z:0,yaw:0,height:1.7,
    moving:0,deathAt:10,deathVariant:'headshot'};
  const model=makeActor(actor.team,actor.id),s=model.userData.avatar;
  assert.equal(s.clips.size,13);
  assert.equal(model.userData.weaponId,null);
  animateCorpse(model,actor,11.25);
  assert.equal(model.userData.weaponId,'ar47');
  assert.equal(s.death.action,s.knockdown.action);
  assert.equal(s.death.action.time,1.25);
  animateCorpse(model,actor,13);
  assert.equal(s.death.action.time,2.5);
  assert(s.death.settled);
  const update=s.mixer.update;
  s.mixer.update=()=>assert.fail('held corpse resampled its skeleton');
  animateCorpse(model,actor,16);
  s.mixer.update=update;
  assert.equal(animateCorpse(model,actor,29),false);
  animateActor(model,{...actor,deathVariant:'',deathAt:null},30,.02);
  assert.equal(s.death,null);
  assert(s.base.get('Idle_Loop').isRunning());
  actor.deathAt=30;
  const wallZ=.55,world={canOccupy:(x,z,r)=>z+r<=wallZ};
  const space=headshotSpace(world,actor,s.knockdown);
  const gunBox=new Box3();
  for(const age of [.18,.35,.6,1,2.5]){
    animateCorpse(model,actor,actor.deathAt+age,space);
    model.updateMatrixWorld(true);
    assert(landmarks(s).maxZ<wallZ,'boot, hand or body crossed the wall at '+age);
    assert(gunBox.setFromObject(model.userData.weaponModel,true).max.z<wallZ,'gun crossed the wall at '+age);
  }
  const bagBottom=gunBox.setFromObject(model.userData.bag,true).min.y;
  assert(bagBottom>=0&&bagBottom<.02,'cartridge bag rests beside the hip');
  disposeAvatar(s);

  installCharacterTemplates(...models);
  const fallback=makeActor(actor.team,actor.id);
  animateCorpse(fallback,actor,actor.deathAt+1);
  assert.equal(fallback.userData.avatar.death.action.getClip().name,'Death01');
  disposeAvatar(fallback.userData.avatar);
});
