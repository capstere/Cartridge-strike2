import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
import {resumeDesktop} from './network-browser-resume.mjs';

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],pages=[],errors=[];
async function until(check,label){
  const start=performance.now();
  while(!await check()){assert(performance.now()-start<25000,label);await delay(50);}
}
async function lobby(mobile){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling','--disable-renderer-backgrounding']});
  browsers.push(browser);
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:mobile,hasTouch:mobile});
  pages.push(page);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0})));
  await page.goto(local.url+'/fps/?network=local');
  await page.waitForFunction(()=>document.querySelector('#network-code')||!document.querySelector('#fatal').hidden,null,{timeout:90000});
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
  await page.locator('#network-code').fill('classic-five');
  return page;
}
try{
  const desktop=await lobby(false),mobile=await lobby(true);
  await desktop.locator('#network-mode').selectOption('classic');
  await desktop.locator('#network-team').selectOption('counterAnalysts');
  await desktop.locator('#network-fill-bots').uncheck();
  await desktop.locator('[data-create=true]').click();await desktop.locator('#room-ready').waitFor();
  const room=[...local.rooms][0],game=room.sim.game;
  // Allow for scene setup during the shop and leave the round result visible for inspection.
  Object.assign(game.config,{buyTime:80,resultTime:12});
  await mobile.locator('#network-room').fill(room.roomId);await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#room-ready').tap();await desktop.locator('#room-ready').click();
  await desktop.locator('#room-start').click();await mobile.locator('#resume').tap();await resumeDesktop(desktop);
  const carrier=game.actors.find(a=>a.team==='counterAnalysts'),defender=game.actors.find(a=>a.team==='analysts');
  assert.equal(game.bomb.carrierId,carrier.id);assert.equal(carrier.inventory.primary,null);
  await desktop.keyboard.press('b');await desktop.locator('[data-item=he]').click();
  await until(()=>carrier.money===500&&carrier.inventory.he===1,'desktop bought HE');
  await desktop.waitForFunction(()=>document.querySelector('#buy-money').textContent.includes('500'));
  await desktop.locator('#return-buy').click();
  await mobile.locator('#mobile-more').tap();await mobile.locator('[data-mobile-action=buy]').tap();
  await mobile.locator('[data-item=armor]').tap();await until(()=>defender.armor===100&&defender.money===150,'mobile bought armor');await mobile.locator('#return-buy').tap();
  game.state.buyDeadline=game.state.time;await until(()=>game.phase==='active','buy phase expires');
  const rescue=game.world.anchors.rescue,h=game.hostages[0],world=game.world;
  // Place the pair outside the rescue zone with a clear approach. The player
  // acquires the follower and walks it in using keyboard input.
  const spawn=world.navigation.nodes.find(p=>{
    const d=Math.hypot(p.x-rescue.x,p.z-rescue.z);
    if(d<rescue.radius+1.9||d>rescue.radius+2.6)return false;
    return world.findPath(p,rescue).length===1&&world.segmentClear({...p,y:1},{...rescue,y:1},{vision:false});
  });
  assert(spawn);
  const d=Math.hypot(spawn.x-rescue.x,spawn.z-rescue.z);
  Object.assign(h,{x:spawn.x,z:spawn.z,y:0});
  Object.assign(carrier,{x:spawn.x+(rescue.x-spawn.x)*.7/d,z:spawn.z+(rescue.z-spawn.z)*.7/d,y:0});
  await desktop.waitForFunction(()=>document.querySelector('#prompt-text').textContent.includes('starta eskort'));
  await desktop.keyboard.down('e');
  try{await until(()=>h.escortId===carrier.id,'desktop starts escort');}finally{await desktop.keyboard.up('e');}
  const target=Math.atan2(carrier.x-rescue.x,carrier.z-rescue.z);
  const error=()=>Math.atan2(Math.sin(target-carrier.yaw),Math.cos(target-carrier.yaw));
  if(Math.abs(error())>.15){
    const key=error()>0?'ArrowLeft':'ArrowRight';await desktop.keyboard.down(key);
    try{await until(()=>Math.abs(error())<.15,'turn toward rescue');}finally{await desktop.keyboard.up(key);}
  }
  await desktop.keyboard.down('w');
  try{await until(()=>Math.hypot(carrier.x-rescue.x,carrier.z-rescue.z)<rescue.radius-.1,'walk into rescue');}
  finally{await desktop.keyboard.up('w');}
  await until(()=>h.rescued&&h.distanceWalked>1,'visible follower reached rescue');
  for(const p of [desktop,mobile])await p.waitForFunction(()=>document.querySelector('#hostage-status').textContent.includes('1/'));
  Object.assign(carrier,game.world.anchors.bomb);
  await desktop.waitForFunction(()=>document.querySelector('#prompt-text').textContent.includes('plantera'));
  await desktop.keyboard.down('e');
  try{await until(()=>carrier.action?.type==='plant','desktop hold starts');await until(()=>game.bomb.status==='planted','desktop plant finishes');}
  finally{await desktop.keyboard.up('e');}
  Object.assign(carrier,game.world.anchors.counterAnalysts[0]);Object.assign(defender,{x:game.bomb.x,z:game.bomb.z,y:0});
  const interact=mobile.locator('[data-mobile-action=interact]');
  await mobile.waitForFunction(()=>document.querySelector('#prompt-text').textContent.includes('desarmera'));
  const button=await interact.boundingBox();assert(button?.width>0);
  const cdp=await mobile.context().newCDPSession(mobile);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:button.x+button.width/2,y:button.y+button.height/2}]});
  try{
    await until(()=>defender.action?.type==='defuse','mobile hold starts');
    await mobile.waitForFunction(()=>parseFloat(document.querySelector('#action-progress').style.width)>1);
    await until(()=>game.state.result?.reason==='defuse','mobile hold finishes');
  }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
  for(const p of [desktop,mobile]){
    await p.locator('#round-result').waitFor();assert(await p.locator('#fatal').isHidden());
    assert.match(await p.locator('#round-label').textContent(),/CLASSIC/);
  }
  assert.deepEqual(errors,[]);console.log('PASS Classic two rendered clients, paid desktop and mobile buys, held plant, touch defuse and authoritative result.');
}catch(error){
 for(const page of pages)console.error(await page.evaluate(()=>({fatal:document.querySelector('#fatal pre')?.textContent,notice:document.querySelector('#room-notice')?.textContent,status:document.querySelector('#network-status')?.textContent,hud:document.querySelector('#phase')?.textContent,prompt:document.querySelector('#prompt-text')?.textContent})).catch(()=>null));
 console.error(errors);throw error;
}finally{for(const b of browsers)await b.close();await local.close();}
