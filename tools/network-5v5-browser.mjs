// Two fully rendered Floor 5 clients plus real SDK load peers. Controlled C08
// combat placement is test-only IPC; it is not a map/engine or public endpoint.
import assert from 'node:assert/strict';
import {fork} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {Client} from '../server/node_modules/@colyseus/sdk/build/index.mjs';
import {latencyProxy} from './network-proxy.mjs';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label,timeout=15000){const end=performance.now()+timeout;while(!fn()){assert(performance.now()<end,label);await delay(20);}}
const stats=a=>{const x=a.slice().sort((a,b)=>a-b);if(!x.length)return {n:0,p50:null,p95:null,p99:null,max:null};return {n:x.length,p50:x[Math.floor(x.length*.5)]||0,p95:x[Math.floor(x.length*.95)]||0,p99:x[Math.floor(x.length*.99)]||0,max:x.at(-1)||0};};
const rows=[],errors=[],angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const browserOptions={channel:'chromium',args:['--use-angle='+angle,'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']};
const browsers=await Promise.all([chromium.launch(browserOptions),chromium.launch(browserOptions)]);
const scenarios=process.env.CS2_BROWSER_SCENARIOS?JSON.parse(process.env.CS2_BROWSER_SCENARIOS):[[2,0],[4,0],[10,0],[10,50],[10,100],[10,150],[10,250]];
await mkdir('test-results/pass3b',{recursive:true});
try{for(const [count,rtt] of scenarios){
 const child=fork(new URL('./network-load-server.mjs',import.meta.url),[],{stdio:['ignore','inherit','inherit','ipc'],execArgv:['--expose-gc','--import',new URL('../server/register-shared.mjs',import.meta.url).href]});
 const pending=new Map();let serial=0,exited=false,timer;
 const rpc=(action,options)=>new Promise((resolve,reject)=>{if(exited)return reject(Error('server exited'));const id=++serial;pending.set(id,{resolve,reject});child.send({id,action,options});});
 child.on('message',m=>{const p=pending.get(m.id);pending.delete(m.id);if(p)m.error?p.reject(Error(m.error)):p.resolve(m.result);});
 child.on('exit',()=>{exited=true;for(const p of pending.values())p.reject(Error('server exited'));pending.clear();});
 const info=await rpc('start'),proxy=rtt?await latencyProxy(info.url,{oneWayMs:rtt/2,jitterMs:20}):null,url=proxy?.url||info.url,peers=[],contexts=[],pages=[];
 try{
  for(const browser of browsers){
   const context=await browser.newContext({viewport:{width:960,height:540},deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||1)}),page=await context.newPage();contexts.push(context);pages.push(page);
   page.on('pageerror',e=>errors.push(String(e)));page.setDefaultTimeout(60000);
   await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false})));
   await page.goto(url+'/fps/?network=local&test&realtime');await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden);
   assert(await page.locator('#fatal').isHidden());
  }
  const id=await pages[0].evaluate(async endpoint=>(await __fps.joinNetwork({endpoint,code:'load-123',name:'Rendered A',create:true,fillBots:false})).room.roomId,url);
  await pages[1].evaluate(async({endpoint,id})=>__fps.joinNetwork({endpoint,roomId:id,code:'load-123',name:'Rendered C'}).then(()=>null),{endpoint:url,id});
  if(count===2&&rtt===0){
   await pages[0].evaluate(()=>{const end=performance.now()+4000;while(performance.now()<end){/* intentional main-thread stall */}});
   await pages[0].waitForFunction(()=>performance.now()-__fps.network.lastPatch<200);
   await delay(1200);
   assert.equal(await pages[0].evaluate(()=>__fps.network.metrics.reconnects),0,'render stalls cannot disconnect a healthy socket');
   const cdp=await contexts[0].newCDPSession(pages[0]),before=(await rpc('sample')).rooms[0].tick;
   await cdp.send('Page.setWebLifecycleState',{state:'frozen'});
   await delay(3200);
   assert((await rpc('sample')).rooms[0].tick>before+100,'the remaining match advances while one browser is frozen');
   await cdp.send('Page.setWebLifecycleState',{state:'active'});await cdp.detach();
   await pages[0].waitForFunction(()=>performance.now()-__fps.network.lastPatch<200);
   await delay(1200);
   assert.equal(await pages[0].evaluate(()=>__fps.network.metrics.reconnects),0,'short browser lifecycle suspension retains the session');
   if(await pages[0].evaluate(()=>__fps.modal==='pause'))await pages[0].locator('#resume').click();
   await pages[0].evaluate(()=>{const n=__fps.network;n.metrics.corrections.length=0;n.prediction.world.actor.z+=.5;n.input.data.sampleTick=n.room.state.tick;n.input.send();});
   await pages[0].waitForFunction(()=>__fps.network.metrics.corrections.some(d=>d>.2));
   // This controlled prediction error verifies the SDK's diagnostic is active;
   // it is excluded from the measured window after warmup below.
  }
  const client=new Client(url,{headers:{Origin:url}});
  for(let i=2;i<count;i++){
   const room=await client.joinById(id,{code:'load-123',name:'Protocol '+i,contract:info.contract});room.reconnection.enabled=false;
   room.onMessage('events',()=>{});room.onMessage('problem',m=>{throw Error(m);});room.onMessage('clock-probe',token=>room.send('clock-echo',token));room.send('ready',info.contract);
   const p={room,fire:0,reload:0,life:0};peers.push(p);await until(()=>[...(room.state.actors?.values()||[])].some(a=>a.sessionId===room.sessionId&&a.ready),'protocol ready');
  }
  let next=performance.now();
  function pump(){
   for(const p of peers){const a=[...p.room.state.actors.values()].find(a=>a.sessionId===p.room.sessionId);if(!a?.alive)continue;
    if(p.life!==a.lifeId){p.life=a.lifeId;p.fire=p.reload=0;}
    const enemy=[...p.room.state.actors.values()].find(b=>b.alive&&b.team!==a.team&&b.id.endsWith(a.id.split('-').at(-1)));
    const input=p.room.input({mode:'reliable',renderDelay:100});Object.assign(input.data,{lifeId:a.lifeId,controlEpoch:a.controlEpoch,sampleTick:p.room.state.tick,fireId:++p.fire,reloadId:a.ammo===0?++p.reload:p.reload,
      forward:0,strafe:Math.sin(performance.now()/280+Number(a.id.split('-').at(-1)))*.12,yaw:enemy?Math.atan2(-(enemy.x-a.x),-(enemy.z-a.z)):a.yaw,pitch:0,jump:false,crouch:false,sneak:false,fire:!!enemy});input.send();
   }
   next+=1000/60;if(next<performance.now()-100)next=performance.now();timer=setTimeout(pump,Math.max(0,next-performance.now()));
  }pump();
  for(const p of pages){
   await p.waitForFunction(n=>__fps.game.actors.length===n,count);
   await p.evaluate(()=>{
    window.__combatDriver=setInterval(()=>{const n=__fps.network,a=n.view.player;if(!a?.alive||!n.enabled)return;
      const target=n.view.actors.find(b=>b.team!==a.team&&b.alive&&b.id.endsWith(a.id.split('-').at(-1)));
      __fps.liveControls={strafe:Math.sin(performance.now()/280)*.18,yaw:target?Math.atan2(-(target.x-a.x),-(target.z-a.z)):a.yaw,pitch:0,fire:!!target};
      if(a.inventory.primary.ammo===0)n.view.reload();},16);
   });
  }
  await delay(2500);await rpc('reset');
  const measurements=await Promise.all(pages.map(p=>p.evaluate(async()=>{
   const n=__fps.network,times=[],remoteErrors=[];let last=0;const start=performance.now();
   const shotBaseline={confirmed:n.metrics.confirmedShots,suppressed:n.metrics.suppressedShots};
   for(const k of ['corrections','adoptionDistance','shotLatency','hitLatency'])n.metrics[k].length=0;
   n.metrics.maxPending=n.input.pendingCount;
   while(performance.now()-start<7000){
    const now=await new Promise(requestAnimationFrame);if(last)times.push(now-last);last=now;
    for(const a of n.view.actors)if(!a.isPlayer&&a.alive){const s=n.room.state.actors.get(a.id);remoteErrors.push(Math.hypot(a.x-s.x,a.y-s.y,a.z-s.z));}
   }
   const gl=__fps.renderer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
   return {times,remoteDisplayOffset:remoteErrors,metrics:n.metrics,shotBaseline,sampleStartMs:start,sampleMs:performance.now()-start,actorIds:n.view.actors.map(a=>a.id),teams:n.view.actors.map(a=>a.team),
    allHuman:n.view.actors.every(a=>a.controllerType==='human'&&!a.bot),rtt:n.room.clock.smoothedRtt(),pending:n.input.pendingCount,
    ownId:n.localPlayerId,draws:__fps.renderer.stats.drawCalls,renderer:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),
    fatal:!document.querySelector('#fatal').hidden,score:{...n.view.state.score},phase:n.view.phase,enabled:n.enabled,paused:n.view.state.paused,connection:n.connectionState};
  })));
  // The fixed seven-second timing samples above are already copied out of the
  // browsers. A combat death can put a rendered player in respawn for much of
  // that sample. Keep all ten drivers active while each browser independently
  // proves a fresh authoritative shot and cosmetic deduplication. The deadline
  // is twenty seconds from sample start, including any wait for the other page.
  const shotChecks=await Promise.all(pages.map(async(page,i)=>{
   const m=measurements[i],base=m.shotBaseline;
   const inSample={confirmed:m.metrics.confirmedShots-base.confirmed,suppressed:m.metrics.suppressedShots-base.suppressed};
   if(inSample.confirmed>0&&inSample.suppressed>0)return {passed:true,inSample,total:inSample,extended:false,observationMs:m.sampleMs};
   return page.evaluate(async({base,inSample,start})=>{
    const n=__fps.network,delta=()=>({confirmed:n.metrics.confirmedShots-base.confirmed,suppressed:n.metrics.suppressedShots-base.suppressed});
    let now=performance.now(),total=delta();
    while(now-start<20000){
     if(total.confirmed>0&&total.suppressed>0)return {passed:true,inSample,total,extended:true,observationMs:now-start};
     await new Promise(r=>setTimeout(r,50));now=performance.now();total=delta();
    }
    const a=n.room?.state.actors.get(n.localPlayerId);
    return {passed:false,inSample,total,extended:true,observationMs:now-start,actor:n.localPlayerId,life:a?.lifeId,
     alive:a?.alive,deaths:a?.deaths,ammo:a?.ammo,fireId:n.fireId,sent:n.metrics.sent,cosmetics:n.metrics.cosmeticShots,
     state:n.connectionState,enabled:n.enabled,lastPatchAgeMs:now-n.lastPatch};
   },{base,inSample,start:m.sampleStartMs});
  }));
  if(shotChecks.some(check=>!check.passed)){
   const diagnostic={shotChecks,measurements:measurements.map(({times,remoteDisplayOffset,metrics,...m})=>({...m,frameMs:stats(times),metrics:Object.fromEntries(Object.entries(metrics).map(([k,v])=>[k,Array.isArray(v)?stats(v):v]))})),server:await rpc('sample')};
   console.log('shot failure diagnostics',JSON.stringify(diagnostic));await writeFile('test-results/pass3b/failure.json',JSON.stringify(diagnostic,null,2));
  }
  for(const [i,m] of measurements.entries()){
   assert.equal(m.actorIds.length,count);assert.equal(new Set(m.actorIds).size,count);assert(m.allHuman);assert(!m.fatal);
   assert(shotChecks[i].passed,`${m.ownId} must receive and deduplicate a new authoritative shot within 20 seconds of active combat`);
   assert(m.teams.filter(t=>t==='analysts').length<=5&&m.teams.filter(t=>t==='counterAnalysts').length<=5);
  }
  // Network loss during active fire, real socket; fresh Resume and full snapshot.
  const sid=await pages[0].evaluate(()=>__fps.network.room.sessionId),ownId=measurements[0].ownId;
  await rpc('drop',{room:id,sid});await pages[0].waitForFunction(()=>__fps.network.metrics.reconnects===1);
  assert.equal(await pages[0].evaluate(()=>__fps.network.localPlayerId),ownId);assert.equal(await pages[0].evaluate(()=>__fps.network.enabled),false);
  await pages[0].locator('#resume').click();await pages[0].waitForFunction(()=>__fps.network.enabled);
  // Synthetic background is explicitly distinct from OS process suspension.
  await pages[1].evaluate(()=>window.dispatchEvent(new Event('blur')));assert.equal(await pages[1].evaluate(()=>__fps.network.enabled),false);
  await pages[1].locator('#resume').click();await pages[1].waitForFunction(()=>__fps.network.enabled);
  if(count===10&&rtt===0){
   clearTimeout(timer);for(const p of pages)await p.evaluate(()=>{clearInterval(window.__combatDriver);__fps.liveControls={};});
   await pages[0].waitForFunction(()=>__fps.game.actors.every(a=>a.alive));await delay(500);
   const characters=await pages[0].evaluate(async()=>{
    const {posedBounds}=await import('/src/fps/character-library.mjs?v=6.1.2');
    return __fps.game.actors.map(a=>{const m=__fps.renderer.actors.get(a.id),s=m.userData.avatar,b=posedBounds(s.root).applyMatrix4(s.root.matrixWorld);
     return {id:a.id,alive:a.alive,visible:m.visible,holder:s.holder.visible,root:s.root.visible,scale:s.scale,actor:[a.x,a.y,a.z],min:b.min.toArray(),max:b.max.toArray(),clip:s.activeBase};});
   });
   for(const c of characters.filter(c=>c.visible))assert(c.holder&&c.root&&c.max[1]-c.min[1]>1.3&&c.max[1]-c.min[1]<1.95,'normal standing avatar after respawn/reconnect');
   await writeFile('test-results/pass3b/characters.json',JSON.stringify(characters,null,2)+'\n');
   await pages[0].screenshot({path:'test-results/pass3b/5v5-combat.png'});await pages[0].keyboard.down('Tab');await pages[0].locator('#scoreboard').waitFor();assert.equal(await pages[0].locator('#score-tables tbody tr').count(),10);assert.match(await pages[0].locator('#board-round').textContent(),/5v5/);await pages[0].screenshot({path:'test-results/pass3b/5v5-scoreboard.png'});await pages[0].keyboard.up('Tab');
  }
  const server=await rpc('sample');
  rows.push({status:'PASS',count,rttMs:rtt,jitterMs:rtt?20:0,renderedClients:2,protocolPeers:count-2,placement:'test-only C08 combat fixture',background:count===2&&rtt===0?'4 s main-thread stall, 3.2 s CDP browser lifecycle freeze/resume, synthetic blur':'synthetic blur',transportLoss:'NOT RUN',reconnectionDuringCombat:true,
   shotChecks,client:measurements.map(({times,remoteDisplayOffset,metrics,sampleStartMs,shotBaseline,...m})=>({...m,frameMs:stats(times),fps:times.length*1000/times.reduce((a,b)=>a+b,0),remoteDisplayOffsetM:stats(remoteDisplayOffset),
    ...Object.fromEntries(['corrections','adoptionDistance','shotLatency','hitLatency'].map(k=>[k,stats(metrics[k]||[])])),maxPending:metrics.maxPending,confirmedShots:metrics.confirmedShots,suppressedShots:metrics.suppressedShots})),server,contract:info.contract});
  console.log(JSON.stringify({count,rtt,status:'PASS',shotChecks,fps:rows.at(-1).client.map(m=>m.fps),hitP95:rows.at(-1).client.map(m=>m.hitLatency.p95)}));
 }finally{
  clearTimeout(timer);for(const p of pages)await p.evaluate(()=>{clearInterval(window.__combatDriver);__fps.newMatch();}).catch(()=>{});
  await Promise.allSettled(peers.map(p=>p.room.leave()));await Promise.all(contexts.map(c=>c.close()));await proxy?.close();await rpc('close').catch(()=>{});
 }
 await writeFile('test-results/pass3b/browser-matrix.json',JSON.stringify({rows,errors,environment:{node:process.version,platform:process.platform,angle,viewport:'960x540',dpr:Number(process.env.FPS_NETWORK_DPR||1),physicalDevices:false}},null,2)+'\n');
}}finally{await Promise.all(browsers.map(b=>b.close()));}
assert.deepEqual(errors,[]);
