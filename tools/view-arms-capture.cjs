#!/usr/bin/env node
// Capture the shipped player camera and weapon pass during deterministic local play.
// Start a static server for the desired revision before running this tool.
const assert = require('node:assert/strict');
const { mkdirSync, readFileSync, writeFileSync } = require('node:fs');
const { createHash } = require('node:crypto');
const path = require('node:path');
const { chromium } = require(process.env.PLAYWRIGHT_CORE || '../frontline/source/tools/dev/node_modules/playwright-core');

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const output = process.env.ARM_OUTPUT || 'test-results/view-arms';
const angle = process.env.ARM_ANGLE || 'swiftshader';
const weapons = (process.env.ARM_WEAPONS || 'ar47,shotgun,p9,p12,cr4,smg,sniper,bazooka,knife,he,flash,smoke,bomb').split(',');
const formats = {
  desktop: { width: 1280, height: 720, touch: false },
  touch: { width: 844, height: 390, touch: true },
  wide: { width: 932, height: 430, touch: true },
};
const fps = 20;

async function appearancePage(context, page, sleeves, filename) {
  const bytes = readFileSync(filename);
  const sha256 = createHash('sha256').update(bytes).digest('hex');
  const model = 'quaternius-operator-male.glb';
  const original = await context.request.get(origin + '/assets/fps/models/' + model);
  assert(original.ok());
  const sourceHash = createHash('sha256').update(await original.body()).digest('hex');
  const file = 'assets/fps/custom-characters/' + sha256 + '.glb';
  await context.route('**/' + file, route => route.fulfill({ contentType: 'model/gltf-binary', body: bytes }));
  if (sleeves === 'long') {
    const contract = { format: 'cartridge-strike-runtime-character', version: 1, role: 'player',
      target: 'analysts-0', gender: 'male', rig: 'quaternius-operator-male', file: 'CHARACTER.glb',
      bytes: bytes.length, sha256, front: '+Z', up: '+Y', source: { file: model, sha256: sourceHash },
      view: { shortSleeves: false } };
    await context.route('**/assets/fps/character-overrides.json', route => route.fulfill({
      json: { schema: 1, characters: [{ file, contract }] },
    }));
    return '';
  }
  assert.equal(sleeves, 'short');
  await page.goto(origin + '/build-info.json');
  const id = await page.evaluate(async ({ file, sourceHash }) => {
    const { savePrivateCharacter } = await import('/src/fps/private-character-store.mjs');
    const raw = await fetch('/' + file);
    return savePrivateCharacter({ bytes: await raw.arrayBuffer(), name: 'Arm test', sourceHash });
  }, { file, sourceHash });
  return '&avatar=' + id;
}

