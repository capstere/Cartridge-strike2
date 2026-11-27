import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');

// Real app input and reticle rays drive two independent rendered connections.
// Only test placement, health and the Classic buy deadline are accelerated.
console.log('Preparing the local multiplayer fixture.');
const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});
const browsers=[],pages=[],errors=[];
async function until(check,label){
  const end=performance.now()+20000;
  while(!await check()){assert(performance.now()<end,label);await delay(50);}
}
async function open(mobile){
  console.log('Opening '+(mobile?'mobile':'desktop')+' Chromium.');
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:[...JSON.parse(process.env.FPS_CHROMIUM_ARGS||'[]'),'--no-sandbox','--use-gl=angle','--ignore-gpu-blocklist','--use-angle='+(process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader')),
      '--enable-unsafe-swiftshader','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
  browsers.push(browser);
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:820,height:480},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||.5)});
  await context.addInitScript(()=>{
    if(location.protocol.startsWith('http')&&!localStorage.getItem('cartridge-settings'))localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false}));
  });
  const page=await context.newPage();pages.push(page);page.setDefaultTimeout(30000);
  page.on('pageerror',error=>errors.push(error.message));
  page.on('console',message=>{if(message.type()==='error')console.error(message.text());});
  console.log('Loading '+(mobile?'mobile':'desktop')+' game.');
  await page.goto(local.url+'/fps/?network=local&test&realtime',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:90000});
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
  console.log('Ready '+(mobile?'mobile':'desktop')+' game.');
  return page;
}
async function join(page,{mode,roomId,team}){
  await page.locator('#network-name').fill(team);
  await page.locator('#network-team').selectOption(team);
  await page.locator('#network-code').fill('autofire-test');
  if(roomId)await page.locator('#network-room').fill(roomId);
  else{
    await page.locator('#network-mode').selectOption(mode);
    await page.locator('#network-fill-bots').uncheck();
  }
  await page.locator('[data-create="'+!roomId+'"]').click();
  await page.locator('#room-ready').waitFor();
}
async function setAuto(page,value){
  if(await page.locator('#pause').isHidden())await page.locator('[data-mobile-action=pause]').tap();
  const toggle=page.locator('#pause-settings [data-setting=mobileAutoFire]');
  assert(await toggle.isVisible());assert(await toggle.isEnabled());
  assert(await page.locator('#pause-settings [data-mobile-fire-note]').isVisible());
  await toggle.setChecked(value);
  assert.equal(await page.evaluate(()=>JSON.parse(localStorage.getItem('cartridge-settings')).mobileAutoFire),value);
  await page.locator('#resume').tap();
  await page.waitForFunction(()=>__fps.modal===null&&__fps.network.enabled);
}
async function aimAtOpponent(page){
  // Correct recoil with the ordinary touch-look callback, never by moving a
  // target, replacing reticleTarget, injecting fire or changing weapon rules.
  await page.evaluate(async()=>{
    const {eye}=await import('/src/fps/game.mjs');
    const g=__fps.game,p=g.player,t=g.actors.find(a=>a.alive&&a.team!==p.team);
    const from=eye(p),input=__fps.input(),dx=t.x-from.x,dz=t.z-from.z;
    const yaw=Math.atan2(-dx,-dz),pitch=Math.atan2(t.y+t.height*.55-from.y,Math.hypot(dx,dz));
    const k=__fps.settings.sensitivity*2.15*__fps.tactical.lookScale(true,input.yaw,input.pitch);
    const turn=Math.atan2(Math.sin(input.yaw-yaw),Math.cos(input.yaw-yaw));
    __fps.mobile.onLook(turn/k,(input.pitch-pitch)/k);
  });
}
try{
  const mobile=await open(true),desktop=await open(false);
  assert.equal(await mobile.evaluate(()=>__fps.settings.mobileAutoFire),false,'new online profiles retain manual fire');
  assert.equal(await desktop.locator('[data-setting=mobileAutoFire]').count(),0,'desktop has no touch-only setting');
  for(const mode of ['tdm','classic']){
    console.log('Checking '+mode+' automatic and manual input.');
    await join(mobile,{mode,team:'analysts'});
    const room=[...local.rooms][0],game=room.sim.game;
    await join(desktop,{roomId:room.roomId,team:'counterAnalysts'});
    if(mode==='tdm')await mobile.locator('#room-primary').selectOption('shotgun');
    await desktop.locator('#room-ready').click();
    await mobile.locator('#room-ready').tap();await mobile.locator('#room-start').tap();
    await until(()=>room.state.phase==='active','match active');
    if(mode==='classic')game.state.buyDeadline=game.state.time;
    await until(()=>game.phase==='active','combat active');
    await mobile.waitForFunction(()=>__fps.network.room.state.phase==='active'&&__fps.game.phase==='active'&&__fps.modal===null);
    if(await mobile.locator('#pause').isHidden())await mobile.locator('[data-mobile-action=pause]').tap();
    await mobile.locator('#pause').waitFor();
    const seat=[...room.seats.values()].find(seat=>seat.actor.team==='analysts');
    await until(()=>!seat.enabled,'server acknowledges pause before test placement');
    const shooter=seat.actor;
    const target=[...room.seats.values()].find(seat=>seat.actor.team==='counterAnalysts').actor;
    Object.assign(shooter,{x:20,z:-18,y:0,yaw:Math.PI,pitch:-.12,spawnProtectedUntil:0});
    Object.assign(target,{x:20,z:-16,y:0,hp:10000,spawnProtectedUntil:0});
    await mobile.waitForFunction(()=>Math.abs(__fps.game.player.x-20)<.05&&Math.abs(__fps.game.player.z+18)<.05&&Math.abs(__fps.game.player.pitch+.12)<.01);
    await mobile.locator('#resume').tap();
    await mobile.evaluate(()=>__fps.game.select('pistol'));
    await until(()=>shooter.weapon==='p9','server equips pistol');
    await aimAtOpponent(mobile);
    await mobile.waitForFunction(()=>__fps.game.player.weapon==='p9'&&__fps.game.reticleTarget()?.team==='counterAnalysts');
    console.log(mode+': actual reticle is on the opponent.');
    const initial=shooter.inventory.pistol.ammo;
    await delay(500);assert.equal(shooter.inventory.pistol.ammo,initial,'manual mode does not shoot at the enemy by itself');
    await setAuto(mobile,true);
    await until(async()=>{await aimAtOpponent(mobile);return shooter.inventory.pistol.ammo<=initial-3;},'three server-confirmed automatic pistol shots');
    assert(await mobile.locator('[data-mobile-action=fire]').isHidden(),'auto mode hides the ordinary trigger');
    assert(target.hp<10000,'ordinary server hits apply damage');

    target.x=24;
    await mobile.waitForFunction(()=>!__fps.input().autoFire);
    await delay(250);const stopped=shooter.inventory.pistol.ammo;
    await delay(500);assert.equal(shooter.inventory.pistol.ammo,stopped,'target loss stops firing');
    await mobile.locator('[data-mobile-action=pause]').tap();
    target.x=20;
    await delay(400);assert.equal(shooter.inventory.pistol.ammo,stopped,'pause blocks automatic input');
    await setAuto(mobile,false);
    // Resume resets prediction and sends controls asynchronously. Establish a
    // fresh neutral input at the authority before testing one manual edge;
    // a rejected edge must never be retried by holding a semiautomatic trigger.
    const resumedTick=room.sim.tickNumber;
    await until(()=>seat.enabled&&!seat.trigger&&seat.lastSampleTick>resumedTick,'fresh neutral input after manual resume');
    await mobile.waitForFunction(()=>{
      const n=__fps.network,p=n.room.state.actors.get(n.localPlayerId);
      return !n.trigger&&!__fps.mobile.state.fire&&p.weapon==='p9'&&!p.reloadUntil&&
        n.prediction.world.game.state.time>=Math.max(n.nextCosmetic,p.nextShot)&&performance.now()-n.lastPatch<500;
    });
    const fire=mobile.locator('[data-mobile-action=fire]');
    assert(await fire.isVisible(),'manual trigger is restored');
    const cd=await mobile.context().newCDPSession(mobile),box=await fire.boundingBox();
    assert(await fire.evaluate(button=>{
      const b=button.getBoundingClientRect();return document.elementFromPoint(b.x+b.width/2,b.y+b.height/2)===button;
    }),'manual trigger receives the touch');
    await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:7,x:box.x+box.width/2,y:box.y+box.height/2}]});
    try{
      await mobile.waitForFunction(()=>__fps.mobile.state.fire&&__fps.input().fire&&!__fps.input().autoFire);
      await until(()=>shooter.inventory.pistol.ammo===stopped-1,'manual press fires once');
    }catch(error){
      const client=await mobile.evaluate(()=>{
        const n=__fps.network,p=n.room.state.actors.get(n.localPlayerId);
        return {fireId:n.fireId,trigger:n.trigger,input:__fps.input(),patchAge:performance.now()-n.lastPatch,
          time:n.prediction.world.game.state.time,nextShot:p.nextShot,nextCosmetic:n.nextCosmetic,
          touchFire:__fps.mobile.state.fire,visible:__fps.mobile.visible,
          pointers:[...__fps.mobile.buttonPointers.values()].map(b=>b.dataset.mobileAction)};
      });
      console.error('Manual fire diagnostics',JSON.stringify({mode,client,server:{enabled:seat.enabled,
        trigger:seat.trigger,lastFire:seat.lastFire,lastSampleTick:seat.lastSampleTick,lastShotStamp:seat.lastShotStamp,
        ammo:shooter.inventory.pistol.ammo,expected:stopped-1,lag:room.lag.metrics,invalid:room.metrics.invalid}}));
      throw error;
    }
    finally{await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cd.detach();}
    await delay(350);assert.equal(shooter.inventory.pistol.ammo,stopped-1,'manual tap does not continue automatically');

    if(mode==='tdm'){
      await mobile.evaluate(()=>__fps.game.select('primary'));
      await until(()=>shooter.weapon==='shotgun','shotgun selected');
      await mobile.waitForFunction(()=>__fps.game.player.weapon==='shotgun');
      const ammo=shooter.inventory.primary.ammo;
      await setAuto(mobile,true);
      await until(async()=>{await aimAtOpponent(mobile);return shooter.inventory.primary.ammo<=ammo-2;},'two server-confirmed automatic shotgun shots');
      await setAuto(mobile,false);
      await setAuto(mobile,true);
      await mobile.evaluate(()=>__fps.game.select('he'));
      await until(()=>shooter.weapon==='he','grenade selected');
      await mobile.waitForFunction(()=>__fps.game.player.weapon==='he');
      // The frame may adopt the newly selected weapon after drawing the
      // controls. Wait for the next update to show the actual manual trigger.
      await fire.filter({hasText:/^THROW$/}).waitFor({state:'visible'});
      const grenades=shooter.inventory.he;await delay(400);
      assert.equal(shooter.inventory.he,grenades,'grenade is never thrown automatically');
    }
    await setAuto(mobile,mode==='classic');
    for(const page of [mobile,desktop])await page.evaluate(()=>__fps.newMatch());
    await until(()=>local.rooms.size===0,'both players leave and room disposes');
    console.log('PASS '+mode+': normal mobile setting, actual reticle input, repeated server shots, target loss, pause and manual control.');
  }
  // The same persisted preference is used on subsequent page loads.
  await mobile.reload({waitUntil:'domcontentloaded'});
  await mobile.waitForFunction(()=>window.__fps);
  assert.equal(await mobile.evaluate(()=>__fps.settings.mobileAutoFire),true);
  assert.deepEqual(errors,[]);
  console.log('PASS mobile preference survives reload; desktop remains manual. Physical phones NOT RUN.');
}catch(error){
  for(const page of pages)console.error(await page.evaluate(()=>({fatal:document.querySelector('#fatal pre')?.textContent,
    modal:window.__fps?.modal,input:window.__fps?.input(),weapon:window.__fps?.game.player?.weapon,
    ammo:window.__fps?.game.item()?.ammo,metrics:window.__fps?.network?.metrics,status:window.__fps?.network?.status})).catch(()=>null));
  throw error;
}finally{
  for(const browser of browsers)await browser.close();
  await local.close();
}
