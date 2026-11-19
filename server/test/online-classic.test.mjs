import test from 'node:test';
import assert from 'node:assert/strict';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {options,ready,own,send,until,delay} from './helpers.mjs';
import {glassCrossing} from '../../tools/network-glass-fixture.mjs';

const command=(p,kind,extra={})=>p.send('match',{kind,matchId:p.state.matchId,controlEpoch:own(p).controlEpoch,...extra});
const resume=p=>p.send('controls',{enabled:true,lifeId:own(p).lifeId,controlEpoch:own(p).controlEpoch});
const at=(actor,p)=>Object.assign(actor,{x:p.x,y:0,z:p.z,onGround:true,moving:0});
async function hold(p,condition,label){
 const timer=setInterval(()=>send(p,{interact:true}),35);
 try{await until(condition,label);}finally{clearInterval(timer);send(p,{interact:false});}
}
test('Classic economy, timed objectives, new lives, reserved seats and rematch',{timeout:40000},async t=>{
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}});
 const opts={...options,mode:'classic'};
 const host=await ready(await client.create('private-fps',{...opts,team:'counterAnalysts'}));
 const defender=await ready(await client.joinById(host.roomId,{...opts,team:'analysts'}));
 const r=[...local.rooms][0],g=r.sim.game,a=r.seats.get(host.sessionId).actor,b=r.seats.get(defender.sessionId).actor;
 assert.deepEqual([g.config.buyTime,g.config.roundTime,g.config.bombTime,g.config.plantTime,g.config.defuseTime,g.config.matchWins],[15,120,40,3,5,5]);
 // Compress real time for this scenario. Game still arbitrates every tick and deadline.
 Object.assign(g.config,{plantTime:.6,defuseTime:.4,resultTime:.45,matchWins:2});
 const tdm=await ready(await client.create('private-fps',options));assert.equal(tdm.state.mode,'tdm');assert.equal(own(tdm).primary,'smg');await tdm.leave();
 command(host,'ready',{ready:true});command(defender,'ready',{ready:true});await until(()=>own(host).playerReady&&own(defender).playerReady,'ready');
 command(host,'start');await until(()=>host.state.phase==='active'&&host.state.roundPhase==='buy','round one');
 assert.equal(host.state.round,1);assert.equal(host.state.carrierId,a.id);assert.equal(own(host).primary,'');assert.equal(a.money,800);
 let serial=0;
 const purchase=(item)=>({kind:'buy',item,round:r.state.round,matchId:r.state.matchId,lifeId:a.lifeId,controlEpoch:a.controlEpoch,serial:++serial});
 const notice=[];host.onMessage('notice',m=>notice.push(m));
 async function reject(item,reason){host.send('classic',purchase(item));await until(()=>notice.at(-1)?.includes(reason),reason);}
 await reject('ar47','andra laget');await reject('cr4','krediter');await reject('smoke','kan inte');
 at(a,g.world.anchors.bomb);await reject('he','köpzon');at(a,g.world.anchors[a.team][0]);
 const old=purchase('he');host.send('classic',old);host.send('classic',old);
 await until(()=>own(host).he===1,'one purchase');assert.equal(a.money,500);await reject('he','fullt');
 g.state.buyDeadline=g.state.time;await until(()=>host.state.roundPhase==='active','live');
 await reject('armor','köptiden');resume(host);resume(defender);
 at(a,g.world.anchors.bomb);send(host,{interact:true});await until(()=>a.action?.type==='plant','plant begins');
 await until(()=>!a.action,'input silence cancels hold');assert.equal(g.bomb.status,'carried');
 await hold(host,()=>host.state.bombStatus==='planted','plant from a held control');
 const deadline=g.bomb.deadline;
 const late=await ready(await client.joinById(host.roomId,{...opts,team:'analysts'}));
 assert.equal(late.state.bombDeadline,deadline);assert.equal(own(late).alive,false);assert.equal(g.actors.length,2);
 Object.assign(defender.reconnection,{enabled:true,minUptime:0,minDelay:50,maxDelay:150});
 const epoch=b.controlEpoch;r.seats.get(defender.sessionId).client.ref.terminate();
 await until(()=>own(defender).controlEpoch>epoch,'reconnected');assert.equal(defender.state.bombDeadline,deadline);resume(defender);
 assert(g.damage(a,200,b));assert(!a.alive);
 Object.assign(host.reconnection,{enabled:true,minUptime:0,minDelay:50,maxDelay:150});
 const deadEpoch=a.controlEpoch,deadLife=a.lifeId;r.seats.get(host.sessionId).client.ref.terminate();
 await until(()=>own(host).controlEpoch>deadEpoch,'dead player reconnects');
 assert.equal(own(host).alive,false);assert.equal(a.lifeId,deadLife);assert.equal(a.money,500);
 assert.equal(g.phase,'active');assert.equal(g.bomb.status,'planted');
 at(b,g.bomb);send(defender,{interact:true});await until(()=>b.action?.type==='defuse','defuse begins');send(defender,{interact:false});await until(()=>!b.action,'defuse interrupted');
 await hold(defender,()=>host.state.roundReason==='defuse','defuse completed');
 const prior=a.lifeId;await until(()=>host.state.round===2&&host.state.roundPhase==='buy','next round');
 assert(a.alive&&a.lifeId>prior);assert.equal(own(late).alive,true);assert.equal(g.actors.length,3);
 assert.equal(a.money,1900);assert.equal(a.inventory.he,0);host.send('classic',old);await delay(70);assert.equal(a.money,1900);
 host.send('classic',purchase('smg'));await until(()=>own(host).primary==='smg','earned weapon');
 const crossing=glassCrossing(g.world);g.world.glass.breakAt(crossing.pane.parts[0]);g.onGlassBreak(crossing.pane.id);
 g.state.buyDeadline=g.state.time;g.config.bombTime=1.5;await until(()=>host.state.roundPhase==='active','round two live');
 at(a,g.world.anchors.bomb);resume(host);await hold(host,()=>host.state.bombStatus==='planted','plant again');
 at(b,g.bomb);resume(defender);
 const competing=setInterval(()=>send(defender,{interact:true}),35);
 try{
   await until(()=>b.action?.type==='defuse','competing defuse begins');
   b.action.start=g.bomb.deadline-g.config.defuseTime;
   await until(()=>host.state.roundReason==='detonation','detonation wins tied timestamp');
 }finally{clearInterval(competing);send(defender,{interact:false});}
