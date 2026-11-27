import test from 'node:test';
import assert from 'node:assert/strict';
import {NetworkSession} from '../src/fps/network/session.mjs';
import {WEAPONS} from '../src/fps/config.mjs';
import {validateNetworkInput} from '../shared/multiplayer/protocol.mjs';

// Exercise the real fixed-step input writer while capturing its ordinary wire
// packets. The SDK advances prediction once per send, independently of renders.
function triggerSession(weapon='p9'){
 const self={id:'a',lifeId:2,controlEpoch:1,alive:true,weapon,ammo:100,he:1,reloadUntil:0,nextShot:0,yaw:0,pitch:0};
 const state={phase:'active',mode:'tdm',time:0,tick:0,actors:new Map([['a',self]])};
 const wire=[];
 let steps=1;
 const prediction={world:{game:{state:{time:0}},actor:{x:0,y:0,z:0}},reset(){}};
 const session=Object.assign(Object.create(NetworkSession.prototype),{
  closed:false,enabled:true,connectionState:'connected',lastPatch:performance.now(),localPlayerId:'a',lifeId:self.lifeId,controlEpoch:self.controlEpoch,
  room:{roomId:'test',state},view:{state:{time:0},actors:[]},prediction,predict:{tick:()=>steps},
  world:{doors:{doors:[]}},residents:new Map(),projectiles:new Map(),
  fireId:0,reloadId:0,trigger:false,nextCosmetic:0,events:[],predictedShots:new Map(),actionTimes:new Map(),
  metrics:{sent:0,cosmeticShots:0,maxPending:0}
 });
 session.input={data:{},pendingCount:0,send(){
  const data={...this.data};
  validateNetworkInput(data,self,state.tick);
  assert.equal(Object.hasOwn(data,'autoFire'),false,'automatic fire remains local intent, never a wire field');
  wire.push({time:prediction.world.game.state.time,data});
  prediction.world.game.state.time+=1/60;state.time=prediction.world.game.state.time;state.tick++;
 }};
 return {session,self,state,wire,frame(controls,count=1){steps=count;session.advanceFrame(performance.now(),controls);}};
}
const shots=wire=>wire.filter((entry,index)=>entry.data.fireId>(wire[index-1]?.data.fireId||0));

test('Classic purchase feedback belongs to the latest command and current server seat',()=>{
 const {session,self,state}=triggerSession();
 Object.assign(state,{mode:'classic',roundPhase:'buy',round:1,matchId:5});
 self.connected=true;
 Object.assign(session,{classicSerial:0,onConnection(){}});
 session.view.player=self;
 const sent=[];
 session.room.send=(type,command)=>{assert.equal(type,'classic');sent.push(command);};

 assert.ok(session.classicCommand('buy','armor'));
 assert.ok(session.classicCommand('buy','smg'));
 const [previous,latest]=sent;
 const reply={...latest,outcome:'accepted'};
 const pending={...latest,outcome:'pending'};
 assert.equal(latest.serial,previous.serial+1);
 for(const invalid of [
   {...previous,outcome:'denied',reasonId:'credits'},
   {...reply,serial:previous.serial}, {...reply,item:previous.item},
   {...reply,matchId:4}, {...reply,round:0}, {...reply,lifeId:1}, {...reply,controlEpoch:0},
   {...reply,outcome:'unknown'}, {...reply,outcome:'denied',reasonId:'unknown'},
 ]){
   session.receivePurchase(invalid);
   assert.deepEqual(session.currentPurchase(),pending);
 }
 for(const [owner,field,value] of [
   [state,'round',2],[state,'matchId',6],[self,'lifeId',3],[self,'controlEpoch',2],
   [state,'roundPhase','active'],[self,'alive',false],[self,'connected',false],
 ]){
   const original=owner[field];owner[field]=value;
   session.receivePurchase(reply);
   assert.equal(session.currentPurchase(),null,field);
   assert.deepEqual(session.purchase,pending);
   owner[field]=original;
 }
 session.receivePurchase(reply);
 assert.equal(session.currentPurchase().outcome,'accepted');
 const accepted=session.currentPurchase();
 session.receivePurchase({...reply,outcome:'denied',reasonId:'credits'});
 assert.equal(session.currentPurchase(),accepted,'a duplicate cannot reverse a confirmed purchase');

 assert.ok(session.classicCommand('buy','rifle'));
 const late={...sent.at(-1),outcome:'denied',reasonId:'credits'};
 session.receivePurchase(reply);
 assert.equal(session.currentPurchase().outcome,'pending');
 session.receivePurchase(late);
 assert.equal(session.currentPurchase().outcome,'denied');
 assert.equal(session.currentPurchase().reasonId,'credits');

 assert.ok(session.classicCommand('buy','armor'));
 const interrupted={...sent.at(-1),outcome:'accepted'};
 try{
   session.beginReconnect();
   session.receivePurchase(interrupted);
   assert.equal(session.purchase,null);
   session.connectionState='connected';
   session.receivePurchase(interrupted);
   assert.equal(session.currentPurchase(),null,'rejoining does not resurrect an older purchase');
 }finally{clearTimeout(session.reconnectTimer);}
});

