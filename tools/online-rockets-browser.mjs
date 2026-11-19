import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');

const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],pages=[],errors=[];
async function until(check,label,timeout=25000){
  const end=performance.now()+timeout;
  while(!await check()){assert(performance.now()<end,label);await delay(40);}
}
async function launch(touch){
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-renderer-backgrounding','--disable-background-timer-throttling']});
  browsers.push(browser);
  const page=await browser.newPage({viewport:touch?{width:844,height:390}:{width:820,height:480},deviceScaleFactor:.5,isMobile:touch,hasTouch:touch});
  pages.push(page);page.setDefaultTimeout(85000);page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.08,autoReload:false})));
  await page.goto(local.url+'/fps/?network=local&test&realtime',{waitUntil:'domcontentloaded'});
  await page.locator('#network-code').waitFor();
  assert(await page.locator('#fatal').isHidden());
  return page;
}
async function create(desktop,mobile,mode){
  for(const [p,team] of [[desktop,'analysts'],[mobile,'counterAnalysts']]){
    await p.locator('#network-team').selectOption(team);
    await p.locator('#network-code').fill('rocket-five');
  }
  await desktop.locator('#network-mode').selectOption(mode);
  await desktop.locator('[data-create=true]').click();
  await desktop.locator('#room-start').waitFor();
  const room=[...local.rooms].find(r=>r.state.mode===mode);
  Object.assign(room.sim.game.config,{botFire:false,buyTime:70,startMoney:3900});
  await mobile.locator('#network-room').fill(room.roomId);
  await mobile.locator('[data-create=false]').tap();
  await mobile.locator('#room-ready').waitFor();
  assert.match(await mobile.locator('#room-friendly-fire-status').textContent(),/Av/);
  assert(await mobile.locator('#room-friendly-fire-label').isHidden());
  await desktop.locator('#room-friendly-fire').selectOption('on');
  await until(async()=>/På/.test(await mobile.locator('#room-friendly-fire-status').textContent()),'owner setting replicated to touch');
  if(mode==='tdm')await mobile.locator('#room-primary').selectOption('bazooka');
  await mobile.locator('#room-ready').tap();
  await desktop.locator('#room-ready').click();
  await desktop.locator('#room-start').click();
  await until(()=>room.state.phase==='active','room starts');
  return room;
}
async function pause(page){
  await page.waitForFunction(()=>__fps.network?.room?.state.phase==='active'&&__fps.modal!=='online');
  if(await page.locator('#pause').isHidden())await page.keyboard.press('Escape');
  await page.locator('#resume').waitFor();
}
async function pointDesktop(page){
  const yaw=()=>page.evaluate(()=>__fps.game.player.yaw);
  // Face the target using keyboard look if Resume retained the spawn heading.
  const start=await yaw();
  if(Math.abs(start)>.1){
    const key=start>0?'ArrowRight':'ArrowLeft';
    await page.keyboard.down(key);
    try{await until(async()=>Math.abs(await yaw())<.15,'desktop faces down the lane');}
    finally{await page.keyboard.up(key);}
  }
}
async function observe(p){
  await p.evaluate(()=>{
    const {renderer,audio}=__fps;
    const seen=window.rocketEvidence={visible:new Set(),sounds:[],events:[]};
    if(!window.observeRocketFrames){
      const render=renderer.render.bind(renderer),events=renderer.events.bind(renderer),play=audio.play.bind(audio);
      renderer.render=(...args)=>{
        render(...args);
        for(const [id,m] of renderer.actionVisuals.rockets){
          const q=m.position.clone().project(renderer.camera);
          if(m.visible&&Math.abs(q.x)<1&&Math.abs(q.y)<1&&Math.abs(q.z)<1)window.rocketEvidence.visible.add(id);
        }
      };
      renderer.events=(batch,...args)=>{window.rocketEvidence.events.push(...batch.filter(e=>e.type.startsWith('rocket-')));return events(batch,...args);};
      audio.play=(e,...args)=>{if(e.type.startsWith('rocket-'))window.rocketEvidence.sounds.push(e.type);return play(e,...args);};
      window.observeRocketFrames=true;
    }
    return seen.visible.size;
  });
}
async function fireTouch(page){
  const cdp=await page.context().newCDPSession(page);
  const box=await page.locator('[data-mobile-action=fire]').boundingBox();
  assert(box);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}]});
  return async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();};
}
async function cycle(desktop,mobile,mode){
  const room=await create(desktop,mobile,mode),game=room.sim.game,peers=[desktop,mobile];
  const [left,right]=['analysts','counterAnalysts'].map(team=>[...room.seats.values()].find(seat=>seat.actor.team===team).actor);
  const shooter=mode==='classic'?left:right,target=mode==='classic'?right:left;
  if(mode==='classic'){
    await pause(desktop);await resumeDesktop(desktop);
    await desktop.keyboard.press('b');
    const buy=desktop.locator('[data-item=bazooka]');
    assert.match(await buy.textContent(),/3600/);
    await buy.click();await until(()=>shooter.inventory.primary?.id==='bazooka'&&shooter.money===300,'buy succeeds');
    await desktop.locator('#return-buy').click();
    game.state.buyDeadline=game.state.time;
    await until(()=>room.state.roundPhase==='active','Classic becomes active');
  }else assert.equal(shooter.weapon,'bazooka');
  for(const p of peers)await pause(p);
  Object.assign(left,{x:22.8,z:-12,y:0,yaw:0,pitch:0,spawnProtectedUntil:0});
  Object.assign(right,{x:22.8,z:-20,y:0,yaw:Math.PI,pitch:0,spawnProtectedUntil:0});
  for(const [p,actor] of [[desktop,left],[mobile,right]]){
    await until(()=>p.evaluate(z=>Math.abs(__fps.game.player.z-z)<.08,actor.z),'authoritative spectator and firing position');
    await observe(p);
  }
  await mobile.locator('#resume').tap();
  await resumeDesktop(desktop);
  await pointDesktop(desktop);
  let release;
  if(mode==='tdm')release=await fireTouch(mobile);
  else {await desktop.mouse.down();release=()=>desktop.mouse.up();}
  try{await until(()=>!target.alive,'authority resolves rocket hit');}finally{await release();}
  const evidence=peers.map(p=>p.evaluate(()=>{
    const e=window.rocketEvidence,s=__fps.network.room.state;
    return {meshes:[...e.visible],events:e.events,sound:e.sounds,life:[...s.actors.values()].map(a=>[a.id,a.hp,a.alive])};
  }));
  const [a,b]=await Promise.all(evidence);
  const explosions=a.events.filter(e=>e.type==='rocket-explosion');
  assert.equal(explosions.length,1);
  const id=explosions[0].rocketId;
  for(const e of [a,b]){
    assert(e.meshes.includes(id),'rocket in the camera view before impact');
    assert.equal(e.events.filter(v=>v.rocketId===id&&v.type==='rocket-explosion').length,1);
    assert.equal(e.sound.filter(v=>v==='rocket-launch').length,1);
    assert.equal(e.sound.filter(v=>v==='rocket-explosion').length,1);
    assert.deepEqual(e.life.find(v=>v[0]===target.id),[target.id,0,false]);
  }
  assert.equal(shooter.inventory.primary.ammo,0);
  if(mode==='tdm')await mobile.locator('[data-mobile-action=reload]').tap();
  else await desktop.keyboard.press('r');
  await until(()=>shooter.inventory.primary.ammo===1&&shooter.inventory.primary.reserve===4,'reload completed on the server');
  for(const p of peers){
    if(await p.locator('#pause').isHidden())await p.keyboard.press('Escape');
    await p.locator('#restart').click();
  }
  console.log('PASS '+mode+' room setting, menu, same rendered rocket, explosion, sound and hit on both clients');
}
try{
  const desktop=await launch(false),mobile=await launch(true);
  await cycle(desktop,mobile,'tdm');
  await cycle(desktop,mobile,'classic');
  assert.deepEqual(errors,[]);
}catch(error){
  for(const p of pages)console.error(await p.evaluate(()=>({status:__fps.network?.status,modal:__fps.modal,
    actor:__fps.game.player&&{x:__fps.game.player.x,z:__fps.game.player.z,yaw:__fps.game.player.yaw,weapon:__fps.game.player.weapon},
    rocket:window.rocketEvidence&&{models:[...rocketEvidence.visible],events:rocketEvidence.events.map(e=>[e.type,e.rocketId]),sound:rocketEvidence.sounds},
    fatal:document.querySelector('#fatal pre')?.textContent})).catch(()=>null));
  throw error;
}finally{for(const b of browsers)await b.close();await local.close();}
