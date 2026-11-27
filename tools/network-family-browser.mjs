// Runs only against the generated loopback HTTPS fixture. Both touch profiles
// enter through the public-shaped link with independent browser storage.
import assert from 'node:assert/strict';
import {createHash, randomBytes} from 'node:crypto';
import {mkdir, readFile, writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium, devices, webkit} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {createTestServer} from './network-test-server.mjs';

const alias = 'JESPERS-ROOM';
const landingPath = '/room/' + alias;
const out = 'test-results/network-family';
let authorityStarts = 0;
const fixture = await startPilotFixture({
  familyRoom: true, host: '127.0.0.1', testMatch: {countdownSeconds: 1},
  startAuthority: async options => {
    const child = await createTestServer(options);
    authorityStarts++;
    return child;
  },
});
const link = fixture.origin + landingPath;
const incorrect = randomBytes(24).toString('hex');
const browsers = [], clients = [];

async function health() {
  const r = await fetch(fixture.authority.url + '/health');
  assert(r.ok, 'Local monitor is available');
  return r.json();
}

async function waitForHealth(test, label) {
  const deadline = performance.now() + 40000;
  do {
    const state = await health();
    if (test(state)) return state;
    await delay(150);
  } while (performance.now() < deadline);
  throw Error(label);
}

async function verifyEmpty() {
  await waitForHealth(s => s.rooms === 0 && s.players === 0, 'Last seat and its room are released');
  const start = performance.now();
  let samples = 0;
  do {
    const s = await health();
    assert(s.rooms === 0 && s.players === 0 && s.matches.length === 0, 'Empty family link owns no simulation');
    samples++;
    await delay(200);
  } while (performance.now() - start < 1200);
  return {samples, milliseconds: Math.round(performance.now() - start), rooms: 0, players: 0, matches: 0};
}

async function open(browser, id, preset, viewport) {
  // Keep the device UA, touch, mobile viewport and layout. One raster pixel
  // per CSS pixel makes the actual Floor 5 scene affordable on the shared Pi.
  const context = await browser.newContext({...preset, viewport, screen: viewport, deviceScaleFactor: 1, ignoreHTTPSErrors: true});
  await context.addInitScript(() => localStorage.setItem('cartridge-settings', JSON.stringify({graphics: 'low', volume: 0})));
  const page = await context.newPage();
  page.setDefaultTimeout(90000);
  const client = {id, page, context, engine: browser.browserType().name(), version: browser.version(), viewports: {},
    touch: !!preset.hasTouch, ws: {connections: 0, sent: 0, received: 0}, exceptions: [], codesInUrls: 0};
  clients.push(client);
  page.on('pageerror', e => client.exceptions.push(e.name));
  page.on('request', req => {
    if ([fixture.invite, fixture.familyPassword, incorrect].some(code => req.url().includes(code))) client.codesInUrls++;
  });
  page.on('websocket', ws => {
    const target = new URL(ws.url());
    if (target.protocol !== 'wss:' || target.host !== new URL(link).host) return;
    client.ws.connections++;
    ws.on('framesent', () => client.ws.sent++);
    ws.on('framereceived', () => client.ws.received++);
  });
  return client;
}

function press(client, locator) {
  return client.touch ? locator.tap() : locator.click();
}

async function snap(client, stage, focus) {
  await focus.scrollIntoViewIfNeeded();
  const rendered = await focus.evaluate(el => {
    const box = el.getBoundingClientRect(), width = document.documentElement.clientWidth;
    return {fits: box.width > 0 && box.left >= -1 && box.right <= width + 1, width, height: innerHeight,
      touchPoints: navigator.maxTouchPoints, touchStart: 'ontouchstart' in window, coarse: matchMedia('(pointer: coarse)').matches};
  });
  assert(rendered.fits, 'The rendered control fits across the visible viewport');
  client.touchCapabilities = {points: rendered.touchPoints, touchStart: rendered.touchStart, coarse: rendered.coarse};
  client.viewports[stage] = [rendered.width, rendered.height];
  await client.page.screenshot({path: join(out, client.id + '-' + stage + '.png')});
  console.log(client.id, stage, rendered.width + 'x' + rendered.height);
}

