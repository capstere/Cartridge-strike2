import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {latencyProxy} from '../../tools/network-proxy.mjs';
import {LagCompensation} from '../lag-compensation.mjs';
import {createLocalServer} from '../local-server.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';

test('two seats see one Rush recovery shot after a coalesced tap, with independent current look',{timeout:15000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 let a,b;
 t.after(async()=>{await Promise.allSettled([a?.leave(),b?.leave()]);await local.close();});
 const sdk=new Client(local.url,{headers:{Origin:local.url}});
 a=await ready(await sdk.create('private-fps',options));
 b=await ready(await sdk.joinById(a.roomId,options));
 const room=[...local.rooms][0],g=room.sim.game,seat=room.seats.get(a.sessionId),actor=seat.actor;
 await until(()=>Number.isFinite(seat.rttAt),'fresh peer RTT');
 const shotEvents=[[],[]];
 for(const [i,peer] of [a,b].entries()){
   peer.onMessage('events',batch=>shotEvents[i].push(...batch.filter(e=>e.type==='shot' && e.actorId===actor.id)));
 }
 // The normal equipment command equips the test rifle or the existing pistol.
 actor.inventory.primary=g.weaponItem('cr4');actor.weapon='knife';
 for(const [i,weapon] of ['cr4','p9'].entries()){
   const fireId=i+1;
   a.send('select',{slot:i?'pistol':'primary',lifeId:actor.lifeId,controlEpoch:seat.epoch,serial:fireId});
   await until(()=>own(a).weapon===weapon,'normal select');
   Object.assign(actor,{x:20,y:0,z:-18,onGround:true});
   await delay(260);
   const start=performance.now();
   while(actor.rushWeight<.78){
     assert(performance.now()-start<1500,'forward input produces Rush in the real world');
     send(a,{forward:1,yaw:Math.PI,sprint:true,fireId:i,fireEdge:false});await delay(16);
   }
   const startAmmo=g.item(actor).ammo,startWeight=actor.rushWeight,step=room.fixedTick;
   const queue=room.inputs.get(a.sessionId);
   let sampled=false;
   room.fixedTick=function(){
     if(!sampled && queue.size<2)return;
     step.call(this);
     if(!sampled){sampled=true;assert.equal(g.item(actor).ammo,startAmmo,'tap requests shouldering before firing');}
   };
   try{
     send(a,{sprint:true,forward:1,fire:true,fireId,fireEdge:true,shotYaw:.48,shotPitch:.09,yaw:.48,pitch:.09});
     send(a,{sprint:false,strafe:1,fire:false,fireId,fireEdge:false,yaw:-.37,pitch:0});
     await until(()=>shotEvents.every(events=>events.length>i),'both clients observe the recovery shot');
   }finally{room.fixedTick=step;}
   assert(startWeight>.75);assert.equal(g.item(actor).ammo,startAmmo-1);assert.equal(actor.yaw,-.37);
   for(const events of shotEvents){
     const e=events[i];assert.equal(e.weapon,weapon);assert.equal(e.yaw,.48);assert.equal(e.pitch,.09);
     assert.equal(e.actionId,[actor.id,actor.lifeId,seat.epoch,fireId].join(':'));
   }
   send(a,{fire:true,fireId,fireEdge:true,shotYaw:.48,shotPitch:.09});
   await delay(100);assert.equal(g.item(actor).ammo,startAmmo-1,'duplicate fire ID cannot repeat a delayed shot');
 }
 assert.equal(room.metrics.invalid,0);assert(room.metrics.coalesced>=2);
});

