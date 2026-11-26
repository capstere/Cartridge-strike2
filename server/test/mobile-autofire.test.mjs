import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {NetworkSession} from '../../src/fps/network/session.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';

test('mobile trigger pulses produce real authoritative P9 hits and preserve manual semiautomatic hold',{timeout:15000},async t=>{
 const local=await createLocalServer({testMatch:{continuous:true},port:0});
 let a,b;
 t.after(async()=>{await Promise.allSettled([a?.leave(),b?.leave()]);await local.close();});
 const client=new Client(local.url,{headers:{Origin:local.url}});
 a=await ready(await client.create('private-fps',options));
 b=await ready(await client.joinById(a.roomId,options));
 const room=[...local.rooms][0],shooter=room.seats.get(a.sessionId).actor,target=room.seats.get(b.sessionId).actor;
 await until(()=>[...room.seats.values()].every(seat=>Number.isFinite(seat.rttAt)),'fresh server RTT probes');
 Object.assign(shooter,{x:20,y:0,z:-18,yaw:Math.PI,pitch:0,spawnProtectedUntil:0});
 Object.assign(target,{x:20,y:0,z:-16,hp:1000,armor:0,spawnProtectedUntil:0});
 a.send('select',{slot:'pistol',serial:1,lifeId:shooter.lifeId,controlEpoch:shooter.controlEpoch});
 await until(()=>own(a).weapon==='p9','ordinary server weapon selection');
 await delay(250);
 const self=own(a),wire=[],confirmed=[];
 a.onMessage('events',events=>confirmed.push(...events.filter(event=>event.type==='shot'&&event.actorId===shooter.id&&event.weapon==='p9')));
 // Only prediction/rendering are stubbed. advanceFrame creates real trigger
 // edges; the existing SDK stamps and sends them to the unmodified authority.
 const prediction={world:{game:{state:{time:a.state.time}},actor:{x:shooter.x,y:shooter.y,z:shooter.z}}};
 const session=Object.assign(Object.create(NetworkSession.prototype),{
  closed:false,enabled:true,connectionState:'connected',lastPatch:performance.now(),localPlayerId:self.id,lifeId:self.lifeId,controlEpoch:self.controlEpoch,
  room:a,view:{state:{time:a.state.time},actors:[]},prediction,predict:{tick:()=>1},
  world:{doors:{doors:[]}},residents:new Map(),projectiles:new Map(),fireId:0,reloadId:0,trigger:false,nextCosmetic:0,
  events:[],predictedShots:new Map(),actionTimes:new Map(),metrics:{sent:0,cosmeticShots:0,maxPending:0}
 });
 a.onStateChange(()=>{session.lastPatch=performance.now();});
 session.input={data:{},pendingCount:0,send(){
  const frame={...this.data};
  assert.equal(Object.hasOwn(frame,'autoFire'),false,'no auto-fire privilege is sent to the server');
  wire.push(frame);send(a,frame);
 }};
 const step=async controls=>{
  prediction.world.game.state.time=a.state.time;
  session.advanceFrame(performance.now(),{yaw:Math.PI,pitch:0,...controls});
  await delay(17);
 };
 const drive=async(controls,ms)=>{const end=performance.now()+ms;do{await step(controls);}while(performance.now()<end);};
 const initialAmmo=shooter.inventory.pistol.ammo,initialHP=target.hp,start=performance.now();
 while(shooter.inventory.pistol.ammo>initialAmmo-3){
  assert(performance.now()-start<3000,'three automatic shots must be accepted by the real server');
  await step({fire:true,autoFire:true});
 }
 await drive({fire:false},300);
 await until(()=>confirmed.length>=3,'server-confirmed pistol shots');
 assert(shooter.inventory.pistol.ammo<=initialAmmo-3,'authority consumed at least three rounds');
 assert(target.hp<initialHP,'real bullets damaged the opposing player');
 assert(room.lag.metrics.accepted>=3,'normal server shot-stamp checks accepted the pulses');
 const shots=wire.map((frame,index)=>({frame,index})).filter(({frame,index})=>frame.fireId>(wire[index-1]?.fireId||0));
 assert(shots.length>=3);
 for(let i=1;i<shots.length;i++)assert(wire.slice(shots[i-1].index+1,shots[i].index).some(frame=>!frame.fire),'ordinary release separates automatic semiautomatic presses');
 const beforeManual=shooter.inventory.pistol.ammo;
 await drive({fire:true},800);
 assert.equal(shooter.inventory.pistol.ammo,beforeManual-1,'manual held pistol fires only once');
 await drive({fire:false},70);
 await drive({fire:true},100);
 await until(()=>shooter.inventory.pistol.ammo===beforeManual-2,'manual release and new press fire again');
 assert.equal(room.metrics.invalid,0,'all generated inputs passed existing server validation');
});
