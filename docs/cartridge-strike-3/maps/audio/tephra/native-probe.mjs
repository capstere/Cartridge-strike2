// Serve the integrated map checkout on loopback. For a candidate audio checkout,
// CS3_AUDIO_OVERLAY=1 serves only its two audio modules and original Tephra clips.
import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';
import {chromium} from '../../../../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const root=new URL('../../../../../',import.meta.url);
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH,args:['--disable-gpu']});
const result={browser:browser.version(),device:'Raspberry Pi 5',pcm:'Browser render before device output',overlay:process.env.CS3_AUDIO_OVERLAY==='1',profiles:[]};
try {
  for(const coarse of [false,true]) {
    const context=await browser.newContext({hasTouch:coarse,isMobile:coarse});
    const page=await context.newPage();
    if(result.overlay)await page.route(/\/(?:src\/fps\/(?:coastal|tephra)-ambience\.mjs|assets\/fps\/maps\/tephra\/audio\/a_[a-z0-9-]+\.mp3)(?:\?.*)?$/,async route=>{
      const file=new URL(route.request().url()).pathname.slice(1);
      await route.fulfill({contentType:file.endsWith('.mp3')?'audio/mpeg':'text/javascript',body:await readFile(new URL(file,root))});
    });
    await page.route('**/__volcano-audio',route=>route.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script><button>Start audio</button>'}));
    await page.goto(new URL('/__volcano-audio',process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:18769').href);
    await page.evaluate(()=>document.querySelector('button').onclick=()=>{window.live=new AudioContext();window.started=live.resume();});
    await page.getByRole('button').click();
    const actual=await page.evaluate(async()=>{
      await started;
      const {createReferenceWorld}=await import('/src/fps/reference-world.mjs');
      const {AudioSystem}=await import('/src/fps/audio.mjs');
      const {emitTephraLightning}=await import('/src/fps/tephra-ambience.mjs');
      const project=await(await fetch('/levels/tephra.json')).json(),world=createReferenceWorld(project),audio=new AudioSystem(world,{volume:1});
      audio.context=live;audio.master=live.createGain();const listener={x:-18,y:1.65,z:5,ambient:true};
      const counts=scene=>({bytes:scene.bytes,voices:scene.voices.size,banks:scene.banks.size});
      const update=async()=>{await new Promise(r=>setTimeout(r,260));audio.updateAmbient(listener);};
      audio.updateListener(listener);audio.updateAmbient(listener);const scene=audio.seaside;await scene.ready;await update();
      const samples=[...scene.banks.values()].flat();const row={coarse:matchMedia('(any-pointer: coarse)').matches,...counts(scene),takes:samples.length,rates:[...new Set(samples.map(t=>t.buffer.sampleRate))],fixed:scene.loops.size,errors:scene.loadErrors};
      scene.timers.fill(0);await update();row.spots=[...scene.voices].filter(v=>v.spot).map(v=>v.take.replace(/-\d+$/,''));
      emitTephraLightning(world,1.5);emitTephraLightning(world,4);row.thunder=[...scene.voices].filter(v=>v.take.startsWith('a_thunder')).map(v=>v.take);
      audio.reset();emitTephraLightning(world,2);row.afterReset=counts(scene);
      audio.updateAmbient(listener);const other=audio.seaside;audio.updateAmbient({...listener,ambient:false});await other.ready;row.afterImmediateReturn=counts(other);
      await live.close();return row;
    });
    assert.equal(actual.coarse,coarse);assert.equal(actual.takes,10);assert.equal(actual.fixed,7);assert.equal(actual.voices,8);
    assert.equal(actual.banks,7);assert.deepEqual(actual.rates,[coarse?24000:32000]);assert.deepEqual(actual.errors,[]);
    assert.deepEqual(actual.spots,['a_boom','a_gust']);assert.equal(new Set(actual.thunder).size,2);
    assert.deepEqual(actual.afterReset,{bytes:0,voices:0,banks:0});assert.deepEqual(actual.afterImmediateReturn,actual.afterReset);
    result.profiles.push(actual);
    if(!coarse) {
      const pcm=await page.evaluate(async()=>{
        const {createReferenceWorld}=await import('/src/fps/reference-world.mjs');
        const {CoastalAmbience}=await import('/src/fps/coastal-ambience.mjs');
        const {emitTephraLightning}=await import('/src/fps/tephra-ambience.mjs');
        const {referenceVolcano}=await import('/src/fps/reference-volcano.mjs');
        const {Group,PerspectiveCamera}=await import('/vendor/three/three.module.js');
        const world=createReferenceWorld(await(await fetch('/levels/tephra.json')).json());
        const stream=(await fetch('/assets/fps/maps/tephra/environment.json.gz')).body.pipeThrough(new DecompressionStream('gzip'));
        const environment=await new Response(stream).json(),rows=[];
        for(const [label,x,z] of [['fumarole',-18,5],['laboratory',-10,-15],['beforeReturn',-18,5]]){
          const rate=48000,ctx=new OfflineAudioContext(3,5*rate,rate),merge=ctx.createChannelMerger(3);merge.connect(ctx.destination);
          const coast=new CoastalAmbience(ctx,ctx.createGain(),'tephra',false,()=>.4);const p={x,y:1.65,z};
          if(!world.canOccupy(x,z,.32,1.8,world.groundHeight(x,z,0)))throw Error('Invalid listener position');
          const roof=world.raycast({...p,y:p.y+.15},{x:0,y:1,z:0},6,{vision:true});
          await coast.ready;ctx.listener.setPosition(x,1.65,z);coast.update(p,world);
          coast.bed.gain.connect(merge,0,0);[...coast.loops.values()].find(v=>v.position[0]===-18.2).gain.connect(merge,0,1);
          // Exercise the same bolt transition that sets the renderer’s eruption uniform.
          const gpu=[],camera=new PerspectiveCamera(),signals=[];
          const advance=referenceVolcano(environment.volcano,new Group(),{graphics:'low',reducedMotion:false,reducedFlash:false},{value:0},gpu,delay=>{
            signals.push(delay);emitTephraLightning(world,delay);
          });
          let firstFlash=0;
          for(let tick=1;tick<=360;tick++){const flash=advance(camera,tick/60);if(flash&&!firstFlash)firstFlash=tick/60;}
          if(signals.length!==1)throw Error(`First real visual bolt emitted ${signals.length} thunder events`);
          const thunder=[...coast.voices].find(v=>v.take.startsWith('a_thunder'));thunder.gain.connect(merge,0,2);
          if(label==='beforeReturn'){coast.dispose();emitTephraLightning(world,2);}
          const sample=await ctx.startRendering(), rms=[];let firstSound=null,peak=0;
          for(let c=0;c<3;c++){const a=sample.getChannelData(c);let sq=0;for(let i=0;i<a.length;i++){
            if(i>=rate&&i<2*rate)sq+=a[i]*a[i];if(c===2){peak=Math.max(peak,Math.abs(a[i]));if(firstSound===null&&Math.abs(a[i])>1e-5)firstSound=i/rate;}
          }rms.push(Math.sqrt(sq/rate));}
          rows.push({label,x,z,roof:roof?.id??null,bedRms:rms[0],bubbleRms:rms[1],firstFlash,scheduledDelay:signals[0],firstAudibleThunder:firstSound,peak,take:thunder.take});
          coast.dispose();for(const obj of gpu)obj.dispose?.();
        }
        return rows;
      });
      const [fumarole,lab,returned]=pcm;assert.equal(fumarole.roof,null);assert(lab.roof);
      assert(fumarole.bedRms>lab.bedRms*1.4);assert(fumarole.bubbleRms>lab.bubbleRms*3);
      for(const r of [fumarole,lab]){assert(r.firstFlash>=5&&r.firstFlash<=5.2);assert(r.firstAudibleThunder>=r.scheduledDelay);assert(r.firstAudibleThunder<r.scheduledDelay+.8);assert(r.peak>0);}
      assert.equal(returned.firstAudibleThunder,null);assert.deepEqual([returned.peak,returned.bedRms,returned.bubbleRms],[0,0,0]);result.pcm=pcm;
    }
    await context.close();
  }
  const json=JSON.stringify(result,null,2)+'\n';console.log(json);if(process.env.CS3_TEPHRA_RESULT)await writeFile(process.env.CS3_TEPHRA_RESULT,json);
} finally {await browser.close();}
