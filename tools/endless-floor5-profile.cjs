#!/usr/bin/env node
// Run against a local checkout. Only the profiling page installs these hooks.
const assert = require('node:assert/strict');
const { mkdirSync, writeFileSync } = require('node:fs');
const { chromium } = require('../frontline/source/tools/dev/node_modules/playwright-core');

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const angle = process.env.PROFILE_ANGLE || 'default';

// Installs before navigation so an early Start and an in-page replay use the same clock.
function installProfile() {
  performance.setResourceTimingBufferSize(2000);
  localStorage.setItem('cartridge-settings', JSON.stringify({ mode: 'endless', graphics: 'low' }));
  const encounter = { x: 20, y: 0, z: -5.4, yaw: -2.36, pitch: 0, moving: 0 };
  const windows = [
    { name: 'lift', from: 2, until: 6 },
    { name: 'encounter', from: 20, until: 24 },
  ];
  let run, previous, observer;
  const launches = window.floor5Profiles = [];
  addEventListener('click', event => {
    if (!event.target.closest('#start')) return;
    previous = observer = null;
    run = { click: performance.now(), samples: {}, traces: {}, nearbyShots: new Map() };
    for (const { name } of windows) run.samples[name] = [];
    launches.push(run);
  }, true);

  function installWhenReady() {
    const f = window.__fps;
    if (!f) return requestAnimationFrame(installWhenReady);
    const r = f.renderer, gpu = r.renderer, gl = gpu.getContext();
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const backend = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER);
    const kitIds = new Set(f.world.projectScene.items
      .filter(item => item.assetName === 'Arbetsplatskit · bildskärm, tangentbord och mus')
      .map(item => item.id));
    const native = r.render;

    function camera() {
      return { xyz: r.camera.position.toArray(), direction: r.camera.getWorldDirection(r.camera.position.clone()).toArray() };
    }
    // Count actual Three.js counter deltas. One mesh may produce zero or multiple submissions.
    function trace(draw) {
      const owners = {}, passes = {}, workstations = {};
      const actorRoots = new Map([...r.actors].map(([id, root]) => [root, id]));
      const original = gpu.renderBufferDirect;
      function add(table, key, calls, triangles) {
        const tally = table[key] ||= { calls: 0, triangles: 0 };
        tally.calls += calls;
        tally.triangles += triangles;
      }
      gpu.renderBufferDirect = function (cam, scene, geo, mat, object, group) {
        const counter = gpu.info.render;
        const calls = counter.calls, triangles = counter.triangles;
        original.call(this, cam, scene, geo, mat, object, group);
        const n = counter.calls - calls, t = counter.triangles - triangles;
        if (!n) return;
        let owner = '', kit = '';
        for (let node = object; node && node !== scene; node = node.parent) {
          if (kitIds.has(node.userData.editId)) kit = node.userData.editId;
          if (node === r.floorEnvironment?.root) owner = 'floor environment';
          if (node.name.startsWith('floor5-cell-')) owner = 'furniture cells';
          if (node.parent === scene && !owner) {
            const actor = actorRoots.get(node);
            if (actor) owner = actor.startsWith('hostage-') ? 'hostages' : 'team models';
            else if (node === r.projectFurniture) owner = 'project decorations';
            else owner = node.name || 'other world geometry';
          }
        }
        const pass = scene === r.viewScene ? 'weapon' : 'world';
        add(passes, pass, n, t);
        add(owners, pass === 'weapon' ? 'first-person weapon' : owner, n, t);
        if (kit) add(workstations, kit, n, t);
      };
      try { draw(); } finally { gpu.renderBufferDirect = original; }
      return { time: f.game.state.time, camera: camera(), passes, owners, workstations,
        calls: r.stats.drawCalls, triangles: r.stats.triangles };
    }

    r.render = function (game, actor, dt) {
      if (!run || run.done || f.modal || game.phase !== 'active') return native.call(this, game, actor, dt);
      const time = game.state.time;
      // The stationary observer sees the natural seed-42 bot encounter. Player and AI state keep advancing.
      if (time >= 12) {
        observer ||= Object.assign(Object.create(actor), encounter);
        actor = observer;
      }
      const draw = () => native.call(this, game, actor, dt);
      const scene = time >= 24 ? 'encounter' : time >= 1 && time < 2 ? 'lift' : null;
      if (scene && !run.traces[scene]) run.traces[scene] = trace(draw);
      else draw();
      if (!run.spawn) {
        run.spawn = camera();
        run.settings = { backend, size: [innerWidth, innerHeight], buffer: [gl.drawingBufferWidth, gl.drawingBufferHeight],
          graphics: f.settings.graphics, seed: game.seed, mode: game.state.mode, team: game.team,
          character: document.getElementById('player-character').selectedOptions[0].text,
          weapon: game.player.weapon, actors: game.actors.length, bots: game.actors.filter(a => a.bot).length };
      }
      if (!run.firstPlayable && document.getElementById('cs-loading').hidden && !document.getElementById('hud').hidden) {
        run.firstPlayable = performance.now();
        const entries = performance.getEntriesByType('resource').filter(e => new URL(e.name).origin === location.origin);
        const since = launches.length === 1 ? 0 : run.click;
        run.transferBytes = entries.filter(e => e.responseEnd >= since).reduce((n, e) => n + e.transferSize, 0);
      }
      const sampleWindow = windows.find(w => time >= w.from && time < w.until);
      const stamp = document.timeline.currentTime;
      if (sampleWindow && previous?.name === sampleWindow.name) {
        run.samples[sampleWindow.name].push([Math.round((stamp - previous.stamp) * 100) / 100,
          r.stats.drawCalls, r.stats.triangles]);
      }
      previous = { name: sampleWindow?.name, stamp };
      if (sampleWindow?.name === 'encounter') for (const e of game.soundEvents) {
        if (e.type === 'shot' && e.time >= sampleWindow.from && Math.hypot(e.x - encounter.x, e.z - encounter.z) < 15)
          run.nearbyShots.set(e.serial, e.actorId);
      }
      if (time >= 24) {
        const shots = [...run.nearbyShots.values()];
        run.shots = { count: shots.length, shooters: [...new Set(shots)] };
        delete run.nearbyShots;
        run.done = true;
      }
    };
  }
  requestAnimationFrame(installWhenReady);
}

