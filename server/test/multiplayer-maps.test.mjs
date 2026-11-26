import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {CONTRACT, MAP_CONTRACTS} from '../../shared/multiplayer/build.mjs';
import {DEFAULT_MAP_ID} from '../../shared/multiplayer/maps.mjs';
import {acknowledgeWorld, delay, options, own, ready, until} from './helpers.mjs';

const arena = 'compact-arena';
const command = (peer, kind, data = {}) => peer.send('match', {
  kind, matchId: peer.state.matchId, controlEpoch: own(peer).controlEpoch, ...data,
});
async function start(host, guest) {
  for (const peer of [host, guest]) command(peer, 'ready', {ready: true});
  await until(() => [...host.state.actors.values()].every(actor => actor.playerReady), 'players ready');
  command(host, 'start');
  await until(() => host.state.phase === 'active' && guest.state.phase === 'active', 'both players in match');
}

test('server selects and verifies each room world, including reconnect across a lobby map change', {timeout: 60_000}, async t => {
  const local = await createLocalServer({port: 0, testMatch: {countdownSeconds: .02, durationSeconds: 3}});
  t.after(() => local.close());
  const client = new Client(local.url, {headers: {Origin: local.url}});
  for (const patch of [{mapId: '../floor'}, {mapId: 'synthetic-demo'}, {mapId: arena, mode: 'classic'},
    {mapId: arena, zombies: true}, {mapId: arena, danceman: true}, {contract: {...CONTRACT, buildHash: 'other'}}]) {
    await assert.rejects(client.create('private-fps', {...options, ...patch}));
  }
  const host = await ready(await client.create('private-fps', {...options, mode: 'classic'}));
  const guest = await ready(await client.joinById(host.roomId, options));
  const second = await ready(await client.create('private-fps', {...options, mapId: arena}));
  for (const peer of [host, guest, second]) peer.onMessage('notice', () => {});
  t.after(() => Promise.allSettled([guest.leave(), host.leave(), second.leave()]));
  const room = [...local.rooms].find(room => room.roomId === host.roomId);
  const other = [...local.rooms].find(room => room.roomId === second.roomId);
  const original = room.sim;
  assert.equal(original.mapId, DEFAULT_MAP_ID);
  assert.equal(other.sim.mapId, arena);
  assert.notEqual(original.sourceHash, other.sim.sourceHash);
  assert.notEqual(MAP_CONTRACTS[arena].collisionHash, CONTRACT.collisionHash);
  command(guest, 'settings', {mapId: arena});
  command(host, 'settings', {mapId: 'invalid'});
  command(host, 'settings', {mapId: arena, mode: 'classic'});
  await delay(120);
  assert.equal(room.sim, original);
  // Clients deduplicate event IDs over the entire socket lifetime. Give the
  // old simulation a history, then observe the new world's actual respawn.
  const wireEvents = [];
  host.onMessage('events', events => wireEvents.push(...events));
  for (let i = 0; i < 20; i++) original.game.emit('step', room.seats.get(host.sessionId).actor);
  const lastFloorEvent = original.game.eventSerial;
  await until(() => wireEvents.some(event => event.eventId === lastFloorEvent), 'previous world events delivered');
  const guestId = guest.sessionId;
  Object.assign(guest.reconnection, {enabled: true, minUptime: 0, minDelay: 800, maxDelay: 800});
  room.clients.find(client => client.sessionId === guestId).ref.terminate();
  await until(() => !room.seats.get(guestId)?.connected, 'guest dropped');
  command(host, 'settings', {mapId: arena});
  await until(() => host.state.worldRevision === 2 && !own(host).ready, 'host needs new world');
  assert.equal(host.state.mode, 'tdm');
  assert.equal(host.state.hostages.size, 0);
  host.send('ready', {...CONTRACT, worldRevision: 1});
  await delay(90);
  assert(!own(host).ready, 'old-world completion cannot enable this actor');
  await acknowledgeWorld(host);
  await until(() => wireEvents.some(event => event.type === 'respawn' && event.eventId > lastFloorEvent),
    'first new-world spawn clears existing client event watermark');
  await until(() => guest.state.worldRevision === 2 && own(guest)?.connected && !own(guest).ready, 'returning guest must load new world');
  assert.equal(guest.sessionId, guestId);
  await acknowledgeWorld(guest);
  command(host, 'residents', {zombies: true, danceman: true});
  command(host, 'settings', {mode: 'classic'});
  await start(host, guest);
  const running = room.sim;
  command(host, 'settings', {mapId: DEFAULT_MAP_ID});
  await delay(150);
  assert.equal(room.sim, running, 'active simulation survives map requests');
  assert.equal(room.state.worldRevision, 2);
  assert(!room.state.zombiesEnabled && !room.state.dancemanEnabled);
  assert.equal(room.state.mode, 'tdm');
  assert.notEqual(room.sim.game.world, other.sim.game.world);
  const bad = await client.joinById(host.roomId, options);
  bad.reconnection.enabled = false;
  bad.onMessage('problem', () => {});
  const rejected = new Promise(resolve => bad.onLeave(resolve));
  bad.send('ready', {...MAP_CONTRACTS[arena], collisionHash: CONTRACT.collisionHash, worldRevision: 2});
  assert.equal(await rejected, 4009, 'mismatched collision contract closes the joining socket');
  await until(() => host.state.phase === 'results', 'match finishes naturally');
  command(host, 'rematch');
  await until(() => host.state.phase === 'waiting' && guest.state.phase === 'waiting', 'same-map rematch lobby');
  assert.equal(room.sim, running);
  command(host, 'settings', {mapId: DEFAULT_MAP_ID, mode: 'classic'});
  await until(() => host.state.worldRevision === 3 && guest.state.worldRevision === 3, 'host selects Floor 5 after match');
  await acknowledgeWorld(host);
  await acknowledgeWorld(guest);
  assert.equal(host.state.mode, 'classic');
  assert.equal(host.state.doors.size, 51);
  assert.equal(other.sim.mapId, arena);
  assert.equal(second.state.worldRevision, 1);
});

test('two active rooms advance independent Floor 5 and Compact worlds', {timeout: 30_000}, async t => {
  const server=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});
  const peers=[];
  t.after(async()=>{await Promise.allSettled(peers.map(peer=>peer.leave()));await server.close();});
  const client=new Client(server.url,{headers:{Origin:server.url}});
  for(const mapId of [DEFAULT_MAP_ID,arena]){
    const peer=await ready(await client.create('private-fps',{...options,fillBots:true,mapId}));
    peers.push(peer);
    command(peer,'ready',{ready:true});
    await until(()=>own(peer).playerReady,'host ready');
    command(peer,'start');
    await until(()=>peer.state.phase==='active','match running');
  }
  const ticks=peers.map(peer=>peer.state.tick);
  await until(()=>peers.every((peer,i)=>peer.state.tick>ticks[i]+15),'both active simulations advanced');
  for(const [i,peer] of peers.entries()){
    assert.equal(peer.state.phase,'active');
    assert.equal(peer.state.actors.size,10);
    assert.equal(peer.state.doors.size,i===0?51:2);
    assert.equal(peer.state.mapId,i===0?DEFAULT_MAP_ID:arena);
  }
});