async function invite(client, wrongFirst = false) {
  const {page, context} = client;
  await page.goto(link, {waitUntil: 'domcontentloaded'});
  const field = page.getByLabel('Server invite code', {exact: true});
  await field.waitFor();
  assert.equal(await field.getAttribute('type'), 'password');
  assert.equal(await field.getAttribute('autocomplete'), 'off');
  assert.equal(await field.evaluate(el => el.form.method), 'post');
  const submit = page.locator('button[type=submit]');
  await snap(client, 'invite', field);
  if (wrongFirst) {
    await field.fill(incorrect);
    const [reply] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/pilot/session'), press(client, submit)]);
    assert.equal(reply.status(), 403);
    await page.getByRole('alert').waitFor();
    assert(!(await context.cookies()).some(c => c.name === '__Host-cs2_pilot'));
  }
  await field.fill(fixture.invite);
  await press(client, submit);
  console.log(client.id, 'invite submitted');
  const code = page.getByLabel('Family room password', {exact: true});
  await code.waitFor();
  console.log(client.id, 'family form visible');
  assert(await page.getByRole('dialog', {name: 'Vrid skärmen'}).isHidden(), 'Portrait sign-in is directly accessible');
  const url = new URL(page.url());
  assert.equal(url.origin + url.pathname, fixture.origin + '/fps/');
  assert.deepEqual([...url.searchParams], [['network', 'internet'], ['family', alias]]);
  const cookie = (await context.cookies()).find(c => c.name === '__Host-cs2_pilot');
  assert(cookie?.httpOnly && cookie.secure && cookie.sameSite === 'Strict');
  assert(await page.evaluate(() => isSecureContext && !matchMedia('(display-mode: standalone)').matches && !window.__fps));
  assert(await page.locator('#fatal').isHidden());
  client.renderer = await page.locator('#game').evaluate(canvas => {
    const gl = canvas.getContext('webgl2');
    if (!gl || gl.isContextLost()) throw Error('Floor 5 renderer unavailable');
    return gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL || gl.RENDERER);
  });
  assert.equal(await page.locator('#network-name').inputValue(), '');
  assert.equal(await page.locator('#network-name').getAttribute('autocomplete'), 'nickname');
  assert.equal(await code.inputValue(), '');
  assert.equal(await code.evaluate(el => el.form.method), 'post');
  assert.equal(await code.getAttribute('autocomplete'), 'current-password');
  assert.equal(await code.getAttribute('name'), 'code');
  assert.equal(await code.getAttribute('autocapitalize'), 'off');
  assert.equal(await code.getAttribute('autocorrect'), 'off');
  assert.equal(await code.getAttribute('spellcheck'), 'false');
  assert.equal(await code.getAttribute('type'), 'password');
  const reveal = page.getByLabel('Show password', {exact: true});
  await code.fill(incorrect);
  await press(client, reveal);
  assert.equal(await code.getAttribute('type'), 'text');
  await press(client, reveal);
  assert.equal(await code.getAttribute('type'), 'password');
  assert((await code.inputValue()) === incorrect, 'Changing visibility preserves the entered password');
  await code.fill('');
  assert.equal(await page.locator('form:has(#network-code) button[type=submit]:visible').count(), 1);
  assert.equal(await page.locator('#network-room:visible, #network-endpoint:visible, #network-mode:visible').count(), 0);
  await snap(client, 'family-form', code);
}

async function revisit({page}) {
  await page.goto(link, {waitUntil: 'domcontentloaded'});
  await page.locator('#network-code').waitFor();
  assert.equal(new URL(page.url()).searchParams.get('family'), alias);
  assert.equal(await page.locator('#network-code').inputValue(), '');
}

