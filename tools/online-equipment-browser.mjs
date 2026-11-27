import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
import {verifyRoomAudio} from './network-audio-observer.mjs';
import {glassCrossing} from './network-glass-fixture.mjs';
import {resumeDesktop, waitForActiveHud} from './network-browser-resume.mjs';

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],pages=[],errors=[];
async function until(check,label){
  const start=performance.now();
  while(!await check()){assert(performance.now()-start<25000,label);await delay(50);}
}
async function lobby(mobile){
  const args=['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows'];
  if(process.env.WAYLAND_DISPLAY)args.push('--ozone-platform=wayland');
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    headless:process.env.FPS_NETWORK_HEADED!=='1',args});
  browsers.push(browser);
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:mobile,hasTouch:mobile});
  pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.08})));
  await page.goto(local.url+'/fps/?network=local');
  await page.waitForFunction(()=>document.querySelector('#network-code')||!document.querySelector('#fatal').hidden,null,{timeout:90000});
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
  await page.locator('#network-code').fill('floor-five');
  return page;
}
// Observe the same presentation instance used by the normal entry point.
async function observe(page){
  const cdp=await page.context().newCDPSession(page);
  const {result}=await cdp.send('Runtime.evaluate',{expression:"import('/src/fps/network/session.mjs').then(m=>m.NetworkSession.prototype)",awaitPromise:true});
  const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:result.objectId});
  const observation=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,functionDeclaration:'function(){window.reviewSession=Array.from(this).find(s=>s.room&&!s.closed);return !!window.reviewSession}',returnByValue:true});
  assert(observation.result.value);await cdp.detach();
}
try{
  const desktop=await lobby(false),mobile=await lobby(true);
  await desktop.locator('[data-create=true]').click();
  await desktop.locator('#room-primary').selectOption('ar47');
  await desktop.locator('#room-ready').click();await desktop.locator('#room-start').click();
  await waitForActiveHud(desktop);
  if(await desktop.locator('#pause').isHidden())await desktop.keyboard.press('Escape');
  await desktop.locator('#resume').waitFor();
  const room=[...local.rooms][0],game=room.sim.game,host=[...room.seats.values()][0].actor;
  assert.equal(room.bots.size,9);assert.equal(host.weapon,'ar47');
  await mobile.locator('#network-room').fill(room.roomId);await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#resume').tap();assert.equal(room.bots.size,8);
  await observe(desktop);await observe(mobile);
  const guest=[...room.seats.values()].find(s=>s.actor!==host).actor;
  // Move the shooter's test spawn onto the normal of an existing clear pane.
  const crossing=glassCrossing(game.world);
  await until(()=>host.alive,'host is alive before setting the glass test spawn');
  // Stage one reproducible spawn. The normal first shot ends protection immediately.
  // All eight bots continue moving and firing while the two renderers acquire their inputs.
  Object.assign(host,crossing.pose,{spawnProtectedUntil:game.state.time+30});
  const stagedLife=host.lifeId;
  await desktop.waitForFunction(({x,z,yaw})=>{
    const actor=reviewSession.view.player;
    return Math.hypot(actor.x-x,actor.z-z)<.12 && Math.abs(actor.yaw-yaw)<.01 && Math.abs(actor.pitch)<.01;
  },crossing.pose);
  await resumeDesktop(desktop);
  // A real resume gesture restores pointer lock. Align the live camera after
  // reacquisition; its previous rendered angle can belong to another life.
  await desktop.evaluate(({yaw,pitch})=>{
    const actor=reviewSession.view.player,scale=.0022;
    const heading=Math.atan2(Math.sin(actor.yaw-yaw),Math.cos(actor.yaw-yaw));
    window.dispatchEvent(new MouseEvent('mousemove',{
      movementX:Math.round(heading/scale),movementY:Math.round((actor.pitch-pitch)/scale)
    }));
  },crossing.pose);
  await until(()=>host.alive && Math.hypot(host.x-crossing.pose.x,host.z-crossing.pose.z)<.13 &&
    Math.abs(Math.atan2(Math.sin(host.yaw-crossing.pose.yaw),Math.cos(host.yaw-crossing.pose.yaw)))<.02 &&
    Math.abs(host.pitch)<.02,'live authority faces the same standing-height pane as the camera');
  await desktop.mouse.down({button:'right'});
  try{
    await until(()=>host.aimAmount>.6,'right mouse reaches authority');
    await desktop.waitForFunction(()=>document.body.classList.contains('fps-aiming'));
    await desktop.mouse.down();
    try{await until(()=>room.state.brokenGlass.has(crossing.pane.id),'aimed shot broke pane');}
    finally{await desktop.mouse.up();}
  }finally{await desktop.mouse.up({button:'right'});}
  assert.equal(host.lifeId,stagedLife,'the same real host life broke the pane');
  assert.equal(host.spawnProtectedUntil,0,'normal gunfire removed setup protection');
  for(const p of [desktop,mobile])await p.waitForFunction(id=>reviewSession.world.glass.panes.get(id).broken,crossing.pane.id);
  await desktop.keyboard.press('r');await until(()=>host.reloadUntil>0,'desktop reload');
  await desktop.keyboard.press('2');await until(()=>host.weapon==='p9'&&!host.reloadUntil,'switch cancels reload');
  const before=host.inventory.primary.ammo;
  await desktop.keyboard.press('b');await desktop.locator('[data-item=sniper]').click();
  await until(()=>host.loadout==='sniper','pending equipment');await desktop.locator('#return-buy').click();
  assert.equal(host.inventory.primary.ammo,before);assert.equal(host.inventory.primary.id,'ar47');

  const aim=mobile.locator('[data-tactical-aim]'),fire=mobile.locator('[data-mobile-action=fire]');
  await aim.tap();await until(()=>guest.aimAmount>.5,'touch ADS');
  const cdp=await mobile.context().newCDPSession(mobile);
  const zone=await mobile.locator('[data-mobile-stick-zone]').boundingBox(),trigger=await fire.boundingBox();
  const stick={id:1,x:zone.x+zone.width*.4,y:zone.y+zone.height*.65},finger={id:2,x:trigger.x+trigger.width/2,y:trigger.y+trigger.height/2};
  const origin={x:guest.x,z:guest.z},ammo=guest.inventory.primary.ammo;
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[stick]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...stick,y:stick.y-36}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...stick,y:stick.y-36},finger]});
  try{await until(()=>guest.aiming&&guest.inventory.primary.ammo<ammo&&Math.hypot(guest.x-origin.x,guest.z-origin.z)>.08,'simultaneous touch movement, aim and fire');}
  finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});}
  await mobile.locator('#mobile-more').tap();
  await mobile.locator('[data-mobile-action=grenade]').tap();await until(()=>guest.weapon==='he','touch grenade selected');
  await until(()=>game.state.time>guest.nextShot,'throw ready');await until(async()=>await fire.textContent()==='THROW','throw label');
  // A single hold must begin after the matching client snapshot has made the
  // selected grenade usable, including its predicted switch cooldown.
  await mobile.waitForFunction(()=>{
    const session=reviewSession,self=session.room.state.actors.get(session.localPlayerId);
    return self.weapon==='he'&&self.he>0&&!session.trigger
      &&session.prediction.world.game.state.time>=Math.max(session.nextCosmetic,self.nextShot);
  });
  const t=await fire.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,x:t.x+t.width/2,y:t.y+t.height/2}]});
  try{
    await until(()=>guest.cartridge?.deadline>0,'touch holds a live cartridge');
    assert.equal(guest.inventory.he,1);assert.equal(game.state.grenades.filter(g=>g.owner===guest).length,0);
  }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  await until(()=>guest.inventory.he===0,'release casts one cartridge');
  assert.equal(game.state.grenades.filter(g=>g.owner===guest).length,1);
  await desktop.waitForFunction(id=>reviewSession.view.state.grenades.some(g=>g.ownerId===id),guest.id);
  await until(()=>!game.state.grenades.some(g=>g.owner===guest),'authority detonated HE');
  await mobile.locator('#mobile-more').tap();await mobile.locator('[data-mobile-action=buy]').tap();
  const note=mobile.locator('#buy-note'),shop=mobile.locator('#shop');
  const heading=await note.boundingBox(),choices=await shop.boundingBox();
  assert(heading.height>0&&heading.y+heading.height<=choices.y+1);
  assert.match(await note.textContent(),/next respawn/);
  await mobile.locator('[data-item=cr4]').tap();await until(()=>guest.loadout==='cr4','mobile team rifle queued');
  await mobile.locator('#return-buy').tap();assert.equal(guest.weapon,'smg');assert.equal(guest.inventory.he,0);
  await verifyRoomAudio({desktop,mobile,room,host,guest,until});
  for(const p of [desktop,mobile])assert(await p.locator('#fatal').isHidden());
  assert.deepEqual(errors,[]);
  console.log('PASS two rendered clients, eight BotControllers, desktop ADS/glass/equipment and simultaneous mobile movement/ADS/fire/HE.');
}catch(error){
  for(const page of pages)console.error(await page.evaluate(()=>({fatal:document.querySelector('#fatal pre')?.textContent,room:document.querySelector('#room-notice')?.textContent,phase:document.querySelector('#room-title')?.textContent,status:document.querySelector('#network-status')?.textContent})).catch(()=>null));
  for(const room of local.rooms)console.error('Authority',room.state.phase,room.metrics,[...room.seats.values()].map(({actor,enabled,lastFire,trigger})=>({
    enabled,lastFire,trigger,life:actor.lifeId,alive:actor.alive,x:actor.x,z:actor.z,yaw:actor.yaw,pitch:actor.pitch,ammo:actor.inventory?.primary?.ammo,weapon:actor.weapon,aimAmount:actor.aimAmount})));
  console.error(errors);throw error;
}finally{for(const b of browsers)await b.close();await local.close();}
