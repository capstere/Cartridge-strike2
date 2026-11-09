#!/usr/bin/env node
// Compare coarse cell culling with the shipped item culling on exactly the same world frame.
const assert = require('node:assert/strict');
const { chromium } = require('../frontline/source/tools/dev/node_modules/playwright-core');

function compareViews() {
  const f = window.__fps, r = f.renderer, gpu = r.renderer, gl = gpu.getContext();
  f.stopFrameLoop();
  const items = r.projectFurniture.children.filter(cell => cell.name.startsWith('floor5-cell-'))
    .flatMap(cell => cell.children.filter(item => item.isGroup && item.userData.editId));
  const workstation = items.find(item => item.userData.editId === 'NY-OBJ-0024');
  const poses = [
    ['lift closed', -20.541, -30.03999, Math.PI, 0, 0],
    ['lift opening', -20.541, -30.03999, Math.PI, 0, .5],
    ['lift open', -20.541, -30.03999, Math.PI, 0, 1],
    ['turn inside the lift', -20.541, -30.03999, Math.PI / 2, 0, 1],
    ['through the lift doors', -20.541, -28, 2.7, -.05, 1],
    ['C08 encounter', 20, -5.4, -2.36, 0, 1],
    ['C08 reverse angle', 20, -5.4, Math.PI - 2.36, 0, 1],
    ['I04 desk', -9, -6.657, Math.PI / 2, -.48, 1],
    ['I04 reverse angle', -11.3, -6.657, -Math.PI / 2, -.48, 1],
  ];
  function captureWorld() {
    gpu.info.reset();
    gpu.autoClear = true;
    r.nativeRender(r.scene, r.camera);
    const pixels = new Uint8Array(gl.drawingBufferWidth * gl.drawingBufferHeight * 4);
    gl.readPixels(0, 0, gl.drawingBufferWidth, gl.drawingBufferHeight, gl.RGBA, gl.UNSIGNED_BYTE, pixels);
    return { pixels, calls: gpu.info.render.calls };
  }
  function changedPixels(a, b) {
    const left = new Uint32Array(a.buffer), right = new Uint32Array(b.buffer);
    let changed = 0;
    for (let i = 0; i < left.length; i++) if (left[i] !== right[i]) changed++;
    return changed;
  }
  return poses.map(([name, x, z, yaw, pitch, lift]) => {
    f.world.setElevatorProgress(lift);
    const walkable = f.world.canOccupy(x, z, f.game.player.radius, f.game.player.height, 0);
    Object.assign(f.game.player, { x, z, y: 0, yaw, pitch, moving: 0 });
    f.render();
    const normal = captureWorld();
    const hiddenItems = items.filter(item => item.parent.visible && !item.visible);
    for (const item of hiddenItems) item.visible = true;
    const coarse = captureWorld();
    for (const item of hiddenItems) item.visible = false;
    // Positive control: prove that an exposed kit actually changed the pixels when removed.
    const visible = workstation.visible;
    workstation.visible = false;
    const withoutKit = captureWorld();
    workstation.visible = visible;
    return { name, walkable, normalCalls: normal.calls, coarseCalls: coarse.calls,
      changed: changedPixels(normal.pixels, coarse.pixels), kitPixels: changedPixels(normal.pixels, withoutKit.pixels) };
  });
}

async function main() {
  const angle = process.env.PROFILE_ANGLE;
  const args = angle ? ['--use-angle=' + angle] : [];
  if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(() => localStorage.setItem('cartridge-settings', JSON.stringify({ mode: 'endless', graphics: 'low' })));
    await page.goto((process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765') + '/fps/?test&realtime&seed=42', { waitUntil: 'commit' });
    await page.locator('#start').tap();
    await page.waitForFunction(() => window.__fps?.game.phase === 'active' && !__fps.modal && document.getElementById('cs-loading').hidden,
      null, { timeout: 180000 });
    const start = await page.evaluate(() => ({ x: __fps.game.player.x, z: __fps.game.player.z, yaw: __fps.game.player.yaw }));
    await page.keyboard.down('w');
    await page.waitForFunction(p => Math.hypot(__fps.game.player.x - p.x, __fps.game.player.z - p.z) > .4, start);
    await page.keyboard.up('w');
    const distance = await page.evaluate(p => Math.hypot(__fps.game.player.x - p.x, __fps.game.player.z - p.z), start);
    const zone = await page.locator('[data-mobile-look]').boundingBox();
    const x = zone.x + zone.width * .35, y = zone.y + zone.height * .4;
    const cdp = await context.newCDPSession(page);
    for (const [type, touchPoints] of [['touchStart', [{ x, y, id: 1 }]], ['touchMove', [{ x: x + 35, y: y - 8, id: 1 }]], ['touchEnd', []]]) {
      await cdp.send('Input.dispatchTouchEvent', { type, touchPoints });
    }
    await page.waitForFunction(yaw => Math.abs(__fps.game.player.yaw - yaw) > .05, start.yaw);
    const yawChange = await page.evaluate(yaw => __fps.game.player.yaw - yaw, start.yaw);
    const views = await page.evaluate(compareViews);
    console.table(views);
    assert.ok(views.every(v => v.walkable && v.changed === 0), 'Culling changed the visible world at a sampled pose');
    assert.ok(views.find(v => v.name === 'lift open').coarseCalls - views.find(v => v.name === 'lift open').normalCalls >= 352);
    assert.ok(views.find(v => v.name === 'I04 desk').kitPixels > 0);
    await page.keyboard.press('Escape');
    await page.locator('#restart').tap();
    assert.equal(await page.locator('#menu').isVisible(), true);
    assert.deepEqual(errors, []);
    console.log(JSON.stringify({ distance, yawChange, returnedToLobby: true, views }));
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
