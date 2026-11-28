// Uncut capture of the native WebGL view and its real game master bus. The
// timestamp index identifies each normal-input family without drawing on video.
import assert from 'node:assert/strict';
import {writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {WEAPONS} from '../src/fps/config.mjs';

export async function captureFamilySequence(page,out){
  await page.waitForFunction(()=>__fps.audio.context?.state==='running' && __fps.audio.reuseBuffers.size>=22 && __fps.audio.recordedFoley.size===3);
  await page.evaluate(async()=>{
    const f=__fps,g=f.game,sys=f.audio,p=g.player;
    const canvas=document.getElementById('game').captureStream(15),dest=sys.context.createMediaStreamDestination();
    sys.master.connect(dest);
    const capture=new MediaStream([...canvas.getVideoTracks(),...dest.stream.getAudioTracks()]);
    const recorder=new MediaRecorder(capture,{mimeType:'video/webm;codecs=vp8,opus',videoBitsPerSecond:670000,audioBitsPerSecond:96000});
    const movie=window.familyFilm={events:[],sections:[],voices:[],started:0},chunks=[];
    const known=new Map([...sys.recordedFoley,...sys.reloadFoley.buffers,...sys.reuseBuffers].map(([name,buffer])=>[buffer,name]));
    const originalEmit=g.emit,originalTrack=sys.track;
    const now=()=>Math.round((performance.now()-movie.started)*10)/10;
    g.emit=function(kind,actor,detail){
      const event=originalEmit.call(this,kind,actor,detail);
      if(actor===p && ['shot','switch','reload','rocket-launch','cartridge-latch','throw','plant','planted'].includes(kind)){
        movie.events.push({kind,weapon:event.weapon||p.weapon,sim:event.time,wallMs:now()});
      }
      return event;
    };
    sys.track=function(source,channel,duration,offset){
      const result=originalTrack.call(this,source,channel,duration,offset);
      if(!source.buffer)return result;
      let name=known.get(source.buffer);
      if(!name){
        // Additional POV takes can finish decoding while the film is running.
        name=[...sys.reuseBuffers].find(([,buffer])=>buffer===source.buffer)?.[0];
        if(name)known.set(source.buffer,name);
      }
      if(name)movie.voices.push({name,weapon:p.weapon,sim:g.state.time,wallMs:now(),sourceOffset:offset||0});
      return result;
    };
    const stopped=new Promise(resolve=>{recorder.onstop=resolve;});
    recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
    movie.mark=(weapon,action)=>movie.sections.push({weapon,action,sim:g.state.time,wallMs:now(),ammo:g.item()?.ammo,reserve:g.item()?.reserve});
    const deadline=setTimeout(()=>{if(recorder.state==='recording')recorder.stop();},90000);
    movie.stop=async()=>{
      clearTimeout(deadline);if(recorder.state==='recording')recorder.stop();await stopped;
      g.emit=originalEmit;sys.track=originalTrack;
      sys.master.disconnect(dest);for(const track of capture.getTracks())track.stop();
      const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());
      return {data:bytes.toBase64(),sections:movie.sections,events:movie.events,voices:movie.voices};
    };
    const start=new Promise(resolve=>{recorder.onstart=()=>{movie.started=performance.now();resolve();};});
    recorder.start();await start;
  });
  const mark=(weapon,action)=>page.evaluate(([weapon,action])=>familyFilm.mark(weapon,action),[weapon,action]);
  const fire=async()=>{await page.mouse.down();await page.mouse.up();};
  const waitReady=weapon=>page.waitForFunction(weapon=>{
    const g=__fps.game,p=g.player;return p.alive && p.weapon===weapon && g.state.time>=p.nextShot && !p.reloadUntil;
  },weapon);
  let report;
  try{
    for(const weapon of ['p9','p12','cr4','ar47','smg','shotgun','sniper','bazooka']){
      const spec=WEAPONS[weapon],slot=spec.slot==='pistol'?'2':'1';
      await page.keyboard.press('3');await waitReady('knife');
      await page.evaluate(({weapon,slot})=>{
        const f=__fps,g=f.game,p=g.player,item=g.weaponItem(weapon);
        item.ammo=Math.min(2,item.ammo);p.inventory[slot]=item;
        Object.assign(p,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
        // Configure the initial camera only; all subsequent actions use input.
        f.step({yaw:Math.PI,pitch:weapon==='bazooka'?.72:0},1/60);
      },{weapon,slot:spec.slot});
      await mark(weapon,'select');await page.keyboard.press(slot);await waitReady(weapon);
      await mark(weapon,'inspect');await page.keyboard.press('v');
      await page.waitForFunction(()=>__fps.renderer.inspectUntil>__fps.game.state.time);await delay(340);
      await mark(weapon,'fire');await fire();
      await page.waitForFunction(ammo=>__fps.game.item().ammo===ammo,spec.magazine>1?1:0);
      if(spec.magazine>1){
        await delay(weapon==='sniper'?710:weapon==='shotgun'?570:140);
        await mark(weapon,'tactical reload');await page.keyboard.press('r');
        await page.waitForFunction(()=>__fps.game.player.reloadUntil>__fps.game.state.time);
        await delay(spec.reload*360);
        await mark(weapon,'cancel with knife');await page.keyboard.press('3');await waitReady('knife');
        await page.keyboard.press(slot);await waitReady(weapon);
        assert.equal(await page.evaluate(()=>__fps.game.item().ammo),1);
        await mark(weapon,'final round');await fire();
        await page.waitForFunction(()=>__fps.game.item().ammo===0);
      }
      await mark(weapon,'empty reload');await page.keyboard.press('r');
      await page.waitForFunction(()=>__fps.game.player.reloadUntil>__fps.game.state.time);
      await page.waitForFunction(mag=>__fps.game.item().ammo===mag && !__fps.game.player.reloadUntil,spec.magazine);
      await mark(weapon,'ready');await delay(130);
    }
    await mark('knife','select');await page.keyboard.press('3');await waitReady('knife');
    await mark('knife','swing');await fire();
    await page.waitForFunction(()=>familyFilm.events.some(e=>e.kind==='shot' && e.weapon==='knife'));
    await delay(500);await mark('knife','ready');
    // Restrict the fixture to stocked Solo cartridges. Normal slot-four input,
    // manual hold, release and return exercise the same original viewmodel.
    for(const grenade of ['smoke','flash','he']){
      await page.evaluate(grenade=>{
        const g=__fps.game,p=g.player;
        p.inventory.smoke=p.inventory.flash=p.inventory.he=0;p.inventory[grenade]=1;
      },grenade);
      await mark(grenade,'select');await page.keyboard.press('4');await waitReady(grenade);
      await mark(grenade,'pull and hold');await page.mouse.down();
      await page.waitForFunction(()=>__fps.game.player.cartridge?.latched===true);await delay(250);
      await mark(grenade,'release');await page.mouse.up();await waitReady('knife');
      await mark(grenade,'return');await delay(100);
    }
    await page.evaluate(()=>{
      const g=__fps.game,p=g.player,site=g.world.anchors.bomb;
      if(g.bomb.carrierId!==p.id)throw Error('Expected the normal Classic carrier');
      Object.assign(p,{x:site.x,y:site.y??0,z:site.z,onGround:true,vy:0});
      __fps.step({yaw:p.yaw,pitch:0},1/60);
    });
    await mark('bomb','select');await page.keyboard.press('5');await waitReady('bomb');
    await mark('bomb','inspect');await page.keyboard.press('v');
    await page.waitForFunction(()=>__fps.renderer.inspectWeapon==='bomb' && __fps.renderer.inspectUntil>__fps.game.state.time);
    await delay(820);await mark('bomb','plant');await page.keyboard.down('e');
    try{await page.waitForFunction(()=>__fps.game.bomb.status==='planted');}
    finally{await page.keyboard.up('e');}
    await mark('bomb','planted');await delay(250);
  }finally{
    report=await page.evaluate(()=>familyFilm.stop());
    const {data,...index}=report;
    writeFileSync(join(out,'family-sequence.webm'),Buffer.from(data,'base64'));
    writeFileSync(join(out,'family-sequence.json'),JSON.stringify(index,null,2));
  }
  verifyFamilySequence(report);
  console.log('Recorded uncut keyboard and mouse family sequence',report.sections.length,'markers');
}

export function verifyFamilySequence(report){
  assert(report.sections.at(-1).wallMs<90000,'the last normal input is in the recording');
  for(const weapon of ['p9','p12','cr4','ar47','smg','shotgun','sniper','bazooka']){
    const shots=report.events.filter(e=>e.kind==='shot' && e.weapon===weapon);
    const reloads=report.events.filter(e=>e.kind==='reload' && e.weapon===weapon);
    const expected=weapon==='bazooka'?1:2;
    assert.equal(shots.length,expected,weapon+' visible shots');assert.equal(reloads.length,expected,weapon+' reload actions');
    const voices=report.voices.filter(v=>v.weapon===weapon).map(v=>v.name);
    if(weapon!=='bazooka'){
      const shots=voices.filter(v=>v.includes('_pov-'));
      assert.equal(shots.length,2,weapon+' audible POV shots');
      assert.equal(new Set(shots).size,2,weapon+' both alternating donor takes');
    }
    const cycle={cr4:['charge_rifle-2',1],ar47:['charge_rifle-1',1],smg:['charge_rifle-1',1],
      sniper:['bolt-1',2],shotgun:['pump-1',2]}[weapon];
    if(cycle)assert.equal(voices.filter(name=>name===cycle[0]).length,cycle[1],weapon+' recorded action cycles');
  }
  for(const grenade of ['smoke','flash','he']){
    const segment=report.sections.filter(r=>r.weapon===grenade);
    assert.equal(segment.length,4);
    assert(report.voices.some(v=>v.name==='foley/f_pin.mp3' && v.wallMs>=segment[1].wallMs && v.wallMs<=segment[3].wallMs),grenade+' pin sound in the actual clip');
  }
  assert.equal(report.events.filter(e=>e.kind==='shot' && e.weapon==='knife').length,1);
  assert.equal(report.events.filter(e=>e.kind==='planted').length,1);
}
