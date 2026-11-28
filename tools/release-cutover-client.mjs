// Independent disposable client. The manager receives no room or account tokens.
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {createInterface} from 'node:readline/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
const [root,action]=process.argv.slice(2);
const lines=createInterface({input:process.stdin})[Symbol.asyncIterator]();
const {origin,invite,familyPassword}=JSON.parse((await lines.next()).value);
assert.equal(new URL(origin).protocol,'https:');
const req=createRequire(join(root,'server/package.json'));
globalThis.WebSocket=req('ws');
const {Client}=req('@colyseus/sdk');
const {CONTRACT,MAP_CONTRACTS}=await import(pathToFileURL(join(root,'shared/multiplayer/build.mjs')));
async function until(read){
  const deadline=Date.now()+18000;
  while(!read()){assert(Date.now()<deadline,'Timed out waiting for replicated state');await delay(60);}
}
let room;
try{
  const res=await fetch(origin+'/pilot/session',{method:'POST',headers:{Origin:origin,'Content-Type':'application/x-www-form-urlencoded'},
    body:new URLSearchParams({invite}),redirect:'manual',signal:AbortSignal.timeout(15000)});
  await res.arrayBuffer();assert.equal(res.status,303);
  const cookie=res.headers.getSetCookie().find(c=>c.startsWith('__Host-cs2_pilot=')).split(';')[0];
  const client=new Client(origin,{headers:{Origin:origin,Cookie:cookie}});
  if(action==='write'){
    const username='drill_'+randomBytes(5).toString('hex');
    const result=await fetch(origin+'/api/account/register',{method:'POST',headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},
      body:JSON.stringify({username,displayName:'Release drill',password:randomBytes(24).toString('base64url')}),signal:AbortSignal.timeout(15000)});
    assert(result.ok);await result.arrayBuffer();
    room=await client.joinOrCreate('JESPERS-ROOM',{name:'Drill host',code:familyPassword,contract:CONTRACT});
  }else{
    assert.equal(action,'hold');
    room=await client.create('private-fps',{name:'Drill player',contract:CONTRACT,code:randomBytes(15).toString('hex'),fillBots:false,mapId:'compact-arena'});
  }
  room.reconnection.enabled=false;
  room.onMessage('events',()=>{});room.onMessage('clock-probe',n=>room.send('clock-echo',n));
  const own=()=>[...(room.state.actors?.values()||[])].find(actor=>actor.sessionId===room.sessionId);
  await until(own);
  room.send('ready',{...MAP_CONTRACTS[room.state.mapId],worldRevision:room.state.worldRevision});
  await until(()=>own()?.ready);
  if(action==='write'){
    room.send('match',{kind:'settings',matchId:room.state.matchId,controlEpoch:own().controlEpoch,mapId:'meltem',mode:'dom'});
    await until(()=>room.state.mapId==='meltem'&&room.state.mode==='dom');
  }else{
    console.log('SEAT_HELD');
    assert.equal((await lines.next()).value,'leave');
    assert(room.connection.isOpen,'Player remained connected until voluntary departure');
  }
  await room.leave();room=null;console.log('DONE');
}catch(error){
  // Do not emit the SDK exception. It can contain reservation identifiers.
  console.error('Independent release client failed ('+error.name+')');process.exitCode=1;
}finally{await room?.leave().catch(()=>{});process.stdin.destroy();}