await until(()=>host.state.round===3,'round three');
 assert.equal(a.inventory.primary.id,'smg');assert.equal(own(host).primaryAmmo,30);assert.equal(host.state.brokenGlass.size,0);assert.equal(g.world.glass.brokenCount,0);
 g.state.buyDeadline=g.state.time;await until(()=>g.phase==='active','round three live');
 // Only positions are arranged. The human acquires each escort, which must move
 // on the Floor 5 graph and enter the rescue zone to count.
 for(const h of g.hostages){
   const rescue=g.world.anchors.rescue;
   const node=g.world.navigation.nodes.find(n=>Math.hypot(n.x-rescue.x,n.z-rescue.z)>rescue.radius+.6&&Math.hypot(n.x-rescue.x,n.z-rescue.z)<rescue.radius+1.3&&g.world.segmentClear({...n,y:.9},{...rescue,y:.9},{vision:false}));
   assert(node);at(h,node);at(a,node);a.x+=.4;
   await hold(host,()=>h.escortId===a.id,'human attaches escort');
   if(h===g.hostages[0]){
     const previous=a.controlEpoch;r.seats.get(host.sessionId).client.ref.terminate();
     await until(()=>own(host).controlEpoch>previous,'escort reconnects');
     assert.equal(host.state.hostages.get(h.id).escortId,'');assert.equal(g.hostages.length,host.state.hostages.size);
     resume(host);await hold(host,()=>h.escortId===a.id,'same hostage can be escorted again');
   }
   at(a,rescue);
   await until(()=>h.rescued,'follower physically reaches zone');assert(h.distanceWalked>.3);
 }
 await until(()=>host.state.phase==='results','match won');assert.equal(host.state.winner,'counterAnalysts');
 command(host,'rematch');await until(()=>host.state.phase==='waiting','rematch');assert.equal(g.state.score.counterAnalysts,0);assert.equal(g.hostages.some(h=>h.rescued),false);
 await Promise.all([host.leave(),defender.leave(),late.leave()]);await until(()=>!local.rooms.size,'room disposed');
});

