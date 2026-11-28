// Observe the real renderer in continuously running Solo matches entered from Home.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {resumeDesktop} from './network-browser-resume.mjs';

const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const output=process.env.CS3_NAV_EVIDENCE||'test-results/bot-navigation';
await mkdir(output,{recursive:true});
const native=process.env.CHROMIUM_PATH;
const browser=await chromium.launch({executablePath:native,headless:process.env.FPS_NETWORK_HEADED!=='1',
  args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:
    ['--use-angle=swiftshader','--enable-unsafe-swiftshader','--disable-dev-shm-usage']});
const evidence=[];
try{
  for(const [map,touch] of [['floor5',false],['meltem',true]]){
    const ctx=await browser.newContext({locale:touch?'fr-FR':'sv-SE',hasTouch:touch,isMobile:touch,
      viewport:touch?{width:844,height:390}:{width:1024,height:576},deviceScaleFactor:1});
    const page=await ctx.newPage(),errors=[];
    try{
      await ctx.addInitScript(()=>{if(!localStorage.getItem('cartridge-settings'))localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0}));});
      page.setDefaultTimeout(90000);page.on('pageerror',err=>errors.push(err.message));
      const press=selector=>{const element=page.locator(selector+':visible').first();return touch?element.tap():element.click();};
      await page.goto(origin);await page.locator('#home-title').waitFor();
      await press('[data-go="play"]');await press('[data-go="solo"]');await press('.map-tile');
      await press('#choose-'+map);await page.locator('#setup-title').waitFor();
      if(map==='meltem')await page.waitForURL(url=>url.searchParams.get('level')===map&&url.searchParams.get('mode')==='endless');
      await page.evaluate(async()=>{
        const resource=performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/fps/render.mjs'));
        const {Renderer}=await import(resource?.name||'/src/fps/render.mjs?v=floor5-environment-1');
        const render=Renderer.prototype.render;
        const trace=window.botObservation={frames:0,activeSeconds:0,started:null,lastSample:-Infinity,samples:[]};
        Renderer.prototype.render=function(game,...rest){
          const value=render.call(this,game,...rest);
          if(game.phase!=='active'||game.state.paused||document.hidden||!document.querySelector('#pause').hidden)return value;
          const bots=game.actors.filter(a=>a.bot);
          if(!bots.length)return value;
          const t=game.state.time,wall=performance.now();
          trace.started??=t;trace.frames++;trace.activeSeconds=t-trace.started;
          if(wall-trace.lastSample>=400){
            trace.lastSample=wall;
            trace.samples.push({wallMs:Math.round(wall),simSeconds:Number(t.toFixed(3)),map:game.world.referenceId||game.world.project.projectId,
              calls:this.renderer.info.render.calls,player:{x:game.player.x,y:game.player.y,z:game.player.z,yaw:game.player.yaw},
              actors:bots.map(a=>({id:a.id,x:Number(a.x.toFixed(2)),y:Number(a.y.toFixed(2)),z:Number(a.z.toFixed(2)),
                alive:a.alive,mode:a.bot.mode,role:a.aiRole,travel:a.bot.distanceTravelled,lastShot:a.bot.lastShotAt}))});
          }
          return value;
        };
      });
      console.log(map,'observer attached');
      await press('#start');await page.locator('#hud').waitFor();await page.locator('#cs-loading').waitFor({state:'hidden'});
      console.log(map,'HUD loaded');
      if(!touch&&!await page.evaluate(()=>document.pointerLockElement?.id==='game'))await resumeDesktop(page);
      if(touch&&await page.locator('#resume').isVisible())await press('#resume');
      if(await page.locator('#return-buy').isVisible())await press('#return-buy');
      await page.waitForFunction(()=>window.botObservation.activeSeconds>=6,null,{timeout:120000});
      if(!touch){
        await page.keyboard.down('KeyW');await page.mouse.move(558,279);await page.waitForTimeout(800);await page.keyboard.up('KeyW');
      }else{
        const stick=await page.locator('[data-mobile-stick-zone]').boundingBox();
        assert(stick);const x=stick.x+stick.width/2,y=stick.y+stick.height/2;
        const cdp=await ctx.newCDPSession(page);
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
        await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y-stick.height*.34}]});
        await page.waitForTimeout(800);await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
      }
      await page.waitForFunction(()=>window.botObservation.activeSeconds>=12,null,{timeout:90000});
      const trace=await page.evaluate(()=>window.botObservation);
      assert(trace.frames>40&&trace.samples.length>=8);
      assert(trace.samples.every(s=>s.calls>0&&s.actors.length===9));
      const moved=new Set(trace.samples.flatMap(s=>s.actors.filter(a=>a.travel>1).map(a=>a.id)));
      assert(moved.size>=5,'At least five real bots left their initial positions');
      assert.deepEqual(errors,[]);
      const name=map+(touch?'-touch':'-desktop');
      await page.screenshot({path:join(output,name+'.jpg'),type:'jpeg',quality:78});
      evidence.push({map,input:touch?'emulated touch':'keyboard and mouse',moved:moved.size,trace});
      await writeFile(join(output,'live.json'),JSON.stringify(evidence,null,2)+'\n');
      console.log(name,trace.frames+' live frames',trace.activeSeconds.toFixed(2)+' active seconds',moved.size+' bots moved');
    }catch(error){
      const diagnostic=await page.evaluate(()=>({
        url:location.href,screen:document.querySelector('#menu')?.dataset.screen,pauseVisible:!document.querySelector('#pause')?.hidden,
        status:document.querySelector('#round-label')?.textContent,fatal:document.querySelector('#fatal')?.textContent,
        frames:window.botObservation?.frames,activeSeconds:window.botObservation?.activeSeconds,
      })).catch(()=>({}));
      console.error(map,{diagnostic,errors});
      await page.screenshot({path:join(output,map+'-failure.jpg'),type:'jpeg',timeout:10000}).catch(()=>{});
      throw error;
    }finally{await ctx.close();}
  }
}finally{await browser.close();}
