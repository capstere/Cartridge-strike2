import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {defaultArsenal,quoteClass,weaponDefinition} from '../../src/fps/arsenal.mjs';
import {INTERPOLATION_MS} from '../../shared/multiplayer/rules.mjs';
import {MAP_CONTRACTS} from '../../shared/multiplayer/build.mjs';
import {own,options,until,send,delay} from './helpers.mjs';

const weapon=(id,attachments=[],camo=null)=>({id,attachments,camo});
const custom={...defaultArsenal(),selected:'custom-1'};
custom.slots[0]={name:'Harbor',primary:weapon('smg',['sil','xmag'],'desert'),secondary:weapon('sidearm'),equipment:'smoke'};
const preset=id=>({...defaultArsenal(),selected:id});
const command=(room,kind,extra={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...extra});
async function admit(room,arsenalProfile){
  room.reconnection.enabled=false;
  const receipts=[],notices=[],events=[];
  room.onMessage('class-choice',data=>receipts.push(data));room.onMessage('notice',data=>notices.push(data));
  room.onMessage('bonusState',()=>{});room.onMessage('events',batch=>events.push(...batch));room.onMessage('clock-probe',token=>room.send('clock-echo',token));
  await until(()=>room.state?.mapId&&own(room),'room prepared');
  room.send('ready',{...MAP_CONTRACTS[room.state.mapId],worldRevision:room.state.worldRevision,arsenalProfile});
  await until(()=>own(room)?.ready,'actor admitted');
  return {room,receipts,notices,events};
}
async function launch(a,b){
  for(const room of [a,b])command(room,'ready',{ready:true});
  await until(()=>own(a).playerReady&&own(b).playerReady,'both ready');
  command(a,'start');
  await until(()=>a.state.phase==='active'&&b.state.phase==='active','active');
  for(const room of [a,b])room.send('controls',{enabled:true,lifeId:own(room).lifeId,controlEpoch:own(room).controlEpoch});
}
test('two clients see equipped kits and smoke, pending class stays private through reconnect, respawn and paid Classic rematch',{timeout:40000},async t=>{
  const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05,arsenalEntitlements:{playerLevel:3,weaponLevels:{smg:12}}}});
  t.after(()=>local.close());
  const client=new Client(local.url,{headers:{Origin:local.url}});
  const host=await admit(await client.create('private-fps',{...options,team:'analysts'}),custom),a=host.room;
  const peer=await admit(await client.joinById(a.roomId,{...options,team:'counterAnalysts'}),preset('raider')),b=peer.room;
  const r=[...local.rooms][0],g=r.sim.game,seat=r.seats.get(a.sessionId),actor=seat.actor;
  await launch(a,b);
  await until(()=>b.state.actors.get(actor.id).handling.primaryKit==='sil,xmag:desert','equipped fittings replicated');
  assert.equal(own(a).primaryAmmo,weaponDefinition('smg',['xmag']).magazine);assert.equal(own(b).handling.flashCount,1);
  assert(!JSON.stringify(b.state.toJSON()).includes('Harbor'));assert(!JSON.stringify(peer.receipts).includes('Harbor'));
  // A compressed countdown can finish while the SDK still displays the former
  // life. Wait for a current-life render sample before sending the single shot.
  const renderStamp=()=>Math.round(a.clock.serverNow())-Math.round(INTERPOLATION_MS+a.clock.smoothedRtt()/2);
  const stock=actor.inventory.primary.ammo;
  const actionId=[actor.id,actor.lifeId,seat.epoch,1].join(':');
  const observed=()=>peer.events.filter(e=>e.type==='shot'&&e.actorId===actor.id);
  let sampled;
  try{
    await until(()=>seat.enabled&&own(a).controlEpoch===seat.epoch&&own(a).lifeId===actor.lifeId&&
      a.clock.lastServerTime()>0&&renderStamp()>=seat.lifeStartedAt&&r.lag.tickTimes.has(a.state.tick),
    'SDK displayed this life with controls enabled');
    sampled={tick:a.state.tick,render:renderStamp(),lifeStartedAt:seat.lifeStartedAt};
    send(a,{fire:true,fireEdge:true,fireId:1,yaw:actor.yaw,shotYaw:actor.yaw});
    await until(()=>observed().length>0&&own(a).primaryAmmo===stock-1,'peer observed suppressed shot and shooter adopted its spent round');
    assert.equal(observed().length,1);
    assert.equal(observed()[0].actionId,actionId);
    assert.equal(observed()[0].suppressed,true);
    assert.equal(actor.inventory.primary.ammo,stock-1);
    assert.equal(actor.spawnProtectedUntil,0);
    assert(!peer.events.some(e=>e.type==='tracer'&&e.actorId===actor.id));
  }catch(error){
    t.diagnostic(JSON.stringify({sampled,actionId,latestTick:r.sim.tickNumber,enabled:seat.enabled,phase:r.state.phase,
      lastFire:seat.lastFire,invalid:r.metrics.invalid,rejected:r.lag.metrics.reasons,authorityAmmo:actor.inventory.primary.ammo,
      clientAmmo:own(a)?.primaryAmmo,peerShots:observed().map(e=>[e.actionId,e.weapon,e.suppressed])}));
    throw error;
  }
  const other=r.seats.get(b.sessionId).actor;
  const drop=(room,serial)=>room.send('classic',{kind:'drop',matchId:room.state.matchId,round:room.state.round,
    lifeId:own(room).lifeId,controlEpoch:own(room).controlEpoch,serial});
  const go=(who,to)=>Object.assign(who,{x:to.x,y:to.y,z:to.z});
  const fired=actor.inventory.primary.ammo;
  send(a,{fire:false});await delay(100);
  drop(a,1);await until(()=>b.state.drops.size===1,'peer sees authority drop');
  const ground=[...b.state.drops.values()][0];assert.equal(ground.ammo,fired);assert.equal(ground.equipment,'sil,xmag:desert');
  send(b,{interact:true});await delay(100);assert.equal(b.state.drops.size,1,'out-of-reach pickup refused');
  send(b,{interact:false});go(other,actor);await delay(80);send(b,{interact:true});
  await until(()=>own(b).handling.primaryKit==='sil,xmag:desert','peer acquired the exact fitted item');
  assert.equal(other.inventory.primary.ammo,fired);
  const elsewhere=g.world.anchors[other.team][0];go(other,elsewhere);
  drop(b,1);await until(()=>[...a.state.drops.values()].some(d=>d.equipment==='sil,xmag:desert'),'second drop');
  go(actor,elsewhere);send(a,{interact:true});
  await until(()=>own(a).handling.primaryKit==='sil,xmag:desert','original player reacquired fittings');
  assert.equal(actor.inventory.primary.ammo,fired);send(a,{interact:false});

  a.send('select',{slot:'smoke',serial:1,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch});
  await until(()=>own(a).weapon==='smoke','equipped smoke');await delay(260);
  send(a,{fire:true,fireId:2});await until(()=>b.state.grenades.size===1,'peer sees thrown smoke');
  await until(()=>b.state.smokes.size===1,'both clients adopt authoritative cloud');
  assert.equal(own(a).handling.smoke,0);
  const invalid=structuredClone(custom);invalid.slots[0].primary.attachments=['sil','choke'];
  command(a,'class',{profile:invalid});await until(()=>host.notices.length,'invalid combination rejected');
  assert.equal(seat.arsenalProfile.selected,'custom-1');
  command(a,'class',{profile:preset('scout')});
  await until(()=>host.receipts.at(-1)?.kit.id==='scout','private acknowledgement');
  assert.equal(own(a).primary,'smg');assert.equal(peer.receipts.length,1);
  const life=actor.lifeId,epoch=actor.controlEpoch;
  Object.assign(a.reconnection,{enabled:true,minUptime:0,minDelay:80,maxDelay:200});
  r.clients.find(c=>c.sessionId===a.sessionId).ref.terminate();
  await until(()=>own(a).controlEpoch>epoch,'reconnect');
  assert.equal(actor.lifeId,life);assert.equal(own(a).handling.primaryKit,'sil,xmag:desert');
  command(a,'class',{controlEpoch:epoch,profile:preset('assault')});
  g.config.respawnDelay=.08;actor.spawnProtectedUntil=0;
  assert(g.damage(actor,500,r.seats.get(b.sessionId).actor,'smg'));
  await until(()=>own(a).lifeId>life&&own(a).primary==='sniper','only the next spawn gets Scout');
  assert.equal(own(a).handling.primaryKit,'');assert.equal(own(a).handling.smoke,1);
  r.match.finish('time');await until(()=>a.state.phase==='results','results');
  command(a,'rematch');await until(()=>a.state.phase==='waiting','next lobby');
  command(a,'settings',{mode:'classic'});await until(()=>b.state.mode==='classic','classic settings');
  await launch(a,b);await until(()=>a.state.roundPhase==='buy','buy period');
  assert.equal(own(a).primary,'');assert.equal(actor.money,g.config.startMoney);
  const receipts=[];a.onMessage('purchase',data=>receipts.push(data));
  let serial=1; // Both drops used serial 1 on their respective connections.
  const buy=()=>a.send('classic',{kind:'buy',item:'class',matchId:a.state.matchId,round:a.state.round,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch,serial:++serial});
  buy();await until(()=>receipts.length===1,'server rejects unaffordable class');assert.equal(receipts[0].reasonId,'credits');
  const {cost}=quoteClass(actor);actor.money=cost+5;buy();
  await until(()=>receipts.length===2&&own(a).primary==='sniper','paid Classic class');
  assert.equal(receipts[1].outcome,'accepted');assert.equal(actor.money,5);assert.equal(actor.inventory.smoke,1);
  await Promise.all([a.leave(),b.leave()]);
});
