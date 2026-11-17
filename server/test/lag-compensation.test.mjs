import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';
import {eye,direction} from '../../src/fps/game.mjs';
import {REWIND_MS} from '../../shared/multiplayer/rules.mjs';

async function setup(t){
 const local=await createLocalServer({port:0});t.after(()=>local.close());const c=new Client(local.url,{headers:{Origin:local.url}});
 const a=await ready(await c.create('private-fps',options)),b=await ready(await c.joinById(a.roomId,options));t.after(async()=>{await a.leave();await b.leave();});
 const r=[...local.rooms][0],g=r.sim.game,[shooter,target]=g.actors;
 return {r,g,a,b,shooter,target};
}
function record(r){r.project();r.lag.rewind.record(r.clock.elapsedTime,50);return r.clock.elapsedTime;}

test('bounded Colyseus hitbox rewind hits moving targets without changing live poses or rule time',{timeout:10000},async t=>{
 const {r,g,a,shooter,target}=await setup(t);
 Object.assign(shooter,{x:20,z:-18,y:0,yaw:Math.PI,pitch:0,spawnProtectedUntil:0});
 Object.assign(target,{x:20,z:-16,y:0,spawnProtectedUntil:0});await delay(60);const at=record(r);
 target.x=21.4;await delay(60);record(r);
 const from=eye(shooter),dir=direction(Math.PI),before={x:target.x,hp:target.hp,ammo:shooter.inventory.primary.ammo,time:g.state.time,score:{...g.state.score}};
 assert.equal(g.traceHitscan(shooter,from,dir,20).victim,null,'live target moved off ray');
 r.lag.shots.set(shooter.id,at);
 assert.equal(r.lag.query(shooter,from,dir,20).victim,target,'historical target is hit');
 assert.deepEqual({x:target.x,hp:target.hp,ammo:shooter.inventory.primary.ammo,time:g.state.time,score:{...g.state.score}},before,'query never rewinds rules or live bodies');
 target.x=20;target.height=.9;
 assert.equal(g.traceHitscan(shooter,from,dir,20).victim,null,'current crouched box is below the ray');
 assert.equal(r.lag.query(shooter,from,dir,20).victim,target,'historic standing height is retained');
 target.x=21.4;target.height=1.7;
 // Current-life history cannot be used for a just-respawned body.
 r.state.actors.get(target.id).lifeStartedAt=at+1;
 assert.equal(r.lag.query(shooter,from,dir,20).victim,null);
 const seat=r.seats.get(a.sessionId),frame={sampleTick:r.sim.tickNumber};
 for(const [stamp,reason] of [[NaN,'invalid'],[r.clock.elapsedTime+100,'future'],[r.clock.elapsedTime-REWIND_MS-1,'old']])assert.equal(r.lag.accept(seat,frame,stamp),false,reason);
 assert.equal(r.lag.accept(seat,{sampleTick:0},r.clock.elapsedTime-100),false,'chosen unrelated historic input tick is rejected');
 const started=seat.lifeStartedAt;seat.lifeStartedAt=r.clock.elapsedTime;
 assert.equal(r.lag.accept(seat,frame,r.clock.elapsedTime-50),false,'a current-life counter cannot select a previous-life timestamp');seat.lifeStartedAt=started;
 seat.lastShotStamp=r.clock.elapsedTime;assert.equal(r.lag.accept(seat,frame,r.clock.elapsedTime-50),false,'regressing stamped shot is rejected');
 assert(r.lag.tickTimes.size<=64);
});

