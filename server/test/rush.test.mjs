import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
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