async function measureAppearance() {
  const T = await import('/vendor/three/three.module.js');
  const f = window.__fps, r = f.renderer;
  const avatar = r.actorModel(f.game.player).userData.avatar;
  const applied = r.weaponModel.userData.characterAppearance;
  if (!applied?.profile) throw Error('The character has no view profile');
  const materials = avatar.meshes.flatMap(mesh => [mesh.material].flat());
  const glove = materials.find(m => m.name === 'gloves-leather');
  const skin = materials.find(m => m.name === 'face-skin');
  const shirt = materials.find(m => m.name === 'jacket-fabric');
  const profile = applied.profile;
  const cloth = shirt.color.clone();
  if (shirt.map) {
    const tex = shirt.map, uv = new T.Vector2(.005, .005);
    tex.updateMatrix();
    tex.transformUv(uv);
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 1;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(tex.image, Math.floor(uv.x * tex.image.width), Math.floor(uv.y * tex.image.height), 1, 1, 0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    cloth.multiply(new T.Color().setRGB(r / 255, g / 255, b / 255, tex.colorSpace));
  }
  if (profile.cloth.some((v, i) => Math.abs(v - cloth.toArray()[i]) > .004)) throw Error('Cloth colour changed');
  if (!profile.glove.color.equals(glove.color)) throw Error('Glove colour changed');
  if (profile.skin.some((v, i) => Math.abs(v - skin.color.toArray()[i]) > .004)) throw Error('Skin colour changed');
  const hands = applied.targets.filter(t => t.role === 'hand');
  const sleeves = applied.targets.filter(t => t.role.includes('sleeve'));
  if (hands.length < 2 || !hands.every(t => t.mesh.material === profile.glove)) throw Error('Glove not on hand');
  if (sleeves.length < 2 || !sleeves.every(t => t.mesh.material === profile.sleeve)) throw Error('Sleeve not on arm');
  return { private: Boolean(avatar.privateDesign), role: Boolean(avatar.roleDesign), matchedHands: hands.length,
    sourceGlove: glove.color.toArray(), sourceFace: skin.color.toArray(), sourceShirt: cloth.toArray(),
    glove: profile.glove.color.toArray(), skin: profile.skin, cloth: profile.cloth, shortSleeves: profile.shortSleeves !== false };
}

async function prepareGame() {
  const f = window.__fps;
  f.stopFrameLoop();
  const { WEAPONS } = await import('/src/fps/config.mjs');
  const r = f.renderer, gpu = r.renderer, gl = gpu.getContext();
  // File encoding and readback slow the recorder. Freeze the starting pixel ratio.
  r.adaptiveResolution.update = () => false;
  const extension = gl.getExtension('WEBGL_debug_renderer_info');
  const original = gpu.render.bind(gpu);
  const capture = window.armCapture = { weapons: WEAPONS };
  gpu.render = function (scene, camera) {
    if (capture.skipDraw) return;
    if (scene !== r.viewScene) return original(scene, camera);
    const { calls, triangles } = gpu.info.render;
    original(scene, camera);
    capture.draws = gpu.info.render.calls - calls;
    capture.triangles = gpu.info.render.triangles - triangles;
  };
  return {
    viewport: [innerWidth, innerHeight], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
    gpu: extension ? gl.getParameter(extension.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER),
    mobile: f.mobile.enabled, graphics: f.settings.graphics, level: f.world.project.name,
  };
}

function beginWeapon({ id, team }) {
  const f = window.__fps, h = window.armCapture, spec = h.weapons[id];
  f.start(team, { mode: 'endless', firefight: false, wanderers: false, botFire: false, loadout: 'smg' });
  const g = f.game, p = g.player;
  // Fix the encounter and other actors while keeping game physics, controls, firing,
  // selection, reload completion, render events and the two rendering passes active.
  for (const actor of g.actors) if (actor !== p) { actor.bot = null; actor.isPlayer = false; }
  Object.assign(p, { x: 20, y: 0, z: -5.4, yaw: -2.36, pitch: 0 });
  g.state.phase = 'active';
  if (spec.slot === 'primary' || spec.slot === 'pistol') {
    p.inventory[spec.slot] = g.weaponItem(id);
    p.inventory[spec.slot].ammo = 1; // The real shot leaves an empty magazine.
  }
  if (spec.slot === 'grenade') p.inventory[id] = 1;
  if (spec.slot === 'bomb') g.bomb.carrierId = p.id;
  if (!g.select(id)) throw Error('Could not equip ' + id);
  h.id = id;
  h.origin = [p.x, p.z];
  h.start = g.state.time;
  h.fired = null;
  h.reloaded = null;
  return { name: spec.name, duration: spec.reload || 0 };
}

function nextFrame({ frame, save }) {
  const f = window.__fps, g = f.game, p = g.player, h = window.armCapture;
  const id = h.id, spec = h.weapons[id], dt = .05;
  // 0–.35 switch, .35–.65 idle, .65–1.3 moving, 1.35–2.0 fire/pump,
  // 2–4.2 inspect, then the complete empty reload. Throwables are used last.
  const controls = { yaw: -2.36, pitch: 0, strafe: frame >= 13 && frame < 26 ? .52 : 0 };
  if (frame === 27 && (spec.reload || id === 'knife')) controls.fire = true;
  if (frame === 40 && !f.renderer.requestInspect(g)) throw Error('Inspection rejected for ' + id);
  if (frame === 86 && spec.reload) {
    if (!g.reload()) throw Error('Reload rejected for ' + id);
    h.reloaded = g.state.time;
  }
  if (frame === 86 && spec.slot === 'grenade') controls.fire = true;
  h.skipDraw = !save;
  f.step(controls, dt);
  if (frame === 27 && (spec.reload || id === 'knife')) {
    h.fired = f.renderer.shotAt;
    if (!(h.fired >= h.start)) throw Error('No shot event for ' + id);
  }
  return {
    jpg: save ? f.renderer.renderer.domElement.toDataURL('image/jpeg', .90).split(',')[1] : null,
    calls: h.draws, triangles: h.triangles, time: g.state.time - h.start,
    ammo: spec.reload ? p.inventory[spec.slot].ammo : null,
    remaining: Math.max(0, p.reloadUntil - g.state.time),
    travel: Math.hypot(p.x - h.origin[0], p.z - h.origin[1]),
    camera: f.renderer.camera.position.toArray(),
  };
}

async function movingInspection() {
  const f = window.__fps, g = f.game, p = g.player, r = f.renderer;
  const dt = 1 / 60, yawRate = -3, elapsed = 22 * dt, firstYaw = -2.30 - yawRate * elapsed;
  window.armCapture.skipDraw = false;
  // Settle the equip pose. The movement and subsequent turn use normal controls.
  for (let i = 0; i < 30; i++) f.step({ yaw: firstYaw, pitch: 0 }, dt);
  if (!r.requestInspect(g)) throw Error('Moving inspection rejected');
  for (let i = 1; i <= 22; i++) f.step({ forward: 1, yaw: firstYaw + yawRate * i * dt, pitch: 0 }, dt);
  const arm = r.weaponModel.userData.leftArm;
  let highestShoulderY = null;
  if (arm?.userData.rings) {
    const { rings, segments } = arm.userData, world = p => arm.localToWorld(p);
    const first = (rings - 1) * (segments + 1);
    const position = r.camera.position.clone();
    for (let j = 0; j <= segments; j++) {
      world(position.fromBufferAttribute(arm.geometry.attributes.position, first + j));
      const projected = position.project(r.viewCamera);
      const screenY = (1 - projected.y) * innerHeight / 2;
      highestShoulderY = Math.min(highestShoulderY ?? Infinity, screenY);
    }
  }
  return { elapsed, yawRate, yaw: p.yaw, speed: p.moving, height: innerHeight, highestShoulderY };
}

async function measurePose() {
  const { animateWeapon } = await import('/src/fps/models.mjs?v=6.1.2');
  const f = window.__fps, model = f.renderer.weaponModel;
  const spec = window.armCapture.weapons[model.userData.id];
  const p = { ...f.game.player, moving: 3.5, inventory: { ...f.game.player.inventory } };
  p.inventory[spec.slot] = { ...p.inventory[spec.slot], ammo: 0 };
  p.distanceWalked ??= 0;
  const blocks = [];
  let time = f.game.state.time + 1;
  for (let block = 0; block < 12; block++) {
    p.reloadUntil = time + spec.reload;
    const start = performance.now();
    for (let frame = 0; frame < 120; frame++) {
      const dt = spec.reload / 120;
      time += dt;
      p.x += dt * .4;
      p.distanceWalked += dt * .4;
      animateWeapon(model, p, time, dt);
    }
    const elapsed = performance.now() - start;
    if (block >= 3) blocks.push(elapsed * 1000 / 120);
    p.reloadUntil = 0;
    animateWeapon(model, p, time + .01, .01);
    time += .1;
  }
  return blocks;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: process.env.CHROMIUM_PATH || undefined, headless: true,
    args: ['--use-angle=' + angle, '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      '--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND',
      ...(process.env.ARM_WAYLAND ? ['--ozone-platform=wayland'] : [])],
  });
  try {
    for (const format of (process.env.ARM_FORMATS || 'desktop,touch').split(',')) {
      const { width, height, touch } = formats[format];
      const context = await browser.newContext({ viewport: { width, height }, hasTouch: touch, isMobile: touch, deviceScaleFactor: 1 });
      const page = await context.newPage(), errors = [];
      page.on('pageerror', e => errors.push(e.message));
      await page.addInitScript(() => {
        localStorage.setItem('cartridge-settings', JSON.stringify({ graphics: 'low', volume: 0, mode: 'endless', autoReload: false }));
      });
      const profile = process.env.ARM_SLEEVES;
      const selection = profile ? await appearancePage(context, page, profile, process.env.ARM_GLB) : '';
      await page.goto(origin + '/fps/?test&seed=42' + selection, { waitUntil: 'domcontentloaded' });
      await page.waitForFunction(() => window.__fps || !document.querySelector('#fatal').hidden, null, { timeout: 240000 });
      assert.equal(await page.locator('#fatal').isHidden(), true, await page.locator('#fatal').innerText());
      const settings = await page.evaluate(prepareGame);
      assert.equal(settings.mobile, touch);
      console.log(format, settings);
      if (!touch && !profile && process.env.ARM_STRESS) {
        await page.evaluate(beginWeapon, { id: 'shotgun', team: 'analysts' });
        const metrics = await page.evaluate(movingInspection);
        assert(Math.abs(metrics.speed - 4.2) < .02, 'Moving inspection needs unobstructed running');
        if (metrics.highestShoulderY !== null) assert(metrics.highestShoulderY > metrics.height, 'Shoulder enters bottom of frame');
        const directory = path.join(output, 'stress', 'shotgun');
        mkdirSync(directory, { recursive: true });
        await page.screenshot({ path: path.join(directory, 'hud.png') });
        writeFileSync(path.join(directory, 'metrics.json'), JSON.stringify(metrics) + '\n');
      }
      for (const id of weapons) {
        const directory = path.join(output, profile || (process.env.ARM_TEAM ? 'counters' : format), id);
        mkdirSync(directory, { recursive: true });
        const spec = await page.evaluate(beginWeapon, { id, team: process.env.ARM_TEAM || 'analysts' });
        const count = Math.ceil(86 + spec.duration * fps + 8);
        const samples = [];
        let appearance;
        for (let frame = 0; frame < count; frame++) {
          const save = !process.env.ARM_PREVIEW || [6, 12, 21, 27, 33, 54, 91, 99, 103, 108, 116, 122, count - 4].includes(frame);
          const { jpg, ...sample } = await page.evaluate(nextFrame, { frame, save });
          if (jpg) writeFileSync(path.join(directory, String(frame).padStart(3, '0') + '.jpg'), Buffer.from(jpg, 'base64'));
          samples.push(sample);
          if (frame === 12) {
            await page.screenshot({ path: path.join(directory, 'hud.png') });
            if (profile) {
              appearance = await page.evaluate(measureAppearance);
              appearance.fixtureSHA256 = createHash('sha256').update(readFileSync(process.env.ARM_GLB)).digest('hex');
            }
            if (process.env.ARM_TEAM) {
              appearance = await page.evaluate(() => {
                const f = window.__fps, p = f.game.player, renderer = f.renderer;
                const materials = renderer.actorModel(p).userData.avatar.meshes.flatMap(mesh => [mesh.material].flat());
                const exported = name => materials.find(m => m.name === name).color.getHexString();
                const profile = renderer.weaponModel.userData.characterAppearance?.profile;
                return { team: p.team, sourceShirt: exported('jacket-fabric'), sourceGlove: exported('gloves-leather'),
                  sleeve: profile?.sleeve.color.getHexString(), glove: profile?.glove.color.getHexString() };
              });
              if (process.env.ARM_ASSERT_TEAM) {
                assert.equal(appearance.sourceShirt, appearance.sleeve);
                assert.equal(appearance.sourceGlove, appearance.glove);
              }
            }
          }
        }
        assert(samples[27].travel > .2, 'Player moved during the walking samples');
        if (spec.duration) {
          assert.equal(samples[29].ammo, 0);
          assert(samples[86].remaining > 0);
          assert(samples.at(-1).ammo > 0 && samples.at(-1).remaining === 0);
        }
        const poseMicroseconds = spec.duration && process.env.ARM_TIMING ? await page.evaluate(measurePose) : undefined;
        writeFileSync(path.join(directory, 'samples.json'), JSON.stringify({ browser: browser.version(), settings, spec, appearance, poseMicroseconds, fps, samples }) + '\n');
        console.log(format, id, count, 'frames, idle', samples[12].calls, 'draws', samples[12].triangles, 'triangles');
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
