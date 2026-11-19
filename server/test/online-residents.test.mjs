import assert from 'node:assert/strict';
import test from 'node:test';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {predictGrenade} from '../../src/fps/grenade-physics.mjs';
import {options, ready, send, own, until, delay} from './helpers.mjs';

const start=(room)=>room.send('match',{kind:'start',matchId:room.state.matchId,controlEpoch:own(room).controlEpoch});
const command=(room,kind,fields={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...fields});
const enable=room=>room.send('controls',{enabled:true,lifeId:own(room).lifeId,controlEpoch:own(room).controlEpoch});
const position=(actor,p)=>Object.assign(actor,{x:p.x,y:p.y||0,z:p.z,onGround:true,spawnProtectedUntil:0});
const lifeMap=room=>Object.fromEntries([...room.state.residents.values()].map(z=>[z.id,z.lifeId]));

test('authority shares the full resident population, actions, rewind, life changes and room options',{timeout:35000},async t=>{
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});
 t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}});
 const opts={...options,fillBots:true};
 const a=await ready(await client.create('private-fps',opts));
 const b=await ready(await client.joinById(a.roomId,opts));
 const room=[...local.rooms][0],g=room.sim.game,player=room.seats.get(a.sessionId).actor;
 const wire=[];
 b.onMessage('events',batch=>wire.push(...batch));
 command(b,'residents',{zombies:true,danceman:true});await delay(120);
 assert.equal(a.state.zombiesEnabled,false);
 command(a,'residents',{zombies:true,danceman:true});
 await until(()=>b.state.zombiesEnabled&&b.state.dancemanEnabled,'owner room settings');
 command(a,'ready',{ready:true});command(b,'ready',{ready:true});
 await until(()=>own(a).playerReady&&own(b).playerReady,'start readiness');
 start(a);
 await until(()=>a.state.phase==='active'&&a.state.residents.size===6&&b.state.residents.size===6,'six residents at full 5v5');
 assert.equal(a.state.actors.size,10);
 assert.deepEqual(lifeMap(a),lifeMap(b));
 const identities=lifeMap(a);
 const dancer=g.state.zombies.find(z=>z.model==='danceman'),sleeping=g.state.zombies.find(z=>z.behavior==='sleeping');
 assert.equal(g.world.roomAt(dancer.x,dancer.z).id,'C08');
 assert.equal(g.state.zombies.filter(z=>z.model!=='danceman'&&!z.aggressive).length,1);
 const eye={x:sleeping.x,y:sleeping.y+.3,z:sleeping.z};
 const ray={x:Math.sin(sleeping.yaw),y:0,z:Math.cos(sleeping.yaw)};
 eye.x-=ray.x*1.1;eye.z-=ray.z*1.1;
 const stamp=room.clock.elapsedTime-45;
 room.lag.shots.set(player.id,stamp);
 assert.equal(room.lag.query(player,eye,ray,2.2).victim,sleeping);
 assert.notEqual(room.lag.query(player,{...eye,y:1.5},ray,2.2).victim,sleeping);
 room.lag.shots.delete(player.id);
 const spot={x:dancer.x,z:dancer.z+1.5};
 assert(g.world.canOccupy(spot.x,spot.z,player.radius,player.height));
 position(player,spot);enable(a);
 let fire=0;
 const score=g.state.score[player.team],kills=player.kills;
 const timer=setInterval(()=>send(a,{yaw:0,pitch:-.21,fire:true,fireId:++fire}),45);
 try{await until(()=>b.state.residents.get(dancer.id).alive===false,'human killed the dancer over the wire');}
 finally{clearInterval(timer);send(a,{fire:false,fireId:fire});}
 assert.equal(player.kills,kills);assert.equal(g.state.score[player.team],score);
 assert(wire.some(event=>event.type==='kill'&&event.actorId===dancer.id&&event.lifeId===dancer.lifeId&&event.sourceId===player.id));
 const late=await ready(await client.joinById(a.roomId,opts));
 assert.equal(late.state.residents.get(dancer.id).alive,false);assert.deepEqual(lifeMap(late),identities);
 Object.assign(b.reconnection,{enabled:true,minUptime:0,minDelay:150});
 room.seats.get(b.sessionId).client.ref.terminate();
 await until(()=>own(b).controlEpoch>1,'observer reconnects');
 assert.deepEqual(lifeMap(b),identities);
 room.match.finish('time');
 await until(()=>a.state.phase==='results','TDM results');
 command(a,'rematch');
 await until(()=>a.state.phase==='waiting'&&a.state.residents.get(dancer.id).alive,'new dancer life for rematch');
 assert(a.state.residents.get(dancer.id).lifeId>identities[dancer.id]);
 room.lag.shots.set(player.id,stamp);
 assert.notEqual(room.lag.query(player,{x:dancer.x,y:1,z:dancer.z+1},{x:0,y:0,z:-1},2).victim?.id,dancer.id);
 await Promise.all([a.leave(),b.leave(),late.leave()]);
});

test('Classic resets residents independently from hostages and permits a dancer-only room',{timeout:16000},async t=>{
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});
 t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}});
 const a=await ready(await client.create('private-fps',{...options,mode:'classic',fillBots:true,danceman:true}));
 const room=[...local.rooms][0],g=room.sim.game;
 Object.assign(g.config,{buyTime:.15,roundTime:2,resultTime:.15,botFire:false});
 command(a,'ready',{ready:true});await until(()=>own(a).playerReady,'ready');
 start(a);
 await until(()=>a.state.phase==='active'&&a.state.residents.size===1,'dancer only');
 assert(a.state.hostages.size>0);assert.equal(a.state.actors.size,10);
 const life=a.state.residents.get('danceman').lifeId;
 await until(()=>a.state.round===2,'round two');
 assert.equal(a.state.residents.size,1);assert(a.state.residents.get('danceman').lifeId>life);
 assert.equal(g.state.zombies.length,1);
 await a.leave();
});

