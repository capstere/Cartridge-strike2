#!/usr/bin/env node
const assert = require('node:assert/strict');
const path = require('node:path');
const fs = require('node:fs');
const {chromium} = require(path.join(__dirname,'../frontline/source/tools/dev/node_modules/playwright-core'));
const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const args = ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];

async function boot(browser, mobile) {
  const context = await browser.newContext({viewport:{width:844,height:390},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  const page = await context.newPage(), errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(() => {
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low'}));
    HTMLCanvasElement.prototype.requestPointerLock=function(){
      Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>this});
      return Promise.resolve();
    };
    document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>null});
  });
  await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>globalThis.__fps||!document.getElementById('fatal').hidden,null,{timeout:180000});
  assert.equal(await page.locator('#fatal').isVisible(),false,'Startup error');
  // This suite advances and draws explicit game frames. Avoid queuing a second
  // WebGL draw loop while SwiftShader captures the scoped viewport.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#start').click();
  await page.evaluate(()=>{
    __fps.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false});
    const g=__fps.game;
    for(const a of g.actors)if(!a.isPlayer){a.alive=false;a.bot=null;}
    __fps.step(null,.02);
  });
  await page.waitForTimeout(80);
  return {context,page,errors};
}
const advance = (page, n=6) => page.evaluate(n=>{for(let i=0;i<n;i++)__fps.step(null,.1);},n);
const equip = (page,id) => page.evaluate(id=>{
  const g=__fps.game,p=g.player;
  if(id==='he'){p.inventory.he=1;g.select('he');}
  else {p.inventory.primary=g.weaponItem(id);g.select(id);}
  __fps.step(null,.1);
},id);

