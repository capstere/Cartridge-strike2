// Two rendered, independently authenticated clients using the shipped UI.
// Only the isolated server's match duration/target and spawn placement are fixtures.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {startPilotFixture} from './network-pilot-fixture.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';
const fixture=await startPilotFixture({testMatch:{durationSeconds:45,scoreTarget:2,countdownSeconds:.3}});
const browsers=[],pages=[],errors=[],observed=new Map();let placing;
async function until(fn,label,timeout=25000){const end=performance.now()+timeout;while(!await fn()){assert(performance.now()<end,label);await delay(30);}}
async function open(mobile,room=''){
 const browser=await chromium.launch({channel:'chromium',executablePath:process.env.CHROMIUM_PATH||undefined,args:[...fixture.args,'--use-angle='+(process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader')),'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});browsers.push(browser);
 const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:960,height:540},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:.75});
 const page=await context.newPage();pages.push(page);page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.name));
 await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0,autoReload:false,mobileAutoFire:false})));
 await page.goto(fixture.origin+(room?'/fps/?network=internet&room='+room:''));await page.locator('[name=invite]').fill(' '+fixture.invite+' ');await page.locator('button[type=submit]').click();
 await page.locator('#network-name').waitFor();return page;
}
async function roomRead(page){
 const cdp=await page.context().newCDPSession(page);
 const {result:proto}=await cdp.send('Runtime.evaluate',{expression:'Colyseus.Room.prototype'});
 const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:proto.objectId});
 const {result}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,functionDeclaration:'function(){return Array.from(this).find(r=>r.connection?.isOpen&&r.state?.actors?.size)}'});
 assert(result.objectId);
 return async()=>{
  const {result:value,exceptionDetails}=await cdp.send('Runtime.callFunctionOn',{objectId:result.objectId,returnByValue:true,functionDeclaration:`function(){return {phase:this.state.phase,matchId:this.state.matchId,results:this.state.results,room:this.roomId,players:[...this.state.actors.values()].map(a=>({id:a.id,team:a.team,alive:a.alive,hp:a.hp,life:a.lifeId,kills:a.kills,deaths:a.deaths,ammo:a.ammo,x:a.x,z:a.z,yaw:a.yaw,pitch:a.pitch,protectedUntil:a.spawnProtectedUntil,time:this.state.time}))}}`});
  assert(!exceptionDetails);return value.value;
 };
}
async function readyAndStart(host,friend){
 await host.locator('#room-ready').click();await friend.locator('#room-ready').tap();await host.locator('#room-start').click();
 await host.locator('#resume').waitFor({state:'visible'});await friend.locator('#resume').tap();host.aimPoint=(await resumeDesktop(host)).point;
}
try{
 const host=await open(false);
 await host.locator('#network-name').fill('Host');await host.locator('#network-team').selectOption('analysts');await host.locator('#network-code').fill('browser-match-123');
 await host.locator('[data-create=true]').click();await host.locator('#room-ready').waitFor();const roomId=await host.locator('#network-room').inputValue();
 const friend=await open(true,roomId);assert.equal(await friend.locator('#network-room').inputValue(),roomId,'shared room survived authentication');
 await friend.locator('#network-name').fill('Friend');await friend.locator('#network-team').selectOption('counterAnalysts');await friend.locator('#network-code').fill('browser-match-123');
 await friend.locator('[data-create=false]').click();await friend.locator('#room-ready').waitFor();
 await until(async()=>await host.locator('#room-roster tr').count()===2,'two-player roster');
 await mkdir('test-results/online',{recursive:true});
 await friend.screenshot({path:'test-results/online/mobile-lobby.png'});
 const r=[...fixture.authority.rooms][0];
 // Place only new lives, before the authority projects them. No damage/score writes.
 const original=r.sim.tick;
 r.sim.tick=function(...args){
  const events=original.apply(this,args);
  for(const a of r.sim.game.actors){if(observed.get(a.id)===a.lifeId)continue;observed.set(a.id,a.lifeId);
   Object.assign(a,{x:20,y:0,z:a.team==='analysts'?-16:-18,yaw:a.team==='analysts'?0:Math.PI,pitch:0});
   assert(r.sim.game.world.canOccupy(a.x,a.z,a.radius,a.height,0));
  }return events;
 };
 const readHost=await roomRead(host),readFriend=await roomRead(friend);
 // Exercise changing team and back: prediction/controller identity must remain usable.
 await friend.locator('#room-team').selectOption('analysts');await until(async()=> (await readFriend()).players.every(a=>a.team==='analysts'),'team change');
 await friend.locator('#room-team').selectOption('counterAnalysts');await until(async()=> (await readFriend()).players.some(a=>a.team==='counterAnalysts'),'restore team');
 await readyAndStart(host,friend);
 const positions=(await readHost()).players;
 const movedTeam=async team=>{const a=(await readHost()).players.find(a=>a.team===team),before=positions.find(b=>b.id===a.id);return Math.hypot(a.x-before.x,a.z-before.z)>.15;};
 await host.keyboard.down('w');try{await until(()=>movedTeam('analysts'),'desktop movement');}finally{await host.keyboard.up('w');}
 const zone=await friend.locator('[data-mobile-stick-zone]').boundingBox();
 const contact={id:1,x:zone.x+zone.width*.35,y:zone.y+zone.height*.7};
 const touch=await friend.context().newCDPSession(friend);
 await touch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[contact]});
 await touch.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...contact,y:contact.y-42}]});
 try{await until(()=>movedTeam('counterAnalysts'),'touch movement');}finally{await touch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await touch.detach();}
 const fireButton=await friend.locator('[data-mobile-action=fire]').boundingBox(),fireTouch=await friend.context().newCDPSession(friend);
 await fireTouch.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{id:2,x:fireButton.x+fireButton.width/2,y:fireButton.y+fireButton.height/2}]});
 try{await until(async()=> (await readHost()).players.find(a=>a.team==='counterAnalysts').ammo<30,'touch fire replicated to host');}
 finally{await fireTouch.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await fireTouch.detach();}
 async function fireUntil(check,label){
  const end=performance.now()+30000;
  while(!await check()){
   assert(performance.now()<end,label);const snapshot=await readHost();if(snapshot.phase!=='active')break;
   const a=snapshot.players.find(p=>p.team==='analysts'),b=snapshot.players.find(p=>p.team==='counterAnalysts');
   if(!a.alive||!b.alive||b.time<b.protectedUntil){await delay(100);continue;}
   if(a.ammo===0){await host.keyboard.press('r');await delay(1800);continue;}
   const targetYaw=Math.atan2(-(b.x-a.x),-(b.z-a.z)),targetPitch=Math.atan2(-.5,Math.hypot(b.x-a.x,b.z-a.z));
   const yawError=Math.atan2(Math.sin(a.yaw-targetYaw),Math.cos(a.yaw-targetYaw));
   host.aimPoint.x+=yawError/.0022;host.aimPoint.y+=(a.pitch-targetPitch)/.0022;
   await host.mouse.move(host.aimPoint.x,host.aimPoint.y);await delay(100);
   await host.mouse.down();await delay(160);await host.mouse.up();await delay(100);
  }
 }
 const first=await readFriend();assert.equal(first.phase,'active');const victim=()=>readFriend().then(s=>s.players.find(a=>a.team==='counterAnalysts'));
 await fireUntil(async()=>!(await victim()).alive,'real death');
 await until(async()=>{const a=await victim();return a.alive&&a.life>first.players.find(a=>a.team==='counterAnalysts').life;},'real automatic respawn');
 await fireUntil(async()=> (await readHost()).phase==='results','score-limit result');
 await until(async()=> (await readFriend()).phase==='results','replicated results');
 const score=await readHost();assert.equal(score.results,(await readFriend()).results);
 await host.screenshot({path:'test-results/online/results.png'});
 const scoreResult=JSON.parse(score.results);assert.equal(scoreResult.winner,'analysts');assert.equal(scoreResult.reason,'score');assert.equal(scoreResult.score.analysts,2);
 assert.equal(scoreResult.players.find(a=>a.team==='counterAnalysts').deaths,2);
 // Short authoritative clock settings only in this in-process fixture.
 r.match.settings.durationSeconds=8;r.match.settings.scoreTarget=50;r.state.durationSeconds=8;r.state.scoreTarget=50;
 await host.locator('#room-rematch').click();await until(async()=> (await readFriend()).phase==='waiting','same-room lobby');
 await readyAndStart(host,friend);assert.equal((await readHost()).room,roomId);
 await fireUntil(async()=> (await readHost()).players.find(a=>a.team==='analysts').kills===1,'rematch damage and score');
 await host.keyboard.press('r');await until(async()=> (await readHost()).players.find(a=>a.team==='analysts').ammo===30,'reload');
 await until(async()=> (await readHost()).phase==='results','time-limit victory');
 await until(async()=> (await readFriend()).results===(await readHost()).results,'same time result');
 const timed=JSON.parse((await readHost()).results);assert.equal(timed.winner,'analysts');assert.equal(timed.reason,'time');assert.equal(timed.score.analysts,1);
 r.match.settings.durationSeconds=2;r.state.durationSeconds=2;
 await friend.locator('#room-rematch').tap();await until(async()=> (await readHost()).phase==='waiting','third lobby');await readyAndStart(host,friend);
 await until(async()=> (await readHost()).phase==='results','time draw');const draw=JSON.parse((await readHost()).results);assert.equal(draw.winner,'draw');
 assert.equal(draw.matchId,score.matchId+2);assert.deepEqual(draw.score,{analysts:0,counterAnalysts:0});
 await host.locator('#room-leave').click();await until(async()=> (await readFriend()).players.length===1,'host departure');
 await friend.locator('#room-rematch').tap();await friend.locator('#room-start').waitFor({state:'visible'});assert(await friend.locator('#room-start').isDisabled());
 // Native sharing can finish after a disconnect/leave. Late completion is harmless.
 await friend.evaluate(()=>Object.defineProperty(navigator,'share',{configurable:true,value:()=>new Promise((resolve,reject)=>{window.rejectPendingShare=reject;})}));
 await friend.locator('#room-share').tap();await friend.locator('#room-leave').tap();
 await friend.evaluate(()=>window.rejectPendingShare(Error('share cancelled after departure')));await delay(50);
 await until(()=>fixture.authority.rooms.size===0,'room cleanup');assert.deepEqual(errors,[]);
 // A session lost on server restart must offer a working login, not trap the player.
 await friend.context().clearCookies();await friend.locator('[data-create=true]').tap();
 await friend.getByText('Logga in igen',{exact:true}).waitFor({state:'visible'});
 await friend.getByText('Logga in igen',{exact:true}).tap();await friend.locator('[name=invite]').waitFor();
 await friend.locator('[name=invite]').fill(fixture.invite);await friend.locator('button[type=submit]').tap();
 await friend.locator('#network-name').waitFor();assert.equal(await friend.locator('#network-room').inputValue(),roomId);
 const result={status:'PASS',date:new Date().toISOString(),renderedClients:2,protocolOnlyClients:0,physicalDevices:false,transport:'HTTPS/WSS pinned loopback fixture',scoreResult,timeResult:timed,drawResult:draw,sharedRoomLogin:true,expiredLoginRecovery:true,bothMovementControls:true,touchFire:true,deathRespawn:true,sameRoomRematch:true,teamChange:true,ownerTransfer:true,cleanup:true};
 await mkdir('test-results/online',{recursive:true});await writeFile('test-results/online/rendered-match.json',JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
}catch(e){
 // Never expose invitations/cookies in Playwright action diagnostics.
 console.error(String(e.stack||e).replaceAll(fixture.invite,'[invite]'));process.exitCode=1;
 for(const room of fixture.authority.rooms)console.error(JSON.stringify({phase:room.state.phase,actors:room.sim.game.actors.map(a=>({id:a.id,x:a.x,z:a.z,yaw:a.yaw,blockedBy:a.blockedBy})),enabled:[...room.seats.values()].map(s=>s.enabled)}));
 for(const [i,page] of pages.entries())await page.screenshot({path:'test-results/online-failure-'+i+'.png'}).catch(()=>{});
}finally{clearInterval(placing);await Promise.all(browsers.map(b=>b.close()));await fixture.close();}
