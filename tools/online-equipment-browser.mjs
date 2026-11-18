import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
import {glassCrossing} from './network-glass-fixture.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],errors=[];
async function until(check,label){
  const start=performance.now();
  while(!await check()){assert(performance.now()-start<25000,label);await delay(50);}
}
async function lobby(mobile){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  browsers.push(browser);
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:mobile,hasTouch:mobile});
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0})));
  await page.goto(local.url+'/fps/?network=local&test&realtime');
  await page.locator('#network-code').fill('floor-five');
  return page;
}
try{
  const desktop=await lobby(false),mobile=await lobby(true);
  await desktop.locator('[data-create=true]').click();
  await desktop.locator('#room-primary').selectOption('ar47');
  await desktop.locator('#room-ready').click();await desktop.locator('#room-start').click();
  await desktop.locator('#resume').waitFor();
  const room=[...local.rooms][0],game=room.sim.game,host=[...room.seats.values()][0].actor;
  assert.equal(room.bots.size,9);assert.equal(host.weapon,'ar47');
  await mobile.locator('#network-room').fill(room.roomId);await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#resume').tap();assert.equal(room.bots.size,8);
  const guest=[...room.seats.values()].find(s=>s.actor!==host).actor;
  // Move the shooter's test spawn onto the normal of an existing clear pane.
  const crossing=glassCrossing(game.world);
  Object.assign(host,crossing.pose);
  await desktop.waitForFunction(yaw=>Math.abs(__fps.game.player.yaw-yaw)<.01,crossing.pose.yaw);
  await resumeDesktop(desktop);
  await desktop.mouse.down({button:'right'});
  try{
    await until(()=>host.aimAmount>.6,'right mouse reaches authority');
    await desktop.waitForFunction(()=>__fps.renderer.camera.fov<68);
    await desktop.mouse.down();
    try{await until(()=>room.state.brokenGlass.has(crossing.pane.id),'aimed shot broke pane');}
    finally{await desktop.mouse.up();}
  }finally{await desktop.mouse.up({button:'right'});}
  for(const p of [desktop,mobile])await p.waitForFunction(id=>__fps.world.glass.panes.get(id).broken,crossing.pane.id);
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
  await until(()=>game.state.time>guest.nextShot,'throw ready');await until(async()=>await fire.textContent()==='KASTA','throw label');
  const t=await fire.boundingBox();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:3,x:t.x+t.width/2,y:t.y+t.height/2}]});
  try{
    await until(()=>guest.inventory.he===0,'one touch throw');
    await desktop.waitForFunction(id=>__fps.game.state.grenades.some(g=>g.ownerId===id),guest.id);
  }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  await until(()=>!game.state.grenades.some(g=>g.owner===guest),'authority detonated HE');
  for(const p of [desktop,mobile])assert(await p.locator('#fatal').isHidden());
  assert.deepEqual(errors,[]);
  console.log('PASS two rendered clients, eight BotControllers, desktop ADS/glass/equipment and simultaneous mobile movement/ADS/fire/HE.');
}finally{for(const b of browsers)await b.close();await local.close();}
