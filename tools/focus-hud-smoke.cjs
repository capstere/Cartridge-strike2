#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(path.join(__dirname,'../frontline/source/tools/dev/node_modules/playwright-core'));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
// The shipped animation loop synchronizes presentation before rendering every
// frame. This explicit-frame suite must do the same after throws and resize.
const draw=p=>p.evaluate(()=>{__fps.tactical.update(0);__fps.render();});
async function mode(page,value){await page.evaluate(value=>{__fps.settings.hudMode=value;__fps.focusHud.applyMode();__fps.render();},value);}
async function boot(browser,mobile){
 const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
   localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low'}));
   // Layout emulation must remain windowed: Chromium cannot resize its OS
   // window while fullscreen. Shipping fullscreen behavior is not modified.
   HTMLElement.prototype.requestFullscreen=undefined;
   HTMLCanvasElement.prototype.requestPointerLock=function(){Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>this});return Promise.resolve();};
   document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>null});
 });
 await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>globalThis.__fps||!document.getElementById('fatal').hidden,null,{timeout:180000});
 assert.equal(await page.locator('#fatal').isVisible(),false);
 await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
 await page.locator('#start').click();
 await page.evaluate(()=>{
   __fps.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false});
   const g=__fps.game;
   for(const a of g.actors)if(!a.isPlayer){a.alive=false;a.bot=null;}
   __fps.step(null,.02);
 });
 return {context,page,errors};
}
async function inspectButtons(page, center=true){
 const data=await page.evaluate(()=>{
   const buttons=[...document.querySelectorAll('#mobile-controls button')].filter(b=>b.getClientRects().length&&getComputedStyle(b).visibility!=='hidden');
   return {w:innerWidth,h:innerHeight,buttons:buttons.map(b=>{const r=b.getBoundingClientRect();return {id:b.id||b.dataset.mobileAction||b.dataset.utility||'aim',x:r.x,y:r.y,w:r.width,h:r.height};})};
 });
 for(const b of data.buttons){
   assert.ok(b.w>=44&&b.h>=44,'Touch target at least 44 CSS px: '+JSON.stringify(b));
   assert.ok(b.x>=0&&b.y>=0&&b.x+b.w<=data.w+.1&&b.y+b.h<=data.h+.1,'Control must remain on screen: '+JSON.stringify(b));
   if(center)assert.ok(!(b.x<data.w*.65&&b.x+b.w>data.w*.35&&b.y<data.h*.62&&b.y+b.h>data.h*.32),'Idle sight corridor is clear: '+JSON.stringify(b));
 }
 for(let i=0;i<data.buttons.length;i++)for(let j=i+1;j<data.buttons.length;j++){
   const a=data.buttons[i],b=data.buttons[j];
   assert.ok(!(a.x<b.x+b.w-.1&&a.x+a.w>b.x+.1&&a.y<b.y+b.h-.1&&a.y+a.h>b.y+.1),'Touch buttons must not overlap: '+JSON.stringify([a,b]));
 }
 return data;
}
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const browser=await chromium.launch({headless:true,args});
 try{
   const {context,page,errors}=await boot(browser,true);
   assert.equal(await page.evaluate(()=>document.documentElement.dataset.hud),'clean');
   await mode(page,'full');
   await page.screenshot({path:'test-results/hud-mobile-before.png',timeout:60000});
   const fullCount=(await page.locator('#mobile-controls button:visible').all()).length;
   await mode(page,'clean');
   const clean=await inspectButtons(page);
   assert.ok(clean.buttons.length<=8&&clean.buttons.length<fullCount,'Fewer persistent buttons: '+JSON.stringify({fullCount,clean}));
   for(const id of ['health','ammo','timer'])assert.ok(await page.locator('#'+id).isVisible(),id+' remains readable');
   for(const id of ['combat-session','difficulty-label','perf','objectives'])assert.equal(await page.locator('#'+id).isVisible(),false,id+' redundant in free Endless');
   assert.equal(await page.locator('[data-mobile-action=buy]').isVisible(),false);
   assert.equal(await page.locator('[data-mobile-action=reload]').isVisible(),false,'Full magazine needs no reload button');
   await page.screenshot({path:'test-results/hud-mobile-after.png',timeout:60000});
   await page.evaluate(()=>{__fps.game.item().ammo--;__fps.render();});
   assert.equal(await page.locator('[data-mobile-action=reload]').isVisible(),true,'Tactical reload remains accessible');
   await page.evaluate(()=>{__fps.game.item().ammo++;__fps.render();});

   await page.locator('#mobile-more').tap();
   assert.equal(await page.locator('#mobile-more').getAttribute('aria-expanded'),'true');
   for(const action of ['buy','grenade','sneak','drop'])assert.ok(await page.locator('[data-mobile-action='+action+']').isVisible(),action+' accessible under MER');
   await inspectButtons(page,false);
   await page.screenshot({path:'test-results/hud-mobile-utilities.png',timeout:60000});
   const original=await page.evaluate(()=>{window.__buyButton=document.querySelector('[data-mobile-action=buy]');return __fps.game.player.weapon;});
   await page.locator('[data-mobile-action=grenade]').tap();
   // Game.select has always imposed a 220ms weapon-switch cooldown. Advance
   // simulation beyond it, without modifying the cooldown or firing contract.
   await page.evaluate(()=>{for(let i=0;i<3;i++)__fps.step(null,.1);});
   const grenade=await page.evaluate(()=>__fps.game.player.weapon);
   assert.ok(['he','flash','smoke'].includes(grenade), 'Actual grenade selected from drawer');
   assert.notEqual(grenade,original);
   assert.equal(await page.locator('#mobile-utilities').isVisible(),false);
   assert.equal(await page.locator('[data-mobile-action=fire]').textContent(),'KASTA');
   assert.ok(await page.locator('[data-mobile-action=fire]').isVisible());
   const cdp=await context.newCDPSession(page),r=await page.locator('[data-mobile-action=fire]').boundingBox();
   const before=await page.evaluate(id=>__fps.game.player.inventory[id],grenade);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2,id:9}]});
   await page.evaluate(()=>__fps.step(null,1/60));
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.evaluate(id=>__fps.game.player.inventory[id],grenade),before-1,'One real grenade thrown');
   await draw(page);
   assert.equal(await page.locator('[data-mobile-action=fire]').isVisible(),false,'Auto-fire returns after throwing and re-equipping the firearm');

   await page.locator('#mobile-more').tap();
   await page.locator('[data-utility=karta]').tap();await draw(page);
   assert.ok(await page.locator('#hud .map-panel').isVisible(),'Map is reachable on mobile');
   await page.locator('#mobile-more').tap();await page.locator('[data-utility=karta]').tap();await draw(page);
   assert.equal(await page.locator('#hud .map-panel').isVisible(),false);

   await page.locator('#mobile-more').tap();
   const sr=await page.locator('[data-mobile-action=sneak]').boundingBox();
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sr.x+sr.width/2,y:sr.y+sr.height/2,id:12}]});
   assert.equal(await page.evaluate(()=>__fps.mobile.state.sneak),true,'Held original drawer control works');
   await page.evaluate(()=>__fps.focusHud.reset());
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
   assert.equal(await page.evaluate(()=>__fps.mobile.state.sneak),false,'Closing drawer cannot leave held input stuck');

   await page.locator('[data-mobile-action=pause]').tap();await draw(page);
   assert.ok(await page.locator('#pause .focus-session-summary').isVisible(),'Statistics remain available in pause');
   const selector=page.locator('#pause [data-setting=hudMode]');
   await selector.selectOption('full');
   assert.equal(await page.evaluate(()=>document.querySelector('[data-mobile-action=buy]')===window.__buyButton),true,'Full mode reuses same listener-bearing button');
   assert.equal(await page.evaluate(()=>window.__buyButton.parentElement.id),'mobile-controls');
   assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartridge-settings')).hudMode),'full');
   await selector.selectOption('clean');
   assert.equal(await page.evaluate(()=>window.__buyButton.parentElement.id),'mobile-utilities');
   await page.locator('#resume').tap();await draw(page);
   assert.equal(await page.locator('#mobile-utilities').isVisible(),false);

   for(const [w,h] of [[667,375],[390,844],[844,390]]){
     await page.setViewportSize({width:w,height:h});
     // Resize events clear WebGL's drawing buffer. Wait for the production
     // resize listener to settle, then explicitly paint the new viewport.
     await page.waitForFunction(()=>Math.abs(__fps.renderer.camera.aspect-innerWidth/innerHeight)<.0001,null,{polling:50,timeout:10000});
     await draw(page);
     await inspectButtons(page);
     for(const id of ['health','ammo'])assert.ok(await page.locator('#'+id).isVisible());
     await page.screenshot({path:`test-results/hud-mobile-${w}x${h}.png`,timeout:60000});
   }
   assert.deepEqual(errors,[]);assert.equal(await page.locator('#fatal').isVisible(),false);
   console.log('FOCUS MOBILE PASS',JSON.stringify({fullCount,cleanCount:clean.buttons.length,viewports:['844x390','667x375','390x844']}));
   await context.close();

   const desktop=await boot(browser,false),d=desktop.page;
   await mode(d,'full');await d.screenshot({path:'test-results/hud-desktop-before.png',timeout:60000});
   await mode(d,'clean');await d.screenshot({path:'test-results/hud-desktop-after.png',timeout:60000});
   assert.equal(await d.locator('#combat-session').isVisible(),false);
   assert.equal(await d.locator('#perf').isVisible(),false);
   assert.equal(await d.locator('.key-hints').isVisible(),false);
   for(const id of ['health','ammo','timer','minimap'])assert.ok(await d.locator('#'+id).isVisible());
   await d.keyboard.press('m');await draw(d);
   assert.equal(await d.evaluate(()=>document.documentElement.classList.contains('hud-map-open')),true);
   await d.keyboard.press('m');await draw(d);
   await d.evaluate(()=>{__fps.start('analysts',{mode:'classic',buyTime:0,wanderers:false,botFire:false});__fps.step(null,.02);});
   assert.ok(await d.locator('#objectives').isVisible(),'Real bomb/hostage objectives are not removed');
   await d.screenshot({path:'test-results/hud-desktop-classic.png',timeout:60000});
   await mode(d,'full');
   assert.ok(await d.locator('#perf').isVisible(),'Full HUD restores diagnostics');
   assert.ok(await d.locator('.key-hints').isVisible(),'Full HUD restores hints');
   assert.equal(await d.locator('#mobile-more').count(),0,'No touch drawer on desktop');
   assert.deepEqual(desktop.errors,[]);assert.equal(await d.locator('#fatal').isVisible(),false);
   console.log('FOCUS DESKTOP PASS: clean/full, essentials, map key, objectives, no touch controls');
   await desktop.context.close();
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
