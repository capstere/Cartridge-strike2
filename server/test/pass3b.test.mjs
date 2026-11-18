import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {WebSocket} from 'ws';
import {createLocalServer} from '../local-server.mjs';
import {MAX_BUFFERED_BYTES} from '../network-room.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';

async function fixture(t){const local=await createLocalServer({port:0});t.after(()=>local.close());return {local,c:new Client(local.url,{headers:{Origin:local.url}})};}
test('stages 2, 4 and 10: independent humans, balanced 5v5, chosen teams, safe spawns and full admission',{timeout:20000},async t=>{
 const {local,c}=await fixture(t),peers=[];
 peers.push(await ready(await c.create('private-fps',options)));const r=[...local.rooms][0];
 for(let i=1;i<10;i++){
  peers.push(await ready(await c.joinById(peers[0].roomId,{...options,name:'Human '+i})));
  if([2,4,10].includes(peers.length)){
   assert.equal(r.sim.game.actors.length,peers.length);assert.equal(r.seats.size,peers.length);
   assert.equal(new Set(peers.map(p=>own(p).id)).size,peers.length);
   assert(r.sim.game.actors.every(a=>a.controllerType==='human'&&a.bot===null));
   const before=new Map(r.sim.game.actors.map(a=>[a.id,{x:a.x,z:a.z}]));
   for(let j=0;j<10;j++){peers.forEach((p,k)=>send(p,{strafe:(k%2?.3:-.3),yaw:k*.2}));await delay(17);}
   for(let k=0;k<peers.length;k++)assert.equal(r.sim.game.actors.find(a=>a.id===own(peers[k]).id).yaw,k*.2,'independent input ownership');
   assert(r.sim.game.actors.some(a=>Math.hypot(a.x-before.get(a.id).x,a.z-before.get(a.id).z)>.02));
  }
 }
 assert.equal(r.sim.game.actors.filter(a=>a.team==='analysts').length,5);
 assert.equal(r.sim.game.actors.filter(a=>a.team==='counterAnalysts').length,5);
 for(const a of r.sim.game.actors)for(const b of r.sim.game.actors)if(a!==b)assert(Math.hypot(a.x-b.x,a.z-b.z)>=a.radius+b.radius-.01,'no spawn/body overlap');
 await assert.rejects(c.joinById(peers[0].roomId,options),/full|locked/);
 const interrupted=peers[0],reserved=r.seats.get(interrupted.sessionId),epoch=reserved.epoch;
 Object.assign(interrupted.reconnection,{enabled:true,minUptime:0,minDelay:500,maxDelay:500,maxRetries:5,maxEnqueuedMessages:0});
 reserved.client.ref.terminate();await until(()=>!reserved.connected,'full-room interruption');
 await assert.rejects(c.joinById(interrupted.roomId,options),/full|locked/,'a reserved player still occupies the tenth slot');
 await until(()=>reserved.connected&&own(interrupted).controlEpoch>epoch,'full-room reconnect');
 assert.equal(r.sim.game.actors.length,10);assert.equal(r.seats.size,10);
 const removed=peers.pop(),id=own(removed).id,team=own(removed).team;await removed.leave();await until(()=>r.seats.size===9,'one slot released');
 await assert.rejects(c.joinById(peers[0].roomId,{...options,team:team==='analysts'?'counterAnalysts':'analysts'}),/team is full/);
 const replacement=await ready(await c.joinById(peers[0].roomId,{...options,team}));assert.equal(own(replacement).id,id);peers.push(replacement);
 assert.equal(local.rooms.size,1);await Promise.all(peers.map(p=>p.leave()));await until(()=>local.rooms.size===0,'ten humans dispose');
});

