// Installed only by the optional native profiling run. All timestamps use the page clock.
module.exports = async function installLatencyProbe({kind, listenRaw}) {
  const donor = kind === 'frontline';
  const store = window.rushTrace = {events:[], steps:[], renders:[], drawCensus:null, activities:[], compositor:[]};
  const on = () => window.cs3Baseline.mode === 'action';
  const now = () => performance.now();
  if (PerformanceObserver.supportedEntryTypes.includes('long-animation-frame')) {
    const observer=new PerformanceObserver(list=>{
      if (!on()) return;
      for (const e of list.getEntries()) store.compositor.push({start:e.startTime,end:e.startTime+e.duration,
        render:e.renderStart,paint:e.paintTime??null,present:e.presentationTime??null});
    });
    observer.observe({type:'long-animation-frame'});
  }
  const moduleURL = file => {
    const entry = performance.getEntriesByType('resource').find(item => new URL(item.name).pathname.endsWith('/src/fps/'+file));
    if (!entry) throw Error('Missing live module '+file);
    return entry.name;
  };
  function listen(type, capture) {
    document.addEventListener(type,event => {
      if (!on()) return;
      const touch = event.changedTouches?.[0];
      store.events.push({type, capture, stamp:event.timeStamp, delivered:now(), code:event.code || '',
        x:touch?.clientX ?? event.clientX ?? null, y:touch?.clientY ?? event.clientY ?? null,
        pointer:event.pointerId ?? null, target:event.target.dataset?.mobileAction || event.target.dataset?.tc || event.target.id || '',
        coalesced:event.getCoalescedEvents?.().length ?? null});
    },{capture,passive:true});
  }
  for (const type of ['keydown','keyup','pointerdown','pointermove','pointerup','touchstart','touchmove','touchend']) listen(type,true);
  if (listenRaw) listen('pointerrawupdate',true);
  function recordRender(engine, call, owner, args) {
    if (!on()) return call.apply(owner,args);
    const begin=now(), result=call.apply(owner,args), end=now();
    const actor=donor?PL.ent:args[1] || args[0].player;
    const model=donor?VM.holder:engine.weaponModel;
    const weight=donor?VM.sprint:actor.rushWeight;
    store.renders.push({begin,end,weight,active:donor?PL.sprinting:actor.rushing,pose:model?[model.position.y,model.rotation.z]:null,
      x:donor?actor.pos.x:actor.x,z:donor?actor.pos.z:actor.z, alive:actor.alive,
      world:engine?.worldStamp,view:engine?.viewStamp,calls:(donor?renderer:engine.renderer).info.render.calls});
    return result;
  }
  if (donor) {
    const move=updatePlayer;
    updatePlayer=function(...args) {
      if (!on()) return move.apply(this,args);
      const begin=now(),result=move.apply(this,args);
      store.steps.push({begin,end:now(),sprint:PL.sprinting,weight:PL.ent.arms.sprintW,stick:TC.stickRun,forward:TOUCH.mz});
      return result;
    };
    const draw=composer.render;
    composer.render=function(...args){return recordRender(null,draw,this,args);};
    return;
  }
  const {Game}=await import(moduleURL('game.mjs'));
  const {MobileControls}=await import(moduleURL('mobile-controls.mjs'));
  const {Renderer}=await import(moduleURL('render.mjs'));
  const input=MobileControls.prototype.input, move=Game.prototype.moveActor, update=Game.prototype.update;
  MobileControls.prototype.input=function(...args) {
    const value=input.apply(this,args);
    if (on()) store.activities.push({type:'stickRead',at:now(),sprint:value.sprint,forward:value.forward});
    return value;
  };
  Game.prototype.update=function(dt,inputs,...args) {
    if (!on()) return update.call(this,dt,inputs,...args);
    const begin=now(),pending=navigator.scheduling?.isInputPending({includeContinuous:true})??null;
    const result=update.call(this,dt,inputs,...args);
    store.activities.push({type:'gameUpdate',at:begin,end:now(),sprint:inputs.sprint,forward:inputs.forward,dt,pending});
    return result;
  };
  Game.prototype.moveActor=function(actor,inputs,dt) {
    if (actor!==this.player || !on()) return move.call(this,actor,inputs,dt);
    const begin=now(),result=move.call(this,actor,inputs,dt);
    store.steps.push({begin,end:now(),sprint:inputs.sprint,forward:inputs.forward,weight:actor.rushWeight,active:actor.rushing});
    return result;
  };
  const installed = new WeakSet();
  function installWorldTiming(engine) {
    if (installed.has(engine)) return;
    installed.add(engine);
    const gl = engine.renderer, submit = gl.render;
    gl.render=function(scene,...args) {
      if (!on()) return submit.call(this,scene,...args);
      const begin=now(), result=submit.call(this,scene,...args), end=now();
      if (scene===engine.scene) engine.worldStamp=[begin,end];
      else if (scene===engine.viewScene) engine.viewStamp=[begin,end];
      return result;
    };
  }
  function collectCensus(engine,call,args) {
    const gl=engine.renderer, original=gl.renderBufferDirect, counts = new Map(), furniture = new Map();
    const owners=new Map([['world',engine.scene],['viewmodel',engine.weaponModel],['projectFurniture',engine.projectFurniture],
      ['projectDecorations',engine.projectDecorations?.root],['doors',engine.doorVisuals?.root],['staticDetails',engine.detailScene?.root],
      ['facility',engine.facilityScene?.root],['living',engine.livingScene?.root],['sourceProps',engine.riposteProps?.root],
      ['environment',engine.floorEnvironment?.root],['glass',engine.glassVisuals?.root],['action',engine.actionVisuals?.root],
      ...[...engine.actors||[]].map(([id,root])=>['actor-'+id,root])].map(([k,v])=>[v,k]));
    gl.renderBufferDirect=function(camera,scene,geometry,material,object,...tail) {
      let node=object,group;
      while (node && !owners.has(node)) { if (node.parent===scene) group=node.name || node.type; node=node.parent; }
      const label=owners.get(node)==='world'?'world/'+(group || 'mesh'):owners.get(node)||'other';
      counts.set(label,(counts.get(label)||0)+1);
      if (label==='projectFurniture') {
        let item=object, cell=object, type=material.transparent?'transparent':'opaque';
        while (item && !item.userData.editId && !item.userData.projectItemIds) item=item.parent;
        while (cell && !cell.name.startsWith('floor5-cell-')) cell=cell.parent;
        const key=[cell?.name,item?.userData.editId || item?.userData.projectItemIds?.join(',') || object.parent?.name,type].join('/');
        furniture.set(key,(furniture.get(key)||0)+1);
      }
      return original.call(this,camera,scene,geometry,material,object,...tail);
    };
    try { return call.apply(engine,args); }
    finally { gl.renderBufferDirect=original; store.drawCensus=Object.fromEntries([...counts].sort((a,b)=>b[1]-a[1]));store.furniture=Object.fromEntries([...furniture].sort((a,b)=>b[1]-a[1])); }
  }
  const draw=Renderer.prototype.render;
  Renderer.prototype.render=function(...args) {
    installWorldTiming(this);
    if (!store.drawCensus && this.weaponModel && !on()) return collectCensus(this,draw,args);
    return recordRender(this,draw,this,args);
  };
};
