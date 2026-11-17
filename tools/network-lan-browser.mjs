import assert from 'node:assert/strict';
import fs from 'node:fs';
import {fileURLToPath} from 'node:url';
import {chromium,webkit,firefox} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createTestServer} from './network-test-server.mjs';
import {createTestPeer} from './network-test-peer.mjs';
import {testLanHost} from './network-lan-host.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
process.chdir(fileURLToPath(new URL('../',import.meta.url)));
const mobileEngine=process.env.FPS_LAN_MOBILE_BROWSER||'chromium',desktopEngine=process.env.FPS_LAN_DESKTOP_BROWSER||'chromium';
const engines={chromium,webkit,firefox},errors=[],rows=[];
const protocolPeer=process.env.FPS_LAN_PROTOCOL_PEER==='1';
const angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const launch=engine=>engines[engine].launch(engine==='chromium'?{channel:'chromium',args:['--use-angle='+angle,'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']}:{});
let local=await createTestServer({lan:true,host:testLanHost(),port:0});
const url=local.url,port=local.httpServer.address().port,host=local.config.host;
const browsers=[],pages=[],pendingRequests=new Map(),joinFrames=new WeakMap(),browserWarnings=[];let safeArea=null;
fs.mkdirSync('test-results/lan',{recursive:true});
async function until(fn,label,timeout=10000){const end=performance.now()+timeout;while(!fn()){assert(performance.now()<end,label);await new Promise(r=>setTimeout(r,25));}}
async function open(engine,mobile){
  const browser=await launch(engine);browsers.push(browser);
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||1)}),page=await context.newPage();
  page.on('console',m=>{if(['warning','error'].includes(m.type())){browserWarnings.push(m.text());if(browserWarnings.length>30)browserWarnings.shift();}});
  pages.push(page);const pending=new Set();pendingRequests.set(page,pending);
  page.on('request',r=>pending.add(r.url()));page.on('requestfinished',r=>pending.delete(r.url()));page.on('requestfailed',r=>pending.delete(r.url()));
  page.setDefaultTimeout(90000);page.on('pageerror',e=>{errors.push(e.message);console.error('LAN page error',e.message);});page.on('requestfailed',r=>console.error('LAN request failed',r.url(),r.failure()));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.2,mobileAutoFire:false,autoReload:false})));
  // Readiness is the fully loaded game below, not the window load event (which
  // can still be waiting on unrelated media in a Windows software browser).
  await page.goto(url+'/fps/?network=lan&test&realtime',{waitUntil:'domcontentloaded'});
  try{await page.waitForFunction(()=>window.__fps||document.querySelector('#fatal pre').textContent);}catch(e){console.error(await page.locator('body').innerText({timeout:5000}).catch(()=>'(page unresponsive)'),errors);throw e;}
  assert(await page.locator('#fatal').evaluate(e=>e.hidden),await page.locator('#fatal').textContent());
  assert.equal(await page.locator('#network-endpoint').inputValue(),url);
  const features=await page.evaluate(()=>{const gl=__fps.renderer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');return {secure:isSecureContext,subtle:!!crypto.subtle,touch:__fps.mobile.enabled,map:__fps.world.project?.name,fullscreen:!!document.documentElement.requestFullscreen,renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER)};});
  assert.equal(features.secure,false,'actual private-IP HTTP must exercise the insecure-context path');assert.equal(features.subtle,false);assert.equal(features.touch,mobile);
  if(engine==='chromium'&&angle==='swiftshader')assert.match(features.renderer,/SwiftShader/,'Software CI must exercise real SwiftShader WebGL');
  rows.push({engine,mobile,version:browser.version(),features});console.log('LAN scene ready',engine,mobile,features.renderer);
  return page;
}
async function form(page,{id='',code='private-123'}={}){
  joinFrames.set(page,await page.evaluate(()=>__fps.renderBudget.stats.active));
  await page.locator('#network-name').fill('LAN '+(page===a?'desktop':'mobile'));
  await page.locator('#network-code').fill(code);await page.locator('#network-room').fill(id);
  await page.locator(`[data-create="${!id}"]`).click();
}
async function joined(page){
  await page.waitForFunction(()=>__fps.network?.view.player?.alive&&!document.querySelector('#hud').hidden);
  await page.waitForFunction(before=>__fps.renderer.stats.drawCalls>0&&__fps.renderBudget.stats.active>before,joinFrames.get(page));
  assert(await page.locator('#fatal').evaluate(e=>e.hidden),await page.locator('#fatal pre').textContent());
}
async function leave(page){await page.keyboard.press('Escape');await page.locator('#restart').click();await page.locator('.network-form').waitFor();}
async function touchGesture(page,engine){
  const zone=await page.locator('[data-mobile-stick-zone]').boundingBox(),look=await page.locator('[data-mobile-look]').boundingBox(),button=await page.locator('[data-mobile-action=fire]').boundingBox();
  const points=[{id:1,x:zone.x+zone.width*.35,y:zone.y+zone.height*.7},{id:2,x:look.x+look.width*.22,y:look.y+look.height*.2},{id:3,x:button.x+button.width/2,y:button.y+button.height/2}];
  if(engine==='chromium'){
    const cd=await page.context().newCDPSession(page);await cd.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:points});
    await cd.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...points[0],y:points[0].y-42},{...points[1],x:points[1].x+24},points[2]]});
    return async()=>{await cd.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cd.detach();};
  }
  // WebKit Playwright exposes taps, not a multi-contact injection protocol.
  // Use its real DOM handlers with synthetic PointerEvents and label it as such.
  await page.evaluate(points=>{
    const selectors=['[data-mobile-stick-zone]','[data-mobile-look]','[data-mobile-action=fire]'];
    window.__lanPointers=points.map((p,i)=>({p,element:document.querySelector(selectors[i])}));
    for(const {p,element} of __lanPointers)element.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerType:'touch',pointerId:p.id,clientX:p.x,clientY:p.y}));
    for(const [i,{p,element}] of __lanPointers.entries())element.dispatchEvent(new PointerEvent('pointermove',{bubbles:true,pointerType:'touch',pointerId:p.id,clientX:p.x+(i===1?24:0),clientY:p.y-(i===0?42:0)}));
  },points);
  return ()=>page.evaluate(()=>{for(const {p,element} of __lanPointers)element.dispatchEvent(new PointerEvent('pointerup',{bubbles:true,pointerType:'touch',pointerId:p.id}));delete window.__lanPointers;});
}
let a,b;
try{
  if(protocolPeer){
    b=await open(mobileEngine,true);a=await createTestPeer(url);
    console.log('LAN one rendered mobile client and a real Colyseus SDK peer');
  }else{
    a=await open(desktopEngine,false);
    // Each physical device has its own GPU. Suspend only the empty first lobby
    // while the peer loads, so two animated previews cannot starve one CI CPU.
    // Both pages are active before creating a room or asserting gameplay.
    const setup=desktopEngine==='chromium'?await a.context().newCDPSession(a):null;
    await setup?.send('Page.setWebLifecycleState',{state:'frozen'});
    try{b=await open(mobileEngine,true);}finally{await setup?.send('Page.setWebLifecycleState',{state:'active'});await setup?.detach();}
    console.log('LAN both pages active before room creation');
  }
  await b.screenshot({path:`test-results/lan/${mobileEngine}-lobby.png`});
  let id;
  if(protocolPeer)id=a.room.roomId;
  else{await form(a);await joined(a);id=await a.locator('#network-room').inputValue();}
  await form(b,{id,code:'wrong-123'});await b.locator('#network-status').filter({hasText:'Fel privat'}).waitFor();
  assert.equal([...local.rooms][0].clients.length,1,'wrong code cannot allocate the second player');
  await form(b,{id});await joined(b);const room=[...local.rooms][0];await until(()=>room.sim.game.actors.length===2,'two humans');
  console.log('LAN two humans joined');
  assert.equal(room.state.doors.size,51);assert.equal(room.sim.sourceHash,CONTRACT.mapHash);
  if(mobileEngine==='chromium'){
    const cd=await b.context().newCDPSession(b);
    await cd.send('Emulation.setSafeAreaInsetsOverride',{insets:{left:44,right:34,top:0,bottom:21}});
    const fire=await b.locator('[data-mobile-action=fire]').boundingBox(),pause=await b.locator('[data-mobile-action=pause]').boundingBox();
    assert(fire.x+fire.width<=844-34&&pause.x+pause.width<=844-34,'emulated right safe area stays clear');
    safeArea={left:44,right:34,bottom:21,method:'Chromium CSS environment override'};
    await cd.send('Emulation.setSafeAreaInsetsOverride',{insets:{left:0,right:0,top:0,bottom:0}});await cd.detach();
  }
  const player=room.sim.game.actors.find(x=>x.id==='counterAnalysts-0'),before={x:player.x,z:player.z,yaw:player.yaw,ammo:player.inventory.primary.ammo};
  const release=await touchGesture(b,mobileEngine);
  await b.waitForFunction(()=>{const c=__fps.input();return c.forward>.2&&c.fire&&__fps.mobile.stickId!==null&&__fps.mobile.lookId!==null;});
  await until(()=>Math.hypot(player.x-before.x,player.z-before.z)>.15&&player.inventory.primary.ammo<before.ammo&&Math.abs(player.yaw-before.yaw)>.01,'simultaneous move/look/fire reach authority');
  if(protocolPeer)await until(()=>{const p=a.room.state.actors.get(player.id);return p&&Math.hypot(p.x-before.x,p.z-before.z)>.15&&p.ammo<before.ammo;},'protocol peer receives the browser movement and shots');
  await release();await b.waitForFunction(()=>!__fps.mobile.state.fire&&__fps.mobile.stickId===null&&__fps.mobile.lookId===null);
  const shots=before.ammo-player.inventory.primary.ammo;console.log('LAN move/look/fire reached authority');
  await b.locator('[data-mobile-action=reload]').tap();await until(()=>player.inventory.primary.ammo===30,'mobile reload');
  const tick=room.sim.tickNumber;await b.setViewportSize({width:390,height:844});await b.waitForFunction(()=>__fps.modal==='pause');
  assert.equal(await b.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);
  await b.setViewportSize({width:844,height:390});assert.equal(await b.evaluate(()=>__fps.modal),'pause');
  await b.locator('#resume').tap();await b.waitForFunction(()=>__fps.modal===null&&__fps.audio.context?.state==='running');
  assert(room.sim.tickNumber>tick,'mobile orientation never pauses authority');
  // Real audio-context suspension plus a normal Resume gesture.
  await b.evaluate(()=>__fps.audio.context.suspend());await b.keyboard.press('Escape');await b.locator('#resume').tap();
  await b.waitForFunction(()=>__fps.audio.context.state==='running');
  // Synthetic background signal exercises the production pause handler. Device
  // OS suspension/audio interruptions remain a physical-device check.
  await b.evaluate(()=>window.dispatchEvent(new Event('blur')));await b.waitForFunction(()=>__fps.modal==='pause');
  assert.equal(await b.evaluate(()=>__fps.audio.active.size+__fps.audio.ambient.length),0);await b.locator('#resume').tap();
  await b.screenshot({path:`test-results/lan/${mobileEngine}-game.png`});
  console.log('LAN audio, rotation and background checks passed');
  // Network loss on the real transport; retain the former session to verify its
  // timers, callbacks, prediction and buffers have all been released.
  await b.evaluate(()=>{window.__oldLanSession=__fps.network;});
  await room.clients.find(c=>c.sessionId===room.state.actors.get(player.id).sessionId).ref.terminate();
  await b.locator('#network-status').filter({hasText:'Anslutningen bröts'}).waitFor();
  await until(()=>room.clients.length===1&&room.sim.game.actors.length===1,'departed seat cleanup');
  const cleanup=await b.evaluate(()=>{const n=__oldLanSession;return {closed:n.closed,room:n.room,predict:n.predict,watchdog:n.watchdog,callbacks:n.unsub.length,events:n.events.length,remotes:n.remote.size,voices:__fps.audio.active.size+__fps.audio.ambient.length};});
  assert.deepEqual(cleanup,{closed:true,room:null,predict:null,watchdog:null,callbacks:0,events:0,remotes:0,voices:0});
  console.log('LAN transport loss cleaned up');
  // Rejoin and rendered leave cycles at both requested landscape sizes.
  for(let i=0;i<4;i++){
    await b.setViewportSize(i%2?{width:932,height:430}:{width:844,height:390});
    await form(b,{id});await joined(b);await b.waitForFunction(()=>__fps.game.actors.length===2);
    const bounds=await b.locator('[data-mobile-action=fire]').boundingBox();assert(bounds.x>=0&&bounds.y>=0&&bounds.x+bounds.width<=b.viewportSize().width&&bounds.y+bounds.height<=b.viewportSize().height);
    await leave(b);await b.waitForFunction(()=>__fps.renderBudget.stillOwner===__fps.game);
    assert(await b.locator('#fatal').isHidden());await until(()=>room.clients.length===1,'leave cleanup');
  }
  await form(b,{id});await joined(b);
  await local.close();await Promise.all((protocolPeer?[b]:[a,b]).map(p=>p.locator('#network-status').filter({hasText:'Anslutningen bröts'}).waitFor()));
  if(protocolPeer){await until(()=>a.closed,'protocol peer observes server shutdown');assert.deepEqual(a.errors,[]);}
  await until(()=>!local.httpServer.listening,'server stopped');
  local=await createTestServer({lan:true,host,port});
  await form(b,{id});await b.locator('#network-status').filter({hasText:'finns inte'}).waitFor();
  let fresh;
  if(protocolPeer){a=await createTestPeer(url);fresh=a.room.roomId;}
  else{await form(a);await joined(a);fresh=await a.locator('#network-room').inputValue();}
  assert.notEqual(fresh,id);
  await form(b,{id:fresh});await joined(b);await leave(b);
  if(protocolPeer){assert.deepEqual(a.errors,[]);await a.close();}else await leave(a);
  await until(()=>local.rooms.size===0,'last player disposes room');
  assert.deepEqual(errors,[]);
  const result={status:'PASS',hostPlatform:process.platform,physicalDevices:false,privateIPv4:true,secureContext:false,contract:CONTRACT,browsers:rows,renderedClients:pages.length,peer:protocolPeer?'Colyseus SDK (no renderer)':'second rendered browser',shots,
    safeAreaEmulation:safeArea,touchInput:mobileEngine==='chromium'?'Chromium multi-contact protocol':'WebKit synthetic PointerEvents',audioResume:true,rotation:true,backgroundSignal:'synthetic blur',wrongCode:true,disconnectCleanup:cleanup,renderedRejoins:4,serverRestart:true,emptyRooms:local.rooms.size,errors};
  fs.writeFileSync(`test-results/lan/${desktopEngine}-${mobileEngine}.json`,JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){
  const pending=pages.map(page=>[...pendingRequests.get(page)]);
  const probes=await Promise.all([...new Set([url+'/health',...pending.flat()])].slice(0,8).map(async url=>{try{const r=await fetch(url,{signal:AbortSignal.timeout(3000)});return {url,status:r.status,bytes:(await r.arrayBuffer()).byteLength};}catch(e){return {url,error:String(e)};}}));
  const bounded=promise=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve({error:'Diagnostic timed out'}),5000))]);
  const {connections,trace:httpTrace=[]}=await bounded(local.diagnostics());
  const clients=await Promise.all(pages.map(page=>bounded(page.evaluate(()=>{const gl=window.__fps?.renderer.renderer.getContext(),ext=gl?.getExtension('WEBGL_debug_renderer_info');return {ready:document.readyState,loading:document.querySelector('#loading')?.textContent,connection:document.querySelector('#network-status')?.textContent,modal:window.__fps?.modal,renderer:gl?.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),resources:performance.getEntriesByType('resource').slice(-8).map(r=>({name:r.name,duration:r.duration,bytes:r.transferSize}))};}).catch(e=>({error:String(e)})))));
  const pendingPaths=new Set(pending.flat().map(u=>new URL(u).pathname)),httpPending=httpTrace.filter(row=>!row.finishedMs||pendingPaths.has(new URL(row.path,url).pathname));
  for(const [i,page] of pages.entries())if(!page.isClosed())await page.screenshot({path:`test-results/lan/failure-${mobileEngine}-${i}.png`,timeout:5000}).catch(()=>{});
  fs.writeFileSync(`test-results/lan/failure-${mobileEngine}.json`,JSON.stringify({error:String(error),errors,browsers:rows,pending,probes,connections,clients,browserWarnings,httpPending},null,2));console.error('LAN pending requests',JSON.stringify({pending,probes,connections,clients,browserWarnings,httpPending}));throw error;
}finally{await Promise.all(browsers.map(b=>b.close()));if(protocolPeer)await a?.close();await local.close();}
