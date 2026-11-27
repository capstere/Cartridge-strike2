import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import http from 'node:http';
import {mkdtemp,rm,stat} from 'node:fs/promises';
import {DatabaseSync} from 'node:sqlite';
import {copyAccountDatabase} from '../account-backup.mjs';
import {resultJournalPath} from '../result-journal.mjs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createLocalServer} from '../local-server.mjs';
import {WebSocket} from 'ws';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
import {FAMILY_ROOM_ALIAS} from '../../shared/multiplayer/family-room.mjs';
import {options,own,ready,until} from './helpers.mjs';
import {respawnActor} from '../../src/fps/action-rules.mjs';
globalThis.WebSocket=WebSocket;
const {Client}=await import('@colyseus/sdk');

const origin='https://accounts.example.test';
function browser(url,address) {
  const jar=new Map();
  const headers=()=>({...address&&{'CF-Connecting-IP':address},Host:new URL(origin).host,Origin:origin,'X-Forwarded-Proto':'https',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')});
  const send=(path,body,extras={})=>new Promise((resolve,reject)=>{
    const req=http.request(url+path,{method:body===undefined?'GET':'POST',
      headers:{...headers(),...(body!==undefined&&{'Content-Type':'application/json'}),...extras}},res=>{
      for(const entry of res.headers['set-cookie']||[]){
        const [name,value]=entry.split(';')[0].split('=');
        if(value)jar.set(name,value);else jar.delete(name);
        assert.match(entry,/HttpOnly/);assert.match(entry,/Secure/);assert.match(entry,/SameSite=Strict/);
      }
      const chunks=[];res.on('data',chunk=>chunks.push(chunk));res.on('end',()=>{
        const raw=Buffer.concat(chunks).toString();
        resolve({status:res.statusCode,headers:res.headers,raw,json:()=>JSON.parse(raw)});
      });
    });
    req.on('error',reject);req.end(body instanceof URLSearchParams?body.toString():body===undefined?undefined:JSON.stringify(body));
  });
  return {send,jar,headers};
}
test('real HTTPS-origin account lifecycle survives process replacement and separates room access',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-account-'));
  const opts={port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),accountDb:join(dir,'accounts.sqlite')};
  let server=await createLocalServer(opts);
  t.after(async()=>{await server?.close();await rm(dir,{recursive:true,force:true});});
  let b=browser(server.url);
  const password=randomBytes(24).toString('hex'),secondPassword=randomBytes(24).toString('hex');
  const user={username:'player_one',displayName:'Player One',password};
  assert.deepEqual((await b.send('/api/account')).json().features,{publicMatches:false});
  assert.equal((await b.send('/api/account')).json().user,null);
  assert.equal((await b.send('/api/room/public-join',{room:'example'})).status,404);
  assert.equal((await b.send('/api/room/publish',{room:'example',enabled:true})).status,404);
  const registered=await b.send('/api/account/register',user);
  assert.equal(registered.status,200);const code=registered.json().recoveryCode;
  assert.equal(code.length,27);assert.equal(registered.json().user.username,user.username);
  assert.equal((await b.send('/shared/multiplayer/rules.mjs')).status,401);
  assert.equal((await b.send('/api/account/profile',{displayName:'New Player'})).json().user.displayName,'New Player');
  assert.equal((await b.send('/api/account/logout',{})).json().user,null);
  assert.equal((await b.send('/api/account/export')).status,401);
  await server.close();server=await createLocalServer(opts);b=browser(server.url);
  assert.equal((await b.send('/api/account/login',{username:user.username,password})).status,200);
  const oldSession=browser(server.url);
  for(const [name,value] of b.jar)oldSession.jar.set(name,value);
  const recovered=await b.send('/api/account/recover',{username:user.username,recoveryCode:code,newPassword:secondPassword});
  assert.equal(recovered.status,200);assert.notEqual(recovered.json().recoveryCode,code);
  assert.equal((await oldSession.send('/api/account')).json().user,null);
  assert.equal((await b.send('/api/account/recover',{username:user.username,recoveryCode:code,newPassword:password})).status,403);
  const exported=await b.send('/api/account/export');
  assert.equal(exported.json().user.displayName,'New Player');
  assert(!/password|recoveryCode|user_id|token/.test(exported.raw));
  assert.equal((await b.send('/api/account/delete',{password:secondPassword})).json().user,null);
  assert.equal((await b.send('/api/rooms/public')).status,404);
});

