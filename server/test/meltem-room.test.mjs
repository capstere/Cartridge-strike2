import assert from 'node:assert/strict';
import test from 'node:test';
import {prepareRoomSimulation} from '../room-world.mjs';

test('room preparation retains all 76 authored patrol destinations for nine active bots',async()=>{
  const room=await prepareRoomSimulation({mapId:'meltem',mode:'tdm',botDifficulty:'casual'});
  const game=room.game,world=game.world;
  const authored=world.project.referenceMap.poi.map(([x,y,z])=>({x,y,z}));
  assert.equal(authored.length,76);
  assert.deepEqual(world.tactical.patrolPoints,authored);
  // As in the family room, nine of the prepared seats are assigned to bots at round start.
  assert.equal(game.actors.length,10);
  for(const actor of game.actors.slice(1))actor.controllerType='bot';
  game.beginRound();
  assert.equal(game.actors.filter(a=>a.bot).length,9);
  for(let i=0;i<60;i++)room.tick();
  const bot=game.actors.find(a=>a.bot).bot,roof=authored.find(p=>p.y>3);
  bot.setGoal(roof);assert.deepEqual(bot.goal,roof);
  assert.ok(world.findPath(bot.actor,bot.goal).length);
});

for(const [id,count] of [['embruns',35],['tephra',23]]){
  test('the family authority initializes nine active bots from '+id+' routes',async()=>{
    const simulation=await prepareRoomSimulation({mapId:id,mode:'tdm',botDifficulty:'casual'});
    const game=simulation.game,world=game.world;
    assert.equal(world.referenceId,id);assert.equal(world.tactical.patrolPoints.length,count);
    assert.equal(game.actors.length,10);
    for(const actor of game.actors.slice(1))actor.controllerType='bot';
    game.beginRound();
    for(let i=0;i<60;i++)simulation.tick();
    const bots=game.actors.flatMap(actor=>actor.bot?[actor.bot]:[]);
    assert.equal(bots.length,9);
    const goal=world.tactical.patrolPoints.find(p=>p.y>.3);
    assert.ok(goal);
    for(const bot of bots){
      bot.setGoal(goal);
      assert.ok(world.findPath(bot.actor,bot.goal).length);
    }
  });
}