test('a 250 ms round trip with ordered jitter preserves the original manual Rush tap and one debit',{timeout:18000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 const proxy=await latencyProxy(local.url,{oneWayMs:125,jitterMs:20});
 let shooterRoom,observer;
 t.after(async()=>{
   await Promise.allSettled([shooterRoom?.leave(),observer?.leave()]);
   await proxy.close();await local.close();
 });
 const sdk=new Client(proxy.url,{headers:{Origin:proxy.url}});
 shooterRoom=await ready(await sdk.create('private-fps',options));
 observer=await ready(await sdk.joinById(shooterRoom.roomId,options));
 const authority=[...local.rooms][0],seat=authority.seats.get(shooterRoom.sessionId),actor=seat.actor;
 const events=[[],[]];
 for(const [i,peer] of [shooterRoom,observer].entries()){
   peer.onMessage('events',batch=>events[i].push(...batch.filter(e=>e.type==='shot' && e.actorId===actor.id)));
 }
 await until(()=>seat.rtt>180,'the authority measured both directions of the delayed path');
 shooterRoom.send('select',{slot:'pistol',lifeId:actor.lifeId,controlEpoch:seat.epoch,serial:1});
 await until(()=>own(shooterRoom).weapon==='p9','ordinary pistol selection');
 Object.assign(actor,{x:20,y:0,z:-18,onGround:true});
 const sprint={sprint:true,forward:1,yaw:Math.PI};
 const start=performance.now();
 while(actor.rushWeight<.76){
   assert(performance.now()-start<2000,'movement built the authoritative Rush weight');
   send(shooterRoom,sprint);await delay(14);
 }
 const ammo=actor.inventory.pistol.ammo;
 send(shooterRoom,{...sprint,fire:true,fireId:1,fireEdge:true,shotYaw:.7,shotPitch:.06});
 shooterRoom.send('controls',{enabled:true,lifeId:actor.lifeId,controlEpoch:seat.epoch});
 send(shooterRoom,{fireId:1,fireEdge:false,fire:false,yaw:-.2});
 try{await until(()=>events.every(list=>list.length===1),'both delayed clients received the same accepted edge');}
 catch(error){
   t.diagnostic(JSON.stringify({invalid:authority.metrics.invalid,lag:authority.lag.metrics,events:events.map(list=>list.length),
     sampleTick:seat.lastSampleTick,fireId:seat.lastFire,rtt:seat.rtt,ammo:actor.inventory.pistol.ammo,actorTime:actor.nextShot,weight:actor.rushWeight}));
   throw error;
 }
 await delay(150);
 assert.equal(actor.inventory.pistol.ammo,ammo-1);
 assert.equal(events[0].length,1);assert.equal(events[1].length,1);
 assert.equal(events[0][0].actionId,events[1][0].actionId);
 assert.equal(events[0][0].yaw,.7);assert.equal(events[0][0].pitch,.06);assert.equal(actor.yaw,-.2);
 assert.equal(authority.metrics.invalid,0);assert.equal(authority.lag.metrics.rejected,0);
 assert(proxy.metrics.deliveredDelays.some(delay=>delay>=130));
 t.diagnostic(JSON.stringify({configuredRttMs:250,jitterMs:20,authorityRttMs:seat.rtt,
   admittedShotAgeMs:authority.lag.metrics.ages.at(-1),liveShots:authority.lag.metrics.live,
   recoveryFallbacks:authority.lag.metrics.reasons['aged during recovery']||0,acceptedShots:events[1].length}));
});

test('only a valid admission may outlive a 500 ms history window during weapon recovery',()=>{
 const lag=Object.assign(Object.create(LagCompensation.prototype),{
   room:{clock:{elapsedTime:1000}},tickTimes:new Map([[60,650]]),shots:new Map(),
   metrics:{accepted:0,rejected:0,live:0,ages:[],reasons:{}}
 });
 const seat={id:'human',rtt:310,rttAt:999,lifeStartedAt:12,lastShotStamp:0};
 assert.equal(lag.admit(seat,{sampleTick:60},480),null,'already 520 ms old on admission');
 const stamp=lag.admit(seat,{sampleTick:60},550);
 assert.equal(stamp,550,'eligible 450 ms old press');
 lag.room.clock.elapsedTime+=60;
 lag.useAdmittedShot(seat.id,stamp);
 assert.equal(lag.shots.get(seat.id),0,'aged to 510 ms while shouldering; only current-world collision is eligible');
 assert.equal(lag.metrics.live,1);
 assert.equal(lag.metrics.reasons['aged during recovery'],1);
});

