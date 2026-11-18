import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';
import {RTT_FRESH_MS} from '../../shared/multiplayer/rules.mjs';
import {recordRtt} from '../lag-compensation.mjs';
const command=(p,kind,extra={})=>p.send('match',{kind,matchId:p.state.matchId,controlEpoch:own(p).controlEpoch,...extra});
async function fixture(t,settings={}){
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.08,...settings}});t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}}),a=await ready(await client.create('private-fps',options));
 const b=await ready(await client.joinById(a.roomId,options));for(const p of [a,b])p.onMessage('notice',()=>{});
 t.after(()=>Promise.allSettled([a.leave(),b.leave()]));const r=[...local.rooms][0];
 return {local,client,a,b,r,g:r.sim.game};
}
async function start(a,b){
 command(a,'ready',{ready:true});command(b,'ready',{ready:true});
 await until(()=>[...a.state.actors.values()].every(x=>x.playerReady),'both ready');
 command(a,'start');command(a,'start');await until(()=>a.state.phase==='active'&&b.state.phase==='active','active');
 for(const p of [a,b])p.send('controls',{enabled:true,lifeId:own(p).lifeId,controlEpoch:own(p).controlEpoch});
}
test('lobby authority, team changes, countdown, score result and same-room rematch reject stale commands',{timeout:15000},async t=>{
 const {a,b,r,g}=await fixture(t,{scoreTarget:1});
 assert.equal(a.state.phase,'waiting','client cannot request a continuous match');
 const initial=own(a),x=initial.x;
 send(a,{forward:1,fire:true,fireId:1});command(a,'start');await delay(100);
 assert.equal(r.state.phase,'waiting');assert.equal(g.actors[0].inventory.primary.ammo,30);assert.equal(own(a).x,x);
 const id=own(b).id;command(b,'team',{team:'analysts'});await until(()=>own(b).team==='analysts','team changed');
 assert.notEqual(own(b).id,id);command(b,'team',{team:'counterAnalysts'});await until(()=>own(b).team==='counterAnalysts','opponent restored');
 await start(a,b);const life=own(a).lifeId,epoch=own(a).controlEpoch,matchId=a.state.matchId;
 // Fire actual reliable inputs into one simultaneous lethal damage batch.
 const [aa,bb]=g.actors;Object.assign(aa,{x:20,z:-18,yaw:Math.PI,hp:18,spawnProtectedUntil:0});Object.assign(bb,{x:20,z:-16,yaw:0,hp:18,spawnProtectedUntil:0});
 await delay(150);send(a,{fire:true,fireId:1,yaw:Math.PI});send(b,{fire:true,fireId:1,yaw:0});
 await until(()=>a.state.phase==='results'&&b.state.phase==='results','results');
 assert.equal(a.state.results,b.state.results);assert.equal(a.state.winner,'draw');
 assert.deepEqual(JSON.parse(a.state.results).score,{analysts:1,counterAnalysts:1});
 const result=a.state.results;command(a,'start');send(a,{fire:true,fireId:2,yaw:Math.PI});await delay(80);assert.equal(a.state.results,result);
 command(a,'rematch');command(b,'rematch');await until(()=>a.state.phase==='waiting'&&a.state.matchId===matchId+1,'one rematch');
 assert.equal(r.state.matchId,matchId+1);assert.equal(g.state.score.analysts,0);assert(g.actors.every(p=>p.hp===100&&p.kills===0&&p.deaths===0));
 command(a,'start',{matchId,controlEpoch:epoch});command(a,'rematch',{matchId});send(a,{lifeId:life,controlEpoch:epoch,fire:true,fireId:999});await delay(100);assert.equal(r.state.phase,'waiting');
 await start(a,b);assert.equal(a.roomId,b.roomId);assert(own(a).lifeId>life);
});
test('time victory and draw, creator departure, late join and a usable remaining room',{timeout:15000},async t=>{
 const {a,b,r,g,client}=await fixture(t,{durationSeconds:.35});
 await start(a,b);g.state.score.analysts=2;
 await until(()=>b.state.phase==='results','time limit');assert.equal(b.state.winner,'analysts');assert.equal(b.state.reason,'time');
 command(b,'rematch');await until(()=>a.state.phase==='waiting','rematch');await start(a,b);
 await until(()=>a.state.phase==='results','draw');assert.equal(a.state.winner,'draw');
 command(b,'rematch');await until(()=>a.state.phase==='waiting','waiting');
 await a.leave();await until(()=>b.state.ownerId===b.sessionId,'owner transfer');
 const c=await ready(await client.joinById(b.roomId,{...options,team:'analysts'}));c.onMessage('notice',()=>{});t.after(()=>c.leave());
 await start(b,c);const late=await ready(await client.joinById(b.roomId,options));late.onMessage('notice',()=>{});t.after(()=>late.leave());
 assert.equal(late.state.phase,'active');assert(own(late).alive);assert.equal(late.state.ownerId,b.sessionId);
});
test('disconnect cancels countdown, preserves creator grace and forfeits only after grace',{timeout:15000},async t=>{
 const {a,b,r}=await fixture(t,{countdownSeconds:5});
 command(a,'ready',{ready:true});command(b,'ready',{ready:true});await until(()=>[...a.state.actors.values()].every(x=>x.playerReady),'ready');command(a,'start');
 await until(()=>a.state.phase==='countdown','countdown');r.clients.find(c=>c.sessionId===a.sessionId).ref.terminate();
 await until(()=>b.state.phase==='waiting','cancelled');assert.equal(r.state.ownerId,a.sessionId);
 // Fast-forward only the trusted clock in this phase-policy unit test.
 r.state.phase='active';r.match.deadline=r.clock.elapsedTime+60000;r.match.beforeTick();assert.equal(r.state.phase,'active');
 r.match.absent.set('analysts',r.clock.elapsedTime-15001);r.match.beforeTick();assert.equal(r.state.phase,'results');assert.equal(r.state.winner,'counterAnalysts');
});
test('missing/stale RTT uses live hits; forged and delayed echoes cannot buy more history',{timeout:10000},async t=>{
 const {r,a}=await fixture(t);const seat=r.seats.get(a.sessionId);
 await delay(160);const frame={sampleTick:r.sim.tickNumber},stamp=r.clock.elapsedTime-100;
 seat.rtt=undefined;seat.rttAt=undefined;
 assert(r.lag.accept(seat,frame,stamp));assert.equal(r.lag.shots.get(seat.id),0);
 recordRtt(seat,20,r.clock.elapsedTime);recordRtt(seat,450,r.clock.elapsedTime);assert.equal(seat.rtt,20);
 seat.rttAt=r.clock.elapsedTime-RTT_FRESH_MS-1;
 assert(r.lag.accept(seat,frame,stamp));assert.equal(r.lag.shots.get(seat.id),0);
 const before=seat.rttAt;a.send('clock-echo','forged');await delay(50);assert.equal(seat.rttAt,before);
 assert.equal(recordRtt(seat,1001,r.clock.elapsedTime),false);assert.equal(recordRtt(seat,NaN,r.clock.elapsedTime),false);
 seat.rtt=310;seat.rttAt=r.clock.elapsedTime;seat.lifeStartedAt=0;seat.lastShotStamp=0;
 const tick=r.sim.tickNumber;r.lag.tickTimes.set(tick,r.clock.elapsedTime-310);
 // Synthetic monotonic room clock permits the measured 250 ms stress budget.
 const old=r.clock.elapsedTime;r.clock.elapsedTime=old+500;r.lag.tickTimes.set(tick,old+190);
 assert(r.lag.accept(seat,{sampleTick:tick},old+90));assert.equal(r.lag.shots.get(seat.id),old+90);
 seat.rtt=20;seat.lastShotStamp=0;recordRtt(seat,450,r.clock.elapsedTime);
 assert(r.lag.accept(seat,{sampleTick:tick},old+90));assert.equal(r.lag.shots.get(seat.id),0,'delayed echo does not enlarge historical allowance');
 r.clock.elapsedTime=old;
});
