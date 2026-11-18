// Independent Colyseus clients use only the endpoints available to a player.
// Credentials and ephemeral room/session identifiers are deliberately absent from output.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';
import http from 'node:http';
import {Readable} from 'node:stream';
import {WebSocket} from '../server/node_modules/ws/wrapper.mjs';
const {CONTRACT}=await import(process.env.CS2_PILOT_CONTRACT_URL||new URL('../shared/multiplayer/build.mjs',import.meta.url).href);

// The Node ws transport supports the Cookie/Origin headers a browser normally supplies.
globalThis.WebSocket = WebSocket;
const {Client} = await import('../server/node_modules/@colyseus/sdk/build/index.mjs');

const clientCount = Number(process.env.CS2_PILOT_CLIENTS ?? 2);
let stage = 'configuration';
const deadline = setTimeout(() => {
  console.error(JSON.stringify({status:'FAIL', stage, reason:'deadline'}));
  process.exit(1);
}, clientCount===10 ? 180_000 : 75_000);
const peers = [];
async function until(predicate, label, timeout = 8000) {
  stage = label;
  const end = performance.now() + timeout;
  while (!predicate()) {
    assert(peers.every(p => !p.problem), 'room connection');
    assert(performance.now() < end, 'timeout');
    await delay(20);
  }
}
function actor(room, sessionId) {
  return [...(room.state.actors?.values() || [])].find(a => a.sessionId === sessionId);
}

