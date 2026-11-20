import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {TEAM_COMMS_TYPE,TEAM_COMMS_RATE_MS,TEAM_COMMS_LIFETIME} from '../../shared/multiplayer/protocol.mjs';
import {createLocalServer} from '../local-server.mjs';
import {delay,options,own,ready,until} from './helpers.mjs';

function match(peer,kind,extra={}){
  peer.send('match',{kind,matchId:peer.state.matchId,controlEpoch:own(peer).controlEpoch,...extra});
}
function request(peer,kind,serial,extra={}){
  const {state}=peer,actor=own(peer);
  return {kind,serial,matchId:state.matchId,round:state.round,lifeId:actor.lifeId,
    controlEpoch:actor.controlEpoch,tick:state.tick,...extra};
}
function send(peer,kind,serial,extra){
  peer.send(TEAM_COMMS_TYPE,request(peer,kind,serial,extra));
}
async function fixture(t,mode,team='analysts'){
  const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
  t.after(()=>local.close());
  const client=()=>new Client(local.url,{headers:{Origin:local.url}});
  const host=await ready(await client().create('private-fps',{...options,team,mode,fillBots:true}));
  const opposite=team==='analysts'?'counterAnalysts':'analysts';
  const ally=await ready(await client().joinById(host.roomId,{...options,team,name:'Ally'}));
  const enemy=await ready(await client().joinById(host.roomId,{...options,team:opposite,name:'Opponent'}));
  const room=[...local.rooms][0],game=room.sim.game;
  // Keep the objective/perception/path simulation running during the protocol checks.
  Object.assign(game.config,{botFire:false,buyTime:.3});
  const packets=new Map(),general=[];
  const peers=[host,ally,enemy];
  for(const p of peers){
    const values=[];packets.set(p,values);
    p.onMessage(TEAM_COMMS_TYPE,m=>values.push({...m,lifeAtReceipt:own(p)?.lifeId}));
    p.onMessage('events',batch=>general.push(...batch.map(e=>e.type)));
    p.onMessage('notice',()=>{});
  }
  async function start(){
    for(const p of peers)match(p,'ready',{ready:true});
    await until(()=>peers.every(p=>own(p).playerReady),'connected players ready');
    match(host,'start');
    await until(()=>peers.every(p=>p.state.phase==='active'&&p.state.actors.size===10&&
      (mode!=='classic'||p.state.roundPhase==='active')),'ten actors in active play');
    for(const p of peers)p.send('controls',{enabled:true,lifeId:own(p).lifeId,controlEpoch:own(p).controlEpoch});
    await until(()=>peers.every(p=>room.seats.get(p.sessionId).enabled),'each client resumes from the countdown');
  }
  const actor=p=>room.seats.get(p.sessionId).actor;
  return {local,host,ally,enemy,room,game,packets,general,start,actor};
}
function assertPrivate({host,ally,enemy,packets,general},count){
  assert.equal(packets.get(host).length,count);
  assert.equal(packets.get(ally).length,count);
  assert.equal(packets.get(enemy).length,0,'opposing socket received no private packet');
  assert(!general.includes('radio'),'no radio in room-wide gameplay events');
  assert.equal(enemy.state.teamComms,undefined);
  assert.equal(enemy.state.orders,undefined);
}
async function cooldown(){await delay(TEAM_COMMS_RATE_MS+90);}

