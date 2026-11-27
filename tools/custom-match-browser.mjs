// Two independently authenticated Chromium contexts and an isolated Pi-shaped
// game server. Run from the repository root: node tools/custom-match-browser.mjs
import assert from 'node:assert/strict';
import {enterTouchMatch} from './network-browser-resume.mjs';
import {mkdir, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium, devices} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';

const output = process.env.FPS_SETTINGS_OUT || 'test-results/custom-match-settings';
const floor = 'floor5-prepared', compact = 'compact-arena';
const identifiers = {
  tdmMinutes: 'tdm-minutes', tdmKills: 'tdm-kills', classicWins: 'classic-wins',
  analystsBots: 'analysts-bots', counterAnalystsBots: 'counter-analysts-bots',
};
const allowed = {
  tdmMinutes: [3, 5, 10, 15], tdmKills: [10, 25, 50, 100], classicWins: [3, 5, 8],
  analystsBots: [0, 1, 2, 3, 4, 5], counterAnalystsBots: [0, 1, 2, 3, 4, 5],
};
const report = {status: 'FAIL', buildHash: CONTRACT.buildHash, physicalMobile: false,
  transport: 'isolated HTTPS/WSS', checks: [], viewports: {}, time: new Date().toISOString()};
const browserErrors = [];
const fixture = await startPilotFixture({familyRoom: true, host: '127.0.0.1', testMatch: {countdownSeconds:5}});
const landing = new URL('/room/JESPERS-ROOM', fixture.origin).href;
const angle = process.env.FPS_NETWORK_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
let browser, desktop, mobile;

const room = () => [...fixture.authority.rooms][0];
const control = (client, field) => client.page.locator('#room-' + (identifiers[field] || field));
const press = (client, selector) => client.touch ? selector.tap() : selector.click();
const mark = (stage) => { report.checks.push(stage); console.log(stage); };
function seat(client) {
  return room() && [...room().seats.values()].find(entry => entry.name === client.name);
}
async function until(predicate, label, timeout = 30000) {
  const deadline = performance.now() + timeout;
  while (!await predicate()) {
    assert(performance.now() < deadline, label);
    await delay(60);
  }
}
async function open(name, touch = false) {
  const viewport = touch ? {width: 430, height: 932} : {width: 1200, height: 1020};
  const context = await browser.newContext({
    ...(touch ? devices['Pixel 7'] : {}), viewport, screen: viewport, deviceScaleFactor: 1,
  });
  await context.addInitScript(() => localStorage.setItem('cartridge-settings', JSON.stringify({graphics:'low', volume:0})));
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  page.on('pageerror', error => browserErrors.push(error.name));
  await page.goto(landing, {waitUntil:'domcontentloaded'});
  const client = {name, touch, viewport, page, context};
  await page.getByLabel('Server invite code', {exact:true}).fill(fixture.invite);
  await press(client, page.locator('button[type=submit]'));
  return client;
}
async function enter(client, {remembered = false} = {}) {
  await client.page.locator('#network-name').fill(client.name);
  const password = client.page.locator('#network-code');
  if (remembered) {
    await client.page.getByText('This device remembers access to this room.', {exact:false}).waitFor();
    assert(await password.isHidden());
    assert.equal(await password.inputValue(), '');
    assert.equal(await password.evaluate(input => input.required), false);
  } else {
    assert(await password.evaluate(input => input.required));
    await password.fill(fixture.familyPassword);
  }
  await press(client, client.page.locator('[data-create=false]'));
  await control(client, 'title').filter({hasText:'Lobby'}).waitFor();
  await until(() => seat(client)?.ready && seat(client)?.connected, client.name + ' loaded the server-selected map', 90000);
  assert(!new URL(client.page.url()).searchParams.has('test'), 'Use the normal rendered online entry');
  assert(await client.page.locator('#fatal').isHidden());
}
async function select(client, field, value) {
  const widget = control(client, field);
  await widget.selectOption(String(value));
  await until(() => room()?.state[field] === value, 'Authority accepted ' + field + ' = ' + value);
  await until(async () => await widget.inputValue() === String(value), 'Lobby reflects confirmed ' + field);
}
async function displayed(client, expected, editable) {
  for (const [field, value] of Object.entries(expected)) {
    const widget = control(client, field);
    await widget.waitFor();
    await until(async () => await widget.inputValue() === String(value) && await widget.isEnabled() === editable,
      client.name + ' displays ' + field + ' = ' + value + (editable ? ' editable' : ' read-only'));
    assert.deepEqual(await widget.locator('option').evaluateAll(options => options.map(option => Number(option.value))),
      allowed[field], field + ' has only the supported options');
  }
}
async function switchMap(client, id, viewers) {
  const previous = room().state.worldRevision;
  await control(client, 'map').selectOption(id);
  await until(() => room().state.worldRevision > previous && room().state.mapId === id &&
    viewers.every(viewer => seat(viewer)?.ready), 'All seats loaded ' + id, 110000);
  for (const viewer of viewers) {
    await until(async () => await control(viewer, 'map-preview').getAttribute('data-map') === id &&
      await control(viewer, 'ready').isEnabled(), viewer.name + ' renders ' + id);
  }
}
async function screenshot(client, filename, settings) {
  const {page, viewport} = client;
  assert.deepEqual(page.viewportSize(), viewport);
  assert(await page.getByRole('dialog', {name:'Rotate your screen'}).isHidden());
  for (const field of settings) {
    const widget = control(client, field);
    await widget.scrollIntoViewIfNeeded();
    const size = await widget.boundingBox();
    assert(size && size.height >= 44 && size.x >= 0 && size.x + size.width <= viewport.width + 1,
      field + ' fits and has a usable tap target');
  }
  await control(client, 'map-preview').evaluate(img => img.decode());
  // Keep the map, room title and settings group in the same image.
  await page.locator('#online-room').evaluate(el => { el.scrollTop = 0; });
  await page.screenshot({path:join(output, filename), quality:88});
  report.viewports[filename] = viewport;
}

