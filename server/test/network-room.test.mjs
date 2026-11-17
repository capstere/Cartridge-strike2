import test from 'node:test';
import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
import {ROOM_TYPE,NETWORK_CONFIG} from '../../shared/multiplayer/rules.mjs';
import {WEAPONS} from '../../src/fps/config.mjs';
const options={code:'test-room-123',name:'Player',contract:CONTRACT};
async function until(fn,label){const end=performance.now()+5000;while(!fn()){assert(performance.now()<end,label);await delay(10);}}
async function ready(room){room.reconnection.enabled=false;room.onMessage('events',()=>{});room.onMessage('problem',()=>{});room.onMessage('clock-probe',token=>room.send('clock-echo',token));room.send('ready',CONTRACT);await until(()=>[...(room.state.actors?.values()||[])].some(a=>a.sessionId===room.sessionId&&a.ready),'ready');return room;}
const own=room=>[...room.state.actors.values()].find(a=>a.sessionId===room.sessionId);
function frame(room,overrides={}){return {lifeId:own(room).lifeId,sampleTick:room.state.tick,fireId:0,reloadId:0,forward:0,strafe:0,yaw:0,pitch:0,jump:false,crouch:false,sneak:false,fire:false,...overrides};}
function send(room,values){const input=room.input({mode:'reliable',renderDelay:100});Object.assign(input.data,frame(room,values));input.send();return input;}

test('real private room: admission, two independent humans, authority, life resets and cleanup',{timeout:20000},async t=>{
 const local=await createLocalServer({port:0});t.after(()=>local.close());const client=new Client(local.url,{headers:{Origin:local.url}});
 await assert.rejects(client.create(ROOM_TYPE,{...options,contract:{...CONTRACT,mapHash:'old'}}),/mapHash/);
 await assert.rejects(client.create(ROOM_TYPE,{...options,code:''}),/private code/);
 const a=await client.create(ROOM_TYPE,options);t.after(()=>a.leave());
 await until(()=>a.state.actors?.size===1,'reservation state');
 let authority=[...local.rooms][0];assert.equal(authority.sim.game.actors.length,0,'unready seat has no collision body');
 await assert.rejects(client.joinById(a.roomId,{...options,code:'wrong-code'}),/Incorrect/);
 await ready(a);const b=await ready(await client.joinById(a.roomId,{...options,name:'<img src=x onerror=alert(1)>'}));t.after(()=>b.leave());
 await until(()=>a.state.actors.size===2,'both seats');
 assert.equal(authority.maxClients,10,'capacity is now exercised by the 2/4/10-client suite');
 const g=authority.sim.game;assert.equal(g.actors.length,2);assert(g.actors.every(a=>a.controllerType==='human'&&!a.bot));
 assert.equal(g.hostages.length+g.state.zombies.length+g.state.wanderers.length,0);
 assert(g.actors.every(a=>!a.inventory.pistol&&!a.inventory.knife&&!a.inventory.he&&a.money===0));
 const [x,z]=[own(a).x,own(b).z];
 for(let i=0;i<12;i++){send(a,{strafe:1});send(b,{forward:1,yaw:Math.PI});await delay(17);}
 await until(()=>own(a).x>x+.5&&own(b).z>z+.5,'independent movement');
 const pausedTick=authority.sim.tickNumber;
 a.send('controls',{enabled:false,lifeId:own(a).lifeId});await delay(80);
 const frozen=g.actors.find(p=>p.id===own(a).id).x;
 for(let i=0;i<6;i++){send(a,{strafe:1,fire:true,fireId:i+1});send(b,{forward:1,yaw:Math.PI});await delay(17);}
 assert.equal(g.actors.find(p=>p.id===own(a).id).x,frozen);assert(authority.sim.tickNumber>pausedTick+5);
 a.send('controls',{enabled:true,lifeId:own(a).lifeId});await delay(50);
 const shooter=g.actors.find(p=>p.id===own(a).id),target=g.actors.find(p=>p.id===own(b).id);
 // Controlled combat fixture, using actual map geometry and Game hitboxes.
 Object.assign(shooter,{x:20,z:-18,yaw:0,spawnProtectedUntil:0});Object.assign(target,{x:20,z:-16,spawnProtectedUntil:0});
 const shots=[];a.onMessage('events',events=>shots.push(...events.filter(e=>e.type==='shot')));
 await delay(250);
 const hp=target.hp;send(a,{yaw:Math.PI,fire:true,fireId:20});await until(()=>target.hp<hp,'new input orientation hits on its own tick').catch(e=>{console.error(JSON.stringify({lag:authority.lag.metrics,invalid:authority.metrics.invalid,shooter:shooter.id,stamp:authority.inputs.get(a.sessionId).renderTime,now:authority.clock.elapsedTime}));throw e;});
 const ammo=shooter.inventory.primary.ammo;
 for(let i=0;i<10;i++){send(a,{yaw:Math.PI,fire:true,fireId:20});await delay(17);}
 assert.equal(shooter.inventory.primary.ammo,ammo,'duplicate fire action is idempotent');
 send(a,{reloadId:1});await until(()=>shooter.reloadUntil>0,'reload');
 send(a,{fire:true,fireId:21,yaw:Math.PI,reloadId:1});await delay(80);assert.equal(shooter.inventory.primary.ammo,ammo,'no shooting during reload');
 await until(()=>!shooter.reloadUntil,'reload completed');assert.equal(shooter.inventory.primary.ammo,30);
 for(let i=22;i<34&&target.alive;i++){send(a,{yaw:Math.PI,fire:true,fireId:i,reloadId:1});await delay(95);}
 assert.equal(target.alive,false);assert.equal(shooter.kills,1);assert.equal(target.deaths,1);assert.equal(g.state.score.analysts,1);
 const oldLife=target.lifeId;send(b,{lifeId:oldLife,strafe:1,fire:true,fireId:500});
 await until(()=>target.alive&&target.lifeId>oldLife,'respawn');
 const respawnX=target.x,respawnAmmo=target.inventory.primary.ammo;
 for(let i=0;i<5;i++){send(b,{lifeId:oldLife,strafe:1,fire:true,fireId:501+i});await delay(17);}
 assert.equal(target.x,respawnX);assert.equal(target.inventory.primary.ammo,respawnAmmo);assert.equal(shooter.kills,1);
 const invalid=authority.metrics.invalid;
 send(a,{strafe:NaN});send(a,{forward:Infinity});send(a,{sampleTick:authority.sim.tickNumber+6000});
 await until(()=>authority.metrics.invalid>=invalid+3,'invalid inputs rejected');assert(Number.isFinite(shooter.x));
 send(a,{strafe:1});await delay(50);const stopped=shooter.x;await delay(150);assert.equal(shooter.x,stopped,'silence neutralizes movement');
 const id=a.roomId;await b.leave();await until(()=>authority.seats.size===1,'leave removes body');
 const b2=await ready(await client.joinById(id,options));assert.equal(local.rooms.size,1);assert(own(b2).lifeId>oldLife);await b2.leave();
 assert(authority.metrics.maxQueue<=12);assert(shots.every(e=>e.actionId&&e.tick&&e.lifeId));
 console.log(JSON.stringify({room:'PASS',ticks:authority.sim.tickNumber,metrics:authority.metrics}));
 a.send('damage',{amount:999,actorId:target.id});await until(()=>local.rooms.size===0,'unsupported client damage command disconnects and disposes empty room');assert.equal(target.hp,100);assert.equal(g.state.score.analysts,1);
});

