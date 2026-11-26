import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {acknowledgeWorld, options, own, ready, until} from './helpers.mjs';

const floor = 'floor5-prepared';
const compact = 'compact-arena';
const defaults = {tdmMinutes: 10, tdmKills: 50, classicWins: 5, analystsBots: 0, counterAnalystsBots: 0};
const command = (peer, kind, extra = {}) => peer.send('match', {
  kind, matchId: peer.state.matchId, controlEpoch: own(peer).controlEpoch, ...extra,
});
const selections = state => Object.fromEntries(Object.keys(defaults).map(key => [key, state[key]]));
const botCounts = state => ['analysts', 'counterAnalysts'].map(team =>
  [...state.actors.values()].filter(actor => actor.bot && actor.team === team).length);
const botTargets = (room, expected) => botCounts(room.state).every((count, i) => count === expected[i]);

async function setup(t, mapId, match = {}) {
  const server = await createLocalServer({port: 0, testMatch: {countdownSeconds: 1.2, ...match}});
  const peers = [];
  t.after(async () => {
    await Promise.allSettled(peers.reverse().map(peer => peer.leave()));
    await server.close();
  });
  const client = new Client(server.url, {headers: {Origin: server.url}});
  async function admit(pending) {
    const peer = await ready(await pending);
    peer.onMessage('notice', () => {});
    peers.push(peer);
    return peer;
  }
  const host = await admit(client.create('private-fps', {...options, mapId, team: 'analysts'}));
  const guest = await admit(client.joinById(host.roomId, {...options, team: 'counterAnalysts'}));
  return {
    client, host, guest, room: [...server.rooms][0],
    join: (team, name) => admit(client.joinById(host.roomId, {...options, team, name})),
  };
}

async function start(host, guest) {
  for (const peer of [host, guest]) command(peer, 'ready', {ready: true});
  await until(() => own(host).playerReady && own(guest).playerReady, 'both players ready');
  command(host, 'start');
}

async function rematch(host, guest) {
  const old = host.state.matchId;
  command(guest, 'rematch');
  await until(() => [host, guest].every(peer =>
    peer.state.phase === 'waiting' && peer.state.matchId === old + 1), 'rematch reopened the same room');
}

test('ordinary rooms validate settings and lock them in countdown, gameplay and results', {timeout: 45_000}, async t => {
  const {host, guest, room} = await setup(t, floor);
  for (const peer of [host, guest]) {
    assert.deepEqual(selections(peer.state), defaults);
    assert.equal(peer.state.durationSeconds, 600);
    assert.equal(peer.state.scoreTarget, 50);
  }

  // The host can use every supported match limit in an ordinary room.
  for (const [tdmMinutes, tdmKills, classicWins] of [[3, 10, 3], [5, 25, 8], [10, 50, 5], [15, 100, 8]]) {
    const expected = {...defaults, tdmMinutes, tdmKills, classicWins};
    command(host, 'settings', {tdmMinutes, tdmKills, classicWins});
    await until(() => [host, guest].every(peer => peer.state.tdmMinutes === tdmMinutes &&
      peer.state.tdmKills === tdmKills && peer.state.classicWins === classicWins), 'both peers received the update');
    assert.deepEqual(selections(guest.state), expected);
    assert.equal(guest.state.durationSeconds, tdmMinutes * 60);
    assert.equal(guest.state.scoreTarget, tdmKills);
  }
  const valid = selections(host.state);
  for (const patch of [{tdmMinutes: 4}, {tdmMinutes: '3'}, {tdmKills: 0}, {tdmKills: 100.5},
    {classicWins: null}, {classicWins: 4}, {analystsBots: -1}, {counterAnalystsBots: 6},
    {analystsBots: true}, {tdmMinutes: 3, tdmKills: 99}, {tdmKills: 10, countdownSeconds: 0}]) {
    command(host, 'settings', patch);
  }
  command(host, 'residents', {zombies: true});
  command(host, 'residents', {danceman: true});
  command(guest, 'settings', {tdmKills: 10, analystsBots: 3});
  command(guest, 'residents', {danceman: false});
  command(guest, 'ready', {ready: true});
  await until(() => own(guest).playerReady && guest.state.zombiesEnabled &&
    guest.state.dancemanEnabled, 'ordered commands applied on both sockets');
  assert.deepEqual(selections(guest.state), valid, 'invalid and guest edits cannot update any selection');
  // Both callers can send incremental resident toggles before either patch
  // returns. Neither field should overwrite the other with an old value.
  command(host, 'residents', {zombies: false});
  command(host, 'residents', {danceman: false});
  await until(() => !guest.state.zombiesEnabled && !guest.state.dancemanEnabled, 'both independent toggles took effect');

  await start(host, guest);
  await until(() => host.state.phase === 'countdown', 'settings locked as soon as host started');
  command(host, 'settings', {tdmMinutes: 3, tdmKills: 10, analystsBots: 5});
  await until(() => guest.state.phase === 'active', 'Floor 5 TDM started');
  assert.deepEqual(selections(guest.state), valid);
  assert(guest.state.remainingSeconds > 895 && guest.state.remainingSeconds <= 900);
  command(host, 'settings', {mode: 'classic', tdmMinutes: 3, classicWins: 3});
  command(host, 'residents', {zombies: true});
  const tick = room.state.tick;
  await until(() => room.state.tick >= tick + 15, 'authority processed live commands');
  assert.equal(room.state.mode, 'tdm');
  assert.equal(room.state.zombiesEnabled, false);
  assert.deepEqual(selections(room.state), valid);
  // Advance just the trusted server clock to the configured expiry. Keep real
  // timers, policy, match transitions and network result replication in use.
  room.sim.game.state.score.analysts = 4;
  room.clock.elapsedTime = room.match.deadline + 1;
  await until(() => host.state.phase === 'results' && guest.state.phase === 'results', 'selected duration expires');
  assert.equal(host.state.results, guest.state.results);
  assert.equal(guest.state.winner, 'analysts');
  assert.equal(guest.state.reason, 'time');
  command(host, 'settings', {tdmMinutes: 3, tdmKills: 10});
  await rematch(host, guest);
  assert.deepEqual(selections(guest.state), valid);
  assert.equal(guest.state.remainingSeconds, 900);
  assert.equal(guest.state.scoreTarget, 100);
});

