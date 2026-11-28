import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';

// Read the visible model and actual WebGL canvas after each normal render.
async function instrumentation(page,id){
  await page.evaluate(async id=>{
    const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
    const {ReloadFoley}=await import('/src/fps/reload-foley.mjs');
    window.reloadCapture={actorId:id,trial:null,trials:{},warm:[]};
    const draw=Renderer.prototype.render;
    Renderer.prototype.render=function(game,...args){
      const result=draw.call(this,game,...args);
      const trace=reloadCapture.trials[reloadCapture.trial],actor=game.actors.find(a=>a.id===id);
      if(!actor)return result;
      const t=game.state.time,local=actor===game.player,model=local?this.weaponModel:this.actors.get(id);
      if(!trace){
        reloadCapture.warm.push({t,x:actor.x,z:actor.z,visible:!!model?.visible});if(reloadCapture.warm.length>16)reloadCapture.warm.shift();
        return result;
      }
      if(trace.frames.length>=145)return result;
      if(!actor.reloadDuration || !(actor.reloadUntil>t)){
        if(trace.frames.length && !trace.done)trace.done={time:t,duration:actor.reloadDuration,until:actor.reloadUntil};
        return result;
      }
      const p=(t-actor.reloadStartedAt)/actor.reloadDuration,avatar=model?.userData.avatar;
      const clip=avatar?.upper.get('Pistol_Reload');
      const frame={outfit:actor.outfitId,elapsed:t-actor.reloadStartedAt,fraction:p,visible:!!model?.visible,
        magazineMeters:local?model?.userData.magazine?.position.distanceTo(model.userData.magazineHome):null,
        thirdPersonFraction:!local&&clip?clip.time/(clip.getClip().duration-.001):null};
      trace.frames.push(frame);
      if(!trace.capture && p>=.22 && p<=.75 && frame.visible){
        const source=this.renderer.domElement,copy=document.createElement('canvas');
        copy.width=source.width;copy.height=source.height;
        copy.getContext('2d').drawImage(source,0,0);
        trace.capture={...frame,width:copy.width,height:copy.height,image:copy.toDataURL('image/webp',.86)};
      }
      return result;
    };
    const update=ReloadFoley.prototype.update;
    ReloadFoley.prototype.update=function(audio,previous,time,...args){
      const trace=reloadCapture.trials[reloadCapture.trial],actor=audio.game?.actors.find(a=>a.id===id);
      if(trace && actor?.reloadDuration && trace.audioFrames.length<160){
        trace.audioFrames.push({elapsed:time-actor.reloadStartedAt,previous:previous-actor.reloadStartedAt,running:audio.context?.state,
          paused:audio.game.state.paused,volume:audio.volume,decoded:this.buffers.has('magout_smg'),liveListener:args[1]?.alive});
      }
      return update.call(this,audio,previous,time,...args);
    };
    const play=ReloadFoley.prototype.play;
    ReloadFoley.prototype.play=function(audio,actor,cue,...args){
      const trace=reloadCapture.trials[reloadCapture.trial];
      if(!trace || actor.id!==id)return play.call(this,audio,actor,cue,...args);
      const track=audio.track;
      audio.track=function(source,...rest){
        trace.cues.push({take:cue.take,rate:source.playbackRate.value,elapsed:audio.game.state.time-actor.reloadStartedAt,
          seconds:rest[1],sampleRate:source.buffer.sampleRate,listener:audio.listenerId});
        return track.call(this,source,...rest);
      };
      try{return play.call(this,audio,actor,cue,...args);}finally{audio.track=track;}
    };
  },id);
}
export async function captureReloads({desktop,touch,game,owner,observer,output,wait}){
  const pages=[desktop,touch];
  await Promise.all(pages.map(p=>instrumentation(p,owner.id)));
  const eye={x:observer.x,y:observer.y+observer.height*.7,z:observer.z};
  const forward={x:-Math.sin(observer.yaw),z:-Math.cos(observer.yaw)};
  const nodes=game.world.navigation.nodes.map(p=>{
    const x=p.x-observer.x,z=p.z-observer.z,d=Math.hypot(x,z);
    return {p,d,f:(x*forward.x+z*forward.z)/d};
  }).filter(n=>n.d>1.1 && n.d<6 && n.f>.92 && game.world.segmentClear(eye,{x:n.p.x,y:(n.p.y??0)+1.3,z:n.p.z},{vision:true}));
  nodes.sort((a,b)=>Math.abs(a.d-2.6)-Math.abs(b.d-2.6));
  assert(nodes.length,'a clear placement in the normal observer camera');
  if(process.env.CS3_BONUS_COLD_FOCUS){
    const {startColdSightline}=await import('./bonus-cold-sightline.mjs');
    await startColdSightline(pages,owner,game,nodes[0].p,process.env.CS3_BONUS_COLD_FOCUS,output);
    return;
  }
  Object.assign(owner,{x:nodes[0].p.x,y:nodes[0].p.y??0,z:nodes[0].p.z,vy:0});
  await desktop.bringToFront();
  // Entering a fresh sightline can compile the visible operator's GPU programs.
  // Start paired measurements after both real views are drawing that same pose.
  await Promise.all(pages.map(p=>p.waitForFunction(pos=>{
    const rows=reloadCapture.warm.slice(-10);
    return rows.length===10&&rows.every(r=>r.visible&&Math.hypot(r.x-pos.x,r.z-pos.z)<.2)&&
      rows.slice(1).every((r,i)=>r.t-rows[i].t<.11);
  },{x:owner.x,z:owner.z},{timeout:22000})));
  const report={};
  for(const [name,expected] of [['ordinary',1.8],['rage',1.35]]){
    await Promise.all(pages.map(p=>p.evaluate(name=>{
      reloadCapture.trial=name;reloadCapture.trials[name]={frames:[],cues:[],audioFrames:[]};
    },name)));
    if(name==='rage'){
      await desktop.keyboard.press('j');await wait(()=>owner.bonus.active?.id==='rage','normal Rage keyboard activation');
    }
    const ammo=game.item(owner).ammo;
    await desktop.mouse.down();
    try{await wait(()=>game.item(owner).ammo<ammo,'normal input fires before reload');}finally{await desktop.mouse.up();}
    await desktop.keyboard.press('r');
    await wait(()=>owner.reloadDuration>0,'normal R starts authoritative reload');
    const accepted={start:owner.reloadStartedAt,duration:owner.reloadDuration,end:owner.reloadUntil};
    assert(Math.abs(accepted.duration-expected)<1e-7);
    await Promise.all(pages.map(p=>p.waitForFunction(name=>reloadCapture.trials[name]?.done,name)));
    const views=[];
    for(const [i,page] of pages.entries()){
      const trace=await page.evaluate(name=>reloadCapture.trials[name],name);
      if(output){const {capture,...diagnostic}=trace;await writeFile(join(output,name+(i?'-observer':'-owner')+'-trace.json'),JSON.stringify(diagnostic));}
      assert(trace.capture,'rendered '+name+' '+(i?'observer clip':'owner mechanism')+' at the magazine contact');
      const {image,...contactFrame}=trace.capture;
      if(output)await writeFile(join(output,name+(i?'-observer':'-owner')+'.webp'),Buffer.from(image.split(',')[1],'base64'));
      assert(trace.frames.every(f=>f.outfit==='shotgun'),'both clients preserve the selected Breacher through reload');
      assert(trace.frames.length>=3);assert(trace.frames.every(f=>f.fraction>=-1e-7 && f.fraction<=1.000001));
      if(i)assert(trace.frames.some(f=>f.visible&&Math.abs(f.thirdPersonFraction-f.fraction)<.025));
      else assert(trace.frames.some(f=>f.magazineMeters>.025));
      assert(trace.cues.some(c=>c.take==='magout_smg'&&Math.abs(c.rate-1.8/expected)<1e-7),'actual magazine voice at accepted rate: '+name+' '+(i?'observer':'owner')+' '+JSON.stringify(trace.cues));
      views.push({contactFrame,frames:trace.frames,cues:trace.cues,completion:trace.done});
    }
    report[name]={accepted,owner:views[0],observer:views[1]};
  }
  if(output)await writeFile(join(output,'rage-reload.json'),JSON.stringify(report,null,2)+'\n');
  console.log('PASS native shortened and ordinary reload contacts on local and remote models');
}