test('a coalesced crouch tap and a held cartridge replicate to both seats; control loss drops a live fuse once',{timeout:18000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 let host,peer;
 t.after(async()=>{await Promise.allSettled([host?.leave(),peer?.leave()]);await local.close();});
 const sdk=new Client(local.url,{headers:{Origin:local.url}});
 host=await ready(await sdk.create('private-fps',options));
 peer=await ready(await sdk.joinById(host.roomId,options));
 const room=[...local.rooms][0],seat=room.seats.get(host.sessionId),actor=seat.actor;
 const snapshots=()=>[own(host),peer.state.actors.get(actor.id)];
 Object.assign(actor,{x:20,y:0,z:-18,onGround:true});
 const sprint={forward:1,sprint:true,yaw:Math.PI};
 const start=performance.now();
 while(actor.rushWeight<.78){assert(performance.now()-start<2500);send(host,sprint);await delay(16);}
 const fixed=room.fixedTick,queue=room.inputs.get(host.sessionId);
 let coalesced=false;
 room.fixedTick=function(){
   if(!coalesced && queue.size<2)return;
   fixed.call(this);coalesced=true;
 };
 try{
   send(host,{...sprint,crouch:true,crouchEdge:true});send(host,{crouch:false,crouchEdge:false});
   await until(()=>snapshots().every(a=>a.crouching&&a.handling.slideUntil>0),'both peers observed the crouch tap after release');
   assert.equal(snapshots()[0].handling.slideUntil,snapshots()[1].handling.slideUntil);
 }finally{room.fixedTick=fixed;}
 await until(()=>snapshots().every(a=>a.handling.slideUntil===0),'slide expires on both seats');
 const epochs={lifeId:actor.lifeId,controlEpoch:seat.epoch};
 host.send('select',{slot:'he',serial:1,...epochs});await until(()=>own(host).weapon==='he','normal selection');
 await delay(270);
 const received=[[],[]];
 for(const [i,r] of [host,peer].entries())r.onMessage('events',batch=>received[i].push(...batch.filter(e=>e.actorId===actor.id && ['throw','cartridge-latch'].includes(e.type))));
 send(host,{fire:true,fireEdge:true,holdThrow:true,fireId:1});
 await until(()=>snapshots().every(a=>a.handling.cartridgeFuse>0),'both peers observe live held fuse');
 assert.equal(room.sim.game.state.grenades.length,0);assert.equal(own(host).he,1);
 const deadline=own(host).handling.cartridgeFuse;
 host.send('controls',{enabled:false,...epochs});
 await until(()=>received.every(events=>events.some(e=>e.type==='throw')),'both peers saw the drop');
 const actionId=[actor.id,actor.lifeId,seat.epoch,1].join(':');
 for(const events of received){assert.deepEqual(events.map(e=>e.type),['cartridge-latch','throw']);assert(events.every(e=>e.actionId===actionId));}
 for(const r of [host,peer]){const a=r.state.actors.get(actor.id);assert.equal(a.he,0);assert.equal(a.handling.cartridgeStart,0);assert.equal([...r.state.grenades.values()][0].deadline,deadline);}
 host.send('controls',{enabled:true,...epochs});send(host,{fireId:1,holdThrow:false});
 await delay(75);assert.equal(received[1].length,2);assert.equal(room.metrics.invalid,0);
});

test('interrupting a cartridge with a rifle switch needs a fresh trigger on the authority',{timeout:15000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 let host;
 t.after(async()=>{await host?.leave();await local.close();});
 const sdk=new Client(local.url,{headers:{Origin:local.url}});
 host=await ready(await sdk.create('private-fps',options));
 const room=[...local.rooms][0],seat=room.seats.get(host.sessionId),a=seat.actor;
 await until(()=>Number.isFinite(seat.rttAt),'fresh rewind clock');
 a.inventory.primary=room.sim.game.weaponItem('cr4');
 let serial=0,fireId=0;
 const select=slot=>host.send('select',{slot,serial:++serial,lifeId:a.lifeId,controlEpoch:seat.epoch});
 for(const cook of [false,true]){
   a.inventory.he=1;
   select('he');await until(()=>own(host).weapon==='he','select cartridge');await delay(255);
   send(host,{fire:true,fireId:++fireId,holdThrow:true,fireEdge:true});
   await until(()=>a.cartridge && (!cook||a.cartridge.deadline>0),'cook or early pull');
   select('primary');await until(()=>own(host).weapon==='cr4','select rifle without a trigger release');
   assert.equal(a.waitTriggerRelease,true);
   const ammo=a.inventory.primary.ammo;
   for(let i=0;i<7;i++){
     send(host,{fire:true,fireId:++fireId,holdThrow:false,fireEdge:false});await delay(60);
   }
   assert.equal(a.inventory.primary.ammo,ammo);assert.equal(a.pendingShot,null);
   send(host,{fire:false,holdThrow:false,fireId});await until(()=>!a.waitTriggerRelease,'trigger released');
   send(host,{fire:true,holdThrow:false,fireId:++fireId,fireEdge:true});
   await until(()=>a.inventory.primary.ammo===ammo-1,'a new physical press may fire');
   send(host,{fire:false,holdThrow:false,fireId});
 }
});

