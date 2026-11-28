// Both browsers use the shipped lobby and Resume control. DevTools reads the
// friend's SDK-decoded state to verify that real inputs reached the authority.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {enterTouchMatch, resumeDesktop, waitForActiveHud} from './network-browser-resume.mjs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const external=process.env.CS2_PILOT_URL;
const completeMatch=process.env.CS2_BROWSER_COMPLETE_MATCH==='1';
const fixture=external?null:await (await import('./network-pilot-fixture.mjs')).startPilotFixture(completeMatch?{testMatch:{durationSeconds:30,countdownSeconds:.3}}:{});
const origin=fixture?.origin||new URL(external).origin;
assert.equal(new URL(origin).protocol,'https:');
const invite=fixture?.invite||(await readFile(process.env.CS2_PILOT_INVITE_FILE,'utf8')).trim();
const roomCode=randomBytes(12).toString('hex'),browsers=[],pages=[],errors=[],wsCounts=[],renderers=[];
let roomId;
const angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const dpr=Number(process.env.FPS_NETWORK_DPR||1);

async function open(mobile){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-gl=angle','--use-angle='+angle,'--disable-background-timer-throttling',
      '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(fixture?.args||[])]});
  browsers.push(browser);
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:960,height:540},
    isMobile:mobile,hasTouch:mobile,deviceScaleFactor:dpr});
  const page=await context.newPage(),counts={sockets:0,sent:0,received:0};wsCounts.push(counts);pages.push(page);
  page.setDefaultTimeout(90000);
  page.on('pageerror',e=>{errors.push(e.name);console.error('Browser exception:',e.name);});
  page.on('response',r=>{
    const url=new URL(r.url());
    if(url.origin===origin&&r.status()>=400)console.log('Game HTTP',r.status(),url.pathname.startsWith('/matchmake/')?'matchmaking':url.pathname);
  });
  page.on('websocket',socket=>{
    const target=new URL(socket.url());if(target.host!==new URL(origin).host||target.protocol!=='wss:')return;
    counts.sockets++;socket.on('framesent',()=>counts.sent++);socket.on('framereceived',()=>counts.received++);
  });
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false}));
    window.__pilotFocus=[];
    for(const type of ['focus','blur','pointerlockchange','pointerlockerror']){
      window.addEventListener(type,event=>{
        if(['focus','blur'].includes(type)&&event.target!==window)return;
        window.__pilotFocus.push({type,at:Math.round(performance.now()),focused:document.hasFocus(),locked:!!document.pointerLockElement});
        if(window.__pilotFocus.length>12)window.__pilotFocus.shift();
      },true);
    }
  });
  await page.goto(origin,{waitUntil:'domcontentloaded'});
  const field=page.locator('input[name=invite]');await field.waitFor();
  try{
    // Exercise the real form with the clipboard whitespace reported by players.
    await field.fill(' '+invite+' ');
    await page.locator('#show-invite').check();
    assert.equal(await field.getAttribute('type'),'text');
    await page.locator('#show-invite').uncheck();
    assert.equal(await field.getAttribute('type'),'password');
  }catch{throw Error('Unable to enter or reveal server invite');}
  await page.locator('button[type=submit]').click();
  await page.waitForFunction(()=>document.querySelector('#network-code')||document.querySelector('#fatal pre')?.textContent);
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal pre').textContent());
  assert.equal(new URL(page.url()).searchParams.get('network'),'internet');
  assert.equal(await page.locator('#network-endpoint').inputValue(),origin);
  const cookies=await context.cookies();
  assert(cookies.some(c=>c.name==='__Host-cs2_pilot'&&c.secure&&c.httpOnly));
  if (mobile && fixture) {
    await page.waitForFunction(async () => {
      const registration=await navigator.serviceWorker.getRegistration();
      return registration?.active?.state==='activated' && !!navigator.serviceWorker.controller;
    },undefined,{timeout:30000});
    const stored=await page.evaluate(async()=>{
      const paths=[];
      for(const cacheName of await caches.keys()){
        const cache=await caches.open(cacheName);
        for(const entry of await cache.keys())paths.push(new URL(entry.url).pathname);
      }
      return paths;
    });
    assert.deepEqual(stored,[],'Private pilot responses stay out of the install cache');
    const offlinePage=await context.newPage();
    try {
      // A service worker owns its own network context. Disconnect the test TLS
      // endpoint as well, so the worker cannot fetch through a live connection.
      fixture.setReachable(false);
      await context.setOffline(true);
      const response=await offlinePage.goto(origin+'/fps/',{waitUntil:'domcontentloaded'});
      assert.equal(response.status(),503);
      await offlinePage.getByRole('heading',{name:/offline/i}).waitFor();
    } finally {
      fixture.setReachable(true);
      await context.setOffline(false);
      await offlinePage.close();
    }
  }
  const renderer=await page.evaluate(()=>{
    if(!isSecureContext||typeof window.__fps!=='undefined')throw Error('Expected normal secure multiplayer launch');
    const gl=document.getElementById('game').getContext('webgl2');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL||gl.RENDERER);
  });
  renderers.push(renderer);console.log('Authenticated lobby ready:',mobile?'touch emulation':'desktop',renderer);
  return page;
}

