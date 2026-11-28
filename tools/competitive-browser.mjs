// Two independent browsers on a disposable HTTPS pilot. The fixture selects the
// score limit and legal deployment positions. Shots, captures, replays, respawns
// and account records all run through their normal simulation and client paths.
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes} from 'node:crypto';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {enterTouchMatch,resumeDesktop,waitForActiveHud} from './network-browser-resume.mjs';

const output=process.env.FPS_COMPETITIVE_EVIDENCE||'test-results/competitive';
const fixture=await startPilotFixture({familyRoom:true,testMatch:{countdownSeconds:.4,durationSeconds:450,scoreTarget:2}});
const pages=[],browsers=[],errors=[];
const native=process.env.CHROMIUM_PATH,angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const driverPath=new URL(import.meta.url);
const runtimeHead=execFileSync('git',['rev-parse','HEAD'],{cwd:new URL('../',driverPath),encoding:'utf8'}).trim();
const driverSha256=createHash('sha256').update(await readFile(driverPath)).digest('hex');
const report={runtimeHead,driverSha256,node:process.version,buildHash:CONTRACT.buildHash,protocol:CONTRACT.protocolVersion,angle,headless:process.env.FPS_NETWORK_HEADED!=='1',desktop:'keyboard and mouse',touch:'Chromium emulated landscape',scenarios:[]};
const code='competitive-'+randomBytes(6).toString('hex');
const progress=s=>console.log('[competitive]',s);
async function until(check,label,ms=45000){
 const end=Date.now()+ms;
 while(!await check()){assert(Date.now()<end,label);await delay(50);}
}
const profile=p=>p.evaluate(async()=>{const j=await (await fetch('/api/account',{cache:'no-store'})).json();
 return {stats:j.stats,weapons:j.progression.weapons,challenges:j.progression.challenges.map(c=>({id:c.id,count:c.count}))};});
