// Pair the original always-submitted sheets with the normal conservative
// visibility decision, in the same real world and held simulation frame.
module.exports=async function doorPixels(){
  const r=window.rushRenderer.deref(),gpu=r.renderer,gl=gpu.getContext();
  const T=await import('/vendor/three/three.module.js');
  const system=r.world.doors, doors=system.doors.filter(d=>d.doorStyle==='frosted');
  const groups=r.doorVisuals.root.children.filter(o=>o.name.endsWith('-frosted'));
  const panes=groups.map(o=>o.getObjectByName('glass'));
  if(panes.length!==2)throw Error('Expected the two authored Floor 5 frosted doors');
  const previous=r.camera.clone(),beforeClear=gpu.autoClear,beforeRatio=gpu.getPixelRatio(),beforeLift=system.elevators.progress,views=[];
  const args=doors.map(d=>[d,d.angle,d.sign]);
  function readFrame(){
    const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
    return pixels;
  }
  function renderState(){
    return {viewport:[...gl.getParameter(gl.VIEWPORT)],scissor:[...gl.getParameter(gl.SCISSOR_BOX)],scissorTest:gl.isEnabled(gl.SCISSOR_TEST),
      clear:[...gl.getParameter(gl.COLOR_CLEAR_VALUE)],colorMask:[...gl.getParameter(gl.COLOR_WRITEMASK)],depthMask:gl.getParameter(gl.DEPTH_WRITEMASK),
      target:gpu.getRenderTarget()?.texture?.name??'main',ratio:gpu.getPixelRatio()};
  }
  function capture(){
    const beforeState=renderState();
    gpu.info.reset();gpu.autoClear=true;const start=performance.now();r.nativeRender(r.scene,r.camera);
    const worldSubmitMs=performance.now()-start;
    const draws=gpu.info.render.calls,triangles=gpu.info.render.triangles,pixels=readFrame();
    const worldReadbackMs=performance.now()-start;
    if(r.weaponModel?.visible){gpu.autoClear=false;gpu.clearDepth();r.nativeRender(r.viewScene,r.viewCamera);}
    return {pixels,combined:readFrame(),draws,triangles,worldSubmitMs,worldReadbackMs,beforeState,afterState:renderState()};
  }
  function inspectPixels(a,b){
    const left=new Uint32Array(a.pixels.buffer),right=new Uint32Array(b.pixels.buffer),colors=new Map();
    const rgba=(frame,index)=>Array.from(frame.pixels.subarray(index*4,index*4+4));
    let firstIndex=null,maxIndex=null,maxDelta=-1;
    for(let i=0;i<left.length;i++)if(left[i]!==right[i]){
      if(firstIndex===null)firstIndex=i;
      const delta=Math.max(...rgba(a,i).map((k,c)=>Math.abs(k-b.pixels[i*4+c])));
      if(delta>maxDelta){maxIndex=i;maxDelta=delta;}
      const key=left[i]+'/'+right[i];if(!colors.has(key))colors.set(key,{count:0,index:i});colors.get(key).count++;
    }
    const samples=[...colors.values()].sort((u,v)=>v.count-u.count).slice(0,4);
    if(firstIndex!==null)samples.push({index:firstIndex,reason:'first changed pixel'},{index:maxIndex,reason:'greatest channel difference'});
    return samples.map(({count,index,reason})=>{
      const x=index%gl.drawingBufferWidth,y=Math.floor(index/gl.drawingBufferWidth),ray=new T.Raycaster();
      ray.setFromCamera({x:(x+.5)/gl.drawingBufferWidth*2-1,y:(y+.5)/gl.drawingBufferHeight*2-1},r.camera);
      const hits=ray.intersectObjects(r.scene.children,true).filter(hit=>{
        for(let o=hit.object;o;o=o.parent)if(!o.visible)return false;return true;
      }).slice(0,3).map(hit=>{const object=hit.object;return {distance:+hit.distance.toFixed(3),name:object.name,parent:object.parent?.name,
        type:object.type,material:[].concat(object.material||[]).map(m=>m.name||m.type)};});
      return {count,reason,x,y,first:rgba(a,index),original:rgba(b,index),hits};
    });
  }
  function differences(a,b){
    const left=new Uint32Array(a.pixels.buffer),right=new Uint32Array(b.pixels.buffer);
    let count=0,maxChannel=0,minX=Infinity,minY=Infinity,maxX=0,maxY=0;
    for(let i=0;i<left.length;i++)if(left[i]!==right[i]){
      count++;const x=i%gl.drawingBufferWidth,y=Math.floor(i/gl.drawingBufferWidth);
      minX=Math.min(minX,x);minY=Math.min(minY,y);maxX=Math.max(maxX,x);maxY=Math.max(maxY,y);
      for(let c=0;c<4;c++)maxChannel=Math.max(maxChannel,Math.abs(a.pixels[i*4+c]-b.pixels[i*4+c]));
    }
    return {count,maxChannel,bounds:count?[minX,minY,maxX,maxY]:null};
  }
  function compare(name,positive){
    r.camera.updateMatrixWorld();
    r.projectBatches.update(r.camera);
    const initialState=renderState(),logicalViewport=gpu.getViewport(new T.Vector4());
    const afterResize=()=>{gpu.setViewport(logicalViewport);r.doorVisuals.update(r.camera,[]);};
    afterResize();
    let rejected=null;
    if(name==='closed lift'||name==='actual player camera'){
      for(const pane of panes)pane.visible=false;
      rejected=capture();afterResize();
    }
    const resizeCandidate=capture();afterResize();for(const pane of panes)pane.visible=true;
    const resizeOriginal=capture();
    const resize={world:differences(resizeCandidate,resizeOriginal),combined:differences({pixels:resizeCandidate.combined},{pixels:resizeOriginal.combined}),
      initial:initialState.viewport,candidateBefore:resizeCandidate.beforeState.viewport,candidateAfter:resizeCandidate.afterState.viewport,
      originalBefore:resizeOriginal.beforeState.viewport,originalAfter:resizeOriginal.afterState.viewport,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight]};
    r.doorVisuals.update(r.camera,[]);
    const visible=panes.map(p=>p.visible);
    const normal=capture(),normalAgain=capture();
    for(const pane of panes)pane.visible=true;
    const before=capture(),beforeAgain=capture();
    panes.forEach((p,i)=>{p.visible=visible[i];});
    const normalLast=capture();
    for(const pane of panes)pane.visible=true;
    const beforeLast=capture();
    const first=differences(normal,before);
    const controls={firstCandidateRepeat:differences(normal,normalAgain),originalRepeat:differences(before,beforeAgain),
      secondCandidateAgainstOriginal:differences(normalAgain,beforeAgain),returnToCandidate:differences(normalLast,beforeAgain),
      returnToOriginal:differences(normalLast,beforeLast)};
    const combined=differences({pixels:normal.combined},{pixels:before.combined});
    let rejectedDiagnostic=null;
    if(rejected)rejectedDiagnostic={world:differences(rejected,resizeOriginal),combined:differences({pixels:rejected.combined},{pixels:resizeOriginal.combined}),samples:inspectPixels(rejected,resizeOriginal),beforeRejected:rejected.beforeState,afterRejected:rejected.afterState,beforeOriginal:resizeOriginal.beforeState,afterOriginal:resizeOriginal.afterState};
    let positivePixels=null;
    if(positive){positive.visible=false;positivePixels=differences(beforeLast,capture()).count;}
    panes.forEach((p,i)=>{p.visible=visible[i];});
    views.push({name,visible,pixelRatio:gpu.getPixelRatio(),changed:first.count,first,combined,resize,rejectedDiagnostic,samples:first.count?inspectPixels(normal,before):[],controls,buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],pixels:before.pixels.length/4,positivePixels,
      frozenTimings:{original:[before,beforeAgain,beforeLast].map(a=>[a.worldSubmitMs,a.worldReadbackMs]),
        candidate:[normal,normalAgain,normalLast].map(a=>[a.worldSubmitMs,a.worldReadbackMs])},
      originalDraws:before.draws,draws:normal.draws,originalTriangles:before.triangles,triangles:normal.triangles});
  }
  try{
    compare('actual player camera');
    for(const [name,x,z,yaw,pitch,lift] of [
      ['closed lift',-20.541,-30.03999,Math.PI,0,0],['half-open lift',-20.541,-30.03999,Math.PI,0,.5],
      ['open lift',-20.541,-30.03999,Math.PI,0,1],['lift side',-20.541,-30.03999,Math.PI/2,0,1],
      ['lift threshold',-20.541,-28,2.7,-.05,1],['C08',20,-5.4,-2.36,0,1],['C08 reverse',20,-5.4,Math.PI-2.36,0,1],
      ['I04 desk',-9,-6.657,Math.PI/2,-.48,1],['I04 reverse',-11.3,-6.657,-Math.PI/2,-.48,1]]){
      r.world.setElevatorProgress(lift);
      r.camera.position.set(x,1.6,z);r.camera.rotation.set(pitch,yaw,0,'YXZ');compare(name);
    }
    for(const [index,d] of doors.entries())for(const angle of [0,.8])for(const side of [-1,1]){
      system.pose(d,angle,d.sign);r.doorVisuals.update(r.camera,[]);
      const pane=panes[index],center=pane.getWorldPosition(new T.Vector3()),normal=new T.Vector3(0,0,side);
      normal.transformDirection(pane.matrixWorld);r.camera.position.copy(center).addScaledVector(normal,1.05);
      r.camera.lookAt(center);compare(d.id+' angle '+angle+' side '+side,pane);
    }
    for(const scale of [.7,.8,.9]){
      const ratio=devicePixelRatio*scale;
      gpu.setPixelRatio(ratio);r.world.setElevatorProgress(1);
      r.camera.position.set(-20.541,1.6,-30.03999);r.camera.rotation.set(0,Math.PI,0,'YXZ');
      compare('open lift ratio '+ratio.toFixed(4));
      const firstDoor=doors[0],pane=panes[0];system.pose(firstDoor,.8,firstDoor.sign);r.doorVisuals.update(r.camera,[]);
      const center=pane.getWorldPosition(new T.Vector3()),normal=new T.Vector3(0,0,1).transformDirection(pane.matrixWorld);
      r.camera.position.copy(center).addScaledVector(normal,1.05);r.camera.lookAt(center);
      compare('visible open sheet ratio '+ratio.toFixed(4),pane);
    }
  }finally{
    gpu.setPixelRatio(beforeRatio);
    for(const [d,angle,sign] of args)system.pose(d,angle,sign);
    gpu.autoClear=beforeClear;r.world.setElevatorProgress(beforeLift);r.camera.copy(previous);r.camera.updateMatrixWorld();
    r.projectBatches.update(r.camera);r.doorVisuals.update(r.camera,[]);
  }
  return views;
};

module.exports.checkParity=function checkParity(views){
  if(views.length!==24)throw Error('Expected the player camera, 17 map poses and six fractional-ratio views');
  for(const view of views){
    const failed=Object.entries(view.controls).find(([,comparison])=>comparison.count!==0);
    if(view.changed||view.combined.count||view.resize.world.count||view.resize.combined.count||failed)throw Error('Pixel difference in '+view.name+' '+(failed?.[0]||'first comparison'));
  }
  const controls=views.filter(view=>view.positivePixels!==null);
  if(controls.length!==11||controls.some(view=>view.positivePixels<=0))throw Error('A near-door positive control is missing');
  for(const name of ['open lift','lift threshold','C08']){
    const view=views.find(view=>view.name===name);
    if(!view||view.draws>=view.originalDraws)throw Error('No original pass saving at '+name);
  }
};
