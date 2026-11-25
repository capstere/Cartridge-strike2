import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdir, mkdtemp, readFile, rename, rm, stat, writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {Readable} from 'node:stream';
import test from 'node:test';
import {WebSocket} from 'ws';
import {configFromEnv} from '../access.mjs';
import {openFamilyRoom} from '../family-room.mjs';
import {createTestServer} from '../../tools/network-test-server.mjs';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
import {FAMILY_ROOM_ALIAS, FAMILY_ROOM_PATH} from '../../shared/multiplayer/family-room.mjs';
import {ROOM_TYPE, ROOM_CAPACITY} from '../../shared/multiplayer/rules.mjs';
import {delay, own, ready, until} from './helpers.mjs';

globalThis.WebSocket = WebSocket;
const {Client} = await import('@colyseus/sdk');
const origin = 'https://family.example.test';
const invite = randomBytes(32).toString('base64url');
const familyPassword = 'family_' + randomBytes(24).toString('base64url');
const wrongPassword = randomBytes(24).toString('hex');
const familyMatch = '/matchmake/joinOrCreate/' + FAMILY_ROOM_ALIAS;
const lobby = '/fps/?network=internet&family=' + FAMILY_ROOM_ALIAS;
const body = {name: 'Family player', code: familyPassword, contract: CONTRACT, team: 'auto'};
const headers = {Host: new URL(origin).host, Origin: origin, 'X-Forwarded-Proto': 'https'};
const post = data => ({method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});

function request(url, {method, headers, body} = {}) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method, headers: Object.fromEntries(new Headers(headers)), signal: AbortSignal.timeout(15000)}, res => {
      const responseHeaders = new Headers();
      for (let i = 0; i < res.rawHeaders.length; i += 2) responseHeaders.append(res.rawHeaders[i], res.rawHeaders[i + 1]);
      resolve(new Response(Readable.toWeb(res), {status: res.statusCode, headers: responseHeaders}));
    });
    req.on('error', reject);
    req.end(body);
  });
}

test('family configuration is private, durable and rejects corrupt state', async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cs2-family-settings-'));
  t.after(() => rm(dir, {recursive: true, force: true}));
  const stateDir = join(dir, 'state');
  const unavailable = join(dir, 'temporarily-unavailable');
  await mkdir(stateDir);
  const familyStateFile = join(stateDir, 'settings.json');
  const config = {familyPassword, familyStateFile};
  const env = {CS2_PUBLIC_ORIGIN: origin, CS2_PILOT_INVITE: invite, CS2_FAMILY_ROOM_PASSWORD: familyPassword, CS2_FAMILY_ROOM_STATE: familyStateFile};
  assert.equal(configFromEnv(env).familyStateFile, familyStateFile);
  for (const patch of [{CS2_PUBLIC_ORIGIN: undefined}, {CS2_FAMILY_ROOM_PASSWORD: invite},
    {CS2_FAMILY_ROOM_PASSWORD: 'weak'}, {CS2_FAMILY_ROOM_STATE: 'relative'}]) {
    assert.throws(() => configFromEnv({...env, ...patch}), /Pilot mode|Family room needs/);
  }
  const room = openFamilyRoom(config);
  assert(room.acceptsPassword(' ' + familyPassword + ' '));
  assert(!room.acceptsPassword(familyPassword.toUpperCase()));
  const proof = room.reserveOptions(body).code;
  assert(room.acceptsCode(proof) && !room.acceptsPassword(proof) && !room.acceptsCode(familyPassword));
  assert.equal(room.settings.mode, 'tdm');
  const updated = {...room.settings, mode: 'classic', botDifficulty: 'hard'};
  room.saveSettings(updated);
  const saved = await readFile(familyStateFile, 'utf8');
  assert.deepEqual(JSON.parse(saved), {version: 1, alias: FAMILY_ROOM_ALIAS, settings: updated});
  assert.equal((await stat(familyStateFile)).mode & 0o077, 0);
  assert(!saved.includes(familyPassword) && !saved.includes(proof));
  assert.deepEqual(openFamilyRoom(config).settings, updated);
  assert.throws(() => room.saveSettings({...updated, fillBots: 'invalid'}), /Invalid family room settings/);
  assert.deepEqual(room.settings, updated);
  await rename(stateDir, unavailable);
  assert.throws(() => room.saveSettings({...updated, mode: 'tdm'}), /Room settings could not be saved/);
  assert.deepEqual(room.settings, updated);
  assert.equal(await readFile(join(unavailable, 'settings.json'), 'utf8'), saved);
  await rename(unavailable, stateDir);
  await writeFile(familyStateFile, '{broken-json');
  assert.throws(() => openFamilyRoom(config).settings, /Room settings could not be loaded/);
  assert.equal(await readFile(familyStateFile, 'utf8'), '{broken-json');
});

