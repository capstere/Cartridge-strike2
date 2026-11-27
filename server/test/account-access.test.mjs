import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import http from 'node:http';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import test from 'node:test';
import {createLocalServer} from '../local-server.mjs';
import {WebSocket} from 'ws';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
import {FAMILY_ROOM_ALIAS} from '../../shared/multiplayer/family-room.mjs';
import {options,own,ready,until} from './helpers.mjs';
globalThis.WebSocket=WebSocket;
const {Client}=await import('@colyseus/sdk');

const origin='https://accounts.example.test';
function browser(url) {
  const jar=new Map();
  const headers=()=>({Host:new URL(origin).host,Origin:origin,'X-Forwarded-Proto':'https',Cookie:[...jar].map(([k,v])=>k+'='+v).join('; ')});
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
  assert.equal((await b.send('/api/account')).json().user,null);
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