(async()=>{
  const browser=await chromium.launch({headless:true,args});
  try {
    const {context,page,errors}=await boot(browser,true);
    assert.equal(await page.locator('[data-tactical-aim]').isVisible(),true);
    await equip(page,'sniper');
    assert.equal(await page.evaluate(()=>__fps.renderer.camera.fov),76);
    await page.locator('[data-tactical-aim]').tap();
    await advance(page);
    const scoped=await page.evaluate(()=>({fov:__fps.renderer.camera.fov,aim:__fps.game.player.aimAmount,
      hidden:document.getElementById('precision-scope').hidden,gun:__fps.renderer.weaponModel.visible}));
    assert.ok(scoped.fov<25&&scoped.aim>.95,'Sniper actually zooms: '+JSON.stringify(scoped));
    assert.equal(scoped.hidden,false);assert.equal(scoped.gun,false);
    fs.mkdirSync('test-results',{recursive:true});
    await page.screenshot({path:'test-results/precision-mobile-scope.png',animations:'disabled',timeout:60000});
    await page.locator('[data-tactical-aim]').tap();await advance(page);
    assert.ok(await page.evaluate(()=>__fps.renderer.camera.fov>75));
    assert.equal(await page.locator('#precision-scope').isVisible(),false);

    // Send real touch events with explicit timestamps: a slow software GPU must
    // not turn a 180ms user gesture into several seconds of test transport time.
    const cdp=await context.newCDPSession(page);
    const hit=await page.evaluate(()=>{
      window.__tapTrace=[];
      const z=document.querySelector('[data-mobile-look]');
      for(const type of ['pointerdown','pointerup','pointercancel','lostpointercapture'])z.addEventListener(type,e=>{
        window.__tapTrace.push({type:e.type,id:e.pointerId,at:e.timeStamp,wanted:__fps.tactical.wanted});
      });
      return document.elementFromPoint(505,90)?.className;
    });
    assert.equal(hit,'mobile-look-zone','Double-tap test targets the look surface');
    const at=Date.now()/1000;
    for(let i=0;i<2;i++){
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',timestamp:at+i*.14,touchPoints:[{x:505,y:90,id:50+i}]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',timestamp:at+i*.14+.04,touchPoints:[]});
    }
    await advance(page);
    const doubleTap=await page.evaluate(()=>({wanted:__fps.tactical.wanted,trace:window.__tapTrace}));
    console.log('DOUBLE TAP TRACE',JSON.stringify(doubleTap));
    assert.equal(doubleTap.wanted,true,'Double tap enters aim: '+JSON.stringify(doubleTap));
    await page.locator('[data-mobile-action=pause]').tap();
    assert.equal(await page.locator('#precision-scope').isVisible(),false,'Pause removes scope');
    await page.locator('#resume').tap();
    assert.equal(await page.evaluate(()=>__fps.tactical.wanted),false,'Resume does not leave zoom latched');

    await equip(page,'smg');
    const reloading=await page.evaluate(()=>{
      const g=__fps.game,p=g.player,item=g.item(p);item.ammo=0;item.reserve=60;
      __fps.settings.autoReload=true;__fps.tactical.reload.reset();
      for(let i=0;i<5;i++)__fps.step(null,.1);
      return {until:p.reloadUntil,time:g.state.time};
    });
    assert.ok(reloading.until>reloading.time,'Empty magazine starts real reload');
    await advance(page,25);
    assert.deepEqual(await page.evaluate(()=>({ammo:__fps.game.item().ammo,reserve:__fps.game.item().reserve})),{ammo:30,reserve:30});
    const off=await page.evaluate(()=>{
      __fps.settings.autoReload=false;const g=__fps.game;g.item().ammo=0;
      for(let i=0;i<6;i++)__fps.step(null,.1);
      return g.player.reloadUntil;
    });
    assert.equal(off,0,'User can disable automatic reload');

    await equip(page,'he');await advance(page,3);
    const trigger=page.locator('[data-mobile-action=fire]');
    assert.equal(await trigger.isVisible(),true,'Grenade has manual trigger in auto-fire mode');
    assert.equal(await trigger.textContent(),'KASTA');
    const rect=await trigger.boundingBox();
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:rect.x+rect.width/2,y:rect.y+rect.height/2,id:70}]});
    const threw=await page.evaluate(()=>{__fps.step(null,1/60);return {n:__fps.game.player.inventory.he,grenades:__fps.game.state.grenades.length};});
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
    assert.equal(threw.n,0);assert.equal(threw.grenades,1,'Manual touch produced one real grenade');
    await equip(page,'bazooka');await advance(page,2);
    assert.equal(await trigger.isVisible(),true);assert.equal(await trigger.textContent(),'AVFYRA');
    assert.equal(await page.locator('[data-tactical-aim]').isVisible(),false,'No meaningless rocket scope');
    await equip(page,'smg');await advance(page,2);
    assert.equal(await trigger.isVisible(),false,'Automatic trigger returns for firearms');
    const first=await page.evaluate(()=>__fps.game.player.weapon);
    await page.locator('[data-mobile-action=weapon]').tap();await advance(page,2);
    const second=await page.evaluate(()=>__fps.game.player.weapon);
    assert.notEqual(first,second,'Touch weapon selector cycles inventory');
    await page.locator('[data-mobile-action=pause]').tap();
    assert.ok(await page.locator('#pause [data-setting=mobileAimAssist]').isVisible());
    await page.locator('#pause [data-setting=mobileAimAssist]').uncheck();
    assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartridge-settings')).mobileAimAssist),false);
    await page.locator('#resume').tap();
    assert.equal(await page.locator('#fatal').isVisible(),false);assert.deepEqual(errors,[]);
    console.log('PRECISION MOBILE PASS: smooth scoped FOV, double tap, pause reset, real empty-mag reload, manual grenade, rocket, weapon cycling, settings persistence');
    await context.close();

    const desktop=await boot(browser,false),d=desktop.page;
    await equip(d,'cr4');await advance(d,2);
    await d.evaluate(()=>{
      Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>document.getElementById('game')});
      document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:2,bubbles:true}));
    });
    await advance(d);
    assert.ok(await d.evaluate(()=>__fps.renderer.camera.fov<53),'Desktop right button enters precision');
    await d.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:2,bubbles:true})));await advance(d);
    assert.ok(await d.evaluate(()=>__fps.renderer.camera.fov>75),'Desktop release exits precision');
    await d.keyboard.press('f');await advance(d);
    assert.equal(await d.evaluate(()=>__fps.tactical.wanted),true,'F toggles aim');
    await d.keyboard.press('Escape');
    assert.equal(await d.evaluate(()=>__fps.tactical.wanted),false,'Escape clears aim');
    assert.equal(await d.locator('#fatal').isVisible(),false);assert.deepEqual(desktop.errors,[]);
    console.log('PRECISION DESKTOP PASS: right mouse hold/release, F toggle, Escape reset; no touch-only aim assistance');
    await desktop.context.close();
  } finally {await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
