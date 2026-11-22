// Isolated Pi diagnostic: create ordinary rooms while a different SDK process
// keeps playing. Run: node tools/network-room-startup.mjs
// CS2_BENCH_ROOT optionally points to a different installed release/checkout.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {once} from 'node:events';
import {setTimeout as delay} from 'node:timers/promises';
import {pathToFileURL} from 'node:url';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import {own, send, until} from '../server/test/helpers.mjs';

const root=process.env.CS2_BENCH_ROOT?pathToFileURL(process.env.CS2_BENCH_ROOT+'/'):new URL('../',import.meta.url);
const child=fork(new URL('./network-load-server.mjs',import.meta.url),[],{
  env:{...process.env,CS2_LOAD_AI:'1'},stdio:['ignore','ignore','inherit','ipc'],
  execArgv:['--import',new URL('server/register-shared.mjs',root).href]
});
let serial=0;
async function rpc(action,options){
  const id=++serial,reply=once(child,'message',{signal:AbortSignal.timeout(20000)});
  child.send({id,action,options});
  const [message]=await reply;
  assert.equal(message.id,id);
  if(message.error)throw Error(message.error);
  return message.result;
}

let active,timer;
try{
  const {url,contract,environment}=await rpc('start');
  const blank=await rpc('room-startup');
  const options={code:'probe-room',name:'Active',contract};
  const client=()=>new Client(url,{headers:{Origin:url}});
  const coldStarted=performance.now();
  active=await client().create('private-fps',{...options,mode:'tdm',fillBots:true,zombies:true,danceman:true});
  const coldCreateMs=performance.now()-coldStarted;
  const disconnects=[];
  active.onLeave((code,reason)=>disconnects.push({event:'leave',code,reason}));
  active.onDrop((code,reason)=>disconnects.push({event:'drop',code,reason}));
  active.onMessage('events',()=>{});
  active.onMessage('clock-probe',token=>active.send('clock-echo',token));
  active.send('ready',contract);
  await until(()=>own(active)?.ready,'initial player');
  const command=(kind,extra={})=>active.send('match',{kind,matchId:active.state.matchId,controlEpoch:own(active).controlEpoch,...extra});
  command('ready',{ready:true});
  await until(()=>own(active).playerReady,'player ready');
  command('start');
  await until(()=>active.state.phase==='active','real bot match started',10000);
  // Maintain ordinary reliable input in a separate event loop from the server.
  // Schedule at 60 Hz without replaying missed frames after a client stall.
  let next=performance.now(),epoch;
  function play(){
    const actor=own(active);
    if(!disconnects.length&&actor?.alive){
      if(actor.controlEpoch!==epoch){
        epoch=actor.controlEpoch;
        active.send('controls',{enabled:true,lifeId:actor.lifeId,controlEpoch:epoch});
      }
      send(active,{strafe:.15,yaw:actor.yaw});
    }
    next=Math.max(next+1000/60,performance.now());
    timer=setTimeout(play,Math.max(0,next-performance.now()));
  }
  play();
  await delay(5000);
  let last,maxPatchGap=0;
  active.onStateChange(()=>{
    const now=performance.now();
    if(last!==undefined)maxPatchGap=Math.max(maxPatchGap,now-last);
    last=now;
  });
  await delay(1500);
  const controlPatchGapMs=maxPatchGap,results=[];
  for(let run=0;run<2;run++){
    const before=await rpc('room-startup',{watch:active.roomId});
    assert.equal(before.rooms.find(r=>r.id===active.roomId)?.bots,9);
    maxPatchGap=0;
    const start=performance.now();
    const side=await client().create('private-fps',{...options,name:'Second',mode:'classic',fillBots:false});
    const createMs=performance.now()-start;
    const both=await rpc('room-startup');
    await side.leave();await delay(350);
    const after=await rpc('room-startup');
    results.push({createMs,maxPatchGapMs:maxPatchGap,maxTickIntervalMs:after.maxInterval,
      before,during:both,after,disconnects:[...disconnects]});
    if(disconnects.length||!after.rooms.some(r=>r.id===active.roomId))break;
  }
  console.log(JSON.stringify({environment,contract,blank,coldCreateMs,controlPatchGapMs,results},null,2));
}finally{
  clearTimeout(timer);
  if(active?.connection?.isOpen)await active.leave();
  if(child.connected)await rpc('close');
}
