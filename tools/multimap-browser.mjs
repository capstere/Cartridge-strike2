// Rendered multiplayer play and measurements. Start in the repo root.
// FPS_MAP_CASE=desktop|mobile|four|floor node tools/multimap-browser.mjs
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rm, writeFile} from 'node:fs/promises';
import {arch, cpus, platform, tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium, devices} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';

const cases = {
  desktop: {actors:10, bots:9, family:true, video:true},
  mobile: {actors:2, bots:0, mobile:true},
  four: {actors:4, bots:0},
  floor: {actors:10, bots:9, family:true, floor:true},
};
const name = process.env.FPS_MAP_CASE || 'desktop';
const spec = cases[name];
assert(spec, 'Choose desktop, mobile, four or floor');
const floor = 'floor5-prepared', arena = 'compact-arena', map = spec.floor ? floor : arena;
const out = process.env.FPS_MAP_OUT || 'test-results/multiplayer-maps';
await mkdir(out, {recursive:true});
const fixture = await startPilotFixture({familyRoom:true, host:'127.0.0.1',
  testMatch:{durationSeconds:45, scoreTarget:150, countdownSeconds:1}});
const startAt = performance.now();
const headed = process.env.FPS_NETWORK_HEADED === '1';
const gpu = process.env.FPS_NETWORK_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const args = ['--use-angle=' + gpu, '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
  '--disable-renderer-backgrounding', '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', ...fixture.args];
if (process.env.WAYLAND_DISPLAY) args.push('--ozone-platform=wayland');
const errors = [], peers = [], phases = [];
const code = 'compact-render-test';
let browser, page, room, mousePoint;
const result = {scenario:name, map, physicalPhone:false, transport:'TLS loopback', date:new Date().toISOString(),
  revision:execFileSync('git', ['rev-parse','HEAD'], {encoding:'utf8'}).trim(), buildHash:CONTRACT.buildHash,
  manifestHash:createHash('sha256').update(await readFile('build-info.json')).digest('hex'),
  cpu:cpus()[0].model, arch:arch(), os:platform(), node:process.version,
  model:await readFile('/proc/device-tree/model','utf8').then(s=>s.replaceAll('\0','')).catch(()=>null),
  warmupMs:3000, windowMs:10000, scheduledSeconds:45, scoreTarget:150, args:args.filter(a=>!a.includes('certificate')),
  renderedClients:1, sdkPeers:spec.actors - spec.bots - 1, phaseLog:phases};
const mark = msg => { phases.push({step:msg, elapsedMs:Math.round(performance.now()-startAt)}); console.log(name, msg); };
async function until(check, reason, timeout=90000) {
  const end = performance.now() + timeout;
  while (!await check()) { assert(performance.now()<end, reason); await delay(75); }
}
function stats(raw) {
  const a = [...raw].sort((x,y)=>x-y);
  assert(a.length,'The sample window must contain observations');
  const at = p => +a[Math.max(0,Math.ceil(a.length*p)-1)].toFixed(2);
  return {n:a.length,min:at(0),p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};
}

// No test query, camera replacement, simulated rendering, or edits to actor state.
// Observe completed Three.js frames, resource ownership and world identity.
async function observe() {
  const path = performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/src/fps/render.mjs'))?.name;
  const {Renderer} = await import(path || '/src/fps/render.mjs?v=floor5-environment-1');
  const observed = window.mapProbe = {frames:[], collecting:false, renderers:[], last:null};
  const draw = Renderer.prototype.render, dispose = Renderer.prototype.dispose;
  Renderer.prototype.render = function(...args) {
    const started = performance.now();
    const result = draw.apply(this,args);
    if(observed.last?.deref() !== this) {
      observed.last = new WeakRef(this);
      if(!observed.renderers.some(ref=>ref.deref()===this)) observed.renderers.push(observed.last);
    }
    if(observed.collecting) {
      const info = this.renderer.info;
      observed.frames.push([started, performance.now()-started, this.stats.drawCalls, this.stats.triangles,
        info.memory.geometries, info.memory.textures, this.renderer.getPixelRatio()]);
    }
    return result;
  };
  observed.disposed = 0;
  Renderer.prototype.dispose = function(...args) {
    const open = !this.presentationDisposed;
    try { return dispose.apply(this,args); } finally { if(open) observed.disposed++; }
  };
}

