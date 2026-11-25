import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {Server} from '@colyseus/core';
import {Client} from '@colyseus/sdk';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
import {RECONNECT_SECONDS,ROOM_CAPACITY} from '../../shared/multiplayer/rules.mjs';
import {NetworkRoom} from '../network-room.mjs';
import {ready,until} from './helpers.mjs';

// Exercise the real room and engine independently of the deployment's alias
// resolver, file storage and invitation. The transport listens solely on loopback.
async function fixture(t){
  const code=randomBytes(24).toString('base64url');
  let settings=Object.freeze({mode:'tdm',fillBots:false,botDifficulty:'casual',friendlyFire:false,zombiesEnabled:false,dancemanEnabled:false});
  const log={writes:0,fail:false,grace:[],disposed:[]};
  const family=Object.freeze({alias:'JESPERS-ROOM',get settings(){return settings;},acceptsCode:value=>value===code,
    saveSettings(next){
      if(log.fail)throw Error('Room settings could not be saved.');
      settings=Object.freeze({...next});log.writes++;
    }});
  let room;
  class FamilyFixture extends NetworkRoom{
    async onCreate(options){
      this.familyRoom=family;this.matchOptions={countdownSeconds:0};
      await super.onCreate(options);room=this;
      this.fixedTick();assert.equal(this.sim.tickNumber,0,'no simulation while the first seat is reserved');
    }
    allowReconnection(client,seconds){
      log.grace.push(seconds);
      return super.allowReconnection(client,.35);
    }
    onDispose(){super.onDispose();log.disposed.push(this);}
  }
  const listener=http.createServer();
  const server=new Server({greet:false,gracefullyShutdown:false,transport:new WebSocketTransport({server:listener})});
  server.define(family.alias,FamilyFixture);
  await server.listen(0,'127.0.0.1');
  t.after(()=>server.gracefullyShutdown(false));
  const sdk=new Client('http://127.0.0.1:'+listener.address().port);
  const options={code,contract:CONTRACT,name:'Member',mode:'classic',fillBots:true,zombies:true};
  const create=()=>sdk.create(family.alias,options);
  const join=()=>sdk.joinById(room.roomId,options);
  const command=(member,kind,extra={})=>{
    const seat=room.seats.get(member.sessionId);
    room.match.command(seat.client,{kind,matchId:room.state.matchId,controlEpoch:seat.epoch,...extra});
  };
  return {get room(){return room;},family,log,create,join,command};
}

