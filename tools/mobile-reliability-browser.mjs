import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',baseline=process.env.MOBILE_BASELINE==='1',rows=[];
const browser=await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
try{for(const width of [844,932]){
 const context=await browser.newContext({viewport:{width,height:width===844?390:430},isMobile:true,hasTouch:true,deviceScaleFactor:2}),p=await context.newPage();p.setDefaultTimeout(180000);const errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'low',mobileAutoFire:false})));
 await p.goto(origin+'/fps/?test&realtime&seed=42');await p.locator('#start').click();await p.waitForFunction(()=>window.__fps?.game.player&&document.querySelector('#cs-loading').hidden);if(await p.locator('#resume').isVisible())await p.locator('#resume').click();await p.evaluate(()=>{__fps.stopFrameLoop();__fps.step({},1/60);});
 const cd=await context.newCDPSession(p),touch=(type,points)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints:points});
 const zone=await p.locator('[data-mobile-stick-zone]').boundingBox(),look=await p.locator('[data-mobile-look]').boundingBox(),fire=await p.locator('[data-mobile-action=fire]').boundingBox();
 const left={x:zone.x+zone.width*.35,y:zone.y+zone.height*.7,id:1},right={x:look.x+look.width*.22,y:look.y+look.height*.2,id:2},trigger={x:fire.x+fire.width*.5,y:fire.y+fire.height*.5,id:3};
 await touch('touchStart',[left,right,trigger]);const moved=[{...left,y:left.y-42},{...right,x:right.x+28,y:right.y+8},trigger];await touch('touchMove',moved);
 const before=await p.evaluate(()=>({input:__fps.input(),ids:[__fps.mobile.stickId,__fps.mobile.lookId]}));assert(before.input.forward>.2&&before.input.fire&&before.ids.every(v=>v!==null));
 const combined=await p.evaluate(()=>{const f=__fps,g=f.game,a=g.player,before=[a.x,a.z,g.item(a).ammo];f.step(null,1/60);return {meters:Math.hypot(a.x-before[0],a.z-before[1]),shots:before[2]-g.item(a).ammo};});assert(combined.meters>0&&combined.shots>0);
 const switched=await p.evaluate(()=>{__fps.game.select('pistol');__fps.step(null,1/60);return {input:__fps.input(),ids:[__fps.mobile.stickId,__fps.mobile.lookId]};});
 const at=performance.now();await touch('touchMove',[{...moved[0],y:moved[0].y-2},{...moved[1],x:moved[1].x+12},trigger]);await p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));const after=await p.evaluate(()=>__fps.input()),settledReadMs=performance.now()-at;
 await touch('touchEnd',[]);
 // Two fingers on the same held button: releasing either must preserve the other.
 const a={...trigger,id:4,x:trigger.x-10},b={...trigger,id:5,x:trigger.x+10};await touch('touchStart',[a,b]);await touch('touchEnd',[b]);const held=await p.evaluate(()=>__fps.mobile.state.fire);await touch('touchEnd',[]);assert.equal(await p.evaluate(()=>__fps.mobile.state.fire),false);
 // Run the ordinary realtime clock while the viewport crosses portrait.
 await p.reload();await p.locator('#start').click();await p.waitForFunction(()=>window.__fps?.game.player&&document.querySelector('#cs-loading').hidden);if(await p.locator('#resume').isVisible())await p.locator('#resume').click();
 const pacing=await p.evaluate(async measure=>{if(!measure)return {measured:false};const a=[];let last=await new Promise(requestAnimationFrame);for(let i=0;i<60;i++){const now=await new Promise(requestAnimationFrame);a.push(now-last);last=now;}a.sort((x,y)=>x-y);return {frames:a.length,median:a[29],p95:a[56],over25:a.filter(v=>v>25).length};},process.env.MOBILE_PROFILE==='1');
 await p.setViewportSize({width:390,height:844});await p.waitForTimeout(350);
 const rotation=await p.evaluate(()=>({paused:__fps.game.state.paused,modal:__fps.modal,time:__fps.game.state.time,voices:__fps.audio.active.size,ambient:__fps.audio.ambient.length,music:!!__fps.audio.floorAudio.music}));await p.waitForTimeout(650);const advanced=await p.evaluate(t=>__fps.game.state.time-t,rotation.time);
 await p.setViewportSize({width,height:width===844?390:430});await p.waitForTimeout(250);const remainsPaused=await p.evaluate(()=>__fps.game.state.paused);
 if(await p.locator('#resume').isVisible())await p.locator('#resume').click();
 const renderer=await p.evaluate(()=>{const r=__fps.renderer.renderer,gl=r.getContext();return {buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],lost:gl.isContextLost(),programs:r.info.programs.length};});
 await p.keyboard.press('Escape');await p.locator('#restart').click();const cleanup=await p.evaluate(()=>({voices:__fps.audio.active.size,ambient:__fps.audio.ambient.length,music:!!__fps.audio.floorAudio.music}));
 const result={width,combined,pacing,before,switched,after,settledReadMs,held,rotation,advanced,remainsPaused,renderer,cleanup,errors};rows.push(result);console.log(JSON.stringify(result));
 if(!baseline){assert(switched.input.forward>.2&&switched.ids.every(v=>v!==null));assert(Math.abs(after.yaw-switched.input.yaw)>.01);assert(held);assert(rotation.paused&&rotation.modal==='pause'&&advanced===0&&remainsPaused);assert.equal(rotation.voices+rotation.ambient,0);assert(!rotation.music);}
 assert(!renderer.lost&&renderer.buffer.every(v=>v>0));assert.deepEqual(cleanup,{voices:0,ambient:0,music:false});assert.deepEqual(errors,[]);await context.close();
}}finally{await browser.close();fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/mobile-reliability-'+(baseline?'before':'after')+'.json',JSON.stringify(rows,null,2));}
