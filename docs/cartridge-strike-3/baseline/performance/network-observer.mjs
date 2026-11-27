// Baseline-only observer for the two existing test tools, including the forked server process.
// Invoke via NODE_OPTIONS="--import=.../network-observer.mjs". It never changes application modules.
import {registerHooks} from 'node:module';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
function once(source,marker,newValue) {
  if(source.split(marker).length!==2)throw Error('Benchmark source contract changed: '+marker);
  return source.replace(marker,newValue);
}
registerHooks({load(url,context,nextLoad){
  const client=url.endsWith('/tools/network-load.mjs');
  const server=url.endsWith('/tools/network-load-server.mjs');
  if(!client && !server)return nextLoad(url,context);
  let code=readFileSync(fileURLToPath(url),'utf8');
  if(server){
    code=once(code,'({...stats(values),above33:', '({...stats(values),above16_67:values.filter(n=>n>1000/60).length,above33:');
  }else{
    code=once(code,'const pending=new Map();', `let watchShots=false;const sentByActor=new Map(),confirmedDelays=[],suffix=':';
    const percentiles=()=>{const a=[...confirmedDelays].sort((x,y)=>x-y),at=p=>a.length?Math.round(100*a[Math.ceil(p*a.length)-1])/100:null;
    return {n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1)};};
    const pending=new Map();`);
    code=once(code,"room.onMessage('events',events=>{p.shots+=", `room.onMessage('events',events=>{
      if(watchShots)for(const e of events){
        if(e.type==='shot' && e.actorId===own(p)?.id && sentByActor.has(e.actionId)){
          confirmedDelays.push(performance.now()-sentByActor.get(e.actionId));sentByActor.delete(e.actionId);
        }
      }
      p.shots+=`);
    code=once(code,'input.send();maxPending=Math.max', `if(watchShots && input.data.fire){
       const actionKey=[a.id,a.lifeId,a.controlEpoch,input.data.fireId].join(suffix);
       sentByActor.set(actionKey,performance.now());
       if(sentByActor.size>8192)sentByActor.delete(sentByActor.keys().next().value);
    }
    input.send();maxPending=Math.max`);
    code=once(code,'if(weaponLoad){weaponRunStart=', 'watchShots=true;if(weaponLoad){weaponRunStart=');
    code=once(code,'const measured=await rpc(\'sample\');', "watchShots=false;const measured=await rpc('sample');");
    code=once(code,'if(ai){assert.equal(measured.rooms[0].ai,', "if(ai)console.log(JSON.stringify({phase:measured.rooms[0].phase,bots:measured.rooms[0].ai,botShots:measured.botShots,botTravel:measured.botTravel,combatRespawns:measured.combatRespawns,throws:measured.throws,humanShots:peers.map(p=>p.shots)}));if(ai){assert.equal(measured.rooms[0].ai,");
    code=once(code,'measured,baseline,perPlayerOutboundBytesPerSecond:', 'git:process.env.CS3_BENCH_REV,completedAt:new Date().toISOString(),inputToConfirmationMs:percentiles(),measured,baseline,perPlayerOutboundBytesPerSecond:');
  }
  return {shortCircuit:true,format:'module',source:code};
}});
