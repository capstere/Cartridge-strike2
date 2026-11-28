// Browser-only diagnostics for the first visible HUD after ordinary room admission.
// The accompanying test runner still owns the normal animation loop and room rules.
export function startAdmissionTrace(detailed) {
  const probe=window.admissionTrace={detailed,spans:[],tasks:[],firstVisibleCallback:null};
  if(!detailed)return;
  const record=window.requestAnimationFrame.bind(window);
  const hudVisible=()=>document.getElementById('hud')?.hidden===false;
  const inWindow=()=>window.coldStartup?.markers.some(([name])=>name==='join requested')&&
    hudVisible()&&(probe.firstVisibleCallback===null||performance.now()-probe.firstVisibleCallback<8000);
  probe.recording=inWindow;
  window.requestAnimationFrame=function(callback){
    return record(function(stamp){
      if(!inWindow())return callback.call(this,stamp);
      const start=performance.now();probe.firstVisibleCallback??=start;
      try{return callback.call(this,stamp);}
      finally{
        const end=performance.now();
        if(end-start>=5)probe.spans.push({layer:'raf',name:callback.name||'anonymous',stamp,start,end});
      }
    });
  };
  for(const kind of ['longtask','long-animation-frame']){
    if(!PerformanceObserver.supportedEntryTypes.includes(kind))continue;
    new PerformanceObserver(list=>{
      if(probe.firstVisibleCallback===null)return;
      for(const entry of list.getEntries()){
        if(entry.startTime+entry.duration<probe.firstVisibleCallback-200||
           entry.startTime>probe.firstVisibleCallback+8000)continue;
        probe.tasks.push({kind,start:entry.startTime,duration:entry.duration,
          renderStart:entry.renderStart,layoutStart:entry.styleAndLayoutStart,
          scripts:entry.scripts?.map(s=>[s.invoker,s.sourceURL?.split('/').at(-1),s.sourceFunctionName,s.startTime,s.duration])});
      }
    }).observe({type:kind});
  }
}

export async function installAdmissionStages() {
  const probe=window.admissionTrace;
  if(!probe?.detailed)return;
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
  const {NetworkSession}=await import('/src/fps/network/session.mjs');
  let activeGpu=null;
  const time=(layer,name,call,info)=>{
    const start=performance.now();
    try{return call();}
    finally{const end=performance.now();if(end-start>=4)probe.spans.push({layer,name,start,end,...info?.()});}
  };
  const prepare=Renderer.prototype.prepareSpawnFrame;
  if(prepare)Renderer.prototype.prepareSpawnFrame=async function(...args){
    const start=performance.now(),draw=this.nativeRender,compile=this.renderer.compile;
    this.nativeRender=(scene,camera)=>time('prepare',scene===this.scene?'world':'weapon',()=>draw(scene,camera));
    const variants=[];
    this.renderer.compile=(...items)=>{
      const materials=time('prepare','link candidates',()=>compile.apply(this.renderer,items));
      variants.push([...new Set([...materials].map(m=>this.renderer.properties.get(m).currentProgram?.id).filter(id=>id!==undefined))]);return materials;
    };
    activeGpu=this.renderer;
    warming=true;
    try{return await prepare.apply(this,args);}
    finally{
      warming=false;activeGpu=null;this.nativeRender=draw;this.renderer.compile=compile;
      const end=performance.now();probe.preparation={start,end,variants,spans:probe.spans.filter(s=>start<=s.start&&s.end<=end)};
    }
  };
  const advance=NetworkSession.prototype.advanceFrame;
  NetworkSession.prototype.advanceFrame=function(...args){
    return probe.recording()?time('game','network advance',()=>advance.apply(this,args)):advance.apply(this,args);
  };
  let active=false,warming=false;
  for(const name of ['getProgramInfoLog','getShaderInfoLog','getProgramParameter','getUniformLocation','drawElements','drawArrays','drawElementsInstanced','drawArraysInstanced','texImage2D','texSubImage2D']){
    const gl=WebGL2RenderingContext.prototype,original=gl[name];
    if(!original)continue;
    gl[name]=function(...args){return active||warming?time('gl',name,()=>original.apply(this,args),()=>{
      if(name!=='getProgramInfoLog'||!activeGpu)return {};
      const p=activeGpu.info.programs.find(p=>p.program===args[0]);return {programId:p?.id,shader:p?.name};
    }):original.apply(this,args);};
  }
  const render=Renderer.prototype.render;
  Renderer.prototype.render=function(...args){
    if(!probe.recording())return render.apply(this,args);
    const three=this.renderer,pass=three.render;
    three.render=(scene,...rest)=>time('three',scene===this.scene?'world':scene===this.viewScene?'weapon':'other',()=>pass.call(three,scene,...rest));
    active=true;
    try{return time('game','renderer',()=>render.apply(this,args));}
    finally{active=false;three.render=pass;}
  };
}