async function enter(client, name, wrongFirst = false) {
  const {page} = client;
  await page.locator('#network-name').fill(name);
  const password = page.locator('#network-code');
  const submit = page.getByRole('button', {name: 'Join family room', exact: true});
  assert.equal(await submit.getAttribute('data-create'), 'false');
  if (wrongFirst) {
    await password.fill(incorrect);
    const [reply] = await Promise.all([page.waitForResponse(r => new URL(r.url()).pathname === '/matchmake/joinOrCreate/' + alias), password.press('Enter')]);
    assert.equal(reply.status(), 403);
    await page.locator('#network-status[data-error-id=wrongFamilyPassword]').filter({hasText: /incorrect family room password/i}).waitFor();
    assert.equal((await health()).rooms, 0, 'A rejected password must leave the empty room unallocated');
    console.log(client.id, 'family password rejected with zero rooms');
  }
  await password.fill(fixture.familyPassword);
  await press(client, submit);
  await page.locator('#room-title').filter({hasText: 'Lobby'}).waitFor();
  assert(await page.getByRole('dialog', {name: 'Vrid skärmen'}).isHidden(), 'The waiting room is usable in portrait');
  assert.equal((await page.locator('#room-identity').innerText()).trim(), alias);
  await page.locator('#room-roster tr').filter({hasText: name}).waitFor();
  await snap(client, 'lobby', page.locator('#room-identity'));
}

async function share(client) {
  // Dismissing the system picker exercises the real selected-link fallback
  // without writing to the Pi operator's desktop clipboard.
  const {page} = client;
  await page.evaluate(() => Object.defineProperty(navigator, 'share', {configurable: true, value: async ({url}) => {
    document.documentElement.dataset.testSharedLink = url;
    throw new DOMException('Cancelled', 'AbortError');
  }}));
  await press(client, page.locator('#room-share'));
  const copy = page.locator('#room-link');
  await copy.waitFor();
  assert.equal(await copy.inputValue(), link);
  assert.equal(await page.locator('html').getAttribute('data-test-shared-link'), link);
  await snap(client, 'share', copy);
}

