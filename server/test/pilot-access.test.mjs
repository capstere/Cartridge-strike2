import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {randomBytes} from 'node:crypto';
import {mkdtemp, writeFile, rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WebSocket} from 'ws';
import {configFromEnv, admissionLimiter} from '../access.mjs';
import {createLocalServer} from '../local-server.mjs';
import {options} from './helpers.mjs';

const origin = 'https://pilot.example.test';
const forwarded = {Host: new URL(origin).host, 'X-Forwarded-Proto': 'https'};
const invite = randomBytes(32).toString('base64url');

function request(url, method, headers, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(url, {method, headers}, res => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => resolve({status: res.statusCode, headers: res.headers, body: Buffer.concat(chunks).toString()}));
    });
    req.on('error', reject);
    req.end(body);
  });
}

function upgradeStatus(url, headers) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(url.replace('http:', 'ws:') + '/process/room?sessionId=player', {headers});
    ws.on('unexpected-response', (_req, res) => { res.resume(); ws.terminate(); resolve(res.statusCode); });
    ws.on('error', () => {});
    ws.once('open', () => { ws.close(); reject(Error('Unexpected upgrade')); });
  });
}

test('a throttled peer cannot spend the remaining shared admission budget', () => {
  const limiter = admissionLimiter({now: () => 0});
  for (let i=0;i<30;i++) assert(limiter.allow('first'));
  for (let i=0;i<60;i++) assert.equal(limiter.allow('first'),false);
  for (let i=0;i<30;i++) assert(limiter.allow('second'));
  assert.equal(limiter.allow('third'),false);
});

test('pilot configuration requires a loopback server, HTTPS origin and generated invite', () => {
  const env = {CS2_PUBLIC_ORIGIN: origin, CS2_PILOT_INVITE: invite};
  assert.equal(configFromEnv(env).host, '127.0.0.1');
  for (const overrides of [
    {CS2_LAN: '1', CS2_LAN_HOST: '192.168.1.1'}, {CS2_LAN_HOST: '0.0.0.0'},
    {CS2_PUBLIC_ORIGIN: 'http://pilot.example.test'}, {CS2_PUBLIC_ORIGIN: origin + '/anything'},
    {CS2_PUBLIC_ORIGIN_FILE: '/run/test'}, {CS2_PILOT_INVITE: ''}, {CS2_PILOT_INVITE: undefined},
    {CS2_PUBLIC_ORIGIN: undefined}, {CS2_PUBLIC_ORIGIN: undefined, CS2_PUBLIC_ORIGIN_FILE: 'relative'},
  ]) assert.throws(() => configFromEnv({...env, ...overrides}));
});

test('pilot login, protected assets, room admission and upgrades follow the active HTTPS origin', {timeout:20000}, async t => {
  const dir = await mkdtemp(join(tmpdir(), 'cs2-pilot-test-'));
  const file = join(dir, 'origin');
  t.after(() => rm(dir, {recursive:true, force:true}));
  const local = await createLocalServer({port:0, publicOriginFile:file, pilotInvite:invite});
  t.after(() => local.close());
  const get = (path, headers=forwarded) => request(local.url + path, 'GET', headers);
  const form = {...forwarded, Origin:origin, 'Content-Type':'application/x-www-form-urlencoded'};
  const login = (value, h=form) => request(local.url + '/pilot/session', 'POST', h, new URLSearchParams({invite:value}).toString());
  const matchmaking = (path, headers, data=options) => request(local.url + '/matchmake/' + path, 'POST',
    {...headers, 'Content-Type':'application/json'}, JSON.stringify(data));

  assert.equal((await get('/')).status,503);
  assert.equal((await get('/health', {})).status,200);
  await writeFile(file, origin);
  const entry = await get('/fps/');
  assert.equal(entry.status,200);
  assert.match(entry.body,/name="invite"/);
  assert.equal((await get('/', {...forwarded, Host:'unknown.example.test'})).status,403);
  assert.equal((await get('/', {...forwarded, 'X-Forwarded-Proto':'http'})).status,403);

  const asset = '/src/fps/app.mjs';
  assert.equal((await get(asset)).status,401);
  assert.equal((await matchmaking('create/private-fps',{...forwarded,Origin:origin})).status,401);
  assert.equal(await upgradeStatus(local.url,{...forwarded,Origin:origin}),401);
  assert.equal((await login(invite,{...form, Origin:'https://other.example.test'})).status,403);
  assert.equal((await login('incorrect')).status,403);
  assert.equal(local.rooms.size,0);
  const accepted = await login(invite);
  assert.equal(accepted.status,303);
  assert.equal(accepted.headers.location,'/fps/?network=internet');
  const [cookie] = accepted.headers['set-cookie'];
  for (const value of ['__Host-cs2_pilot=', 'Secure', 'HttpOnly', 'SameSite=Strict', 'Path=/']) assert(cookie.includes(value));
  const authorized = {...forwarded, Origin:origin, Cookie:cookie.split(';')[0]};
  assert.equal((await get('/',authorized)).status,303);
  const script = await get(asset,authorized);
  assert.equal(script.status,200);
  assert.match(script.headers['cache-control'],/private, no-store/);
  assert.equal((await get('/health',authorized)).status,404);
  assert.equal((await get('/__healthcheck',authorized)).status,404);
  assert.equal((await get('/server/package.json',authorized)).status,404);
  assert.equal(await upgradeStatus(local.url,{...authorized,Origin:'https://other.example.test'}),403);

  const reservation = await matchmaking('create/private-fps',authorized);
  assert.equal(reservation.status,200);
  const roomId = JSON.parse(reservation.body).roomId;
  const denied = await matchmaking('joinById/'+roomId,authorized,{...options,code:'incorrect'});
  assert.equal(denied.status,403);
  assert.equal(local.rooms.size,1);
  await writeFile(file,'https://replacement.example.test');
  assert.equal((await get(asset,authorized)).status,403);
  assert.equal((await get(asset,{...authorized, Host:'replacement.example.test',Origin:'https://replacement.example.test'})).status,401);
  await rm(file);
  assert.equal((await get('/',authorized)).status,503);
});
