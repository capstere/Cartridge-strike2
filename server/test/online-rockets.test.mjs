import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {launchRocket} from '../../src/fps/action-rules.mjs';
import {NetworkSession} from '../../src/fps/network/session.mjs';
import {glassCrossing} from '../../tools/network-glass-fixture.mjs';
import {createLocalServer} from '../local-server.mjs';
import {options, ready, own, send, until, delay} from './helpers.mjs';

const cmd=(room,kind,extra={})=>room.send('match',{kind,matchId:room.state.matchId,controlEpoch:own(room).controlEpoch,...extra});
const weapon=(room,slot,serial)=>room.send('select',{slot,serial,lifeId:own(room).lifeId,controlEpoch:own(room).controlEpoch});
const controls=room=>room.send('controls',{enabled:true,lifeId:own(room).lifeId,controlEpoch:own(room).controlEpoch});
const at=(a,x,z,yaw=0)=>Object.assign(a,{x,y:0,z,yaw,pitch:0,vx:0,vy:0,alive:true,onGround:true,
  hp:100,armor:0,spawnProtectedUntil:0,reloadUntil:0,nextShot:0});

for(const mode of ['classic','tdm'])test(mode+' keeps friendly fire private to the room and rockets authoritative',{timeout:34000},async t=>{
  const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.04}});
  t.after(()=>local.close());
  const client=new Client(local.url,{headers:{Origin:local.url}});
  const a=await ready(await client.create('private-fps',{...options,mode,team:'analysts',name:'Shooter'}));
  const b=await ready(await client.joinById(a.roomId,{...options,team:'analysts',name:'Ally'}));
  const c=await ready(await client.joinById(a.roomId,{...options,team:'counterAnalysts',name:'Enemy'}));
  const backup=await ready(await client.joinById(a.roomId,{...options,team:'counterAnalysts',name:'Second enemy'}));
  const other=await ready(await client.create('private-fps',{...options,mode,fillBots:true}));
  const r=[...local.rooms].find(room=>room.roomId===a.roomId),g=r.sim.game;
  const [shooter,ally,enemy]=[a,b,c].map(room=>r.seats.get(room.sessionId).actor);
  const events=[];
  c.onMessage('events',messages=>events.push(...messages));
  assert.equal(a.state.friendlyFire,false);assert.equal(other.state.friendlyFire,false);
  if(mode==='tdm'){
    const team=own(other).team==='analysts'?'counterAnalysts':'analysts';
    cmd(other,'loadout',{primary:'bazooka'});
    await until(()=>own(other).loadout==='bazooka','launcher selected');
    cmd(other,'team',{team});
    await until(()=>own(other)?.team===team,'changed team');
    assert.equal(own(other).loadout,'bazooka','either team can retain the launcher');
  }
  cmd(b,'friendlyFire',{friendlyFire:true});await delay(80);
  assert.equal(g.config.friendlyFire,false);
  cmd(a,'friendlyFire',{friendlyFire:'true'});await delay(80);
  assert.equal(g.config.friendlyFire,false);
  cmd(a,'friendlyFire',{friendlyFire:true});
  await until(()=>[a,b,c].every(room=>room.state.friendlyFire),'owner setting appears on all peers');
  assert.equal(other.state.friendlyFire,false);
  assert.equal([...local.rooms].find(room=>room.roomId===other.roomId).sim.game.config.friendlyFire,false);
  await other.leave();
  if(mode==='classic'){g.config.buyTime=4;g.config.startMoney=3900;}
  else cmd(a,'loadout',{primary:'bazooka'});
  for(const room of [a,b,c,backup])cmd(room,'ready',{ready:true});
  await until(()=>[a,b,c,backup].every(room=>own(room).playerReady),'ready');
  cmd(a,'start');
  await until(()=>a.state.phase==='active','match runs');
  if(mode==='classic'){
    a.send('classic',{kind:'buy',item:'bazooka',round:a.state.round,matchId:a.state.matchId,lifeId:own(a).lifeId,controlEpoch:own(a).controlEpoch,serial:1});
    await until(()=>own(a).primary==='bazooka','Classic pays for Rocket Launcher');
    assert.equal(own(a).money,300);
    g.state.buyDeadline=g.state.time;
    await until(()=>a.state.roundPhase==='active','buy period ended');
  }
  cmd(a,'friendlyFire',{friendlyFire:false});await delay(80);
  assert.equal(g.config.friendlyFire,true,'active match ignores owner changes');
  assert.equal(own(a).weapon,'bazooka');
  assert.equal(own(a).ammo,1);assert.equal(own(a).reserve,5);
  at(shooter,22.8,-12);at(enemy,22.8,-20);at(ally,22.8,-22);
  for(const room of [a,b,c])controls(room);
  await delay(100);
  const token=own(a).lifeId;
  send(a,{fireId:1,fire:true});
  await until(()=>b.state.projectiles.size===1,'observer receives a live projectile');
  const shot=[...b.state.projectiles.values()][0],startZ=shot.z;
  assert.equal(shot.ownerId,own(a).id);
  assert.equal(shot.ownerLifeId,token);
  assert.equal(shot.team,'analysts');assert.equal(shot.vz,-22);
  assert.equal(enemy.hp,100,'projectile is in flight without an immediate hitscan hit');
  await until(()=>c.state.projectiles.get(shot.id)?.z<startZ-.3,'rocket travels in replicated space');
  await until(()=>events.some(e=>e.type==='rocket-explosion'&&e.rocketId===shot.id),'one shared explosion');
  await until(()=>!own(c).alive,'live rocket kills enemy');
  assert.equal(events.filter(e=>e.type==='rocket-explosion'&&e.rocketId===shot.id).length,1);
  assert.equal(shooter.kills,1);
  if(mode==='classic')assert.equal(shooter.money,300+g.config.killMoney);
  else assert.equal(g.state.score.analysts,1);
  assert.equal(r.state.projectiles.size,0);
  send(a,{fireId:1,reloadId:1});
  await until(()=>own(a).reloadUntil>0,'rocket reload starts');
  await until(()=>own(a).ammo===1&&own(a).reserve===4,'rocket reload finishes',4800);
  weapon(a,'pistol',1);await until(()=>own(a).weapon!=='bazooka','switch away');
  weapon(a,'primary',2);await until(()=>own(a).weapon==='bazooka','reselect rocket launcher');
  verifyDamageRules(g,shooter,ally,enemy);
  verifyRocketObstructions(g,shooter);
  const flight=launchRocket(g,shooter,{x:0,y:0,z:-1});
  assert(g.state.projectiles.includes(flight));
  if(mode==='classic'){
    const round=g.state.round;
    g.state.deadline=g.state.time;
    await until(()=>a.state.roundPhase==='result','Classic ends the round');
    assert.equal(a.state.projectiles.size,0);
    g.state.resultDeadline=g.state.time;
    await until(()=>a.state.round>round,'new Classic round');
    assert.equal(a.state.friendlyFire,true);
  }
  // Exercise the existing room transition rather than modifying the setting.
  r.match.finish('time');
  await until(()=>a.state.phase==='results','result');
  cmd(a,'rematch');
  await until(()=>a.state.matchId===2&&a.state.phase==='waiting','new match');
  assert.equal(a.state.friendlyFire,true);
  assert.equal(g.config.friendlyFire,true);
  assert.equal(a.state.projectiles.size,0);
  await Promise.all([a.leave(),b.leave(),c.leave(),backup.leave()]);
});