try {
  await mkdir(out, {recursive: true});
  const before = await verifyEmpty();
  const safari = await webkit.launch({headless: process.env.FPS_WEBKIT_HEADED !== '1'});
  browsers.push(safari);
  const iphone = await open(safari, 'iphone-webkit', devices['iPhone 13'], {width: 390, height: 844});
  await invite(iphone, true);
  await revisit(iphone);
  await enter(iphone, 'Familj iPhone', true);
  await share(iphone);
  const mode = iphone.page.locator('#room-mode');
  const botControls = ['#room-analysts-bots', '#room-counter-analysts-bots'];
  await mode.selectOption('classic');
  await iphone.page.locator('#room-rules').filter({hasText: 'Classic'}).waitFor();
  for (const selector of botControls) await iphone.page.locator(selector).selectOption('0');

  const angle = process.env.FPS_NETWORK_ANGLE || (process.platform === 'darwin' ? 'metal' : 'swiftshader');
  const chrome = await chromium.launch({channel: 'chromium', executablePath: process.env.CHROMIUM_PATH || undefined,
    headless: process.env.FPS_NETWORK_HEADED !== '1', args: ['--use-angle=' + angle, '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows', ...fixture.args]});
  browsers.push(chrome);
  const android = await open(chrome, 'android-chromium', devices['Pixel 7'], {width: 412, height: 915});
  await invite(android);
  await enter(android, 'Familj Android');
  for (const client of [iphone, android]) {
    await client.page.locator('#room-roster tr').filter({hasText: 'Familj iPhone'}).waitFor();
    await client.page.locator('#room-roster tr').filter({hasText: 'Familj Android'}).waitFor();
  }
  assert(await android.page.locator('#room-mode').isHidden());
  assert(await android.page.locator('#room-start').isHidden());
  const waiting = await waitForHealth(s => s.rooms === 1 && s.players === 2 && s.matches[0].phase === 'waiting', 'Both players share one waiting room');
  for (const client of [iphone, android]) {
    const {width, height} = client.page.viewportSize();
    await client.page.setViewportSize({width: height, height: width});
    await snap(client, 'waiting-landscape', client.page.locator('#room-roster'));
    await press(client, client.page.locator('#room-ready'));
  }
  await press(iphone, iphone.page.locator('#room-start'));
  for (const client of [iphone, android]) await client.page.locator('#resume').waitFor();
  const active = await waitForHealth(s => s.rooms === 1 && s.players === 2 && s.matches[0].phase === 'active' && s.matches[0].tick > 0, 'Real match began');
  const rotate = iphone.page.getByRole('dialog', {name: 'Vrid skärmen'});
  await iphone.page.setViewportSize({width: 390, height: 844});
  await rotate.waitFor();
  await snap(iphone, 'match-rotation', rotate);
  await iphone.page.setViewportSize({width: 844, height: 390});
  await rotate.waitFor({state: 'hidden'});
  for (const client of [iphone, android]) {
    await press(client, client.page.locator('#resume'));
    await client.page.locator('#pause').waitFor({state: 'hidden'});
    await client.page.locator('#hud').waitFor();
    await snap(client, 'match', client.page.locator('#game'));
    await press(client, client.page.locator('[data-mobile-action=pause]'));
  }
  for (const client of [iphone, android]) {
    await press(client, client.page.locator('#restart'));
    await client.page.locator('#network-code').waitFor();
    await client.context.close();
  }
  const departed = await verifyEmpty();

  await fixture.restart();
  assert.equal(authorityStarts, 2);
  const restarted = await verifyEmpty();
  const desktop = await open(chrome, 'desktop-chromium', {}, {width: 1280, height: 720});
  await invite(desktop);
  await enter(desktop, 'Familj desktop');
  assert.equal(await desktop.page.locator('#room-mode').inputValue(), 'classic');
  for (const selector of botControls) assert.equal(await desktop.page.locator(selector).inputValue(), '0');
  await share(desktop);
  await press(desktop, desktop.page.locator('#room-leave'));
  await desktop.page.locator('#network-code').waitFor();
  await revisit(desktop);
  const finished = await verifyEmpty();
  for (const {exceptions, ws, codesInUrls} of clients) {
    assert.deepEqual(exceptions, []);
    assert.equal(codesInUrls, 0);
    assert(ws.connections > 0 && ws.received > 0 && ws.sent > 0, 'A real two-way WSS channel reached each browser');
  }
  const result = {status: 'PASS', date: new Date().toISOString(), scope: 'loopback TLS with generated fixtures',
    buildHash: active.contract.buildHash, protocolVersion: active.contract.protocolVersion,
    manifestSha256: createHash('sha256').update(await readFile(new URL('../build-info.json', import.meta.url))).digest('hex'),
    physicalDevices: false, osPasswordManagerTested: false, sharedLink: landingPath, deviceScaleFactor: 1,
    clients: clients.map(({id, engine, version, renderer, touch, touchCapabilities, viewports, ws}) =>
      ({id, engine, version, renderer, touch, touchCapabilities, viewports, ws})),
    emptyWindows: {before, departed, restarted, finished}, waitingPlayers: waiting.players, activeTick: active.matches[0].tick,
    authorityProcesses: authorityStarts, restoredSettings: {mode: 'classic', fillBots: false},
    inviteRejection: 403, passwordRejection: 403, sameProfileRevisit: ['iphone-webkit', 'desktop-chromium']};
  await writeFile(join(out, 'result.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(JSON.stringify(result));
} catch (error) {
  // Playwright can put submitted field values or socket URLs in its call log.
  let message = error.stack || String(error);
  for (const {id, page, ws} of clients) {
    const state = await Promise.race([page.evaluate(() => ({path: location.pathname, ready: document.readyState,
      fatal: document.querySelector('#fatal')?.hidden === false ? document.querySelector('#fatal pre')?.textContent?.slice(0, 350) : false,
      room: document.querySelector('#online-room')?.hidden === false,
      familyForm: !!document.querySelector('#network-code'), paused: document.querySelector('#pause')?.hidden === false})).catch(() => null),
      delay(2500, 'unresponsive')]);
    message += '\n' + JSON.stringify({client: id, state, ws});
  }
  for (const code of [fixture.invite, fixture.familyPassword, incorrect]) if (code) message = message.replaceAll(code, '[redacted]');
  throw Error(message.replace(/([?&](?:sessionId|reconnectionToken)=)[^&\s)]+/gi, '$1[redacted]'));
} finally {
  try { await Promise.all(browsers.map(b => b.close())); } finally { await fixture.close(); }
}