async function submit(page,name,id='',code=roomCode){
  await page.locator('#network-name').fill(name);await page.locator('#network-code').fill(code);
  await page.locator('#network-team').selectOption(id?'counterAnalysts':'analysts');
  await page.locator('#network-room').fill(id);
  if(!id)await page.locator('#network-fill-bots').uncheck();
 await page.locator('[data-create="'+String(!id)+'"]').click();
}

// Look up the already-connected SDK Room on the observer. Leave all game code,
// transport, timing and input handlers intact throughout the test.
async function inspectFriend(page,roomId){
  const cdp=await page.context().newCDPSession(page);
  const {result:proto}=await cdp.send('Runtime.evaluate',{expression:'Colyseus.Room.prototype',objectGroup:'pilot'});
  const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:proto.objectId,objectGroup:'pilot'});
  const {result}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,
    functionDeclaration:'function(id){return Array.from(this).find(r=>r.roomId===id&&r.state?.actors?.size===2)}',arguments:[{value:roomId}],objectGroup:'pilot'});
  assert(result.objectId,'Friend received both actors in the same room');
  return async()=>{
    const {result:sample,exceptionDetails}=await cdp.send('Runtime.callFunctionOn',{objectId:result.objectId,
      functionDeclaration:`function(){
        const actor=this.state.actors.get('analysts-0');
        return {x:actor.x,z:actor.z,ammo:actor.ammo,pitch:actor.pitch,tick:this.state.tick,doors:this.state.doors.size,readyCount:[...this.state.actors.values()].filter(a=>a.ready).length,phase:this.state.phase,matchId:this.state.matchId,remaining:this.state.remainingSeconds,duration:this.state.durationSeconds,scoreTarget:this.state.scoreTarget,results:this.state.results};
      }`,returnByValue:true});
    assert(!exceptionDetails,'Friend could not read the replicated room state');return sample.value;
  };
}
async function until(read,predicate,label,timeout=35000){
  const deadline=performance.now()+timeout;
  while(true){const sample=await read();if(predicate(sample))return sample;
    assert(performance.now()<deadline,label+' '+JSON.stringify(sample));await delay(100);}
}

