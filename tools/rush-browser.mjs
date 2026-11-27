// Normal Play entry, real keyboard/mouse or multi-touch, deterministic rendered
// frames on Floor 5. Fixtures choose a clear lane, weapon and render interval.
import assert from 'node:assert/strict';
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';

const out=process.env.RUSH_OUTPUT || mkdtempSync(join(tmpdir(),'cs3-rush-'));
const server=await createLocalServer({port:0}),profiles=process.argv.slice(2);
console.log('Private capture directory',out);
let browser;
const records=[];
async function play(touch) {
 const context=await browser.newContext({viewport:{width:844,height:390},deviceScaleFactor:.75,
   hasTouch:touch,isMobile:touch,locale:'en-US'});
 const page=await context.newPage();page.setDefaultTimeout(90000);
 try{
   page.on('pageerror',e=>console.error(e.message));
   await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({
     mode:'endless',graphics:'low',mobileAutoFire:false,autoReload:false,wanderers:false,firefight:false,loadout:'cr4'
   })));
   await page.goto(server.url+'/fps/?test',{waitUntil:'domcontentloaded'});
   await page.waitForFunction(()=>window.__fps && !document.querySelector('#start').disabled);
   await page.locator('#start').click();
   await page.waitForFunction(()=>window.__fps?.game?.player && document.getElementById('cs-loading')?.hidden);
   if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
   if(!touch)await page.waitForFunction(()=>document.pointerLockElement?.id==='game');
   await page.evaluate(()=>{
     const f=window.__fps;f.stopFrameLoop();
     const g=f.game;
     for(const other of g.actors)if(other!==g.player)other.bot=null;
     g.state.zombies=[];g.state.wanderers=[];g.state.phase='active';
     const gl=f.renderer.renderer.getContext(),ext=gl.getExtension('WEBGL_debug_renderer_info');
     window.rushEvidence={gpu:gl.getParameter(ext?.UNMASKED_RENDERER_WEBGL || gl.RENDERER),shots:[],audio:[]};
     const emit=g.emit.bind(g);
     g.emit=(kind,actor,detail)=>{const e=emit(kind,actor,detail);if(kind==='shot' && actor===g.player)rushEvidence.shots.push(e.time);return e;};
     const play=f.audio.play.bind(f.audio);
     f.audio.play=event=>{if(event?.type==='shot' && event.actorId===g.player.id)rushEvidence.audio.push(event.time);return play(event);};
   });
   const cd=touch?await context.newCDPSession(page):null;
   const touchEvent=(type,touchPoints)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints});
   const capture=async(label,format)=>{if(format)await page.screenshot({path:join(out,label+'.png'),timeout:15000});};
   async function steps(n,hz){
     return page.evaluate(({n,hz})=>{
       const f=window.__fps,a=f.game.player,samples=[];
       for(let i=0;i<n;i++){
         f.step(null,1/hz);
         const m=f.renderer.weaponModel;
         samples.push({time:f.game.state.time,x:a.x,z:a.z,weight:a.rushWeight,aim:a.aimAmount,ammo:f.game.item().ammo,
           pose:m.rotation.toArray().slice(0,3),wrist:m.userData.leftHand.position.toArray(),
           trigger:m.userData.rightHand.position.toArray(),reticle:document.getElementById('crosshair').style.opacity,
           wall:f.renderer.wallAmount,steps:a.distanceWalked});
       }
       return samples;
     },{n,hz});
   }
   const profile=touch?'touch':'desktop';
   for(const [weapon,hz,reduced] of [['cr4',60,false],['p9',30,false],['cr4',30,true],['p9',60,true]]){
     const name=[profile,weapon,hz,reduced?'reduced':'full'].join('-');
     await page.evaluate(({weapon,reduced})=>{
       const f=window.__fps,g=f.game,a=g.player;
       f.settings.reducedMotion=reduced;
       a.inventory.primary=g.weaponItem('cr4');a.inventory.pistol=g.weaponItem('p9');g.select(weapon);
       Object.assign(a,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0,rushWeight:0,rushResumeAt:0,rushing:false,distanceWalked:0});
       f.step({yaw:Math.PI,pitch:0},1/60);
       rushEvidence.shots.length=rushEvidence.audio.length=0;
     },{weapon,reduced});
     const before=(await steps(Math.ceil(.34*hz),hz)).at(-1);
     let pos=null;
     const box=touch?await page.locator('[data-mobile-stick-zone]').boundingBox():null;
     const startRush=async()=>{
       if(touch){
         pos={x:box.x+box.width*.43,y:box.y+box.height*.65,id:1};
         await touchEvent('touchStart',[pos]);pos={...pos,y:pos.y-76};await touchEvent('touchMove',[pos]);
       }else{await page.keyboard.down('w');await page.keyboard.down('x');}
     };
     const stopRush=async()=>{if(touch)await touchEvent('touchEnd',[]);else{await page.keyboard.up('w');await page.keyboard.up('x');}};
     await capture(name+'-hip',!reduced);
     await startRush();
     const entry=await steps(Math.ceil(.10*hz),hz);
     await capture(name+'-enter',!reduced);
     entry.push(...await steps(Math.ceil(.15*hz),hz));
     assert(entry.some(v=>v.weight>.8),name+' built Rush');
     await capture(name+'-stride',true);
     if(touch){
       const b=await page.locator('[data-mobile-action=fire]').boundingBox();
       assert(b,name+' manual fire exposed');
       const fire={x:b.x+b.width/2,y:b.y+b.height/2,id:2};
       await touchEvent('touchStart',[pos,fire]);await touchEvent('touchEnd',[pos]);
     }else{await page.mouse.down();await page.mouse.up();}
     const recovery=await steps(Math.ceil(.18*hz),hz);
     assert.equal(recovery.at(-1).ammo,before.ammo-1,name+' consumed exactly one round');
     await stopRush();
     const ready=await steps(Math.ceil(.27*hz),hz);
     assert(ready.at(-1).weight<.05);
     await capture(name+'-ready',true);
     await startRush();await steps(Math.ceil(.28*hz),hz);
     if(touch){
       const b=await page.locator('[data-tactical-aim]').boundingBox();
       const aim={x:b.x+b.width/2,y:b.y+b.height/2,id:3};
       await touchEvent('touchStart',[pos,aim]);await touchEvent('touchEnd',[pos]);
     }else await page.mouse.down({button:'right'});
     const ads=await steps(Math.ceil(.33*hz),hz);
     assert(ads.some(v=>v.aim>.8),name+' aimed from Rush');assert(ads.at(-1).weight<.1);
     await capture(name+'-ads',!reduced);
     if(!touch)await page.mouse.up({button:'right'});
     await stopRush();
     if(touch)await page.locator('[data-tactical-aim]').tap();
     await steps(Math.ceil(.26*hz),hz);
     const wall=await page.evaluate(({hz})=>{
       const f=__fps,g=f.game,a=g.player,eye={x:a.x,y:a.y+a.height-.12,z:a.z};
       let wall;
       for(const yaw of [0,Math.PI/2,Math.PI,-Math.PI/2,.75,-.75,2.35,-2.35]){
         const dir={x:-Math.sin(yaw),y:0,z:-Math.cos(yaw)};
         const hit=g.world.raycast(eye,dir,30,{vision:false,staticOnly:true});
         if(!hit || !Number.isFinite(hit.distance))continue;
         const x=eye.x+dir.x*(hit.distance-.33),z=eye.z+dir.z*(hit.distance-.33);
         if(!g.world.canOccupy(x,z,a.radius,a.height))continue;
         const control=g.world.raycast({x,y:eye.y,z},dir,.62,{staticOnly:true});
         if(!control || Math.abs(control.distance-.33)>.01)continue;
         wall={x,z,yaw,surface:control.id};break;
       }
       if(!wall)throw Error('Wall control requires a reachable surface at '+JSON.stringify(eye));
       Object.assign(a,{x:wall.x,z:wall.z,rushWeight:0,rushing:false});
       f.step({yaw:wall.yaw,pitch:0},1/hz);
       for(let i=0;i<Math.ceil(.25*hz);i++)f.step(null,1/hz);
       return {weight:a.rushWeight,lift:f.renderer.wallAmount,pose:f.renderer.weaponModel.rotation.toArray().slice(0,3),x:a.x,z:a.z,y:a.y,yaw:a.yaw,pitch:a.pitch,eye:f.renderer.camera.position.toArray(),dir:f.renderer.wallDir.toArray(),wall};
     },{hz});
     assert(wall.lift>.52 && wall.weight===0 && wall.pose[0]>0.3,name+' separate upright near-wall pose '+JSON.stringify(wall));
     await capture(name+'-wall',!reduced);
     const events=await page.evaluate(()=>structuredClone(rushEvidence));
     assert.equal(events.shots.length,1);assert.equal(events.audio.length,1);
     records.push({name,hz,touch,reduced,weapon,before,entry,recovery,ready,ads,wall,events});
     writeFileSync(join(out,'traces.json'),JSON.stringify({contract:CONTRACT,browser:browser.version(),records},null,2));
     console.log(name,'passed',events.shots[0]);
   }
   await cd?.detach();
 }finally{await context.close();}
}
try{
 browser=await chromium.launch({headless:false,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',
   args:['--no-sandbox','--ozone-platform=wayland','--use-angle=gl-egl','--disable-background-timer-throttling','--disable-renderer-backgrounding']});
 for(const profile of profiles.length?profiles:['desktop','touch'])await play(profile==='touch');
}finally{await browser?.close();await server.close();}
