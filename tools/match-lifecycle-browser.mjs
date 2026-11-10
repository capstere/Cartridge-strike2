// Launch an isolated Chromium profile. Its default context preserves native tab
// visibility and blur events during an actual tab switch.
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {spawn} from 'node:child_process';
import {mkdtemp,readFile,rm,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import assert from 'node:assert/strict';

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const profile=await mkdtemp(join(tmpdir(),'cs2-lifecycle-'));
const child=spawn(chromium.executablePath(),['--headless=new','--remote-debugging-port=0',
  '--user-data-dir='+profile,'--no-first-run','--no-default-browser-check','--mute-audio','about:blank'],{stdio:'ignore'});
let browser;
try{
  let port;
  for(let i=0;i<100&&!port;i++){
    port=await readFile(join(profile,'DevToolsActivePort'),'utf8').catch(()=>null);
    if(!port)await sleep(100);
  }
  browser=await chromium.connectOverCDP('http://127.0.0.1:'+port.trim().split('\n')[0],{noDefaults:true});
  const context=browser.contexts()[0],page=context.pages()[0],cover=await context.newPage();
  const cd=await context.newCDPSession(page),audioNodes=new Set(),contexts=new Set(),errors=[];
  await page.bringToFront();
  await cd.send('Emulation.setDeviceMetricsOverride',{width:844,height:390,deviceScaleFactor:1,mobile:true});
  await cd.send('Emulation.setTouchEmulationEnabled',{enabled:true,maxTouchPoints:5});
  cd.on('WebAudio.contextCreated',({context})=>contexts.add(context.contextId));
  cd.on('WebAudio.contextWillBeDestroyed',({contextId})=>contexts.delete(contextId));
  cd.on('WebAudio.audioNodeCreated',({node})=>audioNodes.add(node.nodeId));
  cd.on('WebAudio.audioNodeWillBeDestroyed',({nodeId})=>audioNodes.delete(nodeId));
  await cd.send('WebAudio.enable');
  page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:.2}));
    const probe=window.lifecycleProbe={renderers:{},games:[],pending:new Map()};
    window.__THREE_DEVTOOLS__=new EventTarget();
    __THREE_DEVTOOLS__.addEventListener('observe',({detail:r})=>{
      if(r.isWebGLRenderer)probe.renderers[r.domElement.id]=new WeakRef(r);
    });
    const request=requestAnimationFrame.bind(window),cancel=cancelAnimationFrame.bind(window),owners=new WeakMap();
    window.requestAnimationFrame=fn=>{
      let owner=owners.get(fn);
      if(!owner){const stack=new Error().stack;owner=stack.includes('/lobby-stage.mjs')?'lobby':stack.includes('/app.mjs')?'game':'other';owners.set(fn,owner);}
      const id=request(t=>{probe.pending.delete(id);fn(t);});probe.pending.set(id,owner);return id;
    };
    window.cancelAnimationFrame=id=>{probe.pending.delete(id);cancel(id);};
  });
  const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
  await page.goto(origin+'/fps/?test&realtime&seed=42',{waitUntil:'domcontentloaded'});
  const rows=[];
  for(let i=-3;i<=20;i++){
    const mode=i%2===0?'endless':'classic';
    await page.locator('#lb-mode-seg [data-value='+mode+']').click();await page.locator('#start').click();
    await page.waitForFunction(()=>window.__fps?.game.player&&!document.querySelector('#hud').hidden&&document.querySelector('#cs-loading').hidden,null,{timeout:120000});
    const start=await page.evaluate(()=>{const g=__fps.game;lifecycleProbe.games.push(new WeakRef(g));return [g.state.mode,g.actors.length,g.state.zombies.length];});
    assert.deepEqual(start,[mode,10,4]);
    await page.keyboard.press('b');await page.locator('#shop [data-item=armor]').click();
    await page.locator('#return-buy').click();assert.equal(await page.evaluate(()=>__fps.game.player.armor),100);
    await page.keyboard.press('3');await page.keyboard.press(mode==='classic'?'2':'1');
    // Visit every resident rig and run Danceman's proximity loop before backgrounding.
    const visits=await page.evaluate(()=>{
      const f=__fps,g=f.game,p=g.player,home={x:p.x,z:p.z,yaw:p.yaw,pitch:p.pitch};
      g.state.buyDeadline=g.state.time;g.step(1/60);
      const result=[...g.state.zombies.slice(0,2),g.state.zombies.at(-1)].map(z=>{
        const pos=z.seat||z;Object.assign(p,{x:pos.x,z:pos.z-1.15,yaw:Math.PI,pitch:-.4});
        f.step({},0);const v=f.renderer.zombieVisuals.instances.get(z.id);
        return v.root.visible && v.root.getObjectByProperty('isSkinnedMesh',true).skeleton.boneTexture!=null;
      });
      if(!f.audio.floorAudio.music)throw Error('Danceman music missing near the final viewpoint');
      Object.assign(p,home);f.step({},0);return result;
    });
    assert.deepEqual(visits,[true,true,true]);
    await cover.bringToFront();
    await page.waitForFunction(()=>document.hidden&&__fps.game.state.paused,null,{polling:50});
    const paused=()=>page.evaluate(()=>[__fps.game.state.time,__fps.renderer.renderer.info.render.frame]);
    const before=await paused();await sleep(1050);assert.deepEqual(await paused(),before);
    await page.bringToFront();await page.locator('#resume').click();await page.keyboard.press('Escape');
    await page.locator('#restart').click();await sleep(850);
    await cd.send('HeapProfiler.collectGarbage');await sleep(100);await cd.send('HeapProfiler.collectGarbage');await sleep(150);
    const sample=await page.evaluate(()=>{
      const f=__fps,probe=lifecycleProbe,gpu={};
      for(const [id,ref] of Object.entries(probe.renderers)){
        const r=ref.deref();if(r)gpu[id]=[r.info.memory.geometries,r.info.memory.textures,r.info.programs.length];
      }
      return {gpu,instances:f.renderer.zombieVisuals.instances.size,retained:probe.games.filter(r=>r.deref()).length,
        music:!!f.audio.floorAudio.music,ambient:f.audio.ambient.length,voices:f.audio.active.size,pending:[...probe.pending.values()].sort()};
    });
    const row={i,mode,...sample,dom:await cd.send('Memory.getDOMCounters'),contexts:contexts.size,audioNodes:audioNodes.size};
    rows.push(row);console.log(JSON.stringify(row));
    assert.deepEqual(row.pending,['game','lobby']);assert.equal(row.instances,4);assert.equal(row.contexts,1);
    assert.equal(row.music,false);assert.equal(row.voices+row.ambient,0);assert.equal(row.retained,1);
  }
  const measured=rows.filter(r=>r.i>0);
  for(const row of measured){
    const warm=rows.findLast(r=>r.i<=0&&r.mode===row.mode);
    assert.equal(row.dom.jsEventListeners,warm.dom.jsEventListeners);assert.equal(row.audioNodes,warm.audioNodes);
    assert.deepEqual(row.gpu['lobby-stage'],warm.gpu['lobby-stage']);
  }
  // Shader/geometry caches can fill lazily after warmup. Check both modes at the tail.
  for(const mode of ['classic','endless']){
    const tail=measured.filter(r=>r.mode===mode).slice(-3);assert.deepEqual(tail[0].gpu,tail[2].gpu);
  }
  assert.deepEqual(errors,[]);
  if(process.env.FPS_LIFECYCLE_JSON)await writeFile(process.env.FPS_LIFECYCLE_JSON,JSON.stringify(rows,null,2));
}finally{
  if(browser){await (await browser.newBrowserCDPSession()).send('Browser.close').catch(()=>{});await browser.close();}
  child.kill();await sleep(250);await rm(profile,{recursive:true,force:true,maxRetries:4});
}
