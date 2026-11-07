import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import { CONFIG } from '../src/fps/config.mjs';
import { createThrowableCartridge, createThrownCartridge, updateThrownCartridge,
  disposeThrowableCartridges, CARTRIDGE_VISUAL } from '../src/fps/throwable-cartridge.mjs';
import { cartridge, makeWeapon, disposeWeaponResources } from '../src/fps/model-primitives.mjs';
import { Renderer } from '../src/fps/render-engine.mjs?v=6.1.2';

const projectile = (id = 'test1', type = 'he') => ({ id, type, x: 3, y: 1.5, z: -2, vx: 4, vy: 3, vz: -8, radius: CONFIG.grenadeRadius, fuse: CONFIG.grenadeFuse });
const meshes = model => { const found = []; model.traverse(o => { if (o.isMesh) found.push(o); }); return found; };
for (const type of ['he', 'flash', 'smoke']) {
  test(`${type}: original moulded Cartridge fits the existing hand and draw budget`, () => {
    const model = cartridge(type);
    assert.equal(model.userData.visualModel, CARTRIDGE_VISUAL);
    const bounds = new THREE.Box3().setFromObject(model), size = bounds.getSize(new THREE.Vector3());
    assert.ok(size.x > .12 && size.x < .15, `width ${size.x}`);
    assert.ok(size.y > .18 && size.y < .22, `height ${size.y}`);
    assert.ok(size.z > .12 && size.z < .16, `depth ${size.z}`);
    assert.ok(bounds.min.y >= -.002, 'standing model uses the original foot origin');
    assert.ok(model.userData.components.includes('reaction-tube'));
    assert.ok(model.userData.components.includes('closed-lid'));
    const batch = meshes(model);
    assert.equal(batch.length, 5, 'five rigid material batches, no per-part draws');
    assert.ok(batch.reduce((n, m) => n + m.geometry.attributes.position.count / 3, 0) < 6000);
    assert.ok(batch.every(m => !m.material.transparent && m.geometry.userData.sharedThrowableCartridge));
    assert.ok(batch.some(m => m.material.name === 'cartridge-blue-foot'));
  });
}
test('same-type instances share immutable assets but not transforms', () => {
  const a = createThrowableCartridge('he'), b = createThrowableCartridge('he');
  assert.notEqual(a, b); assert.equal(a.children.length, b.children.length);
  a.position.x = 10; a.children[0].rotation.x = 1;
  assert.ok(b.position.x === 0); assert.ok(b.children[0].rotation.x === 0);
  for (let i = 0; i < a.children.length; i++) {
    assert.equal(a.children[i].geometry, b.children[i].geometry);
    assert.equal(a.children[i].material, b.children[i].material);
  }
});
test('invalid type/size rejected, objective bomb deliberately stays original', () => {
  assert.throws(() => createThrowableCartridge('bomb'), TypeError);
  assert.throws(() => createThrowableCartridge('he', NaN), RangeError);
  assert.throws(() => createThrowableCartridge('he', -1), RangeError);
  assert.equal(cartridge('bomb').userData.type, 'bomb');
  assert.notEqual(cartridge('bomb').userData.visualModel, CARTRIDGE_VISUAL);
});
test('world weapon and thrown shell use the same Cartridge family', () => {
  const weapon = makeWeapon('smoke', { viewmodel: false });
  let found = false; weapon.traverse(o => { found ||= o.userData.visualModel === CARTRIDGE_VISUAL; });
  assert.ok(found);
  const thrown = createThrownCartridge(projectile('sm', 'smoke'), 10);
  assert.equal(thrown.children[0].userData.visualModel, CARTRIDGE_VISUAL);
  assert.equal(thrown.children[0].userData.type, 'smoke');
});
test('new throws have distinct deterministic spin; animation consumes no randomness or gameplay state', () => {
  const g = projectile(), before = structuredClone(g), random = Math.random;
  // Three.js object UUID construction is intentionally outside the entropy guard.
  const a = createThrownCartridge(g, 0), b = createThrownCartridge(projectile('test2'), 0);
  try {
    Math.random = () => { throw new Error('Randomness consumed by cosmetic animation'); };
    updateThrownCartridge(a, g, .05); updateThrownCartridge(b, g, .05);
  } finally { Math.random = random; }
  assert.deepEqual(g, before);
  assert.notEqual(a.rotation.x, b.rotation.x);
});
test('paused simulation freezes spin even when render keeps running', () => {
  const g = projectile(), m = createThrownCartridge(g, 4);
  updateThrownCartridge(m, g, 4.05);
  const q = m.quaternion.clone();
  for (let i = 0; i < 20; i++) updateThrownCartridge(m, g, 4.05);
  assert.ok(m.quaternion.equals(q));
});
for (const radius of [CONFIG.grenadeRadius, .07, .14]) {
  test(`floor rest uses collision radius ${radius} without floating or moving the simulation`, () => {
    const g = {...projectile(), radius, y: radius, vx: 0, vy: 0, vz: 0}, before = structuredClone(g);
    const m = createThrownCartridge(g, 0);
    for (let i = 1; i <= 120; i++) updateThrownCartridge(m, g, i / 60);
    const q = m.quaternion.clone();
    updateThrownCartridge(m, g, 2.02);
    assert.ok(q.angleTo(m.quaternion) < .0001, 'resting cartridge must stop spinning');
    const bottom = new THREE.Box3().setFromObject(m).min.y;
    assert.ok(bottom >= .0029 && bottom < .004, `floor contact: ${bottom}`);
    assert.deepEqual(g, before);
  });
}
test('flight orientation is stable across render rates for constant velocity', () => {
  const g = projectile(), a = createThrownCartridge(g, 0), b = createThrownCartridge(g, 0);
  for (let i = 1; i <= 60; i++) updateThrownCartridge(a, g, i / 60);
  for (let i = 1; i <= 30; i++) updateThrownCartridge(b, g, i / 30);
  assert.ok(a.quaternion.angleTo(b.quaternion) < .00001);
});
test('removing one projectile retains assets still used by another or the hand', () => {
  const a = createThrownCartridge(projectile('cleanup-a'), 0), b = createThrowableCartridge('he');
  let disposed = 0;
  for (const m of meshes(b)) { m.geometry.addEventListener('dispose', () => disposed++); m.material.addEventListener('dispose', () => disposed++); }
  const scene = new THREE.Scene(); scene.add(a);
  Renderer.prototype.disposeTransient.call({scene, smokeMap: null, muzzle: {material: {map: null}}}, a);
  assert.equal(a.parent, null); assert.equal(disposed, 0);
});
test('single owner disposes shared geometry/material once and rebuilds cleanly', () => {
  const a = createThrowableCartridge('he');
  makeWeapon('he', {viewmodel: false});
  const counts = new Map();
  for (const m of meshes(a)) for (const resource of [m.geometry, m.material]) {
    counts.set(resource, 0); resource.addEventListener('dispose', () => counts.set(resource, counts.get(resource) + 1));
  }
  disposeWeaponResources();
  for (const count of counts.values()) assert.equal(count, 1, 'exactly one final disposal');
  disposeThrowableCartridges();
  for (const count of counts.values()) assert.equal(count, 1, 'teardown is idempotent');
  const b = createThrowableCartridge('he'); assert.notEqual(a.children[0].geometry, b.children[0].geometry);
  disposeThrowableCartridges();
});
