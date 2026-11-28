// Exercise the public project subpath and the authenticated match using the shipped UI.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {once} from 'node:events';
import {mkdir,mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {enterTouchMatch} from './network-browser-resume.mjs';
import {pilot,publicSite} from './release-network-stage.mjs';

const [stagePath,outputPath,surface]=process.argv.slice(2);
assert(stagePath&&outputPath&&['loopback','internet'].includes(surface),'Usage: node tools/release-network-browser.mjs EXPORTS RECEIPTS loopback|internet');
const stage=resolve(stagePath),output=resolve(outputPath),pilotRoot=join(stage,'pilot'),siteRoot=join(stage,'site');
const {CONTRACT}=await import(pathToFileURL(join(pilotRoot,'shared/multiplayer/build.mjs')));
const tmp=await mkdtemp(join(tmpdir(),'cs3-candidate-edge-'));
const closed=[], errors=[], browsers=[], evidence={path:surface,build:CONTRACT.buildHash,protocol:CONTRACT.protocolVersion,
  date:new Date().toISOString(),physicalPhone:false,viewports:[],navigation:[],players:[]};
let step='start',edge,site;
async function cleanup(){
  for(const browser of browsers.splice(0).reverse()) await browser.close().catch(()=>{});
  for(const resource of closed.splice(0).reverse()) await resource.close();
  await rm(tmp,{recursive:true,force:true});
}
const interrupt=()=>{void cleanup().finally(()=>process.exit(130));};
process.once('SIGINT',interrupt);process.once('SIGTERM',interrupt);
async function until(read,predicate,label,milliseconds=45000){
  const deadline=Date.now()+milliseconds;
  do {const sample=await read(); if (predicate(sample)) return sample;await delay(125);} while (Date.now()<deadline);
  throw Error(label);
}
async function cachePaths(page){
  return page.evaluate(async()=>{const paths=[];
    for(const id of await caches.keys())for(const req of await (await caches.open(id)).keys())paths.push(new URL(req.url).pathname);
    return paths.sort();
  });
}
async function surfaceLoad(page,surface,visit,fn) {
  step=surface+' '+visit;console.log('Checking '+step);
  const at=Date.now();await fn();
  evidence.navigation.push({surface,visit,elapsedMs:Date.now()-at,...await page.evaluate(()=>{
    const resources=performance.getEntriesByType('resource').filter(r=>r.name.startsWith(location.origin+'/'));
    return {lang:document.documentElement.lang,resources:resources.length,cacheHits:resources.filter(r=>r.transferSize===0&&r.decodedBodySize>0).length};
  })});
}
async function snap(page,name){
  await page.screenshot({path:join(output,name+'.jpg'),type:'jpeg',quality:76,timeout:30000});
}
async function loadSite(page){
  await page.goto(site.url,{waitUntil:'domcontentloaded'});
  await page.locator('button[data-go=play]').click();
  await page.locator('button[data-go=friends]').click();
  await page.getByRole('link',{name:/quick join/i}).first().waitFor();
  assert.equal(new URL(page.url()).pathname,'/Cartridge-strike2/fps/');
  const familyLink=await page.locator('a[data-family-link]').first().getAttribute('href');
  assert.equal(new URL(familyLink,page.url()).pathname,'/room/JESPERS-ROOM');
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  assert.deepEqual(await cachePaths(page),['/Cartridge-strike2/fps/offline.html']);
}
async function openClient(number){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    headless:process.env.FPS_NETWORK_HEADED!=='1',
    args:['--use-gl=angle','--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
      ...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[]),
      ...edge.args.filter(a=>!a.startsWith('--ignore-certificate-errors-spki-list=')),
      '--ignore-certificate-errors-spki-list='+[site.pin,...edge.args.filter(a=>a.startsWith('--ignore-certificate-errors-spki-list=')).map(a=>a.slice(a.indexOf('=')+1))].join(',')]});
  browsers.push(browser);
  const viewport=number===0?{width:844,height:390}:{width:800,height:450};
  evidence.viewports.push(viewport);evidence.chromium=browser.version();
  const context=await browser.newContext({viewport,screen:viewport,isMobile:true,hasTouch:true,deviceScaleFactor:1,locale:number?'sv-SE':'en-US'});
  const page=await context.newPage();page.setDefaultTimeout(75000);
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false})));
  page.on('pageerror',e=>errors.push(e.name));
  const ws={connections:0,sent:0,received:0};
  page.on('websocket',socket=>{
    const url=new URL(socket.url());
    if(url.host!==new URL(edge.origin).host || url.protocol!=='wss:')return;
    ws.connections++;socket.on('framesent',()=>ws.sent++);socket.on('framereceived',()=>ws.received++);
  });
  return {page,context,ws};
}
const roomPath='/room/JESPERS-ROOM';
async function enterGate(member,index){
  const {page,context}=member;
  await page.goto(edge.origin+roomPath,{waitUntil:'domcontentloaded'});
  await page.getByLabel('Server invite code',{exact:true}).fill(edge.invite);
  await page.locator('button[type=submit]').tap();
  await page.locator('#network-code').waitFor();
  assert((await context.cookies()).some(c=>c.name==='__Host-cs2_pilot'&&c.secure&&c.httpOnly));
  const network=await page.evaluate(async()=>{
    const response=await fetch('/shared/multiplayer/build.mjs',{cache:'no-store'});
    const build=await import('/shared/multiplayer/build.mjs');
    return {status:response.status,cache:response.headers.get('Cache-Control'),build:build.CONTRACT.buildHash};
  });
  assert.equal(network.build,CONTRACT.buildHash);assert.equal(network.status,200);assert.match(network.cache,/private.*no-store/);
  const destination=new URL(page.url());assert.equal(destination.origin,edge.origin);assert.equal(destination.searchParams.get('family'),'JESPERS-ROOM');
  await page.waitForFunction(()=>navigator.serviceWorker.controller);
  assert.deepEqual(await cachePaths(page),[]);
  const engine=await page.evaluate(()=>{
    const gl=document.querySelector('#game').getContext('webgl2');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL||gl.RENDERER);
  });
  evidence.players.push({number:index+1,engine,authenticated:network});
}
async function joinRoom(member,name){
  const page=member.page;
  await page.locator('#network-name').fill(name);
  if(await page.locator('#network-code').evaluate(el=>el.required)) await page.locator('#network-code').fill(edge.familyPassword);
  await page.getByRole('button',{name:'Join family room',exact:true}).tap();
  await page.locator('#room-ready').waitFor();
}
async function observe(observer){
  const cdp=await observer.context.newCDPSession(observer.page);
  const {result:proto}=await cdp.send('Runtime.evaluate',{expression:'Colyseus.Room.prototype',objectGroup:'release'});
  const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:proto.objectId,objectGroup:'release'});
  return async()=>{
    const {result,exceptionDetails}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,returnByValue:true,
      functionDeclaration:`function(){
        const room=Array.from(this).find(r=>[...r.state?.actors?.values?.()||[]].some(a=>a.name==='Release guest'));
        if(!room)return null;
        const guest=[...room.state.actors.values()].find(a=>a.name==='Release guest');
        return {actor:guest.id,connected:guest.connected,life:guest.lifeId,epoch:guest.controlEpoch,ammo:guest.ammo,
          map:room.state.mapId,tick:room.state.tick,match:room.state.matchId,phase:room.state.phase};
      }`});
    assert(!exceptionDetails);return result.value;
  };
}
try{
  await mkdir(output,{recursive:true,mode:0o700});
  const manifest=await readFile(join(pilotRoot,'build-info.json'));assert(manifest.equals(await readFile(join(siteRoot,'build-info.json'))));
  evidence.manifestSha256=createHash('sha256').update(manifest).digest('hex');
  edge=await pilot(pilotRoot,tmp,surface==='internet');closed.push(edge);
  site=await publicSite(siteRoot,pilotRoot,tmp);closed.push(site);
  if (process.env.CS3_WAIT_FOR_RENDER_SLOT==='1') {
    console.log('Candidate edge ready. Waiting for the reserved Pi renderer slot on stdin.');
    await once(process.stdin,'data',{signal:AbortSignal.timeout(300000)});process.stdin.pause();
  }
  console.log('Starting public cold and cached journeys');
  const host=await openClient(0);
  await surfaceLoad(host.page,'public','cold',()=>loadSite(host.page));
  await surfaceLoad(host.page,'public','cached',()=>loadSite(host.page));
  assert(evidence.navigation.at(-1).cacheHits>0,'warm public entry must use its ordinary browser cache');
  step='profile and private gate';
  await host.page.goto(edge.origin+'/profile');
  await host.page.getByRole('heading',{name:'Local guest'}).waitFor();
  await snap(host.page,'profile-signed-out');
  evidence.unauthenticated=await host.page.evaluate(async()=>(await fetch('/shared/multiplayer/build.mjs')).status);
  assert.equal(evidence.unauthenticated,401);
  await surfaceLoad(host.page,'private','cold',()=>enterGate(host,0));
  await surfaceLoad(host.page,'private','cached',async()=>{
    await host.page.goto(edge.origin+roomPath);
    await host.page.locator('#network-code').waitFor();
    assert.equal(await host.page.locator('#network-code').inputValue(),'');
    assert.deepEqual(await cachePaths(host.page),[]);
  });
  console.log('Starting normal two-player family match');
  step='host room';
  await joinRoom(host,'Release host');
  const mode=host.page.locator('#room-mode');
  await mode.selectOption('classic');
  await host.page.locator('#room-rules').filter({hasText:'Classic'}).waitFor();
  await host.page.locator('#room-map').selectOption('compact-arena');
  await host.page.locator('#room-map-name').filter({hasText:'Compact Arena'}).waitFor();
  for (const id of ['#room-analysts-bots','#room-counter-analysts-bots']) await host.page.locator(id).selectOption('0');
  const guest=await openClient(1);step='guest room';await enterGate(guest,1);
  await joinRoom(guest,'Release guest');
  for(const player of [host,guest])await player.page.locator('#room-roster').getByText('Release guest',{exact:false}).waitFor();
  await snap(guest.page,'family-room');
  step='rendered match';await host.page.locator('#room-ready').tap();await guest.page.locator('#room-ready').tap();
  await host.page.locator('#room-start').tap();await enterTouchMatch(host.page);await enterTouchMatch(guest.page);
  const read=await observe(host),initial=await until(read,s=>s?.phase==='active'&&s.connected,'Active guest');
  await snap(guest.page,'active-match');
  await guest.page.locator('[data-mobile-action=fire]').tap();
  const fired=await until(read,s=>s?.ammo<initial.ammo,'Guest touch fire visible on host');
  step='reconnect';await edge.authority.dropGuest('Release guest');
  const resumed=await until(read,s=>s?.connected&&s.epoch>fired.epoch,'Reserved guest resumed',14500);
  assert.equal(resumed.life,fired.life);assert.equal(resumed.actor,fired.actor);assert(resumed.actor);assert.equal(resumed.match,fired.match);
  await enterTouchMatch(guest.page);
  await guest.page.locator('[data-mobile-action=fire]').tap();
  const refired=await until(read,s=>s.ammo<resumed.ammo,'Host observed guest input after reconnect');
  assert(host.ws.connections>=1 && guest.ws.connections>=2 && [host,guest].every(p=>p.ws.sent>0&&p.ws.received>0));
  evidence.room={initial,fired,resumed,refired,ws:[host.ws,guest.ws]};
  step='return from match';
  await guest.page.locator('[data-mobile-action=pause]').tap();
  await guest.page.locator('#restart').tap();await guest.page.locator('#network-name').waitFor();
  await host.page.locator('#online-room[data-phase=results] #room-leave').tap();
  await host.page.locator('#network-name').waitFor();
  evidence.forfeitResults=true;
  await joinRoom(host,'Returning host');await snap(host.page,'returned-room');
  await host.page.locator('#room-leave').tap();
  const idle=await until(async()=>await (await fetch(edge.authority.url+'/health')).json(),s=>s.rooms===0&&s.players===0,'Empty staged authority');
  assert.equal(idle.contract.buildHash,CONTRACT.buildHash);
  evidence.idle={rooms:idle.rooms,players:idle.players};assert.deepEqual(errors,[]);
  await writeFile(join(output,'report.json'),JSON.stringify({...evidence,status:'PASS'},null,2)+'\n');
  console.log('PASS '+surface+' '+CONTRACT.buildHash);
}catch(error){
  const summary=String(error.message).split('\n')[0].replace(/https?:\/\/\S+/g,'[address]');
  let diagnostic=summary;
  for (const value of [edge?.invite,edge?.familyPassword]) if(value)diagnostic=diagnostic.replaceAll(value,'[redacted]');
  console.error('Release check failed at '+step+' ('+diagnostic+')');
  process.exitCode=1;
}finally{
  await cleanup();process.off('SIGINT',interrupt);process.off('SIGTERM',interrupt);
}