test('mobile automatic fire repeats semiautomatic weapons with ordinary release packets',()=>{
 for(const weapon of ['p9','p12','shotgun','sniper','knife']){
  const f=triggerSession(weapon),interval=WEAPONS[weapon].interval;
  for(let tick=0;tick<Math.ceil(interval*60*3)+2;tick++)f.frame({fire:true,autoFire:true});
  const fired=shots(f.wire);
  assert(fired.length>=3,weapon+' should keep firing while an eligible target stays under the reticle');
  assert.deepEqual(fired.map(x=>x.data.fireId),fired.map((_,i)=>i+1));
  for(let i=0;i<fired.length;i++){
   assert.equal(fired[i].data.fire,true,weapon+' shot must be a normal trigger press');
   if(i===0)continue;
   const from=f.wire.indexOf(fired[i-1]),to=f.wire.indexOf(fired[i]);
   assert(f.wire.slice(from+1,to).some(x=>!x.data.fire),weapon+' must release before its next semiautomatic shot');
   const gap=fired[i].time-fired[i-1].time;
   assert(gap>=interval-1e-8,weapon+' must keep its normal cadence');
   assert(gap<=interval+2/60,weapon+' should resume within two input ticks of readiness');
  }
  const before=f.session.fireId;
  for(let tick=0;tick<90;tick++)f.frame({fire:false,autoFire:false});
  assert.equal(f.session.fireId,before,weapon+' loses the trigger immediately when the target disappears');
  assert.equal(f.wire.at(-1).data.fire,false);
 }
});

test('manual semiautomatic hold stays a single press until a real release',()=>{
 const f=triggerSession('p9');
 for(let tick=0;tick<90;tick++)f.frame({fire:true});
 assert.equal(shots(f.wire).length,1);
 assert(f.wire.every(x=>x.data.fire),'manual hold must remain a held button');
 f.frame({fire:false});
 for(let tick=0;tick<90;tick++)f.frame({fire:true});
 assert.equal(shots(f.wire).length,2,'a released and pressed manual trigger fires again');
});

test('automatic weapons keep the same continuous input and cadence in both modes',()=>{
 const automatic=triggerSession('smg'),manual=triggerSession('smg');
 for(let tick=0;tick<120;tick++){
  automatic.frame({fire:true,autoFire:true});manual.frame({fire:true});
 }
 assert.deepEqual(automatic.wire,manual.wire);
 assert(automatic.wire.every(x=>x.data.fire));
 const fired=shots(automatic.wire);
 assert(fired.length>10);
 for(let i=1;i<fired.length;i++)assert(fired[i].time-fired[i-1].time>=WEAPONS.smg.interval-1e-8);
});

test('automatic trigger follows fixed input ticks across batched render frames',()=>{
 const single=triggerSession(),batched=triggerSession(),controls={fire:true,autoFire:true};
 for(let tick=0;tick<120;tick++)single.frame(controls);
 for(let frame=0;frame<20;frame++)batched.frame(controls,6);
 assert.deepEqual(batched.wire,single.wire,'render grouping must not change trigger edges or cadence');
 const bounded=triggerSession();bounded.frame(controls,18);
 assert.equal(bounded.wire.length,6,'a delayed render retains the existing six-step catch-up bound');
});

