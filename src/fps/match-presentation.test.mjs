import test from 'node:test';
import assert from 'node:assert/strict';
import {rankPlayers,leadingPlayer,zoneCaption} from './match-presentation.mjs';

test('FFA ties use authoritative points in both play and the results table',()=>{
  const actors=[{id:'a',kills:2,deaths:1,combat:{points:10}},{id:'z',kills:2,deaths:1,combat:{points:30}}];
  const results=actors.map(({combat,...actor})=>({...actor,points:combat.points}));
  for(const rows of [actors,results]){
    assert.equal(leadingPlayer(rows).id,'z');
    assert.deepEqual(rankPlayers(rows).map(a=>a.id),['z','a']);
  }
  assert.equal(zoneCaption({owner:'analysts',contested:true},'analysts'),'Contested');
});
