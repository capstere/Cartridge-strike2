import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkSession} from '../src/fps/network/session.mjs';

test('render stalls do not masquerade as network loss; real silence still reconnects',()=>{
 let drops=0;
 const session={closed:false,connectionState:'connected',lastPatch:100,lastWatchdog:100,silenceSince:0,interruptConnection(){drops++;}};
 const check=now=>NetworkSession.prototype.checkConnection.call(session,now);
 check(4500);assert.equal(drops,0,'allow delayed socket tasks after a blocked main thread');
 session.lastPatch=4510;check(5500);assert.equal(drops,0);
 check(6500);check(7500);assert.equal(drops,0);
 check(8500);assert.equal(drops,1,'sustained silence across running timer callbacks reconnects');
 session.closed=true;check(9500);assert.equal(drops,1);
});

test('reconnect rejects old-epoch effects and disposed sessions ignore late callbacks',()=>{
  const session={closed:false,enabled:true,connectionState:'connected',seenEvent:0,events:[],localPlayerId:'a',
    room:{state:{residents:new Map(),actors:new Map([['b',{lifeId:3,controlEpoch:2}]])}}};
  const old={eventId:1,type:'shot',actorId:'b',lifeId:3,controlEpoch:1};
  const fresh={...old,eventId:2,controlEpoch:2};
  NetworkSession.prototype.receiveEvents.call(session,[old,fresh]);
  assert.deepEqual(session.events,[fresh]);
  session.connectionState='reconnecting';
  NetworkSession.prototype.receiveEvents.call(session,[{...fresh,eventId:3}]);
  assert.equal(session.seenEvent,2);
  session.closed=true;session.room=null;
  NetworkSession.prototype.receiveEvents.call(session,[{...fresh,eventId:4}]);
  NetworkSession.prototype.snapshot.call(session);
  NetworkSession.prototype.advanceFrame.call(session,performance.now(),{fire:true});
  NetworkSession.prototype.beginReconnect.call(session);
  assert.equal(session.seenEvent,2,'late callbacks cannot mutate the old session');
});

test('delayed combat events cannot leak across lives or departed seats; own effects deduplicate',()=>{
  const session={closed:false,enabled:true,seenEvent:0,events:[],localPlayerId:'a',
    room:{state:{residents:new Map(),actors:new Map([['a',{lifeId:2}],['b',{lifeId:3}]])}},
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
  const session=Object.assign(Object.create(NetworkSession.prototype),{closed:false,enabled:true,seenEvent:0,events:[],localPlayerId:'a',lifeId:2,alive:true,lastPatch:old,remote:new Map(),residents:new Map(),projectiles:new Map(),
    room:{state:{residents:new Map(),actors:new Map([['a',self]]),brokenGlass:new Map(),grenades:new Map(),projectiles:new Map(),time:0},send(){}},
    world:{glass:{reset(){},panes:new Map()},doors:{doors:[],elevators:{setProgress(){}}}},view:{state:{},actors:[]},predict:{tick:()=>0},prediction:{reset(){}},input:{pendingCount:0},
    predictedShots:new Map([['a:2:1',old],['a:2:2',old],['a:2:3',old]]),
    metrics:{confirmedShots:0,suppressedShots:0,maxPending:0,resets:0}});
  session.advanceFrame(performance.now(),{});
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

test('resident events require the current resident generation on either side of damage',()=>{
  const state={mode:'classic',round:2,actors:new Map([['a',{lifeId:2,controlEpoch:1}]]),
    residents:new Map([['zombie-0',{lifeId:6}]])};
  const session={closed:false,enabled:true,seenEvent:0,events:[],room:{state}};
  const damage={type:'damage',actorId:'a',lifeId:2,controlEpoch:1,sourceId:'zombie-0',sourceLifeId:6,sourceControlEpoch:0,round:2};
  const killed={type:'kill',actorId:'zombie-0',lifeId:6,controlEpoch:0,sourceId:'a',sourceLifeId:2,sourceControlEpoch:1,round:2};
  const events=[{...damage,eventId:1,sourceLifeId:5},{...killed,eventId:2,lifeId:5},
    {...damage,eventId:3,round:1},{...damage,eventId:4},{...killed,eventId:5}];
  NetworkSession.prototype.receiveEvents.call(session,events);
  assert.deepEqual(session.events,events.slice(-2));
});