test('historical wall, door transitions and elevator shutters use the same collision instant',{timeout:10000},async t=>{
 const {r,g,shooter,target}=await setup(t),w=g.world;
 // Keep the actors away from doors so proximity updates cannot change the fixture.
 Object.assign(shooter,{x:20,z:-18});Object.assign(target,{x:24,z:-15});
 const empty=w.createDynamicContext([]);let fixture;
 for(const d of w.doors.doors){
  const from={x:d.x+d.nx*.6,y:1.2,z:d.z+d.nz*.6},dir={x:-d.nx,y:0,z:-d.nz};
  if(w.withDynamicContext(empty,()=>w.raycast(from,dir,1.2)))continue;
  d.angle=0;w.doors.pose(d);if(w.raycast(from,dir,1.2)){fixture={d,from,dir};break;}
 }
 assert(fixture,'real clear door crossing');const {d,from,dir}=fixture;
 const closed=record(r);d.angle=1.48;d.target=1.48;d.holdUntil=g.state.time+20;w.doors.pose(d);
 await delay(60);const open=record(r);
 r.lag.shots.set(shooter.id,closed);assert(r.lag.query(shooter,from,dir,1.2).wall,'historically closed door blocks despite being open now');
 d.angle=0;d.target=0;w.doors.pose(d);
 r.lag.shots.set(shooter.id,open);assert.equal(r.lag.query(shooter,from,dir,1.2).wall,null,'historically open door allows despite being closed now');
 assert.equal(d.angle,0,'query leaves current door untouched');
 // Walls are static in both contexts, including historic-open door queries.
 let wallFixture;
 for(const box of w.staticBoxes.filter(b=>b.h>1.5&&!b.glassId)){
  const origin={x:box.x+(box.w/2+.2)*(box.cos??1),y:box.y,z:box.z-(box.w/2+.2)*(box.sin??0)};
  const dir={x:-(box.cos??1),y:0,z:box.sin??0};const hit=w.withDynamicContext(empty,()=>w.raycast(origin,dir,2));
  if(hit){wallFixture={origin,dir};break;}
 }
 assert(wallFixture);assert(r.lag.query(shooter,wallFixture.origin,wallFixture.dir,2).wall);
 // Use a ray crossing one actual cabin shutter, no duplicate test geometry.
 w.networkDynamics.elevatorOpenAt=1e9;w.doors.elevators.setProgress(0);await delay(60);const shutterClosed=record(r);
 const box=w.doors.elevators.boxes.find(b=>!b.disabled),origin={x:box.x,y:1.2,z:box.z-.4},ray={x:0,y:0,z:1};
 assert(w.raycast(origin,ray,.8),'closed physical shutter');
 w.doors.elevators.setProgress(1);r.lag.shots.set(shooter.id,shutterClosed);
 assert(r.lag.query(shooter,origin,ray,.8).wall,'historical shutter remains solid');assert.equal(w.doors.elevators.progress,1);
});

test('same-tick lethal hits, duplicate fire and delayed previous-life input retain authoritative scoring',{timeout:12000},async t=>{
 const {r,g,a,b,shooter,target}=await setup(t);
 Object.assign(shooter,{x:20,z:-18,yaw:Math.PI,pitch:0,hp:18,spawnProtectedUntil:0});
 Object.assign(target,{x:20,z:-16,yaw:0,pitch:0,hp:18,spawnProtectedUntil:0});await delay(200);
 // Real reliable inputs queued before the same fixed tick.
 send(a,{fire:true,fireId:1,yaw:Math.PI});send(b,{fire:true,fireId:1,yaw:0});
 await until(()=>!shooter.alive&&!target.alive,'simultaneous lethal hits');
 assert.equal(shooter.kills,1);assert.equal(target.kills,1);assert.deepEqual(g.state.score,{analysts:1,counterAnalysts:1});
 const life=shooter.lifeId,ammo=shooter.inventory.primary.ammo;
 send(a,{fire:true,fireId:1,yaw:Math.PI});await delay(100);assert.equal(shooter.inventory.primary.ammo,ammo);
 await until(()=>shooter.alive&&shooter.lifeId>life,'ordinary respawn');
 send(a,{lifeId:life,fire:true,fireId:2,yaw:Math.PI});await delay(100);assert.equal(shooter.inventory.primary.ammo,30);assert.equal(shooter.kills,1);
 assert(r.lag.metrics.accepted>=2,'both real input stamps passed validation');
});