async function renderedResources() {
  return page.evaluate(()=>{
    const r = window.mapProbe.last?.deref();
    if(!r) return null;
    const gl = r.renderer.getContext();
    const backend = gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER);
    return {projectId:r.world.project.projectId, level:r.world.project.name, backend,
      buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight], quality:r.settings.graphics, ...r.renderer.info.memory,
      programs:r.renderer.info.programs.length, owners:mapProbe.renderers.length, disposals:mapProbe.disposed,
      reachableOwners:mapProbe.renderers.filter(ref=>ref.deref()).length,
      liveOwners:mapProbe.renderers.filter(ref=>ref.deref() && !ref.deref().presentationDisposed).length};
  });
}
function localSeat() { return [...room.seats.values()].find(s=>s.actor?.name==='Mapptest'); }
async function acknowledge(id) {
  await until(()=>room.state.mapId===id && localSeat()?.ready, 'Authority confirmed map and loading seat');
  await until(async()=>(await renderedResources())?.projectId===room.sim.game.world.project.projectId,
    'Browser drew the selected LevelProject');
}
async function selectMap(id) {
  const start = performance.now();
  await page.locator('#room-map').selectOption(id);
  await acknowledge(id);
  return Math.round(performance.now()-start);
}
async function addPeer(index) {
  const context = await browser.newContext({ignoreHTTPSErrors:true});
  peers.push(context);
  const reply = await context.request.post(fixture.origin+'/pilot/session', {form:{invite:fixture.invite}, headers:{Origin:fixture.origin}, maxRedirects:0});
  assert.equal(reply.status(),303);
  const peer = await context.newPage();
  await peer.goto(fixture.origin+'/shared/multiplayer/build.mjs');
  await peer.evaluate(async({id,code,index})=>{
    const build = await import('/shared/multiplayer/build.mjs');
    await import('/vendor/colyseus/colyseus.js');
    const room = await new Colyseus.Client(location.origin).joinById(id, {contract:build.CONTRACT,
      name:'Spelare '+index, team:index%2 ? 'counterAnalysts' : 'analysts', code});
    window.mapPeerRoom = room;
    room.onMessage('clock-probe',token=>room.send('clock-echo',token));
    room.onMessage('events',()=>{});
    room.onMessage('problem',message=>{window.mapPeerProblem=message;});
    let acknowledged;
    const ready = () => {
      const s = room.state;
      const owner = [...(s.actors?.values()||[])].find(a=>a.sessionId===room.sessionId);
      const contract = build.MAP_CONTRACTS?.[s.mapId];
      if(!owner || !contract || s.worldRevision===acknowledged) return;
      acknowledged=s.worldRevision;
      room.send('ready',{...contract,worldRevision:s.worldRevision});
    };
    room.onStateChange(ready);
    ready();
  },{id:room.roomId,code,index});
  await until(()=>[...room.seats.values()].find(s=>s.actor?.name==='Spelare '+index)?.ready,'Late joining SDK peer loaded selected map');
  await peer.evaluate(()=>{
    const r = window.mapPeerRoom, own = [...r.state.actors.values()].find(s=>s.sessionId===r.sessionId);
    r.send('match',{kind:'ready',ready:true,matchId:r.state.matchId,controlEpoch:own.controlEpoch});
  });
}

async function walkAndFire(mobile) {
  const a = localSeat().actor, before = {x:a.x,z:a.z,ammo:a.inventory.primary.ammo,life:a.lifeId};
  const distance = () => Math.hypot(a.x-before.x, a.z-before.z);
  if(mobile) {
    const cdp = await page.context().newCDPSession(page);
    const box = await page.locator('[data-mobile-stick-zone]').boundingBox(); assert(box);
    const point = {id:1,x:box.x+box.width*.35,y:box.y+box.height*.72};
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[point]});
      await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...point,y:point.y-55}]});
      await until(()=>distance()>.5,'Thumbstick movement reached authority',4500);
    } finally { await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); }
    const fire = await page.locator('[data-mobile-action=fire]').boundingBox(); assert(fire);
    try {
      await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:2,x:fire.x+fire.width/2,y:fire.y+fire.height/2}]});
      await until(()=>a.inventory.primary.ammo<before.ammo,'Mobile shot acknowledged',3500);
    } finally { await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await cdp.detach(); }
  } else {
    await page.keyboard.down('w');
    try { await until(()=>distance()>.5,'Desktop movement reached authority',4500); }
    finally { await page.keyboard.up('w'); }
    await page.mouse.down({button:'right'});
    try { await until(()=>localSeat().aim===true||a.aiming===true,'Right-click aiming reached authority',3500); }
    finally { await page.mouse.up({button:'right'}); }
    await until(()=>!localSeat().aim&&!a.aiming,'Released aim reached authority',3500);
    await page.mouse.down();
    try { await until(()=>a.inventory.primary.ammo<before.ammo,'Desktop shot acknowledged',3500); }
    finally { await page.mouse.up(); }
  }
  assert.equal(a.lifeId,before.life);
  return {distanceM:+distance().toFixed(2), ammoBefore:before.ammo, ammoAfter:a.inventory.primary.ammo, rightClickAim:mobile?undefined:true, team:a.team};
}

