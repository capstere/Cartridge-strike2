// Exercise the normal published root and ordinary browser inputs with two fresh profiles.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const output = process.env.CS3_MENU_EVIDENCE;
const native = process.env.CHROMIUM_PATH;
if (output) await mkdir(output, {recursive:true});
const browser = await chromium.launch({
  headless: process.env.FPS_NETWORK_HEADED !== '1',
  executablePath: native,
  args: native ? ['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage'] : [],
});
const evidence = [];
async function run(input) {
  const touch = input === 'touch';
  const viewport = touch ? {width:390,height:844} : {width:1280,height:720};
  const context = await browser.newContext({locale:touch?'fr-FR':'sv-SE', viewport, hasTouch:touch, isMobile:touch, deviceScaleFactor:1});
  const page = await context.newPage();
  page.setDefaultTimeout(65000);
  const errors = [];
  const startedAt = new Date().toISOString();
  page.on('pageerror', err => errors.push(err.message));
  await context.addInitScript(() => {
    localStorage.setItem('cartridge-settings', JSON.stringify({graphics:'low',volume:0}));
  });
  const snap = async name => {
    if (output) await page.screenshot({path:join(output,input+'-'+name+'.jpg'),type:'jpeg',quality:75,timeout:30000});
  };
  const press = async locator => touch ? locator.tap() : locator.click();
  const route = () => page.locator('#menu').getAttribute('data-screen');
  const go = name => press(page.locator('[data-go="'+name+'"]:visible').first());
  const back = () => press(page.locator('#route-back'));
  try {
    await page.goto(origin+'/',{waitUntil:'domcontentloaded',timeout:120000});
    await page.waitForURL('**/fps/');
    await page.locator('#home-title').waitFor();
    await page.getByRole('link',{name:'Credits'}).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await route(),'main');
    assert.ok(await page.locator('.cs-rotate').isHidden());
    await go('play'); assert.equal(await route(),'play');
    assert.equal(await page.getByRole('button',{name:/Public matches/}).isEnabled(),false);
    await go('friends'); assert.equal(await route(),'friends');
    assert.equal(new URL(await page.locator('[data-panel="friends"] [data-family-link]').getAttribute('href'),page.url()).pathname,'/room/JESPERS-ROOM');
    await back(); await page.locator('#play-title').waitFor();
    assert.equal(await page.evaluate(() => document.activeElement.dataset.go),'friends');
    await back(); await page.locator('#home-title').waitFor();
    await go('profile'); await page.getByRole('heading',{name:'Local guest'}).waitFor();
    await back(); await page.locator('#home-title').waitFor();
    await go('options'); assert.equal(await route(),'options');
    assert.equal(await page.locator('#mm-settings').evaluate(el => el.open),true);
    await page.locator('#seed').waitFor();
    await back(); await page.locator('#home-title').waitFor();
    await go('news'); await page.getByRole('heading',{name:'New match menus'}).waitFor(); await snap('news');
    await back(); await page.locator('#home-title').waitFor();
    await page.locator('#lobby-stage.is-ready').waitFor({state:'attached',timeout:120000});
    await snap('main');
    if (touch) await page.setViewportSize({width:844,height:390});
    await go('play'); await snap('play');
    await go('solo'); assert.equal(await route(),'solo');
    await page.locator('.map-tile').click();
    await page.locator('#choose-floor5[aria-pressed="true"]').waitFor();
    assert.equal(await page.getByRole('button',{name:/Compact Arena/}).isEnabled(),false);
    await snap('maps');
    await press(page.locator('#choose-floor5')); await page.locator('#setup-title').waitFor();
    await press(page.locator('[data-team="counterAnalysts"]'));
    assert.equal(await page.locator('#roster-counter').textContent(),'You + 4 bots');
    await snap('solo');
    await press(page.locator('#start'));
    await page.locator('#hud').waitFor({timeout:120000});
    await page.locator('#cs-loading').waitFor({state:'hidden',timeout:120000});
    if (!touch && !(await page.locator('#pause').isHidden())) await press(page.locator('#resume'));
    assert.match(await page.locator('#round-label').textContent(), /round\s+1/i);
    await snap('match');
    if (await page.locator('#pause').isHidden()) {
      if (touch) await press(page.locator('[data-mobile-action="pause"]'));
      else await page.keyboard.press('Escape');
    }
    await press(page.locator('#restart'));
    await page.locator('#setup-title').waitFor();
    await back(); await page.locator('#play-title').waitFor();
    await back(); await page.locator('#home-title').waitFor();
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(() => typeof window.__fps), 'undefined');
    evidence.push({input,locale:touch?'fr-FR':'sv-SE',menuViewport:viewport,matchViewport:page.viewportSize(),startedAt,completedAt:new Date().toISOString()});
  } catch (error) {
    console.error(input, page.url(), await route(), errors);
    await snap('failure').catch(() => {});
    throw error;
  } finally {
    await context.close();
  }
}
try {
  for (const input of ['desktop','touch']) await run(input);
  const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const workingTreeClean = !execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim();
  const receipt = {commit,workingTreeClean,browser:browser.version(),scenarios:evidence};
  if (output) await writeFile(join(output,'menu.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
