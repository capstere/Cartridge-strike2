import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Game} from './game.mjs';
import {WEAPONS} from './config.mjs';
import {createWorld} from './world.mjs';
import {BONUSES,bonusTick} from './bonuses.mjs';
import {respawnActor,launchRocket,updateRockets} from './action-rules.mjs';

const demo=JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url)));
const controllers={'analysts-0':'human','counterAnalysts-0':'human'};
function fixture(networkSlice){
  const world=createWorld({fresh:true,levelProject:structuredClone(demo)});
  const game=new Game(world,{controllers,localPlayerId:'analysts-0',
    config:{mode:'endless',networkSlice,spawnProtection:0,zombies:false,wanderers:false,firefight:false}}).start();
  const player=game.player,enemy=game.actors.find(a=>a.id==='counterAnalysts-0');
  return {game,player,enemy};
}
function defeat(game,source,target){
  assert(game.damage(target,500,source,'smg'));
  assert.equal(target.alive,false);
  assert.equal(game.damage(target,500,source,'smg'),false);
  assert(respawnActor(game,target));
}

for(const network of [false,true]){
  test((network?'headless':'solo')+' gameplay awards one charge per threshold and applies the fixed-step effects',()=>{
    const {game,player,enemy}=fixture(network);
    for(let n=1;n<=8;n++){
      defeat(game,player,enemy);
      assert.equal(player.bonus.progress,n);
      assert.equal(player.kills,n);
      for(const item of BONUSES)assert.equal(player.bonus.charges[item.id],Number(n>=item.threshold));
    }
    const tick=controls=>{
      if(network)game.stepActors(new Map([[player.id,controls||{}]]));
      else game.update(game.config.fixedStep,controls||{});
    };
    assert(game.requestBonus(1));
    assert.equal(player.bonus.active,null);
    tick();
    assert.equal(player.bonus.active.startTick,1);
    assert.equal(player.bonus.active.endTick,901);
    assert(player.uavSamples.some(p=>p.x===enemy.x && p.z===enemy.z));
    const sample=structuredClone(player.uavSamples);
    enemy.x+=.1;tick();assert.deepEqual(player.uavSamples,sample);
    assert(!game.requestBonus(2));defeat(game,player,enemy);assert.equal(player.bonus.progress,8);
    game.state.time=900/60;tick();
    assert.equal(player.bonus.active,null);assert.deepEqual(game.uavBlips(),[]);
    const reload=game.item().id;game.item().ammo--;
    assert(game.requestBonus(2));tick({forward:1,reload:true});
    assert.equal(player.bonus.active.id,'rage');
    if(!network)assert(game.reload());
    const event=game.events.findLast(e=>e.type==='reload');
    assert.equal(event.weapon,reload);
    assert.equal(event.duration,WEAPONS[reload].reload*.75);
    assert(Math.abs(player.moving-game.config.runSpeed*1.2)<1e-6);
    game.state.time=(player.bonus.active.endTick-1)/60;tick();
    assert.equal(player.bonus.active,null);
    assert(game.requestBonus(3));tick();
    const hp=player.hp,armor=player.armor;
    enemy.behavior='attack';
    for(const kind of ['p9','p12','ar47','cr4','sniper','smg','shotgun','bazooka','he','knife','shot','stomp']){
      assert.equal(game.damage(player,100,enemy,kind),false);
      assert.equal(player.hp,hp);assert.equal(player.armor,armor);
    }
    const blocked=game.events.filter(e=>e.type==='immune');
    assert.equal(blocked.length,12);assert(blocked.every(e=>e.actorId===player.id && e.sourceId===enemy.id));
    assert(game.damage(player,1,null,'void'));assert(player.hp<hp);
    const {endTick}=player.bonus.active;
    game.state.time=(endTick-1)/60;assert(!game.damage(player,100,enemy,'he'));tick();
    assert.equal(bonusTick(game.state.time),endTick);assert(game.damage(player,1,enemy,'he'));
    defeat(game,enemy,player);assert.equal(player.bonus.progress,0);
    game.start();assert.deepEqual(game.player.bonus.charges,{uav:0,rage:0,immortal:0});
  });
}

