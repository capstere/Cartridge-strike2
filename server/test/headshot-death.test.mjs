import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {NetworkSession} from '../../src/fps/network/session.mjs';
import {eye} from '../../src/fps/game.mjs';
import {delay,options,own,ready,send,until} from './helpers.mjs';

const command=(p,kind,extra={})=>p.send('match',{kind,matchId:p.state.matchId,controlEpoch:own(p).controlEpoch,...extra});

// Read a fresh presentation solely from an SDK snapshot. No kill event,
// interpolation history, previous actor model, or local death timer is supplied.
function present(peer,id,frameDelayMs=0) {
  const world={data:{},glass:{reset(){},panes:new Map()},doors:{doors:[],elevators:{setProgress(){}}}};
  const session=new NetworkSession(world);
  Object.assign(session,{room:peer,worldRevision:peer.state.worldRevision,localPlayerId:own(peer).id,predict:{attach(){}},prediction:{reset(){}}});
  session.snapshot();
  session.updateDisplayTime(peer.state,performance.now()+frameDelayMs);
  const actor=session.view.actors.find(a=>a.id===id);
  const {time,headshotTime}=session.view.state;
  return {variant:actor.deathVariant,at:actor.deathAt,age:(headshotTime??time)-actor.deathAt,time,headshotTime};
}

for(const mode of ['classic','tdm'])test(mode+' peers reconstruct headshot deaths across snapshots and new lives',{timeout:30000},async t=>{
  const server=await createLocalServer({port:0,testMatch:{countdownSeconds:.1,scoreTarget:2}});
  const peers=[];
  t.after(async()=>{await Promise.allSettled(peers.map(p=>p.leave()));await server.close();});
  async function join(team,roomId){
    const client=new Client(server.url,{headers:{Origin:server.url}});
    const settings={...options,mode,team,fillBots:mode==='classic'};
    const peer=await ready(await (roomId?client.joinById(roomId,settings):client.create('private-fps',settings)));
    peers.push(peer);
    return peer;
  }
  const host=await join('analysts'),guest=await join('counterAnalysts',host.roomId);
  const [room]=server.rooms,game=room.sim.game;
  Object.assign(game.config,{buyTime:.2,resultTime:.3,botFire:false});
  for(const peer of peers)command(peer,'ready',{ready:true});
  await until(()=>peers.every(p=>own(p).playerReady),'two ready participants');
  command(host,'start');
  await until(()=>host.state.phase==='active'&&game.phase==='active','match active');
  host.send('controls',{enabled:true,lifeId:own(host).lifeId,controlEpoch:own(host).controlEpoch});
  const shooter=room.seats.get(host.sessionId).actor;
  const target=mode==='classic'?[...room.bots.values()].find(s=>s.actor.team!==shooter.team).actor:room.seats.get(guest.sessionId).actor;
  if(mode==='classic'){
    // The living team bot holds a crouch for a repeatable hitbox and shot.
    target.bot.update=()=>({crouch:true});
  }
  async function shoot(fireId){
    Object.assign(shooter,{x:20,y:0,z:-18,yaw:Math.PI,spawnProtectedUntil:0});
    Object.assign(target,{x:20,y:0,z:-16,hp:12,armor:0,spawnProtectedUntil:0});
    // Allow the arranged pose into the same rewind history as a normal input.
    await delay(250);
    const pitch=Math.atan2(target.y+target.height*.93-eye(shooter).y,target.z-shooter.z-target.radius);
    send(host,{fire:true,fireId,yaw:Math.PI,pitch});
    await until(()=>peers.every(p=>p.state.actors.get(target.id)?.deathVariant==='headshot'),'replicated fatal firearm hit');
    const at=target.deathAt;
    assert.equal(target.alive,false);
    for(const peer of peers){
      const state=present(peer,target.id);
      assert.deepEqual([state.variant,state.at],['headshot',at]);
      assert(state.age>=0);
    }
    return at;
  }
  const life=target.lifeId,at=await shoot(1);
  const epoch=own(guest).controlEpoch;
  Object.assign(guest.reconnection,{enabled:true,minUptime:0,minDelay:80,maxDelay:150});
  room.seats.get(guest.sessionId).client.ref.terminate();
  await until(()=>own(guest)?.controlEpoch>epoch,'reconnect and full snapshot');
  const late=await join('analysts',host.roomId);
  for(const peer of [guest,late]){
    const state=present(peer,target.id);
    assert.deepEqual([state.variant,state.at],['headshot',at]);
    assert(state.age>0,'late snapshots seek into the death');
  }
  if(mode==='classic')game.state.deadline=game.state.time;
  await until(()=>peers.every(p=>p.state.actors.get(target.id)?.lifeId>life),'round change or TDM respawn');
  for(const peer of peers){
    const actor=peer.state.actors.get(target.id);
    assert.equal(actor.alive,true);
    assert.equal(actor.deathVariant,'');
    assert.equal(actor.deathAt,0);
    assert.equal(present(peer,target.id).headshotTime,undefined);
  }
  if(mode==='tdm'){
    await shoot(2);
    await until(()=>late.state.phase==='results','decisive headshot');
    await until(()=>late.clock.serverNow()-late.state.resultsAtMs>2600,'terminal pose elapsed');
    const state=present(late,target.id,3000);
    assert.equal(state.variant,'headshot');
    assert(state.age>=2.5,'even a first result snapshot has passed the end of the real clip');
    assert.equal(state.time,late.state.time+2,'ordinary deaths and other effects retain the two-second results cap');
  }
});
