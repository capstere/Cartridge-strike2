// Drive the human slot with the FPS keyboard and mouse handlers. The existing
// inspection clock advances ordinary fixed steps, including bot fire and doors.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const captures = process.env.FPS_CAPTURE_DIR;
if (captures) await mkdir(captures, {recursive:true});
const rounds = [
  {task:'rescue', team:'counterAnalysts', seed:42},
  {task:'defuse', team:'analysts', seed:93},
  {task:'spectate', team:'counterAnalysts', seed:42},
  {task:'plant', team:'counterAnalysts', seed:12, armor:true},
];

function playRoute(task) {
  const fps = window.__fps, game = fps.game, world = game.world, player = game.player;
  const distance = (a,b) => Math.hypot(a.x-b.x, a.z-b.z);
  const dt = game.config.fixedStep, keys = new Set(), rooms = [], events = [];
  const interesting = new Set(['planted','defuse','hostage','rescued','result','kill']);
  let steps = 0, meters = 0;

  function key(code, down) {
    if (keys.has(code) === down) return;
    if (down) keys.add(code); else keys.delete(code);
    window.dispatchEvent(new KeyboardEvent(down ? 'keydown' : 'keyup', {code, bubbles:true}));
  }
  function controls(yaw, walk = false, use = false) {
    key('KeyW', walk);
    key('KeyE', use);
    if (yaw === null) return;
    const input = fps.input(0), delta = Math.atan2(Math.sin(yaw-input.yaw), Math.cos(yaw-input.yaw));
    const scale = fps.settings.sensitivity * fps.tactical.lookScale(false,input.yaw,input.pitch);
    const movementX = Math.round(-delta/scale);
    if (movementX) window.dispatchEvent(new MouseEvent('mousemove',{movementX,bubbles:true}));
  }
  function step() {
    const before = {x:player.x,z:player.z}, index = game.events.length;
    if (game.state.paused) throw Error('Match paused during '+task+' in '+rooms.at(-1));
    game.step(dt, fps.input(dt));
    meters += distance(player,before);
    const room = world.roomAt(player.x,player.z)?.id;
    if (room && room !== rooms.at(-1)) rooms.push(room);
    for (const e of game.events.slice(index)) {
      if (interesting.has(e.type)) events.push({type:e.type, actor:e.actorId, source:e.sourceId,
        escort:e.escortId, at:Number(e.time.toFixed(2)), playerRoom:room});
    }
    // Deliver HUD, spectator, audio and render events throughout long walks.
    if (++steps % 90 === 0) fps.step(null,0);
  }
  function wait(seconds, until = () => false) {
    controls(null);
    for (let i=0; i<Math.ceil(seconds/dt) && game.phase !== 'result' && !until(); i++) step();
  }
  function hold(seconds) {
    controls(null,false,true);
    for (let i=0; i<Math.ceil(seconds/dt)+2 && player.alive && game.phase === 'active'; i++) step();
    controls(null);
    if (game.phase === 'active') step();
  }
  // Aim at real navigation corners. When another body blocks a corridor, ask
  // the same graph to route around it and take only physically clear side steps.
  function walk(goal, tolerance, {arrived = () => false, pace = () => true} = {}) {
    const deadline = game.state.time+85;
    let path = [], replan = 0, stalled = 0, detour = null;
    let previous = {x:player.x,z:player.z}, checkAt = game.state.time+.5;
    while (player.alive && game.phase === 'active' && game.state.time < deadline) {
      if (distance(player,goal)<tolerance || arrived()) break;
      if (!pace()) {controls(null);step();continue;}
      if (game.state.time >= replan || !path.length) {
        const others = [...game.actors,...game.hostages,...game.state.zombies].filter(body =>
          body !== player && body.alive !== false && !body.rescued && distance(player,body)<2.6 && distance(body,goal)>.6);
        const blockers = stalled || player.blockedBy ? others : [];
        path = world.findPath(player,goal,{blockers});
        if (!path.length && blockers.length) path = world.findPath(player,goal);
        if (!path.length || stalled>=2) {
          const direction = Math.atan2(goal.x-player.x,goal.z-player.z);
          for (const offset of [1,-1,1.56,-1.56,2.4,-2.4,Math.PI]) {
            const point = {x:player.x+Math.sin(direction+offset)*.8,z:player.z+Math.cos(direction+offset)*.8,y:.55};
            if (world.canOccupy(point.x,point.z,player.radius+.01,1.7) &&
              !others.some(other=>distance(other,point)<.53) && world.segmentClear({...player,y:.55},point,{vision:false})) {
              detour = point;break;
            }
          }
        }
        replan = game.state.time+(detour ? .45 : 1);
      }
      while (path.length && distance(player,path[0])<.10) path.shift();
      if (detour && distance(player,detour)<.13) {detour=null;replan=0;}
      const next = detour || path[0] || goal;
      controls(Math.atan2(player.x-next.x,player.z-next.z),true);
      step();
      if (game.state.time >= checkAt) {
        stalled = distance(player,previous)<.16 ? stalled+1 : 0;
        if (stalled) {replan=0;detour=null;}
        previous = {x:player.x,z:player.z};checkAt = game.state.time+.5;
      }
    }
    controls(null);
  }

  fps.stopFrameLoop();
  fps.step(null,0);
  wait(game.config.buyTime+.1);
  if (task === 'rescue') {
    walk(game.hostages[0],.95);
    hold(.08);
    walk(world.anchors.rescue,.5,{pace:()=>game.hostages.every(h=>h.escortId!==player.id || distance(player,h)<2.8)});
    wait(60);
  } else if (task === 'defuse') {
    walk(world.anchors.bomb,.65);
    wait(85,()=>!player.alive || game.bomb.status==='planted');
    if (game.bomb.status === 'planted') {
      walk(game.bomb,.78);
      hold(game.config.defuseTime+.2);
    }
  } else {
    walk(world.anchors.bomb,.65,{arrived:()=>task==='plant' && game.interaction()?.type==='plant'});
    hold(game.config.plantTime+.1);
  }
  fps.step(null,0);
  return {task, seed:game.seed, team:game.team, id:player.id, alive:player.alive,
    position:[player.x,player.z].map(n=>Number(n.toFixed(2))), meters:Math.round(meters), rooms,
    result:game.state.result?.reason, winner:game.state.result?.winner, bomb:game.bomb.status,
    score:game.state.score, rescued:game.hostages.filter(h=>h.rescued).length,
    events:events.filter(e=>e.type!=='kill' || e.actor===player.id),
    teammates:game.actors.filter(a=>a.alive && a.team===player.team).map(a=>a.name)};
}