for(const mode of ['tdm','classic'])test(mode+' team signals stay private and reject forged or stale requests',{timeout:35000},async t=>{
  const env=await fixture(t,mode);
  const {host,enemy,room,game,packets,actor}=env;
  const anchorId=mode==='tdm'?'commons':'bomb-site';
  send(host,'ping',1,{anchorId});
  await delay(100);
  assertPrivate(env,0);
  await env.start();
  send(enemy,'ping',1,{anchorId:'commons'});
  await until(()=>packets.get(enemy).length===1,'opponent receives their own team signal');
  assert.equal(packets.get(enemy).pop().serial,1);
  assertPrivate(env,0);
  send(host,'ping',1,{anchorId:'constructor'});
  send(host,'ping',1,{anchorId,team:own(enemy).team});
  send(host,'ping',1,{anchorId,x:20,z:20});
  send(host,'ping',1,{anchorId,lifeId:own(host).lifeId+1});
  send(host,'ping',1,{anchorId,controlEpoch:own(host).controlEpoch+1});
  send(host,'ping',1,{anchorId,round:host.state.round+1});
  send(host,'ping',1,{anchorId,matchId:host.state.matchId+1});
  send(host,'ping',1,{anchorId,tick:host.state.tick+1000});
  send(host,'ping',1,{anchorId,tick:0xffffffff});
  send(host,'backup',1,{anchorId});
  if(mode==='tdm')send(host,'ping',1,{anchorId:'bomb-site'});
  await delay(100);
  assertPrivate(env,0);

  const player=actor(host),near=[...room.bots.values()].find(s=>s.actor.team===player.team).actor;
  Object.assign(player,{x:22.8,z:-12,y:0});
  Object.assign(near,{x:22.8,z:-19,y:0,yaw:Math.PI});
  send(host,'ping',1,{anchorId});
  await until(()=>packets.get(host).length===1&&packets.get(env.ally).length===1,'both teammates receive the fixed-anchor ping');
  assertPrivate(env,1);
  const [ping]=packets.get(host);
  assert.equal(ping.anchorId,anchorId);
  assert.equal(ping.serial,1,'sequence numbers reveal no opposing team activity');
  assert.equal(ping.expiresAt>game.state.time&&ping.expiresAt<=game.state.time+TEAM_COMMS_LIFETIME,true);
  assert.equal(room.teamComms.orders.size,0,'ordinary pings leave bots on their regular duties');
  send(host,'backup',2);
  await delay(150);
  assertPrivate(env,1);
  await cooldown();
  send(host,'backup',2);
  await delay(100);
  assertPrivate(env,1);

  send(host,'together',3);
  await until(()=>packets.get(host).length===2&&packets.get(env.ally).length===2,'team command delivered');
  assertPrivate(env,2);
  const order=room.teamComms.orders.get(player.team);
  assert(order?.bot,mode+' has a real eligible bot');
  assert.equal(order.bot.actor.team,player.team);
  assert.equal(game.actors.filter(a=>a.bot?.teamOrder).length,1);
  assert.equal(order.bot.actor.id,near.id);
  const span=()=>Math.hypot(order.bot.actor.x-order.point.x,order.bot.actor.z-order.point.z);
  const before=span();
  await until(()=>span()<before-.4,'real assigned bot travels toward the server-authoritative rally point',4500);

  await cooldown();
  send(host,'ping',4,{anchorId});
  await until(()=>packets.get(host).length===3&&packets.get(env.ally).length===3,'fresh ping received');
  assert.equal(room.teamComms.orders.get(player.team),order,'normal pings preserve an explicit order already in progress');
  await cooldown();
  send(host,'backup',5);
  await until(()=>packets.get(host).length===4&&packets.get(env.ally).length===4,'new explicit signal received');
  const replacement=room.teamComms.orders.get(player.team);
  assert(replacement&&replacement!==order);
  assert.equal(replacement.kind,'backup');
  assert.equal(game.actors.filter(a=>a.bot?.teamOrder).length,1);
  assertPrivate(env,4);

  if(mode==='classic'){
    const round=host.state.round,original=request(host,'ping',6,{anchorId});
    game.state.deadline=game.state.time;
    await until(()=>!room.teamComms.orders.size,'Classic result cancels the order');
    await until(()=>host.state.round>round&&host.state.roundPhase==='active','new active Classic round',8500);
    host.send(TEAM_COMMS_TYPE,original);
    await delay(100);
    assertPrivate(env,4);
  }else{
    await until(()=>!room.teamComms.orders.size,'server expires a live order',9000);
    assert.equal(game.actors.filter(a=>a.bot?.teamOrder).length,0);

    send(host,'together',6);
    await until(()=>packets.get(host).length===5&&packets.get(env.ally).length===5,'fresh support order');
    const threatened=room.teamComms.orders.get(player.team).bot;
    const a=threatened.actor;
    const danger=[[0,-1.1],[0,1.1],[1.1,0],[-1.1,0]].map(([dx,dz])=>({x:a.x+dx,y:a.y,z:a.z+dz})).find(p=>
      game.world.canOccupy(p.x,p.z,.24,1.7,p.y)&&game.canSee({...a,y:a.y+1.4},{...p,y:p.y+1.4}));
    assert(danger,'walkable visible position for the opponent');
    Object.assign(actor(enemy),danger);
    a.yaw=Math.atan2(a.x-danger.x,a.z-danger.z);
    await until(()=>threatened.mode==='combat'&&threatened.target?.entity===actor(enemy)&&!room.teamComms.orders.size,
      'the assigned bot sees a real threat and leaves the radio order for combat');

    const original=request(host,'ping',7,{anchorId}),epoch=own(host).controlEpoch;
    Object.assign(host.reconnection,{enabled:true,minUptime:0,minDelay:150});
    room.seats.get(host.sessionId).client.ref.terminate();
    await until(()=>own(host)?.connected&&own(host).controlEpoch>epoch,'human reconnects with next epoch');
    host.send('controls',{enabled:true,lifeId:own(host).lifeId,controlEpoch:own(host).controlEpoch});
    host.send(TEAM_COMMS_TYPE,original);
    await cooldown();
    assertPrivate(env,5);
    send(host,'ping',8,{anchorId,tick:0});
    await delay(100);
    assertPrivate(env,5);
    send(host,'ping',9,{anchorId});
    await until(()=>packets.get(host).length===6&&packets.get(env.ally).length===6,'new connection can send its own current signal');
    const life=own(host).lifeId,saved=request(host,'ping',10,{anchorId});
    const body=actor(host);
    body.spawnProtectedUntil=0;
    assert(game.damage(body,200,actor(enemy),'smg'));
    body.respawnAt=game.state.time;
    await until(()=>own(host).alive&&own(host).lifeId>life,'TDM new life');
    await cooldown();
    host.send(TEAM_COMMS_TYPE,{...saved,tick:host.state.tick});
    await delay(110);
    assertPrivate(env,6);
  }
  const matchId=host.state.matchId,previousMatch=request(host,'ping',20,{anchorId});
  room.match.finish('time');
  await until(()=>host.state.phase==='results','room reaches results');
  match(host,'rematch');
  await until(()=>host.state.phase==='waiting'&&host.state.matchId>matchId,'same-room rematch ready');
  assert.equal(room.teamComms.orders.size,0);
  const count=packets.get(host).length;
  await env.start();
  await cooldown();
  host.send(TEAM_COMMS_TYPE,{...previousMatch,tick:host.state.tick});
  await delay(120);
  assertPrivate(env,count);
  for(const peer of [enemy,env.ally,host])await peer.leave();
  await until(()=>env.local.rooms.size===0,'abandoned room is disposed');
});

