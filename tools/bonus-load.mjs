// Bounded ten-socket LAN workload with the same moving human seats in both
// windows. Isolates reward processing from rendering; no production endpoint.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import '../server/register-shared.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {earnBonusKill} from '../src/fps/bonuses.mjs';
import {options,ready,own,send,until,delay} from '../server/test/helpers.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
const server=await createLocalServer({port:0,testMatch:{continuous:true}});
const peers=[],receipts=[];
let pump=null;
function distribution(values){
  const rows=[...values].sort((a,b)=>a-b),at=q=>+rows[Math.min(rows.length-1,Math.floor(q*rows.length))].toFixed(3);
  return {count:rows.length,median:at(.5),p95:at(.95),p99:at(.99),max:at(1)};
}
try{
  const sdk=new Client(server.url,{headers:{Origin:server.url}});
  for(let i=0;i<10;i++){
    const config={...options,team:i%2?'counterAnalysts':'analysts',mapId:'compact-arena',name:'Load '+(i+1)};
    const p=i?await sdk.joinById(peers[0].roomId,config):await sdk.create('private-fps',config);
    const log=[];receipts.push(log);
    p.onMessage('bonusState',msg=>log.push({actor:msg.actorId,samples:msg.samples.length,bytes:Buffer.byteLength(JSON.stringify(msg)),active:msg.bonus.active?.id}));
    peers.push(await ready(p));
  }
  const room=[...server.rooms][0],game=room.sim.game,samples={base:[],uav:[]};
  const old=room.fixedTick;
  let window='base';
  room.fixedTick=function(...args){
    const t=performance.now();
    try{return old.apply(this,args);}finally{if(window)samples[window].push(performance.now()-t);}
  };
  let frames=0;
  pump=setInterval(()=>{
    for(const [i,p] of peers.entries()){
      send(p,{strafe:.3*Math.sin(frames/4+i),yaw:Math.sin(frames/19+i)});
    }
    frames++;
  },50);
  const initial=room.sim.tickNumber;
  await until(()=>room.sim.tickNumber>=initial+240,'240 baseline ticks',8500);
  window=null;
  // Stress setup seeds the threshold through the shared award transition.
  // All ten actual sockets still submit their own scoped activation.
  for(const seat of room.seats.values())for(let n=0;n<3;n++)earnBonusKill(seat.actor.bonus);
  await until(()=>peers.every((p,i)=>receipts[i].length>=2),'all ten received private update');
  window='uav';
  const opened=performance.now();
  for(const p of peers){
    const a=own(p),s=p.state;
    p.send('bonus',{actorId:a.id,slot:1,serial:1,lifeId:a.lifeId,controlEpoch:a.controlEpoch,round:s.round,matchId:s.matchId,worldRevision:s.worldRevision});
  }
  await until(()=>[...room.seats.values()].every(s=>s.actor.bonus.active?.id==='uav'),'ten concurrent effects');
  await until(()=>[...room.seats.values()].every(s=>!s.actor.bonus.active),'all expiries',22000);
  window=null;await delay(130);
  const packets=peers.map((p,i)=>{
    const ownId=own(p).id,log=receipts[i],pulses=log.filter(m=>m.active==='uav');
    assert(log.every(m=>m.actor===ownId));assert.equal(pulses.length,5);
    assert(pulses.every(m=>m.samples===5));
    return {pulses:pulses.length,contacts:pulses.reduce((n,m)=>n+m.samples,0),maxPayloadJsonBytes:Math.max(...pulses.map(m=>m.bytes))};
  });
  assert.equal(room.metrics.drops,0);assert.equal(room.metrics.backpressure,0);
  const report={build:CONTRACT.buildHash,map:room.state.mapId,peers:10,actors:game.actors.length,
    inputs:frames*10,inputHzPerPeer:20,activeWindowSeconds:+((performance.now()-opened)/1000).toFixed(3),
    fixedTickMilliseconds:{baseline:distribution(samples.base),tenUav:distribution(samples.uav)},packets,
    queuePeak:room.metrics.maxQueue,backpressure:room.metrics.backpressure,drops:room.metrics.drops};
  if(process.env.CS3_BONUS_LOAD)await writeFile(process.env.CS3_BONUS_LOAD,JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report));
}finally{
  clearInterval(pump);
  await Promise.allSettled(peers.map(p=>p.leave()));
  await server.close();
}
