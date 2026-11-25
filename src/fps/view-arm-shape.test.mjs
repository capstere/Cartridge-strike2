import assert from 'node:assert/strict';
import test from 'node:test';
import * as T from '../../vendor/three/three.module.js';
import {makeWeapon, animateWeapon, disposeWeaponResources} from './models.mjs';
import {WEAPONS} from './config.mjs';
import {inspectPose} from './view-surface.mjs';
import {refitViewArms} from './presentation-hands.mjs';

test('each animated sleeve meets the cuff and keeps both bone lengths throughout reload', () => {
  const expected = new T.Vector3(), actual = new T.Vector3();
  for (const id of Object.keys(WEAPONS).filter(id => WEAPONS[id].slot !== 'armor')) {
    const model = makeWeapon(id), d = model.userData;
    const duration = WEAPONS[id].reload || 1;
    const actor = {weapon:id, moving:2, reloadUntil:10+duration, inventory:{slot:{id,ammo:0}}};
    for (const t of [0,.12,.25,.39,.49,.64,.83,.96,1]) {
      animateWeapon(model,actor,10+t*duration,1/60);
      for (const [arm, hand] of [[d.leftArm,d.leftHand],[d.rightArm,d.rightHand]]) {
        const {wristPoint,elbow,shoulder,rings,segments} = arm.userData;
        assert.ok(Math.abs(wristPoint.distanceTo(elbow)-.27) < 1e-6, id+' forearm length');
        assert.ok(Math.abs(shoulder.distanceTo(elbow)-.32) < 1e-6, id+' upper arm length');
        const {position,normal} = arm.geometry.attributes;
        for (let j=0; j<=segments; j++) {
          const a = j/segments*2*Math.PI;
          expected.set(.028*Math.cos(a), hand.userData.cuffEnd, .0215*Math.sin(a)).applyMatrix4(hand.matrix);
          assert.ok(actual.fromBufferAttribute(position,j).distanceTo(expected) < 1e-6, id+' wrist gap');
        }
        // Both sides of the UV seam must meet and receive the same light.
        for (let r=0; r<rings; r++) {
          const first = r*(segments+1);
          for (const attribute of [position,normal]) {
            expected.fromBufferAttribute(attribute,first);
            assert.ok(actual.fromBufferAttribute(attribute,first+segments).distanceTo(expected) < 1e-6,id);
          }
          assert.ok(Math.abs(expected.length()-1) < 1e-5, id+' unit normal');
        }
      }
    }
  }
});

test('the skin and cloth face outwards on the inside of a bent wrist and elbow', () => {
  const a = new T.Vector3(), b = new T.Vector3(), c = new T.Vector3(), outside = new T.Vector3();
  for (const id of ['ar47','shotgun','knife','bomb']) {
    const model = makeWeapon(id), d = model.userData;
    animateWeapon(model,{weapon:id,reloadUntil:0},10,1/60);
    const pose = inspectPose(.6);
    model.position.add(new T.Vector3(...pose.position));
    model.rotation.x += pose.rotation[0];
    model.rotation.y += pose.rotation[1];
    model.rotation.z += pose.rotation[2];
    for (const short of [true,false]) {
      for (const arm of [d.leftArm,d.rightArm]) {
        arm.userData.privateShortSleeves = short;
        arm.userData.last.fill(NaN);
      }
      refitViewArms(model);
      for (const arm of [d.leftArm,d.rightArm]) {
        const {centers,segments} = arm.userData, row = segments+1;
        const {position} = arm.geometry.attributes, index = arm.geometry.index.array;
        for (let i=0; i<index.length; i+=3) {
          const ia=index[i], ib=index[i+1], ic=index[i+2];
          a.fromBufferAttribute(position,ia);
          b.fromBufferAttribute(position,ib);
          c.fromBufferAttribute(position,ic);
          outside.copy(a).add(b).add(c)
            .sub(centers[Math.floor(ia/row)]).sub(centers[Math.floor(ib/row)]).sub(centers[Math.floor(ic/row)]);
          assert.ok(b.sub(a).cross(c.sub(a)).dot(outside)>0,id+' inside-out sleeve');
        }
      }
    }
  }
});

test('weapons share the immutable glove mesh while keeping independent finger poses and arm shapes', () => {
  const rifle = makeWeapon('ar47').userData, pistol = makeWeapon('p9').userData;
  for (const [a,b] of [[rifle.rightHand,pistol.rightHand],[rifle.leftHand,pistol.leftHand]]) {
    assert.equal(a.userData.skin.geometry,b.userData.skin.geometry);
    assert.notEqual(a.userData.skin.skeleton,b.userData.skin.skeleton);
  }
  assert.notEqual(rifle.leftArm.geometry,pistol.leftArm.geometry);
});
test.after(disposeWeaponResources);
