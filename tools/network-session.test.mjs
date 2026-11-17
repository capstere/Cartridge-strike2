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

test('late own shot confirmations stay deduplicated through render stalls and pause/resume',()=>{
  const self={id:'a',lifeId:2,alive:true,ready:true},old=performance.now()-5000;
  const session={closed:false,enabled:true,seenEvent:0,events:[],localPlayerId:'a',lifeId:2,alive:true,lastPatch:old,remote:new Map(),
    room:{state:{actors:new Map([['a',self]]),time:0},send(){}},
    world:{doors:{doors:[],elevators:{setProgress(){}}}},view:{state:{},actors:[]},predict:{tick:()=>0},prediction:{reset(){}},input:{pendingCount:0},
    predictedShots:new Map([['a:2:1',old],['a:2:2',old],['a:2:3',old]]),
    metrics:{confirmedShots:0,suppressedShots:0,maxPending:0,resets:0}};
  NetworkSession.prototype.advanceFrame.call(session,performance.now(),{});
  NetworkSession.prototype.receiveEvents.call(session,[{eventId:1,type:'shot',actorId:'a',lifeId:2,actionId:'a:2:1'}]);
  assert.equal(session.events.length,0,'a rendering stall must not replay an already presented shot');
  NetworkSession.prototype.setInputEnabled.call(session,false);
  NetworkSession.prototype.setInputEnabled.call(session,true);
  NetworkSession.prototype.receiveEvents.call(session,[{eventId:2,type:'shot',actorId:'a',lifeId:2,actionId:'a:2:2'}]);
  assert.equal(session.events.length,0,'a confirmation after Resume must not repeat old muzzle/audio feedback');
  self.alive=false;
  NetworkSession.prototype.snapshot.call(session);
  NetworkSession.prototype.receiveEvents.call(session,[{eventId:3,type:'shot',actorId:'a',lifeId:2,actionId:'a:2:3'}]);
  assert.equal(session.events.length,0,'death in the same life must not repeat the final shot');
  assert.equal(session.metrics.suppressedShots,3);
  session.predictedShots.set('a:2:4',old);self.lifeId=3;self.alive=true;
  NetworkSession.prototype.snapshot.call(session);
  assert.equal(session.predictedShots.size,0,'respawn releases the preceding life history');
  // Rejected predictions also have a strict memory limit, even without a reply.
  for(let i=1;i<1000;i++)session.predictedShots.set('a:3:'+i,old);
  NetworkSession.prototype.advanceFrame.call(session,performance.now(),{});
  assert(session.predictedShots.size<=128,'unconfirmed action history stays bounded');
});