function useWeapon(g,a,id){
  a.weapon=id;
  a.nextShot=0;
  if(id==='he')a.inventory.he=1;
  else if(id==='bazooka'||id==='smg')a.inventory.primary=g.weaponItem(id);
  g.pendingDamage=[];
}
function applyDamage(g){
  for(const hit of g.pendingDamage)g.damage(hit.target,hit.amount,hit.source,hit.kind,hit);
  g.pendingDamage=[];
}
function verifyDamageRules(g,source,ally,enemy){
  const money=source.money,kills=source.kills,score=g.state.score[source.team];
  for(const enabled of [false,true]){
    g.config.friendlyFire=enabled;
    for(const item of ['smg','knife','he','bazooka']){
      for(const target of [ally,enemy]){
        at(source,22.8,-12);at(ally,25,-12);at(enemy,25.8,-12);
        const z=item==='knife'?-12.75:item==='bazooka'?-14:-13;
        at(target,22.8,z);
        // Damage still runs through weapon/blast authority. Give each victim
        // enough health to keep the next Classic transition out of this case.
        target.hp=240;
        useWeapon(g,source,item);
        assert(g.fire(source,true));
        if(item==='bazooka'){
          for(let tick=0;tick<14&&g.state.projectiles.length;tick++)g.stepActors();
        }else if(item==='he'){
          const grenade=g.state.grenades.pop();
          assert(grenade);
          g.detonateGrenade({...grenade,x:22.8,y:.4,z});
          applyDamage(g);
        }else applyDamage(g);
        assert.equal(target.hp<240,enabled||target===enemy,item+' friendlyFire='+enabled+' target='+target.team);
      }
    }
    at(source,22.8,-12);at(ally,22.8,-12.6);at(enemy,25,-12);ally.hp=240;
    useWeapon(g,source,'bazooka');assert(g.fire(source,true));
    for(let tick=0;tick<8&&g.state.projectiles.length;tick++)g.stepActors();
    assert.equal(source.alive,false,'the original owner suffers rocket self-damage');
    assert.equal(ally.hp<240,enabled,'nearby teammate follows the room setting');
    if(enabled){
      at(source,22.8,-12);source.hp=240;
      at(ally,22.8,-12.75);ally.hp=1;
      useWeapon(g,source,'knife');assert(g.fire(source,true));applyDamage(g);
      assert.equal(ally.alive,false,'lethal team hit uses ordinary death path');
    }
    assert.equal(source.kills,kills);assert.equal(source.money,money);assert.equal(g.state.score[source.team],score);
  }
  at(source,22.8,-12);at(ally,25,-12);at(enemy,25.8,-12);
}
function verifyRocketObstructions(g,shooter){
  const w=g.world,empty=w.createDynamicContext([]);
  const fixtures=[];
  const pane=glassCrossing(w);
  fixtures.push({from:pane.from,dir:pane.dir,id:pane.pane.id});
  for(const d of w.doors.doors){
    const from={x:d.x+d.nx*.7,y:1.58,z:d.z+d.nz*.7},dir={x:-d.nx,y:0,z:-d.nz};
    if(w.withDynamicContext(empty,()=>w.raycast(from,dir,1.4)))continue;
    d.angle=0;d.target=0;d.holdUntil=-1;w.doors.pose(d);
    if(w.raycast(from,dir,1.4)){fixtures.push({from,dir});break;}
  }
  for(const box of w.staticBoxes.filter(b=>b.h>1.5&&!b.glassId)){
    const from={x:box.x+(box.w/2+.5)*(box.cos??1),y:1.58,z:box.z-(box.w/2+.5)*(box.sin??0)};
    const dir={x:-(box.cos??1),y:0,z:box.sin??0};
    if(w.withDynamicContext(empty,()=>w.raycast(from,dir,1.1))){fixtures.push({from,dir});break;}
  }
  assert.equal(fixtures.length,3);
  const original={x:shooter.x,y:shooter.y,z:shooter.z};
  for(const {from,dir,id} of fixtures){
    const wall=w.raycast(from,dir,1.4);
    assert(wall);
    Object.assign(shooter,{x:from.x,y:from.y-shooter.height+.12,z:from.z});
    const projectile=launchRocket(g,shooter,dir);
    Object.assign(shooter,original);
    for(let tick=0;tick<6&&g.state.projectiles.length;tick++)g.stepActors();
    const hit=g.events.find(e=>e.type==='rocket-explosion'&&e.rocketId===projectile.id);
    assert(hit,'live world surface stops projectile');
    assert(Math.abs(Math.hypot(hit.x-from.x,hit.z-from.z)-(wall.distance-.10))<.15,'rocket travels to the actual blocking surface');
    if(id)assert.equal(w.glass.panes.get(id).broken,false,'offline rocket rule leaves the impacted glass intact');
  }
}

