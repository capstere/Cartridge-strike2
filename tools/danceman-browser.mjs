// Run through the normal lobby. The existing test clock and observer placement
// make the proximity, weapon and round-boundary checks repeatable on Pages.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const capture=process.env.FPS_CAPTURE_DIR;
if(capture)await mkdir(capture,{recursive:true});
const browser=await chromium.launch({channel:'chromium'});
try{
  for(const mode of ['classic','endless']){
    const mobile=mode==='endless',page=await browser.newPage({viewport:mobile?{width:844,height:390}:{width:1100,height:720},isMobile:mobile,hasTouch:mobile});
    const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(origin+'/fps/?test&seed=42',{waitUntil:'domcontentloaded'});
    await page.waitForFunction(()=>window.__fps,null,{timeout:150000});
    await page.evaluate(()=>{
      const a=__fps.audio,track=a.track.bind(a);window.starts=[];
      a.track=(s,c,...args)=>{
        if(s.buffer===a.floorAudio.buffers.get('prepare-to-fight')){
          if(!document.querySelector('#cs-loading').hidden || !document.querySelector('#menu').hidden)throw Error('Start line before gameplay');
          starts.push([a.game.state.round,a.game.phase]);
        }
        return track(s,c,...args);
      };
    });
    await page.locator('#lb-mode-seg [data-value='+mode+']').click();
    await page.locator('#start').click();
    await page.waitForFunction(()=>__fps.game.player && document.querySelector('#cs-loading').hidden);
    if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
    const report=await page.evaluate(async()=>{
      const f=__fps,g=f.game,a=f.audio;f.stopFrameLoop();await a.unlock();f.step({},0);
      const z=g.state.zombies.find(z=>z.model==='danceman'),p=g.player,w=g.world;
      if(g.phase==='buy'){
        if(starts.length)throw Error('Announced during buy');
        while(g.phase==='buy')f.step({},.1);
      }
      const home={x:p.x,y:p.y,z:p.z};
      function view(x,dz){
        p.x=x;p.y=0;p.z=dz;p.yaw=Math.atan2(p.x-z.x,p.z-z.z);p.pitch=-.12;
        f.step({},0);
      }
      view(z.x+.6,z.z+2.9);
      const v=f.renderer.zombieVisuals.instances.get(z.id),m=a.floorAudio.music;
      if(!m || !v.root.visible)throw Error('Missing near scene or loop');
      window.danceView=view;
      window.danceHome=home;
      const clips=[z.clip],where=[z.x,z.y,z.z];
      for(let i=0;i<4;i++){
        g.state.time=z.until-.009;f.step({},1/60);clips.push(z.clip);
      }
      await new Promise(r=>setTimeout(r,350));
      const near=m.channel.gain.gain.value;
      // Sample a more distant, unobstructed point down Sector H.
      view(z.x+3,z.z+6.8);await new Promise(r=>setTimeout(r,450));
      const away=a.floorAudio.music?.channel.gain.gain.value;
      const oneLoop=a.floorAudio.music.source===m.source;
      const anchor={x:z.x,y:z.y+1.15,z:z.z};
      let behind;
      for(let dx=-5;dx<=5 && !behind;dx+=.5)for(let dz=-5;dz<=5 && !behind;dz+=.5){
        const q={x:z.x+dx,y:1.58,z:z.z+dz};
        if(w.canOccupy(q.x,q.z,.24,1.7) && !w.segmentClear(q,anchor,{vision:false}))behind=q;
      }
      if(!behind)throw Error('No occluded nearby receiver');
      view(behind.x,behind.z);await new Promise(r=>setTimeout(r,450));
      const cutoff=m.channel.nodes[1].frequency.value;
      const volume=a.volume;a.setVolume(0);f.step({},0);
      const muted=!a.floorAudio.music;a.setVolume(volume);
      if(z.x!==where[0]||z.y!==where[1]||z.z!==where[2])throw Error('Danceman moved');
      if(v.root.position.x!==z.x||v.root.position.z!==z.z)throw Error('Render anchor drift');
      view(home.x,home.z);const stopped=!a.floorAudio.music;
      view(z.x+.6,z.z+2.9);
      return {clips,where,room:w.roomAt(z.x,z.z).id,players:g.actors.length,crowd:g.state.zombies.length,
        near,away,stopped,oneLoop,cutoff,muted,loop:m.source.loop,starts:[...starts],errors:a.errors,visible:v.root.visible};
    });
    assert.equal(report.room,'C08');assert.equal(report.crowd,mobile?4:6);assert.equal(report.players,10);
    assert.ok(report.visible&&report.stopped&&report.loop&&report.near>report.away&&report.away>0,JSON.stringify(report));
    assert.ok(report.clips.every((c,i)=>c!=='Dead'&&(!i||c!==report.clips[i-1])));
    assert.ok(report.oneLoop && report.muted && report.cutoff<1100,JSON.stringify(report));
    assert.deepEqual(report.starts,[[1,'active']]);assert.deepEqual(report.errors,[]);
    if(capture)await page.screenshot({path:capture+'/'+mode+'-dancing.jpg',type:'jpeg',quality:86});
    await page.keyboard.press('Escape');
    assert.ok(await page.evaluate(()=>!__fps.audio.floorAudio.music));
    await page.locator('#resume').click();
    const death=await page.evaluate(()=>{
      const f=__fps,g=f.game,p=g.player,a=f.audio,z=g.state.zombies.at(-1),v=f.renderer.zombieVisuals.instances.get(z.id);
      danceView(z.x+.6,z.z+2.9);g.select('pistol');p.nextShot=0;
      const snapshot=()=>JSON.stringify([p.kills,p.money,g.state.score,g.bomb.status,g.hostages.map(h=>[h.id,h.rescued])]);
      const before=snapshot(),hits=[];let n=0;
      while(z.alive && n++<12){
        p.yaw=Math.atan2(p.x-z.x,p.z-z.z);p.pitch=Math.atan2(z.y+.97-(p.y+p.height-.12),Math.hypot(p.x-z.x,p.z-z.z));
        f.step({fire:true,yaw:p.yaw,pitch:p.pitch},1/60);hits.push(z.hp);for(let i=0;i<4;i++)f.step({},.1);
      }
      const same=snapshot()===before;
      for(let i=0;i<35;i++)f.step({},.1);
      const dead={alive:z.alive,hits,same,clip:v.clip,final:v.final,time:v.current.time,music:!!a.floorAudio.music};
      return dead;
    });
    if(capture)await page.screenshot({path:capture+'/'+mode+'-dead.jpg',type:'jpeg',quality:86});
    const next=await page.evaluate(()=>{
      const f=__fps,g=f.game,p=g.player,z=g.state.zombies.at(-1),dead={};
      if(g.state.mode==='endless'){
        g.damage(p,10000,null);for(let i=0;i<45;i++)f.step({},.1);
        dead.respawn=p.alive && p.deaths>0 && !z.alive;
      }else{
        g.finishRound({winner:'analysts',reason:'elimination',at:g.state.time});
        for(let i=0;i<300 && g.state.round===1;i++)f.step({},.1);
        while(g.phase==='buy')f.step({},.1);
        dead.restored=g.state.zombies.at(-1).alive;
      }
      return {...dead,starts:[...starts]};
    });
    assert.ok(!death.alive&&death.same&&death.final&&!death.music&&death.hits.some(h=>h>0&&h<100),JSON.stringify(death));
    assert.equal(death.clip,'Dead');assert.ok(Math.abs(death.time-89/30)<1e-5);
    assert.ok(mobile?next.respawn:next.restored);assert.deepEqual(next.starts,mobile?[[1,'active']]:[[1,'active'],[2,'active']]);
    assert.deepEqual(errors,[]);console.log(JSON.stringify({mode,report,death,next}));
    await page.close();
  }
}finally{await browser.close();}
