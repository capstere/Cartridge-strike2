// Two normally joined game clients. Hold the private fixture just before landing
// so the physical crouch tap reaches the same airborne tick on slow hardware.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
import {resumeDesktop,enterTouchMatch,waitForActiveHud} from './network-browser-resume.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
const local=await createLocalServer({port:0,testMatch:{countdownSeconds:.15}});
const browsers=[],errors=[];
async function until(check,label){
 const end=performance.now()+6500;
 while(!await check()){assert(performance.now()<end,label);await delay(8);}
}
async function open(touch){
 const browser=await chromium.launch({channel:'chromium',headless:!process.env.WAYLAND_DISPLAY,
   executablePath:process.env.CHROMIUM_PATH||undefined,
   args:['--use-angle='+(process.env.FPS_NETWORK_ANGLE||'swiftshader'),'--disable-background-timer-throttling',
     '--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows',...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]});
 browsers.push(browser);
 const page=await browser.newPage({isMobile:touch,hasTouch:touch,viewport:{width:820,height:430},deviceScaleFactor:.5});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(60000);
 await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.45,ambient:false,mobileAutoFire:false})));
 await page.goto(local.url+'/fps/?network=local&test&realtime');
 await page.locator('#network-code').fill('slide-room');
 return page;
}
async function observe(page){
 await page.waitForFunction(()=>__fps.audio.context?.state==='running'&&__fps.audio.reuseBuffers.has('foley/s_slide_soft.mp3'));
 await page.evaluate(()=>{
   const sys=__fps.audio,net=__fps.network,origPlay=sys.play,origTrack=sys.track,send=net.input.send;
   const obs=window.slideProbe={voices:[],events:[],edgeSent:false,rushPackets:0,jumpPackets:0};
   net.input.send=function(...args){if(this.data.crouchEdge)obs.edgeSent=true;if(this.data.sprint && this.data.forward>0)obs.rushPackets++;if(this.data.jump)obs.jumpPackets++;return send.apply(this,args);};
   net.room.onMessage('events',batch=>obs.events.push(...batch.filter(e=>e.type==='slide')));
   let active=null;
   sys.play=function(event){active=event;try{return origPlay.call(this,event);}finally{active=null;}};
   sys.track=function(source,channel,duration,offset){
     const r=origTrack.call(this,source,channel,duration,offset);
     if(active?.type!=='slide' || source.buffer!==this.reuseBuffers.get('foley/s_slide_soft.mp3'))return r;
     const end=channel.nodes.at(-1),analyser=this.context.createAnalyser();
     analyser.fftSize=2048;end.connect(analyser);
     const row={id:active.eventId,tick:active.tick,actor:active.actorId,listener:this.listenerId,source:active.surface,
       rate:source.playbackRate.value,bufferSeconds:source.buffer.duration,sampleRate:source.buffer.sampleRate,
       spatial:channel.nodes.some(n=>n instanceof PannerNode),distance:Math.hypot(active.x-this.listener.x,active.y-this.listener.y,active.z-this.listener.z),
       scheduledDelayMs:(channel.when-this.context.currentTime)*1000,peak:0};
     obs.voices.push(row);
     const start=performance.now(),pcm=new Float32Array(analyser.fftSize);
     function sample(){
       analyser.getFloatTimeDomainData(pcm);
       for(const value of pcm)row.peak=Math.max(row.peak,Math.abs(value));
       if(performance.now()-start<1000)setTimeout(sample,13);
       else{try{end.disconnect(analyser);}catch{}analyser.disconnect();}
     }
     sample();return r;
   };
 });
}
try{
 const desktop=await open(false),touch=await open(true);
 await desktop.locator('#network-fill-bots').uncheck();
 await desktop.locator('[data-create=true]').click();await desktop.locator('#room-ready').click();
 const room=[...local.rooms][0],game=room.sim.game,host=[...room.seats.values()][0].actor;
 await touch.locator('#network-room').fill(room.roomId);await touch.locator('[data-create=false]').tap();
 await touch.locator('#room-ready').tap();await desktop.locator('#room-start').click();
 await waitForActiveHud(desktop);
 if(await desktop.locator('#pause').isHidden())await desktop.keyboard.press('Escape');
 await desktop.locator('#resume').waitFor();await enterTouchMatch(touch);
 console.log('Two ready players, normal desktop and touch gameplay');
 const guest=[...room.seats.values()].find(s=>s.actor!==host).actor;
 assert.equal(room.bots.size,0);
 await resumeDesktop(desktop);await Promise.all([observe(desktop),observe(touch)]);
 Object.assign(host,{x:20,y:0,z:-18,vy:0,onGround:true});
 const neighbor=game.world.navigation.nodes.reduce((best,p)=>Math.abs(Math.hypot(p.x-host.x,p.z-host.z)-4)<Math.abs(Math.hypot(best.x-host.x,best.z-host.z)-4)?p:best);
 Object.assign(guest,{x:neighbor.x,y:neighbor.y??0,z:neighbor.z,vy:0,onGround:true});
 await desktop.waitForFunction(()=>Math.hypot(__fps.game.player.x-20,__fps.game.player.z+18)<.18);
 await touch.waitForFunction(p=>Math.hypot(__fps.game.player.x-p.x,__fps.game.player.z-p.z)<.2,{x:guest.x,z:guest.z});
 console.log('Both native slide buffers decoded, gameplay clients at test positions');
 await desktop.evaluate(()=>{
   const actor=__fps.game.player,scale=.0022;
   const delta=Math.atan2(Math.sin(actor.yaw-Math.PI),Math.cos(actor.yaw-Math.PI));
   window.dispatchEvent(new MouseEvent('mousemove',{movementX:Math.round(delta/scale),movementY:Math.round(actor.pitch/scale)}));
 });
 await until(()=>Math.abs(Math.sin((host.yaw-Math.PI)/2))<.01,'ordinary mouse look faced the lane');
 const fixed=room.fixedTick;let held=false,release=false,height=0,sawRush=false,maxWeight=0,fastest=0;
 room.fixedTick=function(){
   if(!release && !host.onGround && host.vy<0 && host.y>0 && host.y<=.12){held=true;height=host.y;return;}
   fixed.call(this);
   sawRush ||= host.rushing && host.moving>game.config.runSpeed;
   maxWeight=Math.max(maxWeight,host.rushWeight);fastest=Math.max(fastest,host.moving);
 };
 try{
   await desktop.keyboard.down('w');await desktop.keyboard.down('x');
   await until(()=>sawRush,'authority resolved a genuine forward Rush tick');
   await desktop.keyboard.down('Space');
   await until(()=>!host.onGround,'normal jump');
   await desktop.keyboard.up('Space');
   await until(()=>held,'airborne pre-landing gate');
   await desktop.keyboard.press('Control');
   await desktop.waitForFunction(()=>slideProbe.edgeSent,null,{timeout:2500});await delay(40);release=true;
   await until(()=>host.slideUntil>game.state.time,'authority accepted the buffered landing slide');
   await desktop.keyboard.up('x');await desktop.keyboard.up('w');
   const rows=await Promise.all([desktop,touch].map(async page=>{
     await page.waitForFunction(()=>slideProbe.events.length===1 && slideProbe.voices.some(v=>v.peak>.0001));
     await page.waitForFunction(()=>!__fps.network.room.state.actors.get(slideProbe.events[0].actorId).handling.slideUntil);
     return page.evaluate(()=>({events:slideProbe.events,voices:slideProbe.voices,finalBuffer:__fps.network.room.state.actors.get(slideProbe.events[0].actorId).handling.slideBuffer}));
   }));
   assert.deepEqual(rows[0].events,rows[1].events);assert.deepEqual(errors,[]);
   for(const [i,r] of rows.entries()){assert.equal(r.voices.length,1);assert.equal(r.finalBuffer,0);
     assert.equal(r.voices[0].spatial,i===1);assert.equal(r.voices[0].id,r.events[0].eventId);
     assert(r.voices[0].peak>.0001);assert(Math.abs(r.voices[0].scheduledDelayMs)<40);}
   const proof={build:CONTRACT.buildHash,protocol:CONTRACT.protocolVersion,airborneHeight:height,maxRushWeight:maxWeight,maxResolvedSpeed:fastest,rows};
   if(process.env.CS3_SLIDE_RECEIPT)await writeFile(process.env.CS3_SLIDE_RECEIPT,JSON.stringify(proof,null,2)+'\n');
   console.log('PASS normal keyboard jump and buffered crouch, local and spatial decoded movement audio',JSON.stringify(proof));
 }catch(error){
    const controls=await desktop.evaluate(()=>({modal:__fps.modal,locked:document.pointerLockElement?.id,enabled:__fps.network.enabled,
      rushPackets:slideProbe.rushPackets,jumpPackets:slideProbe.jumpPackets,edge:slideProbe.edgeSent,
      events:slideProbe.events,voices:slideProbe.voices}));
    console.error(JSON.stringify({controls,held,release,height,sawRush,maxWeight,fastest,pose:{
      x:host.x,y:host.y,z:host.z,alive:host.alive,onGround:host.onGround,vy:host.vy,slideBuffer:host.slideBuffer,slideUntil:host.slideUntil}}));
    throw error;
 }finally{release=true;room.fixedTick=fixed;await desktop.keyboard.up('x');await desktop.keyboard.up('w');await desktop.keyboard.up('Space');}
}finally{await Promise.allSettled(browsers.map(browser=>browser.close()));await local.close();}
