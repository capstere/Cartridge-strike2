// Ordinary entry on a loopback server. One GPU-rendered player and a real SDK peer.
// Record the HUD, actual Web Audio buffer starts and the server's independent pose.
import assert from 'node:assert/strict';
import {execFileSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {tmpdir} from 'node:os';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {createHash} from 'node:crypto';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {ready,own,options,until,delay} from '../server/test/helpers.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';

const output=process.env.CS3_COUNTDOWN_EVIDENCE;
if(output)await mkdir(output,{recursive:true});
const server=await createLocalServer({port:0});
const requested=process.env.CS3_COUNTDOWN_CASE||'both';
assert(['both','solo','private'].includes(requested));
const native=process.env.CHROMIUM_PATH;
const browser=await chromium.launch({headless:process.env.FPS_NETWORK_HEADED!=='1',
 executablePath:native,channel:native?undefined:'chromium',args:[
  ...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[]),'--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),
  '--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const report={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),
 buildHash:CONTRACT.buildHash,manifestHash:createHash('sha256').update(await readFile('build-info.json')).digest('hex'),
 startedAt:new Date().toISOString(),browser:browser.version(),touchExposure:'Chromium touch emulation',scenarios:[]};
const errors=[],cleanupErrors=[];
async function cleanup(label,close){
 try{await close();}catch(error){cleanupErrors.push(label+': '+error.message);}
}
const marks=['5','4','3','2','1','Move out!'];

function observe(){
 const chunks=new WeakMap(),buffers=new WeakMap();
 const trace={loaded:[],sounds:[],stages:[],fade:[]};window.countdownReceipt=trace;
 const arrayBuffer=Response.prototype.arrayBuffer;
 Response.prototype.arrayBuffer=async function(...args){
  const bytes=await arrayBuffer.apply(this,args);
  const clip=this.url.match(/riposte-(ui_tick|r_beep-1|st_start)\.mp3$/);
  if(clip)chunks.set(bytes,clip[1]);return bytes;
 };
 const decode=BaseAudioContext.prototype.decodeAudioData;
 BaseAudioContext.prototype.decodeAudioData=async function(bytes,...args){
  const name=chunks.get(bytes),decoded=await decode.call(this,bytes,...args);
  if(name){buffers.set(decoded,name);trace.loaded.push(name);}return decoded;
 };
 const start=AudioBufferSourceNode.prototype.start;
 AudioBufferSourceNode.prototype.start=function(...args){
  const name=buffers.get(this.buffer);
  if(name)trace.sounds.push({name,rate:this.playbackRate.value,at:Math.round(performance.now())});
  return start.apply(this,args);
 };
 addEventListener('DOMContentLoaded',()=>{
  const root=document.querySelector('#deployment-countdown');
  if(!root)return;
  const inspect=()=>{
   const number=root.querySelector('strong'),text=root.hidden?'':number.textContent;
   if(!text||trace.stages.at(-1)?.text===text)return;
   if(text==='Move out!'){
    const start=performance.now();
    function fade(now){
     const age=Math.round(now-start);
     if(root.hidden || number.textContent!=='Move out!')return;
     if(!trace.fade.length || age-trace.fade.at(-1).age>=190)trace.fade.push({age,opacity:Number(getComputedStyle(number).opacity)});
     requestAnimationFrame(fade);
    }
    requestAnimationFrame(fade);
   }
   const rect=id=>{const r=document.querySelector(id).getBoundingClientRect();return [r.x,r.y,r.width,r.height].map(Math.round);};
   trace.stages.push({text,at:Math.round(performance.now()),color:getComputedStyle(number).color,
    animation:getComputedStyle(number).animationName,timer:document.querySelector('#timer').textContent,
    score:[document.querySelector('#score-a').textContent,document.querySelector('#score-ca').textContent],
    minimap:rect('#minimap'),scoreboard:rect('.top-hud'),more:document.querySelector('#mobile-more')?rect('#mobile-more'):null,phase:document.querySelector('#hud').dataset.matchPhase||null});
   window.recordCountdownStage(trace.stages.at(-1)).catch(()=>{});
  };
  new MutationObserver(inspect).observe(root,{subtree:true,childList:true,attributes:true,attributeFilter:['hidden','data-stage']});
 });
}
async function desktopTab(){
 // Playwright's emulated focus in an incognito window can keep document.hidden
 // false even when another window covers it. This is a real, fresh tab strip.
 const profile=await mkdtemp(join(tmpdir(),'cs3-countdown-chromium-'));
 const child=spawn(native||chromium.executablePath(),['--remote-debugging-port=0','--user-data-dir='+profile,
  '--no-first-run','--no-default-browser-check','--disable-dev-shm-usage','--lang=sv-SE',
  '--no-sandbox','--disable-extensions','--disable-component-update','--disable-background-networking','--password-store=basic',
  '--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--enable-unsafe-swiftshader',
  ...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[]),
  ...(process.env.FPS_NETWORK_HEADED==='1'?[]:['--headless=new']),'about:blank'],{stdio:'ignore'});
 let remote;
 async function close(){
  try{if(remote)await remote.close();}
  finally{
   if(child.exitCode===null&&child.signalCode===null){const exit=once(child,'exit');child.kill('SIGTERM');await exit;}
   await rm(profile,{recursive:true,force:true,maxRetries:3,retryDelay:100});
  }
 }
 try{
  let port;
  for(let i=0;i<100&&!port;i++){
   port=await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
   if(!port)await delay(100);
  }
  assert(port,'local native CDP tab is ready');
  remote=await chromium.connectOverCDP('http://127.0.0.1:'+port.split('\n')[0],{noDefaults:true});
  const context=remote.contexts()[0],page=context.pages()[0];
  await page.bringToFront();
  await page.setViewportSize({width:1000,height:600});
  const cdp=await context.newCDPSession(page);
  await cdp.send('Emulation.setUserAgentOverride',{userAgent:await page.evaluate(()=>navigator.userAgent),acceptLanguage:'sv-SE'});
  await cdp.send('Emulation.setLocaleOverride',{locale:'sv-SE'});
  await cdp.detach();
  return {context,page,close};
 }catch(error){await cleanup('Desktop startup',close);throw error;}
}
async function open(touch){
 const tab=touch?null:await desktopTab();
 const context=tab?.context||await browser.newContext({viewport:touch?{width:844,height:390}:{width:1000,height:600},
  deviceScaleFactor:1,isMobile:touch,hasTouch:touch,reducedMotion:touch?'reduce':'no-preference',locale:touch?'fr-FR':'sv-SE'});
 const close=tab?.close||(()=>context.close());
 try{
 await context.addInitScript(observe);
 await context.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.35,ambient:false,mobileAutoFire:false})));
 const page=tab?.page||await context.newPage();page.setDefaultTimeout(80000);
 page.countdownDiagnostics={stages:[]};
 await page.exposeFunction('recordCountdownStage',stage=>page.countdownDiagnostics.stages.push(stage));
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.url+'/',{waitUntil:'domcontentloaded'});
 await page.locator('#home-title').waitFor();
 await page.locator('[data-go=play]:visible').click();
 assert.equal(await page.evaluate(()=>typeof window.__fps),'undefined');
 assert.equal(await page.locator('html').getAttribute('lang'),'en');
 assert.equal(await page.evaluate(()=>navigator.language),touch?'fr-FR':'sv-SE');
 return {context,page,close};
 }catch(error){await cleanup('Open context',close);throw error;}
}
const stage=(page,text)=>page.locator('#deployment-countdown:visible strong').filter({hasText:new RegExp('^'+text+'$')}).waitFor({timeout:15000});
async function shot(page,name){
 if(output)await page.screenshot({path:join(output,name+'.jpg'),quality:78,timeout:15000});
}
function verify(trace,timer,reduced){
 assert.deepEqual(trace.stages.map(s=>s.text),marks);
 for(const [i,s] of trace.stages.entries()){
  assert.deepEqual(s.score,['0','0']);
  if(i<5){
   assert.equal(s.timer,timer);
   assert.equal(s.color,i>=2?'rgb(255, 208, 103)':'rgb(248, 244, 233)');
   assert(s.minimap[2]>20&&s.minimap[3]>20,'minimap visible throughout deployment');
   assert.deepEqual(s.minimap,trace.stages[0].minimap);
   assert.deepEqual(s.scoreboard,trace.stages[0].scoreboard);
   if(s.more && s.more[2]>0)assert(s.more[1]>=s.minimap[1]+s.minimap[3],'touch controls leave the map legible');
  }
  if(reduced)assert.equal(s.animation,'none');
 }
 if(reduced)assert(trace.fade.every(f=>f.opacity===1),'static reduced-motion release');
 else assert(trace.fade.some(f=>f.opacity<.8),'the normal launch cue visibly fades');
 assert.deepEqual(trace.sounds.map(s=>s.name),['ui_tick','ui_tick','r_beep-1','r_beep-1','r_beep-1','st_start'],'exactly six corresponding decoded clips');
 trace.audioMinusDisplayMs=trace.sounds.map((sound,i)=>sound.at-trace.stages[i].at);
 assert(trace.audioMinusDisplayMs.every(ms=>Math.abs(ms)<=175),'decoded cue and displayed mark must share their frame: '+trace.audioMinusDisplayMs);
 const duration=trace.stages.at(-1).at-trace.stages[0].at;
 assert(duration>=4000&&duration<6200,'five-second live countdown, measured '+duration+' ms');
}
async function mapFingerprint(page){
 const bytes=await page.locator('#minimap').evaluate(c=>c.toDataURL());
 return createHash('sha256').update(bytes).digest('hex');
}
async function turnTouch(page){
 const cdp=await page.context().newCDPSession(page);
 try{
  const {x,y}=await page.locator('[data-mobile-look]').evaluate(el=>{
   const r=el.getBoundingClientRect();
   for(const fy of [.4,.5,.3,.6])for(const fx of [.23,.35,.14,.45]){
    const x=r.x+r.width*fx,y=r.y+r.height*fy;
    if(document.elementFromPoint(x,y)===el)return {x,y};
   }
   throw Error('No unobstructed touch-look point.');
  });
  for(const [type,offset] of [['touchStart',0],['touchMove',35],['touchMove',75],['touchMove',120],['touchEnd',0]]){
   await cdp.send('Input.dispatchTouchEvent',{type,touchPoints:type==='touchEnd'?[]:[{x:x+offset,y,id:1}]});
  }
 }finally{await cdp.detach();}
}
async function solo(){
 const {page,context}=await open(true);
 try{
  await page.locator('[data-go=solo]:visible').tap();
  await page.locator('#start').tap();
  await page.locator('#csl-deploy').tap();
  await page.locator('#hud').waitFor({timeout:120000});
  page.setDefaultTimeout(12000);
  await stage(page,'5');await shot(page,'solo-five');
  const headingBefore=await mapFingerprint(page);await turnTouch(page);
  await page.locator('[data-mobile-action=fire]').tap();
  assert(await page.locator('#buy').isHidden());
  await stage(page,'3');await shot(page,'solo-three');
  const headingAfter=await mapFingerprint(page);assert.notEqual(headingBefore,headingAfter,'touch drag turns the heading on the live minimap');
  await stage(page,'Move out!');await shot(page,'solo-release');
  await page.locator('#deployment-countdown').waitFor({state:'hidden'});
  const trace=await page.evaluate(()=>window.countdownReceipt);
  verify(trace,'0:15',true);
  if(await page.locator('[data-mobile-action=buy]').isHidden())await page.locator('#mobile-more').tap();
  await page.locator('[data-mobile-action=buy]').tap();
  await page.locator('#buy').waitFor();
  report.scenarios.push({entry:'Solo Classic',locale:'fr-FR',viewport:page.viewportSize(),touchDrag:true,headingBefore,headingAfter,buyOpenAfterRelease:true,...trace});
 }catch(e){report.failureTrace=await page.evaluate(()=>window.countdownReceipt).catch(()=>page.countdownDiagnostics);await shot(page,'solo-failure').catch(()=>{});throw e;}
 finally{await cleanup('Solo context',()=>context.close());}
}
async function privateMatch(){
 const {page,context,close}=await open(false);let guest,late;
 try{
  await page.locator('[data-go=friends]').click();await page.locator('[data-lan-link]').click();
  await page.locator('#network-name').fill('Countdown host');await page.locator('#network-code').fill(options.code);
  await page.locator('#network-map').selectOption('compact-arena');await page.locator('#network-fill-bots').uncheck();
  await page.locator('[data-create=true]').click();await page.locator('#room-ready').waitFor();
  const room=[...server.rooms][0],client=new Client(server.url,{headers:{Origin:server.url}});
  guest=await ready(await client.joinById(room.roomId,{...options,name:'Countdown guest',team:'counterAnalysts'}));
  guest.onMessage('notice',()=>{});
  guest.send('match',{kind:'ready',matchId:guest.state.matchId,controlEpoch:own(guest).controlEpoch,ready:true});
  await page.locator('#room-ready').click();
  await page.waitForFunction(()=>window.countdownReceipt.loaded.length===3);
  let release;
  const ordinaryTick=room.sim.tick;
  room.sim.tick=function(...args){
   const events=ordinaryTick.apply(this,args);
   if(!release&&room.state.phase==='active')release={tick:this.tickNumber,simulationTime:this.game.state.time};
   return events;
  };
  await page.locator('#room-start').click();page.setDefaultTimeout(12000);await stage(page,'5');
  await page.locator('#countdown-look').click();await page.waitForFunction(()=>document.pointerLockElement?.id==='game');
  const host=[...room.seats.values()].find(s=>s.client.sessionId!==guest.sessionId).actor;
  const pose=()=>[host.x,host.y,host.z,room.sim.game.item(host).ammo,room.sim.game.state.time];
  const initial=pose();
  await shot(page,'private-five');const headingBefore=await mapFingerprint(page);
  await page.keyboard.down('ArrowLeft');await page.keyboard.down('w');await page.mouse.down();
  await stage(page,'3');await shot(page,'private-three');
  const headingAfter=await mapFingerprint(page);assert.notEqual(headingBefore,headingAfter,'keyboard input turns the live minimap during the hold');
  await page.keyboard.up('ArrowLeft');await page.keyboard.up('w');await page.mouse.up();
  assert.deepEqual(pose(),initial);assert.equal(room.state.phase,'countdown');
  await stage(page,'Move out!');await shot(page,'private-release');
  const shield=page.locator('#spawn-protection');await shield.waitFor({timeout:1400});
  assert.equal(await shield.textContent(),'SPAWN PROTECTION');
  assert.equal(await shield.getAttribute('title'),'SPAWN PROTECTION · Firing ends protection');
  await page.locator('#deployment-countdown').waitFor({state:'hidden'});
  const trace=await page.evaluate(()=>window.countdownReceipt);verify(trace,'10:00',false);
  assert.equal(guest.state.phase,'active');assert.equal(guest.state.matchId,room.state.matchId);
  assert.equal(release.simulationTime,room.sim.game.config.fixedStep);
  const observedAfterFadeTick=guest.state.tick,ammo=room.sim.game.item(host).ammo;
  await page.mouse.down();await until(()=>room.sim.game.item(host).ammo<ammo,'ordinary shot after the start tick');await page.mouse.up();
  late=await ready(await client.joinById(room.roomId,{...options,name:'Late seat',team:'analysts'}));
  late.onMessage('notice',()=>{});assert.equal(late.state.phase,'active');
  const cover=await context.newPage();await cover.bringToFront();
  await page.waitForFunction(()=>document.hidden,null,{polling:50});
  await delay(1250);await page.bringToFront();await page.locator('#resume').click();await cover.close();
  assert(await page.locator('#deployment-countdown').isHidden());
  assert.equal(await page.evaluate(()=>countdownReceipt.sounds.length),6);
  // Leave and re-enter the same active room through the regular join form.
  await page.keyboard.press('Escape');await page.locator('#restart').click();
  await page.locator('#network-code').fill(options.code);await page.locator('#network-room').fill(room.roomId);
  await page.locator('[data-create=false]').click();await page.locator('#resume').click();
  await delay(1400);assert(await page.locator('#deployment-countdown').isHidden());
  assert.equal(await page.evaluate(()=>countdownReceipt.sounds.length),6);
  assert.equal(await page.evaluate(()=>countdownReceipt.stages.length),6);
  // Start a separate ordinary room and return while *its* countdown is still
  // running. Only the forthcoming 1 and launch may sound after the return.
  await page.keyboard.press('Escape');await page.locator('#restart').click();
  await page.locator('#network-room').fill('');await page.locator('#network-code').fill(options.code);
  await page.locator('#network-fill-bots').check();await page.locator('#network-map').selectOption('compact-arena');
  await page.locator('[data-create=true]').click();await page.locator('#room-ready').click();
  const next=[...server.rooms].find(r=>r!==room);
  await page.locator('#room-start').click();await stage(page,'5');
  const away=await context.newPage();await away.bringToFront();
  await page.waitForFunction(()=>document.hidden,null,{polling:50});
  await until(()=>next.state.phase==='countdown'&&next.state.remainingSeconds<=1.85,'return during digit 2');
  await page.bringToFront();await page.locator('#resume').click();await stage(page,'2');
  await stage(page,'Move out!');await page.locator('#deployment-countdown').waitFor({state:'hidden'});
  await away.close();
  const resumed=await page.evaluate(()=>window.countdownReceipt);
  const resumedMarks=resumed.stages.slice(6).map(s=>s.text),resumedSounds=resumed.sounds.slice(6).map(s=>s.name);
  assert.deepEqual(resumedMarks,['5','2','1','Move out!']);
  assert.deepEqual(resumedSounds,['ui_tick','r_beep-1','st_start']);
  report.scenarios.push({entry:'Private TDM',locale:'sv-SE',viewport:page.viewportSize(),map:room.state.mapId,firstActiveTick:release.tick,firstActiveSimulationSeconds:release.simulationTime,observedAfterFadeTick,
   startingPose:initial,headingBefore,headingAfter,englishLiveShield:true,stationaryAtThree:true,actualShot:true,thirdSeatJoinedActive:true,foregroundRestored:true,
   renderedLateJoin:true,returnedDuringCountdown:{marks:resumedMarks,sounds:resumedSounds},...trace});
 }catch(e){report.failureTrace=await page.evaluate(()=>window.countdownReceipt).catch(()=>page.countdownDiagnostics);await shot(page,'private-failure').catch(()=>{});throw e;}
 finally{if(late)await late.leave().catch(()=>{});if(guest)await guest.leave().catch(()=>{});await cleanup('Private context',close);}
}
try{
 if(requested!=='private'){
  await solo();
  if(output)await writeFile(join(output,'solo.json'),JSON.stringify({...report,status:'PASS'},null,2)+'\n');
 }
 await browser.close();
 if(requested!=='solo'){
  await privateMatch();
  if(output)await writeFile(join(output,'private.json'),JSON.stringify({...report,scenarios:report.scenarios.slice(-1),status:'PASS'},null,2)+'\n');
 }
 assert.deepEqual(errors,[]);report.status='PASS';
}catch(error){report.status='FAIL';report.error=error.stack;process.exitCode=1;}
finally{
 await cleanup('Chromium',()=>browser.close());await cleanup('Loopback server',()=>server.close());
 if(cleanupErrors.length){report.cleanupErrors=cleanupErrors;report.status='FAIL';process.exitCode=1;}
 report.finishedAt=new Date().toISOString();
 if(output)await writeFile(join(output,'countdown.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify(report));
}
