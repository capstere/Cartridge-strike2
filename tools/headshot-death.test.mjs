import test from 'node:test';
import assert from 'node:assert/strict';
import {Game, WEAPONS, eye} from '../src/fps/game.mjs';
import {initializeCombat} from '../src/fps/combat-flow.mjs';

function duel(controllerType, height) {
  const game=new Game({raycast:()=>null}, {difficulty:'normal'});
  Object.assign(game.state,{mode:'classic',phase:'active',time:1});
  const fighter=(team,z,controllerType)=>({
    id:team+'-0',name:team,team,controllerType,x:0,y:0,z,height:1.7,radius:.2,yaw:0,pitch:0,
    weapon:'p9',inventory:game.startInventory(team),alive:true,hp:100,armor:0,kills:0,deaths:0,
    money:0,nextShot:0,recoil:0,deathAt:null,deathVariant:''
  });
  const source=fighter('analysts',0,'human'),target=fighter('counterAnalysts',-1.2,controllerType);
  target.height=height;
  target.crouching=height<1.7;
  game.actors.push(source,target);
  initializeCombat(game);
  game.random=()=>.5;
  function shoot(fraction,weapon='p9') {
    game.state.time+=1;
    source.weapon=weapon;
    source.pitch=Math.atan2(target.y+target.height*fraction-eye(source).y,source.z-target.z-target.radius);
    game.pendingDamage=[];
    assert(game.fire(source));
    assert.equal(game.pendingDamage.length,1);
    const hit=game.pendingDamage[0];
    assert.equal(hit.target,target);
    assert(game.damage(hit.target,hit.amount,hit.source,hit.kind,hit));
    return game.drainEvents().find(event=>event.type==='combat-hit');
  }
  return {game,source,target,shoot};
}

test('only the fatal firearm hit selects the headshot pose on standing and crouching players and bots',()=>{
  for(const controller of ['human','bot'])for(const height of [1.7,1.08])for(const fatalHead of [true,false]){
    const {game,source,target,shoot}=duel(controller,height);
    target.armor=100;
    const first=shoot(.93);
    assert.equal(first.head,true);
    assert.equal(first.lethal,false);
    assert.equal(target.deathAt,null);
    assert.equal(target.deathVariant,'');
    const dealt=WEAPONS.p9.damage*(1-.32);
    assert(Math.abs(target.hp-(100-dealt))<1e-9);
    assert.equal(target.armor,100-WEAPONS.p9.damage*.32);
    const middle=shoot(.6);
    assert.equal(middle.head,false);
    assert(Math.abs(target.hp-(100-2*dealt))<1e-9);
    target.hp=5;
    const final=shoot(fatalHead?.93:.6);
    assert.equal(final.head,fatalHead);
    assert.equal(final.lethal,true);
    assert.equal(target.deathVariant,fatalHead?'headshot':'');
    assert.equal(target.deathAt,game.state.time);
    assert.equal(source.combat.headHits,fatalHead?2:1);
  }
});

test('a knife or blast at head height retains the ordinary death',()=>{
  for(const kind of ['knife','he','bazooka']){
    const {game,source,target,shoot}=duel('human',1.7);
    target.hp=1;
    if(kind==='knife')assert.equal(shoot(.94,'knife').head,true);
    else assert(game.damage(target,200,source,kind,{point:{x:target.x,y:1.6,z:target.z}}));
    assert.equal(target.alive,false);
    assert.equal(target.deathVariant,'');
  }
});
