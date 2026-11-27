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
  const args=['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-renderer-backgrounding','--disable-background-timer-throttling','--disable-backgrounding-occluded-windows'];
  if(process.env.WAYLAND_DISPLAY)args.push('--ozone-platform=wayland');
  const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,
    headless:process.env.FPS_NETWORK_HEADED!=='1',args});
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
  const name=desktop.locator('#network-name');
  await name.fill('');
  await name.press('z');
  assert.equal(await name.inputValue(),'z','radio key allows typing into the lobby form');
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
  assert.equal(await mobile.locator('#room-friendly-fire-status').textContent(),'Friendly fire · Off');
  assert(await mobile.locator('#room-friendly-fire-label').isHidden());
  const difficulty=desktop.locator('#room-bot-difficulty');
  assert.equal(await difficulty.inputValue(),'normal');
  assert(await mobile.locator('#room-bot-difficulty-label').isHidden());
  await difficulty.selectOption('casual');
  await until(async()=>/Casual/.test(await mobile.locator('#room-bot-difficulty-status').textContent()),'bot difficulty replicated to touch guest');
  await difficulty.selectOption('hard');
  await until(async()=>/Hard/.test(await mobile.locator('#room-bot-difficulty-status').textContent()),'hard lobby setting replicated');
  await difficulty.selectOption('normal');
  await until(async()=>/Normal/.test(await mobile.locator('#room-bot-difficulty-status').textContent()),'default restored for rocket scenario');
  await desktop.locator('#room-friendly-fire').selectOption('on');
  await until(async()=>(await mobile.locator('#room-friendly-fire-status').textContent())==='Friendly fire · On','owner setting replicated to touch');
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
async function pointDesktop(page,actor){
  // Use the actual pointer-lock input handler. Keyboard turns can overshoot
  // a capsule eight metres away even when the camera looks approximately right.
  await page.evaluate(()=>{
    const {yaw,pitch}=__fps.input(0);
    const scale=__fps.settings.sensitivity*__fps.tactical.lookScale(false,yaw,pitch);
    const heading=Math.atan2(Math.sin(yaw),Math.cos(yaw));
    window.dispatchEvent(new MouseEvent('mousemove',{
      movementX:Math.round(heading/scale),movementY:Math.round(pitch/scale)
    }));
  });
  await until(async()=>Math.abs(actor.yaw)<.02&&Math.abs(actor.pitch)<.02&&await page.evaluate(()=>{
    const {yaw,pitch}=__fps.input(0);
    return Math.abs(Math.atan2(Math.sin(yaw),Math.cos(yaw)))<.02&&Math.abs(pitch)<.02;
  }),'desktop and authority face down the lane');
}
async function observe(p,target){
  await p.evaluate(({id,lifeId})=>{
    const {renderer,audio,network}=__fps;
    window.rocketEvidence?.unsubscribe?.();
    const seen=window.rocketEvidence={visible:new Set(),sounds:[],events:[],deaths:[],impacts:[],views:[]};
    const room=network.room;
    const snapshot=state=>{
      const actor=state.actors.get(id);
      if(actor?.lifeId===lifeId && actor.hp===0 && !actor.alive && !seen.deaths.length){
        seen.deaths.push([id,lifeId,actor.hp,actor.alive]);
      }
    };
    room.onStateChange(snapshot);
    seen.unsubscribe=()=>room.onStateChange.remove(snapshot);
    if(!window.observeRocketFrames){
      const render=renderer.render.bind(renderer),events=renderer.events.bind(renderer),play=audio.play.bind(audio);
      const visuals=renderer.actionVisuals,explode=visuals.explode.bind(visuals);
      renderer.render=(...args)=>{
        render(...args);
        for(const [id,m] of renderer.actionVisuals.rockets){
          const q=m.position.clone().project(renderer.camera);
          const samples=window.rocketEvidence.views;
          if(samples.length<32)samples.push({id,view:args[1]?.id,life:args[1]?.lifeId,
            x:q.x,y:q.y,z:q.z,t:args[0].state.time});
          if(m.visible&&Math.abs(q.x)<1&&Math.abs(q.y)<1&&Math.abs(q.z)<1)window.rocketEvidence.visible.add(id);
        }
      };
      visuals.explode=(e,t)=>{
        window.rocketEvidence.impacts.push({id:e.rocketId,visibleBefore:window.rocketEvidence.visible.has(e.rocketId)});
        return explode(e,t);
      };
      renderer.events=(batch,...args)=>{window.rocketEvidence.events.push(...batch.filter(e=>e.rocketId));return events(batch,...args);};
      audio.play=(e,...args)=>{
        const before=audio.active.size,result=play(e,...args);
        if(e.type.startsWith('rocket-'))window.rocketEvidence.sounds.push({type:e.type,id:e.rocketId,voices:audio.active.size-before});
        return result;
      };
      window.observeRocketFrames=true;
    }
  },{id:target.id,lifeId:target.lifeId});
}
async function fireTouch(page){
  const cdp=await page.context().newCDPSession(page);
  const fire=page.locator('[data-mobile-action=fire]');
  await fire.waitFor({state:'visible',timeout:15000});
  const box=await fire.boundingBox();
  assert(box);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x:box.x+box.width/2,y:box.y+box.height/2}]});
  return async()=>{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();};
}
async function setTouchHud(page,mode){
  await page.keyboard.press('Escape');
  await page.locator('#pause [data-setting=hudMode]').selectOption(mode);
  await page.locator('#resume').tap();
}
async function mapControls(desktop,mobile,room){
  const classic=room.state.mode==='classic';
  const read=page=>page.evaluate(()=>{
    const {minimapCache}=__fps;
    const panel=document.querySelector('#hud .map-panel'),edges=panel.getBoundingClientRect();
    return {open:!!panel.getClientRects().length&&minimapCache.canvas.width===448,
      legend:document.querySelector('#map-legend').textContent,locked:document.pointerLockElement?.id==='game',
      right:edges.right,aimLeft:document.querySelector('#crosshair').getBoundingClientRect().left,
      events:getComputedStyle(panel).pointerEvents,
      draws:minimapCache.stats.draws,skips:minimapCache.stats.hiddenSkips,builds:minimapCache.stats.builds,cache:minimapCache.layers.size};
  });
  const check=async page=>{
    await until(async()=>(await read(page)).open,'the map becomes visible');
    const state=await read(page);
    assert(state.right+4<=state.aimLeft && state.events==='none','map stays outside aim and lets touch through');
    assert.match(state.legend,/Arrow · You.*Dot · Team/);
    assert.equal(state.legend.includes('Bomb site'),classic);
    assert(state.cache<=2);
    return state;
  };
  const touch=async()=>{
    const controls = await mobile.evaluate(() => ({
      initialized: __fps.mobile.enabled,
      attached: Boolean(document.getElementById('mobile-more')),
      open: __fps.modal, visible: __fps.mobile.visible, alive: __fps.game.player?.alive,
      primaryCoarse: matchMedia('(pointer: coarse)').matches,
      anyCoarse: matchMedia('(any-pointer: coarse)').matches, touchPoints: navigator.maxTouchPoints,
    }));
    assert(controls.initialized && controls.attached, 'touch utility controls must exist after ordinary mobile boot: '+JSON.stringify(controls));
    await mobile.locator('#mobile-more').tap();
    await mobile.locator('[data-utility=karta]').tap();
  };

  assert(await desktop.locator('.online-map-hint').isVisible());
  assert.match(await desktop.locator('.online-map-hint').textContent(),/Z radio/);
  await desktop.keyboard.down('w');
  try{
    await desktop.keyboard.press('m');
    assert((await check(desktop)).locked);
    assert.equal(await desktop.evaluate(()=>__fps.input(0).forward),1,'keyboard movement stays held');
  }finally{await desktop.keyboard.up('w');}
  await desktop.keyboard.press('m');

  const cdp=await mobile.context().newCDPSession(mobile);
  await mobile.setViewportSize({width:932,height:430});
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{left:59,top:0,right:0,bottom:0}});
  for(const mode of ['clean','full']){
    await setTouchHud(mobile,mode);
    if(mode==='full'){
      for(const id of ['#mobile-more','[data-mobile-action=buy]'])assert(await mobile.locator(id).evaluate(button=>{
        const {x,y,width,height}=button.getBoundingClientRect();
        return x>=59&&document.elementFromPoint(x+width/2,y+height/2)===button;
      }),id+' stays inside the safe area and keeps its touch target in Full HUD');
    }
    await touch();
    const first=await check(mobile);
    await touch();
    const hidden=await read(mobile);
    assert(!hidden.open);
    await mobile.waitForFunction(skips=>__fps.minimapCache.stats.hiddenSkips>skips+1,hidden.skips);
    assert.equal((await read(mobile)).draws,hidden.draws,'hidden touch map does not draw');
    await touch();
    assert.equal((await check(mobile)).builds,first.builds,'warm reopen reuses the cached expanded map');
    await touch();
  }
  await cdp.send('Emulation.setSafeAreaInsetsOverride',{insets:{left:0,top:0,right:0,bottom:0}});
  await cdp.detach();
  await mobile.setViewportSize({width:844,height:390});
  await desktop.bringToFront();
  if(await desktop.locator('#resume').isVisible())await resumeDesktop(desktop);
  assert.equal(await desktop.evaluate(()=>document.pointerLockElement?.id),'game');
  if(classic){
    await desktop.waitForFunction(()=>document.querySelector('#bomb-status').textContent.includes('Prevent the plant and the rescue'));
    await mobile.waitForFunction(()=>document.querySelector('#bomb-status').textContent.includes('hostages')||document.querySelector('#bomb-status').textContent.includes('North Laboratory'));
  }
  console.log('PASS tactical map',room.state.mode,JSON.stringify({desktop:await read(desktop),touch:await read(mobile)}));
}
async function radioControls(desktop,mobile,mode,shooter){
  const ammo=shooter.inventory.primary?.ammo,weapon=shooter.weapon;
  const show=page=>page.locator('#team-radio-menu').waitFor({state:'visible'});
  const utility=async name=>{
    await mobile.locator('#mobile-more').tap();
    await mobile.locator('[data-utility='+name+']').tap();
  };
  if(mode==='classic'){
    await desktop.waitForFunction(()=>__fps.audio.voiceBuffers.has('together')&&__fps.audio.context.state==='running');
    await desktop.evaluate(()=>{
      const audio=__fps.audio,play=audio.play.bind(audio);
      window.playedTeamVoice=0;
      audio.play=event=>{if(event.teamPrivate&&event.command==='together')window.playedTeamVoice++;return play(event);};
    });
    await desktop.keyboard.press('z');
    await show(desktop);
    await desktop.mouse.down();
    try{
      assert.equal(await desktop.evaluate(()=>!!__fps.input(0).fire),false,'radio blocks a mouse trigger');
    }finally{await desktop.mouse.up();}
    await desktop.keyboard.press('1');
    await desktop.locator('#radio-caption').filter({hasText:'Group up'}).waitFor();
    await desktop.waitForFunction(()=>window.playedTeamVoice===1);
    assert.equal(await desktop.evaluate(()=>document.pointerLockElement?.id),'game');
    assert.equal(await mobile.evaluate(()=>__fps.network.teamSignal),null,'opposing touch client sees no Classic radio');
  }else{
    await setTouchHud(mobile,'clean');
    await utility('radio');
    await show(mobile);
    assert.equal(await mobile.evaluate(()=>__fps.network.teamSignal),null,'opening the drawer sends no command');
    await mobile.locator('#team-radio-close').tap();
    await mobile.locator('#team-radio-menu').waitFor({state:'hidden'});
    await setTouchHud(mobile,'full');
    await utility('radio');
    await show(mobile);
    await mobile.locator('[data-team-radio=ping][data-anchor=analyst-start-lift]').tap();
    await mobile.locator('#radio-caption').filter({hasText:'Cargo Lift'}).waitFor();
    assert.equal(await desktop.evaluate(()=>__fps.network.teamSignal),null,'opposing desktop sees no touch ping');
    await mobile.evaluate(()=>{
      const ctx=__fps.minimapCache.context,arc=ctx.arc.bind(ctx);
      window.teamPingRings=0;
      ctx.arc=(x,y,r,...rest)=>{if(r===8)window.teamPingRings++;return arc(x,y,r,...rest);};
    });
    await utility('karta');
    await mobile.waitForFunction(()=>window.teamPingRings>0);
    await utility('karta');
  }
  assert.equal(shooter.inventory.primary?.ammo,ammo,'radio inputs spent no ammo');
  assert.equal(shooter.weapon,weapon,'radio inputs kept the equipped weapon');
  console.log('PASS team radio controls '+mode);
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
  await mobile.locator('#resume').tap();
  await resumeDesktop(desktop);
  await mapControls(desktop,mobile,room);
  await radioControls(desktop,mobile,mode,shooter);
  for(const p of peers)await pause(p);
  Object.assign(left,{x:22.8,z:-12,y:0,yaw:0,pitch:0,spawnProtectedUntil:0});
  Object.assign(right,{x:22.8,z:-20,y:0,yaw:Math.PI,pitch:0,spawnProtectedUntil:0});
  for(const [p,actor] of [[desktop,left],[mobile,right]]){
    await until(()=>p.evaluate(z=>Math.abs(__fps.game.player.z-z)<.08,actor.z),'authoritative spectator and firing position');
    await observe(p,target);
  }
  await mobile.locator('#resume').tap();
  await resumeDesktop(desktop);
  await pointDesktop(desktop,left);
  let release;
  if(mode==='tdm')release=await fireTouch(mobile);
  else {await desktop.mouse.down();release=()=>desktop.mouse.up();}
  try{await until(()=>!target.alive,'authority resolves rocket hit');}finally{await release();}
  await until(async()=>{
    const updated=await Promise.all(peers.map(p=>p.evaluate(()=>{
      const e=window.rocketEvidence;
      return e.deaths.length && e.impacts.length && e.sounds.some(s=>s.type==='rocket-explosion');
    })));
    return updated.every(Boolean);
  },'both renderers consume the authoritative hit and explosion');
  const [a,b]=await Promise.all(peers.map(p=>p.evaluate(()=>{
    const e=window.rocketEvidence;
    return {meshes:[...e.visible],events:e.events,sounds:e.sounds,deaths:e.deaths,impacts:e.impacts};
  })));
  const explosions=a.events.filter(e=>e.type==='rocket-explosion');
  assert.equal(explosions.length,1);
  const id=explosions[0].rocketId;
  for(const e of [a,b]){
    assert(e.meshes.includes(id),'rocket in the camera view before impact');
    assert.deepEqual(e.impacts,[{id,visibleBefore:true}]);
    for(const type of ['rocket-launch','rocket-explosion']){
      assert.equal(e.events.filter(v=>v.rocketId===id&&v.type===type).length,1);
      const sounds=e.sounds.filter(v=>v.id===id&&v.type===type);
      assert.equal(sounds.length,1);
      assert(sounds[0].voices>0,type+' scheduled audible sources');
    }
    const kill=e.events.find(v=>v.type==='kill'&&v.rocketId===id&&v.actorId===target.id);
    assert(kill,'the same rocket eliminated the expected target');
    assert.deepEqual(e.deaths,[[target.id,kill.lifeId,0,false]]);
  }
  assert.equal(shooter.inventory.primary.ammo,0);
  if(mode==='tdm')await mobile.locator('[data-mobile-action=reload]').tap();
  else await desktop.keyboard.press('r');
  await until(()=>shooter.inventory.primary.ammo===1&&shooter.inventory.primary.reserve===4,'reload completed on the server');
  if(mode==='tdm'){
    // Set up match point, then decide it with a second real touch-fired rocket.
    await until(()=>target.alive,'TDM target respawns');
    for(const p of peers)await pause(p);
    Object.assign(left,{x:22.8,z:-12,y:0,yaw:0,pitch:0,spawnProtectedUntil:0});
    Object.assign(right,{x:22.8,z:-20,y:0,yaw:Math.PI,pitch:0,spawnProtectedUntil:0});
    for(const [p,actor] of [[desktop,left],[mobile,right]]){
      await until(()=>p.evaluate(z=>Math.abs(__fps.game.player.z-z)<.08,actor.z),'match point position');
      await observe(p,target);
    }
    game.state.score[shooter.team]=room.state.scoreTarget-1;
    await mobile.locator('#resume').tap();
    await resumeDesktop(desktop);
    const attemptedRematches=[];
    const command=room.match.command.bind(room.match);
    room.match.command=(client,message)=>{
      if(message?.kind==='rematch')attemptedRematches.push(message.matchId);
      return command(client,message);
    };
    const stop=await fireTouch(mobile);
    try{
      await until(()=>room.state.phase==='results','rocket decides the match');
      await mobile.locator('#room-rematch').waitFor();
    }finally{await stop();}
    for(const p of peers){
      await p.bringToFront();
      await until(()=>p.evaluate(()=>{
        const session=__fps.network;
        return session.room.state.phase==='results'&&session.view.state.time>session.room.state.time+.35
          &&rocketEvidence.events.some(e=>e.type==='rocket-explosion')&&rocketEvidence.sounds.some(s=>s.type==='rocket-explosion'&&s.voices>0);
      }),'deciding impact persists through result patches');
      assert.deepEqual(attemptedRematches,[],'release of the deciding touch fire triggers no rematch');
      await p.locator('#room-leave').click();
    }
  }else{
    for(const p of peers){
      if(await p.locator('#pause').isHidden())await p.keyboard.press('Escape');
      await p.locator('#restart').click();
    }
  }
  console.log('PASS '+mode+' room setting, menu, same rendered rocket, explosion, sound and hit on both clients');
}
try{
  const desktop=await launch(false),mobile=await launch(true);
  await cycle(desktop,mobile,'tdm');
  await cycle(desktop,mobile,'classic');
  assert.deepEqual(errors,[]);
}catch(error){
  for(const p of pages)console.dir(await p.evaluate(()=>({status:__fps.network?.status,modal:__fps.modal,
    rendererClock:{time:__fps.game.state.time,roomTime:__fps.network?.room?.state.time,
      phase:__fps.network?.room?.state.phase,resultAt:__fps.network?.resultsAt,visible:!document.hidden},
    actor:__fps.game.player&&{x:__fps.game.player.x,z:__fps.game.player.z,yaw:__fps.game.player.yaw,weapon:__fps.game.player.weapon},
    rocket:window.rocketEvidence&&{models:[...rocketEvidence.visible],views:rocketEvidence.views,events:rocketEvidence.events.map(e=>[e.type,e.rocketId]),sound:rocketEvidence.sounds,hits:rocketEvidence.deaths,impacts:rocketEvidence.impacts,audio:{state:__fps.audio.context?.state,volume:__fps.audio.volume,stats:__fps.audio.stats}},
    controls:{enabled:__fps.mobile?.enabled,visible:__fps.mobile?.visible,alive:__fps.game.player?.alive,
      more:document.getElementById('mobile-more')?.outerHTML,primaryCoarse:matchMedia('(pointer: coarse)').matches,
      anyCoarse:matchMedia('(any-pointer: coarse)').matches,touchPoints:navigator.maxTouchPoints},
    fatal:document.querySelector('#fatal pre')?.textContent})).catch(()=>null),{depth:5});
  throw error;
}finally{for(const b of browsers)await b.close();await local.close();}
