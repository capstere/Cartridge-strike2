import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {NetworkSession} from '../../src/fps/network/session.mjs';
import {delay,options,own,ready,until} from './helpers.mjs';

const command=(p,kind,extra={})=>p.send('match',{kind,matchId:p.state.matchId,controlEpoch:own(p).controlEpoch,...extra});
test('SDK private clip, reconnect, normal respawn and match final follow authoritative patches',{timeout:25000},async t=>{
  const server=await createLocalServer({port:0,testMatch:{countdownSeconds:.08,scoreTarget:2}});
  const peers=[];
  t.after(async()=>{await Promise.allSettled(peers.map(p=>p.leave()));await server.close();});
  const sdk=new Client(server.url,{headers:{Origin:server.url}});
  async function join(team,id){
    const settings={...options,team,mode:'tdm',mapId:'compact-arena'};
    const peer=id?await sdk.joinById(id,settings):await sdk.create('private-fps',settings);
    peers.push(peer);
    const session=new NetworkSession({data:{}}),packets=[];
    peer.onMessage('replay',packet=>{
      const scope=session.replayScope();packets.push({packet,scope,admitted:session.replay.receive(packet,scope)});
    });
    await ready(peer);
    Object.assign(session,{room:peer,worldRevision:peer.state.worldRevision,connectionState:'connected',localPlayerId:own(peer).id});
    return {peer,session,packets};
  }
  const host=await join('analysts'),guest=await join('counterAnalysts',host.peer.roomId);
  const [room]=server.rooms,g=room.sim.game;
  for(const peer of peers)command(peer,'ready',{ready:true});
  await until(()=>peers.every(p=>own(p).playerReady),'both ready');
  command(host.peer,'start');
  await until(()=>peers.every(p=>p.state.phase==='active'),'match active');
  const killer=room.seats.get(host.peer.sessionId).actor,victim=room.seats.get(guest.peer.sessionId).actor;
  g.config.respawnDelay=1.6;
  async function eliminate(){
    await delay(310);
    victim.spawnProtectedUntil=0;
    assert.ok(g.damage(victim,500,killer,'sniper',{head:true}));
  }
  const life=victim.lifeId;
  await eliminate();
  await until(()=>guest.packets.length===1,'victim received recorded elimination');
  const {packet,admitted}=guest.packets[0];assert.equal(admitted,true);
  assert.equal(packet.kind,'death');assert.equal(host.packets.length,0);
  assert.equal(packet.clip.killer.id,killer.id);assert.equal(packet.clip.victim.id,victim.id);
  assert.equal(guest.session.replay.frame.stage,'card');
  assert.equal(guest.session.replay.update(guest.session.replayScope(),guest.session.replay.started+805).stage,'replay');
  const epoch=own(guest.peer).controlEpoch;
  Object.assign(guest.peer.reconnection,{enabled:true,minUptime:0,minDelay:50,maxDelay:150});
  room.seats.get(guest.peer.sessionId).client.ref.terminate();
  await until(()=>own(guest.peer)?.connected&&own(guest.peer).controlEpoch>epoch,'restored socket has a new authority epoch');
  assert.equal(guest.session.replay.update(guest.session.replayScope()),null);
  assert.equal(guest.session.replay.receive(packet,guest.session.replayScope()),false);
  await until(()=>own(guest.peer).alive&&own(guest.peer).lifeId>life,'ordinary respawn restores the owner');
  assert.ok(own(guest.peer).pistolAmmo>0);
  await eliminate();
  await until(()=>host.packets.length&&guest.packets.length===2,'both receive final replay');
  for(const seat of [host,guest]){
    const entry=seat.packets.at(-1);assert.equal(entry.packet.kind,'final');assert.equal(entry.admitted,true);
    assert.equal(entry.scope.phase,'results');assert.equal(seat.session.replay.frame.stage,'replay');
    seat.session.replay.skip();assert.equal(seat.session.replay.update(seat.session.replayScope()),null);
  }
});
