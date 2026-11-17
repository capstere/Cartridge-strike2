import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {latencyProxy} from './network-proxy.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const results=[],errors=[];
const testDpr=Number(process.env.FPS_NETWORK_DPR||1),angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'');
assert(testDpr>=.25&&testDpr<=2,'test DPR must stay between .25 and 2');
const local=await createLocalServer({port:0});
const proxy=await latencyProxy(local.url);
const browser=await chromium.launch({channel:'chromium',args:[...(angle?['--use-angle='+angle]:[]),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});
fs.mkdirSync('test-results/network',{recursive:true});
async function open(viewport={width:1280,height:720},mobile=false){
 const context=await browser.newContext({viewport,hasTouch:mobile,isMobile:mobile,deviceScaleFactor:testDpr}),page=await context.newPage();
 page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.stack));
 await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false})));
 await page.goto(local.url+'/fps/?network=local&test&realtime');
 await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden);
 assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
 await page.waitForFunction(()=>document.querySelector('#lb-objective').textContent.includes('inga uppdrag'));
 assert.match(await page.locator('.lb-brief').textContent(),/Synthetic Demo/);
 assert.match(await page.locator('.lb-brief').textContent(),/1 mot 1/);
 return page;
}
async function join(page,endpoint,roomId='',name='Player'){
 await page.locator('#network-endpoint').fill(endpoint);await page.locator('#network-code').fill('testing-123');
 await page.locator('#network-name').fill(name);await page.locator('#network-room').fill(roomId);
 await page.locator(`[data-create="${roomId?'false':'true'}"]`).click();
 await page.waitForFunction(()=>__fps.network?.view.player?.alive&&__fps.game.network&&__fps.modal===null);
 return page.evaluate(()=>__fps.network.room.roomId);
}
const state=page=>page.evaluate(()=>{const n=__fps.network,s=n.room.state,a=[...s.actors.values()].find(a=>a.sessionId===n.room.sessionId);return {id:a.id,x:a.x,y:a.y,z:a.z,hp:a.hp,ammo:a.ammo,reserve:a.reserve,life:a.lifeId,alive:a.alive,kills:a.kills,deaths:a.deaths,tick:s.tick,actors:s.actors.size};});
async function controls(page,value={}){await page.evaluate(value=>{__fps.liveControls=value;},value);}
async function walk(page,points){
 await page.evaluate(async points=>{
  for(const [x,z] of points){
   const end=performance.now()+20000;
   while(true){
    const n=__fps.network,a=n.prediction.world.actor,dx=x-a.x,dz=z-a.z,d=Math.hypot(dx,dz);
    if(d<.11)break;
    if(performance.now()>end)throw Error(`Route stalled at ${a.x},${a.z} toward ${x},${z}`);
    __fps.liveControls={forward:Math.min(1,d*3),yaw:Math.atan2(-dx,-dz),pitch:0};
    await new Promise(requestAnimationFrame);
   }
  }
  __fps.liveControls={};
 },points);
 await page.waitForTimeout(350);
}
async function aimAt(page,target,fire){const a=await state(page);await controls(page,{yaw:Math.atan2(-(target.x-a.x),-(target.z-a.z)),pitch:Math.atan2(1.15-(a.y+1.58),Math.hypot(target.x-a.x,target.z-a.z)),fire});}
async function reloadCheck(page){
 // Observe the reload on state patches, not after slow driver round trips. A
 // software renderer can finish the entire reload while a CDP read is pending.
 await page.evaluate(()=>{
  const n=__fps.network,handle=n.input,send=handle.send;let off,timer,started=false,attempts=0;const ammo=[];
  window.__reloadCheck=new Promise((resolve,reject)=>{
   const finish=(result,error)=>{clearTimeout(timer);off?.();handle.send=send;__fps.liveControls={};error?reject(error):resolve(result);};
   handle.send=function(...args){if(started&&this.data.fire)attempts++;return send.apply(this,args);};
   const changed=()=>{const a=n.room.state.actors.get(n.localPlayerId);
    if(a.reloadUntil){started=true;ammo.push(a.ammo);__fps.liveControls={fire:true,yaw:a.yaw,pitch:a.pitch};}
    else if(started)finish({ammo,attempts,full:a.ammo});
   };
   n.room.onStateChange(changed);off=()=>n.room.onStateChange.remove(changed);
   timer=setTimeout(()=>finish(null,Error('Reload state did not complete')),15000);
  });
 });
 await page.keyboard.press('KeyR');
 const result=await page.evaluate(()=>window.__reloadCheck);
 assert(result.ammo.length>0&&result.attempts>0,'held fire was submitted during reload: '+JSON.stringify(result));
 assert(result.ammo.every(v=>v===result.ammo[0]),'authoritative ammo cannot fall during reload');
 assert.equal(result.full,30,'reload restores magazine before further firing');
 return result;
}
try{
 for(const [scenario,endpoint,cycles] of [['loopback',local.url,20],['100ms-rtt-jitter',proxy.url,4]]){
  const a=await open(),b=await open({width:844,height:390},true);
  await b.screenshot({path:`test-results/network/${scenario}-mobile-lobby.png`});
  const id=await join(a,endpoint,'','Alice'),same=await join(b,endpoint,id,'<img src=x onerror=x>');assert.equal(same,id);
  await a.waitForFunction(()=>__fps.game.actors.length===2);assert.equal(local.rooms.size,1);
  console.log('joined',scenario,id);
  const before=await Promise.all([state(a),state(b)]);
  // Install before sending keys: slow CDP calls can otherwise miss the entire
  // movement. Observe immediately after the normal frame updates its render
  // pose; a later state patch may replace the presentation before our own rAF.
  await b.evaluate(()=>{
   const n=__fps.network,advance=n.advanceFrame,started=performance.now(),samples=[];
   window.__interpolationCheck=new Promise(resolve=>{
    let timer;const finish=()=>{clearTimeout(timer);n.advanceFrame=advance;resolve({max:Math.max(0,...samples.map(s=>s.offset)),samples: samples.length,frames:samples});};
    n.advanceFrame=function(...args){
     const result=advance.apply(this,args),raw=[...n.room.state.actors.values()].find(a=>a.id!==n.localPlayerId),shown=n.view.actors.find(a=>a.id===raw?.id);
     if(raw&&shown){samples.push({at:performance.now()-started,offset:Math.hypot(raw.x-shown.x,raw.z-shown.z),raw:[raw.x,raw.z],shown:[shown.x,shown.z]});
      if(performance.now()-started>600&&samples.some(s=>s.offset>.02))finish();}
     return result;
    };
    timer=setTimeout(finish,8000);
   });
  });
  // Real keyboard events enter the ordinary app input path on both pages.
  await Promise.all([a.keyboard.down('KeyW'),b.keyboard.down('KeyW')]);
  const interpolation=await b.evaluate(()=>window.__interpolationCheck);
  assert(interpolation.max>.02&&interpolation.max<1.5,'remote render uses buffered states during movement: '+JSON.stringify(interpolation));
  await Promise.all([a.keyboard.up('KeyW'),b.keyboard.up('KeyW')]);await a.waitForTimeout(250);
  const moved=await Promise.all([state(a),state(b)]);
  for(let i=0;i<2;i++)assert(Math.hypot(moved[i].x-before[i].x,moved[i].z-before[i].z)>.5,'simultaneous human movement '+i);
  await Promise.all([walk(a,[[2,3],[4.5,3]]),walk(b,[[12,3],[11.4,3]])]);
  await a.keyboard.down('Tab');await a.waitForFunction(()=>!document.querySelector('#scoreboard').hidden);
  assert((await a.locator('#score-tables').textContent()).includes('<img src=x onerror=x>'));
  assert.equal(await a.locator('#score-tables img').count(),0);await a.keyboard.up('Tab');
  const prediction=await a.evaluate(()=>new Promise((resolve,reject)=>{
   const n=__fps.network,handle=n.input,send=handle.send;
   const timer=setTimeout(()=>{handle.send=send;__fps.liveControls={};reject(Error('No normal input step'));},10000);
   handle.send=function(...args){
    const old=n.prediction.world.actor.z,auth=n.room.state.actors.get(n.localPlayerId).z;
    const result=send.apply(this,args);handle.send=send;clearTimeout(timer);__fps.liveControls={};
    resolve({localMoved:Math.abs(n.prediction.world.actor.z-old),serverMoved:Math.abs(n.room.state.actors.get(n.localPlayerId).z-auth)});return result;
   };
   __fps.liveControls={strafe:1,yaw:-Math.PI/2,pitch:0};
  }));
  console.log('prediction',scenario,prediction);
  assert(prediction.localMoved>0,'own motion responds before network round trip');
  if(scenario!=='loopback')assert.equal(prediction.serverMoved,0,'latency does not delay local response');
  await walk(a,[[4.5,3]]);
  // Actual weapon events, damage and reload in both rendered clients.
  const victimBefore=await state(b);await aimAt(a,victimBefore,true);
  await b.waitForFunction(()=>__fps.game.player.hp<100);await controls(a);
  const reloads=[await reloadCheck(a)];console.log('reload a',scenario,reloads[0]);
  await aimAt(a,await state(b),true);await b.waitForFunction(()=>!__fps.game.player.alive);await controls(a);
  await a.waitForFunction(()=>__fps.game.player.kills===1&&__fps.game.state.score.analysts===1);
  const dead=await state(b);assert.equal(dead.deaths,1);
  await a.screenshot({path:`test-results/network/${scenario}-combat.png`});
  await b.waitForFunction(life=>__fps.game.player.alive&&__fps.game.player.lifeId>life,dead.life);
  const respawn=await b.evaluate(()=>{const n=__fps.network,a=n.room.state.actors.get(n.localPlayerId),p=__fps.game.player;return {life:a.lifeId,delta:Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z),ammo:a.ammo};});
  assert(respawn.delta<.02&&respawn.ammo===30,'respawn snaps to new life and restores inventory');assert.equal((await state(a)).kills,1);
  // Reverse roles: the second human's input also owns real aim, damage and reload.
  await walk(b,[[12,3],[11.4,3]]);await aimAt(b,await state(a),true);
  await a.waitForFunction(()=>__fps.game.player.hp<100);await controls(b);
  reloads.push(await reloadCheck(b));console.log('reload b',scenario,reloads[1]);
  // Menus neutralize just one controller. The authoritative room never pauses.
  await a.keyboard.press('Escape');await a.waitForFunction(()=>__fps.modal==='pause');
  const paused=await state(a);await controls(b,{forward:1,yaw:0});await a.waitForTimeout(450);await controls(b);
  const during=await state(a);assert(during.tick>paused.tick+10);assert(Math.hypot(during.x-paused.x,during.z-paused.z)<.2);
  assert.equal(await a.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);
  // Browser pointer lock requires the desktop page to have OS/tab focus.
  await a.bringToFront();await a.locator('#resume').click();
  try{await a.waitForFunction(()=>__fps.modal===null,null,{timeout:5000});}
  catch(e){console.log('resume diagnostic',await a.evaluate(()=>({modal:__fps.modal,focused:document.hasFocus(),hidden:document.hidden,text:document.querySelector('#pause').innerText})));throw e;}
  // Rotation uses the existing mobile input/audio lifecycle, without room pause.
  const beforeRotation=await state(b);await b.setViewportSize({width:390,height:844});await b.waitForFunction(()=>__fps.modal==='pause');await b.waitForTimeout(250);
  assert((await state(b)).tick>beforeRotation.tick+5);assert.equal(await b.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);
  await b.setViewportSize({width:844,height:390});assert.equal(await b.evaluate(()=>__fps.modal),'pause');await b.locator('#resume').click();
  // Full room and stale-build failures must not create/occupy another game.
  const c=await open();await c.locator('#network-endpoint').fill(endpoint);await c.locator('#network-code').fill('testing-123');await c.locator('#network-room').fill(id);await c.locator('[data-create=false]').click();
  await c.waitForFunction(()=>!document.querySelector('[data-create=false]').disabled);assert.equal(await c.evaluate(()=>__fps.network),null);assert.equal(local.rooms.size,1);
  const mismatch=await c.evaluate(async({endpoint,contract})=>{try{await __fps.joinNetwork({endpoint,create:true,code:'testing-123',name:'Mismatch',contract:{...contract,buildHash:'stale'}});return 'accepted';}catch(e){return e.message;}},{endpoint,contract:CONTRACT});
  assert.match(mismatch,/buildHash/);assert.equal(local.rooms.size,1);await c.context().close();
  const cd=await b.context().newCDPSession(b),cleanup=[];
  for(let i=0;i<cycles;i++){
   const old=await b.evaluate(async()=>{const n=__fps.network,probe=()=>{},emitter=n.room.onStateChange(probe);n.room.onStateChange.remove(probe);__fps.newMatch();const immediateStateCallbacks=emitter.handlers.length;await new Promise(r=>setTimeout(r,30));return {closed:n.closed,predict:!!n.predict,callbacks:n.unsub.length,immediateStateCallbacks,remotes:n.remote.size,events:n.events.length,room:!!n.room};});
   assert.deepEqual(old,{closed:true,predict:false,callbacks:0,immediateStateCallbacks:0,remotes:0,events:0,room:false});
   await a.waitForFunction(()=>__fps.network.room.state.actors.size===1);
   await b.evaluate(()=>{__fps.liveControls={};});await join(b,endpoint,id,'Bob');
   await cd.send('HeapProfiler.collectGarbage');await b.waitForTimeout(50);await cd.send('HeapProfiler.collectGarbage');
   const dom=await cd.send('Memory.getDOMCounters'),owned=await b.evaluate(()=>({actors:__fps.game.actors.length,models:__fps.renderer.actors.size,callbacks:__fps.network.unsub.length,remotes:__fps.network.remote.size,gpu:__fps.renderer.renderer.info.memory,voices:__fps.audio.active.size}));
   cleanup.push({cycle:i+1,dom,owned});
  }
  assert.equal(cleanup.at(-1).dom.jsEventListeners,cleanup[0].dom.jsEventListeners,'join/leave listeners stay bounded');
  assert.equal(cleanup.at(-1).owned.models,cleanup[0].owned.models);assert.equal(cleanup.at(-1).owned.callbacks,cleanup[0].owned.callbacks);
  await controls(a);await a.waitForTimeout(400);
  const measured=await a.evaluate(()=>{const n=__fps.network,s=n.room.state.actors.get(n.localPlayerId),p=n.prediction.world.actor;return {metrics:n.metrics,pending:n.input.pendingCount,settledError:Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z),draws:__fps.renderer.stats.drawCalls,actors:__fps.game.actors.map(a=>({id:a.id,controller:a.controllerType,bot:!!a.bot})),fatal:!document.querySelector('#fatal').hidden};});
  assert(measured.settledError<.02);assert(!measured.fatal);assert(measured.metrics.suppressedShots>0);assert.equal(measured.metrics.confirmedShots,measured.metrics.suppressedShots,'each own confirmed shot reuses its immediate cosmetic action');
  results.push({scenario,room:id,interpolation,prediction,respawn,reloads,measured,cleanup});console.log('PASS',scenario,JSON.stringify({prediction,respawn,reloads,metrics:{...measured.metrics,corrections:undefined},cleanup:[cleanup[0],cleanup.at(-1)]}));
  await a.evaluate(()=>__fps.newMatch());await b.evaluate(()=>__fps.newMatch());await a.waitForTimeout(250);
  await a.context().close();await b.context().close();assert.equal(local.rooms.size,0,'empty server has no retained room');
 }
 assert.deepEqual(errors,[]);
}catch(e){console.error('network browser failure',e);throw e;}finally{
 await browser.close();await proxy.close();await local.close();
 fs.writeFileSync('test-results/network/browser.json',JSON.stringify({contract:CONTRACT,environment:{node:process.version,platform:process.platform,arch:process.arch,deviceScaleFactor:testDpr,angle:angle||'default'},results,proxy:proxy.metrics,errors},null,2));
}
console.log('PASS: two-browser gameplay, prediction, latency, combat, lifecycle and cleanup');