function summarize(samples) {
  const columns = [0, 1, 2].map(i => samples.map(sample => sample[i]).sort((a, b) => a - b));
  const [intervals, calls, triangles] = columns;
  const n = intervals.length;
  assert.ok(n >= 20 && intervals[0] > 0, 'Too few distinct rendered frames');
  return { n, medianMs: (intervals[Math.floor((n - 1) / 2)] + intervals[Math.floor(n / 2)]) / 2,
    p95Ms: intervals[Math.ceil(n * .95) - 1], calls: [calls[0], calls.at(-1)],
    triangles: [triangles[0], triangles.at(-1)] };
}

async function main() {
  const args = ['--host-resolver-rules=MAP fonts.googleapis.com ~NOTFOUND, MAP fonts.gstatic.com ~NOTFOUND'];
  if (angle !== 'default') args.push('--use-angle=' + angle);
  if (angle === 'swiftshader') args.push('--enable-unsafe-swiftshader');
  const browser = await chromium.launch({ channel: 'chromium', headless: true, args });
  try {
    const context = await browser.newContext({ viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const page = await context.newPage(), errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.addInitScript(installProfile);
    await page.goto(origin + '/fps/?test&realtime&seed=42', { waitUntil: 'commit' });
    const report = { browser: browser.version(), angle, launches: [] };
    for (const label of ['cold', 'warm replay']) {
      await page.locator('#start').tap();
      await page.waitForFunction(() => window.floor5Profiles.at(-1)?.done || !document.getElementById('fatal').hidden,
        null, { timeout: 600000, polling: 1000 });
      assert.equal(await page.locator('#fatal').isVisible(), false, await page.locator('#fatal pre').textContent());
      const run = await page.evaluate(() => window.floor5Profiles.at(-1));
      const { seed, actors, bots, graphics, team, mode, size, character } = run.settings;
      assert.deepEqual([seed, actors, bots, graphics, team, mode, size, character],
        [42, 10, 9, 'low', 'analysts', 'endless', [844, 390], 'Originalkaraktär']);
      assert.ok(run.firstPlayable > run.click && run.shots.count > 0);
      assert.deepEqual(Object.keys(run.traces).sort(), ['encounter', 'lift']);
      if (angle === 'metal') assert.match(run.settings.backend, /metal/i);
      if (angle === 'swiftshader') assert.match(run.settings.backend, /swiftshader/i);
      for (const trace of Object.values(run.traces)) {
        for (const buckets of [trace.passes, trace.owners]) {
          assert.equal(Object.values(buckets).reduce((sum, n) => sum + n.calls, 0), trace.calls);
          assert.equal(Object.values(buckets).reduce((sum, n) => sum + n.triangles, 0), trace.triangles);
        }
      }
      run.summary = Object.fromEntries(Object.entries(run.samples).map(([key, samples]) => [key, summarize(samples)]));
      console.log(label, run.settings.backend, Math.round(run.firstPlayable - run.click) + 'ms', run.summary, run.shots);
      report.launches.push({ label, ...run });
      await page.keyboard.press('Escape');
      await page.locator('#restart').tap();
      assert.equal(await page.locator('#menu').isVisible(), true);
    }
    assert.deepEqual(errors, []);
    mkdirSync('test-results', { recursive: true });
    writeFileSync('test-results/endless-floor5-' + angle + '.json', JSON.stringify(report) + '\n');
  } finally { await browser.close(); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
