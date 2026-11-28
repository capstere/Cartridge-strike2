import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {respawnActor} from '../../src/fps/action-rules.mjs';
import {createLocalServer} from '../local-server.mjs';
import {delay,options,own,ready,until} from './helpers.mjs';

const match=(peer,kind,extra={})=>peer.send('match',{kind,matchId:peer.state.matchId,controlEpoch:own(peer).controlEpoch,...extra});
function command(peer,slot,serial){
  const a=own(peer),s=peer.state;
  return {actorId:a.id,slot,serial,matchId:s.matchId,round:s.round,worldRevision:s.worldRevision,lifeId:a.lifeId,controlEpoch:a.controlEpoch};
}
test('owner-only UAV survives reconnect, rejects stale commands and clears on death, rematch and seat replacement',{timeout:25000},async t=>{
  const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.04}});
  t.after(()=>local.close());
  const client=new Client(local.url,{headers:{Origin:local.url}});
  const host=await client.create('private-fps',{...options,mapId:'compact-arena',team:'analysts'});
  const privatePackets=new Map(),events=[];
  async function listen(peer){
    const packets=[];
    peer.onMessage('bonusState',msg=>packets.push(msg));
    peer.onMessage('events',batch=>events.push(...batch));
    privatePackets.set(peer,packets);
    return ready(peer);
  }
  await listen(host);
  const enemy=await listen(await client.joinById(host.roomId,{...options,team:'counterAnalysts'}));
  const room=[...local.rooms][0],g=room.sim.game;
  const actor=p=>room.seats.get(p.sessionId).actor;
  const latest=p=>privatePackets.get(p).at(-1);
  const owner=actor(host),foe=actor(enemy);
  for(const p of [host,enemy])match(p,'ready',{ready:true});
  await until(()=>own(host).playerReady&&own(enemy).playerReady,'both ready');
  match(host,'start');
  await until(()=>host.state.phase==='active' && enemy.state.phase==='active','active match');
  for(const p of [host,enemy])p.send('controls',{enabled:true,lifeId:own(p).lifeId,controlEpoch:own(p).controlEpoch});
  await until(()=>room.seats.get(host.sessionId).enabled,'host control enabled');
  g.config.spawnProtection=0;
  for(let n=0;n<8;n++){
    foe.spawnProtectedUntil=0;
    assert(g.damage(foe,500,owner,'smg',{head:true}));
    assert(respawnActor(g,foe));
  }
  await until(()=>latest(host)?.bonus.progress===8,'one increment per confirmed headshot kill');
  assert.deepEqual(latest(host).bonus.charges,{uav:1,rage:1,immortal:1});
  const original=command(host,1,1);
  for(const change of [{actorId:own(enemy).id},{worldRevision:99},{matchId:99},{round:99},{lifeId:99},
    {controlEpoch:99},{serial:undefined},{serial:0},{serial:0x100000000},{progress:8},{slot:'1'}])host.send('bonus',{...original,...change});
  enemy.send('bonus',original);
  await delay(90);
  assert.equal(owner.bonus.active,null);
  host.send('bonus',original);
  host.send('bonus',original);
  await until(()=>latest(host)?.bonus.active?.id==='uav'&&latest(host).samples.length===1,'owner receives an approved bounded radar sample');
  host.send('bonus',command(host,2,2));await delay(85);
  assert.equal(owner.bonus.charges.rage,1);
  const active=latest(host).bonus.active;
  assert.equal(active.endTick-active.startTick,900);
  assert(privatePackets.get(enemy).every(m=>m.actorId===foe.id && m.samples.length===0 && m.bonus.progress===0));
  assert.equal(enemy.state.actors.get(owner.id).handling.bonusId,'');
  assert(!events.some(event=>'samples' in event || 'charges' in event));
  Object.assign(host.reconnection,{enabled:true,minUptime:0,minDelay:100});
  room.seats.get(host.sessionId).client.ref.terminate();
  await until(()=>own(host)?.connected && own(host).controlEpoch>original.controlEpoch,'reserved player reconnects');
  await until(()=>latest(host)?.controlEpoch===own(host).controlEpoch,'same effect sent to the new connection');
  assert.deepEqual(latest(host).bonus.active,active);
  assert.equal(latest(host).bonus.lastSerial,1);
  host.send('controls',{enabled:true,lifeId:own(host).lifeId,controlEpoch:own(host).controlEpoch});
  const oldLife=command(host,2,2);
  owner.spawnProtectedUntil=0;assert(g.damage(owner,500,foe,'smg'));
  owner.respawnAt=g.state.time;
  await until(()=>own(host).alive && own(host).lifeId>oldLife.lifeId && latest(host)?.lifeId===own(host).lifeId,'new life is sent with unused charges');
  assert.equal(latest(host).bonus.active,null);assert.equal(latest(host).bonus.progress,0);
  assert.deepEqual(latest(host).bonus.charges,{uav:0,rage:1,immortal:1});
  host.send('bonus',oldLife);await delay(75);assert.equal(owner.bonus.active,null);
  host.send('bonus',command(host,2,3));
  await until(()=>latest(host)?.bonus.active?.id==='rage' && enemy.state.actors.get(owner.id)?.handling.bonusId==='rage','both observe the visible Rage effect');
  assert(privatePackets.get(enemy).every(m=>m.actorId===foe.id && !m.samples.length));
  assert.equal(enemy.state.actors.get(owner.id).handling.bonusEnd-owner.bonus.active.startTick,900);
  const oldSeat=command(host,3,4),previousId=oldSeat.actorId;
  host.reconnection.enabled=false;
  await host.leave();
  await until(()=>!room.seats.has(host.sessionId),'original reservation removed');
  const replacement=await listen(await client.joinById(enemy.roomId,{...options,team:'analysts'}));
  await until(()=>latest(replacement)?.actorId===previousId,'replacement receives only fresh private state');
  assert.equal(latest(replacement).bonus.active,null);
  assert.deepEqual(latest(replacement).bonus.charges,{uav:0,rage:0,immortal:0});
  replacement.send('bonus',oldSeat);await delay(90);
  assert.equal(actor(replacement).bonus.active,null);assert(!latest(replacement).samples.length);
  actor(enemy).bonus.charges.rage=1;
  room.match.finish('time');
  await until(()=>enemy.state.phase==='results','completed match');
  match(enemy,'rematch');
  await until(()=>enemy.state.phase==='waiting' && latest(enemy)?.matchId===enemy.state.matchId,'rematch starts with fresh private state');
  assert.equal(latest(enemy).bonus.progress,0);
  assert.deepEqual(latest(enemy).bonus.charges,{uav:0,rage:0,immortal:0});
  await replacement.leave();await enemy.leave();
});
