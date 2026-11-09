// Serve the repo root and run this file with the same Playwright install as mobile-smoke.cjs.
import assert from 'node:assert/strict';
import { chromium } from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const browser = await chromium.launch({ args: ['--no-sandbox', '--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
let page;
try {
  page = await browser.newPage({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const start = page.locator('#start');
  const cancel = page.locator('#csl-cancel');
  const retry = page.locator('#csl-retry');
  let pendingController;
  await page.route('**/src/fps/match-flow.mjs*', route => { pendingController = route; }, { times: 1 });
  let pendingEngine;
  await page.route('**/src/fps/app.mjs*', route => { pendingEngine = route; }, { times: 1 });
  let pendingManifest;
  let holdManifest = true;
  await page.route('**/levels/manifest.json', route => {
    if (holdManifest) pendingManifest = route;
    else return route.continue();
  });
  // A stalled optional font stylesheet must leave the launch and cancel controls usable.
  let fontRequest;
  await page.route('https://fonts.googleapis.com/**', route => { fontRequest = route; }, { times: 1 });
  await page.goto(origin + '/fps/?test&level=synthetic-demo', { waitUntil: 'commit' });
  await start.click();
  assert.equal(await start.getAttribute('data-launch-requested'), '1');
  await pendingController.continue();
  await page.waitForFunction(() => window.__csFlow);
  assert.ok(await cancel.isVisible());
  await cancel.click();
  assert.ok(fontRequest);
  await page.locator('[data-team=counterAnalysts]').click();
  await page.waitForFunction(() => __csFlow.music.track.currentTime > 0);
  await start.click();
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => __csFlow.flow.attempt), 2);
  assert.ok(await cancel.isVisible());
  assert.ok(await page.evaluate(() => __csFlow.music.track.paused));
  await cancel.click();
  await fontRequest.abort();
  assert.ok(pendingEngine);
  const manifestRequest = page.waitForRequest('**/levels/manifest.json', { timeout: 120000 });
  await pendingEngine.continue();
  await manifestRequest;
  assert.ok(await page.locator('#cs-loading').isHidden());
  await page.waitForFunction(() => !__csFlow.music.track.paused);
  // Shorten only the deliberate timeout scenario. Cancel and keyboard journeys
  // above use the same timing as production, even on a slow software renderer.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.set('loadTimeout', '3');
    history.replaceState(null, '', url);
  });
  await start.click();
  await retry.waitFor({ state: 'visible' });
  const timeout = await page.locator('#csl-err-text').textContent();
  assert.match(timeout, /svarar inte/);
  await pendingManifest.fulfill({ status: 503, body: 'Unavailable' });
  await page.waitForFunction(() => !document.getElementById('fatal').hidden);
  assert.equal(await page.locator('#csl-err-text').textContent(), timeout);
  await page.locator('#csl-back').click();
  assert.ok(await page.locator('#fatal').isHidden());
  await start.click();
  assert.match(await page.locator('#csl-err-text').textContent(), /Banlistan/);
  holdManifest = false;
  // Restore the production timeout for the successful boot on slower software GPUs.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete('loadTimeout');
    history.replaceState(null, '', url);
  });
  await retry.click();
  await page.locator('#hud').waitFor({ state: 'visible', timeout: 120000 });
  assert.equal(await page.evaluate(() => __fps.game.team), 'counterAnalysts');
  assert.equal(await page.evaluate(() => __fps.game.actors.length), 10);
  assert.ok(await page.evaluate(() => __csFlow.music.track.paused));
  await page.evaluate(() => __fps.showBuy());
  await page.locator('[data-item=armor]').tap();
  assert.match(await page.locator('#buy-message').textContent(), /köpt/);
  assert.equal(await page.locator('.cs-buy-detail h4').textContent(), 'Kroppsrustning');
  await page.locator('#return-buy').tap();
  // Drive the real final-round transition without waiting for a full first-to-five match.
  await page.evaluate(() => {
    const g = __fps.game;
    while (g.phase === 'buy') g.step(1 / 60);
    g.state.score.analysts = g.config.matchWins - 1;
    g.finishRound({ winner: 'analysts', reason: 'elimination' });
    __fps.step({}, 0);
  });
  assert.ok(await page.locator('#match-end').isVisible());
  await page.locator('#new-match').click();
  await page.evaluate(() => __fps.step({}, 0));
  assert.ok(await page.locator('#menu').isVisible());
  assert.ok(await page.locator('#match-end').isHidden());
  assert.deepEqual(errors, []);
  console.log('PASS: delayed launch, cancellation, duplicate Enter, timeout, late failure, retry, team, lobby audio and post-match return');
} catch (error) {
  if (page && !page.isClosed()) {
    console.error(await page.evaluate(() => ({
      url: location.href,
      status: document.getElementById('csl-status')?.textContent,
      detail: document.getElementById('csl-err-text')?.textContent,
      fatal: document.getElementById('fatal')?.querySelector('pre')?.textContent,
      ready: !!window.__fps,
      modal: window.__fps?.modal,
    })));
  }
  throw error;
} finally {
  await browser.close();
}
