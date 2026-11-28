// Observe the release's normal Solo menu and deployment with one emulated touch client.
import assert from 'node:assert/strict';
import {mkdir, writeFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';

const origin = process.env.FPS_TEST_ORIGIN;
const output = process.env.CS3_VISUAL_EVIDENCE;
assert(origin && output, 'Set FPS_TEST_ORIGIN to the isolated build and CS3_VISUAL_EVIDENCE to an output directory.');
const base = new URL(origin);
assert(['127.0.0.1','localhost','[::1]'].includes(base.hostname), 'Use an isolated loopback server.');
await mkdir(output,{recursive:true});
const browser = await chromium.launch({
  headless:false, executablePath:process.env.CHROMIUM_PATH || '/usr/bin/chromium',
  args:['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']
});
const viewport = {width:932,height:430};
const context = await browser.newContext({viewport, locale:'sv-SE', hasTouch:true, isMobile:true, deviceScaleFactor:1});
const page = await context.newPage();
const report = {
  commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
  started:new Date().toISOString(), build:CONTRACT.buildHash, protocol:CONTRACT.protocolVersion,
  browser:browser.version(), viewport, device:'Raspberry Pi, Wayland native Chromium. CDP emulated touch.',
  locale:'sv-SE', scenes:[], errors:[]
};
page.setDefaultTimeout(65000);
page.on('pageerror', error => report.errors.push(error.message));
async function photograph(name, locator) {
  await locator.waitFor();
  const bytes = await page.screenshot({type:'jpeg',quality:83,path:join(output,name+'.jpg')});
  report.scenes.push({name,path:name+'.jpg',sha256:createHash('sha256').update(bytes).digest('hex'),
    ms:Math.round(await page.evaluate(()=>performance.now())),text:(await locator.innerText()).trim().slice(0,1200)});
}
const open = name => page.locator('[data-go="'+name+'"]:visible').first().tap();
const back = () => page.locator('#route-back').tap();
try {
  await page.goto(base.href,{waitUntil:'domcontentloaded'});
  await page.waitForURL('**/fps/');
  const build = await page.evaluate(async()=> (await import('../shared/multiplayer/build.mjs')).CONTRACT.buildHash);
  assert.equal(build,report.build);
  assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await open('news');
  assert.match(await page.locator('[data-news-build]').innerText(),new RegExp(report.build.slice(0,12)));
  await photograph('news',page.locator('[data-panel=news]'));
  await back();
  await open('options');
  const settings = page.locator('#menu-settings');
  const sections = [
    ['sound','volume','Sound'], ['display','graphics','Display'],
    ['touch','touchMode','Touch and aim'], ['look','zoomSensitivity','Touch and aim'],
    ['help',null,'Touch and aim']
  ];
  for (const [id,key,label] of sections) {
    const focus = settings.locator(key?'[data-setting="'+key+'"]':'[data-touch-help]');
    await focus.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await photograph(id,settings.getByRole('group',{name:label,exact:true}));
  }
  await back(); await open('play'); await open('solo');
  await page.locator('[data-value="endless"]').tap();
  // Hold one cold map response for an unambiguous photograph. The game still runs its normal loader.
  let deliverMap;
  const gate = new Promise(resolve=>{ deliverMap=resolve; });
  await page.route('**/levels/meltem.json*',async route=>{ await gate; await route.continue(); },{times:1});
  await page.locator('.map-tile').tap(); await page.locator('#choose-meltem').tap();
  await page.waitForURL(url=>url.searchParams.get('level')==='meltem');
  await page.waitForFunction(()=>!!document.getElementById('loadout').onchange);
  await page.locator('#loadout').selectOption('shotgun');
  await photograph('solo',page.locator('#setup-title'));
  const load = page.locator('#cs-loading');
  await page.locator('#start').tap();
  const deploy = page.getByRole('button',{name:'Deploy',exact:true});
  assert(await deploy.isHidden());
  await photograph('loading',load);
  assert.equal(await page.locator('#csl-tip').innerText(),'Open the tactical map during play to see your position and plan a route.');
  report.scenes.at(-1).art = await load.evaluate(el=>getComputedStyle(el).backgroundImage);
  assert.match(report.scenes.at(-1).art,/meltem\.webp/);
  report.loadControl = 'The driver released the single Meltem JSON response after recording the cold loading state.';
  deliverMap();
  await deploy.waitFor();
  assert(await page.locator('#hud').isHidden());
  const choice = page.locator('#csl-choice');
  assert.equal(await choice.inputValue(),'shotgun');
  await choice.selectOption('breacher');
  await page.locator('#csl-cancel').tap();
  assert(await page.locator('#hud').isHidden());
  assert.equal(await page.locator('#loadout').inputValue(),'shotgun');
  await page.locator('#start').tap();
  await deploy.waitFor();
  assert.equal(await choice.inputValue(),'shotgun');
  await choice.selectOption('scout');
  await photograph('deploy',page.locator('#csl-ready'));
  report.confirmedClass = await choice.locator('option:checked').innerText();
  await deploy.tap();
  await load.waitFor({state:'hidden'});
  await page.locator('#hud').waitFor();
  await page.waitForFunction(()=>/scout rifle/i.test(document.getElementById('weapon-name').textContent));
  report.deployedWeapon = await page.locator('#weapon-name').innerText();
  await photograph('hud',page.locator('#hud'));
  assert.deepEqual(report.errors,[]);
} finally {
  report.finished = new Date().toISOString();
  await writeFile(join(output,'journey.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();
}
