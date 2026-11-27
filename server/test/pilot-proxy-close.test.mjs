import assert from 'node:assert/strict';
import {once} from 'node:events';
import http from 'node:http';
import https from 'node:https';
import test from 'node:test';
import {startPilotFixture} from '../../tools/network-pilot-fixture.mjs';

test('pilot fixture releases aborted HTTP, pending upgrades and active tunnels on return and restart', {timeout:10000}, async t => {
  const allSockets = new Set();
  const authorities = [];
  const fixture = await startPilotFixture({host:'127.0.0.1', startAuthority:async () => {
    const httpServer = http.createServer();
    httpServer.on('connection', socket => {
      allSockets.add(socket);
      socket.once('close', () => allSockets.delete(socket));
    });
    httpServer.listen(0, '127.0.0.1');
    await once(httpServer, 'listening');
    const closed = once(httpServer, 'close');
    const authority = {httpServer, url:'http://127.0.0.1:' + httpServer.address().port,
      close:async () => { httpServer.close(); await closed; }};
    authorities.push(authority);
    return authority;
  }});
  t.after(async () => {
    for (const socket of allSockets) socket.destroy();
    await fixture.close();
  });

  function request(upgrade = false) {
    const req = https.get(fixture.origin + '/', {rejectUnauthorized:false, agent:false,
      headers:upgrade ? {Connection:'Upgrade', Upgrade:'websocket'} : {}});
    req.on('error',()=>{});
    return req;
  }

  for (const kind of ['request', 'upgrade']) {
    const received = once(fixture.authority.httpServer, kind);
    const client = request(kind === 'upgrade');
    const [req] = await received;
    if (kind === 'upgrade') {
      // Unlike HTTPServer, this test handshake owns its detached socket.
      req.socket.once('end', () => req.socket.end());
      req.socket.resume();
    }
    const closed = once(req.socket, 'close', {signal:AbortSignal.timeout(1500)});
    client.destroy();
    await assert.doesNotReject(closed, kind + ' upstream socket closes when the client aborts');
  }

  const tunnel = once(fixture.authority.httpServer, 'upgrade');
  const client = request(true);
  const established = once(client, 'upgrade');
  const [, server] = await tunnel;
  server.once('end', () => server.end());
  server.resume();
  server.write('HTTP/1.1 101 Switching Protocols\r\nConnection: Upgrade\r\nUpgrade: websocket\r\n\r\n');
  const [, connected] = await established;
  connected.once('end', () => connected.end());
  connected.resume();
  const disconnected = once(connected, 'close', {signal:AbortSignal.timeout(1500)});
  await fixture.restart();
  await disconnected;
  assert.equal(authorities.length, 2);

  const response = once(fixture.authority.httpServer, 'request');
  const returned = new Promise((resolve,reject) => request().on('error',reject).on('response', r => {
    r.resume(); r.once('end', () => resolve(r.statusCode));
  }));
  const [, reply] = await response;
  reply.end('Ready');
  assert.equal(await returned, 200);
  const pending = once(fixture.authority.httpServer, 'request');
  const last = request();
  const clientClosed = new Promise(resolve => last.once('close', resolve));
  await pending;
  await fixture.close();
  await clientClosed;
  assert.equal(allSockets.size, 0);
});
