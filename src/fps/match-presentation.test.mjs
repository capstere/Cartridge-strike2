import test from 'node:test';
import assert from 'node:assert/strict';
import {accessText} from '../../shared/multiplayer/access-english.mjs';
import {CombatHUD} from './combat-hud.mjs';
import {rankPlayers,leadingPlayer,zoneCaption} from './match-presentation.mjs';

test('FFA ties use authoritative points in both play and the results table',()=>{
  const actors=[{id:'a',kills:2,deaths:1,combat:{points:10}},{id:'z',kills:2,deaths:1,combat:{points:30}}];
  const results=actors.map(({combat,...actor})=>({...actor,points:combat.points}));
  for(const rows of [actors,results]){
    assert.equal(leadingPlayer(rows).id,'z');
    assert.deepEqual(rankPlayers(rows).map(a=>a.id),['z','a']);
  }
  assert.equal(accessText.winner('Coast',true),'Coast wins');
  assert.equal(accessText.winner('Analysts'),'Analysts win');
  assert.equal(zoneCaption({owner:'analysts',contested:true},'analysts'),'Contested');
});

test('a private reward or predicted shot cannot suppress a confirmed local hit',()=>{
  const hud=Object.assign(Object.create(CombatHUD.prototype),{lastSerial:0,nodes:{'combat-hit-label':{}}});
  const player={id:'local',team:'analysts',controllerType:'human'};
  const game={player,state:{mode:'ffa'},team:player.team,actors:[player,{...player,id:'other'}],hostages:[]};
  const hit={type:'combat-hit',actorId:'local',serial:29,time:10,lethal:true};
  hud.events([{type:'reward',actorId:'local',serial:31},{type:'shot',actorId:'local'},
    {type:'damage',sourceId:'local',actorId:'other',team:'analysts',serial:27,time:10},hit],game);
  assert.equal(hud.nodes['combat-hit-label'].textContent,'ELIMINATED');
  assert.equal(hud.hitKind,'kill');assert.equal(hud.lastSerial,29);assert.equal(hud.warnUntil,undefined);
  hud.events([{...hit,time:12}],game);assert.equal(hud.hitUntil,10.38);
});
