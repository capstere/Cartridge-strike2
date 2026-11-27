const fs = require('node:fs');
const path = require('node:path');
const http = require('node:http');
const {execFileSync} = require('node:child_process');
const {setTimeout:sleep}=require('node:timers/promises');
const observe=require('./observe.cjs');
const {tmpdir}=require('node:os');
const root=process.cwd(), output=process.env.CS3_BENCH_OUT||fs.mkdtempSync(path.join(tmpdir(),'cs3-comparison-'));
console.log('Private raw result directory',output);
const { chromium }=require(path.join(root,'frontline/source/tools/dev/node_modules/playwright-core'));
const [kind,profile='desktop',repeats='3',offset='0']=process.argv.slice(2);
if(!['fps','frontline'].includes(kind)||!['desktop','touch'].includes(profile))throw Error('Usage: node compare.cjs fps|frontline desktop|touch [repeats]');
const touch=profile==='touch', cs2=kind==='fps';
const level=process.env.CS3_BENCH_LEVEL;
if(level && (!cs2 || !/^[a-z0-9-]{1,48}$/.test(level)))throw Error('Invalid published CS2 benchmark level.');
const mime={'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json','.css':'text/css','.ogg':'audio/ogg','.mp3':'audio/mpeg','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp','.wasm':'application/wasm','.svg':'image/svg+xml','.woff2':'font/woff2'};
const server=http.createServer((req,res)=>{
  const url=new URL(req.url,'http://127.0.0.1');
  const name=path.resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));
  if(!name.startsWith(root+'/')||!fs.statSync(name,{throwIfNoEntry:false})?.isFile()){res.writeHead(404);return res.end();}
  res.writeHead(200,{'content-type':mime[path.extname(name)]||'application/octet-stream','cache-control':'public,max-age=3600'});
  const stream=fs.createReadStream(name);res.on('close',()=>stream.destroy());stream.on('error',()=>res.destroy()).pipe(res);
});
function environment(){
  const read=p=>{try{return fs.readFileSync(p,'utf8').trim().replaceAll('\0','');}catch{return null;}};
  return {model:read('/proc/device-tree/model'),thermalC:Number(read('/sys/class/thermal/thermal_zone0/temp'))/1000,
    freqKHz:read('/sys/devices/system/cpu/cpu0/cpufreq/scaling_cur_freq'),load:read('/proc/loadavg'),
    throttled:execFileSync('vcgencmd',['get_throttled'],{encoding:'utf8'}).trim(),node:process.version,
    sha:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim()};
}
function distro(v){
  if(!v.length) return {n:0};
  const a=[...v].sort((x,y)=>x-y),at=q=>+a[Math.ceil(q*a.length)-1].toFixed(3);
  return {n:a.length,p50:at(.5),p95:at(.95),p99:at(.99),max:at(1),over33:a.filter(x=>x>1000/30).length,over50:a.filter(x=>x>50).length,over100:a.filter(x=>x>100).length};
}
async function controls(page){
  if(!touch){
    await page.keyboard.down('w');await sleep(600);await page.keyboard.up('w');await sleep(350);
    await page.keyboard.down('w');await page.keyboard.down('Shift');await sleep(700);
    await page.mouse.down();await sleep(300);await page.mouse.up();await page.keyboard.up('Shift');await page.keyboard.up('w');
    await sleep(250);await page.keyboard.press('r');await sleep(3200);
    return;
  }
  const cd=await page.context().newCDPSession(page);
  const send=(type,points)=>cd.send('Input.dispatchTouchEvent',{type,touchPoints:points});
  const view=page.viewportSize();
  const box=cs2?await page.locator('[data-mobile-stick-zone]').boundingBox():null;
  let pos=box?{x:box.x+box.width*.35,y:box.y+box.height*.7,id:1}:{x:view.width*.2,y:view.height*.7,id:1};
  const f=await page.locator(cs2?'[data-mobile-action=fire]':'[data-tc=fire]').first().boundingBox();
  await send('touchStart',[pos]);pos={...pos,y:pos.y-28};await send('touchMove',[pos]);await sleep(600);
  pos={...pos,y:pos.y-47};await send('touchMove',[pos]);await sleep(700);
  if(f){const fire={x:f.x+f.width/2,y:f.y+f.height/2,id:2};await send('touchStart',[pos,fire]);await sleep(300);}
  await send('touchEnd',[]);
  await sleep(250);
  const reload=page.locator(cs2?'[data-mobile-action=reload]':'[data-tc=reload]').first();
  await reload.waitFor({state:'visible',timeout:5000});
  await reload.tap();
  await sleep(3200);await cd.detach();
}
async function run(ctx,base,i,version,cacheWarm){
  const page=await ctx.newPage();
  const row={kind,profile,repeat:i,cache:cacheWarm?'warm browser HTTP cache':'new browser context',version,stamp:new Date().toISOString(),before:environment(),errors:[],startup:{}};
  const capture=()=>page.evaluate(()=>performance.now());
  const mark=async(s)=>{row.startup[s]=await capture();console.log(kind,profile,i,s,Math.round(row.startup[s]));};
  page.setDefaultTimeout(140000);
  page.on('pageerror',e=>{row.errors.push(e.message.slice(0,200));if(level)console.error(e.stack);});
  if(level)page.on('console',message=>{if(message.type()==='error')console.error(message.text().slice(0,500));});
  try{
    await page.goto(base+'/'+kind+'/'+(level?'?level='+level:''),{waitUntil:'domcontentloaded',timeout:120000});
    const menu=page.locator(cs2?'#start':'#scr-main [data-go=play]');
    if(touch && !cs2){
      const installChoice=page.locator('#pwaOffer:not(.hidden) #poHelp');
      await menu.or(installChoice).filter({visible:true}).first().waitFor({state:'visible'});
      if(await installChoice.isVisible()){
        await mark('mobileInstallOffer');
        await installChoice.tap();await page.locator('#poNo').tap();
      }
    }
    await menu.waitFor({state:'visible'});await mark('menuVisible');
    if(cs2){
      const mode=page.locator('#lb-mode-seg [data-value=endless]');
      if(await mode.isVisible())await mode.click();
      await page.waitForFunction(()=>!document.querySelector('#start').disabled);
      await mark('startButton');await menu.click();
      await page.waitForFunction(()=>{
        const fatal=document.querySelector('#fatal');
        if(fatal&&!fatal.hidden)throw Error(fatal.innerText);
        const load=document.querySelector('#cs-loading.is-error');
        if(load&&!load.hidden)throw Error(load.innerText);
        return !document.querySelector('#hud').hidden&&document.getElementById('cs-loading')?.hidden;
      });
      if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
    }else{
      await menu.click();await page.locator('#playGrid button').filter({hasText:/solo/i}).first().click();
      await mark('startButton');await page.locator('#soloGo').click();
      await page.locator('#depGo').waitFor({state:'visible'});await mark('classReady');
      await page.locator('#depGo').click({force:true});await page.locator('#hud').waitFor({state:'visible'});
      if(touch && await page.locator('#tcHelp').isVisible())await page.locator('#tcHelp').tap();
      await page.waitForFunction(()=>MATCH.state==='playing'&&!cdOn());
    }
    await mark('playable');
    if(cs2){
      await page.keyboard.press('b');
      await page.locator('#shop [data-item=ar47]').click();
      await page.locator('#return-buy').click();
      if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
    }
    await page.evaluate(observe,kind);await sleep(3000);
    await page.evaluate(()=>{cs3Baseline.mode='pace';});
    await sleep(10000);
    const raw=await page.evaluate(()=>{cs3Baseline.mode='off';return {identity:cs3Baseline.identity,frames:cs3Baseline.frames};});
    if(raw.frames.length<4)throw Error('No completed playable render window');
    row.identity=raw.identity;
    row.frameIntervalMs=distro(raw.frames.slice(1).map((x,k)=>x[0]-raw.frames[k][0]));
    row.renderSubmissionMs=distro(raw.frames.map(x=>x[1]));row.drawCalls=distro(raw.frames.map(x=>x[2]));
    row.triangles=distro(raw.frames.map(x=>x[3]));row.ratio=distro(raw.frames.map(x=>x[4]));
    row.navigationHtmlTransferBytes=await page.evaluate(()=>performance.getEntriesByType("navigation")[0]?.transferSize??null);
    row.transferredBytesAtEndOfPacing=await page.evaluate(()=>performance.getEntriesByType('resource').reduce((sum,e)=>sum+e.transferSize,0));
    await page.evaluate(()=>{cs3Baseline.mode='action';});await sleep(200);
    await controls(page);
    row.action=await page.evaluate(()=>{cs3Baseline.mode='off';return {frames:cs3Baseline.actions,audio:cs3Baseline.audio,inputs:cs3Baseline.inputs};});
    row.memory=await page.evaluate(()=>performance.memory&&({usedHeap:performance.memory.usedJSHeapSize,totalHeap:performance.memory.totalJSHeapSize}));
    if(level){
      row.selectedLevel=level;
      await page.screenshot({path:path.join(output,[level,profile,i].join('-')+'.jpg'),quality:85});
      await page.keyboard.press('Escape');
      if(await page.locator('#restart').isVisible())await page.locator('#restart').click();
      row.returnedToLobby=await page.locator('#start').isVisible();
    }
    row.after=environment();row.status='measured';
  }catch(err){row.status='incomplete';row.error=String(err.message).slice(0,680);row.visible=await page.locator('body').innerText({timeout:2000}).then(s=>s.slice(0,350)).catch(()=>null);}
  finally{fs.writeFileSync(path.join(output,[kind,profile,i].join('-')+'.json'),JSON.stringify(row,null,2));await page.close();}
  console.log(kind,profile,i,row.status,row.error||JSON.stringify(row.frameIntervalMs));
  if(row.status!=='measured')throw Error(row.error);
}
(async()=>{
  await new Promise(done=>server.listen(0,'127.0.0.1',done));const base='http://127.0.0.1:'+server.address().port;
  let browser,ctx;
  try{
    browser=await chromium.launch({headless:false,executablePath:'/usr/bin/chromium',args:['--no-sandbox','--ozone-platform=wayland','--use-angle=gl-egl',
      '--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-dev-shm-usage','--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE localhost, EXCLUDE 127.0.0.1']});
    ctx=await browser.newContext({locale:'en-US',serviceWorkers:'block',viewport:{width:844,height:390},deviceScaleFactor:.65,hasTouch:touch,isMobile:touch});
    await ctx.addInitScript(()=>{performance.setResourceTimingBufferSize(5000);
      localStorage.setItem('dc_settings',JSON.stringify({quality:'low',sv:8,lang:'en',fov:76,eco:false,dynres:false,tcAuto:false}));
      localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'low',volume:.55,mobileAutoFire:false}));
    });
    for(let i=0;i<Number(repeats);i++)await run(ctx,base,i+Number(offset),browser.version(),i>0);
  }finally{await ctx?.close();await browser?.close();server.closeAllConnections();server.close();}
})().catch(err=>{console.error(err);process.exitCode=1;});