test('a live rocket survives reconnect and preserves its owner after lethal damage and seat reuse',{timeout:23000},async t=>{
  const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.04}});
  t.after(()=>local.close());
  const client=new Client(local.url,{headers:{Origin:local.url}});
  const join=async(id,team,name)=>ready(await client.joinById(id,{...options,team,name}));
  const a=await ready(await client.create('private-fps',{...options,team:'analysts',name:'Original owner'}));
  const b=await join(a.roomId,'analysts','Ally');
  const c=await join(a.roomId,'counterAnalysts','Observer and enemy');
  const r=[...local.rooms][0],g=r.sim.game;
  const [original,ally,enemy]=[a,b,c].map(room=>r.seats.get(room.sessionId).actor);
  const events=[];
  c.onMessage('events',messages=>events.push(...messages));
  cmd(a,'loadout',{primary:'bazooka'});
  for(const p of [a,b,c])cmd(p,'ready',{ready:true});
  await until(()=>[a,b,c].every(p=>own(p).playerReady),'players ready');
  cmd(a,'start');await until(()=>a.state.phase==='active','start');
  at(original,22.8,-12);at(enemy,22.8,-20);at(ally,27,-12);
  controls(a);await delay(75);send(a,{fire:true,fireId:1});
  await until(()=>b.state.projectiles.size===1,'launch before death and leave');
  // Hold simulated time while the test exercises real socket admission.
  g.state.paused=true;
  const rocket=[...b.state.projectiles.values()][0],id=rocket.id,ownerId=rocket.ownerId,life=rocket.ownerLifeId;
  const epoch=own(c).controlEpoch;
  Object.assign(c.reconnection,{enabled:true,minUptime:0,minDelay:150});
  r.seats.get(c.sessionId).client.ref.terminate();
  await until(()=>own(c).connected&&own(c).controlEpoch>epoch,'connected again');
  assert.equal(c.state.projectiles.get(id)?.ownerLifeId,life);
  assert.equal(c.state.friendlyFire,false);
  assert(g.damage(original,200,enemy,'smg'));
  await a.leave();
  const replacement=await join(b.roomId,'analysts','New owner of the seat');
  const substituted=r.seats.get(replacement.sessionId).actor;
  assert.equal(substituted.id,ownerId);
  assert(substituted.lifeId>life);
  assert.equal(replacement.state.projectiles.get(id)?.ownerLifeId,life);
  assert.equal(replacement.state.projectiles.get(id)?.ownerName,'Original owner');
  at(substituted,22.8,-22);g.state.paused=false;
  await until(()=>events.some(e=>e.type==='rocket-explosion'&&e.rocketId===id),'original in-flight rocket hits');
  await until(()=>!own(c).alive,'original owner’s rocket kills enemy');
  const burst=events.find(e=>e.type==='rocket-explosion'&&e.rocketId===id);
  assert.equal(burst.ownerName,'Original owner');assert.equal(burst.ownerLifeId,life);assert.equal(burst.team,'analysts');
  const kill=events.find(e=>e.type==='kill'&&e.actorId===enemy.id);
  assert.equal(kill.sourceId,undefined,'no stale seat gets credited');assert.equal(kill.sourceName,'Original owner');
  assert.equal(substituted.hp,100,'replacement teammate is protected by friendly fire off');
  assert.equal(substituted.kills,0);assert.equal(g.state.score.analysts,1);
  await until(()=>own(c).alive,'enemy resumes after TDM respawn',5000);
  await Promise.all([b.leave(),c.leave(),replacement.leave()]);
});