test('server BotControllers pick up, plant, defuse and lead a physical hostage',{timeout:35000},async t=>{
 const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.05}});t.after(()=>local.close());
 const client=new Client(local.url,{headers:{Origin:local.url}});
 const opts={...options,mode:'classic',fillBots:true};
 const host=await ready(await client.create('private-fps',opts));
 const r=[...local.rooms][0],g=r.sim.game;
 Object.assign(g.config,{buyTime:.3,plantTime:.35,defuseTime:.35,resultTime:.5,botFire:false});
 command(host,'ready',{ready:true});command(host,'start');await until(()=>host.state.phase==='active'&&host.state.roundPhase==='active','solo Classic');
 assert.equal(r.bots.size,9);assert(g.actors.every(a=>!a.inventory.smoke&&!a.inventory.flash));
 const carrier=g.actors.find(a=>a.id===g.bomb.carrierId);
 assert(carrier.bot);const site=g.world.anchors.bomb;
 at(carrier,site);g.select('bomb',carrier);assert(g.drop(carrier));assert.equal(g.bomb.status,'dropped');
 at(carrier,g.world.anchors.counterAnalysts[1]);
 const picker=g.actors.find(a=>a.bot&&a.team===carrier.team&&a!==carrier);
 at(picker,site);await until(()=>g.bomb.carrierId===picker.id,'bot picked up dropped bomb');
 await until(()=>g.bomb.status==='planted','bot completed plant');at(picker,g.world.anchors.counterAnalysts[2]);
 const defender=g.actors.find(a=>a.bot&&a.team==='analysts');
 at(defender,site);await until(()=>host.state.roundReason==='defuse','bot completed defuse');
 await until(()=>host.state.round===2&&host.state.roundPhase==='active','bots entered second round');
 assert(g.actors.some(a=>a.bot&&a.inventory.primary));assert(g.actors.every(a=>!a.inventory.smoke&&!a.inventory.flash));
 const path=g.world.navigation.nodes.filter(n=>{
   const rescue=g.world.anchors.rescue,d=Math.hypot(n.x-rescue.x,n.z-rescue.z);
   return d>rescue.radius+.9&&d<rescue.radius+1.4&&g.world.findPath(n,rescue).length===1;
 });
 assert(path.length);const h=g.hostages[0],escort=g.actors.find(a=>a.bot?.task?.hostageId===h.id);
 assert(escort);
 const start=path.find(n=>g.actors.every(a=>Math.hypot(a.x-n.x,a.z-n.z)>2)&&g.world.canOccupy(n.x,n.z,.25,1.7));
 assert(start);
 const lead=g.world.navigation.nodes.find(n=>Math.hypot(start.x-n.x,start.z-n.z)>.6&&Math.hypot(start.x-n.x,start.z-n.z)<1.2&&
   Math.hypot(n.x-g.world.anchors.rescue.x,n.z-g.world.anchors.rescue.z)<Math.hypot(start.x-g.world.anchors.rescue.x,start.z-g.world.anchors.rescue.z)&&
   g.world.canOccupy(n.x,n.z,.25,1.7)&&g.world.segmentClear({...n,y:1.58},{...start,y:.4},{vision:false}));
 assert(lead);at(h,start);at(escort,lead);
 await until(()=>h.escortId===escort.id,'bot selected and acquired its assigned hostage');
 const late=await ready(await client.joinById(host.roomId,{...opts,team:escort.team}));
 assert.equal(own(late).pending,true);assert.equal(late.state.hostages.get(h.id).escortId,escort.id);
 assert.equal(g.actors.length,10);assert.equal(r.bots.size,9);
 await until(()=>h.rescued,'bot and follower reached rescue',10000);assert(h.distanceWalked>.5);
 g.state.deadline=g.state.time;await until(()=>host.state.round===3&&own(late).alive,'waiting human starts at round boundary');
 assert.equal(r.bots.size,8);assert.equal(g.actors.length,10);assert.equal(own(late).kills,0);assert.equal(own(late).money,800);
 await host.leave();await late.leave();await until(()=>!local.rooms.size,'no lingering AI room');
});