const shootPos={x:10.98,y:0,z:11.45,yaw:0,pitch:0},targetPos={x:10.98,y:0,z:7.35,yaw:Math.PI,pitch:0};
async function shot(p,name){await p.screenshot({path:join(output,name+'.jpg'),type:'jpeg',quality:83,timeout:25000});}
// A Playwright still can finish compositing after the three-second respawn.
// Collect real compositor frames during the first shot and select an actual
// scope frame inside the victim's measured replay interval.
async function recordDeath(page){
 const cdp=await page.context().newCDPSession(page),frames=[];
 cdp.on('Page.screencastFrame',e=>{
  cdp.send('Page.screencastFrameAck',{sessionId:e.sessionId}).catch(()=>{});
  if(frames.length<150)frames.push({at:e.metadata.timestamp*1000,jpeg:e.data});
 });
 await cdp.send('Page.startScreencast',{format:'jpeg',quality:84,maxWidth:844,maxHeight:390,everyNthFrame:1});
 return async events=>{
  await cdp.send('Page.stopScreencast');await cdp.detach();
  const first=events.find(e=>e.title==='ELIMINATION REPLAY'&&e.scoped);
  assert(first,'victim showed historical scope');
  // CSS puts a black optic mask around the circular historical viewport.
  // Discard transition frames that still show the ordinary full-width HUD.
  for(const f of frames.filter(f=>f.at>=first.at-60&&f.at<=first.at+2400)){
   const masked=await page.evaluate(async jpeg=>{
    const bytes=Uint8Array.from(atob(jpeg),c=>c.charCodeAt(0));
    const image=await createImageBitmap(new Blob([bytes],{type:'image/jpeg'}));
    const c=new OffscreenCanvas(image.width,image.height),ctx=c.getContext('2d');ctx.drawImage(image,0,0);image.close();
    const maxAt=(x,y)=>Math.max(...ctx.getImageData(Math.floor(x*c.width),Math.floor(y*c.height),1,1).data.slice(0,3));
    return [[.02,.05],[.98,.05],[.02,.93],[.98,.93]].every(([x,y])=>maxAt(x,y)<24)&&
     [[.4,.36],[.5,.45],[.6,.36],[.5,.6]].some(([x,y])=>maxAt(x,y)>45);
   },f.jpeg);
   if(masked){
    await writeFile(join(output,'mobile-scoped-death.jpg'),Buffer.from(f.jpeg,'base64'));
    return {frames:frames.length,scopeOffsetMs:Math.round(f.at-first.at)};
   }
  }
  throw Error('No composited scoped death frame between the reported replay and respawn');
 };
}
async function open(mobile){
 const browser=await chromium.launch({channel:native?undefined:'chromium',executablePath:native||undefined,
  headless:process.env.FPS_NETWORK_HEADED!=='1',args:[...fixture.args,'--use-gl=angle','--use-angle='+angle,
  '--disable-dev-shm-usage','--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',
  ...(process.env.WAYLAND_DISPLAY&&process.env.FPS_NETWORK_HEADED==='1'?['--ozone-platform=wayland']:[])]});
 browsers.push(browser);report.chromium=browser.version();
 const p=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:960,height:600},hasTouch:mobile,isMobile:mobile,
  deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||.75)});
 pages.push(p);p.setDefaultTimeout(90000);
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{
  localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.55,autoReload:false,mobileAutoFire:false}));
  const seen=[];window.competitiveCards=seen;
  document.addEventListener('DOMContentLoaded',()=>{
   const overlay=document.querySelector('#replay-view');
   if(!overlay)return;
   const observer=new MutationObserver(()=>{
    if(overlay.hidden)return;
    const frame={stage:overlay.dataset.stage,title:document.querySelector('#replay-stage').textContent,
     killer:document.querySelector('#replay-killer').textContent,scoped:!overlay.querySelector('.replay-optic').hidden};
    const previous=seen.at(-1);
    if(seen.length<64&&(!previous||Object.keys(frame).some(k=>previous[k]!==frame[k]))){
     seen.push({...frame,at:performance.timeOrigin+performance.now()});
    }
   });
   observer.observe(overlay,{subtree:true,attributes:true,childList:true,characterData:true});
  });
 });
 progress((mobile?'Touch':'Desktop')+' cold account registration');
 await p.goto(fixture.origin+'/profile');
 const card=p.locator('[data-account-profile]'),form=card.locator('form:visible');
 const name=mobile?'Harbor':'Coast';
 await card.getByRole('button',{name:'Create account',exact:true}).click();
 await form.getByLabel('Username').fill('cs3_'+randomBytes(7).toString('hex'));await form.getByLabel('Display name').fill(name);
 await form.getByLabel('Password').fill(randomBytes(22).toString('hex'));
 await form.getByRole('button',{name:'Create account'}).click();
 await card.getByRole('button',{name:'I saved my code'}).click();
 await card.getByRole('heading',{name,exact:true}).waitFor();
 progress(name+' signed in');await p.goto(fixture.origin+'/fps/?network=internet');
 await p.locator('[name=invite]').fill(fixture.invite);await p.locator('button[type=submit]').click();
 await p.locator('#network-name').fill(name);await p.locator('#network-code').fill(code);
 return p;
}
async function observeFeedback(page){
 await page.evaluate(async()=>{
  const {Mesh,Matrix4}=await import('/vendor/three/three.module.js');
  const {AudioSystem}=await import('/src/fps/riposte-audio.mjs');
  const feedback=window.competitiveFeedback={audio:[],marker:[],liveHits:[],warnings:[],batches:{}};
  const replayTitle=()=>{
   const overlay=document.querySelector('#replay-view');
   return overlay&&!overlay.hidden&&overlay.dataset.stage==='replay'?document.querySelector('#replay-stage').textContent:'';
  };
  const after=Mesh.prototype.onAfterRender;
  Mesh.prototype.onAfterRender=function(renderer,scene,camera,geometry,material,...rest){
   if(camera.isOrthographicCamera&&material.color?.getHex()===0xf8ad8c&&material.opacity>0&&
      geometry.attributes.position?.count===24&&replayTitle()&&feedback.marker.length<40){
    feedback.marker.push({title:replayTitle(),opacity:material.opacity,vertices:24});
   }
   if(this.isInstancedMesh&&this.parent?.name==='domination-flags'&&!feedback.batches[geometry.type]){
    const matrix=new Matrix4(),instances=[];
    for(let i=0;i<this.count;i++){
     this.getMatrixAt(i,matrix);const m=matrix.elements;instances.push({x:m[12],y:m[13],z:m[14],scale:Math.hypot(m[0],m[1],m[2])});
    }
    feedback.batches[geometry.type]=instances;
   }
   return after.call(this,renderer,scene,camera,geometry,material,...rest);
  };
  let active=null;
  const play=AudioSystem.prototype.play,start=AudioBufferSourceNode.prototype.start;
  AudioSystem.prototype.play=function(e){
   const title=replayTitle();
   if(title&&e.type==='shot'&&e.weapon==='sniper')active={title,weapon:e.weapon,actor:e.actorId,at:e.time,volume:this.volume};
   try{return play.call(this,e);}finally{active=null;}
  };
  AudioBufferSourceNode.prototype.start=function(...args){
   const result=start.apply(this,args);
   if(active&&this.buffer&&this.context.state==='running')feedback.audio.push({...active,duration:this.buffer.duration});
   return result;
  };
  const marker=document.querySelector('#hitmarker'),warning=document.querySelector('#combat-warning');
  new MutationObserver(()=>{
   const kind=marker.dataset.kind;
   if(kind&&getComputedStyle(marker).opacity!=='0'&&feedback.liveHits.at(-1)!==kind)feedback.liveHits.push(kind);
   if(!warning.hidden&&getComputedStyle(warning).visibility!=='hidden'&&warning.textContent&&feedback.warnings.at(-1)!==warning.textContent)feedback.warnings.push(warning.textContent);
  }).observe(document.querySelector('#hud'),{subtree:true,attributes:true,attributeFilter:['data-kind','style'],childList:true});
 });
}
async function start(host,touch){
 await host.locator('#room-ready').click();await touch.locator('#room-ready').tap();
 await host.locator('#room-start').click();
 await enterTouchMatch(touch);await waitForActiveHud(host);
 if(await host.evaluate(()=>document.pointerLockElement?.id!=='game'))host.aimPoint=(await resumeDesktop(host)).point;
 else host.aimPoint={x:480,y:300};
}
function domLane(game){
 const z=game.state.zones.find(z=>z.id==='B'),w=game.world,dist=p=>Math.hypot(p.x-z.x,p.z-z.z);
 const legal=n=>w.canOccupy(n.x,n.z,.28,1.72,n.y??0);
 const inside=w.navigation.nodes.filter(n=>dist(n)<z.radius-.1&&legal(n)&&w.segmentClear({...n,y:(n.y??0)+.85},{...z,y:z.y+.85},{vision:false}));
 const outside=w.navigation.nodes.filter(n=>dist(n)>z.radius+.65&&dist(n)<z.radius+2&&legal(n));
 for(const start of inside.toSorted((a,b)=>dist(b)-dist(a))){
  const end=outside.find(n=>Math.hypot(n.x-start.x,n.z-start.z)<2.7&&w.navigation.clear(start,n,.24));
  const host=inside.find(n=>Math.hypot(n.x-start.x,n.z-start.z)>1.05);
  if(end&&host)return {z,host,start,end};
 }
 throw Error('No legal two-player capture and walk-out lane.');
}
async function walkOut(page,actor,lane){
 const area=await page.locator('[data-mobile-stick-zone]').boundingBox();assert(area);
 const cdp=await page.context().newCDPSession(page);
 const x=area.x+area.width*.43,y=area.y+area.height*.52;
 const dx=lane.end.x-actor.x,dz=lane.end.z-actor.z,d=Math.hypot(dx,dz);
 const strafe=(dx*Math.cos(actor.yaw)-dz*Math.sin(actor.yaw))/d;
 const forward=(-dx*Math.sin(actor.yaw)-dz*Math.cos(actor.yaw))/d;
 await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:1,x,y}]});
 try{
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{id:1,x:x+strafe*50,y:y-forward*50}]});
  await until(()=>Math.hypot(actor.x-lane.z.x,actor.z-lane.z.z)>lane.z.radius+.2,'real touch stick moved the opponent outside point B',12000);
 }finally{await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
}
try{
 await mkdir(output,{recursive:true});
 const host=await open(false);
 await host.locator('#network-team').selectOption('analysts');
 await host.locator('#network-map').selectOption('compact-arena');await host.locator('#network-mode').selectOption('ffa');
 await host.locator('#network-fill-bots').uncheck();await host.locator('[data-create=true]').click();
 await host.locator('#room-ready').waitFor();const roomId=await host.locator('#network-room').inputValue();
 const touch=await open(true);await touch.locator('#network-team').selectOption('analysts');await touch.locator('#network-room').fill(roomId);await touch.locator('[data-create=false]').tap();
 await touch.locator('#room-ready').waitFor();await until(()=>host.locator('#room-roster tr').count().then(n=>n===2),'both signed accounts in lobby');
 const r=[...fixture.authority.rooms].find(r=>r.roomId===roomId);assert(r);
 const seats=[...r.seats.values()],shooter=seats.find(s=>s.name==='Coast'),victim=seats.find(s=>s.name==='Harbor');
 assert(shooter?.credential?.user&&victim?.credential?.user&&shooter.credential.user!==victim.credential.user);
 const baseline=await Promise.all(pages.map(profile));assert(baseline.every(p=>p.stats.matches===0));
 assert.equal(shooter.actor.team,victim.actor.team,'choose the same uniform for the individual match');
 await Promise.all(pages.map(observeFeedback));
 await host.locator('#room-primary').selectOption('sniper');
 const game=r.sim.game,placed=new WeakMap(),orig=r.sim.tick;let lane,legalRespawn;
 r.sim.tick=function(...args){
  const events=orig.apply(this,args);
  if(!['countdown','active'].includes(r.state.phase))return events;
  for(const seat of [shooter,victim]){
   const a=seat.actor;if(!a?.alive||placed.get(a)===a.lifeId)continue;
   if(seat===victim&&r.state.mode==='ffa'&&a.deaths>0){
    legalRespawn={x:a.x,y:a.y,z:a.z,lifeId:a.lifeId,
     capsuleClear:game.world.canOccupy(a.x,a.z,a.radius,a.height,a.y),
     overlaps:game.actors.some(p=>p!==a&&p.alive&&Math.hypot(p.x-a.x,p.z-a.z)<p.radius+a.radius)};
    assert(legalRespawn.capsuleClear&&!legalRespawn.overlaps,'actual respawn before fixture deployment');
   }
   placed.set(a,a.lifeId);
   const position=r.state.mode==='ffa'?(seat===shooter?shootPos:targetPos):
    (seat===shooter?lane.host:lane.start);
   assert(game.world.canOccupy(position.x,position.z,a.radius,a.height,position.y??0));
   const yaw=r.state.mode==='dom'?Math.atan2(position.x-lane.z.x,position.z-lane.z.z):position.yaw;
   Object.assign(a,{x:position.x,y:position.y??0,z:position.z,yaw,pitch:0});
  }
  return events;
 };
 progress('FFA deployment');await start(host,touch);
 for(const p of pages)await p.locator('#round-label').filter({hasText:'FREE-FOR-ALL'}).waitFor();
 report.clients=await Promise.all(pages.map(p=>p.evaluate(()=>{
  const c=document.querySelector('#game'),gl=c.getContext('webgl2'),info=gl?.getExtension('WEBGL_debug_renderer_info');
  return {viewport:[innerWidth,innerHeight],framebuffer:[c.width,c.height],renderer:info?gl.getParameter(info.UNMASKED_RENDERER_WEBGL):null};
 })));
 assert(report.clients.every(c=>c.framebuffer.every(n=>n>0)),'two live framebuffers');
 await host.keyboard.down('Tab');await host.locator('#board-round').filter({hasText:'FREE-FOR-ALL'}).waitFor();
 await shot(host,'ffa-scoreboard');await host.keyboard.up('Tab');
 const compactScore=await touch.locator('.score').evaluateAll(rows=>rows.map(row=>getComputedStyle(row.querySelector(':scope>span'),'::before').content.replaceAll('"','')));
 assert(compactScore.includes('YOU')&&compactScore.includes('LEADER'),'compact FFA uses individual labels');
 assert.equal(await host.locator('.team-radio-hint:visible').count(),0,'FFA has no team-radio hint');
 const oldLife=victim.actor.lifeId;
 const scope=async()=>{
  await host.mouse.down({button:'right'});
  await until(()=>shooter.actor.aimAmount>.95,'normal right mouse reached rifle scope');
  const began=game.state.time;await until(()=>game.state.time-began>3,'scoped history collected');
 };
 async function eliminate(number){
  const a=shooter.actor,b=victim.actor;
  assert(a.weapon==='sniper'&&b.alive&&game.state.time>=b.spawnProtectedUntil);
  // Read the authoritative view direction and adjust the locked pointer until the ordinary shot ray is on target.
  const ammo=a.inventory.primary.ammo,untilAt=Date.now()+18000;
  let lastFire=-Infinity;
  while(a.kills<number&&Date.now()<untilAt){
   const yaw=Math.atan2(-(b.x-a.x),-(b.z-a.z)),pitch=Math.atan2(b.y+b.height*.91-a.y-a.height+.12,Math.hypot(b.x-a.x,b.z-a.z));
   const dyaw=Math.atan2(Math.sin(a.yaw-yaw),Math.cos(a.yaw-yaw)),dpitch=a.pitch-pitch;
   if(Math.abs(dyaw)<.018&&Math.abs(dpitch)<.018&&game.state.time-lastFire>1.6){
    await host.mouse.down();await delay(150);await host.mouse.up();lastFire=game.state.time;
   }else{
    const scale=.0022*(.35+.65*24/76);
    host.aimPoint.x+=Math.max(-320,Math.min(320,dyaw/scale));
    host.aimPoint.y+=Math.max(-140,Math.min(140,dpitch/scale));
    await host.mouse.move(host.aimPoint.x,host.aimPoint.y);
   }
   await delay(120);
  }
  assert.equal(a.kills,number,'scoped firearm input; '+JSON.stringify({yaw:a.yaw,pitch:a.pitch,ammo:a.inventory.primary.ammo,hp:b.hp,
   source:[a.x,a.y,a.z],target:[b.x,b.y,b.z],protected:b.spawnProtectedUntil,at:game.state.time}));
  assert(a.inventory.primary.ammo<ammo,'server consumed a real round');
 }
 await scope();const finishDeath=await recordDeath(touch);await eliminate(1);
 await touch.locator('#replay-view[data-stage=replay] .replay-optic:visible').waitFor({timeout:10000});
 await until(()=>victim.actor.alive&&victim.actor.lifeId>oldLife,'server respawn');
 await touch.locator('#replay-view').waitFor({state:'hidden'});
 assert(game.world.canOccupy(victim.actor.x,victim.actor.z,victim.actor.radius,victim.actor.height,victim.actor.y));
 const first=await touch.evaluate(()=>window.competitiveCards);
 const deathCapture=await finishDeath(first);
 assert(first.some(f=>f.stage==='card'&&f.killer==='Coast')&&first.some(f=>f.stage==='replay'&&f.scoped));
 assert.equal((await host.evaluate(()=>window.competitiveCards)).length,0,'private death replay reached only the victim');
 await host.mouse.up({button:'right'});await scope();await eliminate(2);await host.mouse.up({button:'right'});
 await until(()=>r.state.phase==='results','FFA ended at individual limit');
 for(const p of pages)await until(()=>p.evaluate(()=>window.competitiveCards.some(f=>f.title==='FINAL ELIMINATION'&&f.scoped)),'both browsers actually rendered the scoped final');
 await shot(host,'desktop-final');
 for(const p of pages)await until(()=>p.evaluate(()=>window.competitiveFeedback.marker.some(e=>e.title==='FINAL ELIMINATION')&&
  window.competitiveFeedback.audio.some(e=>e.title==='FINAL ELIMINATION')),'normal final replay drew the terminal marker and started a real sniper buffer',9000);
 const feedback=await Promise.all(pages.map(p=>p.evaluate(()=>window.competitiveFeedback)));
 assert(feedback[0].liveHits.includes('kill')&&!feedback[0].warnings.some(w=>w.includes('FRIENDLY FIRE')),'same-uniform opponent receives hostile hit feedback');
 for(const f of feedback)assert.equal(f.audio.filter(e=>e.title==='FINAL ELIMINATION').length,1,'one historical gun sound per finishing shot');
 assert(feedback[1].marker.some(e=>e.title==='ELIMINATION REPLAY'),'victim saw the confirmed marker before legal respawn');
 for(const p of pages){
  if(await p.locator('#replay-skip').isVisible())await p.locator('#replay-skip').click();
  await p.locator('#room-earned').filter({hasText:'Account rewards'}).waitFor();
 }
 const scores=await Promise.all(pages.map(profile)),credits=await Promise.all(pages.map(p=>p.locator('#room-earned').innerText()));
 assert.equal(scores[0].stats.matches,1);assert.equal(scores[0].stats.kills,2);assert.equal(scores[0].stats.wins,1);
 assert(scores[0].stats.xp>=45&&scores[0].weapons.find(w=>w.id==='sniper')?.xp>=200);
 assert.equal(scores[1].stats.kills,0);assert.equal(scores[1].stats.deaths,2);assert.equal(scores[1].stats.xp,0);
 for(const [i,label] of credits.entries())assert(label.includes(scores[i].stats.xp+' XP'));
 for(const p of pages)assert(await p.locator('#room-earned').evaluate(e=>{const r=e.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight;}),'personal result is in the initial viewport');
 await shot(touch,'mobile-ffa-results');
 report.scenarios.push({mode:'ffa',map:r.state.mapId,uniform:shooter.actor.team,feedback,deathCapture,deathFrames:first,finalFrames:await Promise.all(pages.map(p=>p.evaluate(()=>window.competitiveCards.filter(f=>f.title==='FINAL ELIMINATION')))),credits,profiles:scores,oldLife,respawnLife:victim.actor.lifeId,legalRespawn});
 progress('Domination rematch');
 await host.locator('#room-rematch').click();await host.locator('#room-ready').waitFor();await host.locator('#room-mode').selectOption('dom');
 await until(()=>r.state.mode==='dom','same room adopted Domination');
 if(shooter.actor.team===victim.actor.team)await touch.locator('#room-team').selectOption(shooter.actor.team==='analysts'?'counterAnalysts':'analysts');
 lane=domLane(game);await start(host,touch);
 for(const p of pages){
  await p.locator('#round-label').filter({hasText:'DOMINATION'}).waitFor();
  await p.locator('#zone-control span').filter({hasText:'BContested'}).waitFor();
 }
 const flags=await Promise.all(pages.map(p=>p.evaluate(()=>window.competitiveFeedback.batches)));
 for(const drawing of flags)for(const shape of ['RingGeometry','CylinderGeometry','PlaneGeometry']){
  assert.equal(drawing[shape]?.length,3,'all three '+shape+' instances actually drawn');
  for(const [i,instance] of drawing[shape].entries()){
   const z=game.state.zones[i];assert(Math.hypot(instance.x-z.x,instance.z-z.z)<.01);
   if(shape==='RingGeometry')assert(Math.abs(instance.scale-z.radius)<.01,'the drawn circumference uses the authoritative capture radius');
  }
 }
 await shot(touch,'mobile-contested');
 const at={x:victim.actor.x,z:victim.actor.z};await walkOut(touch,victim.actor,lane);
 for(const p of pages)await p.locator('#zone-control span').filter({hasText:'BCapturing'}).waitFor();
 await until(()=>game.state.zones[1].owner===shooter.actor.team,'uninterrupted authority capture');
 await host.locator('#zone-control span').filter({hasText:'BHeld'}).waitFor();
 await touch.locator('#zone-control span').filter({hasText:'BEnemy'}).waitFor();
 await shot(host,'desktop-held');
 await until(()=>r.state.phase==='results','two real held-point score ticks');
 for(const p of pages)await p.locator('#room-result-summary').filter({hasText:/2 – 0|0 – 2/}).waitFor();
 await shot(host,'desktop-dom-results');await shot(touch,'mobile-dom-results');
 const domProfiles=await Promise.all(pages.map(profile));
 assert.equal(domProfiles[0].stats.matches,2);assert.equal(domProfiles[0].stats.kills,2);assert.equal(domProfiles[0].stats.wins,2);
 assert.equal(domProfiles[0].challenges.find(c=>c.id==='vDom')?.count,1);assert.equal(domProfiles[1].stats.matches,2);
 assert.equal(r.state.winner,shooter.actor.team);
 report.scenarios.push({mode:'dom',map:r.state.mapId,flags,walked:Math.hypot(victim.actor.x-at.x,victim.actor.z-at.z),
  results:JSON.parse(r.state.results),credits:await Promise.all(pages.map(p=>p.locator('#room-earned').innerText())),profiles:domProfiles});
 assert.deepEqual(errors,[]);report.passed=true;
}finally{
 report.pageErrors=errors;
 if(!report.passed)for(const [i,p] of pages.entries())if(await p.locator('#hud').count())await shot(p,'interrupted-'+i).catch(()=>{});
 await writeFile(join(output,'report.json'),JSON.stringify(report,null,2)+'\n');
 for(const browser of browsers.reverse())await browser.close().catch(()=>{});
 await fixture.close();
}
