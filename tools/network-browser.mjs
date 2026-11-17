import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {latencyProxy} from './network-proxy.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {ROOM_TYPE} from '../shared/multiplayer/rules.mjs';
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
 page.on('request',r=>{if(/assets\/fps\/(zombies\/|Danceman\/)/.test(r.url()))errors.push('Online slice requested an unused resident model: '+r.url());});
 page.on('response',r=>{if(r.status()>=400&&r.request().method()==='GET'&&/\.(glb|mjs|mp3|ogg|webp)(\?|$)/.test(r.url()))errors.push(`Asset HTTP ${r.status()}: ${r.url()}`);});
 await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false})));
 await page.goto(local.url+'/fps/?network=local&test&realtime');
 await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden);
 assert(await page.locator('#fatal').evaluate(e=>e.hidden),await page.locator('#fatal').textContent());
 await page.waitForFunction(()=>document.querySelector('#lb-objective').textContent.includes('inga uppdrag'));
 assert.match(await page.locator('.lb-brief').textContent(),/Floor 5 Laboratory/);
 assert.match(await page.locator('.lb-brief').textContent(),/1 mot 1/);
 assert(await page.evaluate(()=>!__fps.renderer.zombieVisuals),'online renderer has no unused resident asset initialization');
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
async function walk(page,goals){
 const points=await page.evaluate(goals=>{const w=__fps.world;let from=__fps.network.prediction.world.actor,result=[];for(const [x,z] of goals){const goal={x,z},path=w.findPath(from,goal);if(!path.length)throw Error(`No real Floor 5 route to ${x},${z}`);result.push(...path.map(p=>[p.x,p.z]));from=goal;}return result;},goals);
 await page.evaluate(async points=>{
  for(const [x,z] of points){
   const end=performance.now()+20000;
   while(true){
    const n=__fps.network,a=n.prediction.world.actor,dx=x-a.x,dz=z-a.z,d=Math.hypot(dx,dz);
    if(d<.10){
     // Prediction can reach a corner before a delayed/overflowed input is
     // acknowledged. Stop steering, await the SDK ack for that exact frame,
     // then require the authoritative body to have arrived too.
     __fps.liveControls={};const sent=n.input.sentCount;
     while(n.input.lastProcessed<sent){if(performance.now()>end)throw Error('Route input was not acknowledged');await new Promise(requestAnimationFrame);}
     const authority=n.room.state.actors.get(n.localPlayerId),error=Math.hypot(authority.x-x,authority.z-z);
     (window.__routeConfirmations??=[]).push({sent,ack:n.input.lastProcessed,error});
     if(error<.16)break;
     if(performance.now()>end)throw Error('Authority did not reach the waypoint');
     await new Promise(requestAnimationFrame);continue;
    }
    if(performance.now()>end)throw Error(`Route stalled at ${a.x},${a.z} toward ${x},${z}`);
    __fps.liveControls={forward:Math.min(1,d*3),yaw:Math.atan2(-dx,-dz),pitch:0};
    await new Promise(requestAnimationFrame);
   }
  }
  __fps.liveControls={};
 },points);
 await page.waitForTimeout(350);
 const actual=await state(page),[x,z]=goals.at(-1);assert(Math.hypot(actual.x-x,actual.z-z)<.3,'authoritative route arrival '+JSON.stringify({actual,goal:[x,z]}));
}
async function measureWindow(page,label){
 const cd=await page.context().newCDPSession(page);await cd.send('Performance.enable');
 const before=await cd.send('Performance.getMetrics');
 const sample=await page.evaluate(async()=>{
  const times=[],draws=[],r=__fps.renderer,render=r.render;let cpu=0,last=0;
  r.render=function(...args){const t=performance.now();try{return render.apply(this,args);}finally{cpu+=performance.now()-t;}};
  try{const until=performance.now()+5000;while(performance.now()<until){const now=await new Promise(requestAnimationFrame);if(last){times.push(now-last);draws.push(r.stats.drawCalls);}last=now;}}
  finally{r.render=render;}
  const stats=a=>{const sorted=a.slice().sort((a,b)=>a-b);return {median:sorted[Math.floor(sorted.length*.5)],p95:sorted[Math.floor(sorted.length*.95)],max:sorted.at(-1)};};
  const p=__fps.game.player;return {frames:times.length,fps:times.length*1000/times.reduce((a,b)=>a+b,0),frameMs:stats(times),draws:stats(draws),renderCpuMs:cpu/Math.max(1,times.length),gpu:{...r.renderer.info.memory},position:{x:p.x,y:p.y,z:p.z,yaw:p.yaw},room:__fps.world.roomAt(p.x,p.z)?.id};
 });
 const after=await cd.send('Performance.getMetrics');await cd.detach();
 const dict=r=>Object.fromEntries(r.metrics.map(m=>[m.name,m.value])),start=dict(before),end=dict(after);
 return {label,...sample,heapBytes:end.JSHeapUsedSize,taskCpuMs:(end.TaskDuration-start.TaskDuration)*1000,scriptCpuMs:(end.ScriptDuration-start.ScriptDuration)*1000};
}
async function blockedShot(page,target){
 await page.evaluate(async target=>{
  const n=__fps.network,a=n.room.state.actors.get(n.localPlayerId),ammo=a.ammo;
  __fps.liveControls={yaw:Math.atan2(-(target.x-a.x),-(target.z-a.z)),pitch:Math.atan2(1.15-(a.y+1.58),Math.hypot(target.x-a.x,target.z-a.z)),fire:true};
  const end=performance.now()+10000;
  while(n.room.state.actors.get(n.localPlayerId).ammo===ammo){if(performance.now()>end)throw Error('No authoritative blocked shot');await new Promise(requestAnimationFrame);}
  __fps.liveControls={};
 },target);
 await page.waitForTimeout(300);
}
const worldState=page=>page.evaluate(()=>{
 const n=__fps.network,w=__fps.world,s=n.room.state;
 return {doors:[...s.doors].map(([id,d])=>[id,d.angle,d.sign]),elevator:s.elevatorProgress,
  visualMatches:w.doors.doors.every(d=>d.angle===s.doors.get(d.id).angle&&d.sign===s.doors.get(d.id).sign)&&w.doors.elevators.progress===s.elevatorProgress,
  broken:w.glass.brokenCount};
});
async function fireUntil(page,target,lethal=false){
 // Stop on the authority patch in the firing client. A slow driver's return
 // trip must not turn the intended first-hit check into several seconds of fire.
 await page.evaluate(({target,lethal})=>{
  const n=__fps.network,a=n.room.state.actors.get(n.localPlayerId);let timer;
  window.__fireCheck=new Promise((resolve,reject)=>{
   const finish=(value,error)=>{clearTimeout(timer);n.room.onStateChange.remove(changed);__fps.liveControls={};error?reject(error):resolve(value);};
   const changed=()=>{const victim=n.room.state.actors.get(target.id);if(victim&&(lethal?!victim.alive:victim.hp<target.hp))finish({hp:victim.hp,alive:victim.alive});};
   n.room.onStateChange(changed);timer=setTimeout(()=>finish(null,Error('Authoritative shot did not damage target')),20000);
   __fps.liveControls={yaw:Math.atan2(-(target.x-a.x),-(target.z-a.z)),pitch:Math.atan2(1.15-(a.y+1.58),Math.hypot(target.x-a.x,target.z-a.z)),fire:true};
  });
 },{target,lethal});
 return page.evaluate(()=>window.__fireCheck);
}
async function reloadCheck(page,roomId,actorId){
 const authority=[...local.rooms].find(r=>r.roomId===roomId),[sid,seat]=[...authority.seats].find(([,s])=>s.id===actorId);
 const buffer=authority.inputs.get(sid),next=buffer.next;let serverAttempts=0;
 // Observe real consumed wire frames. A renderer stall can prevent the client
 // from seeing the reload-start patch until its queued fire inputs were already
 // processed. Those inputs still must be rejected by the active server reload.
 buffer.next=function(){const frame=next.call(this);if(frame?.fire&&seat.actor.reloadUntil>authority.sim.game.state.time)serverAttempts++;return frame;};
 try{
 // Observe the reload on state patches, not after slow driver round trips. A
 // software renderer can finish the entire reload while a CDP read is pending.
 await page.evaluate(()=>{
  const n=__fps.network,handle=n.input,send=handle.send;let off,timer,started=false,attempts=0,activeAttempts=0;const ammo=[],reloadId=n.reloadId;
  const pressed=e=>{if(e.code==='KeyR'){const a=n.room.state.actors.get(n.localPlayerId);__fps.liveControls={fire:true,yaw:a.yaw,pitch:a.pitch};}};
  window.addEventListener('keydown',pressed);
  window.__reloadCheck=new Promise((resolve,reject)=>{
   const finish=(result,error)=>{clearTimeout(timer);off?.();window.removeEventListener('keydown',pressed);handle.send=send;__fps.liveControls={};error?reject(error):resolve(result);};
   handle.send=function(...args){if(this.data.fire&&this.data.reloadId>reloadId){attempts++;if(started)activeAttempts++;}return send.apply(this,args);};
   const changed=()=>{const a=n.room.state.actors.get(n.localPlayerId);
    if(a.reloadUntil){started=true;ammo.push(a.ammo);__fps.liveControls={fire:true,yaw:a.yaw,pitch:a.pitch};}
    else if(started)finish({ammo,attempts,activeAttempts,full:a.ammo});
   };
   n.room.onStateChange(changed);off=()=>n.room.onStateChange.remove(changed);
   timer=setTimeout(()=>finish(null,Error('Reload state did not complete')),15000);
  });
 });
 await page.keyboard.press('KeyR');
 const result=await page.evaluate(()=>window.__reloadCheck);result.serverAttempts=serverAttempts;
 assert(result.ammo.length>0&&result.attempts>0,'held fire was submitted with the reload action: '+JSON.stringify(result));
 assert(result.serverAttempts>0,'authority consumes held-fire attempts during its active reload: '+JSON.stringify(result));
 assert(result.ammo.every(v=>v===result.ammo[0]),'authoritative ammo cannot fall during reload');
 assert.equal(result.full,30,'reload restores magazine before further firing');
 return result;
 }finally{buffer.next=next;}
}
try{
 for(const [scenario,endpoint,cycles] of [['loopback',local.url,20],['100ms-rtt-jitter',proxy.url,4]].filter(s=>!process.env.FPS_NETWORK_SCENARIO||s[0]===process.env.FPS_NETWORK_SCENARIO)){
  const scenarioAt=performance.now();
  const a=await open(),b=await open({width:844,height:390},true);
  await b.screenshot({path:`test-results/network/${scenario}-mobile-lobby.png`});
  const id=await join(a,endpoint,'','Alice'),same=await join(b,endpoint,id,'<img src=x onerror=x>');assert.equal(same,id);
  await a.waitForFunction(()=>__fps.game.actors.length===2);assert.equal(local.rooms.size,1);
  console.log('joined',scenario,id);
  const authority=[...local.rooms].find(r=>r.roomId===id),tickCosts=[],fixed=authority.fixedTick;authority.fixedTick=function(...args){const t=performance.now();try{return fixed.apply(this,args);}finally{tickCosts.push(performance.now()-t);}};
  for(const page of [a,b])await page.evaluate(()=>{const n=__fps.network,advance=n.advanceFrame;let last=0;window.__networkPerformance={frames:[],cpu:[],draws:[]};n.advanceFrame=function(now,...args){const t=performance.now();const v=advance.call(this,now,...args);const m=__networkPerformance;if(last)m.frames.push(now-last);last=now;m.cpu.push(performance.now()-t);m.draws.push(__fps.renderer.stats.drawCalls);return v;};});
  const windows=await Promise.all([measureWindow(a,'Cargo Lift'),measureWindow(b,'Service Lift')]);
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
  await Promise.all([a,b].map((page,i)=>page.waitForFunction(start=>{const n=__fps.network,p=n.room.state.actors.get(n.localPlayerId);return Math.hypot(p.x-start.x,p.z-start.z)>.5;},before[i])));
  await Promise.all([a.keyboard.up('KeyW'),b.keyboard.up('KeyW')]);await a.waitForTimeout(250);
  const moved=await Promise.all([state(a),state(b)]);
  for(let i=0;i<2;i++)assert(Math.hypot(moved[i].x-before[i].x,moved[i].z-before[i].z)>.5,'simultaneous human movement '+i);
  await Promise.all([walk(a,[[22.8,-18]]),walk(b,[[22.8,-13]])]);
  console.log('Floor 5 routes completed',scenario,await state(a),await state(b));
  await controls(a,{yaw:Math.PI});await controls(b,{yaw:0});
  windows.push(...await Promise.all([measureWindow(a,'C08 desktop'),measureWindow(b,'C08 mobile emulation')]));
  const presented=await a.evaluate(()=>{const n=__fps.network,remote=n.view.actors.find(a=>a.id!==n.localPlayerId),model=__fps.renderer.actors.get(remote.id),camera=__fps.renderer.camera;return {visible:model.visible,model:model.position.toArray(),remote:[remote.x,remote.y,remote.z],camera:camera.position.toArray(),player:[n.view.player.x,n.view.player.y+n.view.player.height-.12,n.view.player.z]};});
  assert(presented.visible,'remote operator visible in C08');assert(Math.hypot(...presented.model.map((v,i)=>v-presented.remote[i]))<.3,'rendered remote operator follows authoritative/interpolated body');
  await a.screenshot({path:`test-results/network/${scenario}-floor5.png`});
  await controls(b,{forward:.2,yaw:0});
  await a.waitForFunction(()=>{const n=__fps.network,r=n.view.actors.find(a=>a.id!==n.localPlayerId),model=__fps.renderer.actors.get(r.id);return r.moving>0&&model.visible&&model.userData.avatar.activeBase==='Walk_Loop';});
  const walkingClip=await a.evaluate(()=>{const n=__fps.network,r=n.view.actors.find(a=>a.id!==n.localPlayerId);return __fps.renderer.actors.get(r.id).userData.avatar.activeBase;});
  await controls(b);await walk(b,[[22.8,-13]]);

  await a.keyboard.down('Tab');await a.waitForFunction(()=>!document.querySelector('#scoreboard').hidden);
  assert((await a.locator('#score-tables').textContent()).includes('<img src=x onerror=x>'));
  assert.equal(await a.locator('#score-tables img').count(),0);await a.keyboard.up('Tab');
  const prediction=await a.evaluate(()=>new Promise((resolve,reject)=>{
   const n=__fps.network,handle=n.input,send=handle.send;
   const timer=setTimeout(()=>{handle.send=send;__fps.liveControls={};reject(Error('No normal input step'));},10000);
   handle.send=function(...args){
    const old=n.prediction.world.actor.x,auth=n.room.state.actors.get(n.localPlayerId).x;
    const result=send.apply(this,args);handle.send=send;clearTimeout(timer);__fps.liveControls={};
    resolve({localMoved:Math.abs(n.prediction.world.actor.x-old),serverMoved:Math.abs(n.room.state.actors.get(n.localPlayerId).x-auth)});return result;
   };
   __fps.liveControls={strafe:1,yaw:0,pitch:0};
  }));
  console.log('prediction',scenario,prediction);
  assert(prediction.localMoved>0,'own motion responds before network round trip');
  if(scenario!=='loopback')assert.equal(prediction.serverMoved,0,'latency does not delay local response');
  await walk(a,[[22.8,-18]]);
  // Reach the actual D39 laboratory doorway using normal network movement.
  // First shoot through a solid wall, then its closed leaf, then the open door.
  await walk(b,[[26.8,-22.4703402]]);
  const protectedHp=(await state(b)).hp;
  await blockedShot(a,await state(b));assert.equal((await state(b)).hp,protectedHp,'Floor 5 wall blocks damage');
  await walk(a,[[21.2,-22.4703402]]);
  await a.waitForFunction(()=>__fps.network.room.state.doors.get('D39').angle===0);
  await blockedShot(a,await state(b));assert.equal((await state(b)).hp,protectedHp,'closed D39 blocks damage');
  await walk(a,[[22.6,-22.4703402]]);
  await Promise.all([a,b].map(p=>p.waitForFunction(()=>__fps.network.room.state.doors.get('D39').angle>1.5)));
  const doorHit=await fireUntil(a,await state(b));assert(doorHit.hp<protectedHp&&doorHit.alive,'open D39 allows a body hit');
  const doors=await Promise.all([worldState(a),worldState(b)]);
  for(const state of doors){assert(state.visualMatches);assert.equal(state.elevator,1);assert.equal(state.broken,0);assert.equal(state.doors.length,51);}
  await Promise.all([walk(a,[[22.8,-18]]),walk(b,[[22.8,-13]])]);
  // Actual weapon events, damage and reload in both rendered clients.
  const victimBefore=await state(b),hit=await fireUntil(a,victimBefore);assert(hit.hp<victimBefore.hp&&hit.alive,'first volley damages without killing');
  const reloads=[await reloadCheck(a,id,before[0].id)];console.log('reload a',scenario,reloads[0]);
  await fireUntil(a,await state(b),true);await b.waitForFunction(()=>!__fps.game.player.alive);
  await a.waitForFunction(()=>__fps.game.player.kills===1&&__fps.game.state.score.analysts===1);
  const dead=await state(b);assert.equal(dead.deaths,1);
  await a.waitForFunction(id=>__fps.renderer.actors.get(id)?.userData.avatar.death?.action.getClip().name==='Death01',dead.id);
  await a.screenshot({path:`test-results/network/${scenario}-combat.png`});
  await b.waitForFunction(life=>__fps.game.player.alive&&__fps.game.player.lifeId>life,dead.life);
  const respawn=await b.evaluate(()=>{const n=__fps.network,a=n.room.state.actors.get(n.localPlayerId),p=__fps.game.player;return {life:a.lifeId,delta:Math.hypot(p.x-a.x,p.y-a.y,p.z-a.z),ammo:a.ammo};});
  assert(respawn.delta<.02&&respawn.ammo===30,'respawn snaps to new life and restores inventory');assert.equal((await state(a)).kills,1);
  // Reverse roles: the second human's input also owns real aim, damage and reload.
  await walk(b,[[22.8,-13]]);const reverseHit=await fireUntil(b,await state(a));assert(reverseHit.hp<100&&reverseHit.alive);
  reloads.push(await reloadCheck(b,id,before[1].id));console.log('reload b',scenario,reloads[1]);
  // Menus neutralize just one controller. The authoritative room never pauses.
  await a.keyboard.press('Escape');await a.waitForFunction(()=>__fps.modal==='pause');
  const paused=await state(a);await controls(b,{forward:1,yaw:0});await a.waitForTimeout(450);await controls(b);
  const during=await state(a);assert(during.tick>paused.tick+10);assert(Math.hypot(during.x-paused.x,during.z-paused.z)<.2);
  assert.equal(await a.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);
  // Chromium's native view can reject lock despite emulated DOM focus
  // (Playwright #20956). Exercise one visible recovery gesture, never bypass
  // pointer lock or resume the simulation through a test-only method.
  let resumeAttempts=0;
  for(;resumeAttempts<2;){
   resumeAttempts++;await a.bringToFront();await a.locator('#resume').click();
   try{await a.waitForFunction(()=>__fps.modal===null&&document.pointerLockElement===document.querySelector('#game'),null,{timeout:5000});break;}
   catch(e){const diagnostic=await a.evaluate(()=>({modal:__fps.modal,focused:document.hasFocus(),hidden:document.hidden,fullscreen:!!document.fullscreenElement,text:document.querySelector('#pause p:not(.eyebrow)').textContent}));
    console.log('resume diagnostic',diagnostic);
    if(resumeAttempts===2||diagnostic.modal!=='pause'||!diagnostic.text.includes('Muslås'))throw e;
   }
  }
  // Rotation uses the existing mobile input/audio lifecycle, without room pause.
  const beforeRotation=await state(b);await b.setViewportSize({width:390,height:844});await b.waitForFunction(()=>__fps.modal==='pause');await b.waitForTimeout(250);
  assert((await state(b)).tick>beforeRotation.tick+5);assert.equal(await b.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);
  await b.setViewportSize({width:844,height:390});assert.equal(await b.evaluate(()=>__fps.modal),'pause');await b.locator('#resume').click();
  // Admission failures happen before a body/renderer is needed. Use a fresh
  // official SDK client in an existing browser instead of initializing a third
  // full GPU scene solely to receive these two protocol errors.
  const admission=await b.evaluate(async({endpoint,roomId,contract,type})=>{
   const client=new Colyseus.Client(endpoint),attempt=async fn=>{try{const room=await fn();await room.leave();return {accepted:true};}catch(e){return {accepted:false,message:e.message,code:e.code};}};
   return {full:await attempt(()=>client.joinById(roomId,{code:'testing-123',name:'Third',contract})),
    mismatch:await attempt(()=>client.create(type,{code:'testing-123',name:'Mismatch',contract:{...contract,buildHash:'stale'}}))};
  },{endpoint,roomId:id,contract:CONTRACT,type:ROOM_TYPE});
  assert.equal(admission.full.accepted,false);assert.match(admission.full.message,/full|locked/i);
  assert.equal(admission.mismatch.accepted,false);assert.match(admission.mismatch.message,/buildHash/);assert.equal(local.rooms.size,1);
  const cd=await b.context().newCDPSession(b),cleanup=[],cleanupAt=performance.now();
  for(let i=0;i<cycles;i++){
   const cycleAt=performance.now();
   const old=await b.evaluate(async()=>{const n=__fps.network,probe=()=>{},emitter=n.room.onStateChange(probe);n.room.onStateChange.remove(probe);__fps.liveControls={};__fps.newMatch();const immediateStateCallbacks=emitter.handlers.length;await new Promise(r=>setTimeout(r,30));return {closed:n.closed,predict:!!n.predict,callbacks:n.unsub.length,immediateStateCallbacks,remotes:n.remote.size,events:n.events.length,room:!!n.room};});
   assert.deepEqual(old,{closed:true,predict:false,callbacks:0,immediateStateCallbacks:0,remotes:0,events:0,room:false});
   await a.waitForFunction(()=>__fps.network.room.state.actors.size===1);
   // Initial admission above uses the real form. Repeated lifecycle coverage
   // invokes that form's exact application handler in one driver call instead
   // of retyping four unchanged fields through many software-rendered frames.
   // The normal server, session, presentation, RAF and disposal still execute.
   await b.evaluate(async({endpoint,roomId})=>{
    await __fps.joinNetwork({endpoint,roomId,create:false,code:'testing-123',name:'Bob'});
    await new Promise(requestAnimationFrame);await new Promise(requestAnimationFrame);
    if(!__fps.network?.view.player?.alive||!__fps.game.network||__fps.modal!==null)throw Error('Rejoin did not enter the game');
   },{endpoint,roomId:id});
   const joinedWorld=await worldState(b);assert(joinedWorld.visualMatches);assert.equal(joinedWorld.elevator,1,'late join receives open shutters');assert.equal(joinedWorld.doors.length,51);
   await cd.send('HeapProfiler.collectGarbage');await b.waitForTimeout(50);await cd.send('HeapProfiler.collectGarbage');
   const dom=await cd.send('Memory.getDOMCounters'),owned=await b.evaluate(()=>({actors:__fps.game.actors.length,models:__fps.renderer.actors.size,callbacks:__fps.network.unsub.length,remotes:__fps.network.remote.size,gpu:__fps.renderer.renderer.info.memory,voices:__fps.audio.active.size}));
   cleanup.push({cycle:i+1,ms:performance.now()-cycleAt,dom,owned});
   if((i+1)%5===0||i+1===cycles)console.log('cleanup',scenario,i+1+'/'+cycles,Math.round(performance.now()-cleanupAt)+'ms');
  }
  assert.equal(cleanup.at(-1).dom.jsEventListeners,cleanup[0].dom.jsEventListeners,'join/leave listeners stay bounded');
  assert.equal(cleanup.at(-1).owned.models,cleanup[0].owned.models);assert.equal(cleanup.at(-1).owned.callbacks,cleanup[0].owned.callbacks);
  assert.deepEqual(cleanup.at(-1).owned.gpu,cleanup[0].owned.gpu,'join/leave GPU allocations stay bounded');
  await controls(a);await a.waitForTimeout(400);
  const measured=await a.evaluate(()=>{const n=__fps.network,s=n.room.state.actors.get(n.localPlayerId),p=n.prediction.world.actor;return {metrics:n.metrics,pending:n.input.pendingCount,settledError:Math.hypot(p.x-s.x,p.y-s.y,p.z-s.z),draws:__fps.renderer.stats.drawCalls,actors:__fps.game.actors.map(a=>({id:a.id,controller:a.controllerType,bot:!!a.bot})),fatal:!document.querySelector('#fatal').hidden};});
  assert(measured.settledError<.02);assert(!measured.fatal);assert(measured.metrics.suppressedShots>0);assert.equal(measured.metrics.confirmedShots,measured.metrics.suppressedShots,'each own confirmed shot reuses its immediate cosmetic action');
  const performanceSamples=await Promise.all([a,b].map(page=>page.evaluate(()=>({...__networkPerformance,gpu:__fps.renderer.renderer.info.memory,heap:performance.memory?.usedJSHeapSize||null}))));
  const summarize=values=>{const sorted=values.filter(Number.isFinite).sort((a,b)=>a-b);return {samples:sorted.length,median:sorted[Math.floor(sorted.length*.5)]||0,p95:sorted[Math.floor(sorted.length*.95)]||0,max:sorted.at(-1)||0};};
  const perf={serverTickMs:summarize(tickCosts),clients:performanceSamples.map(s=>({frameMs:summarize(s.frames),predictionCpuMs:summarize(s.cpu),draws:summarize(s.draws),heap:s.heap,gpu:s.gpu}))};
  const timings={beforeCleanupMs:cleanupAt-scenarioAt,cleanupMs:performance.now()-cleanupAt,totalMs:performance.now()-scenarioAt};
  results.push({scenario,room:id,interpolation,prediction,respawn,reloads,resumeAttempts,admission,measured,cleanup,timings,perf,doors,doorHit,windows,presented,animation:{walkingClip,deathClip:'Death01'},routeConfirmations:await Promise.all([a,b].map(p=>p.evaluate(()=>window.__routeConfirmations)))});console.log('PASS',scenario,JSON.stringify({prediction,respawn,reloads,timings,metrics:{...measured.metrics,corrections:undefined},cleanup:[cleanup[0],cleanup.at(-1)]}));
  await a.evaluate(()=>__fps.newMatch());await b.evaluate(()=>__fps.newMatch());await a.waitForTimeout(250);
  await a.context().close();await b.context().close();assert.equal(local.rooms.size,0,'empty server has no retained room');
 }
 assert.deepEqual(errors,[]);
}catch(e){console.error('network browser failure',e);throw e;}finally{
 await browser.close();await proxy.close();await local.close();
 fs.writeFileSync('test-results/network/browser.json',JSON.stringify({contract:CONTRACT,environment:{node:process.version,platform:process.platform,arch:process.arch,deviceScaleFactor:testDpr,angle:angle||'default'},results,proxy:proxy.metrics,errors},null,2));
}
console.log('PASS: two-browser gameplay, prediction, latency, combat, lifecycle and cleanup');
