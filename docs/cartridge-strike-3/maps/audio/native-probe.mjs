// Serve the checkout on loopback and set FPS_TEST_ORIGIN to that origin.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../../../../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:18769';
const browser = await chromium.launch({executablePath:process.env.CHROMIUM_PATH, args:['--disable-gpu']});
const receipt = {browser:browser.version(),device:'Raspberry Pi 5',pcm:'Chromium, before device output',profiles:[],samples:[]};
try {
  for (const coarse of [false,true]) {
    const context = await browser.newContext({hasTouch:coarse,isMobile:coarse});
    const page = await context.newPage();
    await page.route('**/__coast',route=>route.fulfill({contentType:'text/html',body:'<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script><button>Start audio</button>'}));
    await page.goto(new URL('/__coast',origin).href);
    await page.evaluate(()=>{
      document.querySelector('button').onclick = () => { window.live = new AudioContext({sampleRate:48000}); window.started = live.resume(); };
    });
    await page.getByRole('button').click();
    const evidence = await page.evaluate(async()=>{
      await started;
      const {AudioSystem} = await import('/src/fps/audio.mjs');
      const {createReferenceWorld} = await import('/src/fps/reference-world.mjs');
      const project = await (await fetch('/levels/meltem.json')).json();
      const meltem = createReferenceWorld(project);
      const target = {x:-33,y:1.65,z:12,id:'listener',ambient:true};
      const audio = new AudioSystem(meltem,{volume:1});
      audio.context = live; audio.master = live.createGain();
      const counts = scene => ({voices:scene.voices.size,banks:scene.banks.size,bytes:scene.bytes});
      const out = {coarse:matchMedia('(any-pointer: coarse)').matches,rows:[]};
      for (const mapId of ['meltem','embruns']) {
        audio.world = mapId==='meltem' ? meltem : {referenceId:mapId,raycast:()=>null};
        audio.updateListener(target); audio.updateAmbient(target);
        const scene = audio.seaside;
        await scene.ready;
        const next = async()=>{await new Promise(r=>setTimeout(r,270));audio.updateAmbient(target);};
        await next();
        const samples = [...scene.banks.values()].flat();
        const row = {mapId,...counts(scene),takes:samples.length,rates:[...new Set(samples.map(t=>t.buffer.sampleRate))],fixed:scene.loops.size,spotBanks:[],errors:scene.loadErrors};
        // Make each authored timer due independently; its normal random position and gain still apply.
        for (let i=0;i<scene.map.spots.length;i++) {
          for (const v of scene.voices) if (!v.loop) {v.source.stop();scene.release(v);}
          scene.timers.fill(1000);scene.timers[i]=0;
          await next();
          row.spotBanks.push([...scene.voices].find(v=>!v.loop)?.take.replace(/-\d+$/,''));
        }
        for (const v of scene.voices) if (!v.loop) {v.source.stop();scene.release(v);}
        scene.timers.fill(0);await next();row.maxSimultaneous=scene.voices.size;
        audio.setVolume(0);row.afterMute=counts(scene);
        audio.setVolume(1);audio.updateAmbient(target);const reentered=audio.seaside;
        audio.updateAmbient({...target,ambient:false});await reentered.ready;row.afterImmediateExit=counts(reentered);
        out.rows.push(row);
      }
      // Hold a real asset response until after a map change. Its decode can never start a stale source.
      const nativeFetch=window.fetch.bind(window);let release,arrived;
      const delayed=new Promise(r=>{arrived=r;});
      window.fetch=async(...args)=>{const response=await nativeFetch(...args);if(String(args[0]).endsWith('meltem/sea.mp3')){arrived();await new Promise(r=>{release=r;});}return response;};
      audio.world=meltem;audio.updateAmbient(target);const old=audio.seaside;await delayed;
      audio.world={referenceId:'embruns',raycast:()=>null};audio.updateAmbient(target);const current=audio.seaside;
      release();await Promise.all([old.ready,current.ready]);await new Promise(r=>setTimeout(r,270));audio.updateAmbient(target);
      out.switch={old:counts(old),current:counts(current),currentMap:current.mapId};
      audio.reset();out.switch.afterReset=counts(current);window.fetch=nativeFetch;await live.close();
      return out;
    });
    assert.equal(evidence.coarse,coarse);
    for(const row of evidence.rows){
      assert.equal(row.fixed,row.mapId==='meltem'?10:5);assert.equal(row.voices,1+row.fixed);
      assert.equal(row.takes,coarse?11:13);assert.deepEqual(row.rates,[coarse?24000:32000]);assert.deepEqual(row.errors,[]);
      assert.deepEqual(row.spotBanks,row.mapId==='meltem'?['a_gull','a_bell','a_goats','a_gust']:['a_gull','a_rigging','a_creak','a_buoybell','a_foghorn']);
      assert.equal(row.maxSimultaneous,1+row.fixed+3);
      for(const cleared of [row.afterMute,row.afterImmediateExit])assert.deepEqual(cleared,{voices:0,banks:0,bytes:0});
    }
    assert.deepEqual(evidence.switch.old,{voices:0,banks:0,bytes:0});assert.equal(evidence.switch.currentMap,'embruns');
    assert.equal(evidence.switch.current.voices,6);assert.deepEqual(evidence.switch.afterReset,{voices:0,banks:0,bytes:0});
    receipt.profiles.push(evidence);
    if(!coarse){
      receipt.samples = await page.evaluate(async()=>{
        const {CoastalAmbience} = await import('/src/fps/coastal-ambience.mjs');
        const {createReferenceWorld} = await import('/src/fps/reference-world.mjs');
        const world = createReferenceWorld(await (await fetch('/levels/meltem.json')).json());
        const rows=[];
        for(const [label,x,z] of [['waterfront',-33,12],['inland',20,0],['underQuayRoof',-27,16]]){
          const p={x,y:1.65,z};const y=world.groundHeight(x,z,0);if(!world.canOccupy(x,z,.3,1.8,y))throw Error('Invalid listener position');
          const roof=world.raycast({...p,y:p.y+.15},{x:0,y:1,z:0},6,{vision:true});
          const rate=48000,ctx=new OfflineAudioContext(4,2*rate,rate),merge=ctx.createChannelMerger(4);
          const all=ctx.createGain();all.connect(merge,0,3);merge.connect(ctx.destination);ctx.listener.setPosition(x,p.y,z);
          const coast=new CoastalAmbience(ctx,all,'meltem',false,()=>.4);await coast.ready;coast.update(p,world);
          coast.bed.gain.connect(merge,0,0);
          const waves=[...coast.loops.values()].find(v=>v.position[2]===12),split=ctx.createChannelSplitter(2);
          waves.gain.connect(split);split.connect(merge,0,1);split.connect(merge,1,2);
          const bytes=coast.bytes,samples=await ctx.startRendering();
          const rms=[];
          for(let c=0;c<4;c++){const a=samples.getChannelData(c);let sum=0;for(let i=rate;i<a.length;i++)sum+=a[i]**2;rms.push(Math.sqrt(sum/(a.length-rate)));}
          rows.push({label,x,z,roof:roof?.id??null,rms:{bed:rms[0],waveLeft:rms[1],waveRight:rms[2],mix:rms[3]},decodedBytes:bytes});coast.dispose();
        }
        return rows;
      });
      const [near,far,roof]=receipt.samples;
      assert.equal(near.roof,null);assert.equal(far.roof,null);assert(roof.roof);
      assert(near.rms.bed>far.rms.bed*5);assert(near.rms.bed>roof.rms.bed*1.5);
      assert(near.rms.waveRight>near.rms.waveLeft*1.5);assert(near.rms.mix>0 && far.rms.mix>0 && roof.rms.mix>0);
    }
    await context.close();
  }
  const json=JSON.stringify(receipt,null,2)+'\n';
  if(process.env.CS3_COASTAL_RESULT)await writeFile(process.env.CS3_COASTAL_RESULT,json);
  console.log(json);
} finally { await browser.close(); }
