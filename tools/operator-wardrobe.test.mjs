import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import test from 'node:test';
import {PerspectiveCamera,Vector3} from '../vendor/three/three.module.js';
import {GLTFLoader} from '../vendor/three/addons/loaders/GLTFLoader.js';
import {createAuthoredAvatar,installCharacterTemplates,disposeCharacterLibrary,disposeAvatar,
  animateAuthored,clearNetworkOutfits,setNetworkOutfit,characterVisualSignature,
  privateCharacterAppearance,setPrivateCharacterActors} from '../src/fps/character-library.mjs?v=6.1.2';
import {OUTFITS} from '../src/fps/operator-outfits.mjs';

async function original(gender) {
  const file=new URL('../assets/fps/models/quaternius-operator-'+gender+'.glb',import.meta.url);
  const bytes=await readFile(file);
  const loader=new GLTFLoader();
  loader.register(parser=>{
    for(const material of parser.json.materials) {
      for(const field of [material,material.pbrMetallicRoughness||{}]) {
        for(const key of Object.keys(field)) if (key.endsWith('Texture')) delete field[key];
      }
    }
    return {name:'cpu-rig-fixture'};
  });
  return loader.parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
}

test('the four publicly equipped kits fit either original rig, preserve team proportions and share the arm profile',async()=>{
  installCharacterTemplates(await original('male'),await original('female'));
  setPrivateCharacterActors([]);
  const tracked=[];
  try {
    for(const gender of ['male','female']) {
      const issued=createAuthoredAvatar('analysts','analysts-7',false,{gender});
      tracked.push(issued);
      assert.equal(issued.visualSignature,'original');
      for(const outfit of OUTFITS.slice(1)) {
        setNetworkOutfit('remote-6',outfit.id);
        const avatar=createAuthoredAvatar('analysts','remote-6',false,{gender});
        const kit=avatar.root.getObjectByName('operator-kit-'+outfit.id);
        assert.ok(kit?.isLOD);
        assert.equal(avatar.scale,issued.scale);
        assert.equal(kit.levels.length,2);
        const [near,far]=kit.levels.map(l=>l.object);
        assert.equal(near.skeleton,far.skeleton);
        assert.ok(near.geometry.index.count>far.geometry.index.count);
        assert.ok(near.geometry.index.count<16000);
        for (const mesh of [near,far]) {
          const {skinIndex,skinWeight,position}=mesh.geometry.attributes;
          assert.ok(position.array.every(Number.isFinite));
          for(let i=0;i<position.count;i++) {
            assert.ok(skinIndex.getX(i)<mesh.skeleton.bones.length && skinIndex.getY(i)<mesh.skeleton.bones.length);
            assert.ok(Math.abs(1-skinWeight.getX(i)-skinWeight.getY(i))<1e-6);
          }
        }
        const camera=new PerspectiveCamera();
        camera.position.z=30;camera.updateMatrixWorld();kit.update(camera);
        assert.equal(far.visible,true);assert.equal(near.visible,false);
        camera.position.z=4;camera.updateMatrixWorld();kit.update(camera);assert.equal(near.visible,true);
        assert.equal(avatar.visualSignature,characterVisualSignature('analysts','remote-6'));
        const view=privateCharacterAppearance('remote-6','analysts');
        assert.equal(view.glove.color.getHex(),outfit.glove);
        assert.equal(view.sleeve.color.getHex(),outfit.shirt);
        // Force allocation of the real cloned skin's GPU palette and observe
        // every geometry, material, owned texture and palette on teardown.
        const owned=new Set([...avatar.ownedGeometry,...avatar.materials.values()]);
        for (const material of avatar.materials.values()) {
          if (material.userData.ownedTexture) owned.add(material.userData.ownedTexture);
        }
        for (const skeleton of avatar.skeletons) {
          skeleton.computeBoneTexture();
          owned.add(skeleton.boneTexture);
        }
        const released=new Set();
        for (const resource of owned) resource.addEventListener('dispose',()=>released.add(resource));
        const sourceGeometry=avatar.meshes.find(mesh=>mesh.isSkinnedMesh).geometry;
        let disposedSource=false;
        const onUnexpectedDispose=()=>{disposedSource=true;};
        sourceGeometry.addEventListener('dispose',onUnexpectedDispose);
        disposeAvatar(avatar);
        disposeAvatar(avatar);
        sourceGeometry.removeEventListener('dispose',onUnexpectedDispose);
        assert.equal(released.size,owned.size);
        assert.equal(disposedSource,false);
        assert.ok(avatar.skeletons.every(skeleton=>skeleton.boneTexture===null));
      }
      setNetworkOutfit('remote-6','invalid-skin');
      assert.equal(characterVisualSignature('analysts','remote-6'),'original');
    }
  } finally {
    for (const avatar of tracked) disposeAvatar(avatar);
    clearNetworkOutfits();
    disposeCharacterLibrary();
  }
});