const browser = await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
try {
  const page = await browser.newPage({viewport:{width:1000,height:640}});
  const errors = [];
  page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(120000);
  for (const {task,team,seed,armor} of rounds) {
    await page.goto(origin+'/fps/?test&seed='+seed,{waitUntil:'domcontentloaded'});
    await page.locator('#lb-mode-seg [data-value=classic]').click();
    await page.locator('.team-option[data-team='+team+']').click();
    await page.locator('#start').click();
    await page.waitForFunction(()=>window.__fps?.game.player && !document.querySelector('#hud').hidden && document.querySelector('#cs-loading').hidden);
    if (await page.locator('#resume').isVisible()) await page.locator('#resume').click();
    const locked = () => page.waitForFunction(() =>
      document.pointerLockElement === document.querySelector('#game') && !window.__fps.modal);
    await locked();
    if (armor) {
      await page.keyboard.press('KeyB');
      await page.locator('#shop [data-item=armor]').click();
      await page.locator('#close-buy').click();
      await locked();
      assert.equal(await page.evaluate(()=>__fps.game.player.armor),100);
    }
    const setup = await page.evaluate(()=>{
      const g=__fps.game;
      return [g.seed,g.state.mode,g.actors.filter(a=>a.team==='analysts').length,
        g.actors.filter(a=>a.team==='counterAnalysts').length,g.actors.filter(a=>a.isPlayer).length,g.state.zombies.length];
    });
    assert.deepEqual(setup,[seed,'classic',5,5,1,5]);
    const report = await page.evaluate(playRoute,task);
    console.log(JSON.stringify(report));
    const own = type=>report.events.some(e=>e.type===type && e.actor===report.id);
    if (task==='plant') assert.ok(own('planted') && report.bomb==='planted');
    if (task==='defuse') assert.ok(own('defuse') && report.result==='defuse' && report.score.analysts===1);
    if (task==='rescue') assert.ok(report.events.some(e=>e.type==='hostage' && e.escort===report.id) &&
      report.rescued===2 && report.result==='rescue' && report.score.counterAnalysts===1);
    if (task==='spectate') {
      assert.ok(!report.alive && own('kill') && report.teammates.length>1);
      const label = page.locator('#spectate span');
      await label.waitFor({state:'visible'});
      const read = () => page.evaluate(() => {
        const f=__fps, g=f.game;
        f.render();
        const label=document.querySelector('#spectate span').textContent;
        const target=g.actors.find(a=>a.alive && a.team===g.team && label.endsWith(a.name));
        const camera=f.renderer.camera.position;
        return {label, aligned:!!target && Math.hypot(camera.x-target.x,camera.z-target.z)<.001};
      });
      const first = await read();
      await page.keyboard.press('ArrowRight');
      const next = await read();
      await page.keyboard.press('ArrowLeft');
      const back = await read();
      assert.notEqual(first.label,next.label);
      assert.deepEqual(first,back);
      assert.ok(first.aligned && next.aligned);
      console.log(JSON.stringify({task:'spectator controls',first,next,back}));
    }
    if (captures) await page.screenshot({path:join(captures,task+'.jpg'),type:'jpeg',quality:78});
  }
  assert.deepEqual(errors,[]);
  console.log('PASS player routes and spectator controls');
} finally {await browser.close();}