test('Compact keeps win limits and each team quota through active joins, reconnect, rematch and ownership transfer', {timeout: 50_000}, async t => {
  const {client, host, guest, room, join} = await setup(t, floor, {countdownSeconds: .1});
  const expected = {tdmMinutes: 3, tdmKills: 10, classicWins: 8, analystsBots: 2, counterAnalystsBots: 3};
  command(host, 'settings', {mode: 'classic', ...expected});
  await until(() => guest.state.mode === 'classic' && guest.state.scoreTarget === 8, 'Classic preferences accepted');
  command(host, 'settings', {mapId: compact});
  await until(() => [host, guest].every(peer => peer.state.mapId === compact && !own(peer)?.ready), 'both peers need the new map');
  await Promise.all([acknowledgeWorld(host), acknowledgeWorld(guest)]);
  assert.equal(guest.state.mode, 'tdm');
  assert.equal(guest.state.scoreTarget, 10);
  assert.deepEqual(selections(guest.state), expected);
  assert.deepEqual(botCounts(guest.state), [2, 3]);
  command(host, 'settings', {mode: 'classic'});
  command(host, 'residents', {zombies: true});
  await start(host, guest);
  await until(() => guest.state.phase === 'active', 'Compact TDM started');
  assert.equal(guest.state.mode, 'tdm');
  assert.equal(guest.state.zombiesEnabled, false);
  assert(guest.state.remainingSeconds > 175 && guest.state.remainingSeconds <= 180);

  // Movement and slot filling remain live. Keep AI damage from changing
  // the final-score setup while this test fills and vacates the roster.
  room.sim.game.config.botFire = false;
  const team = await Promise.all([join('analysts', 'Ana 2'), join('analysts', 'Ana 3')]);
  await until(() => botTargets(guest, [2, 3]), 'three humans still fit with two Analysts bots');
  team.push(await join('analysts', 'Ana 4'));
  await until(() => botTargets(guest, [1, 3]), 'fourth human takes one bot place');
  team.push(await join('analysts', 'Ana 5'));
  await until(() => botTargets(guest, [0, 3]), 'fifth human takes the final place');
  await assert.rejects(client.joinById(host.roomId, {...options, team: 'analysts'}), /team is full/i);

  const reconnecting = team[0];
  const epoch = own(reconnecting).controlEpoch;
  const actorId = own(reconnecting).id;
  Object.assign(reconnecting.reconnection, {enabled: true, minUptime: 0, minDelay: 700, maxDelay: 800});
  const quiet = t.mock.method(console, 'info', () => {});
  try {
    room.seats.get(reconnecting.sessionId).client.ref.terminate();
    await until(() => room.seats.get(reconnecting.sessionId)?.connected === false, 'human disconnected');
    assert.deepEqual(botCounts(room.state), [0, 3], 'the reserved seat does not allow a bot to enter');
    await until(() => own(reconnecting)?.controlEpoch > epoch, 'human returned to the reserved seat');
  } finally {
    quiet.mock.restore();
  }
  assert.equal(own(reconnecting).id, actorId);
  assert.deepEqual(selections(reconnecting.state), expected);
  reconnecting.reconnection.enabled = false;
  await reconnecting.leave();
  await until(() => botTargets(guest, [1, 3]), 'vacated human seat filled during TDM');
  await Promise.all(team.slice(1).map(peer => peer.leave()));
  await until(() => botTargets(guest, [2, 3]), 'two team quotas restored with more free slots');

  const game = room.sim.game;
  game.state.score.analysts = 9;
  const attacker = room.seats.get(host.sessionId).actor;
  const target = room.seats.get(guest.sessionId).actor;
  target.spawnProtectedUntil = 0;
  assert(game.damage(target, 400, attacker), 'an actual enemy kill raises the score');
  await until(() => host.state.phase === 'results' && guest.state.phase === 'results', 'tenth kill wins');
  const result = JSON.parse(guest.state.results);
  assert.equal(guest.state.results, host.state.results);
  assert.equal(result.reason, 'score');
  assert.equal(result.winner, 'analysts');
  assert.equal(result.score.analysts, 10);
  await rematch(host, guest);
  assert.deepEqual(selections(guest.state), expected);
  assert.deepEqual(botCounts(guest.state), [2, 3]);
  await host.leave();
  await until(() => guest.state.ownerId === guest.sessionId, 'guest inherits host authority');
  command(guest, 'settings', {counterAnalystsBots: 0});
  await until(() => guest.state.counterAnalystsBots === 0 && botTargets(guest, [2, 0]), 'new host can remove just one team’s bots');
});