async function sample() {
  const tick = room.fixedTick, tickCosts = [], tickGaps = [];
  let previous;
  room.fixedTick = function(...args) {
    const now=performance.now();
    if(previous!==undefined) tickGaps.push(now-previous);
    previous=now;
    try { return tick.apply(this,args); } finally { tickCosts.push(performance.now()-now); }
  };
  let frames;
  try {
    await page.evaluate(()=>{mapProbe.frames.length=0;mapProbe.collecting=true;});
    await delay(result.windowMs);
    frames=await page.evaluate(()=>{mapProbe.collecting=false;return mapProbe.frames.splice(0);});
  } finally {room.fixedTick=tick;}
  assert(frames.length>=4,'At least four rendered frames');
  assert.equal(room.state.phase,'active');
  const gaps=frames.slice(1).map(([t],i)=>t-frames[i][0]);
  return {client:{frameIntervalMs:stats(gaps), renderCpuMs:stats(frames.map(f=>f[1])), draws:stats(frames.map(f=>f[2])),
      triangles:stats(frames.map(f=>f[3])), pixelRatio:stats(frames.map(f=>f[6]))},
    server:{executionMs:stats(tickCosts), intervalMs:stats(tickGaps), executionOver33:tickCosts.filter(v=>v>33).length,
      executionOver50:tickCosts.filter(v=>v>50).length, intervalOver33:tickGaps.filter(v=>v>33).length,
      rttMs:localSeat().rtt, tick:room.state.tick}, resources:await renderedResources()};
}

async function video() {
  // CDP supplies composited, timestamped JPEG frames including HUD. Encode
  // after sampling so readback, disk and video compression are outside it.
  const cdp=await page.context().newCDPSession(page), frames=[];
  cdp.on('Page.screencastFrame', event=>{
    frames.push({jpeg:event.data,at:event.metadata.timestamp});
    cdp.send('Page.screencastFrameAck',{sessionId:event.sessionId}).catch(()=>{});
  });
  await cdp.send('Page.startScreencast',{format:'jpeg',quality:84,maxWidth:1024,maxHeight:576,everyNthFrame:1});
  try {
    // Drive ordinary WASD and pointer-lock look along the real navmesh, then
    // turn to a combatant visible from the real player. No forced actor poses.
    const game=room.sim.game, visited=new Set(), end=performance.now()+12500;
    const goals=[{x:13.25,z:8.75},{x:12,z:6.5},{x:14.3,z:3.45},{x:13.25,z:8.75}];
    let index=0, lastShot=0;
    async function turnTo(target) {
      const pose=await page.evaluate(()=>{
        const r=mapProbe.last.deref(), p=r.presentationGame.player;
        return {yaw:p.yaw,pitch:p.pitch,x:p.x,z:p.z,sensitivity:r.settings.sensitivity};
      });
      const yaw=Math.atan2(pose.x-target.x,pose.z-target.z);
      const dx=Math.atan2(Math.sin(pose.yaw-yaw),Math.cos(pose.yaw-yaw));
      mousePoint.x+=dx/pose.sensitivity; mousePoint.y+=pose.pitch/pose.sensitivity;
      await page.mouse.move(mousePoint.x,mousePoint.y);
    }
    while(performance.now()<end && room.state.phase==='active') {
      const a=localSeat().actor;
      visited.add(game.world.roomAt(a.x,a.z)?.name);
      if(!a.alive){await delay(180);continue;}
      const goal=goals[index%goals.length], distance=Math.hypot(a.x-goal.x,a.z-goal.z);
      if(distance<.65) {index++;continue;}
      const waypoint=game.world.findPath(a,goal).find(n=>Math.hypot(a.x-n.x,a.z-n.z)>.28);
      if(!waypoint){await delay(150);continue;}
      const target=game.actors.find(e=>e.alive && e.team!==a.team && game.canSee(a,e));
      if(target && performance.now()-lastShot>2600) {
        await turnTo(target); await delay(160);
        await page.mouse.down(); await delay(240); await page.mouse.up(); lastShot=performance.now();
      }
      await turnTo(waypoint); await delay(55);
      await page.keyboard.down('w');
      try {await delay(Math.min(290,Math.max(90,150*Math.hypot(a.x-waypoint.x,a.z-waypoint.z))));}
      finally {await page.keyboard.up('w');}
    }
    result.videoLocations=[...visited].filter(Boolean);
  } finally {await cdp.send('Page.stopScreencast'); await cdp.detach();}
  assert(frames.length>=6,'Screencast has multiple real gameplay frames');
  return frames;
}
async function encode(frames) {
  const dir=await mkdtemp(join(tmpdir(),'cs2-map-video-'));
  try {
    const list=['ffconcat version 1.0'];
    for(const [i,f] of frames.entries()) {
      const name=i+'.jpg';
      await writeFile(join(dir,name),Buffer.from(f.jpeg,'base64'));
      list.push("file '"+name+"'");
      if(i+1<frames.length) list.push('duration '+Math.max(.001,frames[i+1].at-f.at).toFixed(6));
    }
    const path=join(dir,'frames.txt');
    await writeFile(path,list.join('\n')+'\n');
    execFileSync('ffmpeg',['-loglevel','error','-y','-f','concat','-safe','1','-i',path,
      '-vf','fps=24,scale=trunc(iw/2)*2:trunc(ih/2)*2','-c:v','libx264','-preset','veryfast','-crf','22','-pix_fmt','yuv420p',
      '-movflags','+faststart',join(out,'compact-arena.mp4')]);
    return {frames:frames.length,recordedSeconds:+(frames.at(-1).at-frames[0].at).toFixed(2)};
  } finally {await rm(dir,{recursive:true,force:true});}
}