export function admissionReceipt(){
  const {firstHud,markers,raf,input,warmWindows}=window.coldStartup;
  const join=markers.find(([name])=>name==='join requested')[1];
  const interval=window.admissionTrace.preparation;
  const following=raf.find(([t])=>t>firstHud);
  if(!following)throw Error('Missing the first post-HUD interval');
  const horizon=following[0]+500;
  const {firstVisibleCallback,detailed,spans,tasks}=window.admissionTrace;
  // rAF timestamps, handler arrival time and the event timestamp differ. Retain all three.
  const within=([handler,stamp])=>stamp>=firstHud-50&&stamp<=following[0]&&handler<=horizon;
  return {firstHud,nextRaf:following[0],gap:following[1],firstVisibleCallback,markers,warmWindows,
    joinToHud:firstHud-join,loadingWorstRaf:Math.max(0,...raf.filter(([t])=>t>=join&&t<=firstHud).map(([,gap])=>gap)),
    loadingWorstInput:Math.max(0,...input.filter(([handler,stamp])=>stamp>=join&&handler<=firstHud).map(([handler,stamp])=>handler-stamp)),
    preparation:interval?{...interval,raf:raf.filter(([t,gap])=>t-gap<=interval.end&&t>=interval.start),input:input.filter(([t,stamp])=>stamp>=interval.start&&stamp<=interval.end)}:undefined,
    detailed,documentVisible:!document.hidden,viewport:[innerWidth,innerHeight,devicePixelRatio],
    inputs:input.filter(within).map(([handler,stamp])=>({handler,stamp,delay:handler-stamp})),
    frames:raf.filter(([stamp])=>stamp>firstHud-150&&stamp<horizon),
    spans:spans.filter(s=>s.end>=firstHud-100&&s.start<horizon),tasks:tasks.filter(s=>s.start+s.duration>=firstHud-100&&s.start<horizon)};
}

export async function captureWaitingFrame(){
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
  const prior=Renderer.prototype.render;
  return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{Renderer.prototype.render=prior;reject(Error('Waiting world did not draw'));},4000);
    Renderer.prototype.render=function(game,actor,dt){
      const result=prior.call(this,game,actor,dt);
      Renderer.prototype.render=prior;clearTimeout(timer);
      try{
        const gpu=this.renderer,gl=gpu.getContext(),driver=gl.getExtension('WEBGL_debug_renderer_info');
        const image=document.createElement('canvas');image.width=320;image.height=180;
        image.getContext('2d').drawImage(gpu.domElement,0,0,image.width,image.height);
        resolve({pose:[actor?.id,actor?.x,actor?.y,actor?.z,actor?.yaw,actor?.weapon],driver:driver?gl.getParameter(driver.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER),
          calls:this.stats.drawCalls,geometry:gpu.info.memory.geometries,textures:gpu.info.memory.textures,
          scissorTest:gpu.getScissorTest(),width:gpu.domElement.width,height:gpu.domElement.height,
          image:image.toDataURL('image/png').split(',')[1]});
      }catch(error){reject(error);}
      return result;
    };
  });
}

// Called only by the native cancellation/cold re-entry scenario.
export async function observeAdmissionLifetime(){
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
  const entries=[],retired=[],ownerIds=new WeakMap(),fences=new Map();
  const log=window.admissionLife={entries,retired,created:0,deleted:0,active:0,failNextFence:false};
  const id=owner=>{if(!ownerIds.has(owner))ownerIds.set(owner,++log.ownerSequence);return ownerIds.get(owner);};
  log.ownerSequence=0;
  const gpu=WebGL2RenderingContext.prototype,make=gpu.fenceSync,remove=gpu.deleteSync;
  gpu.fenceSync=function(...args){
    if(log.active&&log.failNextFence){log.failNextFence=false;log.failedFence=true;throw Error('Test GPU submission failure');}
    const fence=make.apply(this,args);
    if(log.active&&fence){fences.set(fence,log.active);log.created++;}
    return fence;
  };
  gpu.deleteSync=function(fence){if(fences.delete(fence))log.deleted++;return remove.call(this,fence);};
  const dispose=Renderer.prototype.dispose;
  Renderer.prototype.dispose=function(...args){
    const owner=id(this),gl=this.renderer.getContext(),result=dispose.apply(this,args);
    retired.push({owner,lost:gl.isContextLost(),disposed:this.presentationDisposed,memory:{...this.renderer.info.memory},fences:fences.size});
    return result;
  };
  const prepare=Renderer.prototype.prepareSpawnFrame;
  Renderer.prototype.prepareSpawnFrame=async function(game,signal){
    const owner=id(this),session=window.streakSession,room=session.room;
    const record={owner,revision:room.state.worldRevision,map:room.state.mapId,frames:0,uncovered:0,scissorLeaks:0};
    entries.push(record);log.active=entries.length;
    if(log.active===2)window.changeMapWhileWarming?.();
    let timer;
    const frame=()=>{
      record.frames++;
      if(!document.getElementById('hud').hidden||document.getElementById('menu').hidden)record.uncovered++;
      if(this.renderer.getScissorTest())record.scissorLeaks++;
      timer=requestAnimationFrame(frame);
    };
    timer=requestAnimationFrame(frame);
    try{return await prepare.call(this,game,signal);}
    finally{
      cancelAnimationFrame(timer);log.active=0;
      Object.assign(record,{aborted:signal?.aborted??false,closed:session.closed,finished:true,prepared:!!this.spawnFramePrepared,remainingFences:fences.size});
    }
  };
}