test('stable family link, independent admission, singleton at capacity and state across process replacement', {timeout: 90000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cs2-family-authority-'));
  const options = {port: 0, publicOrigin: origin, pilotInvite: invite, familyPassword, familyStateFile: join(dir, 'settings.json'),
    testMatch: {countdownSeconds: .15}};
  let local;
  t.after(async () => { await local?.close(); await rm(dir, {recursive: true, force: true}); });
  local = await createTestServer(options);
  const send = (path, options = {}, cookie) => request(local.url + path, {...options, headers: {...headers, ...options.headers, ...(cookie && {Cookie: cookie})}});
  const login = (code, family = FAMILY_ROOM_ALIAS) => send('/pilot/session', {method: 'POST',
    headers: {'Content-Type': 'application/x-www-form-urlencoded'}, body: new URLSearchParams({invite: code, family}).toString()});
  async function signIn() {
    const response = await login(invite);
    assert.equal(response.status, 303);
    assert.equal(response.headers.get('location'), lobby);
    await response.arrayBuffer();
    const cookie = response.headers.getSetCookie()[0].split(';')[0];
    return {cookie, client: new Client(local.url, {headers: {...headers, Cookie: cookie}, fetchFn: request})};
  }
  const match = (room, kind, data = {}) => room.send('match', {kind, matchId: room.state.matchId, controlEpoch: own(room).controlEpoch, ...data});

  const initial = await send(FAMILY_ROOM_PATH);
  assert.match(await initial.text(), /name="family" value="JESPERS-ROOM"/);
  const badInvite = await login(wrongPassword);
  assert.equal(badInvite.status, 403);
  assert.match(await badInvite.text(), /name="family" value="JESPERS-ROOM"/);
  assert.equal((await send(familyMatch, post(body))).status, 401);
  const [first, second] = await Promise.all([signIn(), signIn()]);
  assert.notEqual(first.cookie, second.cookie);
  const link = await send(FAMILY_ROOM_PATH, {}, first.cookie);
  assert.equal(link.headers.get('location'), lobby);
  assert.equal((await send('/shared/multiplayer/family-room.mjs', {}, first.cookie)).status, 200);
  assert.equal((await send('/server/family-room.mjs', {}, first.cookie)).status, 404);
  assert.equal((await send(familyMatch, post({...body, code: invite}), second.cookie)).status, 403);
  assert.equal((await send(familyMatch, post({...body, contract: {...CONTRACT, buildHash: 'outdated'}}), first.cookie)).status, 409);
  assert.equal((await send('/matchmake/create/' + FAMILY_ROOM_ALIAS, post(body), first.cookie)).status, 404);
  assert.equal(local.rooms.size, 0, 'invalid admissions must never start the room');

  const [a, b] = await Promise.all([
    first.client.joinOrCreate(FAMILY_ROOM_ALIAS, {...body, mode: 'classic', fillBots: false}).then(ready),
    second.client.joinOrCreate(FAMILY_ROOM_ALIAS, {...body, name: 'Second player'}).then(ready),
  ]);
  await until(() => a.state.ownerId && a.state.ownerId === b.state.ownerId, 'first acknowledged owner replicated');
  const id = a.roomId;
  const direct = '/matchmake/joinById/' + id;
  assert.equal(b.roomId, id);
  assert.equal(a.name, FAMILY_ROOM_ALIAS);
  assert.equal(a.state.mode, 'tdm', 'joining cannot rewrite the family defaults');
  assert.equal(a.state.fillBots, true);
  assert.equal(local.rooms.size, 1);
  assert.equal((await send(direct, post(body))).status, 401);
  assert.equal((await send(direct, post({...body, code: wrongPassword}), second.cookie)).status, 403);
  const directGuest = await ready(await second.client.joinById(id, {...body, name: 'Direct guest'}));
  assert.equal(directGuest.name, FAMILY_ROOM_ALIAS);
  assert(!directGuest.connection.url.includes(familyPassword));
  await directGuest.leave();

  const [host, guest] = a.state.ownerId === a.sessionId ? [a, b] : [b, a];
  const originalSession = host.sessionId, epoch = own(host).controlEpoch;
  let reconnected = false;
  host.onReconnect(() => { reconnected = true; });
  Object.assign(host.reconnection, {enabled: true, minUptime: 0, minDelay: 150, maxDelay: 500});
  await until(() => [...local.rooms][0]?.clients.some(peer => peer.sessionId === originalSession), 'host socket visible in isolated process');
  const sdkInfo = t.mock.method(console, 'info', () => {}); // The SDK prints its transient session ID on reconnect.
  try {
    await [...local.rooms][0].clients.find(peer => peer.sessionId === originalSession).ref.terminate();
    await until(() => reconnected && own(host)?.controlEpoch > epoch, 'family host reconnects through the pilot gate');
  } finally {
    sdkInfo.mock.restore();
  }
  assert.equal(host.sessionId, originalSession);
  assert.equal(host.roomId, id);
  assert.equal(host.state.ownerId, originalSession);
  host.reconnection.enabled = false;
  await host.leave();
  await until(() => guest.state.ownerId === guest.sessionId, 'a member can host without the first player');
  match(guest, 'settings', {mode: 'classic'});
  match(guest, 'settings', {fillBots: false});
  match(guest, 'friendlyFire', {friendlyFire: true});
  match(guest, 'residents', {zombies: true, danceman: true});
  match(guest, 'botDifficulty', {botDifficulty: 'hard', serial: 1});
  await until(() => guest.state.mode === 'classic' && !guest.state.fillBots && guest.state.friendlyFire &&
    guest.state.zombiesEnabled && guest.state.dancemanEnabled && guest.state.botDifficulty === 'hard', 'host preferences persisted');
  const stored = JSON.parse(await readFile(options.familyStateFile, 'utf8')).settings;
  assert.deepEqual(stored, {mode: 'classic', fillBots: false, friendlyFire: true, botDifficulty: 'hard', zombiesEnabled: true, dancemanEnabled: true});

  const ordinary = {...body, code: 'ordinary-room-code', fillBots: false};
  const ordinaryA = await ready(await first.client.create(ROOM_TYPE, ordinary));
  const ordinaryB = await ready(await second.client.create(ROOM_TYPE, ordinary));
  await until(() => local.rooms.size === 3, 'the family slot preserves both ordinary rooms');
  assert.notEqual(ordinaryA.roomId, id);
  assert.notEqual(ordinaryA.roomId, ordinaryB.roomId);
  await Promise.all([ordinaryA.leave(), ordinaryB.leave(), guest.leave()]);
  await until(() => local.rooms.size === 0, 'all room simulations disposed');
  await delay(300);
  assert.equal(local.rooms.size, 0);

  await local.close();
  local = await createTestServer(options);
  assert.equal(local.rooms.size, 0, 'replacement starts with no simulation');
  const oldSession = await send(FAMILY_ROOM_PATH, {}, second.cookie);
  assert.match(await oldSession.text(), /name="family" value="JESPERS-ROOM"/);
  const afterRestart = await signIn();
  const returning = await ready(await afterRestart.client.joinOrCreate(FAMILY_ROOM_ALIAS, body));
  assert.notEqual(returning.roomId, id, 'the URL does not encode the retired instance ID');
  assert.equal(returning.state.phase, 'waiting');
  for (const [key, value] of Object.entries(stored)) assert.equal(returning.state[key], value);

  // Reservations consume capacity even before WebSocket join. A full family
  // listing must never make the alias open a second room.
  for (let i = 1; i < ROOM_CAPACITY; i++) {
    const response = await send(familyMatch, post(body), afterRestart.cookie);
    assert.equal(response.status, 200);
    const reservation = await response.json();
    assert.equal(reservation.roomId, returning.roomId);
    assert.deepEqual(Object.keys(reservation).sort(), ['name', 'processId', 'roomId', 'sessionId']);
  }
  const full = await send(familyMatch, post(body), afterRestart.cookie);
  assert.equal(full.status, 409);
  assert.equal(local.rooms.size, 1);
  await returning.leave();
});