test('private delivery waits for the patch containing a new recipient life',{timeout:20000},async t=>{
  const env=await fixture(t,'tdm');
  const {host,ally,enemy,room,game,packets,actor}=env;
  await env.start();
  room.patchRate=0;
  const previous=own(ally).lifeId,body=actor(ally);
  body.spawnProtectedUntil=0;
  assert(game.damage(body,200,actor(enemy),'smg'));
  body.respawnAt=game.state.time;
  await until(()=>room.state.actors.get(body.id).lifeId>previous,'recipient respawns on authority');
  assert.equal(own(ally).lifeId,previous,'receiver is still on the previous patch');
  send(host,'ping',1,{anchorId:'commons'});
  await until(()=>room.teamComms.teamSerial.get(body.team)===1,'server accepted while state delivery was suspended');
  await delay(100);
  assertPrivate(env,0);
  room.broadcastPatch();
  await until(()=>packets.get(ally).length===1,'ping follows the new schema state');
  assertPrivate(env,1);
  const received=packets.get(ally)[0];
  assert(received.recipientLifeId>previous);
  assert.equal(received.recipientLifeId,received.lifeAtReceipt);
});
test('Classic radio preserves bots planting, defusing and escorting',{timeout:35000},async t=>{
  const env=await fixture(t,'classic','counterAnalysts');
  const {host,enemy,room,game,packets}=env;
  await env.start();
  const planter=[...room.bots.values()].find(x=>x.actor.team==='counterAnalysts').actor;
  Object.assign(planter,game.world.anchors.bomb);
  Object.assign(game.bomb,{carrierId:planter.id,status:'carried'});
  await until(()=>planter.action?.type==='plant','real bot begins planting');
  const plant=planter.action;
  send(host,'backup',1);
  await until(()=>packets.get(host).length===1,'call for backup accepted during ally planting');
  assert.equal(planter.action,plant);
  assert(!planter.bot.teamOrder);
  await until(()=>game.bomb.status==='planted','same bot completes plant',6500);

  const defuser=[...room.bots.values()].find(x=>x.actor.team==='analysts').actor;
  Object.assign(defuser,{x:game.bomb.x,z:game.bomb.z,y:0});
  Object.assign(planter,game.world.anchors.counterAnalysts[0]);
  await until(()=>defuser.action?.type==='defuse','real bot begins defusing');
  const defuse=defuser.action;
  send(enemy,'together',1);
  await until(()=>packets.get(enemy).length===1,'call for help accepted during ally defuse');
  assert.equal(defuser.action,defuse);
  assert(!defuser.bot.teamOrder);
  assert.equal(packets.get(enemy)[0].botAssigned,false);
  await until(()=>game.state.result?.reason==='defuse','same bot completes defuse',7500);

  const round=host.state.round;
  game.state.resultDeadline=game.state.time;
  await until(()=>host.state.round>round&&host.state.roundPhase==='active','next Classic round');
  const hostage=game.hostages[0],rescue=game.world.anchors.rescue;
  const escort=[...room.bots.values()].find(x=>x.actor.team==='counterAnalysts'&&x.actor.id!==game.bomb.carrierId).actor;
  const start=game.world.navigation.nodes.find(p=>{
    const distance=Math.hypot(p.x-rescue.x,p.z-rescue.z);
    return distance>rescue.radius+2&&distance<rescue.radius+3&&game.world.navigation.clear(p,rescue);
  });
  assert(start);
  const distance=Math.hypot(start.x-rescue.x,start.z-rescue.z);
  Object.assign(hostage,{x:start.x,z:start.z,y:0,escortId:escort.id,path:[],pathAt:0});
  Object.assign(escort,{x:start.x+(rescue.x-start.x)/distance,z:start.z+(rescue.z-start.z)/distance,y:0});
  const walked=hostage.distanceWalked;
  send(host,'together',2);
  await until(()=>packets.get(host).length===2,'team radio accepted with a hostage already following a bot');
  assert(!escort.bot.teamOrder);
  await until(()=>hostage.distanceWalked>walked+.25,'bot escort continues moving under Classic rules');
});
