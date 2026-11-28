// Native desktop + Chromium touch emulation. The room fixture delivers ordinary
// credited kills and shortens respawn waits. All reward requests use live UI.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
import {captureReloads} from './bonus-reload-capture.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
import {waitForActiveHud,resumeDesktop,enterTouchMatch} from './network-browser-resume.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
const output=process.env.CS3_BONUS_EVIDENCE;
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
    await page.locator('[data-outfit=shotgun]').click();
    assert.equal(await page.locator('[data-outfit=shotgun]').getAttribute('aria-pressed'),'true');
    await page.locator('#route-back').click();
  }
  await page.locator('[data-go=play]:visible').click();
  await page.locator('[data-go=friends]').click();
  await page.locator('[data-lan-link]').click();
  await page.locator('#network-code').waitFor();
  await page.evaluate(async()=>{
    const {NetworkSession}=await import('/src/fps/network/session.mjs');
    const snapshot=NetworkSession.prototype.snapshot;
    if(window.coldStartup){
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
try{
  if(output)await mkdir(output,{recursive:true});
  const desktop=await open(false),touch=await open(true);
  await desktop.locator('#network-map').selectOption('compact-arena');
  await desktop.locator('#network-fill-bots').uncheck();
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
  await mark(desktop,'join requested');
  await desktop.locator('[data-create=true]').click();await desktop.locator('#room-ready').click();
  const room=[...server.rooms][0];
  await touch.locator('#network-room').fill(room.roomId);
  await mark(desktop,'waiting ready');await mark(touch,'join requested');
  await touch.locator('[data-create=false]').tap();await touch.locator('#room-ready').tap();
  await mark(touch,'waiting ready');
  console.log('Both players joined and entered ready state');
  await desktop.locator('#room-start').click();await waitForActiveHud(desktop);await enterTouchMatch(touch);
  if(await desktop.locator('#pause').isHidden()&&!await desktop.evaluate(()=>!!document.pointerLockElement))await desktop.keyboard.press('Escape');
  if(await desktop.locator('#resume').isVisible())await resumeDesktop(desktop);
  await Promise.all([observe(desktop),observe(touch)]);
  await mark(desktop,'active input');await mark(touch,'active input');for(const timer of inputTimers)clearInterval(timer);
  console.log('Both game HUDs active');
  const game=room.sim.game;
  const [a,b]=[...room.seats.values()].map(s=>s.actor);
  assert.notEqual(a.team,b.team);assert.equal(room.bots.size,0);
  assert(await desktop.evaluate(()=>typeof __fps==='undefined'));
  result.fresh=await Promise.all(pages.map(p=>p.locator(controls).allTextContents()));
  game.config.spawnProtection=0;
  award(game,b,a,8);award(game,a,b,8);
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
  a.spawnProtectedUntil=0;assert(game.damage(a,500,b,'smg'));
  await wait(()=>desktop.locator('#bonus-controls').isHidden(),'dead player controls hidden');
  await wait(()=>a.alive&&a.lifeId>life,'respawned');
  await wait(async()=>await key(desktop,2).getAttribute('data-state')==='ready'&&await key(desktop,1).getAttribute('data-state')==='locked','carried Rage and reset UAV progress after death');
  result.receivers=await Promise.all(pages.map(p=>p.evaluate(()=>{
    const {packets,markers,tones,feedback}=streakProof,local=streakSession.view.player.id;
    return {onlyOwn:packets.every(m=>m.actor===local),samples:packets.reduce((sum,m)=>sum+m.samples,0),markers,tones,feedback:[...new Set(feedback)]};
  })));
  assert(result.receivers[0].onlyOwn&&result.receivers[0].samples>0);
  assert(result.receivers[1].onlyOwn&&result.receivers[1].samples===0&&result.receivers[1].markers===0);
  if(process.env.CS3_BONUS_RELOAD_CAPTURE==='1')await captureReloads({desktop,touch,game,owner:a,observer:b,output,wait});
  result.deathCarry=true;result.spent=true;result.errors=errors;assert.deepEqual(errors,[]);
  if(output)await writeFile(join(output,'browser.json'),JSON.stringify(result,null,2)+'\n');
  console.log(JSON.stringify(result));
}catch(error){
  for(const page of pages){
    console.error(await page.evaluate(()=>({url:location.pathname,modal:window.__fps?.modal,phase:window.streakSession?.view?.phase,
      hud:document.querySelector('#bonus-controls')?.textContent,lock:document.pointerLockElement?.id,
      state:window.streakSession?.connectionState,bonus:window.streakSession?.view?.player?.bonus,probe:window.streakProof})).catch(()=>null));
  }
  throw error;
}finally{await Promise.allSettled(browsers.map(b=>b.close()));await server.close();}