try {
  assert([2,10].includes(clientCount), 'CS2_PILOT_CLIENTS must be 2 or 10');
  const origin = new URL(process.env.CS2_PILOT_URL);
  assert(origin.protocol === 'https:' && origin.href === origin.origin+'/', 'expected an HTTPS origin');
  const invite = process.env.CS2_PILOT_INVITE;
  assert(invite, 'missing pilot invite');
  const port = process.env.CS2_PILOT_LOOPBACK_PORT;
  if (port) assert(/^\d+$/.test(port) && +port >= 1 && +port <= 65535, 'invalid loopback port');
  const endpoint = port ? new URL('http://127.0.0.1:'+port) : origin;
  const headers = {Origin:origin.origin};
  if (port) Object.assign(headers, {Host:origin.host, 'X-Forwarded-Proto':'https'});
  const endpointFor = path => new URL(path, endpoint);
  // Bound each SDK HTTP call. Reject redirects before sending a cookie elsewhere.
  function request(url, options) {
    const signal = AbortSignal.timeout(15000);
    if (!port) return fetch(url, {...options, redirect:'manual', signal});
    // Node fetch overwrites Host. Only the loopback preflight must supply the tunnel Host.
    return new Promise((resolve,reject) => {
      const req = http.request(url, {method:options.method, headers:Object.fromEntries(new Headers(options.headers)), signal}, res => {
        const responseHeaders = new Headers();
        for (let i=0;i<res.rawHeaders.length;i+=2) responseHeaders.append(res.rawHeaders[i],res.rawHeaders[i+1]);
        resolve(new Response(Readable.toWeb(res), {status:res.statusCode,headers:responseHeaders}));
      });
      req.on('error',reject);
      req.end(options.body);
    });
  }
  async function login() {
    stage = 'invite login';
    const res = await request(endpointFor('/pilot/session'), {method:'POST', headers:{...headers, 'Content-Type':'application/x-www-form-urlencoded'}, body:new URLSearchParams({invite}).toString()});
    assert.equal(res.status, 303);
    await res.arrayBuffer();
    const cookie = res.headers.getSetCookie().find(value => value.startsWith('__Host-cs2_pilot='));
    assert(cookie && /;\s*Secure\b/i.test(cookie) && /;\s*HttpOnly\b/i.test(cookie));
    return new Client(endpoint.origin, {
      headers:{...headers, Cookie:cookie.split(';')[0]},
      fetchFn:request,
      urlBuilder(url) {
        assert.equal(url.host, endpoint.host);
        assert([endpoint.protocol, port ? 'ws:' : 'wss:'].includes(url.protocol));
        return url.href;
      }
    });
  }
  const options = {contract:CONTRACT, code:randomBytes(16).toString('hex'), name:'Pilot probe'};
  const admissionChecks = {};
  if (clientCount===2) {
    stage = 'unauthenticated admission';
    const denied = await request(endpointFor('/matchmake/create/private-fps'), {
      method:'POST', headers:{...headers, 'Content-Type':'application/json'}, body:JSON.stringify(options)
    });
    assert([401,403].includes(denied.status));
    await denied.arrayBuffer();
    admissionChecks.unauthenticatedStatus = denied.status;
  }
  const clientA = await login();
  const clientB = await login();
  async function join(operation) {
    const room = await operation;
    const peer = {room, shots:new Set(), problem:false};
    peers.push(peer);
    room.reconnection.enabled = false;
    room.onError(() => {peer.problem=true;});
    room.onMessage('problem', () => {peer.problem=true;});
    room.onMessage('clock-probe', token => room.send('clock-echo',token));
    room.onMessage('events', events => {
      for (const e of events) if (e.type==='shot' && e.actionId) peer.shots.add(e.actionId);
    });
    room.send('ready', CONTRACT);
    await until(() => actor(room, room.sessionId)?.ready, 'ready and replicated own actor');
    const ws = new URL(room.connection.url);
    assert.equal(ws.protocol, port ? 'ws:' : 'wss:');
    assert.equal(ws.host, endpoint.host);
    assert.equal(room.state.doors.size, 51, 'prepared Floor 5 doors');
    return peer;
  }
  stage = 'room create';
  const a = await join(clientA.create('private-fps', options));
  if (clientCount===2) {
    stage = 'wrong private room code';
    await assert.rejects(clientB.joinById(a.room.roomId, {...options, code:randomBytes(16).toString('hex')}),
      error => /incorrect private room code/i.test(error.message));
    admissionChecks.wrongRoomCodeRejected = true;
  }
  stage = 'friend joins room ID';
  const b = await join(clientB.joinById(a.room.roomId, {...options, name:'Pilot peer'}));
  const {room:first} = a, {room:second} = b;
  const checkpoints = [];
  async function verifyRoster() {
    const count = peers.length;
    const sessions = new Set(peers.map(p=>p.room.sessionId));
    assert.equal(sessions.size,count);
    await until(() => peers.every(({room}) => {
      const players = [...room.state.actors.values()];
      return room.roomId===first.roomId && players.length===count &&
        players.every(p=>p.connected && p.ready && p.alive && sessions.has(p.sessionId)) &&
        new Set(players.map(p=>p.sessionId)).size===count &&
        players.filter(p=>p.team==='analysts').length===count/2 &&
        players.filter(p=>p.team==='counterAnalysts').length===count/2;
    }), 'ready roster replicated to '+count+' peers');
    checkpoints.push({clients:count, readyOnEachSocket:count, analysts:count/2, counterAnalysts:count/2});
  }
  await verifyRoster();
  const matchCommand=(peer,kind,extra={})=>peer.room.send('match',{kind,matchId:peer.room.state.matchId,controlEpoch:actor(peer.room,peer.room.sessionId).controlEpoch,...extra});
  if(first.state.phase==='waiting'){
  matchCommand(a,'ready',{ready:true});matchCommand(b,'ready',{ready:true});
  await until(()=>[...first.state.actors.values()].every(p=>p.playerReady),'players explicitly ready');
  matchCommand(a,'start');await until(()=>peers.every(p=>p.room.state.phase==='active'),'server started match');
  for(const p of peers){const self=actor(p.room,p.room.sessionId);p.room.send('controls',{enabled:true,lifeId:self.lifeId,controlEpoch:self.controlEpoch});}
  }
  while (peers.length<clientCount) {
    // Sequentially admit normal players, with time between independent logins.
    await delay(1000);
    const client = await login();
    stage = 'friend joins for 5v5';
    await join(client.joinById(first.roomId, {...options,name:'Pilot peer '+(peers.length+1)}));
    if ([4,10].includes(peers.length)) await verifyRoster();
  }
  function playerProbe(peer, observer) {
    const {room} = peer;
    const remote = () => actor(observer.room, room.sessionId);
    const self = () => actor(room, room.sessionId);
    const {x,z,ammo,reserve} = remote();
    let fireId = 0;
    function send(fire, reloadId) {
      const input = room.input({mode:'reliable',renderDelay:100});
      if (fire) fireId++;
      Object.assign(input.data, {lifeId:self().lifeId, controlEpoch:self().controlEpoch, sampleTick:room.state.tick,
        fireId, reloadId, forward:0, strafe:fire ? 1 : 0, yaw:0, pitch:0, jump:false, crouch:false, sneak:false, fire});
      input.send();
    }
    const moved = () => Math.hypot(remote().x-x, remote().z-z);
    const sharedShots = () => [...peer.shots].filter(id => id.startsWith(self().id+':') && observer.shots.has(id)).length;
    return {
      remote, send, moved, sharedShots,
      actionObserved:() => moved()>.15 && remote().ammo<ammo && sharedShots()>0,
      reloadObserved:() => remote().ammo===ammo && remote().reserve<reserve
    };
  }
  const players = [playerProbe(a,b), playerProbe(b,a)];
  assert.notEqual(players[0].remote().team, players[1].remote().team);
  const startTick = second.state.tick;
  // Each player sends real controls and observes the other through a separate socket.
  stage = 'both peers observe remote movement and shooting';
  const end = performance.now()+5000;
  do {
    for (const player of players) player.send(true,0);
    await delay(35);
  } while (performance.now()<end && !players.every(p=>p.actionObserved()));
  assert(players.every(p=>p.actionObserved()));
  const ammoAfterFire = players.map(p=>p.remote().ammo);
  for (let i=0; i<6; i++) {
    for (const player of players) player.send(false,1);
    await delay(35);
  }
  await until(() => players.every(p=>p.reloadObserved()), 'both peers observe completed reloads');
  const metrics = {tickAdvance:second.state.tick-startTick, movementMetres:players.map(p=>+p.moved().toFixed(2)),
    ammoAfterFire, reloadAmmo:players.map(p=>p.remote().ammo), sharedShots:players.map(p=>p.sharedShots())};
  stage='consented leave and remote roster update';
  let consentedLeaves=0;
  while (peers.length) {
    const {room} = peers[0];
    await room.leave();
    assert(!room.connection.isOpen);
    peers.shift();
    consentedLeaves++;
    await until(() => peers.every(p=>p.room.state.actors.size===peers.length && !actor(p.room,room.sessionId)), stage);
  }
  console.log(JSON.stringify({status:'PASS', path:port?'loopback with tunnel headers':'HTTPS/WSS via public origin',
    clients:clientCount, map:CONTRACT.mapId, build:CONTRACT.buildHash, ...admissionChecks, checkpoints,
    gameplayPeers:players.length, ...metrics, consentedLeaves}));
} catch (error) {
  // Third-party errors can include request URLs/session tokens. Print only the failed stage and status.
  const code = typeof error.code==='number' || /^[A-Z_]{2,40}$/.test(error.code || '') ? error.code : undefined;
  const location = error.stack?.match(/network-pilot-probe\.mjs:(\d+):\d+/)?.[1];
  console.error(JSON.stringify({status:'FAIL', stage, code, probeLine:location?Number(location):undefined}));
  process.exitCode=1;
} finally {
  await Promise.allSettled(peers.filter(p=>p.room.connection.isOpen).map(p=>p.room.leave()));
  clearTimeout(deadline);
}
