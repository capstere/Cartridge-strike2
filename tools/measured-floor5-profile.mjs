// Fixed-step, seeded matches: rendering never changes the simulated workload.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const label=process.env.PROFILE_LABEL||'current',repeats=Number(process.env.PROFILE_REPEATS||3);
const out=`test-results/measured-${label}`;fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
const report={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),browser:browser.version(),platform:process.platform,runs:[]};
try{
 for(const mobile of (process.env.PROFILE_DESKTOP==='1'?[false]:[true,false]))for(let run=0;run<repeats;run++){
  const page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:2});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(m=>localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:m?'low':'standard'})),mobile);
  await page.goto(origin+'/fps/?test&seed=42');
  await page.locator('#start').click();
  await page.locator('#csl-deploy').click();
  await page.waitForFunction(()=>window.__fps?.game.player&&document.querySelector('#cs-loading').hidden,null,{timeout:180000});
  if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
  await page.evaluate(()=>{__fps.stopFrameLoop();__fps.pause(false);});
  const cdp=await page.context().newCDPSession(page);
  if(process.env.PROFILE_CPU){await cdp.send('Profiler.enable');await cdp.send('Profiler.setSamplingInterval',{interval:500});await cdp.send('Profiler.start');}
  const result=await page.evaluate(async()=>{
   const f=__fps,g=f.game,r=f.renderer,w=f.world,gpu=r.renderer,gl=gpu.getContext();
   // Lock configured resolution for comparison. The separate live profiler
   // exercises the shipping adaptive controller; CPU wins must not buy pixels.
   r.adaptiveResolution.update=()=>false;
   const ext=gl.getExtension('WEBGL_debug_renderer_info');
   const settings={backend:gl.getParameter(ext?ext.UNMASKED_RENDERER_WEBGL:gl.RENDERER),viewport:[innerWidth,innerHeight],dpr:devicePixelRatio,graphics:f.settings.graphics,seed:g.seed,actors:g.actors.length,bots:g.actors.filter(a=>a.bot).length,residents:g.state.zombies.length};
   const tally={},restores=[];
   function wrap(obj,key,name){const old=obj[key];if(!old)return;obj[key]=function(...args){const t=performance.now();try{return old.apply(this,args);}finally{const v=tally[name]||=( {calls:0,ms:0});v.calls++;v.ms+=performance.now()-t;}};restores.push(()=>obj[key]=old);}
   wrap(g,'step','simulation');wrap(Object.getPrototypeOf(g.actors.find(a=>a.bot).bot),'update','bots');
   wrap(w,'move','physicsMove');wrap(w,'segmentClear','lineOfSight');wrap(w,'canOccupy','occupancy');
   wrap(w.navigation,'findPath','navigation');w.findPath=w.navigation.findPath;
   wrap(w.navigation,'clear','clearance');wrap(w.doors,'update','doors');wrap(r,'render','render');wrap(gpu,'render','gpuSubmission');
   const samples={lift:[],c08:[],combat:[]},signatures=[],events=[];
   const observer=Object.assign(Object.create(g.player),{x:20,y:0,z:-5.4,yaw:-2.36,pitch:0,moving:0});
   let previous=null;
   for(let tick=0;tick<1500;tick++){
    const stamp=await new Promise(requestAnimationFrame),before=performance.now();
    for(const k of Object.keys(tally))delete tally[k];
    g.update(1/60,{});
    const batch=g.drainEvents();events.push(...batch.map(e=>[e.type,e.actorId,e.time]));r.events(batch,g);
    r.render(g,tick<720?g.player:observer,1/60);
    const elapsed=performance.now()-before;
    const row={tick,interval:previous===null?0:stamp-previous,work:elapsed,calls:r.stats.drawCalls,triangles:r.stats.triangles,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],timers:structuredClone(tally)};
    if(tick>=120&&tick<360)samples.lift.push(row);
    if(tick>=1200&&tick<1440)samples.c08.push(row);
    if(tick>=360&&tick<1440)samples.combat.push(row);
    previous=stamp;
    if(tick%60===0)signatures.push(JSON.stringify(g.state,(k,v)=>k==='bot'?undefined:v));
   }
   for(const restore of restores.reverse())restore();
   return {settings,samples,signatures,events,shots:events.filter(e=>e[0]==='shot').length};
  });
  if(process.env.PROFILE_CPU){const {profile}=await cdp.send('Profiler.stop');fs.writeFileSync(`${out}/${mobile?'mobile':'desktop'}-${run}.cpuprofile`,JSON.stringify(profile));}
  result.stateHash=createHash('sha256').update(JSON.stringify(result.signatures)).digest('hex');delete result.signatures;
  result.eventHash=createHash('sha256').update(JSON.stringify(result.events)).digest('hex');delete result.events;
  result.summary=Object.fromEntries(Object.entries(result.samples).map(([name,rows])=>{
   const quant=(v,p)=>[...v].sort((a,b)=>a-b)[Math.ceil(v.length*p)-1],timers={};
   for(const row of rows)for(const [key,v]of Object.entries(row.timers)){const total=timers[key]||={calls:0,ms:0};total.calls+=v.calls;total.ms+=v.ms;}
   return [name,{frames:rows.length,median:quant(rows.map(v=>v.interval),.5),p95:quant(rows.map(v=>v.interval),.95),p99:quant(rows.map(v=>v.interval),.99),over25:rows.filter(v=>v.interval>25).length,over50:rows.filter(v=>v.interval>50).length,workMedian:quant(rows.map(v=>v.work),.5),workP95:quant(rows.map(v=>v.work),.95),draws:[Math.min(...rows.map(v=>v.calls)),Math.max(...rows.map(v=>v.calls))],triangles:[Math.min(...rows.map(v=>v.triangles)),Math.max(...rows.map(v=>v.triangles))],buffers:[...new Set(rows.map(v=>v.buffer.join('x')))],timers}];
  }));
  assert.equal(result.settings.actors,10);assert.equal(result.settings.bots,9);assert(result.shots>0);assert.deepEqual(errors,[]);
  report.runs.push({mobile,run,...result});console.log(JSON.stringify({mobile,run,settings:result.settings,stateHash:result.stateHash,shots:result.shots,summary:result.summary}));
  fs.writeFileSync(out+'/measurements.json',JSON.stringify(report));await page.close();
 }
}finally{await browser.close();}