test('Floor 5 Classic honors the round target and seats humans at a round boundary', {timeout: 45_000}, async t => {
  const {host, guest, room, join} = await setup(t, floor, {countdownSeconds: .1});
  command(host, 'settings', {mode: 'classic', classicWins: 3, analystsBots: 5, counterAnalystsBots: 1});
  await until(() => guest.state.mode === 'classic' && guest.state.scoreTarget === 3 && botTargets(guest, [4, 1]), 'Classic round limit and asymmetric quotas');
  const game = room.sim.game;
  assert.equal(game.config.matchWins, 3);
  assert.equal(guest.state.durationSeconds, 120, 'Classic retains the duration of a single round');
  game.config.resultTime = .15;
  await start(host, guest);
  await until(() => guest.state.phase === 'active' && guest.state.round === 1, 'Classic starts round one');
  const late = await join('analysts', 'Next round');
  assert(own(late).pending && !own(late).alive);
  assert.deepEqual(botCounts(late.state), [4, 1], 'the live round keeps the bot until the next boundary');
  for (let won = 1; won <= 3; won++) {
    await until(() => guest.state.round === won && guest.state.roundPhase === 'buy', 'the new buy phase replicated');
    if (won === 2) {
      assert(own(late).alive && !own(late).pending);
      assert.deepEqual(botCounts(late.state), [3, 1], 'human replaced the bot at the boundary');
      assert.equal(game.actors.filter(actor => actor.team === 'analysts').length, 5);
    }
    game.state.buyDeadline = game.state.time;
    await until(() => game.phase === 'active', 'the server ended buying');
    game.state.deadline = game.state.time;
    if (won < 3) {
      await until(() => guest.state.round === won + 1, 'the engine resolved the round and continued');
      assert.equal(guest.state.phase, 'active');
      assert.equal(guest.state.analysts, won);
    }
  }
  await until(() => [host, guest, late].every(peer => peer.state.phase === 'results'), 'third round win ends the match');
  assert.equal(host.state.results, late.state.results);
  const result = JSON.parse(late.state.results);
  assert.equal(result.reason, 'rounds');
  assert.equal(result.winner, 'analysts');
  assert.deepEqual(result.score, {analysts: 3, counterAnalysts: 0});
  await rematch(host, guest);
  assert.equal(guest.state.scoreTarget, 3);
  assert.equal(guest.state.analysts, 0);
  assert.deepEqual(botCounts(guest.state), [3, 1]);
});