let footage;
try {
  browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,headless:!headed,args});
  const viewport=spec.mobile ? {width:915,height:412} : {width:1024,height:576};
  const context=await browser.newContext({...spec.mobile&&devices['Pixel 7'],viewport,screen:viewport,deviceScaleFactor:1,ignoreHTTPSErrors:true});
  result.browser=browser.version(); result.viewport=viewport;
  await context.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,mobileAutoFire:false})));
  page=await context.newPage(); page.setDefaultTimeout(90000); page.on('pageerror',err=>errors.push(err.message));
  const entry=spec.family?'/room/JESPERS-ROOM':'/';
  await page.goto(fixture.origin+entry,{waitUntil:'domcontentloaded'});
  await page.locator('[name=invite]').fill(fixture.invite);
  const login=performance.now(); await page.locator('button[type=submit]').click();
  await page.locator('#network-code').waitFor(); result.signInToFormMs=Math.round(performance.now()-login);
  await page.evaluate(observe); assert.equal(await page.evaluate(()=>typeof window.__fps),'undefined');
  await page.locator('#network-name').fill('Mapptest');
  await page.locator('#network-code').fill(spec.family ? fixture.familyPassword : code);
  if(!spec.family) await page.locator('#network-fill-bots').uncheck();
  mark('enter waiting room');
  const enter=performance.now(); await page.locator('[data-create='+!spec.family+']').click();
  await page.locator('#room-ready').waitFor(); room=[...fixture.authority.rooms][0]; assert(room);
  result.enterToWaitingMs=Math.round(performance.now()-enter);
  mark('load '+map);
  if(!spec.floor) result.selectMapMs=await selectMap(map);
  else if(room.state.mapId) await acknowledge(map);
  if(spec.mobile) await page.locator('#room-team').selectOption('counterAnalysts');
  if(spec.mobile) await until(()=>localSeat()?.actor.team==='counterAnalysts','Mobile plays the opposite team');
  for(let i=1;i<=result.sdkPeers;i++) await addPeer(spec.mobile?i+1:i);
  assert.equal(room.sim.game.actors.length,spec.actors);
  assert.equal(room.bots.size,spec.bots);
  result.players={humanSlots:room.seats.size, bots:room.bots.size};
  await page.bringToFront();
  if(spec.video) await page.screenshot({path:join(out,'compact-lobby.jpg'),quality:84});
  await page.locator('#room-ready').click();
  mark('start match');
  const start=performance.now(); await page.locator('#room-start').click();
  await page.locator('#resume').waitFor(); result.startToPlayableMs=Math.round(performance.now()-start);
  if(spec.mobile) await page.locator('#resume').tap(); else mousePoint=(await resumeDesktop(page)).point;
  await until(()=>localSeat()?.enabled && room.state.phase==='active','Active controls on authority');
  await delay(result.warmupMs);
  result.controls=await walkAndFire(spec.mobile);
  mark('measure active game');
  result.measurement=await sample();
  assert(result.measurement.client.draws.min>0);
  await page.screenshot({path:join(out,name+'-game.jpg'), quality:86});
  if(spec.video) {
    mark('record gameplay');
    footage=await video();
    await page.keyboard.press('m'); await delay(300);
    await page.screenshot({path:join(out,'compact-map.jpg'),quality:86}); await page.keyboard.press('m');
    const style=await page.addStyleTag({content:'#game{z-index:2147483647!important;opacity:1!important}'});
    try { await page.screenshot({path:join(out,'compact-arena.jpg'),quality:85}); }
    finally {await style.evaluate(e=>e.remove());}
  }
  if(spec.mobile) {
    mark('reconnect');
    const old=localSeat().epoch; localSeat().client.ref.terminate();
    await until(()=>localSeat()?.epoch>old && localSeat().connected && localSeat().ready,'Same seat reconnected');
    await page.locator('#resume').tap();
    await until(()=>localSeat()?.enabled,'Reconnected mobile controls active');
    result.reconnectMap=room.state.mapId;
    assert.equal(result.reconnectMap,map);
  }
  mark('finish match');
  await page.locator('#room-rematch').waitFor();
  result.completed=JSON.parse(room.state.results);
  assert.equal(result.completed.reason,'time');
  await page.locator('#room-rematch').click();
  await until(()=>room.state.phase==='waiting','Rematch returns to same room');
  if(!spec.floor) await acknowledge(map);
  if(spec.video) {
    result.transitions=[];
    for(const id of [floor,arena,floor,arena]) {
      mark('switch '+id); const ms=await selectMap(id);
      const cdp=await context.newCDPSession(page);
      try {await cdp.send('HeapProfiler.collectGarbage');} finally {await cdp.detach();}
      result.transitions.push({id,ms,...await renderedResources()});
    }
    for(const row of result.transitions) assert.equal(row.liveOwners,1,'Only the current rendered world stays live');
    const [a,b,c,d]=result.transitions;
    assert.equal(a.level,c.level); assert.equal(b.level,d.level);
    mark('reject a damaged level and retry on the saved map');
    const route='**/levels/floor5-prepared.json';
    await page.route(route,r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
    try {
      await page.locator('#room-map').selectOption(floor);
      await page.locator('#network-code').waitFor();
      await page.locator('#network-status').filter({hasText:/mismatch|version/i}).waitFor();
      await until(()=>fixture.authority.rooms.size===0,'Failed map load released its seat');
      assert(await page.locator('#fatal').isHidden());
    } finally {await page.unroute(route);}
    await page.locator('#network-code').fill(fixture.familyPassword);
    await page.locator('[data-create=false]').click();
    await page.locator('#room-ready').waitFor(); room=[...fixture.authority.rooms][0];
    await acknowledge(floor);
    result.damagedMapRejected=true; result.retryMap=room.state.mapId;
  }
  await page.locator('#room-leave').click(); await page.locator('#network-code').waitFor();
  for(const p of peers) await p.pages()[0].evaluate(()=>mapPeerRoom.leave());
  await until(()=>fixture.authority.rooms.size===0,'All sockets and simulation released');
  assert.deepEqual(errors,[]);
  await browser.close();browser=null;
  if(footage) result.video=await encode(footage);
  result.status='PASS'; mark('complete');
} catch(error) {
  result.status='FAIL'; result.errors=errors;
  // Keep invite/session values out of Playwright diagnostics.
  const scrub=s=>String(s).replaceAll(fixture.invite,'[private]').replaceAll(fixture.familyPassword,'[private]')
    .replace(/(?:sessionId|reconnectionToken)=[^\s&]+/ig,'[session]');
  result.failure=scrub(error.stack);
  if(page) {
    result.ui=await page.evaluate(()=>({fatal:document.querySelector('#fatal')?.textContent, notice:document.querySelector('#room-notice')?.textContent,
      status:document.querySelector('#network-status')?.textContent})).catch(()=>null);
    await page.screenshot({path:join(out,name+'-failure.jpg'),quality:80,timeout:3000}).catch(()=>{});
  }
  console.error(result.failure,result.ui);process.exitCode=1;
} finally {
  try {await browser?.close();} finally {await fixture.close();}
  await writeFile(join(out,name+'.json'),JSON.stringify(result,null,2)+'\n');
}
