// One rendered browser and one official SDK host against an isolated loopback
// room. Run with node --import ./server/register-shared.mjs from the repo root.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {CONTRACT, MAP_CONTRACTS} from '../shared/multiplayer/build.mjs';

const {Client} = createRequire(new URL('../server/package.json', import.meta.url))('@colyseus/sdk');
const floor = 'floor5-prepared', arena = 'compact-arena', code = 'map-recovery-test';
const server = await createLocalServer({port: 0, testMatch: {countdownSeconds: .1, durationSeconds: 300}});
const angle = process.env.FPS_NETWORK_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
const errors = [], checks = [];
let browser, host, heldRoute;
async function until(predicate, label, ms = 30000) {
  const end = Date.now() + ms;
  while (!await predicate()) { assert(Date.now() < end, label); await delay(30); }
}
const self = peer => [...(peer.state.actors?.values() || [])].find(a => a.sessionId === peer.sessionId);
const command = (kind, data) => host.send('match', {kind, matchId: host.state.matchId, controlEpoch: self(host).controlEpoch, ...data});
async function hostAcknowledge(mapId) {
  await until(() => host.state.mapId === mapId && self(host) && !self(host).ready, 'SDK host awaits selected map');
  host.send('ready', {...MAP_CONTRACTS[mapId], worldRevision: host.state.worldRevision});
  await until(() => self(host)?.ready, 'SDK host admitted');
}
try {
  browser = await chromium.launch({headless: process.env.FPS_NETWORK_HEADED !== '1',
    ...(process.env.CHROMIUM_PATH ? {executablePath: process.env.CHROMIUM_PATH} : {channel: 'chromium'}),
    args: ['--use-angle=' + angle, '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader',
      ...(process.env.WAYLAND_DISPLAY ? ['--ozone-platform=wayland'] : [])]});
  const client = new Client(server.url, {headers: {Origin: server.url}});
  host = await client.create('private-fps', {contract: CONTRACT, mapId: arena, mode: 'tdm', fillBots: true, name: 'SDK host', code});
  host.onMessage('events', () => {});
  host.onMessage('clock-probe', token => host.send('clock-echo', token));
  host.onMessage('notice', message => errors.push(message));
  await hostAcknowledge(arena);
  const room = [...server.rooms][0];
  const context = await browser.newContext({viewport: {width: 840, height: 475}, deviceScaleFactor: 1});
  await context.addInitScript(() => localStorage.setItem('cartridge-settings', JSON.stringify({graphics: 'low', volume: 0})));
  const page = await context.newPage();
  page.setDefaultTimeout(120000);
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(server.url + '/fps/?network=local&test&realtime', {waitUntil: 'domcontentloaded'});
  await page.locator('#network-code').fill(code);
  await page.locator('#network-room').fill(host.roomId);
  await page.locator('#network-name').fill('Rendered guest');

  // The first GET fails after matchmaking but before any simulated player or
  // renderer is admitted. The unchanged page must offer the same form again.
  const join = page.locator('[data-create="false"]');
  await page.route('**/levels/compact-arena.json', route => route.fulfill({status: 503, body: 'fixture unavailable'}), {times: 1});
  await join.click();
  await page.locator('#network-status').filter({hasText: /Kunde inte ladda/i}).waitFor();
  await until(() => room.seats.size === 1 && room.clients.length === 1, 'failed load released its reserved seat');
  assert(await join.isEnabled() && await page.locator('#fatal').isHidden());
  assert(await page.evaluate(() => !__fps.network && !__fps.world && !__fps.renderer));
  checks.push('failed load released reservation and restored form');
  await join.click();

  async function rendered(mapId, phase) {
    const authority = {mapId, phase, projectId: room.sim.game.world.project.projectId,
      doors: room.state.doors.size, revision: room.state.worldRevision};
    assert.equal(room.state.mapId, mapId);
    assert.equal(room.state.phase, phase);
    await page.waitForFunction(expected => {
      const f = window.__fps, n = f?.network, state = n?.room?.state;
      if (!n || n.closed || n.connectionState !== 'connected' || state?.mapId !== expected.mapId ||
          n.worldRevision !== expected.revision || state.worldRevision !== expected.revision || state.phase !== expected.phase) return false;
      const self = state.actors.get(n.localPlayerId);
      return self?.ready && self.connected && f.game === n.view && f.renderer?.stats.drawCalls > 0 &&
        n.world === f.world && f.renderer.world.data === f.world.data && f.renderer.world.doors === f.world.doors && f.world.project.projectId === expected.projectId &&
        f.world.doors.doors.length === expected.doors && document.querySelector('#fatal').hidden;
    }, authority);
    const sid = await page.evaluate(() => __fps.network.room.sessionId);
    assert(room.seats.get(sid)?.connected && room.seats.get(sid)?.ready);
    return sid;
  }

  const guestId = await rendered(arena, 'waiting');
  checks.push('retry on unchanged page rendered Compact Arena');
  const guest = () => room.seats.get(guestId);
  const socket = () => room.clients.find(peer => peer.sessionId === guestId);
  const initialEpoch = guest().epoch;

  // Stall the real map GET while the host changes maps. Drop the transport,
  // observe reconnection before the HTTP response, then release the real bytes.
  await page.route('**/levels/floor5-prepared.json', route => { heldRoute = route; }, {times: 1});
  command('settings', {mapId: floor});
  await hostAcknowledge(floor);
  await until(() => !!heldRoute, 'guest is loading the newly selected floor');
  assert(!guest().ready && !guest().actor);
  socket().ref.terminate();
  await until(() => !guest().connected, 'server reserves the unready guest during reconnection');
  await until(() => guest().connected && guest().epoch > initialEpoch + 1, 'reconnected while map response was held');
  assert(!guest().ready && !guest().actor);
  await heldRoute.continue(); heldRoute = null;
  assert.equal(await rendered(floor, 'waiting'), guestId);
  checks.push('reconnected during held map download, admitted after verified response');

  // Keep the browser genuinely offline across the map commit and countdown.
  // The host and bots can start while the disconnected guest retains its seat.
  await context.setOffline(true);
  socket()?.ref.terminate();
  await until(() => !guest().connected, 'browser is offline');
  command('settings', {mapId: arena});
  await hostAcknowledge(arena);
  command('ready', {ready: true});
  await until(() => self(host).playerReady, 'remaining host ready');
  command('start');
  await until(() => room.state.phase === 'active', 'host started the selected arena with bots while guest was absent');
  assert(!guest().connected && !guest().ready && room.bots.size > 0);
  await context.setOffline(false);
  assert.equal(await rendered(arena, 'active'), guestId);
  assert.equal(room.state.worldRevision, 3);
  assert.equal(room.clients.length, 2);
  assert.deepEqual(errors, []);
  checks.push('same guest returned to running Compact match after missing lobby selection');
  console.log(JSON.stringify({status: 'PASS', checks, browser: browser.version(), angle,
    mapId: room.state.mapId, worldRevision: room.state.worldRevision, phase: room.state.phase,
    actors: room.state.actors.size, buildHash: CONTRACT.buildHash, physicalMobile: false}));
} finally {
  await heldRoute?.abort().catch(() => {});
  await browser?.close();
  await host?.leave();
  await server.close();
}