test('clients retain rocket presentation across control disable and reject old round events',()=>{
  const session=Object.create(NetworkSession.prototype);
  const state={phase:'results',mode:'classic',matchId:7,round:5,
    actors:new Map([['target',{lifeId:9,controlEpoch:3}],['source',{lifeId:2,controlEpoch:6}]]),residents:new Map()};
  Object.assign(session,{room:{state},connectionState:'connected',enabled:false,seenEvent:0,events:[],view:{state:{}}});
  const rocket={matchId:7,round:5,rocketId:'rocket-15'};
  session.receiveEvents([
    {...rocket,eventId:1,type:'rocket-launch',actorId:'departed',lifeId:1},
    {...rocket,eventId:2,type:'rocket-explosion'},
    {...rocket,eventId:3,type:'kill',actorId:'target',lifeId:9,controlEpoch:3,
      sourceId:'source',sourceLifeId:1,sourceControlEpoch:5,sourceName:'Original'},
    {...rocket,eventId:4,round:4,type:'rocket-explosion'}
  ]);
  session.setInputEnabled(false);
  assert.deepEqual(session.events.map(e=>e.type),['rocket-launch','rocket-explosion','kill']);
  assert.equal(session.events.at(-1).sourceId,undefined,'a replacement does not inherit the old rocket hit');
  assert.equal(session.events.at(-1).sourceName,'Original');
  state.phase='active';session.events=[];
  session.receiveEvents([{...rocket,eventId:5,type:'rocket-explosion'}]);
  assert.equal(session.events.length,1,'reconnected peers can receive current rocket effects before resuming input');
  session.resultsAt=1000;state.phase='results';state.time=30;
  session.updateDisplayTime(state,1200);
  assert.equal(session.view.state.time,30.2);
  session.lastPatch=1350;
  session.updateDisplayTime(state,1400);
  assert.equal(session.view.state.time,30.4,'repeat result patches cannot rewind or freeze final effects');
});