test('family lobby persists only accepted host settings and switches rules on the existing simulation',{timeout:30000},async t=>{
  const f=await fixture(t);
  const first=await f.create(),r=f.room,g=r.sim.game,world=g.world;
  assert.equal(r.state.ownerId,'','a reservation has no host authority');
  assert.equal(r.state.mode,'tdm');assert.equal(r.state.fillBots,false);assert.equal(r.state.zombiesEnabled,false);
  assert.equal(r.state.botDifficulty,'casual');assert.equal(g.difficulty,'casual');
  assert.throws(()=>r.onAuth(null,{contract:CONTRACT,code:'incorrect'}),/Incorrect family room password/);
  const host=await ready(await f.join());await ready(first);
  assert.equal(r.state.ownerId,host.sessionId,'first acknowledged member owns the room');
  for(const patch of [{},{mode:'other'},{fillBots:'yes'},{mode:'classic',unknown:true},{mode:'classic',controlEpoch:99}]){
    f.command(host,'settings',patch);
  }
  f.command(first,'settings',{mode:'classic'});f.command(first,'botDifficulty',{botDifficulty:'hard',serial:1});
  assert.equal(f.log.writes,0);
  f.log.fail=true;
  assert.throws(()=>f.command(host,'settings',{mode:'classic',fillBots:true}),/could not be saved/);
  assert.throws(()=>f.command(host,'botDifficulty',{botDifficulty:'hard',serial:1}),/could not be saved/);
  assert.equal(r.state.mode,'tdm');assert.equal(r.bots.size,0);assert.equal(g.difficulty,'casual');
  f.log.fail=false;
  f.command(host,'botDifficulty',{botDifficulty:'hard',serial:1});
  f.command(host,'botDifficulty',{botDifficulty:'normal',serial:1});
  f.command(host,'residents',{zombies:true,danceman:false});
  f.command(host,'friendlyFire',{friendlyFire:true});
  f.command(first,'ready',{ready:true});
  const old=r.seats.get(host.sessionId),life=old.actor.lifeId,epoch=old.epoch;
  const tdmAnchors=new Set(r.teamComms.anchors);
  f.command(host,'settings',{mode:'classic'});
  f.command(host,'settings',{fillBots:true,controlEpoch:epoch});
  assert.equal(r.sim.game,g);assert.equal(g.world,world);assert.equal(g.state.mode,'classic');
  assert(r.state.hostages.size>0&&r.teamComms.anchors.size>tdmAnchors.size);
  assert.equal(r.state.scoreTarget,g.config.matchWins);assert.equal(r.state.durationSeconds,g.config.roundTime);
  assert.equal(old.actor.money,g.config.startMoney);assert.equal(old.actor.inventory.primary,null);
  assert(old.actor.lifeId>life);assert.equal(old.epoch,epoch);assert.equal(r.seats.get(first.sessionId).playerReady,false);
  assert.equal(r.bots.size,ROOM_CAPACITY-2);
  assert.deepEqual(f.family.settings,{mode:'classic',fillBots:true,botDifficulty:'hard',friendlyFire:true,zombiesEnabled:true,dancemanEnabled:false});

  for(const member of [first,host])f.command(member,'ready',{ready:true});
  f.command(host,'start');await until(()=>r.state.phase==='active','Classic active');
  const activeEpoch=old.epoch,classicId=r.state.matchId,round=r.state.round;
  g.state.score.analysts=2;g.state.score.counterAnalysts=1;
  const writes=f.log.writes;
  const visitor=await ready(await f.join());
  assert(r.seats.get(visitor.sessionId).pending);assert.equal(r.state.phase,'active');
  assert.equal(r.state.matchId,classicId);assert.equal(r.state.round,round);assert.equal(old.epoch,activeEpoch);
  assert.equal(g.state.score.analysts,2);assert.equal(g.state.score.counterAnalysts,1);
  f.command(host,'settings',{mode:'tdm',fillBots:false});f.command(host,'friendlyFire',{friendlyFire:false});
  f.command(host,'botDifficulty',{botDifficulty:'casual',serial:2});assert.equal(f.log.writes,writes);

  r.match.finish('rounds','analysts');f.command(host,'rematch');
  assert.equal(r.state.phase,'waiting');assert.equal(r.seats.get(visitor.sessionId).pending,false);
  f.command(host,'settings',{mode:'tdm',fillBots:false});
  assert.equal(r.sim.game,g);assert.equal(g.state.mode,'endless');assert.equal(r.state.hostages.size,0);
  assert.equal(r.state.bombStatus,'');assert.equal(g.state.bomb.status,'inactive');
  assert.deepEqual(r.teamComms.anchors,tdmAnchors);assert.equal(r.bots.size,0);assert.equal(r.state.scoreTarget,r.match.settings.scoreTarget);
  assert.equal(old.actor.inventory.primary.id,'smg');assert.equal(old.actor.money,0);assert.equal(g.difficulty,'hard');
  for(const member of [first,host,visitor])f.command(member,'ready',{ready:true});
  f.command(host,'start');await until(()=>r.state.phase==='active','TDM active');
  const matchId=r.state.matchId;
  g.state.score.counterAnalysts=3;
  const late=await ready(await f.join());
  assert(r.seats.get(late.sessionId).actor.alive);assert.equal(r.seats.get(late.sessionId).pending,false);
  assert.equal(r.state.matchId,matchId);assert.equal(r.state.phase,'active');assert.equal(g.state.score.counterAnalysts,3);
  r.match.finish('time','counterAnalysts');f.command(host,'rematch');f.command(host,'settings',{mode:'classic'});
  await Promise.all([late.leave(),visitor.leave(),host.leave(),first.leave()]);
  await until(()=>f.log.disposed.includes(r),'family disposed after last departure');
  const newHost=await ready(await f.create()),reopened=f.room;
  assert.notEqual(reopened,r);assert.equal(reopened.state.ownerId,newHost.sessionId);assert.equal(reopened.state.phase,'waiting');
  for(const [key,value] of Object.entries(f.family.settings))assert.equal(reopened.state[key],value,key);
  assert.equal(reopened.state.remainingSeconds,reopened.sim.game.config.roundTime);
  assert.equal(reopened.sim.game.config.friendlyFire,true);assert.equal(reopened.sim.game.difficulty,'hard');
  await newHost.leave();
});

test('family host survives drop grace, transfers to an acknowledged member, and empty ticks do no work',{timeout:15000},async t=>{
  const f=await fixture(t);
  const host=await ready(await f.create()),r=f.room;
  const loading=await f.join(),next=await ready(await f.join());
  r.seats.get(host.sessionId).client.ref.terminate();
  await until(()=>!r.seats.get(host.sessionId)?.connected,'host dropped');
  assert.equal(r.state.ownerId,host.sessionId);
  f.command(next,'settings',{fillBots:true});assert.equal(r.bots.size,0);
  await until(()=>r.state.ownerId===next.sessionId,'grace released');
  assert.deepEqual(f.log.grace,[RECONNECT_SECONDS]);assert.equal(r.seats.get(loading.sessionId).ready,false);
  f.command(next,'settings',{fillBots:true});assert(r.bots.size>0);
  await ready(loading);await next.leave();await until(()=>r.state.ownerId===loading.sessionId,'consented transfer');
  await loading.leave();await until(()=>f.log.disposed.includes(r),'last seat disposed');
  const tick=r.sim.tickNumber,work=r.metrics.ticks;
  r.fixedTick();assert.equal(r.sim.tickNumber,tick);assert.equal(r.metrics.ticks,work);
});
