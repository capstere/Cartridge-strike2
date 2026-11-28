// Real menu, touch ownership and gameplay. Only input devices are emulated.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const output=process.env.CS3_MOBILE_EVIDENCE;
if(output)await mkdir(output,{recursive:true});
const native=process.env.CHROMIUM_PATH;
const browser=await chromium.launch({executablePath:native,channel:native?undefined:'chromium',
  headless:process.env.FPS_NETWORK_HEADED!=='1',args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:['--enable-unsafe-swiftshader']});
const result={profile:'Chromium touch emulation',viewport:[844,390],deviceScaleFactor:1};
try {
  const ctx=await browser.newContext({viewport:{width:844,height:390},hasTouch:true,isMobile:true,deviceScaleFactor:1,locale:'fr-FR',reducedMotion:'reduce'});
  await ctx.addInitScript(()=>{
    if(!localStorage.getItem('cartridge-settings'))localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,reducedMotion:true,mobileAutoFire:false}));
  });
  const p=await ctx.newPage(),errors=[];
  p.on('pageerror',error=>errors.push(error.message));p.setDefaultTimeout(90000);
  const phase=async label=>{
    console.log(new Date().toISOString(),label);
    if(output)await writeFile(join(output,'mobile-progress.json'),JSON.stringify({phase:label,...result},null,2)+'\n');
  };
  const press=locator=>locator.tap(),go=id=>press(p.locator('[data-go="'+id+'"]:visible').first());
  const set=(name,value)=>p.locator('#menu-settings [data-setting="'+name+'"]').selectOption(value);
  const snap=async name=>{if(output)await p.screenshot({path:join(output,name+'.jpg'),type:'jpeg',quality:80});};
  await p.goto(origin+'/fps/?test=1&realtime=1',{waitUntil:'domcontentloaded'});
  await phase('Options opened');
  await go('options');
  async function range(key,steps){
    const input=p.locator('#menu-settings [data-setting="'+key+'"]');
    await input.focus();await input.press('Home');
    for(let i=0;i<steps;i++)await input.press('ArrowRight');
  }
  await range('volume',10);await range('menuMusicVolume',8);
  const trackBefore=await p.evaluate(()=>__csFlow.music.track.volume);
  await range('announcementVolume',0);
  const trackAfter=await p.evaluate(()=>__csFlow.music.track.volume);
  assert(Math.abs(trackBefore-.2)<.001&&Math.abs(trackAfter-.2)<.001);
  await p.waitForFunction(()=>!!window.__fps?.settings && document.querySelector('#loading').hidden);
  await snap('sound-settings');
  await range('fieldOfView',22);await range('zoomSensitivity',11);
  await p.locator('#menu-settings [data-setting=invertLookY]').check();
  await set('touchStick','fixed');await set('touchRun','button');await set('touchMode','on');
  await p.locator('#menu-settings [data-setting=touchQuickShot]').check();
  await press(p.locator('#menu-settings [data-layout-edit]'));
  const editor=p.getByRole('dialog',{name:'Edit touch layout'});
  const reload=editor.getByRole('button',{name:'Reload',exact:true});
  await reload.focus();await p.keyboard.press('ArrowLeft');await p.keyboard.press('ArrowUp');
  await press(editor.locator('summary'));await press(editor.locator('[data-export]'));
  const profile=JSON.parse(await editor.locator('textarea').inputValue());
  assert.equal(profile.settings.touchRun,'button');assert(profile.layout.reload.x<.80);
  await editor.locator('textarea').fill('{}');await press(editor.locator('[data-import]'));
  assert.match(await editor.locator('[role=status]').textContent(),/Unsupported/);
  await editor.locator('textarea').fill(JSON.stringify(profile));await press(editor.locator('[data-import]'));
  await snap('touch-layout');await press(editor.getByRole('button',{name:'Save layout'}));
  await phase('Reloading saved layout');
  await p.reload();await p.locator('#menu-settings [data-setting=touchMode]').waitFor();
  assert.equal(await p.locator('#menu-settings [data-setting=touchRun]').inputValue(),'button');
  assert.equal(await p.locator('#menu-settings [data-setting=touchStick]').inputValue(),'fixed');
  assert(await p.locator('#menu-settings [data-setting=touchQuickShot]').isChecked());
  result.persisted=profile;
  await p.waitForFunction(()=>!!window.__fps?.settings);
  result.audio=await p.evaluate(()=>({master:__fps.settings.volume,music:__fps.settings.menuMusicVolume,announcements:__fps.settings.announcementVolume,track:__csFlow.music.track.volume}));
  assert.deepEqual(result.audio,{master:.5,music:.4,announcements:0,track:.2});
  await press(p.locator('#route-back'));await go('play');await go('solo');
  await press(p.locator('#lb-mode-seg [data-value=endless]'));await press(p.locator('.map-tile'));
  await press(p.locator('#choose-meltem'));await p.locator('#loadout').selectOption('sniper');
  await phase('Deploying in Meltem');
  await press(p.locator('#start'));await p.locator('#hud').waitFor();await p.locator('#cs-loading').waitFor({state:'hidden'});
  if(await p.locator('#resume').isVisible())await press(p.locator('#resume'));
  await p.waitForFunction(()=>!__fps.modal&&!__fps.game.warmupRemaining&&__fps.game.phase==='active'&&__fps.game.player.weapon==='sniper');
  const cd=await ctx.newCDPSession(p),points=new Map();
  const send=async(type)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints:[...points.values()]});
  const down=async(id,pos)=>{points.set(id,{id,...pos});await send('touchStart');};
  const move=async(id,x,y)=>{const pos=points.get(id);pos.x+=x;pos.y+=y;await send('touchMove');};
  const up=async id=>{const released=points.get(id);assert(released);points.delete(id);await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[released]});};
  const center=async selector=>{
    const b=await p.locator(selector).boundingBox();assert(b&&b.width>0&&b.height>0,selector);
    return {x:b.x+b.width/2,y:b.y+b.height/2};
  };
  const observe=()=>p.evaluate(()=>{
    const {game:g,mobile:m,tactical:t}=__fps,a=g.player,r=__fps.renderer.renderer,gl=r.getContext();
    return {time:g.state.time,alive:a.alive,x:a.x,z:a.z,yaw:a.yaw,pitch:a.pitch,rush:a.rushWeight,slide:a.slideUntil-g.state.time,
      aim:a.aimAmount,ammo:g.item(a)?.ammo,weapon:a.weapon,cartridge:!!a.cartridge,grenades:g.state.grenades.length,
      manualFire:m.state.fire,stick:m.stickId,look:m.lookId,buttons:m.buttonPointers.size,
      scopeHeld:!!t.scopeHold,paused:g.state.paused,frame:r.info.render.frame,
      goldRing:m.stick.classList.contains('rushing'),reticleOpacity:Number(getComputedStyle(document.querySelector('#crosshair')).opacity),
      weaponY:__fps.renderer.weaponModel?.position.y,weaponRoll:__fps.renderer.weaponModel?.rotation.z,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
  });
  await phase('Checking fixed stick and Run');
  const start=await observe();const stick=await center('[data-mobile-stick]');
  await down(1,stick);await move(1,0,-65);
  await p.waitForFunction(()=>__fps.mobile.input().forward>.8);
  assert.equal((await observe()).rush,0);
  await down(2,await center('[data-mobile-action=run]'));await up(2);
  await p.waitForFunction(()=>__fps.game.player.rushWeight>.3);result.rush=await observe();await snap('rush');
  await down(2,await center('[data-mobile-action=crouch]'));await p.waitForFunction(()=>__fps.game.player.slideUntil>__fps.game.state.time,{},{timeout:2500});
  result.slide=await observe();await up(2);await up(1);
  await p.waitForFunction(()=>__fps.game.player.rushWeight<.1);
  await phase('Checking three-pointer scout release');
  const fire=await center('[data-mobile-action=fire]'),look=await center('[data-mobile-look]');
  look.x=844*.55;look.y=390*.35;
  const previous=await observe();
  await down(1,stick);await move(1,-20,-20);await down(2,look);await down(3,fire);
  await move(2,19,-3);await move(3,26,7);await p.waitForFunction(()=>__fps.game.player.aimAmount>.8);
  const held=await observe();assert(held.stick!==null&&held.look!==null&&held.scopeHeld&&held.buttons===1);
  assert.equal(held.ammo,previous.ammo);assert(Math.abs(held.yaw-previous.yaw)>.005);
  await up(3);await p.waitForFunction(ammo=>__fps.game.item(__fps.game.player).ammo===ammo-1,held.ammo);
  const released=await observe();assert(released.stick!==null&&released.look!==null&&!released.scopeHeld);
  await up(2);await up(1);result.threePointers={before:previous,held,released};await snap('scope-release');
  // A real OS-style touchCancel releases the scope without another trigger.
  await down(3,fire);await p.waitForFunction(()=>!!__fps.tactical.scopeHold);
  points.clear();await send('touchCancel');const cancelled=await observe();
  assert(!cancelled.scopeHeld&&cancelled.ammo===released.ammo);result.cancel=cancelled;
  await phase('Checking rotation and cancel');
  await down(1,stick);await move(1,0,-30);await p.setViewportSize({width:390,height:844});
  await p.waitForFunction(()=>__fps.modal==='pause');result.rotation=await observe();
  assert(result.rotation.paused&&result.rotation.stick===null&&result.rotation.look===null&&!result.rotation.manualFire);
  await p.setViewportSize({width:932,height:430});await press(p.locator('#resume'));points.clear();
  await p.waitForFunction(()=>!__fps.modal&&__fps.game.player.alive);
  await phase('Checking grenade hold and release');
  result.grenadeSelection=[];
  const equipHE=async()=>{for(const weapon of ['smoke','flash','he']){
    await press(p.locator('#mobile-more'));await press(p.locator('[data-mobile-action=grenade]'));
    await p.waitForFunction(id=>__fps.game.player.weapon===id,weapon,{timeout:5000});
    result.grenadeSelection.push(weapon);await phase('Selected '+weapon);
  }};
  await equipHE();
  const throwButton=p.getByRole('button',{name:'Throw selected grenade'});
  await p.waitForFunction(()=>{
    const f=__fps,a=f.game.player;return a.alive&&a.weapon==='he'&&f.tactical.weapon==='he'&&!a.action&&f.game.state.time>a.nextShot;
  });
  const throwAt=await center('[data-mobile-action=fire]');
  const hit=await p.evaluate(({x,y})=>{const el=document.elementFromPoint(x,y);return {action:el?.closest('[data-mobile-action]')?.dataset.mobileAction,tag:el?.tagName,id:el?.id};},throwAt);
  assert.equal(hit.action,'fire',JSON.stringify({throwAt,hit}));
  await down(4,throwAt);
  result.grenadePress=await observe();await phase('HE trigger pressed');
  assert(result.grenadePress.manualFire,'Physical pointer reaches the held Throw control');
  await p.waitForFunction(()=>!!__fps.game.player.cartridge?.deadline,null,{timeout:5000});
  result.grenadeHeld=await observe();assert(await throwButton.isVisible());await snap('grenade-held');
  await up(4);await p.waitForFunction(()=>!__fps.game.player.cartridge);
  result.thrown=await p.evaluate(()=>{
    const g=__fps.game,projectile=g.state.grenades.find(v=>v.type==='he'&&v.ownerId===g.player.id);
    return projectile&&{vx:projectile.vx,vz:projectile.vz,deadline:projectile.deadline};
  });assert(result.thrown&&Math.hypot(result.thrown.vx,result.thrown.vz)>0);
  result.grenadeReleased=await observe();assert(result.grenadeReleased.time>start.time&&result.grenadeReleased.frame>start.frame);
  const profileWindow=()=>p.evaluate(async()=>{
    const engine=__fps.renderer,game=__fps.game,originalDraw=engine.render,originalUpdate=game.update;
    const draws=[],updates=[],alive=[];
    engine.render=function(...args){draws.push(performance.now());return originalDraw.apply(this,args);};
    game.update=function(...args){updates.push(performance.now());alive.push(this.player.alive);return originalUpdate.apply(this,args);};
    try{
      await new Promise(resolve=>{let n=0;function step(){if(++n>=120)resolve();else requestAnimationFrame(step);}requestAnimationFrame(step);});
    }finally{engine.render=originalDraw;game.update=originalUpdate;}
    const intervals=draws.slice(1).map((t,i)=>t-draws[i]).sort((a,b)=>a-b);
    const percentile=p=>Math.round(intervals[Math.ceil(p*intervals.length)-1]*100)/100;
    return {draws:draws.length,updates:updates.length,p50Ms:percentile(.5),p95Ms:percentile(.95),alive:alive.every(Boolean),fov:engine.camera.fov,powerSaving:__fps.settings.powerSaving,
      gpu:engine.renderer.getContext().getParameter(engine.renderer.getContext().getExtension('WEBGL_debug_renderer_info').UNMASKED_RENDERER_WEBGL)};
  });
  await phase('Measuring ordinary frame cadence');
  result.ordinary=await profileWindow();
  await press(p.locator('[data-mobile-action=pause]'));
  await p.locator('#pause-settings [data-setting=powerSaving]').check();
  await p.locator('#pause-settings [data-setting=touchStick]').selectOption('floating');
  await p.locator('#pause-settings [data-setting=touchRun]').selectOption('stick');
  await p.locator('#pause-settings [data-setting=touchQuickShot]').uncheck();
  await snap('power-saving-settings');
  await press(p.locator('#resume'));result.powerSaving=await profileWindow();
  assert(result.ordinary.updates>=115&&result.powerSaving.updates>=115);
  assert(result.ordinary.draws>=115&&result.powerSaving.draws<result.powerSaving.updates);
  assert.equal(result.powerSaving.fov,82);
  // V4/V6: the same contact enters and leaves the gold Rush ring in ordinary gameplay.
  await phase('Checking floating-stick threshold');
  const floatingZone=await p.locator('[data-mobile-stick-zone]').boundingBox();
  const neutral={x:floatingZone.x+.37*floatingZone.width,y:floatingZone.y+.60*floatingZone.height};
  await down(1,neutral);await move(1,0,-24);
  await p.waitForFunction(()=>__fps.mobile.state.forward>.2&&!__fps.mobile.state.sprint);
  const walking=await observe();await move(1,0,-50);
  await p.waitForFunction(()=>__fps.mobile.state.sprint&&__fps.game.player.rushWeight>.65);
  const sprinting=await observe();assert(sprinting.goldRing&&sprinting.reticleOpacity<.5);await snap('ring-rush');
  await up(1);await p.waitForFunction(()=>__fps.game.player.rushWeight<.05);
  const recovered=await observe();assert(!recovered.goldRing);result.stickThreshold={walking,sprinting,recovered};
  await phase('Rearming through the shop for same-aspect rotation');
  await press(p.locator('#mobile-more'));await press(p.locator('[data-mobile-action=buy]'));
  await press(p.locator('#shop [data-item=he]'));
  await p.waitForFunction(()=>document.querySelector('#buy-message').dataset.outcome==='accepted');
  await press(p.locator('#return-buy'));await equipHE();
  await p.waitForFunction(()=>{const f=__fps,a=f.game.player;return a.alive&&f.tactical.weapon==='he'&&!a.action&&f.game.state.time>a.nextShot;});
  await down(4,await center('[data-mobile-action=fire]'));
  await p.waitForFunction(()=>!!__fps.game.player.cartridge?.deadline,null,{timeout:5000});
  result.sameAspect=await p.evaluate(()=>{
    const g=__fps.game,deadline=g.player.cartridge.deadline,viewport=[innerWidth,innerHeight];
    // Many devices rotate landscape-primary → landscape-secondary without a viewport resize.
    window.dispatchEvent(new Event('orientationchange'));window.dispatchEvent(new Event('orientationchange'));
    const matches=g.state.grenades.filter(v=>v.type==='he'&&v.ownerId===g.player.id&&v.deadline===deadline);
    const dropped=matches[0];
    return {source:'simulated OS orientation notification',viewport,modal:__fps.modal,paused:g.state.paused,
      held:!!g.player.cartridge,manualFire:__fps.mobile.state.fire,deadline,matchingDrops:matches.length,
      drop:dropped&&{vx:dropped.vx,vy:dropped.vy,vz:dropped.vz,deadline:dropped.deadline}};
  });
  const rotated=result.sameAspect;
  assert.equal(rotated.modal,'pause');assert(rotated.paused&&!rotated.held&&!rotated.manualFire);
  assert.equal(rotated.matchingDrops,1);assert.deepEqual(rotated.drop,{vx:0,vy:0,vz:0,deadline:rotated.deadline});
  points.clear();await send('touchCancel');
  assert.deepEqual(errors,[]);result.errors=errors;
  if(output)await writeFile(join(output,'mobile-profile.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));await ctx.close();
}finally{await browser.close();}