test('rockets and HE retain immutable launch eligibility across expiry and life replacement',()=>{
  const {game,player,enemy}=fixture(true);
  game.world.segmentClear=()=>true;game.world.raycast=()=>null;
  function launch(kind){
    Object.assign(player,{x:0,y:0,z:0});Object.assign(enemy,{x:1.4,y:0,z:0,armor:0,hp:1});
    if(kind==='he'){
      player.inventory.he=1;assert(game.throwGrenade(player,'he'));return game.state.grenades.pop();
    }
    return launchRocket(game,player,{x:1,y:0,z:0});
  }
  function impact(item){
    game.pendingDamage=[];
    if(item.type==='he')game.detonateGrenade(item);
    else updateRockets(game,.1,(from,dir,target)=>target===enemy?1.4:null);
    const hit=game.pendingDamage.find(h=>h.target===enemy);
    assert(hit);assert(game.damage(enemy,hit.amount,hit.source,hit.kind,hit));assert(!enemy.alive);
    assert(respawnActor(game,enemy));
  }
  for(const kind of ['he','bazooka']){
    for(const exclusion of ['emission','impact','new life','none']){
      if(exclusion==='emission')player.bonus.active={id:'rage',startTick:0,endTick:60};
      const projectile=launch(kind);player.bonus.active=null;
      if(exclusion==='impact')player.bonus.active={id:'rage',startTick:0,endTick:60};
      if(exclusion==='new life')player.lifeId=(player.lifeId||0)+1;
      const progress=player.bonus.progress;
      impact(projectile);player.bonus.active=null;
      assert.equal(player.bonus.progress,progress+Number(exclusion==='none'),kind+' '+exclusion);
    }
  }
});

test('Classic keeps charges across rounds, terminates active effects and resets progress on a new life',()=>{
  const world=createWorld({fresh:true,levelProject:structuredClone(demo)});
  const game=new Game(world,{controllers,localPlayerId:'analysts-0',config:{mode:'classic',zombies:false,wanderers:false,buyTime:0}}).start();
  const player=game.player,enemy=game.actors.find(a=>a.id==='counterAnalysts-0');
  game.state.phase='active';
  Object.assign(player.bonus,{progress:5,earnedMask:3});Object.assign(player.bonus.charges,{rage:1,uav:1});
  assert(game.requestBonus(1));game.stepActors();
  assert.equal(player.bonus.active.id,'uav');
  assert(game.finishRound({reason:'time',winner:'analysts'}));
  assert.equal(player.bonus.active,null);assert.deepEqual(game.uavBlips(),[]);assert(!game.requestBonus(2));
  const previousLife=player.lifeId;
  game.beginRound();assert.equal(player.lifeId,previousLife);assert.equal(player.bonus.progress,5);
  game.state.phase='active';assert(game.damage(player,500,enemy,'smg'));
  game.beginRound();assert.equal(player.lifeId,previousLife+1);
  assert.equal(player.bonus.progress,0);assert.equal(player.bonus.earnedMask,0);assert.equal(player.bonus.charges.rage,1);
  game.start();assert.deepEqual(game.player.bonus.charges,{uav:0,rage:0,immortal:0});
});

test('Rage moves an ongoing slide on the activation tick and returns to base speed on expiry',()=>{
  const {game,player}=fixture(true),dt=game.config.fixedStep;
  game.world.move=(a,dx,dy,dz)=>{a.x+=dx;a.z+=dz;return {onGround:true};};
  const input=new Map([[player.id,{forward:1,sprint:true}]]);
  for(let i=0;i<6;i++)game.stepActors(input);
  assert(player.rushing);game.stepActors(new Map([[player.id,{forward:1,sprint:true,crouchEdge:true,crouch:true}]]));
  assert(player.slideUntil>game.state.time);
  const base=player.slideSpeed;
  player.bonus.charges.rage=1;assert(game.requestBonus(2));game.stepActors(input);
  function expected(scale){
    const left=(player.slideUntil-game.state.time)/.75,end=game.config.crouchSpeed;
    return (end+(base-end)*left**1.35)*scale;
  }
  assert(Math.abs(player.moving-expected(1.2))<1e-7);
  player.bonus.active.endTick=bonusTick(game.state.time+dt);
  game.stepActors(input);assert.equal(player.bonus.active,null);
  assert(Math.abs(player.moving-expected(1))<1e-7);
});