test('each firearm spends one authoritative round and both SDK seats see cancellation and empty reloads',{timeout:60000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 let host,observer;
 t.after(async()=>{await Promise.allSettled([host?.leave(),observer?.leave()]);await local.close();});
 const client=new Client(local.url,{headers:{Origin:local.url}});
 host=await ready(await client.create('private-fps',options));observer=await ready(await client.joinById(host.roomId,options));
 const room=[...local.rooms][0],game=room.sim.game,seat=room.seats.get(host.sessionId),actor=seat.actor;
 const peers=[host,observer],received=[[],[]],reloads=[[],[]],proof=[];
 let selection=0,reloadId=0;
 const both=check=>peers.every(peer=>check(peer.state.actors.get(actor.id)));
 const select=slot=>host.send('select',{slot,serial:++selection,lifeId:actor.lifeId,controlEpoch:seat.epoch});
 peers.forEach((peer,i)=>peer.onMessage('events',batch=>{
   for(const event of batch)if(event.actorId===actor.id){
     if(event.type==='shot')received[i].push(event);
     if(event.type==='reload')reloads[i].push({weapon:event.weapon,eventId:event.eventId,time:event.time});
   }
 }));
 await until(()=>Number.isFinite(seat.rttAt),'measured SDK clock');
 const weapons=['p9','p12','cr4','ar47','smg','shotgun','sniper','bazooka'];
 for(const [index,weapon] of weapons.entries()){
   const slot=index<2?'pistol':'primary',fireId=index+1;
   // The private-room loadout is the fixture. Selection, trigger and release all
   // traverse the normal SDK/authority path, including real hit queries.
   actor.inventory[slot]=game.weaponItem(weapon);
   select(slot);
   await until(()=>peers.every(peer=>peer.state.actors.get(actor.id).weapon===weapon),'both seats see '+weapon);
   await until(()=>game.state.time>=actor.nextShot,weapon+' ready on authority');
   const before=game.item(actor).ammo;
   send(host,{fire:true,fireEdge:true,holdThrow:false,fireId,shotYaw:Math.PI,shotPitch:.3});
   send(host,{fire:false,fireEdge:false,holdThrow:false,fireId});
   await until(()=>received.every(events=>events.length>index),weapon+' shot confirmed on both seats');
   const a=received[0][index],b=received[1][index];
   assert.equal(a.weapon,weapon);assert.equal(a.actionId,[actor.id,actor.lifeId,seat.epoch,fireId].join(':'));
   assert.equal(a.actionId,b.actionId);assert.equal(a.eventId,b.eventId);assert.equal(a.tick,b.tick);
   assert.equal(game.item(actor).ammo,before-1);
   await until(()=>peers.every(peer=>peer.state.actors.get(actor.id).ammo===before-1),weapon+' replicated one debit');
   const item=game.item(actor),reserve=item.reserve;
   const reload=()=>send(host,{reloadId:++reloadId,fireId,fire:false,fireEdge:false,holdThrow:false});
   if(before>1){
     reload();
     await until(()=>both(s=>s.weapon===weapon && s.reloadUntil>game.state.time && s.ammo===before-1),weapon+' tactical reload appears on both seats');
     select('knife');
     await until(()=>both(s=>s.weapon==='knife' && !s.reloadUntil),weapon+' reload interrupted on both seats');
     select(slot);
     await until(()=>both(s=>s.weapon===weapon && !s.reloadUntil && s.ammo===before-1 && s.reserve===reserve),weapon+' retains untransferred ammunition');
   }
   // Seed an empty magazine for each family. The SDK starts the reload and
   // the authority's ordinary deadline debits reserve and fills both views.
   item.ammo=0;
   await until(()=>both(s=>s.ammo===0 && s.reserve===reserve),weapon+' empty magazine fixture reached both seats');
   reload();
   await until(()=>both(s=>s.reloadUntil>game.state.time && s.ammo===0),weapon+' empty reload begins');
   await until(()=>both(s=>!s.reloadUntil && s.ammo===before && s.reserve===reserve-before),weapon+' refills at the authority deadline');
   const completed=reloads[0].filter(e=>e.weapon===weapon);
   assert.equal(completed.length,before>1?2:1);
   assert.deepEqual(completed,reloads[1].filter(e=>e.weapon===weapon));
   proof.push({weapon,actionId:a.actionId,eventId:a.eventId,tick:a.tick,ammoBefore:before,ammoAfter:before-1,
     tacticalInterrupted:before>1,emptyRefill:item.ammo,reserveBefore:reserve,reserveAfter:item.reserve,reloadEvents:completed});
 }
 await delay(90);assert(received.every(events=>events.length===weapons.length));assert.equal(room.metrics.invalid,0);
 t.diagnostic(JSON.stringify(proof));
});
