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
