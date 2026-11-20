import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {DIFFICULTIES, WEAPONS} from '../../src/fps/config.mjs';
import {createLocalServer} from '../local-server.mjs';
import {delay, options, own, ready, until} from './helpers.mjs';

function command(peer,kind,extra={}){
  peer.send('match',{kind,matchId:peer.state.matchId,controlEpoch:own(peer).controlEpoch,...extra});
}
function difficulty(peer,botDifficulty,serial,extra={}){
  command(peer,'botDifficulty',{botDifficulty,serial,...extra});
}
async function setup(t,match={}){
  const local=await createLocalServer({port:0,testMatch:match});
  t.after(()=>local.close());
  const client=new Client(local.url,{headers:{Origin:local.url}});
  const create=(mode,extra={})=>readyRoom(client.create('private-fps',{...options,mode,team:'analysts',fillBots:true,...extra}));
  const join=(peer,team)=>readyRoom(client.joinById(peer.roomId,{...options,team}));
  const authority=peer=>[...local.rooms].find(room=>room.roomId===peer.roomId);
  return {create,join,authority};
}
async function readyRoom(join){
  const room=await join;
  room.onMessage('notice',()=>{});
  return ready(room);
}
async function start(host,peers=[host]){
  for(const peer of peers)command(peer,'ready',{ready:true});
  await until(()=>peers.every(p=>own(p).playerReady),'waiting players ready');
  command(host,'start');
  await until(()=>host.state.phase==='countdown','match enters countdown');
}
function assertProfile(room,id){
  const g=room.sim.game;
  assert.equal(room.state.botDifficulty,id);
  assert.equal(g.state.difficulty,id);
  assert.equal(g.config.difficulty,id);
  for(const {actor} of room.bots.values()){
    if(actor.bot)assert.equal(actor.bot.profile,DIFFICULTIES[id],actor.id);
  }
}

for(const mode of ['classic','tdm'])test(mode+' bot difficulty authority, reconnect, new lives and rematch',{timeout:30000},async t=>{
  const {create,join,authority}=await setup(t,{countdownSeconds:1});
  const host=await create(mode),guest=await join(host,'counterAnalysts'),other=await create(mode);
  const r=authority(host),g=r.sim.game;
  const selection=mode==='classic'?'hard':'casual';
  assert.equal(host.state.botDifficulty,'normal');
  difficulty(guest,'hard',1);
  difficulty(host,'constructor',1);
  difficulty(host,'hard',0);
  difficulty(host,'hard',1,{matchId:host.state.matchId+1});
  difficulty(host,'hard',1,{controlEpoch:own(host).controlEpoch+1});
  await delay(110);
  assertProfile(r,'normal');

  difficulty(host,selection,2);
  await until(()=>host.state.botDifficulty===selection&&guest.state.botDifficulty===selection,'host choice reaches both clients');
  difficulty(host,'normal',1);
  difficulty(host,'normal',2);
  await delay(110);
  assertProfile(r,selection);
  assertProfile(authority(other),'normal');
  assert.equal(other.state.botDifficulty,'normal');
  await other.leave();

  await start(host,[host,guest]);
  difficulty(host,'normal',3);
  await until(()=>host.state.phase==='active','countdown runs without accepting a change');
  difficulty(host,'normal',4);
  await delay(110);
  assertProfile(r,selection);
  assert([...r.bots.values()].every(({actor})=>actor.bot?.profile===DIFFICULTIES[selection]));

  const oldEpoch=own(host).controlEpoch;
  Object.assign(host.reconnection,{enabled:true,minUptime:0,minDelay:150});
  r.seats.get(host.sessionId).client.ref.terminate();
  await until(()=>own(host)?.connected&&own(host).controlEpoch>oldEpoch,'host reconnects');
  assert.equal(host.state.botDifficulty,selection);
  assertProfile(r,selection);

  const replacementId=own(guest).id;
  await guest.leave();
  if(mode==='classic'){
    const round=g.state.round;
    g.state.buyDeadline=g.state.time;
    await until(()=>g.phase==='active','Classic buy finishes');
    g.state.deadline=g.state.time;
    await until(()=>g.phase==='result','Classic round ends');
    g.state.resultDeadline=g.state.time;
    await until(()=>host.state.round>round,'Classic round replaced its controllers');
  }else{
    await until(()=>r.bots.has(replacementId),'bot fills vacated seat');
    const a=r.bots.get(replacementId).actor,bot=a.bot,life=a.lifeId;
    a.spawnProtectedUntil=0;
    assert(g.damage(a,200,r.seats.get(host.sessionId).actor,'smg'));
    a.respawnAt=g.state.time;
    await until(()=>a.alive&&a.lifeId>life,'bot respawns');
    assert.notEqual(a.bot,bot);
  }
  assert.equal(r.bots.get(replacementId).actor.bot.profile,DIFFICULTIES[selection]);
  assertProfile(r,selection);

  const match=host.state.matchId;
  r.match.finish('time');
  await until(()=>host.state.phase==='results','match ends');
  command(host,'rematch');
  await until(()=>host.state.phase==='waiting'&&host.state.matchId>match,'rematch returns to same lobby');
  assert.equal(host.state.botDifficulty,selection);
  difficulty(host,'normal',5,{matchId:match});
  await delay(110);
  assertProfile(r,selection);
  await start(host);
  await until(()=>host.state.phase==='active','rematch starts');
  assertProfile(r,selection);
  await host.leave();
});