test('automatic trigger cannot fire while controls or combat are unavailable',()=>{
 const cases=[
  ['disabled',f=>f.session.enabled=false],
  ['reconnecting',f=>f.session.connectionState='reconnecting'],
  ['stale',f=>f.session.lastPatch=performance.now()-1100],
  ['dead',f=>f.self.alive=false],
  ['results',f=>f.state.phase='results'],
  ['Classic buy phase',f=>{f.state.mode='classic';f.state.roundPhase='buy';}],
  ['reloading',f=>f.self.reloadUntil=10],
  ['empty magazine',f=>f.self.ammo=0],
 ];
 for(const [name,block] of cases){
  const f=triggerSession();block(f);
  for(let frame=0;frame<10;frame++)f.frame({fire:true,autoFire:true},6);
  assert.equal(f.session.fireId,0,name+' must not create a shot');
  assert.equal(f.session.events.length,0,name+' must not present a shot');
 }
});

test('automatic fire never launches explosives while their manual trigger remains usable',()=>{
 for(const weapon of ['he','bazooka']){
  const automatic=triggerSession(weapon);
  for(let tick=0;tick<120;tick++)automatic.frame({fire:true,autoFire:true});
  assert.equal(automatic.session.fireId,0,weapon+' must not launch from automatic intent');
  assert(automatic.wire.every(x=>!x.data.fire),weapon+' must not put an automatic trigger on the wire');
  const manual=triggerSession(weapon);manual.frame({fire:true});
  assert.equal(manual.session.fireId,1,weapon+' retains its explicit manual launch');
 }
});

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

test('private team packets are scoped to current teammates, match and life',()=>{
 const self={id:'a',team:'analysts',ready:true,connected:true,alive:true,controlEpoch:2,lifeId:3};
 const ally={...self,id:'b',controlEpoch:1,lifeId:4};
 const enemy={...self,id:'c',team:'counterAnalysts'};
 const other={...ally,id:'d'};
 const state={actors:new Map([['a',self],['b',ally],['c',enemy],['d',other]]),mode:'classic',phase:'active',roundPhase:'active',matchId:7,round:3,time:41};
 const anchor={id:'bomb-site',label:'Bombplats',x:2,z:3};
 const session=Object.assign(Object.create(NetworkSession.prototype),{
  connected:true,connectionState:'connected',enabled:true,localPlayerId:'a',room:{state},
  view:{state:{time:41}},events:[],teamAnchors:new Map([[anchor.id,anchor]]),receivedTeamComms:new Map()
 });
 const packet={kind:'ping',anchorId:anchor.id,senderId:'b',senderName:'Ally',senderLifeId:4,senderEpoch:1,
  recipientLifeId:3,recipientEpoch:2,team:'analysts',matchId:7,round:3,expiresAt:48,serial:1,botAssigned:false};
 for(const invalid of [{senderId:'c'},{senderLifeId:3},{senderEpoch:0},{recipientLifeId:2},{recipientEpoch:1},
     {matchId:6},{round:2},{expiresAt:40},{anchorId:'custom-coordinate'}]){
  session.receiveTeamComms({...packet,...invalid});
  assert.equal(session.teamSignal,undefined);
 }
 session.receiveTeamComms(packet);
 assert.equal(session.teamSignal.anchor,anchor);
 assert.equal(session.view.teamPing,session.teamSignal);
 assert.equal(session.events.length,0,'normal pings play no command voice');
 session.receiveTeamComms({...packet,kind:'backup'});
 assert.equal(session.events.length,0,'duplicate packet cannot play radio audio');
 session.receiveTeamComms({...packet,kind:'backup',serial:2,anchorId:undefined});
 assert.equal(session.events[0].teamPrivate,true);
 assert.equal(session.events[0].command,'backup');
 assert.equal(session.view.teamPing.anchor,anchor);
 session.receiveTeamComms({...packet,senderId:'d',serial:3});
 ally.alive=false;
 session.expireTeamComms();
 assert.equal(session.teamSignal.senderId,'d','the newer ping remains valid');
 assert.deepEqual(session.drainEvents(),[],'the earlier voice is scoped to its own sender life');
 other.alive=false;
 session.expireTeamComms();
 assert.equal(session.teamSignal,null);
 assert.equal(session.view.teamPing,null);
 ally.alive=true;
 session.receiveTeamComms({...packet,serial:4});
 assert(session.view.teamPing);
 state.roundPhase='result';
 session.expireTeamComms();
 assert.equal(session.view.teamPing,null);
});
