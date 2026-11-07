#!/usr/bin/env node
// End-to-end smoke tests of the original (not Frontline) Cartridge Strike FPS.
// Requires Playwright Chromium and a local HTTP server: python3 -m http.server 8765
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(__dirname, '../frontline/source/tools/dev/node_modules/playwright-core'));

const ORIGIN = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const argumentsChrome = ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader',
  '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function openOriginal(browser, mobile) {
  const context = await browser.newContext(mobile
    ? {
        viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true,
        deviceScaleFactor: 2, userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
      }
    : { viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const pageErrors = [];
  page.on('pageerror', error => pageErrors.push(error.stack || String(error)));
  await page.addInitScript(() => {
    window.__pointerLockAttempts = 0;
    HTMLCanvasElement.prototype.requestPointerLock = function () {
      window.__pointerLockAttempts++;
      // Simulate Safari's lack of pointer lock on phones. On desktop just
      // acknowledge the call to test the unchanged keyboard/mouse entrypoint.
      if (matchMedia('(pointer: coarse)').matches) throw new Error('Pointer Lock unsupported by test mobile');
      return Promise.resolve();
    };
  });
  await page.goto(ORIGIN + '/fps/?test&realtime', { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => {
    const fatal = document.getElementById('fatal');
    const start = document.getElementById('start');
    return !!start && !start.disabled || !!fatal && !fatal.hidden;
  }, null, { timeout: 180000, polling: 400 });
  const error = await page.locator('#fatal').evaluate(el => el.hidden ? '' : el.textContent);
  assert.equal(error, '', 'Game failed booting: ' + error);
  assert.equal(await page.locator('#start').isEnabled(), true, 'Start must unlock after assets load.');
  await page.locator('#start').click({ timeout: 30000 });
  await page.waitForFunction(() => !!globalThis.__fps && globalThis.__fps.modal === null, null,
    { timeout: 20000, polling: 100 });
  await page.waitForTimeout(900);
  const state = await page.evaluate(() => ({
    mobile: __fps.mobile.enabled,
    controlsVisible: !document.getElementById('mobile-controls').hidden,
    graphics: __fps.settings.graphics,
    pixelRatio: __fps.renderer.renderer.getPixelRatio(),
    hasCanvas: document.getElementById('game').width > 0,
    pointerLocks: window.__pointerLockAttempts,
    phase: __fps.game.phase,
    fatal: document.getElementById('fatal').hidden ? '' : document.getElementById('fatal').textContent,
  }));
  assert.equal(state.hasCanvas, true);
  assert.equal(state.fatal, '', 'Fatal rendering after starting: ' + state.fatal);
  assert.equal(pageErrors.length, 0, 'Browser errors: ' + pageErrors.slice(0, 4).join('\n'));
  return { context, page, state };
}

(async () => {
  const browser = await chromium.launch({ headless: true, args: argumentsChrome });
  try {
    // The mobile browser is intentionally missing Pointer Lock.
    const { context: mobileCtx, page, state } = await openOriginal(browser, true);
    assert.equal(state.mobile, true, 'Expected touchscreen detection');
    assert.equal(state.controlsVisible, true, 'Touch overlay should appear when a match starts');
    assert.equal(state.graphics, 'low', 'Fresh mobile visits should start with low graphics');
    assert.ok(state.pixelRatio <= 0.8, 'Mobile should cap GPU pixel ratio');
    assert.equal(state.pointerLocks, 0, 'Touch start must never invoke pointer lock');
    assert.equal(await page.locator('[data-mobile-action=fire]').isVisible(), false,
      'Riposte-style auto-trigger should hide the manual fire button by default');
    await page.locator('[data-mobile-action=pause]').tap();
    const autoSetting = page.locator('#pause [data-setting=mobileAutoFire]');
    assert.equal(await autoSetting.isChecked(), true, 'Auto-fire setting defaults to enabled');
    await autoSetting.uncheck();
    await page.locator('#resume').tap();
    assert.equal(await page.locator('[data-mobile-action=fire]').isVisible(), true,
      'Manual fire button must return when mobile auto-fire is disabled');
    const cdp = await mobileCtx.newCDPSession(page);

    const zone = await page.locator('[data-mobile-stick-zone]').boundingBox();
    assert.ok(zone && zone.width > 100 && zone.height > 100);
    const stickX = zone.x + zone.width * .35, stickY = zone.y + zone.height * .67;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: stickX, y: stickY, id: 1 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: stickX + 15, y: stickY - 48, id: 1 }],
    });
    const moving = await page.evaluate(() => __fps.input());
    assert.ok(moving.forward > .35, 'Moving left thumb upward should move player forward: ' + JSON.stringify(moving));
    assert.ok(moving.strafe > .1, 'Diagonal left thumb should strafe');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const stopped = await page.evaluate(() => __fps.input());
    assert.equal(stopped.forward, 0, 'Joystick must release cleanly');

    const fire = await page.locator('[data-mobile-action=fire]').boundingBox();
    assert.ok(fire && fire.width >= 44);
    const fireX = fire.x + fire.width / 2, fireY = fire.y + fire.height / 2;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: fireX, y: fireY, id: 2 }],
    });
    assert.equal((await page.evaluate(() => __fps.input())).fire, true, 'Fire button must hold trigger');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    assert.equal((await page.evaluate(() => __fps.input())).fire, false, 'Fire must release');

    // Simultaneous left movement + right fire should work with two fingers.
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [
        { x: stickX, y: stickY, id: 11 },
        { x: fireX, y: fireY, id: 12 },
      ],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [
        { x: stickX + 12, y: stickY - 39, id: 11 },
        { x: fireX, y: fireY, id: 12 },
      ],
    });
    const combined = await page.evaluate(() => __fps.input());
    assert.ok(combined.forward > .2 && combined.fire,
      'Two simultaneous fingers must move and fire: ' + JSON.stringify(combined));
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Look drag is independent of left-stick input.
    const look = await page.locator('[data-mobile-look]').boundingBox();
    const lookX = look.x + look.width * .2, lookY = look.y + look.height * .25;
    const initialYaw = (await page.evaluate(() => __fps.input())).yaw;
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchStart', touchPoints: [{ x: lookX, y: lookY, id: 3 }],
    });
    await cdp.send('Input.dispatchTouchEvent', {
      type: 'touchMove', touchPoints: [{ x: lookX + 38, y: lookY + 12, id: 3 }],
    });
    const newYaw = (await page.evaluate(() => __fps.input())).yaw;
    assert.ok(Math.abs(newYaw - initialYaw) > .02, 'Dragging right thumb should aim freely');
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

    // Re-enable auto-fire, verify actual semi-auto repeated shots from a
    // visible target, and ensure empty sights release the trigger immediately.
    await page.locator('[data-mobile-action=pause]').tap();
    await autoSetting.check();
    await page.locator('#resume').tap();
    assert.equal(await page.locator('[data-mobile-action=fire]').isVisible(), false,
      'Auto-fire setting should hide manual trigger again');
    const autoOutcome = await page.evaluate(() => {
      const g = __fps.game, p = g.player;
      g.state.phase = 'active';
      p.weapon = 'p9';
      p.reloadUntil = 0;p.nextShot = g.state.time;p.fireHeld = false;
      const other = g.actors.find(a => a.team !== p.team);
      g.reticleTarget = () => other;
      const aimed = __fps.input();
      const before = g.item(p).ammo;
      __fps.step(null,.25);
      const after = g.item(p).ammo;
      g.reticleTarget = () => null;
      const empty = __fps.input();
      __fps.step(null,.25);
      return { aimed: aimed.autoFire && aimed.fire, count: before-after,
        empty: empty.autoFire || empty.fire, held: p.fireHeld,
        remaining: g.item(p).ammo, fatal: document.getElementById('fatal').hidden };
    });
    assert.equal(autoOutcome.aimed,true,'Visible enemy should auto-trigger without pressing ELD');
    assert.ok(autoOutcome.count >= 2, 'Pistol should auto-fire repeatedly at its own cadence: '+JSON.stringify(autoOutcome));
    assert.equal(autoOutcome.empty,false,'No target means no automatic trigger');
    assert.equal(autoOutcome.held,false,'Trigger must release when target is lost');
    assert.equal(autoOutcome.fatal,true,'No fatal error from auto-fire test');

    await page.locator('[data-mobile-action=pause]').tap();
    assert.equal(await page.locator('#pause').isVisible(), true, 'Pause should work on phones');
    assert.equal(await page.locator('#mobile-controls').isVisible(), false, 'Controls must hide behind modal');
    await page.locator('#resume').tap();
    assert.equal(await page.locator('#mobile-controls').isVisible(), true, 'Touch controls restored on resume');
    assert.equal((await page.evaluate(() => window.__pointerLockAttempts)), 0,
      'Resume must not attempt unsupported pointer lock');

    console.log('MOBILE PASS: auto-fire default, aim target, repeated pistol shots, manual opt-out, recoil, dual-touch, pause/resume', state);
    await mobileCtx.close();

    const { context: desktopCtx, page: desktop, state: desktopState } = await openOriginal(browser, false);
    assert.equal(desktopState.mobile, false, 'Desktop must preserve mouse input');
    assert.equal(desktopState.controlsVisible, false, 'Touch UI must be absent on desktop');
    assert.equal(desktopState.pointerLocks, 1, 'Desktop should still request pointer lock');
    assert.equal(desktopState.graphics, 'standard', 'Original desktop graphics stay unchanged');
    console.log('DESKTOP PASS: original startup, mouse lock, no touch overlay', desktopState);
    await desktopCtx.close();
  } finally {
    await browser.close();
  }
})().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
