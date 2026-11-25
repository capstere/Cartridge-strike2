import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import * as T from '../../vendor/three/three.module.js';
import {WEAPONS} from './config.mjs';
import {makeWeapon, animateWeapon, disposeWeaponResources} from './models.mjs';

function sample(model, progress, options = {}) {
  const id = model.userData.id, duration = WEAPONS[id].reload;
  const actor = {id: 'local', weapon: id, moving: 0, reloadUntil: 10 + duration, inventory: {item: {id, ammo: 0}}};
  animateWeapon(model, actor, 10 + progress * duration, 1 / 60, options);
}
function relativeTo(part, hand) {
  return part.matrixWorld.clone().invert().multiply(hand.matrixWorld);
}
function assertMatrix(actual, expected, note) {
  actual.elements.forEach((v, i) => assert.ok(Math.abs(v - expected.elements[i]) < 1e-6, note));
}

test('support palm holds its socket throughout magazine withdrawal, transfer and seating', () => {
  for (const id of ['ar47','shotgun','smg','sniper','bazooka','p9','p12','cr4']) {
    const model = makeWeapon(id), d = model.userData;
    sample(model, .28);
    const hold = relativeTo(d.magazine, d.leftHand), first = d.magazine.position.clone();
    let travel = 0;
    for (const t of [.34,.40,.48,.53,.59,.63,.68]) {
      sample(model, t);
      assertMatrix(relativeTo(d.magazine, d.leftHand), hold, id + ' grip slid on reload');
      travel = Math.max(travel, first.distanceTo(d.magazine.position));
    }
    assert.ok(travel > .035, id + ' moving part never travelled');
    sample(model, 1);
    assert.ok(d.leftHand.position.distanceTo(d.handPose.grips[1].position) < 1e-8, id + ' failed to return');
    assert.equal(d.leftHand.parent, d.arms);
    assert.equal(d.leftArm.parent, d.arms, id + ' arm must articulate independently of the moving hand');
  }
});

test('the index and thumb pads meet the shotgun shell through every loading stroke', () => {
  const model = makeWeapon('shotgun'), d = model.userData;
  const hand = d.leftHand, skin = hand.userData.skin, bounds = new T.Box3();
  for (const mesh of d.magazine.children) {
    mesh.geometry.computeBoundingBox();
    bounds.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrix));
  }
  const centre = bounds.getCenter(new T.Vector3()), radius = bounds.getSize(new T.Vector3()).x / 2;
  const pads = [0, 4].map(i => skin.skeleton.bones.indexOf(hand.userData.fingers[i].at(-1)));
  const point = new T.Vector3(), primaryBone = skin.geometry.attributes.skinIndex;
  for (const phase of [.13,.25,.38,.50,.63,.75,.88]) {
    sample(model, phase);
    const transform = relativeTo(d.magazine, skin), distance = [Infinity, Infinity];
    for (let i = 0; i < primaryBone.count; i++) {
      const pad = pads.indexOf(primaryBone.getX(i));
      if (pad < 0) continue;
      skin.getVertexPosition(i, point).applyMatrix4(transform);
      const radial = Math.hypot(point.x-centre.x, point.y-centre.y) - radius;
      const axial = Math.max(bounds.min.z-point.z, point.z-bounds.max.z);
      distance[pad] = Math.min(distance[pad], Math.max(radial, axial));
    }
    for (const gap of distance) assert.ok(gap > -.004 && gap < .003, `Shell contact at ${phase}: ${gap} m`);
  }
});

test('support hand rides both strokes of the shotgun pump', () => {
  const model = makeWeapon('shotgun'), d = model.userData;
  const actor = {id: 'local', weapon: 'shotgun', reloadUntil: 0}, shotAt = 10;
  animateWeapon(model, actor, shotAt, 1 / 60, {shotAt});
  const fixed = relativeTo(d.pump, d.leftHand), right = d.rightHand.position.clone();
  for (const age of [.08,.16,.28,.33,.45,.55,.80]) {
    animateWeapon(model, actor, shotAt + age, 1 / 60, {shotAt});
    assertMatrix(relativeTo(d.pump, d.leftHand), fixed, 'hand slid off the pump');
    assert.ok(d.rightHand.position.equals(right));
    if (age === .33) assert.ok(d.pump.position.z > .07);
  }
});

test('empty kit actions contact their moving part and return to the idle grip', () => {
  for (const id of ['p9', 'p12', 'cr4']) {
    const model = makeWeapon(id), d = model.userData;
    const hand = id === 'cr4' ? d.rightHand : d.leftHand;
    sample(model, .83);
    const action = hand.position.clone();
    assert.ok(d.slide.position.distanceTo(d.slideHome) > .025);
    const contact = relativeTo(d.slide, hand);
    const point = new T.Vector3().setFromMatrixPosition(contact);
    assert.ok(point.distanceTo(id === 'cr4' ? new T.Vector3(.037,.035,-.033) : new T.Vector3(-.016,.049,.018)) < .085);
    // A confirmed shot adds another slide offset while the hand is in contact.
    sample(model, .84, {shotAt: 10 + WEAPONS[id].reload * .84});
    assertMatrix(relativeTo(d.slide, hand), contact, id + ' lost action contact');
    sample(model, 1);
    assert.ok(hand.position.distanceTo(action) > .035);
  }
});
test('running and turning during inspection keeps the end of the support arm below the screen', async () => {
  const {Game} = await import('./game.mjs');
  const {createWorld} = await import('./world.mjs');
  const {Renderer} = await import('./render.mjs');
  const levelProject = JSON.parse(readFileSync(new URL('../../levels/floor5-prepared.json', import.meta.url)));
  const game = new Game(createWorld({fresh: true, levelProject}), {seed: 42, config: {botFire: false, wanderers: false}});
  game.start('analysts', {mode: 'endless', firefight: false});
  game.state.phase = 'active';
  const player = game.player, dt = 1 / 60, screen = new T.Vector3();
  for (const actor of game.actors) if (actor !== player) actor.bot = null;
  const camera = new T.PerspectiveCamera(60, 16 / 9, .01, 5);
  for (const id of ['shotgun', 'ar47']) {
    Object.assign(player, {x: 20, y: 0, z: -5.4, yaw: 0, pitch: 0});
    player.inventory.primary = game.weaponItem(id);
    assert.ok(game.select(id));
    const model = makeWeapon(id), arm = model.userData.leftArm;
    const view = {presentationGame: game, weaponModel: model, settings: {reducedMotion: false}};
    assert.ok(Renderer.prototype.requestInspect.call(view, game));
    for (let i = 0; i < 60; i++) {
      // 23/15 mouse counts per frame at the default .0022 rad/count.
      game.step(dt, {forward: 1, yaw: player.yaw - 3 * dt, pitch: player.pitch + 2 * dt});
      animateWeapon(model, player, game.state.time, dt);
      Renderer.prototype.applyInspection.call(view);
      const {segments, rings} = arm.userData;
      for (let j = 0; j < segments; j++) {
        screen.fromBufferAttribute(arm.geometry.attributes.position, (rings - 1) * (segments + 1) + j);
        screen.applyMatrix4(arm.matrixWorld).project(camera);
        assert.ok(screen.y < -1, id + ' shoulder edge visible during inspection');
      }
    }
    assert.ok(player.moving > 4, 'full running input reached the presentation');
  }
});
test.after(disposeWeaponResources);