await mkdir(output, {recursive:true});
try {
  browser = await chromium.launch({
    headless:process.env.FPS_NETWORK_HEADED !== '1',
    ...(process.env.CHROMIUM_PATH ? {executablePath:process.env.CHROMIUM_PATH} : {channel:'chromium'}),
    args:[...fixture.args, '--use-angle=' + angle, '--ignore-gpu-blocklist',
      '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
      ...(process.env.WAYLAND_DISPLAY ? ['--ozone-platform=wayland'] : [])],
  });
  report.browser = browser.version();
  desktop = await open('Elin');
  await enter(desktop);
  mobile = await open('Kim', true);
  await enter(mobile);
  const defaults = {tdmMinutes:10, tdmKills:50, analystsBots:5, counterAnalystsBots:5};
  await displayed(desktop, defaults, true);
  await displayed(mobile, defaults, false);
  assert.equal(room().state.mapId, floor);
  assert.equal(room().state.actors.size, 10);
  mark('Desktop host and touch guest see the same Floor 5 defaults');

  const custom = {tdmMinutes:3, tdmKills:25, analystsBots:1, counterAnalystsBots:3};
  for (const [field, value] of Object.entries(custom)) await select(desktop, field, value);
  await displayed(mobile, custom, false);
  const bots = team => [...room().bots.values()].filter(bot => bot.actor.team === team).length;
  assert.deepEqual([bots('analysts'), bots('counterAnalysts')], [1, 3]);
  // Simulate both callbacks before a WebSocket acknowledgment. The first widget
  // briefly displays the last confirmed value while its update is in flight.
  // The second change must preserve the first independent server value.
  await desktop.page.evaluate(() => {
    for (const field of ['zombies', 'danceman']) {
      const widget = document.getElementById('room-' + field);
      const before = widget.value;
      widget.value = 'on';
      widget.dispatchEvent(new Event('change', {bubbles:true}));
      widget.value = before;
    }
  });
  await until(() => room().state.zombiesEnabled && room().state.dancemanEnabled, 'Both rapid resident changes survive');
  await control(mobile, 'residents-status').filter({hasText:/Zombies On.*Danceman On/}).waitFor();
  mark('Asymmetric bot counts, Team Deathmatch limits and rapid independent resident changes replicate');

  await select(desktop, 'mode', 'classic');
  await displayed(desktop, {classicWins:5}, true);
  await select(desktop, 'classicWins', 8);
  const classic = {classicWins:8, analystsBots:1, counterAnalystsBots:3};
  await displayed(desktop, classic, true);
  await displayed(mobile, classic, false);
  assert(await control(desktop, 'tdmMinutes').isHidden() && await control(desktop, 'tdmKills').isHidden());
  assert.equal(room().state.scoreTarget, 8);
  await screenshot(desktop, 'desktop-floor5-classic.jpg', Object.keys(classic));
  mark('Floor 5 Classic uses the selected round limit');

  await switchMap(desktop, compact, [desktop, mobile]);
  assert.equal(room().state.mode, 'tdm');
  assert.equal(room().state.durationSeconds, 180);
  assert.equal(room().state.scoreTarget, 25);
  for (const client of [desktop, mobile]) {
    for (const field of ['classicWins', 'zombies', 'danceman']) assert(await control(client, field).isHidden());
  }
  await displayed(mobile, custom, false);
  await screenshot(mobile, 'mobile-compact-tdm.jpg', Object.keys(custom));
  mark('Compact only shows Team Deathmatch and retains its custom limits');

  // Let the guest take ownership in the normal lobby, then start through the
  // actual touch button. Both teams have actors after the old host leaves.
  await press(desktop, control(desktop, 'leave'));
  await until(() => seat(mobile)?.client.sessionId === room()?.state.ownerId && room()?.seats.size === 1, 'Guest takes ownership');
  await displayed(mobile, custom, true);
  await select(mobile, 'counterAnalystsBots', 2);
  await select(mobile, 'counterAnalystsBots', 3);
  await screenshot(mobile, 'mobile-compact-host.jpg', Object.keys(custom));
  await mobile.page.setViewportSize({width:915, height:412});
  await press(mobile, control(mobile, 'ready'));
  await press(mobile, control(mobile, 'start'));
  await until(() => room().state.phase === 'countdown', 'Touch host starts countdown');
  await mobile.page.locator('#deployment-countdown').waitFor();
  assert(await control(mobile,'tdmMinutes').isHidden());
  assert(await control(mobile,'tdmKills').isHidden());
  assert.equal(room().state.durationSeconds,180);
  assert.equal(room().state.scoreTarget,25);
  await until(() => room().state.phase === 'active', 'Selected Compact match starts');
  await enterTouchMatch(mobile.page);
  await mobile.page.locator('#hud').waitFor();
  assert(room().match.deadline - room().clock.elapsedTime > 160000, 'Real match uses the configured timer');
  // Advance the match clock only after the unmodified production timer was
  // observed. The normal time-result and rematch pathways still run.
  room().match.deadline = room().clock.elapsedTime - 1;
  await control(mobile, 'rematch').waitFor();
  assert.equal(room().state.reason, 'time');
  await displayed(mobile, {tdmMinutes:3, tdmKills:25}, false);
  await press(mobile, control(mobile, 'rematch'));
  await displayed(mobile, custom, true);
  await press(mobile, control(mobile, 'leave'));
  await until(() => fixture.authority.rooms.size === 0, 'Close the family room without losing settings');
  mark('Touch host takes over, starts the selected match and retains choices after rematch');

  await fixture.restart();
  await mobile.page.goto(landing, {waitUntil:'domcontentloaded'});
  // The authoritative session restarts. A durable room grant on the same
  // device admits this family member without either legacy credential.
  await enter(mobile, {remembered:true});
  assert.equal(await mobile.page.getByLabel('Server invite code', {exact:true}).count(), 0);
  assert.equal(room().state.mapId, compact);
  await displayed(mobile, custom, true);
  await switchMap(mobile, floor, [mobile]);
  await select(mobile, 'mode', 'classic');
  await displayed(mobile, classic, true);
  await press(mobile, control(mobile, 'leave'));
  await until(() => fixture.authority.rooms.size === 0, 'Reopened room releases its simulation');
  assert.deepEqual(browserErrors, []);
  mark('Family choices survive a server restart and both catalogued map transitions');
  report.status = 'PASS';
} catch (error) {
  report.error = String(error.stack || error).replaceAll(fixture.invite, '[invite]').replaceAll(fixture.familyPassword, '[family-password]');
} finally {
  await browser?.close();
  await fixture.close();
  await writeFile(join(output, 'report.json'), JSON.stringify(report, null, 2) + '\n');
}
console.log(JSON.stringify(report));
if (report.status !== 'PASS') process.exitCode = 1;
