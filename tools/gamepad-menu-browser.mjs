// A simulated standard pad drives the public menu and running game through navigator.getGamepads.
import assert from 'node:assert/strict';
import {writeFile,mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const base=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',native=process.env.CHROMIUM_PATH,output=process.env.CS3_MOBILE_EVIDENCE;
const browser=await chromium.launch({executablePath:native,channel:native?undefined:'chromium',headless:process.env.FPS_NETWORK_HEADED!=='1',
  args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:['--enable-unsafe-swiftshader']});
try{
 const p=await browser.newPage({viewport:{width:1024,height:600},reducedMotion:'reduce'});p.setDefaultTimeout(90000);
 const phase=label=>console.log(new Date().toISOString(),label);
 const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
   if(!localStorage.getItem('cartridge-settings'))localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,reducedMotion:true}));
   const pad=window.testPad={id:'Standard test controller',mapping:'standard',connected:true,axes:[0,0,0,0],buttons:Array.from({length:17},()=>({value:0,pressed:false}))};
   Object.defineProperty(navigator,'getGamepads',{value:()=>[pad.connected?pad:null]});
 });
 const frames=()=>p.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))));
 const hold=(i,value)=>p.evaluate(([i,value])=>{Object.assign(testPad.buttons[i],{value,pressed:value>.5});},[i,value]);
 const tap=async i=>{await hold(i,1);await frames();await hold(i,0);await frames();};
 phase('Opening the game');await p.goto(base+'/fps/?test=1&realtime=1');await p.waitForFunction(()=>!!window.__fps);
 await tap(13);const first=await p.evaluate(()=>document.activeElement.textContent.trim());
 await tap(15);const second=await p.evaluate(()=>document.activeElement.textContent.trim());assert(first&&second&&second!==first);
 // Set initial focus as a keyboard player can, then activate with A. Normal route handles the action.
 const go=async name=>{await p.locator('[data-go="'+name+'"]:visible').first().focus();await tap(0);};
 phase('Checking Options and Back');await go('options');await p.locator('#menu[data-screen=options]').waitFor();
 const autoFire=p.locator('#menu-settings [data-setting=mobileAutoFire]'),touchMode=p.locator('#menu-settings [data-setting=touchMode]');
 assert.equal(await autoFire.count(),0);
 await touchMode.selectOption('on');assert.equal(await autoFire.count(),1);
 await touchMode.selectOption('auto');assert.equal(await autoFire.count(),0);
 assert(await touchMode.evaluate(el=>el===document.activeElement));
 const profile=p.locator('#menu-settings [data-setting=touchStick]');await profile.focus();
 assert.equal(await profile.inputValue(),'floating');await tap(15);assert.equal(await profile.inputValue(),'fixed');
 await tap(14);assert.equal(await profile.inputValue(),'floating');await tap(1);await p.locator('#menu[data-screen=main]').waitFor();
 phase('Opening Solo');await go('play');await go('solo');await p.locator('#lb-mode-seg [data-value=endless]').click();
 await p.locator('.map-tile').click();await p.locator('#choose-meltem').click();
 await p.waitForFunction(()=>!!window.__fps&&document.getElementById('loading').hidden&&!document.getElementById('start').disabled);
 await frames();
 const mode=p.locator('#game-mode');assert.equal(await mode.inputValue(),'endless');
 assert(await mode.locator('option[value=classic]').isDisabled());
 const soloFocus=[];
 for(const direction of [13,13,15,12,14,13,15]){
   await tap(direction);soloFocus.push(await p.evaluate(()=>document.activeElement.id||document.activeElement.getAttribute('class')));
 }
 assert(!soloFocus.includes('game-mode'),'The transparent backing select must never win controller focus');
 assert.equal(await mode.inputValue(),'endless');
 await p.locator('#start').focus();assert.equal(await p.evaluate(()=>document.activeElement.id),'start');
 phase('Starting Meltem with A');await tap(0);await p.locator('#hud').waitFor();
 await p.waitForFunction(()=>!__fps.modal&&!__fps.game.warmupRemaining&&__fps.game.phase==='active');
 const state=()=>p.evaluate(()=>{const a=__fps.game.player;return {x:a.x,z:a.z,weight:a.rushWeight,yaw:a.yaw,ammo:__fps.game.item(a).ammo,time:__fps.game.state.time,modal:__fps.modal};});
 phase('Checking stick and trigger');const before=await state();await p.evaluate(()=>{testPad.axes[1]=-1;testPad.axes[2]=.35;});await tap(10);
 await p.waitForFunction(()=>__fps.game.player.rushWeight>.3);const running=await state();
 assert(Math.hypot(before.x-running.x,before.z-running.z)>.05);assert(Math.abs(before.yaw-running.yaw)>.002);
 await p.evaluate(()=>testPad.axes.fill(0));await tap(7);await p.waitForFunction(ammo=>__fps.game.item(__fps.game.player).ammo<ammo,before.ammo);const shot=await state();
 phase('Checking pause and reconnect');await tap(9);await p.waitForFunction(()=>__fps.modal==='pause');await tap(9);await p.waitForFunction(()=>!__fps.modal);
 await p.evaluate(()=>{testPad.connected=false;});await frames();await hold(7,1);await p.evaluate(()=>{testPad.connected=true;});await frames();
 const reconnected=await state();assert.equal(reconnected.ammo,shot.ammo);await hold(7,0);
 // Stall the real selected-level request and exercise the action overlay before a renderer exists.
 let request;
 await p.route('**/levels/manifest.json',r=>{request=r;});
 await p.goto(base+'/fps/?test=1&level=synthetic-demo&loadTimeout=3',{waitUntil:'domcontentloaded'});
 await p.waitForFunction(()=>!!window.__csFlow);
 await p.waitForFunction(()=>document.getElementById('loading').dataset.stage==='level');
 await frames();assert.equal(await p.evaluate(()=>!!window.__fps),false);
 const start=p.locator('#start');
 const openLoading=async()=>{await start.focus();await tap(0);await p.locator('#csl-cancel').waitFor({timeout:2000});};
 phase('Checking controller Cancel before the renderer is ready');
 await openLoading();await tap(13);
 assert.equal(await p.evaluate(()=>document.activeElement.id),'csl-cancel');await tap(0);
 await p.locator('#cs-loading').waitFor({state:'hidden',timeout:3000});
 await openLoading();await tap(1);await p.locator('#cs-loading').waitFor({state:'hidden',timeout:3000});
 phase('Checking failed loading Back and Retry');
 await openLoading();await p.locator('#csl-retry').waitFor({timeout:9000});await tap(1);
 await p.locator('#cs-loading').waitFor({state:'hidden',timeout:3000});
 await openLoading();await p.locator('#csl-retry').waitFor({timeout:9000});
 assert.equal(await p.evaluate(()=>document.activeElement.id),'csl-retry');
 assert(request,'The selected-level request was held');
 const reloaded=p.waitForEvent('framenavigated',f=>f===p.mainFrame());
 await hold(0,1);await reloaded;await p.waitForFunction(()=>!!window.__csFlow?.flow.active);
 await tap(1);await p.locator('#cs-loading').waitFor({state:'hidden',timeout:3000});
 const loadingActions=['Cancel with A','Cancel with B','Back after timeout','Retry with A and automatic launch'];
 const sample={loadingActions,soloFocus,device:'Simulated standard Gamepad API controller',focus:[first,second],before,running,shot,reconnected,errors};
 assert.deepEqual(errors,[]);if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'gamepad.json'),JSON.stringify(sample,null,2)+'\n');}
 console.log(JSON.stringify(sample));
}finally{await browser.close();}
