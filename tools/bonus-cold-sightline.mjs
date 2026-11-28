// Diagnostic-only observer of an otherwise normally scheduled network match.
import assert from 'node:assert/strict';
import {writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

async function install(actorId) {
  const {Renderer} = await import('/src/fps/render.mjs?v=floor5-environment-1');
  const clock = () => performance.now();
  const result = {origin:performance.timeOrigin,events:[],raf:[],frames:[],patches:[],longTasks:[],resources:[],gpu:[],stages:[],glSlow:[],slowDraws:[]};
  result.startup={...window.coldStartup,armed:clock()};
  const state = () => ({focus:document.hasFocus(),visibility:document.visibilityState,
    pausePanel:!document.getElementById('pause').hidden,paused:streakSession.view.state.paused});
  const event = type => result.events.push({type,t:clock(),...state()});
  for(const type of ['visibilitychange','blur','focus']){
    (type==='visibilitychange'?document:window).addEventListener(type,()=>event(type));
  }
  const frame = stamp => {result.raf.push([stamp,clock()]);requestAnimationFrame(frame);};
  requestAnimationFrame(frame);
  for(const [type,field] of [['longtask','longTasks'],['resource','resources']]){
    if(!PerformanceObserver.supportedEntryTypes.includes(type))continue;
    new PerformanceObserver(list=>{
      for(const e of list.getEntries())result[field].push({at:e.startTime,ms:e.duration,
        name:type==='resource'?new URL(e.name,location.href).pathname.split('/').pop():e.name});
    }).observe({type});
  }
  const session=streakSession,reported=new WeakSet();
  session.room.onStateChange(()=>result.patches.push([clock(),session.room.state.time]));
  const previous=Renderer.prototype.render;
  function stage(object,name,label,limit=2){
    const original=object[name];
    if(typeof original!=='function')return;
    object[name]=function(...args){
      const start=clock(),value=original.apply(this,args),end=clock();
      if(end-start>=limit)result.stages.push([label,start,end]);
      return value;
    };
  }
  stage(Renderer.prototype,'actorModel','actorModel');
  stage(Renderer.prototype,'updateLights','updateLights');
  stage(Renderer.prototype,'updateWeapon','updateWeapon');
  function instrumentGpu(gl){
    if(reported.has(gl))return;
    reported.add(gl);
    for(const name of ['getProgramParameter','getActiveUniform','getUniformLocation','getActiveAttrib','getAttribLocation',
      'getProgramInfoLog','getShaderParameter','getShaderInfoLog','useProgram','generateMipmap','drawElements','drawArrays',
      'drawElementsInstanced','drawArraysInstanced','copyTexSubImage2D','clear','finish','flush','getError','getParameter']){
      const call=gl[name];if(typeof call!=='function')continue;
      gl[name]=function(...args){
        const start=clock(),value=call.apply(this,args),end=clock();
        if(end-start>2)result.glSlow.push([name,start,end]);
        return value;
      };
    }
    for(const name of ['bufferData','bufferSubData','texImage2D','texSubImage2D','compressedTexImage2D',
      'compressedTexSubImage2D','texStorage2D','compileShader','linkProgram']){
      const call=gl[name];
      if(typeof call!=='function')continue;
      gl[name]=function(...args){
        const begin=clock(),value=call.apply(this,args),end=clock();
        result.gpu.push([name,begin,end]);
        return value;
      };
    }
  }
  const cap=HTMLCanvasElement.prototype.toDataURL;
  HTMLCanvasElement.prototype.toDataURL=function(...args){
    const start=clock(),value=cap.apply(this,args);result.events.push({type:'toDataURL',t:start,end:clock()});return value;
  };
  const remained = new WeakMap();
  Renderer.prototype.render=function(game,...args){
    const gpu=this.renderer, info=gpu.info, gl=gpu.getContext();
    if(!reported.has(gl)){
      result.renderer={backend:gl.getParameter(gl.getExtension('WEBGL_debug_renderer_info')?.UNMASKED_RENDERER_WEBGL||gl.RENDERER),
        parallelCompile:!!gl.getExtension('KHR_parallel_shader_compile'),mobile:this.settings.mobile,quality:this.quality,
        neutralLighting:this.neutralLighting,warmup:this.warmup,lights:this.lights.map(l=>l.visible),
        actorReady:this.operatorReady??null};
      const bufferDraw=gpu.renderBufferDirect;
      gpu.renderBufferDirect=function(camera,scene,geometry,material,mesh,...rest){
        const clockStart=clock(),value=bufferDraw.call(this,camera,scene,geometry,material,mesh,...rest),finish=clock();
        if(finish-clockStart>12){
          const names=[];for(let n=mesh;n && names.length<8;n=n.parent)if(n.name)names.push(n.name);
          const program=this.properties.get(material)?.currentProgram;
          result.slowDraws.push({t:clockStart,end:finish,material:material.name||material.type,path:names,
            program:program?.id,shader:program?.name,cacheKey:program?.cacheKey});
        }
        return value;
      };
      const native=gpu.render;
      gpu.render=function(scene,...other){
        const start=clock(),value=native.call(this,scene,...other),end=clock();
        result.stages.push([scene===thisEngine.scene?'world':'other pass',start,end]);return value;
      };
      const thisEngine=this;
    }
    instrumentGpu(gl);
    const start=clock(),sim=game.state.time,stats=()=>[info.memory.geometries,info.memory.textures,info.programs?.length];
    const before=stats(),value=previous.call(this,game,...args),end=clock();
    const actor=game.actors.find(a=>a.id===actorId),model=this.actors.get(actorId);
    let mesh=null;
    if(model?.visible && !remained.has(model)){
      let meshes=0,skinned=0;const geometry=new Set(),materials=new Set();
      model.traverse(o=>{if(o.isMesh){meshes++;if(o.isSkinnedMesh)skinned++;geometry.add(o.geometry);
        for(const m of [].concat(o.material||[]))materials.add(m);}});
      mesh={meshes,skinned,geometries:geometry.size,materials:materials.size};remained.set(model,true);
    }
    result.frames.push({start,end,sim,before,after:stats(),calls:info.render.calls,modelVisible:!!model?.visible,
      actor:actor?[actor.x,actor.z,actor.outfitId,actor.reloadStartedAt,actor.reloadDuration]:null,mesh,...state()});
    return value;
  };
  window.bonusColdAudit={result,event};
  event('armed');
}

async function turnWithTouch(page,actor,target){
  const cdp=await page.context().newCDPSession(page);
  const point=await page.evaluate(()=>{
    const look=document.querySelector('[data-mobile-look]');
    for(let y=.18;y<.8;y+=.05)for(let x=.52;x<.88;x+=.04){
      const px=innerWidth*x,py=innerHeight*y;
      if(document.elementFromPoint(px,py)===look)return {x:px,y:py,w:innerWidth};
    }
    throw Error('No unobstructed native touch look surface');
  });
  try{
    for(let i=0;i<10;i++){
      const angle=Math.atan2(Math.sin(target-actor.yaw),Math.cos(target-actor.yaw));
      if(Math.abs(angle)<.075)return;
      const dx=Math.max(-point.x+6,Math.min(point.w-point.x-6,-angle/(.0022*2.15)));
      const send=(type,x)=>cdp.send('Input.dispatchTouchEvent',{type,touchPoints:x===null?[]:[{x,y:point.y,id:1}]});
      await send('touchStart',point.x);
      for(let n=1;n<=4;n++){await send('touchMove',point.x+dx*n/4);await delay(22);}
      await send('touchEnd',null);await delay(110);
    }
    throw Error('Normal touch look did not reach the requested sightline');
  }finally{await cdp.detach();}
}

export async function startColdSightline(pages,owner,observer,game,position,focus,output){
  assert(output && ['owner','observer'].includes(focus));
  await Promise.all(pages.map(p=>p.evaluate(install,owner.id)));
  await delay(1700);
  const mark = type => Promise.all(pages.map(p=>p.evaluate(s=>bonusColdAudit.event(s),type)));
  const server=[],interval=setInterval(()=>server.push([performance.timeOrigin+performance.now(),game.state.time]),25);
  try{
    await mark('focus-request');
    await pages[focus==='owner'?0:1].bringToFront();
    await delay(500);
    const turn=process.env.CS3_BONUS_COLD_TURN==='1',yaw=Math.atan2(observer.x-position.x,observer.z-position.z);
    if(turn){
      await turnWithTouch(pages[1],observer,yaw+1.9);
      Object.assign(owner,{x:position.x,y:position.y??0,z:position.z,vy:0});
      await pages[1].waitForFunction(pos=>reloadCapture.warm.slice(-7).length===7 &&
        reloadCapture.warm.slice(-7).every(r=>!r.visible&&Math.hypot(r.x-pos.x,r.z-pos.z)<.2),
        position,{timeout:12000});
      await delay(500);
    }
    await mark('before-sightline');
    await Promise.all(pages.map(p=>p.evaluate(()=>{
      reloadCapture.trial='cold';reloadCapture.trials.cold={frames:[],cues:[],audioFrames:[]};
    })));
    const beforePlacement=performance.timeOrigin+performance.now();
    if(!turn)Object.assign(owner,{x:position.x,y:position.y??0,z:position.z,vy:0});
    // Both focus conditions use the same authoritative reload. Keyboard and mouse
    // input into the observer's own window would change the controlled focus.
    if(turn){
      await turnWithTouch(pages[1],observer,yaw);
      await pages[0].mouse.down();await delay(220);await pages[0].mouse.up();
      await pages[0].keyboard.press('r');
    }else{game.item(owner).ammo--;assert(game.reload(owner));}
    await delay(3400);
    // Read the first processed post-transition frame, too. An evaluate call can
    // otherwise retrieve the trace immediately after a long draw, before RAF/LoAF delivery.
    await Promise.all(pages.map(p=>p.evaluate(()=>new Promise(resolve=>
      requestAnimationFrame(()=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))))));
    await delay(1400);
    const views=await Promise.all(pages.map(p=>p.evaluate(()=>{
      const {capture,...reload}=reloadCapture.trials.cold;
      reloadCapture.trial=null;
      return {...bonusColdAudit.result,reload};
    })));
    await writeFile(join(output,'cold-sightline.json'),JSON.stringify({focus,turn,beforePlacement,server,views}));
  }finally{clearInterval(interval);}
}