test('token-owned reconnect retains actor/inventory/score, neutralizes input, rejects epochs and expires in 15 seconds',{timeout:40000},async t=>{
 const {local,c}=await fixture(t),a=await ready(await c.create('private-fps',options)),b=await ready(await c.joinById(a.roomId,options));
 const r=[...local.rooms][0],seat=r.seats.get(a.sessionId),actor=seat.actor;
 Object.assign(a.reconnection,{enabled:true,minUptime:0,minDelay:100,maxDelay:100,maxRetries:100,maxEnqueuedMessages:0});
 a.onDrop(()=>{});a.onReconnect(()=>{});
 actor.hp=61;actor.kills=2;actor.deaths=1;actor.inventory.primary.ammo=19;actor.spawnProtectedUntil=0;
 const identity={id:actor.id,sid:a.sessionId,team:actor.team,life:actor.lifeId};
 for(let cycle=0;cycle<3;cycle++){
  const epoch=actor.controlEpoch,oldLife=actor.lifeId,protection=actor.spawnProtectedUntil;
  send(a,{strafe:1,fireId:cycle+1});await delay(30);
  seat.client.ref.terminate();await until(()=>!seat.connected,'drop observed');const x=actor.x,tick=r.sim.tickNumber;
  await until(()=>seat.connected&&own(a).controlEpoch>epoch,'reconnected full state');
  assert.equal(actor.x,x,'disconnected actor stops');assert(r.sim.tickNumber>tick);
  assert.equal(r.sim.game.actors.length,2);assert.equal(seat.actor,actor);assert.equal(a.sessionId,identity.sid);
  assert.equal(actor.hp,61);assert.equal(actor.inventory.primary.ammo,19);assert.equal(actor.kills,2);assert.equal(actor.deaths,1);
  assert.equal(actor.lifeId,oldLife);assert.equal(actor.spawnProtectedUntil,protection);assert.equal(seat.enabled,false);
  a.send('controls',{enabled:true,lifeId:actor.lifeId,controlEpoch:epoch});await delay(30);assert.equal(seat.enabled,false,'stale Resume rejected');
  a.send('controls',{enabled:true,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch});await until(()=>seat.enabled,'fresh Resume');
  const invalid=r.metrics.invalid;send(a,{controlEpoch:epoch,strafe:1,fire:true,fireId:99});await until(()=>r.metrics.invalid>invalid,'old connection input rejected');assert.equal(actor.x,x);
 }
 // Another socket cannot acquire the seat with its public session id alone.
 const token=seat.client.reconnectionToken;seat.client.ref.terminate();await until(()=>!seat.connected,'drop before forgery');
 const denied=await new Promise((resolve,reject)=>{
  const ws=new WebSocket(local.url.replace('http:','ws:')+'/'+r.processId+'/'+r.roomId+'?sessionId='+a.sessionId+'&reconnectionToken=wrong-token',{headers:{Origin:local.url}});
  ws.on('error',()=>{});ws.on('close',code=>resolve(code));setTimeout(()=>{ws.terminate();reject(Error('invalid token did not close'));},2000).unref();
 });assert.notEqual(denied,1000);
 // Wait for the client's new token/full snapshot, not merely the server hook:
 // killing that socket before JOIN finishes tests an interrupted handshake.
 await until(()=>seat.connected&&own(a).controlEpoch===seat.epoch,'right token completes reconnect');
 assert.notEqual(seat.client.reconnectionToken,token,'tokens rotate');
 // Disconnect during death: respawn is the ordinary match timer, not reconnect.
 actor.spawnProtectedUntil=0;r.sim.game.damage(actor,1000,r.seats.get(b.sessionId).actor);
 const deaths=actor.deaths,life=actor.lifeId,deadEpoch=seat.epoch;seat.client.ref.terminate();
 await until(()=>!seat.connected,'dead client interrupted');
 await until(()=>seat.connected&&own(a).controlEpoch>deadEpoch,'dead client reconnected');
 assert.equal(actor.alive,false,'reconnection cannot revive a dead player');
 assert.equal(actor.lifeId,life);assert.equal(actor.deaths,deaths);assert.equal(seat.enabled,false);
 a.reconnection.enabled=false;seat.client.ref.terminate();
 await until(()=>!seat.connected,'dead client dropped');await until(()=>actor.alive&&actor.lifeId===life+1,'match respawns disconnected body');assert.equal(actor.deaths,deaths);
 const start=performance.now();await until(()=>!r.seats.has(identity.sid),'15-second reservation expiry',16000);
 assert(performance.now()-start>10000,'real grace elapsed');assert.equal(r.sim.game.actors.length,1);assert.equal(r.state.actors.size,1);
 await b.leave();await until(()=>local.rooms.size===0,'room disposed after reservation');
});

test('an interrupted reconnect handshake expires safely and permits a fresh authenticated join',{timeout:12000},async t=>{
 const {local,c}=await fixture(t),a=await ready(await c.create('private-fps',options)),b=await ready(await c.joinById(a.roomId,options));
 const r=[...local.rooms][0],sid=a.sessionId,oldLife=own(a).lifeId,start=r.sim.tickNumber;
 Object.assign(a.reconnection,{enabled:true,minUptime:0,minDelay:100,maxDelay:100,maxRetries:5,maxEnqueuedMessages:0});
 let left=false;a.onLeave(()=>{left=true;});a.onError(()=>{});
 const reconnect=r.onReconnect.bind(r);
 r.onReconnect=client=>{reconnect(client);client.ref.terminate();};
 r.seats.get(sid).client.ref.terminate();
 await until(()=>left&&!r.seats.has(sid),'incomplete handshake ends with no retained actor');
 assert.equal(r.sim.game.actors.length,1);assert(r.sim.tickNumber>start);
 r.onReconnect=reconnect;
 const fresh=await ready(await c.joinById(b.roomId,options));
 assert.notEqual(fresh.sessionId,sid);assert(own(fresh).lifeId>oldLife);
 assert.equal(r.sim.game.actors.length,2);
 await fresh.leave();await b.leave();await until(()=>local.rooms.size===0,'fresh-session cleanup');
});

test('a real corked WebSocket write backlog is bounded without stopping another player',{timeout:10000},async t=>{
 const {local,c}=await fixture(t),a=await ready(await c.create('private-fps',options)),b=await ready(await c.joinById(a.roomId,options));
 const r=[...local.rooms][0],client=r.seats.get(a.sessionId).client,tick=r.sim.tickNumber;
 // Real ws/TCP write buffering, not a mocked bufferedAmount or snapshot loss.
 client.cork();client.send('problem','x'.repeat(MAX_BUFFERED_BYTES+1024));
 assert(client.ref.bufferedAmount>MAX_BUFFERED_BYTES);
 await until(()=>!r.seats.has(a.sessionId),'slow transport disconnected',2000);
 assert.equal(r.metrics.backpressure,1);assert.equal(r.sim.game.actors.length,1);
 send(b,{strafe:1});await delay(50);assert(r.sim.tickNumber>tick);
 await b.leave();await until(()=>local.rooms.size===0,'backpressure leaves no reservation');
});