test('two live rooms have independent worlds, cap, dynamic geometry and no leaked HTTP files',{timeout:10000},async t=>{
 const local=await createLocalServer({port:0});t.after(()=>local.close());const c=new Client(local.url,{headers:{Origin:local.url}});
 const a=await ready(await c.create(ROOM_TYPE,options)),b=await ready(await c.create(ROOM_TYPE,options));
 const [r1,r2]=[...local.rooms];assert.notEqual(r1.sim.game.world,r2.sim.game.world);
 for(const r of [r1,r2])assert.equal(r.state.doors.size,51);
 const d=r1.sim.game.world.doors.doors[0];r1.sim.game.world.doors.request(d,r1.sim.game.state.time);await delay(100);
 assert(d.angle>0);assert.equal(r2.sim.game.world.doors.doors[0].angle,0,'room door state is isolated');
 send(a,{strafe:1});await delay(100);assert.notEqual(own(a).x,own(b).x);
 await assert.rejects(c.create(ROOM_TYPE,options),/limit/);assert.equal(local.rooms.size,2);
 assert.equal((await fetch(local.url+'/server/package.json')).status,404);
 assert.equal((await fetch(local.url+'/.env')).status,404);
 assert.equal((await fetch(local.url+'/fps/')).status,200);
 await a.leave();await b.leave();await until(()=>local.rooms.size===0,'both disposed');
});
test('wire bursts cannot accelerate simulation; overflow is bounded and oversized messages disconnect',{timeout:10000},async t=>{
 const local=await createLocalServer({port:0});t.after(()=>local.close());
 const room=await ready(await new Client(local.url,{headers:{Origin:local.url}}).create(ROOM_TYPE,options));
 const authority=[...local.rooms][0],actor=authority.sim.game.actors[0],x=actor.x,startTick=authority.sim.tickNumber,ammo=actor.inventory.primary.ammo;
 const tick=authority.sim.tick.bind(authority.sim),steps=[];let consumed=0;
 authority.sim.tick=frames=>{const x=actor.x,n=authority.sim.tickNumber;consumed+=Number(frames.has(room.sessionId));const result=tick(frames);steps.push({distance:Math.abs(actor.x-x),ticks:authority.sim.tickNumber-n});return result;};
 // Arrival and timer callbacks can interleave. Twelve is the pending queue cap,
 // not a lifetime limit on valid frames consumed across several clock ticks.
 for(let i=1;i<=40;i++)send(room,{strafe:1,fire:true,fireId:i});
 await until(()=>consumed>=2,'fixed ticks consume frames while the burst arrives');
 for(let i=41;i<=80;i++)send(room,{strafe:1,fire:true,fireId:i});
 await until(()=>room.input().lastProcessed>=80,'overflow frames are acknowledged as discarded');
 assert.equal(authority.metrics.maxQueue,12);assert(consumed>12&&consumed<80,'interleaved burst still discards overflow');
 assert(steps.every(s=>s.ticks===1&&s.distance<=NETWORK_CONFIG.runSpeed*NETWORK_CONFIG.fixedStep+.00001),'one shared movement step per tick');
 const ticks=authority.sim.tickNumber-startTick;
 assert(ammo-actor.inventory.primary.ammo<=1+Math.floor(ticks*NETWORK_CONFIG.fixedStep/WEAPONS.smg.interval),'server cadence rejects excess shot actions');
 console.log(JSON.stringify({burst:'PASS',consumed,ticks,meters:actor.x-x,maxQueue:authority.metrics.maxQueue}));
 room.send('controls',{enabled:false,lifeId:actor.lifeId,padding:'x'.repeat(8192)});
 await until(()=>local.rooms.size===0,'transport payload cap releases the room');
});
