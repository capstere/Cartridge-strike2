import test from 'node:test';
import assert from 'node:assert/strict';
import {DeploymentCountdown,ForegroundCountdownClock} from '../../src/fps/deployment-countdown.mjs';
import {Game} from '../../src/fps/game.mjs';
import {MATCH_DEFAULTS} from '../../shared/multiplayer/rules.mjs';
import {loadHeadlessWorld} from '../headless.mjs';

function observer() {
  const pictures=[],sounds=[];
  const presenter=new DeploymentCountdown(value=>pictures.push(value),value=>sounds.push(value));
  return {presenter,pictures,sounds};
}

test('one announcement per observed transition, gold-stage digits and a bounded launch',()=>{
  const {presenter,pictures,sounds}=observer();
  for(let elapsed=0;elapsed<=6300;elapsed+=100)presenter.update(1,Math.max(0,5-elapsed/1000),elapsed>=5000,elapsed);
  assert.deepEqual(pictures,['',5,4,3,2,1,'go','']);
  assert.deepEqual(sounds,[5,4,3,2,1,'go']);
  presenter.update(1,0,true,8000);
  assert.equal(sounds.length,6,'a later Classic round presents no second launch');
});

test('late joins, suspension, gaps, cancellation and rematch never queue old cues',()=>{
  const {presenter,sounds}=observer();
  presenter.update(3,0,true,100);
  presenter.update(4,2.4,false,400);
  assert.equal(presenter.value,3);
  assert.deepEqual(sounds,[]);
  presenter.update(4,1.9,false,950);
  assert.deepEqual(sounds,[2]);
  presenter.suspend();
  presenter.update(4,0,true,1200);
  assert.equal(presenter.value,'');
  assert.deepEqual(sounds,[2]);
  presenter.reset();
  presenter.update(4,5,false,1600);
  presenter.update(4,2.95,false,3650);
  assert.deepEqual(sounds,[2,5],'skipped beats stay silent');
  presenter.suspend();
  presenter.update(4,1.7,false,3950);
  presenter.update(4,.95,false,4700);
  presenter.update(4,0,true,7400);
  assert.equal(presenter.value,'');
  assert.deepEqual(sounds,[2,5,1]);
  presenter.reset();presenter.update(5,5,false,8000);
  assert.equal(sounds.at(-1),5);
});

for(const mode of ['classic','endless']){
  test('Solo '+mode+' supports free look and freezes the world until its deployment clock expires',async()=>{
    const {world}=await loadHeadlessWorld('synthetic-demo');
    const game=new Game(world,{config:{mode,deploymentSeconds:MATCH_DEFAULTS.countdownSeconds}}).start();
    const player=game.player;
    const positions=()=>game.actors.map(({x,y,z,hp})=>[x,y,z,hp]);
    const initial=positions(),ammo=game.item().ammo;
    const attempts={forward:1,fire:true,jump:true,sprint:true,interact:true,yaw:1.4,pitch:.26};
    game.update(1.2,attempts);
    game.pause(true);game.update(15,attempts);game.pause(false);
    game.update(3.7,attempts);
    assert.equal(game.state.time,0);
    assert.ok(Math.abs(game.warmupRemaining-.1)<.000001);
    assert.deepEqual(positions(),initial);
    assert.equal(player.yaw,1.4);assert.equal(player.pitch,.26);
    assert.equal(game.fire(),false);assert.equal(game.select('knife'),false);
    assert.equal(game.drop(),false);assert.equal(game.reload(),false);
    assert.equal(game.buy('armor').ok,false);
    assert.equal(game.item().ammo,ammo);
    game.update(.1,attempts);
    assert.equal(game.warmupRemaining,0);
    assert.equal(game.state.time,0);
    assert.equal(game.item().ammo,ammo);
    if(mode==='classic'){
      assert.equal(game.phase,'buy');
      assert.equal(game.state.buyDeadline-game.state.time,game.config.buyTime);
      assert.equal(game.buy('armor').ok,true);
      game.beginRound();
      assert.equal(game.warmupRemaining,0,'later Classic rounds use the existing buy phase');
    }else{
      assert.equal(game.phase,'active');
      assert.equal(game.fire(),true);
      assert.equal(game.item().ammo,ammo-1);
    }
  });
}

test('a one-second foreground stall advances deployment while a hidden interval does not',()=>{
 const clock=new ForegroundCountdownClock();
 assert.equal(clock.advance(0),0);
 clock.presented(10000); // first draw, including shader compilation, has completed
 assert.equal(clock.advance(11000),1);
 assert.equal(clock.advance(11500),.5);
 clock.suspend();
 assert.equal(clock.advance(50000),0);
 clock.presented(50100);
 assert.equal(clock.advance(50050),0,'an older animation timestamp cannot double-count after resume');
 assert.equal(clock.advance(50600),.5);
});
