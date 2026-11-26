// Run on the deployed Pi with a clean family room and the exact release checkout:
// CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
//   node tools/multimap-live.mjs <expected-release-sha>
// Credentials remain in their existing root-owned files. Only JESPERS-ROOM's
// host controls are used. Restore the observed settings through the same UI.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {mkdir,realpath,writeFile} from 'node:fs/promises';
import {basename,join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium,devices} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const origin='https://cs2.capstere.com', link=origin+'/room/JESPERS-ROOM', arena='compact-arena';
const expected=process.argv[2], out=process.env.FPS_MAP_OUT || 'test-results/multiplayer-maps';
assert(/^[a-f0-9]{40}$/.test(expected),'Pass the expected full release commit');
assert.equal(basename(await realpath('/opt/cartridge-strike2-pilot/current')),expected);
await mkdir(out,{recursive:true});
async function health() {
  const r=await fetch('http://127.0.0.1:2568/health',{signal:AbortSignal.timeout(5000)});
  assert(r.ok); return r.json();
}
async function until(check,msg,timeout=60000){
  const end=performance.now()+timeout;
  while(!await check()) {assert(performance.now()<end,msg);await delay(100);}
}
function secret(file,key) {
  const lines=execFileSync('sudo',['-n','cat',file],{encoding:'utf8'}).split('\n');
  const prefix=key+'=',value=lines.find(l=>l.startsWith(prefix))?.slice(prefix.length).trim().replace(/^['"]|['"]$/g,'');
  assert(value,'Missing private Pi setting '+key);return value;
}
const start=await health();
assert.equal(start.rooms,0);assert.equal(start.players,0);assert.equal(start.contract.buildHash,CONTRACT.buildHash);
const invite=secret('/etc/cartridge-strike2-pilot/invite.env','CS2_PILOT_INVITE');
const password=secret('/etc/cartridge-strike2-pilot/family.env','CS2_FAMILY_ROOM_PASSWORD');
const browser=await chromium.launch({headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:process.env.CHROMIUM_PATH,
  args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--ignore-gpu-blocklist','--enable-unsafe-swiftshader',
    ...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]});
const context=await browser.newContext({...devices['Pixel 7'],viewport:{width:915,height:412},screen:{width:915,height:412},deviceScaleFactor:1});
await context.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,mobileAutoFire:false})));
const page=await context.newPage(), errors=[];
page.on('pageerror',e=>errors.push(e.name));page.setDefaultTimeout(90000);
let changed=false, joined=false, original;
const report={url:link,revision:expected,buildHash:CONTRACT.buildHash,physicalPhone:false,browser:browser.version(),initialRooms:0};
const control=key=>page.locator('#room-'+key);
async function connect(){
  await page.locator('#network-name').fill('Kartkontroll');
  await page.locator('#network-code').fill(password);
  await page.locator('[data-create=false]').tap(); joined=true;
  await control('start').waitFor();
  await until(async()=>{const h=await health();return h.players===1&&h.rooms===1;},'One family-room member');
}
function state(){
  return page.evaluate(()=>{
    const r=window.mapReceipt?.room;
    if(!r)return null;
    const s=r.state,a=[...s.actors.values()].find(row=>row.sessionId===r.sessionId);
    return {settings:{map:s.mapId,mode:s.mode,'analysts-bots':String(s.analystsBots),'counter-analysts-bots':String(s.counterAnalystsBots),
      'tdm-minutes':String(s.tdmMinutes),'tdm-kills':String(s.tdmKills),'classic-wins':String(s.classicWins),'friendly-fire':s.friendlyFire?'on':'off',
      'bot-difficulty':s.botDifficulty,zombies:s.zombiesEnabled?'on':'off',danceman:s.dancemanEnabled?'on':'off'},
      host:r.sessionId===s.ownerId,ready:a?.ready,phase:s.phase,ammo:a?.primaryAmmo,tick:s.tick,actors:s.actors.size,
      duration:s.durationSeconds,target:s.scoreTarget,
      x:a?.x,z:a?.z,life:a?.lifeId,others:[...s.actors.values()].filter(p=>p.sessionId&&p.sessionId!==r.sessionId&&!p.bot).length};
  });
}
async function set(key,value) {
  const before=await state();
  assert(before?.host&&before.phase==='waiting'&&before.others===0,'Only the probe owns the waiting room');
  if(before.settings[key]===value)return;
  await control(key).selectOption(value);
  await until(async()=>{const row=await state();return row?.settings[key]===value&&row.ready;},'Persisted '+key);
}
async function leave() {
  if(!joined)return;
  if(await control('leave').isVisible()) await control('leave').tap();
  else {
    if(!await page.locator('#restart').isVisible())await page.locator('[data-mobile-action=pause]').tap();
    await page.locator('#restart').tap();
  }
  await page.locator('#network-code').waitFor();joined=false;
}
try {
  await page.goto(link,{waitUntil:'domcontentloaded'});await page.locator('[name=invite]').fill(invite);await page.locator('button[type=submit]').tap();
  await page.locator('#network-name').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('family'),'JESPERS-ROOM');
  assert.equal(new URL(page.url()).searchParams.has('test'),false);
  assert.equal(await page.evaluate(async()=>(await import('/shared/multiplayer/build.mjs')).CONTRACT.buildHash),CONTRACT.buildHash);
  // Observe the normal client connection for authoritative shot/setting evidence.
  await page.evaluate(async()=>{
    const {NetworkSession}=await import('/src/fps/network/session.mjs');
    const connect=NetworkSession.prototype.connect;
    NetworkSession.prototype.connect=function(...args){window.mapReceipt=this;return connect.apply(this,args);};
  });
  await connect(); original=(await state()).settings;
  changed=true;
  await set('map',arena);await set('tdm-minutes','3');await set('tdm-kills','10');
  await set('analysts-bots','2');await set('counter-analysts-bots','3');
  const lobby=await state();
  assert(lobby?.host&&lobby.phase==='waiting'&&lobby.settings.map===arena&&lobby.others===0,'Only the probe may start its family match');
  await control('ready').tap();await control('start').tap();
  await page.locator('#resume').tap();await until(async()=>(await state())?.phase==='active','Live Compact match active');
  const before=await state();assert.equal(before.settings.map,arena);assert.equal(before.settings.mode,'tdm');assert.equal(before.actors,6);
  assert.equal(before.duration,180);assert.equal(before.target,10);
  const cdp=await context.newCDPSession(page);
  try {
    const button=await page.locator('[data-mobile-action=fire]').boundingBox();assert(button);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:button.x+button.width/2,y:button.y+button.height/2}]});
    await until(async()=>{const s=await state();return s.ammo<before.ammo&&s.life===before.life;},'Live server confirmed manual fire',5000);
  } finally {await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  const after=await state();
  await page.screenshot({path:join(out,'live-compact.jpg'),quality:83});
  report.active={actors:before.actors,mode:before.settings.mode,map:before.settings.map,minutes:before.duration/60,kills:before.target,
    bots:{analysts:2,counterAnalysts:3},ammoBefore:before.ammo,ammoAfter:after.ammo,ticks:[before.tick,after.tick]};
  assert.deepEqual(errors,[]);
} catch(error) {report.error=String(error.stack).replaceAll(invite,'[private]').replaceAll(password,'[private]').replace(/(?:sessionId|reconnectionToken)=[^\s&]+/ig,'[session]');}
finally {
  try {
    await leave();
    await until(async()=>(await health()).rooms===0,'Probe released its empty family room');
    if(changed) {
      await connect();
      const reopened=(await state()).settings;
      report.reopenedMap=reopened.map;
      report.reopenedRules={minutes:Number(reopened['tdm-minutes']),kills:Number(reopened['tdm-kills']),
        analystsBots:Number(reopened['analysts-bots']),counterAnalystsBots:Number(reopened['counter-analysts-bots'])};
      for(const key of ['tdm-minutes','tdm-kills','analysts-bots','counter-analysts-bots','map','mode','friendly-fire','bot-difficulty','zombies','danceman'])
        await set(key,original[key]);
      assert.deepEqual((await state()).settings,original); report.restored=true;
      await leave();await until(async()=>(await health()).rooms===0,'Restored empty family room');
    }
    report.finalRooms=(await health()).rooms;
  } catch(error) {report.cleanupError=String(error.message).replaceAll(password,'[private]');}
  await browser.close();
  if(report.active&&(report.reopenedMap!==arena||JSON.stringify(report.reopenedRules)!==
    JSON.stringify({minutes:3,kills:10,analystsBots:2,counterAnalystsBots:3})))report.error||='The reopened family room lost its settings.';
  report.status=report.error||report.cleanupError?'FAIL':'PASS';await writeFile(join(out,'live.json'),JSON.stringify(report,null,2)+'\n');
}
console.log(JSON.stringify(report));if(report.status!=='PASS')process.exitCode=1;