test('original GLB stride steers in all four directions, keeps hands stable and survives pause and teleport', async()=>{
  installCharacterTemplates(await original('male'),await original('female'));
  const tracked=[];
  try {
    function walk(dx,dz,distanceSquared=0) {
      const rig=createAuthoredAvatar('analysts','rig-probe');
      tracked.push(rig);
      const actor={x:0,z:0,yaw:0,onGround:true,moving:1.4,height:1.8,weapon:'p9'};
      const feet=[],hands=[];
      const foot=rig.bones.get('foot_l'), hand=rig.bones.get('hand_l');
      for(let i=0;i<48;i++) {
        actor.x=i*dx/30;actor.z=i*dz/30;
        animateAuthored(rig,actor,i/30,{distanceSquared});
        if (i>15) {
          feet.push(foot.getWorldPosition(new Vector3()));
          hands.push(hand.getWorldPosition(new Vector3()));
        }
      }
      const paused=foot.getWorldPosition(new Vector3());
      animateAuthored(rig,actor,47/30,{distanceSquared});
      assert.ok(foot.getWorldPosition(new Vector3()).distanceTo(paused)<1e-5);
      actor.z+=15;animateAuthored(rig,actor,48/30,{distanceSquared});
      assert.equal(rig.directional.applied,false);
      assert.equal(rig.directional.forward,1);
      return {feet,hands};
    }
    const fwd=walk(0,-1.4),back=walk(0,1.4),right=walk(1.4,0),left=walk(-1.4,0);
    const far=walk(1.4,0,32**2);
    const span=(points,axis)=>Math.max(...points.map(p=>p[axis]))-Math.min(...points.map(p=>p[axis]));
    assert.ok(span(fwd.feet,'z')>.08);
    assert.ok(span(right.feet,'x')>span(fwd.feet,'x')+.06);
    assert.ok(span(left.feet,'x')>span(fwd.feet,'x')+.06);
    assert.ok(span(right.feet,'z')<span(fwd.feet,'z')*.75);
    const centred=(points,axis)=>{const avg=points.reduce((s,v)=>s+v[axis],0)/points.length;return points.map(p=>p[axis]-avg);};
    const dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0);
    assert.ok(dot(centred(fwd.feet,'z'),centred(back.feet,'z'))<0);
    assert.ok(dot(centred(left.feet,'x'),centred(right.feet,'x'))<0);
    assert.equal(span(far.feet,'x'),span(fwd.feet,'x'));
    for (let i=0;i<fwd.hands.length;i++) {
      assert.ok(Math.abs(fwd.hands[i].x-right.hands[i].x)<.001);
      assert.ok(Math.abs(fwd.hands[i].z-right.hands[i].z)<.001);
    }
  } finally {
    for (const avatar of tracked) disposeAvatar(avatar);
    disposeCharacterLibrary();
  }
});
