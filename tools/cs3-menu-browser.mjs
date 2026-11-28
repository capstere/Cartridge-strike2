// Exercise the normal published root and ordinary browser inputs with two fresh profiles.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {execFileSync} from 'node:child_process';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const output = process.env.CS3_MENU_EVIDENCE;
const native = process.env.CHROMIUM_PATH;
const inputProfiles = ['desktop', 'touch'];
const requestedInput = process.env.CS3_MENU_INPUT;
if (requestedInput !== undefined && !inputProfiles.includes(requestedInput)) {
  throw Error('CS3_MENU_INPUT must be desktop or touch.');
}
if (output) await mkdir(output, {recursive:true});
const browser = await chromium.launch({
  headless: process.env.FPS_NETWORK_HEADED !== '1',
  executablePath: native,
  channel: native ? undefined : 'chromium',
  args: native ? ['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage'] :
    ['--enable-unsafe-swiftshader','--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding'],
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
  const progress = action => console.log(`[${new Date().toISOString()}] ${input} ${action}`);
  progress('opening the normal root');
  page.on('pageerror', err => errors.push(err.message));
  await context.addInitScript(() => {
    if (!localStorage.getItem('cartridge-settings')) localStorage.setItem('cartridge-settings', JSON.stringify({graphics:'low',volume:0}));
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
    progress('Main ready');
    await page.getByRole('link',{name:'Credits'}).waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),'en');
    assert.equal(await route(),'main');
    assert.ok(await page.locator('.cs-rotate').isHidden());
    const music = page.getByRole('button',{name:'Mute menu music'});
    await press(music);
    assert.equal(await page.getByRole('button',{name:'Enable menu music'}).getAttribute('aria-pressed'),'false');
    assert.equal(await page.evaluate(() => localStorage.getItem('cs-lobby-music')),'off');
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
    await go('news'); await page.getByRole('heading',{name:'Classes, Rush and new match modes'}).waitFor();
    assert.match(await page.locator('[data-news-build]').innerText(),/Build [a-f0-9]{12}$/);
    await page.getByRole('heading',{name:'New match menus'}).waitFor(); await snap('news');
    await back(); await page.locator('#home-title').waitFor();
    await page.locator('#lobby-stage.is-ready').waitFor({state:'attached',timeout:120000});
    progress('menu, settings and keyboard focus checked');
    await snap('main');
    if (touch) await page.setViewportSize({width:844,height:390});
    await go('play'); await snap('play');
    await go('solo'); assert.equal(await route(),'solo');
    await page.locator('.map-tile').click();
    await page.locator('#choose-floor5[aria-pressed="true"]').waitFor();
    assert.equal(await page.locator('#solo-map-list [data-map-id=compact-arena]').count(),0);
    assert.equal(await page.locator('#solo-map-list [data-map-id=synthetic-demo]').count(),0);
    await page.locator('#random-map').waitFor();
    const referenceOptions=[];
    for(const [id,name] of [['meltem','Meltem'],['embruns','Kervénec Harbor'],['tephra','Tephra']]){
      if(await page.locator('#choose-'+id).count())referenceOptions.push({id,name});
    }
    const hasMeltem = referenceOptions.some(entry=>entry.id==='meltem');
    if(process.env.CS3_VERIFY_VARIANTS==='1')assert.equal(referenceOptions.length,3);
    if (process.env.CS3_VERIFY_MELTEM === '1') assert.ok(hasMeltem,'Meltem must be qualified in the tested manifest');
    await snap('maps');
    await press(page.locator('#choose-floor5')); await page.locator('#setup-title').waitFor();
    await press(page.locator('[data-team="counterAnalysts"]'));
    assert.equal(await page.locator('#roster-counter').textContent(),'You + 4 bots');
    await snap('solo');
    async function playMatch(label, picture) {
      progress('entering '+picture);
      await press(page.locator('#start'));
      await press(page.locator('#csl-deploy'));
      await page.locator('#hud').waitFor({timeout:120000});
      await page.locator('#cs-loading').waitFor({state:'hidden',timeout:120000});
      progress(picture+' playable');
      if (!touch && !(await page.locator('#pause').isHidden())) await press(page.locator('#resume'));
      assert.match(await page.locator('#round-label').textContent(), label);
      await snap(picture);
      if (await page.locator('#pause').isHidden()) {
        if (touch) await press(page.locator('[data-mobile-action="pause"]'));
        else await page.keyboard.press('Escape');
      }
      await press(page.locator('#restart'));
      await page.locator('#setup-title').waitFor();
    }
    await playMatch(/round\s+1/i,'match');
    for (const {id,name} of referenceOptions) {
      await press(page.locator('.map-tile'));
      await press(page.locator('#choose-'+id));
      await page.waitForURL(url => url.searchParams.get('level') === id && url.searchParams.get('mode') === 'endless');
      await page.waitForFunction(() => document.querySelector('#lb-mode-seg [data-value="classic"]')?.disabled);
      assert.equal(await page.locator('#game-mode').inputValue(),'endless');
      assert.equal(await page.locator('.map-tile [data-map-name]').textContent(),name);
      assert.equal(await page.locator('#roster-counter').textContent(),'You + 4 bots');
      await snap(id+'-setup');
      await playMatch(/endless action/i,id+'-match');
      const unsupported = new URL(page.url());
      unsupported.searchParams.set('mode','classic');
      await press(page.locator('.map-tile'));
      const eligible = await page.evaluate(async()=>{
        const {loadSoloManifest,soloCatalog}=await import('/src/fps/solo-maps.mjs');
        return soloCatalog(await loadSoloManifest()).filter(row=>row.random&&row.modes.includes('endless')).map(row=>row.id);
      });
      assert.ok(eligible.includes('floor5-prepared')&&referenceOptions.every(entry=>!eligible.includes(entry.id)));
      await press(page.locator('#random-map'));
      await page.waitForURL(url=>eligible.includes(url.searchParams.get('level'))&&url.searchParams.get('mode')==='endless');
      await page.locator('#setup-title').waitFor();
      await snap('random-endless-setup');
      await page.goto(unsupported.href,{waitUntil:'domcontentloaded'});
      await page.locator('#solo-map-notice').waitFor();
      const notice=await page.locator('#solo-map-notice').textContent();
      assert.ok(notice.startsWith(name));assert.match(notice,/does not support.*Floor 5/i);
      assert.equal(new URL(page.url()).searchParams.get('level'),'floor5-prepared');
    }
    await back(); await page.locator('#play-title').waitFor();
    await back(); await page.locator('#home-title').waitFor();
    // A bookmark has no opener in the in-page history. Both Back and Escape
    // must restore the private room, including the room on a subsequent reload.
    const deepLink = new URL('/fps/?network=local&screen=options&room=private-test',origin);
    await page.goto(deepLink.href,{waitUntil:'domcontentloaded'});
    await page.waitForSelector('#menu[data-screen="options"]');
    if (touch) await back(); else await page.keyboard.press('Escape');
    await page.waitForSelector('#menu[data-screen="network"]');
    assert.equal(new URL(page.url()).searchParams.get('room'),'private-test');
    await page.reload({waitUntil:'domcontentloaded'});
    await page.waitForSelector('#menu[data-screen="network"]');
    assert.deepEqual(errors,[]);
    assert.equal(await page.evaluate(() => typeof window.__fps), 'undefined');
    evidence.push({input,locale:touch?'fr-FR':'sv-SE',menuViewport:viewport,matchViewport:page.viewportSize(),maps:['floor5-prepared',...referenceOptions.map(row=>row.id)],startedAt,completedAt:new Date().toISOString()});
  } catch (error) {
    console.error(input, page.url(), await route(), errors);
    await snap('failure').catch(() => {});
    throw error;
  } finally {
    await context.close();
    progress('browser context closed');
  }
}
try {
  for (const input of requestedInput === undefined ? inputProfiles : [requestedInput]) await run(input);
  const commit = execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
  const workingTreeClean = !execFileSync('git',['status','--porcelain','--untracked-files=normal'],{encoding:'utf8'}).trim();
  const receipt = {commit,workingTreeClean,browser:browser.version(),scenarios:evidence};
  if (output) await writeFile(join(output,'menu.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
} finally {
  await browser.close();
}