test('real resident AI can wake, be interrupted, kill a player and take knife, bot and HE damage',{timeout:30000},async t=>{
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});
 t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}});
 const a=await ready(await client.create('private-fps',{...options,fillBots:true,zombies:true}));
 const room=[...local.rooms][0],g=room.sim.game,p=room.seats.get(a.sessionId).actor;
 const observed=[];a.onMessage('events',events=>observed.push(...events));
 g.config.botFire=false;
 command(a,'ready',{ready:true});await until(()=>own(a).playerReady,'ready');start(a);
 await until(()=>a.state.phase==='active'&&a.state.residents.size===5,'five zombies only');
 const zombie=g.state.zombies.find(z=>z.id==='zombie-0');
 const {x,z}=zombie;
 position(p,{x,z:z+1.25});p.yaw=0;
 await until(()=>zombie.behavior==='rising','sleeping zombie notices a live player');
 enable(a);
 const attackSpot={x,z:z+.61};position(p,attackSpot);
 await until(()=>zombie.behavior==='attack','first windup');
 const hp=p.hp,firstImpact=zombie.impactAt;
 const pYaw=Math.atan2(p.x-zombie.x,p.z-zombie.z);
 send(a,{yaw:pYaw,pitch:-.45,fire:true,fireId:1});
 await until(()=>['hurt','knockdown'].includes(zombie.behavior),'gunshot cancels windup');
 await until(()=>g.state.time>=firstImpact+.05,'interrupted impact time passes');
 assert.equal(p.hp,hp);
 p.hp=6;
 await until(()=>!p.alive,'next real stomp kills team player',10000);
 await until(()=>observed.some(e=>e.type==='kill'&&e.actorId===p.id&&e.sourceId===zombie.id&&e.sourceLifeId===zombie.lifeId),'correct stomp identity');
 const deadLife=p.lifeId;
 await until(()=>own(a).alive&&p.lifeId>deadLife,'TDM respawn after zombie death');

 // Use a real throw. A downward starting trajectory keeps the explosion
 // near the test position without relocating or detonating the projectile.
 const victim=g.state.zombies.find(q=>q.id==='zombie-2');
 position(p,{x:18,z:-12.3});enable(a);
 const pitch=-1.48, yaw=Math.PI/2;
 const {endpoint}=predictGrenade({...p,yaw,pitch},g.config,g.world);
 const site=g.world.navigation.nodes.find(n=>Math.hypot(n.x-endpoint.x,n.z-endpoint.z)>1.4&&
   Math.hypot(n.x-endpoint.x,n.z-endpoint.z)<2.5&&g.world.canOccupy(n.x,n.z,.22,1.7)&&
   g.world.segmentClear({...endpoint,y:endpoint.y+.08},{...n,y:1},{vision:false}));
 assert(site,'clear explosion fixture');
 position(victim,site);victim.goal=null;victim.path=[];victim.nextSense=g.state.time+10;
 a.send('select',{slot:'he',serial:1,lifeId:p.lifeId,controlEpoch:p.controlEpoch});
 await until(()=>own(a).weapon==='he','selected HE');
 const beforeHE=victim.hp;
 await delay(250);
 send(a,{yaw,pitch,fire:true,fireId:1});
 await until(()=>observed.some(e=>e.type==='throw'&&e.actorId===p.id),'authenticated HE cast');
 await until(()=>victim.hp<beforeHE,'real throw damages resident',6500);

 const spots=[[0,.6],[.6,0],[0,-.6],[-.6,0]];
 const aim=spots.map(([dx,dz])=>{
   const from={x:victim.x+dx,y:p.height-.12,z:victim.z+dz};
   const y=victim.height*.45-from.y;
   const length=Math.hypot(dx,y,dz);
   return {from,dir:{x:-dx/length,y:y/length,z:-dz/length},yaw:Math.atan2(dx,dz),pitch:Math.atan2(y,Math.hypot(dx,dz))};
 }).find(({from,dir})=>g.world.canOccupy(from.x,from.z,p.radius,p.height)&&
   g.traceHitscan(p,from,dir,1.7).victim===victim);
 assert(aim,'unobstructed knife reach against the knockdown hitbox');
 position(p,{x:aim.from.x,z:aim.from.z});enable(a);
 a.send('select',{slot:'knife',serial:2,lifeId:p.lifeId,controlEpoch:p.controlEpoch});
 await until(()=>own(a).weapon==='knife','selected knife');
 const beforeKnife=victim.hp;
 send(a,{fire:false,fireId:1});await until(()=>g.state.time>=p.nextShot,'knife switch cooldown');
 send(a,{yaw:aim.yaw,pitch:aim.pitch,fire:true,fireId:2});
 await until(()=>victim.hp<beforeKnife,'knife hits the resident collider');

 const bot=[...room.bots.values()].find(s=>s.actor.team!==p.team).actor;
 const threat=g.state.zombies.find(q=>q.id==='zombie-4');
 position(threat,{x:18,z:-14});
 position(bot,{x:18,z:-11.6});bot.yaw=0;
 position(p,g.world.anchors[p.team][p.index]);
 // Put the active AI in an ordinary pursuit state within the bot's field of view.
 threat.behavior='pursuing';threat.nextSense=g.state.time+3;threat.goal=null;
 g.config.botFire=true;
 await until(()=>observed.some(e=>e.type==='hit'&&e.actorId===threat.id&&e.sourceId===bot.id),'real BotController fire hits a pursuing resident',5500);
 await a.leave();
});