test('each online profile changes real bot reaction and hits, with Casual limited to enemy team bots',{timeout:36000},async t=>{
  const {create,join,authority}=await setup(t,{countdownSeconds:.4});
  const times=[];
  for(const id of ['casual','normal','hard']){
    const host=await create('tdm',{zombies:true,danceman:true});
    const r=authority(host),g=r.sim.game,player=r.seats.get(host.sessionId).actor;
    difficulty(host,id,1);
    await until(()=>host.state.botDifficulty===id,'requested profile');
    await start(host);
    await until(()=>host.state.phase==='active','active TDM');
    const bot=r.bots.get('counterAnalysts-0').actor;
    const ally=g.actors.find(a=>a.team===player.team&&a.bot);
    const zombie=g.state.zombies.find(a=>a.id.startsWith('zombie-'));
    const dancer=g.state.zombies.find(a=>a.id==='danceman');
    assert(zombie&&dancer,'resident fixture');
    // Real BotController and its weapon against a stationary human in a clear
    // C08 lane. Isolate the pair and manually advance fixed steps.
    for(const a of g.actors)if(a!==player&&a!==bot){a.alive=false;a.respawnAt=null;}
    g.state.zombies=[];
    const place=(a,z)=>Object.assign(a,{x:22.8,y:0,z,yaw:0,pitch:0,hp:100,armor:0,alive:true,
      onGround:true,vx:0,vy:0,nextShot:0,spawnProtectedUntil:0});
    place(bot,-12);place(player,-15);
    g.config.botSpeed=0;
    bot.bot.nextDecision=0;
    g.drainEvents();
    let firstShot,hit;
    for(let n=0;n<240&&!hit;n++){
      g.stepActors();
      const events=g.drainEvents();
      firstShot??=events.find(e=>e.type==='shot'&&e.actorId===bot.id&&e.targetId===player.id);
      hit=events.find(e=>e.type==='damage'&&e.actorId===player.id&&e.sourceId===bot.id);
    }
    assert(firstShot&&hit,'live bot perceived and hit a real player in '+id);
    const profile=DIFFICULTIES[id],reaction=firstShot.reactionAt-firstShot.detectedAt;
    assert(reaction>=profile.reactionMin-1e-8&&reaction<=profile.reactionMax+1e-8);
    assert(firstShot.time>=firstShot.reactionAt-1e-8);
    times.push(firstShot.time-firstShot.detectedAt);
    assert.equal(hit.amount,WEAPONS[hit.weapon].damage*profile.humanDamage);

    if(id==='casual'){
      player.hp=100;player.armor=50;
      assert(g.damage(player,20,bot,'smg'));
      assert(Math.abs(player.hp-(100-20*.55*.68))<1e-9);
      assert(Math.abs(player.armor-(50-20*.55*.32))<1e-9);
      const check=(target,source,kind,fire=true)=>{
        target.hp=100;target.armor=0;target.alive=true;target.spawnProtectedUntil=0;
        assert.equal(g.damage(target,20,source,kind),fire);
        assert.equal(target.hp,fire?80:100);
      };
      // An opposing registered human covers the PvP source case.
      const opponent=await join(host,'counterAnalysts');
      const human=r.seats.get(opponent.sessionId).actor;
      check(player,human,'smg');
      check(ally,bot,'smg');
      check(player,ally,'smg',false);
      g.config.friendlyFire=true;
      check(player,ally,'smg');
      check(player,player,'bazooka');
      zombie.behavior='attack';zombie.alive=true;
      check(player,zombie,'stomp');
      check(player,dancer,'he');
      await opponent.leave();
    }
    await host.leave();
  }
  assert(times[0]>times[1]&&times[1]>times[2],JSON.stringify(times));
});
