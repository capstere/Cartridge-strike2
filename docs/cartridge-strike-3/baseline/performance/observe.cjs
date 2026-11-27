// This function is serialized into the browser. It observes normal gameplay.
module.exports = async function installProbe(kind) {
  const cs2 = kind === 'fps';
  const store = window.cs3Baseline = {frames:[], actions:[], audio:[], inputs:[], mode:'off', last:null};
  const moduleURL = name => performance.getEntriesByType('resource').find(e=>new URL(e.name).pathname.endsWith('/src/fps/'+name))?.name;
  let lastSource;
  function sample(actor, state, renderer, camera) {
    const gameGL = renderer.getContext(), debug = gameGL.getExtension('WEBGL_debug_renderer_info');
    store.identity = {
      backend: gameGL.getParameter(debug?.UNMASKED_RENDERER_WEBGL || gameGL.RENDERER), buffer:[gameGL.drawingBufferWidth,gameGL.drawingBufferHeight],
      internalRenderBuffer:cs2 ? [gameGL.drawingBufferWidth,gameGL.drawingBufferHeight] : [RS.w, RS.h], viewport:[innerWidth,innerHeight], ratio:renderer.getPixelRatio(), dpr:devicePixelRatio, baseFov:cs2 ? 76 : Settings.fov, fov:camera.fov,
      map:cs2 ? lastSource.world.project.projectId : CURMAP.id, mode:cs2 ? state.state.mode : Settings.mode,
      quality:cs2 ? lastSource.settings.graphics : RQ.tier, actors:cs2 ? state.actors.length : entities.length,
      residents:cs2 ? state.state.zombies.length : null, weapon: cs2 ? actor.weapon : curW().def.name,
      phase:cs2 ? state.phase : MATCH.state, shaderWarmupMs:cs2 ? lastSource.warmup?.milliseconds : null
    };
  }
  const track=(begin,renderer,actor,g,camera)=>{
    if(!actor||store.mode==='off')return;
    const now=performance.now(), info=renderer.info;
    if(!store.identity) sample(actor,g,renderer,camera);
    if(store.mode==='pace'){
      store.frames.push([begin,now-begin,info.render.calls,info.render.triangles,renderer.getPixelRatio()]);
    }else if(store.mode==='action'){
      const w = cs2 ? g.item(actor) : curW();
      store.actions.push([now,cs2?actor.x:actor.pos.x,cs2?actor.z:actor.pos.z,cs2?null:VM.sprint,
        cs2?null:PL.ent.arms.sprintW,cs2?w?.ammo:w.mag,cs2?actor.reloadUntil>g.state.time:!!PL.reload,
        !!actor.alive,cs2?g.phase:MATCH.state,cs2?actor.weapon:curW().def.name,
        camera.fov,cs2?null:PL.sprinting]);
    }
  };
  let audioTag=null;
  if(cs2){
    const {Renderer}=await import(moduleURL('render.mjs'));
    const draw=Renderer.prototype.render;
    Renderer.prototype.render=function(game,actor,...rest){
      const begin=store.mode==='off'?0:performance.now();
      const result=draw.call(this,game,actor,...rest);
      lastSource=this;
      track(begin,this.renderer,actor || game.player,game,this.camera);
      return result;
    };
    const {AudioSystem}=await import(moduleURL('riposte-audio.mjs'));
    const play=AudioSystem.prototype.play;
    AudioSystem.prototype.play=function(e){
      if(store.mode!=='action')return play.call(this,e);
      const oldTag=audioTag;
      audioTag=e.actorId===this.listenerId?e.type:null;
      try{return play.call(this,e);}finally{audioTag=oldTag;}
    };
  }else{
    const draw=composer.render;
    composer.render=function(...args){
      const begin=store.mode==='off'?0:performance.now();
      const result=draw.apply(this,args);
      if(MATCH.state==='playing') track(begin,renderer,PL.ent,null,camera);
      return result;
    };
    const sound=sfxPlay;
    sfxPlay=function(id,...rest){
      if(store.mode!=='action')return sound.call(this,id,...rest);
      const oldTag=audioTag;
      audioTag=id;
      try{return sound.call(this,id,...rest);}finally{audioTag=oldTag;}
    };
  }
  const start=AudioBufferSourceNode.prototype.start;
  AudioBufferSourceNode.prototype.start=function(when,...rest) {
    if(store.mode==='action'&&audioTag){
      store.audio.push([performance.now(),audioTag,this.context.currentTime,when??0,this.context.state,this.context.baseLatency??null,this.context.outputLatency??null]);
    }
    return when===undefined?start.call(this):start.call(this,when,...rest);
  };
  for(const type of ['keydown','keyup','pointerdown','pointerup','touchstart','touchmove','touchend']){
    document.addEventListener(type,e=>{if(store.mode==='action')store.inputs.push([e.timeStamp,e.type,e.code || e.pointerType || '',e.target?.dataset?.tc || e.target?.dataset?.mobileAction || '']);},{capture:true,passive:true});
  }
};
