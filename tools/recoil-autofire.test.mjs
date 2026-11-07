import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/fps/game.mjs';
import { RECOIL_WEAPONS, PlayerRecoil } from '../src/fps/riposte-recoil.mjs';

const p = (id, x, z, team = 'analysts') =>
  ({ id, x, y: 0, z, height: 1.7, radius: .2, yaw: 0, pitch: 0,
    team, alive: true, onGround: true, moving: 0, crouching: false,
    weapon: 'p9', reloadUntil: 0, action: null, flash: 0 });

function setupTarget() {
  const human=p('human',0,0);
  const enemy=p('enemy',0,-8,'counterAnalysts');
  const mock={
    phase:'active', state:{paused:false,smokes:[],wanderers:[]},
    config:{hostageDamage:true,wanderers:false},
    player:human, actors:[human,enemy],hostages:[],world:{
      raycast:()=>null,segmentClear:()=>true,
    },
    item:()=>({ammo:20}), smokeBlocks:()=>false,
  };
  return {human,enemy,mock,point:()=>Game.prototype.reticleTarget.call(mock,human,0,0)};
}

test('mobile auto-trigger hits centered visible enemy, not empty space',()=>{
  const {enemy,mock,point}=setupTarget();
  assert.equal(point(),enemy);
  enemy.x=4;
  assert.equal(point(),null);
});

test('ray does not shoot enemies behind walls',()=>{
  const {mock,point}=setupTarget();
  mock.world.raycast=()=>({distance:4});
  assert.equal(point(),null);
});

test('teammate and neutral hostage in front block auto-targeting',()=>{
  const {mock,point}=setupTarget();
  mock.actors.push(p('friendly',0,-3));
  assert.equal(point(),null);
  mock.actors.pop();
  const hostage=p('hostage',0,-3,undefined);
  delete hostage.team;mock.hostages.push(hostage);
  assert.equal(point(),null);
});

test('smoke, flash, reloading, empty magazine, and inactive rounds block auto-trigger',()=>{
  const {human,mock,point}=setupTarget();
  mock.smokeBlocks=()=>true;assert.equal(point(),null);
  mock.smokeBlocks=()=>false;mock.phase='buy';assert.equal(point(),null);
  mock.phase='active';human.flash=.9;assert.equal(point(),null);
  human.flash=0;human.reloadUntil=12;assert.equal(point(),null);
  human.reloadUntil=0;mock.item=()=>({ammo:0});assert.equal(point(),null);
});

test('never automatically launch rocket, grenade, or mission bomb',()=>{
  const {human,mock,point}=setupTarget();
  for(const weapon of ['bazooka','smoke','bomb']){
    human.weapon=weapon;
    assert.equal(point(),null,weapon);
  }
});

test('automatic trigger may also use semi-auto rifles, pistols and knife at its range',()=>{
  const {human,mock,enemy,point}=setupTarget();
  for(const weapon of ['p9','p12','shotgun','sniper','smg','ar47','cr4']){
    human.weapon=weapon;
    assert.equal(point(),enemy,weapon);
  }
  human.weapon='knife';enemy.z=-1;
  assert.equal(point(),enemy);
});

test('all eight player firearms have configured Riposte-style recoil',()=>{
  for(const id of ['p9','p12','ar47','cr4','smg','shotgun','sniper','bazooka']){
    assert.ok(RECOIL_WEAPONS[id]?.v>0,id);
    assert.ok(RECOIL_WEAPONS[id]?.h>0,id);
  }
});

test('continuous AR firing ramps camera climb; short bursts partly recover',()=>{
  const recoil=new PlayerRecoil(),actor=p('h',0,0);
  const kicks=[];
  for(let n=0;n<6;n++)kicks.push(recoil.shot('ar47',actor,n*.105,'kb',()=>.5).pitch);
  assert.ok(kicks[5]>kicks[0]*1.35,'successive AR shots must build climb');
  const pending=recoil.pending;
  assert.equal(recoil.recover(.05,.55),0,'recovery waits until trigger rests');
  const ret=recoil.recover(.1,.75);
  assert.ok(ret>0 && ret<pending,'partial automatic recoil recovery');
  assert.ok(recoil.pending<pending);
});

test('touch recoil softer; crouching softer; running/airborne harder',()=>{
  const actor=p('h',0,0);
  const shot=(a,device)=>new PlayerRecoil().shot('ar47',a,0,device,()=>.5).pitch;
  const standing=shot(actor,'kb');
  assert.ok(shot(actor,'touch')<standing);
  assert.ok(shot({...actor,crouching:true},'kb')<standing);
  assert.ok(shot({...actor,moving:4},'kb')>standing);
  assert.ok(shot({...actor,onGround:false},'kb')>standing);
});

test('manual downwards correction consumes pending recoil; reset clears burst state',()=>{
  const rec=new PlayerRecoil(),actor=p('h',0,0);
  rec.shot('sniper',actor,0,'kb',()=>.5);
  const previous=rec.pending;
  rec.counter(-.015);
  assert.ok(rec.pending<previous);
  rec.reset();
  assert.equal(rec.pending,0);
  assert.equal(rec.count,0);
  assert.equal(rec.weapon,null);
});

test('recoil never modifies actor or bot pitch/yaw by itself',()=>{
  const rec=new PlayerRecoil(),actor=p('bot',0,0);
  rec.shot('ar47',actor,.1,'kb',()=>.5);
  assert.equal(actor.pitch,0);
  assert.equal(actor.yaw,0);
});