try{
  const host=await open(false);
  const setup=await host.context().newCDPSession(host);
  await setup.send('Page.setWebLifecycleState',{state:'frozen'});
  let friend;
  try{friend=await open(true);}finally{await setup.send('Page.setWebLifecycleState',{state:'active'});await setup.detach();}
  await submit(host,'Pilot host');
  await host.locator('#room-ready').waitFor({state:'visible'});
  console.log('Host created a private room');
  roomId=await host.locator('#network-room').inputValue();assert(roomId);
  await submit(friend,'Pilot friend',roomId,'incorrect-'+roomCode);
  await friend.locator('#network-status').filter({hasText:'Incorrect private room code'}).waitFor();
  await submit(friend,'Pilot friend',roomId);await friend.locator('#room-ready').waitFor({state:'visible'});
  await host.locator('#room-ready').click();await friend.locator('#room-ready').tap();await host.locator('#room-start').click();
  await waitForActiveHud(host);await enterTouchMatch(friend);
  await friend.waitForFunction(()=>document.querySelector('#pause').hidden);
  const read=await inspectFriend(friend,roomId),before=await until(read,s=>s.readyCount===2,'Both ready');
  assert.equal(before.doors,51,'Replicated Floor 5 doors');
  console.log('Friend joined the same Floor 5 room and received both ready actors');
  const {attempts:resumeAttempts,point}=await resumeDesktop(host);
  await host.mouse.move(point.x,point.y+1000);
  await until(read,s=>s.pitch<-1.3,'Friend received mouse look');
  await host.keyboard.down('w');
  const moved=await until(read,s=>Math.hypot(s.x-before.x,s.z-before.z)>.12,'Friend received movement');
  await host.keyboard.up('w');await host.mouse.down();
  const fired=await until(read,s=>s.ammo<before.ammo,'Friend received fire');await host.mouse.up();
  await host.keyboard.press('r');const reloaded=await until(read,s=>s.ammo===before.ammo,'Friend received reload');
  assert(reloaded.tick>before.tick);
  assert(wsCounts.every(s=>s.sockets>=1&&s.sent>0&&s.received>0),'Both browsers exchanged WSS frames');
  let matchCycle;
  if(completeMatch){
    if(external){assert.equal(before.duration,600);assert.equal(before.scoreTarget,50);}
    const readHost=await inspectFriend(host,roomId);let lastProgress=0,lastTick=before.tick,lastTickAt=performance.now();
    const final=await until(read,s=>{
      if(s.tick!==lastTick){lastTick=s.tick;lastTickAt=performance.now();}
      assert(performance.now()-lastTickAt<15000,'public authority keeps ticking');
      if(performance.now()-lastProgress>60000){lastProgress=performance.now();console.log(JSON.stringify({publicMatchPhase:s.phase,remaining:Math.ceil(s.remaining)}));}
      return s.phase==='results';
    },'shipping time-limit result',Math.max(60000,before.duration*1000+30000));
    const hostFinal=await until(readHost,s=>s.phase==='results','host results');
    assert.equal(final.results,hostFinal.results);const result=JSON.parse(final.results);
    assert.equal(result.reason,'time');assert.equal(result.winner,'draw');assert.deepEqual(result.score,{analysts:0,counterAnalysts:0});
    await host.locator('#room-rematch').click();await friend.locator('#room-ready').waitFor({state:'visible'});
    await host.locator('#room-ready').click();await friend.locator('#room-ready').tap();await host.locator('#room-start').click();
    await waitForActiveHud(host);await enterTouchMatch(friend);const secondResume=await resumeDesktop(host);
    const next=await until(read,s=>s.phase==='active'&&s.matchId===before.matchId+1,'same public room rematch');
    assert.equal(next.ammo,30);await host.mouse.move(secondResume.point.x,secondResume.point.y+1000);
    await host.mouse.down();try{await until(read,s=>s.ammo<30,'public rematch fire');}finally{await host.mouse.up();}
    matchCycle={sameRoom:true,shippingDefaults:!!external,durationSeconds:before.duration,scoreTarget:before.scoreTarget,firstMatch:before.matchId,result,secondMatch:next.matchId,rematchFire:true};
  }
  await host.keyboard.press('Escape');await host.locator('#restart').click();
  await friend.waitForFunction(()=>document.querySelector('#alive-a')?.textContent==='0 alive');
  await friend.locator('[data-mobile-action=pause]').tap();await friend.locator('#restart').tap();
  assert.deepEqual(errors,[]);
  const report={status:'PASS',path:external?'public HTTPS':'loopback TLS',date:new Date().toISOString(),
    physicalDevices:false,chromium:browsers[0].version(),renderers,angle,dpr,renderedClients:2,resumeAttempts,fixtureCertificatePinned:!!fixture,
    inviteLogins:2,rejectedWrongRoomCode:true,readyActors:before.readyCount,floor5Doors:before.doors,webSockets:wsCounts,
    matchCycle,remoteGameplay:{tickBefore:before.tick,tickAfter:reloaded.tick,distance:Math.hypot(moved.x-before.x,moved.z-before.z),
      ammoBefore:before.ammo,ammoFired:fired.ammo,ammoReloaded:reloaded.ammo},departedHostRemoved:true};
  await mkdir('test-results/pilot',{recursive:true});
  await writeFile('test-results/pilot/'+(external?'public-browser':'local-browser')+'.json',JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}catch(error){
  for(const page of pages){
    const state=await page.evaluate(()=>({
      path:location.pathname,roomAssigned:!!document.querySelector('#network-room')?.value,
      fatal:document.querySelector('#fatal')?.hidden===false,loading:document.querySelector('#loading')?.hidden===false,
      paused:document.querySelector('#pause')?.hidden===false,pointerLockDenied:document.querySelector('#pause')?.textContent.includes('Mouse capture failed'),
      focused:document.hasFocus(),locked:!!document.pointerLockElement,focusEvents:window.__pilotFocus
    })).catch(()=>({closed:true}));
    console.error('Browser state',JSON.stringify(state));
  }
  // A Playwright action error can include a field value or a URL in its call log.
  let message=error.stack||String(error);
  for(const value of [invite,roomCode,roomId])if(value)message=message.replaceAll(value,'[redacted]');
  throw Error(message.replace(/([?&](?:sessionId|reconnectionToken)=)[^&\s)]+/gi,'$1[redacted]'));
}finally{try{await Promise.all(browsers.map(b=>b.close()));}finally{await fixture?.close();}}
