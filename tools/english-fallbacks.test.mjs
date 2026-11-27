import assert from 'node:assert/strict';
import test from 'node:test';
import {combatEvent} from '../src/fps/combat-flow.mjs';
import {installPrivateCharacter} from '../src/fps/character-library.mjs';

test('the environmental death recap falls back to English and preserves supplied names', () => {
  const victim = {id:'guest', combat:{incoming:{},streak:0}};
  const game = {state:{combatFlow:{}},actors:[victim]};
  const kill = {type:'kill',actorId:victim.id,weapon:'fall',time:7};
  combatEvent(game,kill);
  assert.equal(victim.combat.recap.attacker,'Environment');
  combatEvent(game,{...kill,sourceName:'Göteborg'});
  assert.equal(victim.combat.recap.attacker,'Göteborg');
});

test('loading a private avatar before the base models gives an English error', () => {
  assert.throws(() => installPrivateCharacter({}), {message:'Load the original characters first.'});
});
