// Native desktop + Chromium touch emulation. The room fixture delivers ordinary
// credited kills and shortens respawn waits. All reward requests use live UI.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
import {recordWarmOwner,retireRemoteOutfit} from './bonus-cold-retire.mjs';
import {captureReloads} from './bonus-reload-capture.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
import {waitForActiveHud,resumeDesktop,enterTouchMatch} from './network-browser-resume.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
const output=process.env.CS3_BONUS_EVIDENCE;
const admissionMap=process.env.CS3_FIRST_HUD_MAP;
const admission=admissionMap?await import('./first-hud-admission.mjs'):null;
if(admissionMap)assert(output&&process.env.CS3_BONUS_COLD_FOCUS&&['compact-arena','floor5-prepared'].includes(admissionMap));
const coldOutfit=process.env.CS3_BONUS_COLD_OUTFIT||'shotgun';
assert(['shotgun','sniper'].includes(coldOutfit));
const result={build:CONTRACT.buildHash,protocol:CONTRACT.protocolVersion};
const server=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],pages=[],errors=[];
const controls='#bonus-controls button';
const key=(page,slot)=>page.locator(controls).nth(slot-1);
async function wait(check,message,ms=12000){
  const end=performance.now()+ms;
  while(!await check()){assert(performance.now()<end,message);await delay(35);}
}
async function open(touch){
  const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
    headless:!process.env.WAYLAND_DISPLAY,args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'gl-egl'),
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      '--disable-dev-shm-usage',...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]});
  browsers.push(browser);
  const page=await browser.newPage({viewport:touch?{width:640,height:360}:{width:896,height:504},
    deviceScaleFactor:process.env.CS3_BONUS_RELOAD_CAPTURE==='1'?.75:1,isMobile:touch,hasTouch:touch});
  pages.push(page);page.setDefaultTimeout(35000);
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',ambient:false,volume:.35,mobileAutoFire:false})));
  if(admission)await page.addInitScript(admission.startAdmissionTrace,process.env.CS3_FIRST_HUD_STAGES==='1');
  if(process.env.CS3_BONUS_COLD_FOCUS)await page.addInitScript(()=>{
    const result=window.coldStartup={first:performance.now(),last:null,maxGap:0,above100:0,above250:0,intervals:0,markers:[],raf:[],input:[]};
    function frame(now){
      if(result.last!==null){const gap=now-result.last;result.raf.push([now,gap]);result.intervals++;result.maxGap=Math.max(result.maxGap,gap);
        if(gap>100)result.above100++;if(gap>250)result.above250++;}
      result.last=now;
      if(!document.getElementById('hud')?.hidden && document.getElementById('hud'))result.firstHud??=now;
      requestAnimationFrame(frame);
    }
    addEventListener('pointermove',e=>{if(e.isTrusted)result.input.push([performance.now(),e.timeStamp]);},{passive:true});
    requestAnimationFrame(frame);
  });
  await page.goto(server.url+'/',{waitUntil:'domcontentloaded'});
  if(!touch && process.env.CS3_BONUS_RELOAD_CAPTURE==='1'){
    await page.locator('[data-go=outfits]:visible').click();
    await page.locator('[data-outfit='+coldOutfit+']').click();
    assert.equal(await page.locator('[data-outfit='+coldOutfit+']').getAttribute('aria-pressed'),'true');
    await page.locator('#route-back').click();
  }
  await page.locator('[data-go=play]:visible').click();
  await page.locator('[data-go=friends]').click();
  await page.locator('[data-lan-link]').click();
  await page.locator('#network-code').waitFor();
  if(process.env.CS3_BONUS_COLD_RETIRE==='1')await page.evaluate(recordWarmOwner);
  await page.evaluate(async()=>{
    const {NetworkSession}=await import('/src/fps/network/session.mjs');
    const snapshot=NetworkSession.prototype.snapshot;
    if(window.coldStartup){
      const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
      const warm=Renderer.prototype.prepareOperatorPrograms;
      if(warm)Renderer.prototype.prepareOperatorPrograms=async function(...args){
        const start=performance.now();
        window.coldStartup.roster=args[0].map(root=>root.userData.avatar?.outfitId);
        try{return await warm.apply(this,args);}
        finally{(window.coldStartup.warmWindows??=[]).push([start,performance.now()]);}
      };
      const prepare=NetworkSession.prototype.prepareRoomWorld;
      NetworkSession.prototype.prepareRoomWorld=function(state){
        if(this.loadingRevision!==state.worldRevision)window.coldStartup.markers.push(['loadWorld',performance.now(),state.mapId,state.worldRevision]);
        return prepare.call(this,state);
      };
    }
    NetworkSession.prototype.snapshot=function(...args){
      window.streakSession=this;
      return snapshot.apply(this,args);
    };
  });
  if(admission)await page.evaluate(admission.installAdmissionStages);
  await page.locator('#network-code').fill('streak-room');
  await page.locator('#network-name').fill(touch?'Touch player':'Desktop player');
  await page.locator('#network-team').selectOption(touch?'counterAnalysts':'analysts');
  return page;
}
async function observe(page){
  await page.evaluate(async()=>{
    const {AudioSystem}=await import('/src/fps/audio.mjs');
    const audio=AudioSystem.prototype,net=window.streakSession;
    const data=window.streakProof={packets:[],markers:0,feedback:[],tones:0};
    net.room.onMessage('bonusState',msg=>data.packets.push({actor:msg.actorId,id:msg.bonus.active?.id||'',samples:msg.samples.length,epoch:msg.controlEpoch}));
    const ctx=document.querySelector('#minimap').getContext('2d'),arc=ctx.arc;
    ctx.arc=function(...args){
      if(this.fillStyle==='#ff976a' && [2.4,3.5].includes(args[2]))data.markers++;
      return arc.apply(this,args);
    };
    const status=document.querySelector('#notification');
    new MutationObserver(()=>{if(status.textContent.includes('Immortal'))data.feedback.push(status.textContent);}).observe(status,{childList:true,subtree:true,characterData:true});
    const tone=audio.tone;
    audio.tone=function(event,hz,...args){if(hz===760)data.tones++;return tone.call(this,event,hz,...args);};
  });
}
async function capture(page,name){
  if(output)await page.screenshot({path:join(output,name+'.png'),timeout:15000});
}
async function hitTargets(page){
  return page.locator(controls).evaluateAll(buttons=>buttons.map(b=>{
    const r=b.getBoundingClientRect(),x=r.x+r.width/2,y=r.y+r.height/2;
    return {name:b.querySelector('strong').textContent,x:r.x,y:r.y,w:r.width,h:r.height,
      inside:r.left>=0&&r.top>=0&&r.right<=innerWidth&&r.bottom<=innerHeight,
      hit:b.contains(document.elementFromPoint(x,y)),enabled:!b.disabled};
  }));
}
function award(game,winner,loser,count){
  for(let i=0;i<count;i++){
    loser.spawnProtectedUntil=0;
    assert(game.damage(loser,500,winner,'smg',{head:true}));assert(!loser.alive);assert(respawnActor(game,loser));
  }
}
qualification:try{
  if(output)await mkdir(output,{recursive:true});
  const desktop=await open(false),touch=await open(true);
  const late=process.env.CS3_BONUS_COLD_LATE==='1',host=late?touch:desktop,guest=late?desktop:touch;
  await host.locator('#network-map').selectOption(admissionMap||'compact-arena');
  await host.locator('#network-fill-bots').uncheck();
  const mark=async(page,label)=>{
    if(process.env.CS3_BONUS_COLD_FOCUS)await page.evaluate(s=>window.coldStartup.markers.push([s,performance.now()]),label);
  };
  const inputTimers=[];
  const monitorInput=async page=>{
    if(!process.env.CS3_BONUS_COLD_FOCUS)return;
    const cdp=await page.context().newCDPSession(page);let n=0,inFlight=false;
    inputTimers.push(setInterval(async()=>{
      if(inFlight)return;inFlight=true;
      try{await cdp.send('Input.dispatchMouseEvent',{type:'mouseMoved',x:3+(n++%3),y:3});}catch{}finally{inFlight=false;}
    },100).unref());
  };
  await monitorInput(desktop);await monitorInput(touch);
  const press=(page,id)=>page===touch?page.locator(id).tap():page.locator(id).click();
  if(process.env.CS3_FIRST_HUD_LIFECYCLE==='1'){
    assert(admission&&host===desktop);
    const targetMap=admissionMap==='compact-arena'?'floor5-prepared':'compact-arena';
    let switchMap;const advanced=new Promise(resolve=>{switchMap=resolve;});
    await guest.exposeFunction('changeMapWhileWarming',()=>{switchMap();});
    await guest.evaluate(admission.observeAdmissionLifetime);
    await press(host,'[data-create=true]');
    await host.locator('#room-ready').waitFor();
    const room=[...server.rooms][0];
    const enterExistingRoom=async()=>{await guest.locator('#network-room').fill(room.roomId);await press(guest,'[data-create=false]');};
    const active=async number=>guest.waitForFunction(n=>window.admissionLife?.entries.length===n&&admissionLife.active===n,number);
    await enterExistingRoom();await active(1);
    await guest.locator('form button[type=button]:visible').filter({hasText:/cancel/i}).tap();
    await guest.waitForFunction(()=>admissionLife.entries[0].finished&&document.querySelector('#network-status').dataset.errorId==='joinCancelled');
    await enterExistingRoom();await advanced;
    await host.locator('#room-map').selectOption(targetMap);
    await guest.locator('#room-ready').waitFor({timeout:100000});
    await guest.waitForFunction(map=>streakSession.room.state.mapId===map&&streakSession.worldRevision===streakSession.room.state.worldRevision&&streakSession.view.player?.id&&streakSession.room.state.actors.get(streakSession.localPlayerId)?.ready,targetMap,{timeout:100000});
    const replacement=await guest.evaluate(()=>({map:streakSession.room.state.mapId,revision:streakSession.worldRevision,
      actor:streakSession.view.player?.id,ready:!!streakSession.room.state.actors.get(streakSession.localPlayerId)?.ready}));
    assert.equal(replacement.map,targetMap);assert(replacement.actor&&replacement.ready&&replacement.revision>1);
    await guest.locator('#room-leave').tap();
    await guest.waitForFunction(()=>streakSession.closed&&document.querySelector('#hud').hidden);
    await guest.evaluate(()=>{admissionLife.failNextFence=true;});
    await enterExistingRoom();await guest.locator('#room-ready').waitFor({timeout:75000});
    const lifecycle=await guest.evaluate(()=>JSON.parse(JSON.stringify(admissionLife)));
    assert.equal(lifecycle.entries.length,3);assert(lifecycle.entries[0].aborted&&lifecycle.entries[0].closed);
    assert(lifecycle.entries[1].aborted&&!lifecycle.entries[1].closed);
    assert(lifecycle.failedFence);assert.equal(lifecycle.created,lifecycle.deleted);
    assert(lifecycle.entries.every(e=>e.finished&&e.remainingFences===0&&e.uncovered===0&&e.scissorLeaks===0));
    assert(lifecycle.entries[1].frames>0);
    const old=lifecycle.retired.find(r=>r.owner===lifecycle.entries[1].owner);
    assert(old?.disposed&&old.lost&&old.fences===0);
    const image=await guest.evaluate(admission.captureWaitingFrame);
    await writeFile(join(output,'rejoined-world.png'),Buffer.from(image.image,'base64'));
    delete image.image;
    await guest.locator('#room-leave').tap();
    assert.deepEqual(errors,[]);
    await writeFile(join(output,'lifecycle.json'),JSON.stringify({...result,replacement,lifecycle,rejoined:image},null,2)+'\n');
    console.log('Native cancelled warm-up, host map replacement and optional GPU error recovered');
    break qualification;
  }
  await mark(host,'join requested');
  await press(host,'[data-create=true]');await press(host,'#room-ready');
  const room=[...server.rooms][0];
  await guest.locator('#network-room').fill(room.roomId);
  await mark(host,'waiting ready');await mark(guest,'join requested');
  await press(guest,'[data-create=false]');await press(guest,'#room-ready');
  await mark(guest,'waiting ready');
  const waiting=[];
  if(admission)for(const [i,page] of pages.entries()){
    const {image,...meta}=await page.evaluate(admission.captureWaitingFrame);
    await writeFile(join(output,(i?'emulated':'desktop')+'-waiting.png'),Buffer.from(image,'base64'));
    waiting.push(meta);
  }
  console.log('Both players joined and entered ready state');
  await press(host,'#room-start');await waitForActiveHud(desktop);await enterTouchMatch(touch);
  if(await desktop.locator('#pause').isHidden()&&!await desktop.evaluate(()=>!!document.pointerLockElement))await desktop.keyboard.press('Escape');
  if(await desktop.locator('#resume').isVisible())await resumeDesktop(desktop);
  if(admission){
    for(const timer of inputTimers)clearInterval(timer);
    const human=[...room.seats.values()].find(seat=>seat.actor.name==='Desktop player').actor;
    const initial=[human.x,human.z],tick=room.state.tick;
    await desktop.bringToFront();
    if(await desktop.locator('#pause').isVisible())await resumeDesktop(desktop);
    await desktop.keyboard.down('w');
    try{await wait(()=>Math.hypot(human.x-initial[0],human.z-initial[1])>.08,'ordinary live movement after ready');}
    finally{await desktop.keyboard.up('w');}
    assert(room.state.tick>tick);
    assert.deepEqual(errors,[]);
    const receipts=await Promise.all(pages.map(page=>page.evaluate(admission.admissionReceipt)));
    const report={...result,map:room.state.mapId,players:room.seats.size,bots:room.bots.size,
      movement:Math.hypot(human.x-initial[0],human.z-initial[1]),ticks:room.state.tick-tick,
      waiting,desktop:receipts[0],emulated:receipts[1]};
    assert.equal(report.map,admissionMap);assert.equal(report.players,2);assert.equal(report.bots,0);
    await writeFile(join(output,'first-hud.json'),JSON.stringify(report,null,2)+'\n');
    console.log('Native first HUD',report.map,receipts.map(r=>Math.round(r.gap)),report.movement);
    break qualification;
  }
  await Promise.all([observe(desktop),observe(touch)]);
  await mark(desktop,'active input');await mark(touch,'active input');for(const timer of inputTimers)clearInterval(timer);
  console.log('Both game HUDs active');
  const game=room.sim.game;
  const actors=[...room.seats.values()].map(s=>s.actor);
  const a=actors.find(a=>a.name==='Desktop player'),b=actors.find(a=>a.name==='Touch player');
  assert.notEqual(a.team,b.team);assert.equal(room.bots.size,0);
  assert(await desktop.evaluate(()=>typeof __fps==='undefined'));
  result.fresh=await Promise.all(pages.map(p=>p.locator(controls).allTextContents()));
  game.config.spawnProtection=0;
  award(game,b,a,8);award(game,a,b,8);
  // This fixture changes life IDs outside the ordinary fixed tick. Publish the
  // public actor projection before the next patch can flush private rewards.
  room.project();
  await wait(async()=>await key(desktop,1).isEnabled()&&await key(touch,3).isEnabled(),'confirmed unlocks on both HUDs');
  await touch.setViewportSize({width:568,height:320});
  result.touchTargets=await hitTargets(touch);
  assert(result.touchTargets.every(t=>t.inside&&t.hit&&t.enabled&&t.h>=44&&t.w>=44),JSON.stringify(result.touchTargets));
  await capture(touch,'touch-ready');
  console.log('Eight kills per player, both HUDs ready');
  // Pointer lock is the game's normal desktop keyboard context.
  await desktop.bringToFront();
  if(await desktop.locator('#resume').isVisible())await resumeDesktop(desktop);
  await desktop.keyboard.press('h');
  await wait(()=>a.bonus.active?.id==='uav','desktop H activates UAV');
  const starting={...a.bonus.active};
  await wait(()=>desktop.evaluate(()=>streakProof.markers>0),'active player minimap drew the actual UAV canvas marker');
  console.log('Desktop UAV active, actual canvas marker drawn');
  await key(touch,3).tap();
  await wait(()=>b.bonus.active?.id==='immortal','touch Immortal tap');
  const hp=b.hp,armor=b.armor;
  assert.equal(game.damage(b,50,a,'smg'),false);assert.equal(b.hp,hp);assert.equal(b.armor,armor);
  await wait(async()=>await desktop.evaluate(()=>streakProof.feedback.includes('Opponent is Immortal')&&streakProof.tones>0)&&
    await touch.evaluate(()=>streakProof.feedback.includes('Immortal · hit blocked')&&streakProof.tones>0),'both audience-specific notices and audio voices');
  result.active=starting.endTick-starting.startTick;
  await capture(desktop,'desktop-uav');
  const seat=[...room.seats.values()].find(s=>s.actor===a),epoch=seat.epoch;
  seat.client.ref.terminate();
  await wait(()=>seat.connected&&seat.epoch>epoch,'desktop reconnects');
  await desktop.waitForFunction(()=>streakSession.connectionState==='connected'&&streakSession.view.player?.bonus?.active?.id==='uav');
  const restored=await desktop.evaluate(()=>streakSession.view.player.bonus.active);
  assert.deepEqual(restored,starting);
  result.reconnected={epochAdvanced:true,endTickPreserved:true};
  if(await desktop.locator('#resume').isVisible())await resumeDesktop(desktop);
  await wait(async()=>await key(desktop,1).getAttribute('data-state')==='spent','HUD shows Used after UAV expires',22000);
  const life=a.lifeId;
  a.spawnProtectedUntil=0;assert(game.damage(a,500,b,'smg'));room.project();
  await wait(()=>desktop.locator('#bonus-controls').isHidden(),'dead player controls hidden');
  await wait(()=>a.alive&&a.lifeId>life,'respawned');
  await wait(async()=>await key(desktop,2).getAttribute('data-state')==='ready'&&await key(desktop,1).getAttribute('data-state')==='locked','carried Rage and reset UAV progress after death');
  result.receivers=await Promise.all(pages.map(p=>p.evaluate(()=>{
    const {packets,markers,tones,feedback}=streakProof,local=streakSession.view.player.id;
    return {onlyOwn:packets.every(m=>m.actor===local),samples:packets.reduce((sum,m)=>sum+m.samples,0),markers,tones,feedback:[...new Set(feedback)]};
  })));
  assert(result.receivers[0].onlyOwn&&result.receivers[0].samples>0);
  assert(result.receivers[1].onlyOwn&&result.receivers[1].samples===0&&result.receivers[1].markers===0);
  if(process.env.CS3_BONUS_RELOAD_CAPTURE==='1'){
    const fixed=room.fixedTick,ticks=[];
    if(process.env.CS3_BONUS_COLD_FOCUS)room.fixedTick=function(...args){
      const start=performance.now();
      try{return fixed.apply(this,args);}
      finally{ticks.push([performance.timeOrigin+start,performance.now()-start]);}
    };
    try{await captureReloads({desktop,touch,game,owner:a,observer:b,output,wait});}
    finally{room.fixedTick=fixed;}
    if(output&&ticks.length)await writeFile(join(output,'server-ticks.json'),JSON.stringify(ticks));
  }
  if(process.env.CS3_BONUS_COLD_RETIRE==='1')await retireRemoteOutfit(desktop,touch,host,room,seat,output);
  result.deathCarry=true;result.spent=true;result.errors=errors;assert.deepEqual(errors,[]);
  if(output)await writeFile(join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}catch(error){
  if(output&&process.env.CS3_FIRST_HUD_LIFECYCLE==='1')await writeFile(join(output,'incomplete-lifecycle.json'),JSON.stringify(await Promise.all(pages.map(page=>page.evaluate(()=>({life:window.admissionLife,ready:document.querySelector('#room-ready')?.disabled,status:document.querySelector('#network-status')?.textContent,actor:window.streakSession?.view?.player?.id,revision:window.streakSession?.worldRevision})).catch(()=>null))),null,2));
  for(const page of pages){
    console.error(await page.evaluate(()=>({url:location.pathname,modal:window.__fps?.modal,phase:window.streakSession?.view?.phase,
      hud:document.querySelector('#bonus-controls')?.textContent,lock:document.pointerLockElement?.id,
      state:window.streakSession?.connectionState,bonus:window.streakSession?.view?.player?.bonus,probe:window.streakProof})).catch(()=>null));
  }
  throw error;
}finally{await Promise.allSettled(browsers.map(b=>b.close()));await server.close();}
