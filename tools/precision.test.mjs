import test from 'node:test';
import assert from 'node:assert/strict';
import { canAim, aimFov, shotSpread, aimFriction, EmptyMagazineReload, nextWeapon, isManualOnly } from '../src/fps/tactical-rules.mjs';
import { PlayerRecoil } from '../src/fps/riposte-recoil.mjs';

const player = () => ({ id: 'p', isPlayer: true, team: 'a', alive: true, x: 0, y: 0, z: 0,
  height: 1.7, radius: .2, yaw: 0, pitch: 0, weapon: 'smg', moving: 0,
  recoil: .02, flash: 0, aimAmount: 0, reloadUntil: 0, onGround: true });
function setup() {
  const p = player(), item = { ammo: 0, reserve: 60 };
  const g = { player: p, phase: 'active', state: { time: 0, paused: false }, actors: [p],
    world: { segmentClear: () => true }, smokeBlocks: () => false,
    item: () => item, reload: () => { p.reloadUntil = g.state.time + 1.8; return true; } };
  return { g, p, item };
}

test('only firearms can aim; sniper zoom is stronger and explosives remain manual', () => {
  for (const w of ['p9','p12','ar47','cr4','smg','sniper','shotgun']) assert.equal(canAim(w), true, w);
  for (const w of ['knife','smoke','flash','he','bomb','bazooka','missing']) assert.equal(canAim(w), false, w);
  assert.ok(aimFov('sniper') < aimFov('ar47'));
  for (const w of ['bazooka','he','smoke','flash']) assert.equal(isManualOnly(w), true);
  assert.equal(isManualOnly('smg'), false);
});
test('precision narrows human spread without changing bot or hip-fire behavior', () => {
  const p = player(), hip = shotSpread(p, 'smg');
  assert.ok(hip > 0);
  assert.ok(shotSpread({ ...p, aimAmount: 1 }, 'smg') < hip * .4);
  assert.equal(shotSpread({ ...p, isPlayer: false, aimAmount: 1 }, 'smg'), hip);
  assert.equal(shotSpread({ ...p, bot: {}, aimAmount: 1 }, 'smg'), hip);
  assert.ok(shotSpread({ ...p, moving: 4, aimAmount: 1 }, 'smg') > shotSpread({ ...p, aimAmount: 1 }, 'smg'));
});
test('ADS reduces camera recoil by Riposte factor without changing hip recoil', () => {
  const p = player();
  const hip = new PlayerRecoil().shot('ar47',p,0,'kb',()=>.5).pitch;
  const ads = new PlayerRecoil().shot('ar47',{...p,aimAmount:1},0,'kb',()=>.5).pitch;
  assert.ok(Math.abs(ads / hip - .66) < 1e-9);
});
test('touch friction only slows visible opposing targets, never rotates aim', () => {
  const {g,p} = setup();
  const e = {...player(),id:'e',team:'b',z:-12};
  g.actors.push(e);
  assert.ok(aimFriction(g,0,0) < .7);
  assert.equal(p.yaw,0); assert.equal(p.pitch,0);
  assert.equal(aimFriction(g,.6,0),1);
  e.team='a'; assert.equal(aimFriction(g,0,0),1);
  e.team='b'; e.alive=false; assert.equal(aimFriction(g,0,0),1);
});
test('walls, smoke, pause, flash and distant enemies disable touch friction', () => {
  const {g,p}=setup();const e={...player(),team:'b',z:-12};g.actors.push(e);
  g.world.segmentClear=()=>false;assert.equal(aimFriction(g,0,0),1);
  g.world.segmentClear=()=>true;g.smokeBlocks=()=>true;assert.equal(aimFriction(g,0,0),1);
  g.smokeBlocks=()=>false;g.state.paused=true;assert.equal(aimFriction(g,0,0),1);
  g.state.paused=false;p.flash=.5;assert.equal(aimFriction(g,0,0),1);
  p.flash=0;e.z=-80;assert.equal(aimFriction(g,0,0),1);
});
test('auto-reload waits 280ms and requests the normal reload exactly once', () => {
  const {g,p}=setup();const r=new EmptyMagazineReload();
  assert.equal(r.tick(g),false);g.state.time=.27;assert.equal(r.tick(g),false);
  g.state.time=.29;assert.equal(r.tick(g),true);assert.ok(p.reloadUntil>g.state.time);
  g.state.time=.35;assert.equal(r.tick(g),false);
});
test('no auto-reload without reserves, with ammo, on death, while interacting or when disabled', () => {
  for(const mode of ['reserve','ammo','dead','interaction','disabled','pause']){
    const {g,p,item}=setup();const r=new EmptyMagazineReload();r.tick(g);
    if(mode==='reserve')item.reserve=0;
    if(mode==='ammo')item.ammo=1;
    if(mode==='dead')p.alive=false;
    if(mode==='pause')g.state.paused=true;
    g.state.time=1;
    assert.equal(r.tick(g,mode!=='disabled',mode==='interaction'),false,mode);
    assert.equal(p.reloadUntil,0,mode);
  }
});
test('changing weapon/item cancels pending automatic reload', () => {
  const {g,p}=setup();const r=new EmptyMagazineReload();r.tick(g);
  g.state.time=.2;p.weapon='ar47';g.item=()=>({ammo:0,reserve:30});
  assert.equal(r.tick(g),false);g.state.time=.3;assert.equal(r.tick(g),false);
});
test('touch weapon cycling reaches primary, sidearm and knife without explosives', () => {
  const p={...player(),inventory:{primary:{id:'smg'},pistol:{id:'p9'},knife:{id:'knife'},he:1}};
  assert.equal(nextWeapon(p),'p9');p.weapon='p9';assert.equal(nextWeapon(p),'knife');
  p.weapon='knife';assert.equal(nextWeapon(p),'smg');p.weapon='he';assert.equal(nextWeapon(p),'smg');
});
