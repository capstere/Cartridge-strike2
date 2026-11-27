import assert from 'node:assert/strict';
import test from 'node:test';
import {CombatEffects} from './effects.mjs';

function fixture(weapon='sniper'){
  const actor={id:'player',weapon,alive:true,lifeId:1,controlEpoch:1};
  const game={state:{round:1,time:10},phase:'active',actors:[actor]};
  const ejections=[];
  const effects=Object.assign(Object.create(CombatEffects.prototype),{
    settings:{},seen:new Set(),pendingCasings:new Map(),
    ejectCasing(actor,time){ejections.push([actor.id,time]);}
  });
  const shoot=event=>effects.handle([{type:'shot',actorId:actor.id,weapon,...event}],game);
  return {effects,actor,game,ejections,shoot};
}

test('one physical casing follows each local prediction and only one confirmed bolt or pump cycle',()=>{
  for(const [weapon,lag] of [['p9',0],['cr4',0],['shotgun',.30],['sniper',.44]]){
    const {effects,game,ejections,shoot}=fixture(weapon);
    for(let id=1;id<=2;id++){
      const start=game.state.time,actionId='player:1:1:'+id;
      shoot({actionId,predicted:true});
      shoot({actionId,eventId:40+id,serial:40+id});
      effects.advanceCasings(start+lag-.001);
      assert.equal(ejections.length,lag?id-1:id);
      effects.advanceCasings(start+lag);
      assert.equal(ejections.length,id);
      game.state.time++;
    }
    assert.equal(effects.pendingCasings.size,0);
  }
});

test('a delayed casing cannot cross a weapon change, death, life, control, round or result boundary',()=>{
  for(const change of [
    ({actor})=>{actor.weapon='p9';},({actor})=>{actor.alive=false;},
    ({actor})=>{actor.lifeId++;},({actor})=>{actor.controlEpoch++;},
    ({game})=>{game.state.round++;},({game})=>{game.phase='result';},
    ({effects,game,actor})=>effects.handle([{type:'switch',actorId:actor.id}],game)
  ]){
    const f=fixture();f.shoot({serial:1});change(f);
    f.effects.advanceCasings(10.5);
    assert.equal(f.ejections.length,0);assert.equal(f.effects.pendingCasings.size,0);
  }
});
