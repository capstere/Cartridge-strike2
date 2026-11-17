import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkSession} from '../src/fps/network/session.mjs';

test('delayed combat events cannot leak across lives or departed seats; own effects deduplicate',()=>{
  const session={closed:false,enabled:true,seenEvent:0,events:[],localPlayerId:'a',
    room:{state:{actors:new Map([['a',{lifeId:2}],['b',{lifeId:3}]])}},
    predictedShots:new Map([['a:2:1',0]]),metrics:{confirmedShots:0,suppressedShots:0}};
  const events=[
    {eventId:1,type:'shot',actorId:'a',lifeId:1},
    {eventId:2,type:'impact',sourceId:'b',sourceLifeId:2},
    {eventId:3,type:'shot',actorId:'departed',lifeId:1},
    {eventId:4,type:'impact',sourceId:'departed',sourceLifeId:1},
    {eventId:5,type:'shot',actorId:'a',lifeId:2,actionId:'a:2:1'},
    {eventId:6,type:'shot',actorId:'b',lifeId:3,actionId:'b:3:1'},
  ];
  NetworkSession.prototype.receiveEvents.call(session,events);
  NetworkSession.prototype.receiveEvents.call(session,events);
  assert.deepEqual(session.events,[events.at(-1)]);
  assert.deepEqual(session.metrics,{confirmedShots:1,suppressedShots:1});
  assert.equal(session.predictedShots.size,0);
});
