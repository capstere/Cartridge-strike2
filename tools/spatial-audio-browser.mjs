// Serve the working tree over loopback, then run this file. Measures the
// rendered Web Audio signal before the device mixer, display and loudspeaker.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH});
try {
  const page=await browser.newPage();
  await page.route('**/__audio-probe',route=>route.fulfill({contentType:'text/html',body:
    '<script type="importmap">{"imports":{"three":"/vendor/three/three.module.js","three/addons/":"/vendor/three/addons/"}}</script>'}));
  await page.goto(new URL('/__audio-probe',origin).href);
  const rows=await page.evaluate(async()=>{
    const {AudioSystem}=await import('/src/fps/riposte-audio.mjs');
    const runs=[];
    for(const weapon of ['cr4','p9'])for(const distance of [0,8,48]){
      const bank=weapon==='cr4'?'rifle':'glock';
      const key=distance>=40?'g_far_'+(weapon==='cr4'?'rifle':'pistol'):'g_'+bank+'_'+(distance?'near':'pov');
      const audio=new AudioSystem(null,{volume:1});
      const rate=48000,ctx=new OfflineAudioContext(2,rate*2,rate);
      audio.context=ctx;audio.master=ctx.createGain();audio.master.connect(ctx.destination);
      audio.listener={x:0,y:0,z:0};audio.listenerId='self';
      await audio.loadTake('armes/'+key+'-1.mp3');
      const event={weapon,actorId:distance?'remote':'self',type:'shot',x:0,y:0,z:-distance};
      const starts=[];
      const original=audio.track.bind(audio);
      audio.track=(source,channel,duration,offset)=>{
        const name=[...audio.reuseBuffers].find(([,buffer])=>buffer===source.buffer)?.[0];
        starts.push({name,time:channel.when,offset,channels:source.buffer.numberOfChannels});
        original(source,channel,duration,offset);
      };
      audio.play(event);
      await audio.extraLoad;
      // A second event after the optional decode uses the other recording.
      const split=ctx.suspend(1);
      const rendered=ctx.startRendering();
      await split;
      audio.play(event);
      await ctx.resume();
      const output=await rendered, samples=output.getChannelData(0);
      const peak=samples.subarray(0,rate).reduce((p,v)=>Math.max(p,Math.abs(v)),0);
      const index=samples.findIndex(v=>Math.abs(v)>.03*peak);
      const secondPeak=samples.subarray(rate).reduce((p,v)=>Math.max(p,Math.abs(v)),0);
      runs.push({weapon,distance,bank:key,starts,firstPcmMs:index*1000/rate,peak,secondPeak,errors:audio.errors});
      await audio.dispose();
    }
    // The handling timeline emits one latch marker at the authored pull time.
    // Render that event through the same loader and positional channel as play.
    const latch = new AudioSystem(null,{volume:1});
    const latchContext = new OfflineAudioContext(1,24000,48000);
    latch.context=latchContext; latch.master=latchContext.createGain(); latch.master.connect(latchContext.destination);
    latch.listener={x:0,y:0,z:0}; latch.listenerId='self';
    await latch.loadTake('foley/f_pin.mp3');
    latch.play({type:'cartridge-latch',actorId:'self',x:0,y:0,z:0});
    const latchBuffer=await latchContext.startRendering(), samples=latchBuffer.getChannelData(0);
    const peak=samples.reduce((p,v)=>Math.max(p,Math.abs(v)),0);
    runs.push({latch:true,sources:latch.reuseStats.played,firstPcmMs:samples.findIndex(v=>Math.abs(v)>.03*peak)/48,peak,errors:latch.errors});
    await latch.dispose();
    // Render the whole flash event, then measure after its short blast has ended.
    const flash = [];
    for (const [label,distance,clear,reduced] of [
      ['near',2,true,false],['reduced',2,true,true],['wall',2,false,false],['far',20,true,false],['reset',2,true,false]
    ]) {
      const audio=new AudioSystem({segmentClear:()=>clear},{volume:1,reducedFlash:reduced});
      const rate=48000,ctx=new OfflineAudioContext(1,rate*4,rate);
      audio.context=ctx; audio.master=ctx.createGain(); audio.master.connect(ctx.destination);
      audio.updateListener({id:'self',x:0,y:0,z:0});
      audio.play({type:'flash',x:0,y:0,z:-distance});
      const ringStarted=!!audio.flashVoice;
      if(label==='reset')audio.reset();
      const data=(await ctx.startRendering()).getChannelData(0);
      const rms=(start,end)=>{
        const slice=data.subarray(Math.round(rate*start),Math.round(rate*end));
        return Math.sqrt(slice.reduce((sum,value)=>sum+value*value,0)/slice.length);
      };
      const crossings=[];
      for(let i=Math.round(.45*rate);i<Math.round(.55*rate);i++)
        if(data[i]<0 && data[i+1]>=0)crossings.push(i);
      const frequency=crossings.length>1 ? rate*(crossings.length-1)/(crossings.at(-1)-crossings[0]) : 0;
      flash.push({label,ringStarted,frequency,early:rms(.45,.55),late:rms(1.8,1.9),tail:rms(3.6,3.8)});
      await audio.dispose();
    }
    runs.push({flash});
    // Pause must cancel the future arrival of a remotely scheduled shot.
    const audio=new AudioSystem(null,{}), ctx=new OfflineAudioContext(1,24000,48000);
    audio.context=ctx;audio.master=ctx.createGain();audio.master.connect(ctx.destination);
    audio.listener={x:0,y:0,z:0};audio.listenerId='self';
    await audio.loadTake('armes/g_far_rifle-1.mp3');
    audio.play({type:'shot',weapon:'cr4',actorId:'remote',x:0,y:0,z:-48});
    audio.reset();
    const output=await ctx.startRendering();
    const silence=output.getChannelData(0).every(value=>value===0);
    await audio.extraLoad;await audio.dispose();
    runs.push({cancelled:true,silence,remaining:audio.active.size});
    return runs;
  });
  const cancelled=rows.pop(), {flash}=rows.pop(), latch=rows.pop();
  const [near,reduced,wall,far,reset]=flash;
  assert(near.ringStarted && near.frequency>3050 && near.frequency<3160);
  assert(near.early>near.late && near.late>0 && near.tail===0);
  assert(reduced.early>0 && reduced.early<near.early*.3 && reduced.late===0);
  assert(wall.early>reduced.early && wall.early<near.early);
  assert(!far.ringStarted && far.early===0);
  assert(reset.ringStarted && reset.early===0 && reset.tail===0);
  assert.deepEqual(latch.errors,[]);
  assert.equal(latch.sources,1);
  assert(latch.peak>0 && latch.firstPcmMs>=0 && latch.firstPcmMs<120);
  assert.deepEqual(cancelled,{cancelled:true,silence:true,remaining:0});
  for(const {distance,bank,starts,firstPcmMs,peak,secondPeak,errors} of rows){
    assert.deepEqual(errors,[]);
    assert.deepEqual(starts.map(start=>start.name),[1,2].map(i=>`armes/${bank}-${i}.mp3`));
    const expected=distance/343;
    assert(Math.abs(starts[0].time-expected)<1e-9);
    assert(peak>0 && secondPeak>0);
    assert(firstPcmMs>=expected*1000-1 && firstPcmMs<expected*1000+40);
  }
  const receipt={browser:browser.version(),sampleRate:48000,rows,latch,flash,cancelled};
  if(process.env.CS3_AUDIO_RESULT)await writeFile(process.env.CS3_AUDIO_RESULT,JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
}finally{await browser.close();}
