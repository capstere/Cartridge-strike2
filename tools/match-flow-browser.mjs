// Serve the repo root and run this file with the same Playwright install as mobile-smoke.cjs.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import { chromium } from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH,
  headless: process.env.FPS_NETWORK_HEADED !== '1',
  args: process.env.FPS_NETWORK_HEADED === '1'
    ? ['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']
    : ['--no-sandbox','--use-angle=swiftshader','--enable-unsafe-swiftshader'],
});
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
  const fontStylesheet = new URL('/fps/type.css', origin).href;
  await page.route(fontStylesheet, route => { fontRequest = route; }, { times:1 });
  await page.goto(origin + '/fps/?test&level=synthetic-demo', { waitUntil: 'commit' });
  await start.click();
  assert.equal(await start.getAttribute('data-launch-requested'), '1');
  await pendingController.continue();
  await page.waitForFunction(() => window.__csFlow);
  assert.ok(await cancel.isVisible());
  await cancel.click();
  assert.equal(fontRequest?.request().url(), fontStylesheet, 'Launch and cancel work while the actual optional font stylesheet is stalled');
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
  assert.match(timeout, /too long to load/);
  await pendingManifest.fulfill({ status: 503, body: 'Unavailable' });
  await page.waitForFunction(() => !document.getElementById('fatal').hidden);
  assert.equal(await page.locator('#csl-err-text').textContent(), timeout);
  await page.locator('#csl-back').click();
  assert.ok(await page.locator('#fatal').isHidden());
  await start.click();
  assert.match(await page.locator('#csl-err-text').textContent(), /map (list|manifest)/i);
  holdManifest = false;
  // Restore the production timeout for the successful boot on slower software GPUs.
  await page.evaluate(() => {
    const url = new URL(location.href);
    url.searchParams.delete('loadTimeout');
    history.replaceState(null, '', url);
  });
  await retry.click();
  await page.locator('#csl-deploy').waitFor({timeout:240000});
  assert.ok(await page.locator('#hud').isHidden());
  assert.equal(await page.evaluate(()=>__fps.game.player==null),true);
  assert.equal(await page.locator('#csl-choice').inputValue(),'standard');
  await page.locator('#csl-choice').selectOption('assault');
  await page.locator('#csl-cancel').tap();
  assert.equal(await page.evaluate(()=>document.activeElement.id),'start');
  await start.tap();
  assert.equal(await page.locator('#csl-choice').inputValue(),'standard');
  await page.locator('#csl-choice').selectOption('scout');
  await page.locator('#csl-deploy').tap();
  await page.waitForFunction(() => window.__csFlow?.flow.failed ||
    (window.__fps?.game.player && !document.getElementById('hud').hidden),
    null, { polling: 200, timeout: 240000 });
  assert.ok(await page.evaluate(() => !__csFlow.flow.failed), await page.locator('#csl-err-text').textContent());
  await page.evaluate(() => __fps.stopFrameLoop());
  assert.equal(await page.evaluate(() => __fps.game.team), 'counterAnalysts');
  assert.equal(await page.evaluate(() => __fps.game.player.arsenalClass.id),'scout');
  assert.equal(await page.evaluate(() => __fps.game.actors.length), 10);
  assert.ok(await page.evaluate(() => __csFlow.music.track.paused));
  await page.evaluate(() => __fps.showBuy());
  await page.locator('[data-item=armor]').tap();
  assert.equal(await page.locator('#buy-message').getAttribute('data-outcome'), 'accepted');
  assert.match(await page.locator('#buy-message').textContent(), /purchased|bought/i);
  assert.match(await page.locator('.cs-buy-detail h4').textContent(), /^Body armor$/i);
  const remaining = await page.locator('#buy-money').getAttribute('data-credits');
  assert.equal(Number(remaining), 150);
  await page.locator('[data-item=smg]').tap();
  assert.equal(await page.locator('#buy-message').getAttribute('data-outcome'), 'denied');
  assert.equal(await page.locator('#buy-money').getAttribute('data-credits'), remaining);
  assert.match(await page.locator('#buy-message').textContent(), /funds|afford|credits|money/i);
  await page.locator('#return-buy').tap();
  // Advance the simulation clock and deliver the final damage in each round.
  // Round resolution, restarts, score and the result overlay use the ordinary game path.
  const rounds=await page.evaluate(() => {
    const g=__fps.game,dt=g.config.fixedStep;
    for(let round=1;round<=g.config.matchWins;round++){
      const maxSteps=Math.ceil((g.config.buyTime+g.config.resultTime+1)/dt);
      for(let i=0;i<maxSteps && ['buy','result'].includes(g.phase);i++) g.step(dt);
      if(g.phase!=='active' || g.state.round!==round) throw Error('Did not enter round '+round);
      const attacker=g.actors.find(actor=>actor.team==='analysts');
      for(const defender of g.actors.filter(actor=>actor.team==='counterAnalysts')) g.damage(defender,1000,attacker);
      g.step(dt);
    }
    __fps.step({},0);
    return g.state.history.map(result=>[result.round,result.winner,result.reason]);
  });
  assert.deepEqual(rounds,Array.from({length:5},(_,i)=>[i+1,'analysts','elimination']));
  assert.ok(await page.locator('#match-end').isVisible());
  assert.equal(await page.locator('#match-winner').textContent(), 'Analysts win');
  assert.equal(await page.locator('#match-score').textContent(), '5 – 0 · 5 rounds');
  assert.match(await page.locator('#new-match').textContent(), /return to lobby/i);
  const evidence=process.env.CS3_MATCH_RESULT_EVIDENCE;
  if(evidence){
    await mkdir(evidence,{recursive:true});
    await page.screenshot({path:join(evidence,'touch-solo-result.jpg'),type:'jpeg',quality:75,animations:'disabled'});
  }
  await page.locator('#new-match').click();
  await page.evaluate(() => __fps.step({}, 0));
  assert.ok(await page.locator('#menu').isVisible());
  assert.ok(await page.locator('#match-end').isHidden());
  await page.locator('#route-back').tap();
  await page.locator('#play-title').waitFor();
  await page.locator('[data-go=solo]:visible').tap();
  await page.locator('#setup-title').waitFor();
  await start.tap();
  await page.locator('#csl-deploy').tap();
  await page.locator('#hud').waitFor({timeout:120000});
  await page.locator('#cs-loading').waitFor({state:'hidden',timeout:120000});
  assert.match(await page.locator('#round-label').textContent(), /round 1/i);
  assert.deepEqual(await page.evaluate(() => __fps.game.state.score), {analysts:0,counterAnalysts:0});
  assert.deepEqual(errors, []);
  console.log('PASS: delayed launch, cancellation, duplicate Enter, timeout, late failure, retry, team, lobby audio, English match result, post-match return and repeat');
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