test('two live private-room clients use old and new admission with isolated host rights and durable match results',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-room-'));
  const opts={port:0,publicOrigin:origin,pilotInvite:randomBytes(24).toString('hex'),familyPassword:randomBytes(24).toString('hex'),
    familyStateFile:join(dir,'settings.json'),publicListing:true,testMatch:{durationSeconds:.12,countdownSeconds:.1}};
  const local=await createLocalServer(opts);
  const sockets=[];
  t.after(async()=>{for(const socket of sockets)if(socket.connection.isOpen)await socket.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  const host=browser(local.url),guest=browser(local.url),other=browser(local.url);
  const login=await host.send('/pilot/session',new URLSearchParams({invite:opts.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  assert.equal(login.status,303);
  const route='/matchmake/joinOrCreate/'+FAMILY_ROOM_ALIAS;
  async function connect(b,route,opts) {
    const reservation=await b.send(route,opts);
    assert.equal(reservation.status,200);
    const sdk=new Client(local.url,{headers:b.headers()});
    const socket=await sdk.consumeSeatReservation(reservation.json());
    sockets.push(socket);return ready(socket);
  }
  const account=await host.send('/api/account/register',{username:'room_host',displayName:'Host',password:randomBytes(24).toString('hex')});
  assert.equal(account.status,200);
  const a=await connect(host,route,{...options,code:opts.familyPassword});
  await until(()=>a.state.ownerId===a.sessionId,'server assigned host');
  const invite=await host.send('/api/room/invites',{room:a.roomId});
  assert.equal(invite.status,200);assert.equal(invite.json().room,FAMILY_ROOM_ALIAS);
  assert.equal((await guest.send('/api/rooms/public')).status,401);
  assert.deepEqual((await host.send('/api/rooms/public')).json().rooms,[]);
  assert.equal((await other.send(route,{...options,code:''})).status,401);
  const exchanged=await guest.send('/api/room/exchange',{code:invite.json().shortCode});
  assert.equal(exchanged.status,200);assert.equal(exchanged.json().destination,'/fps/?network=internet&family='+FAMILY_ROOM_ALIAS);
  assert.equal((await other.send('/api/room/exchange',{code:invite.json().token})).status,403);
  const b=await connect(guest,route,{...options,code:''});
  assert.equal(b.roomId,a.roomId);
  assert.equal((await guest.send('/api/room/invites',{room:a.roomId})).status,403);
  assert.equal((await guest.send('/matchmake/create/private-fps',options)).status,403);
  assert.equal((await guest.send('/api/account/logout',{})).json().rooms[0],FAMILY_ROOM_ALIAS);
  const match=(room,kind,more={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...more});
  match(a,'ready',{ready:true});match(b,'ready',{ready:true});
  await until(()=>own(a).playerReady&&own(b).playerReady,'two real players ready');
  match(a,'start');await until(()=>a.state.phase==='results','time-limited server match completed');
  assert.equal((await host.send('/api/account')).json().stats.matches,1);
  const issuedAgain=await host.send('/api/room/invites',{room:a.roomId});
  assert.equal(issuedAgain.status,200);
  assert.deepEqual((await guest.send('/api/account')).json().rooms,[FAMILY_ROOM_ALIAS]);
  assert.equal((await host.send('/api/room/revoke',{room:a.roomId})).status,200);
  assert.equal((await guest.send('/api/account')).json().rooms.length,0);
  assert.equal((await guest.send('/api/room/exchange',{code:issuedAgain.json().token})).status,403);
  assert.deepEqual((await host.send('/api/account')).json().rooms,[FAMILY_ROOM_ALIAS]);
});

test('private room codes, passwordless return and scoped link admission share normal Colyseus create and join routes',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-private-'));
  const local=await createLocalServer({port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),accountDb:join(dir,'accounts.sqlite')});
  const sockets=[];
  t.after(async()=>{for(const socket of sockets)if(socket.connection.isOpen)await socket.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  const host=browser(local.url),guest=browser(local.url);
  await host.send('/pilot/session',new URLSearchParams({invite:local.config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  async function reserve(browser,path,body){
    const reply=await browser.send(path,body);
    assert.equal(reply.status,200);const client=new Client(local.url,{headers:browser.headers()});
    const room=await client.consumeSeatReservation(reply.json());sockets.push(room);return ready(room);
  }
  const match=await reserve(host,'/matchmake/create/private-fps',options);
  const direct='/matchmake/joinById/'+match.roomId;
  assert.deepEqual((await host.send('/api/account')).json().rooms,[match.roomId]);
  assert.equal((await host.send(direct,{...options,code:'incorrect-code'})).status,403);
  const invite=await host.send('/api/room/invites',{room:match.roomId});
  assert.equal(invite.status,200);
  const joined=await guest.send('/api/room/exchange',{code:invite.json().token});
  assert.equal(joined.status,200);assert.equal(joined.json().destination,'/fps/?network=internet&room='+match.roomId);
  const peer=await reserve(guest,direct,{...options,name:'Invited player',code:''});
  assert.equal(peer.roomId,match.roomId);
  assert.equal((await guest.send('/api/room/forget',{room:match.roomId})).json().rooms.length,0);
  await until(()=>!peer.connection.isOpen,'forget ends scoped connection');
  assert.equal((await guest.send(direct,{...options,code:''})).status,401);
  const returned=await reserve(host,direct,{...options,name:'Returning player',code:''});
  assert.equal(returned.roomId,match.roomId);
});

test('concurrent room-local match one, rematch and sign-out resolve to distinct trusted account results',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-match-credit-'));
  const local=await createLocalServer({port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),
    accountDb:join(dir,'accounts.sqlite'),testMatch:{countdownSeconds:.1,durationSeconds:.3}});
  const host=browser(local.url),sockets=[];
  t.after(async()=>{for(const socket of sockets)if(socket.connection.isOpen)await socket.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  await host.send('/pilot/session',new URLSearchParams({invite:local.config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  const password=randomBytes(24).toString('hex');
  assert.equal((await host.send('/api/account/register',{username:'match_user',password})).status,200);
  async function newMatch(){
    const response=await host.send('/matchmake/create/private-fps',{...options,fillBots:true,analystsBots:1,counterAnalystsBots:1});
    assert.equal(response.status,200);
    const sdk=new Client(local.url,{headers:host.headers()});
    const room=await sdk.consumeSeatReservation(response.json());sockets.push(room);return ready(room);
  }
  const match=(room,kind,extra={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...extra});
  async function start(room){
    match(room,'ready',{ready:true});
    await until(()=>own(room)?.playerReady,'room participant is ready');
    match(room,'start');
  }
  const a=await newMatch(),b=await newMatch();
  assert.equal(a.state.matchId,1);assert.equal(b.state.matchId,1);assert.notEqual(a.roomId,b.roomId);
  await Promise.all([start(a),start(b)]);
  await until(()=>a.state.phase==='results'&&b.state.phase==='results','both real match instances finished');
  assert.equal((await host.send('/api/account')).json().stats.matches,2);
  match(a,'rematch');
  await until(()=>a.state.matchId===2&&a.state.phase==='waiting','rematch instance created');
  await start(a);
  await until(()=>a.state.phase==='results','rematch was scored');
  assert.equal((await host.send('/api/account')).json().stats.matches,3);
  match(b,'rematch');
  await until(()=>b.state.matchId===2&&b.state.phase==='waiting','second room reset');
  assert.equal((await host.send('/api/account/logout',{})).status,200);
  await start(b);await until(()=>b.state.phase==='results','guest can finish after account sign-out');
  const again=await host.send('/api/account/login',{username:'match_user',password});
  assert.equal(again.json().stats.matches,3);
});

test('explicit public host consent, scoped admission, reports, removal, blocks and private transitions',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-public-'));
  const config={port:0,publicOrigin:origin,pilotInvite:randomBytes(24).toString('hex'),familyPassword:randomBytes(24).toString('hex'),
    familyStateFile:join(dir,'settings.json'),publicListing:true};
  const local=await createLocalServer(config),sockets=[];
  t.after(async()=>{for(const room of sockets)if(room.connection.isOpen)await room.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  const host=browser(local.url,'192.0.2.1'),guest=browser(local.url,'192.0.2.2'),friend=browser(local.url,'192.0.2.3');
  const signedOut=browser(local.url,'192.0.2.4');
  assert.deepEqual((await signedOut.send('/api/account')).json().features,{publicMatches:true});
  const creds=name=>({username:name,password:randomBytes(20).toString('hex'),displayName:name});
  for(const [b,name] of [[host,'public_host'],[guest,'public_guest'],[friend,'public_friend']])assert.equal((await b.send('/api/account/register',creds(name))).status,200);
  await host.send('/pilot/session',new URLSearchParams({invite:config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  async function connect(browser,path,body){
    const reserved=await browser.send(path,body);assert.equal(reserved.status,200);
    const sdk=new Client(local.url,{headers:browser.headers()});
    const room=await sdk.consumeSeatReservation(reserved.json());sockets.push(room);return ready(room);
  }
  const privateRoom=await connect(host,'/matchmake/create/private-fps',{...options,name:'Host'});
  const room=privateRoom.roomId,direct='/matchmake/joinById/'+room,mod='/api/room/moderation?room='+room;
  const send=(browser,action,extra={})=>browser.send('/api/room/'+action,{room,...extra});
  const list=async browser=>(await browser.send('/api/rooms/public')).json().rooms;
  assert.deepEqual(await list(guest),[]);
  assert.equal((await send(friend,'publish',{enabled:true})).status,403);
  assert.equal((await send(guest,'public-join')).status,404);
  assert.equal((await send(host,'publish',{enabled:true})).status,200);
  assert.equal((await signedOut.send('/api/rooms/public')).status,401);
  assert.equal((await send(signedOut,'public-join')).status,401);
  const available=await list(guest);assert.equal(available.length,1);
  assert.deepEqual(Object.keys(available[0]).sort(),['id','map','mode','players','capacity'].sort());
  assert.equal(available[0].id,room);
  assert.equal((await send(host,'invites')).status,409);
  assert.equal((await guest.send(mod)).status,404);
  assert.equal((await send(guest,'public-join')).json().destination,'/fps/?network=internet&room='+room);
  const g=await connect(guest,direct,{...options,name:'Visiting player',code:''});
  assert.equal((await send(host,'revoke')).status,409);
  assert.deepEqual((await guest.send('/api/room/forget',{room:'previous-room'})).json().rooms,[room]);
  const serverRoom=[...local.rooms].find(r=>r.roomId===room);
  t.mock.method(console,'info',()=>{}); // The SDK logs the transient reconnect identifier.
  Object.assign(privateRoom.reconnection,{enabled:true,minUptime:0,minDelay:700,maxDelay:700,maxRetries:2});
  let resumed=false;
  privateRoom.onReconnect(()=>{resumed=true;});
  serverRoom.seats.get(privateRoom.sessionId).client.ref.terminate();
  await until(()=>!serverRoom.seats.get(privateRoom.sessionId).connected,'host entered the reserved interval');
  assert.deepEqual(await list(friend),[]);
  assert.equal((await send(friend,'public-join')).status,404);
  assert.equal(g.connection.isOpen,true);
  await until(()=>resumed&&serverRoom.seats.get(privateRoom.sessionId).connected,'same host reclaimed the public room');
  assert.equal((await list(friend))[0].id,room);
  assert.equal(g.connection.isOpen,true);
  privateRoom.reconnection.enabled=false;
  assert.equal((await send(friend,'public-join')).status,200);
  const f=await connect(friend,direct,{...options,name:'Second visitor',code:''});
  const authority=[...local.rooms].find(r=>r.roomId===room),capacity=authority.maxClients;
  authority.maxClients=3;assert.deepEqual(await list(host),[]);assert.equal((await send(host,'public-join')).status,404);
  authority.maxClients=capacity;
  const roster=(await guest.send(mod)).json();
  assert.equal(roster.host,false);assert.deepEqual(roster.reports,[]);
  const target=roster.players.find(p=>p.name==='Second visitor').id;
  assert.equal((await send(guest,'report',{player:target,reason:'unknown'})).status,400);
  assert.equal((await send(guest,'report',{player:target,reason:'harassment'})).status,200);
  assert.equal((await send(guest,'report',{player:target,reason:'harassment'})).status,200);
  assert.equal((await send(guest,'remove',{player:target})).status,403);
  const owner=(await host.send(mod)).json();
  assert.equal(owner.host,true);assert.deepEqual(owner.reports,[{player:target,reason:'harassment',count:1}]);
  assert.equal((await send(host,'remove',{player:target})).status,200);
  await until(()=>!f.connection.isOpen,'host removal disconnects the exact public peer');
  assert.deepEqual(await list(friend),[]);assert.equal((await send(friend,'public-join')).status,404);
  const ownerId=roster.players.find(p=>p.name==='Host').id;
  assert.equal((await send(guest,'block',{player:ownerId})).status,200);
  await until(()=>!g.connection.isOpen,'a guest can leave and block a host');
  assert.deepEqual(await list(guest),[]);assert.equal((await send(guest,'public-join')).status,404);
  const blocks=(await guest.send('/api/account/blocks')).json().blocks;assert.equal(blocks[0].name,'public_host');
  assert.equal((await guest.send('/api/account/unblock',{id:blocks[0].id})).status,200);
  assert.equal((await list(guest)).length,1);
  await send(guest,'public-join');
  assert.equal((await send(host,'publish',{enabled:false})).status,200);
  assert.deepEqual(await list(guest),[]);assert.equal((await guest.send(direct,{...options,code:''})).status,401);
  assert.equal((await send(host,'publish',{enabled:true})).status,200);
  const family=await connect(host,'/matchmake/joinOrCreate/'+FAMILY_ROOM_ALIAS,{...options,code:config.familyPassword});
  assert.equal((await host.send('/api/room/publish',{room:family.roomId,enabled:true})).status,403);
  assert.equal((await list(guest)).length,1);
  await host.send('/api/account/logout',{});
  assert.deepEqual(await list(guest),[]);
});

test('a revoked private device cannot resume its reserved seat through its separate valid pilot login',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-revoke-resume-'));
  const local=await createLocalServer({port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),accountDb:join(dir,'accounts.sqlite')});
  const peers=[];
  t.after(async()=>{for(const peer of peers)if(peer.connection.isOpen)await peer.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  const host=browser(local.url),guest=browser(local.url);
  for(const b of [host,guest])await b.send('/pilot/session',new URLSearchParams({invite:local.config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  async function connect(b,path,body){
    const response=await b.send(path,body);
    assert.equal(response.status,200);
    const peer=await new Client(local.url,{headers:b.headers()}).consumeSeatReservation(response.json());peers.push(peer);return ready(peer);
  }
  const room=await connect(host,'/matchmake/create/private-fps',options);
  const invite=await host.send('/api/room/invites',{room:room.roomId});
  assert.equal((await guest.send('/api/room/exchange',{code:invite.json().token})).status,200);
  const guestPeer=await connect(guest,'/matchmake/joinById/'+room.roomId,{...options,code:''});
  const serverRoom=[...local.rooms][0],seat=serverRoom.seats.get(guestPeer.sessionId);
  t.mock.method(console,'info',()=>{});t.mock.method(console,'warn',()=>{});
  let finished=false;
  guestPeer.onLeave(()=>{finished=true;});
  Object.assign(guestPeer.reconnection,{enabled:true,minUptime:0,minDelay:750,maxDelay:750,maxRetries:1});
  seat.client.ref.terminate();
  await until(()=>!seat.connected,'guest is reserved after signal loss');
  assert.equal((await host.send('/api/room/revoke',{room:room.roomId})).status,200);
  assert.deepEqual((await guest.send('/api/account')).json().rooms,[]);
  assert.equal((await guest.send('/shared/multiplayer/rules.mjs')).status,200,'pilot session remains valid');
  await until(()=>finished,'official SDK exhausts its reconnect attempt');
  assert.equal(guestPeer.connection.isOpen,false);assert.equal(serverRoom.metrics.reconnects,0);
  assert.equal(seat.connected,false);assert.equal(seat.revoked,true);
});

test('authoritative kills across a full rejoin and a grace reconnect credit one scoring seat at a time',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-score-segments-'));
  const local=await createLocalServer({port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),
    accountDb:join(dir,'accounts.sqlite'),testMatch:{countdownSeconds:.1,scoreTarget:12}});
  const peers=[];
  t.after(async()=>{for(const peer of peers)if(peer.connection.isOpen)await peer.leave();await local.close();await rm(dir,{recursive:true,force:true});});
  const host=browser(local.url,'192.0.2.11'),player=browser(local.url,'192.0.2.12');
  for(const b of [host,player])await b.send('/pilot/session',new URLSearchParams({invite:local.config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  assert.equal((await player.send('/api/account/register',{username:'return_player',password:randomBytes(20).toString('hex')})).status,200);
  async function connect(b,path,team){
    const response=await b.send(path,{...options,fillBots:false,team});
    assert.equal(response.status,200);
    const peer=await new Client(local.url,{headers:b.headers()}).consumeSeatReservation(response.json());peers.push(peer);return ready(peer);
  }
  const anchor=await connect(host,'/matchmake/create/private-fps','counterAnalysts');
  const direct='/matchmake/joinById/'+anchor.roomId,room=[...local.rooms][0],game=room.sim.game;
  const first=await connect(player,direct,'analysts'),overlap=await connect(player,direct,'analysts'),spare=await connect(host,direct,'analysts');
  const command=(peer,kind,more={})=>peer.send('match',{kind,matchId:peer.state.matchId,controlEpoch:own(peer).controlEpoch,...more});
  for(const peer of peers)command(peer,'ready',{ready:true});
  await until(()=>peers.every(peer=>own(peer)?.playerReady),'participants ready for ordinary match');
  command(anchor,'start');await until(()=>anchor.state.phase==='active','match started');
  function score(killer,victim){
    const attacker=room.seats.get(killer.sessionId).actor,target=room.seats.get(victim.sessionId).actor;
    for(const actor of [attacker,target])if(!actor.alive)assert(respawnActor(game,actor));
    target.spawnProtectedUntil=0;
    assert(game.damage(target,400,attacker,'smg'),'authoritative enemy elimination');
  }
  score(first,anchor);score(anchor,first);
  score(overlap,anchor);score(anchor,overlap); // Overlapping tab has its own actor; these are not account credits.
  await first.leave();await until(()=>!room.seats.has(first.sessionId),'first scoring seat fully left');
  score(overlap,anchor);
  t.mock.method(console,'info',()=>{});
  Object.assign(overlap.reconnection,{enabled:true,minUptime:0,minDelay:150,maxDelay:150,maxRetries:2});
  const epoch=own(overlap).controlEpoch;
  room.seats.get(overlap.sessionId).client.ref.terminate();
  await until(()=>room.metrics.reconnects===1&&own(overlap)?.controlEpoch>epoch,'same scoring actor resumed');
  overlap.reconnection.enabled=false;
  score(overlap,anchor);score(anchor,overlap);
  await overlap.leave();await until(()=>!room.seats.has(overlap.sessionId),'second scoring seat fully left');
  const returned=await connect(player,direct,'counterAnalysts');
  score(returned,spare);score(spare,returned);score(spare,returned);
  while(game.state.score.counterAnalysts<room.state.scoreTarget)score(anchor,spare);
  await until(()=>anchor.state.phase==='results','winning team and summary committed');
  const {stats,recent}= (await player.send('/api/account')).json();
  assert.deepEqual(stats,{matches:1,kills:4,deaths:4,wins:1,xp:65});
  assert.equal(recent.length,1);assert.equal(recent[0].win,1);
});

test('an authoritative result survives a locked WAL writer, isolated backup and server replacement',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-pending-result-'));
  const path=join(dir,'accounts.sqlite'),backup=join(dir,'backup.sqlite'),restore=join(dir,'isolated.sqlite');
  const config={port:0,publicOrigin:origin,pilotInvite:randomBytes(32).toString('hex'),accountDb:path,testMatch:{countdownSeconds:.1,durationSeconds:.3}};
  let local=await createLocalServer(config),busy;
  t.after(async()=>{busy?.close();await local?.close();await rm(dir,{recursive:true,force:true});});
  let b=browser(local.url);
  const password=randomBytes(20).toString('hex');
  await b.send('/pilot/session',new URLSearchParams({invite:config.pilotInvite}),{'Content-Type':'application/x-www-form-urlencoded'});
  assert.equal((await b.send('/api/account/register',{username:'durable_result',password})).status,200);
  const reservation=await b.send('/matchmake/create/private-fps',{...options,fillBots:true,analystsBots:1,counterAnalystsBots:1});
  const room=await ready(await new Client(local.url,{headers:b.headers()}).consumeSeatReservation(reservation.json()));
  const command=(kind,extras={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...extras});
  command('ready',{ready:true});await until(()=>own(room)?.playerReady,'host ready');
  busy=new DatabaseSync(path);busy.exec('BEGIN IMMEDIATE');
  command('start');await until(()=>room.state.phase==='results','real result reached under write contention');
  assert.equal((await b.send('/api/account')).json().stats.matches,0,'uncommitted primary result is not shown');
  const journal=resultJournalPath(path);
  assert.equal((await stat(journal)).mode&0o777,0o600);
  const journalDb=new DatabaseSync(journal,{readOnly:true});
  let receipt;
  try{
    const rows=journalDb.prepare('SELECT instance,receipt FROM pending').all();
    assert.equal(rows.length,1);receipt=rows[0];
    assert(!/session|password|token|recoveryCode/.test(receipt.receipt));
  }finally{journalDb.close();}
  await copyAccountDatabase('backup',path,backup);
  await copyAccountDatabase('restore',backup,restore);
  const restored=new DatabaseSync(restore,{readOnly:true});
  assert.equal(restored.prepare('SELECT count(*) AS n FROM summaries').get().n,1);
  assert.equal(restored.prepare('SELECT count(*) AS n FROM rewards').get().n,1);
  restored.close();
  const jar=b.jar;
  // The writer still owns the original DB during controlled shutdown.
  await local.close();local=null;
  busy.exec('ROLLBACK');busy.close();busy=null;
  async function reopen(){
    local=await createLocalServer(config);b=browser(local.url);
    for(const [key,value] of jar)b.jar.set(key,value);
    return (await b.send('/api/account')).json();
  }
  assert.equal((await reopen()).stats.matches,1);
  await local.close();local=null;
  // Model a restart just after primary commit and before durable acknowledgement.
  const duplicate=new DatabaseSync(journal);
  assert.equal(duplicate.prepare('SELECT count(*) AS n FROM pending').get().n,0);
  duplicate.prepare('INSERT INTO pending VALUES(?,?)').run(receipt.instance,receipt.receipt);duplicate.close();
  const profile=await reopen();
  assert.equal(profile.stats.matches,1);assert.equal(profile.recent.length,1);
  const drained=new DatabaseSync(journal,{readOnly:true});
  assert.equal(drained.prepare('SELECT count(*) AS n FROM pending').get().n,0);drained.close();
});
