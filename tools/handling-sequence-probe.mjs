// Native tab compositor frames + the game's own master bus. Nothing outside the
// local test tab is captured. Performance comparisons run separately.
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function captureLiveSequence(page,out){
  const cdp=await page.context().newCDPSession(page);
  const send=(type,touchPoints)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints});
  const dir=join(out,'sequence');mkdirSync(dir,{recursive:true});
  const frames=[];
  cdp.on('Page.screencastFrame',({sessionId,data,metadata})=>{
    const file='frame-'+String(frames.length).padStart(4,'0')+'.jpg';
    writeFileSync(join(dir,file),Buffer.from(data,'base64'));
    frames.push({file,stamp:metadata.timestamp});
    cdp.send('Page.screencastFrameAck',{sessionId}).catch(()=>{});
  });
  try{
    await page.evaluate(()=>{
      const f=__fps,g=f.game,p=g.player;
      Object.assign(p,{x:36.9236,y:0,z:14.27635,onGround:true,vy:0});
      f.settings.reducedFlash=false;f.settings.reducedMotion=false;f.settings.mobileAutoFire=false;
      p.inventory.primary=g.weaponItem('cr4');p.inventory.primary.ammo=7;g.select('cr4');
      f.step({yaw:Math.PI,pitch:0},1/60);
    });
    await page.locator('#mobile-more').tap();await page.getByRole('button',{name:'Toggle tactical map'}).tap();
    await page.waitForFunction(()=>__fps.audio.context?.state==='running' && __fps.audio.reuseBuffers.size>14);
    const audioStart=await page.evaluate(async()=>{
      const f=__fps,sys=f.audio,dest=sys.context.createMediaStreamDestination();
      // Duplicate the master output only into a local MediaRecorder. The audio
      // settings, listener, spatial voices and normal output graph stay active.
      sys.master.connect(dest);
      const chunks=[],rec=new MediaRecorder(dest.stream,{mimeType:'audio/webm;codecs=opus',audioBitsPerSecond:96000});
      const state=window.handlingCapture={frames:[],audio:[],stop:null,active:true};
      const ended=new Promise(resolve=>{rec.onstop=resolve;});
      rec.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};
      const started=new Promise(resolve=>{rec.onstart=()=>resolve((performance.timeOrigin+performance.now())/1000);});
      const original=sys.play;
      sys.play=function(e){
        if(['shot','reload','flash','throw','step'].includes(e.type))state.audio.push([performance.now(),e.time,e.type,e.actorId]);
        return original.call(this,e);
      };
      function sample(){
        const p=f.game.player;
        state.frames.push([performance.now(),f.game.state.time,p.x,p.z,p.rushWeight,p.flash,f.game.item()?.ammo,
          document.getElementById('reload-text').textContent,Number(document.getElementById('flash-overlay').style.opacity)]);
        if(state.active)requestAnimationFrame(sample);
      }
      state.stop=async()=>{
        state.active=false;rec.stop();await ended;sys.master.disconnect(dest);
        for(const t of dest.stream.getTracks())t.stop();sys.play=original;
        const bytes=new Uint8Array(await new Blob(chunks).arrayBuffer());
        return {data:bytes.toBase64(),frames:state.frames,audio:state.audio,epoch:performance.timeOrigin};
      };
      rec.start();requestAnimationFrame(sample);
      return started;
    });
    await cdp.send('Page.startScreencast',{format:'jpeg',quality:76,maxWidth:633,maxHeight:293,everyNthFrame:1});
    const b=await page.locator('[data-mobile-stick-zone]').boundingBox(),button=await page.locator('[data-mobile-action=fire]').boundingBox();
    const stick={x:b.x+b.width*.43,y:b.y+b.height*.65,id:1},outer={...stick,y:stick.y-75};
    const fire={x:button.x+button.width/2,y:button.y+button.height/2,id:2};
    const startRush=async()=>{await send('touchStart',[stick]);await send('touchMove',[outer]);};
    await delay(420);await startRush();
    await page.waitForFunction(()=>__fps.game.player.rushWeight>.85);await delay(450);
    await send('touchStart',[outer,fire]);await send('touchEnd',[]);
    await page.waitForFunction(()=>__fps.game.item().ammo===6 && document.getElementById('reload-text').textContent==='RELOAD');
    await page.evaluate(()=>{
      const g=__fps.game,p=g.player,other=g.actors.find(a=>a!==p&&a.alive);
      Object.assign(other,{x:p.x,z:p.z+1.3,y:0,yaw:Math.PI,pitch:-1.45,weapon:'flash',lastWeapon:'knife',nextShot:0});
      other.inventory.flash=1;
      if(!g.fire(other,true))throw Error('Incoming flash was not launched');
    });
    await page.waitForFunction(()=>!document.getElementById('grenade-danger').hidden);
    await page.waitForFunction(()=>Number(document.getElementById('flash-overlay').style.opacity)>.3);
    await startRush();await page.waitForFunction(()=>__fps.game.player.rushWeight>.7);await delay(240);await send('touchEnd',[]);
    await page.locator('[data-mobile-action=reload]').tap();
    await page.waitForFunction(()=>__fps.game.item().ammo===30);await delay(320);
    const audio=await page.evaluate(()=>handlingCapture.stop());await cdp.send('Page.stopScreencast');
    writeFileSync(join(dir,'game-audio.webm'),Buffer.from(audio.data,'base64'));
    const active=frames.filter((row,i)=>Number.isFinite(row.stamp)&&(i===0||row.stamp>frames[i-1].stamp));
    assert(active.length>=15);assert(audio.frames.some(row=>row[4]>.65&&row[5]>0&&row[6]===6));
    assert(audio.audio.some(row=>row[2]==='flash')&&audio.audio.some(row=>row[2]==='shot'));
    // Each JPEG is an actual compositor frame. Preserve the time it remained
    // on screen, including the milliseconds before the first submitted frame.
    let manifest='ffconcat version 1.0\n';
    for(let i=0;i<active.length;i++){
      const previous=i===0?audioStart:active[i].stamp;
      const until=active[i+1]?.stamp??(audio.epoch+audio.frames.at(-1)[0])/1000;
      manifest+="file '"+active[i].file+"'\nduration "+Math.max(.001,until-previous).toFixed(5)+'\n';
    }
    manifest+="file '"+active.at(-1).file+"'\n";
    writeFileSync(join(dir,'frames.ffconcat'),manifest);
    writeFileSync(join(dir,'timeline.json'),JSON.stringify({audioStart,epoch:audio.epoch,
      submitted:active,frames:audio.frames,audio:audio.audio},null,2));
    console.log('Recorded real-time native touch sequence',active.length,'compositor frames');
  }finally{await cdp.detach();}
}
