// Opt-in post-match observations. All references to runtime instances are weak.
import {writeFile} from 'node:fs/promises';
import {closeSync,openSync,writeSync} from 'node:fs';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

export async function installRetentionProbe() {
  const {NetworkSession}=await import('/src/fps/network/session.mjs');
  const {AudioSystem}=await import('/src/fps/riposte-audio.mjs');
  const registry=new Map();
  function observe(kind,value) {
    if(!value || typeof value!=='object')return;
    if(!registry.has(kind))registry.set(kind,{seen:new WeakSet(),refs:[]});
    const bucket=registry.get(kind);
    if(bucket.seen.has(value))return;
    bucket.seen.add(value);bucket.refs.push(new WeakRef(value));
  }
  const snapshot=NetworkSession.prototype.snapshot;
  NetworkSession.prototype.snapshot=function(...args) {
    const result=snapshot.apply(this,args);
    observe('NetworkSession',this);observe('Game',this.view);
    observe('world',this.world);observe('navigation',this.world?.navigation);
    observe('prediction',this.prediction);
    return result;
  };
  const reset=AudioSystem.prototype.reset;
  AudioSystem.prototype.reset=function(...args) {
    observe('AudioSystem',this);observe('AudioContext',this.context);
    return reset.apply(this,args);
  };
  window.mapGpuListeners=()=>{
    const renderer=window.mapProbe.last?.deref(), resources=new Set(), totals={};
    for(const root of [renderer?.scene,renderer?.viewScene])root?.traverse(object=>{
      if(object.geometry)resources.add(object.geometry);
      for(const material of [].concat(object.material||[])){
        resources.add(material);
        for(const value of Object.values(material))if(value?.isTexture)resources.add(value);
      }
    });
    for(const asset of resources){
      const kind=asset.isTexture?'texture':asset.isMaterial?'material':'geometry',
        count=asset._listeners?.dispose?.length||0;
      const group=totals[kind]??={resources:0,max:0,overTwo:0,examples:[]};
      group.resources++;group.max=Math.max(group.max,count);
      if(count>2){
        group.overTwo++;
        if(group.examples.length<8)group.examples.push({label:asset.name||asset.type,disposeHandlers:count});
      }
    }
    return totals;
  };
  window.mapRetention=()=>Object.fromEntries([...registry].map(([kind,b])=>[
    kind,{observed:b.refs.length,reachable:b.refs.filter(ref=>ref.deref()).length},
  ]));
}

export async function readRetained(cdp,page) {
  await cdp.send('HeapProfiler.collectGarbage');
  const heap=await cdp.send('Runtime.getHeapUsage'),dom=await cdp.send('Memory.getDOMCounters');
  const runtime=await page.evaluate(()=>({
    instances:window.mapRetention?.(), gpuListeners:window.mapGpuListeners?.(), resourceTimings:performance.getEntriesByType('resource').length,
    mountedNodes:document.getElementsByTagName('*').length,
    loadingPanels:document.querySelectorAll('#cs-loading').length,
    loadingDescendants:document.querySelector('#cs-loading')?.getElementsByTagName('*').length||0,
  }));
  return {heapUsedBytes:heap.usedSize,heapCapacityBytes:heap.totalSize,
    embedderHeapUsedBytes:heap.embedderHeapUsedSize,backingStorageBytes:heap.backingStorageSize,
    documents:dom.documents,nodes:dom.nodes,eventListeners:dom.jsEventListeners,...runtime};
}

// Count instances independently of the weak-reference observer. Keep no object
// arrays or DOM handles alive between measurements.
export async function countLivePrototypes(cdp) {
  const classes={
    Game:"(await import('/src/fps/game.mjs')).Game",
    NetworkSession:"(await import('/src/fps/network/session.mjs')).NetworkSession",
    AudioSystem:"(await import('/src/fps/riposte-audio.mjs')).AudioSystem",
    threeRenderers:'window.mapProbe.last.deref().renderer.constructor',
    glContexts:'WebGL2RenderingContext', glPrograms:'WebGLProgram', glShaders:'WebGLShader',
    canvases:'HTMLCanvasElement', audioContexts:'AudioContext',
  };
  const counts={};
  for(const [key,expression] of Object.entries(classes)) {
    const group='retention-'+key;
    try {
      const {result}=await cdp.send('Runtime.evaluate',{expression:'(async()=>('+expression+').prototype)()',
        awaitPromise:true,objectGroup:group});
      const {objects}=await cdp.send('Runtime.queryObjects',{prototypeObjectId:result.objectId,objectGroup:group});
      const {result:length}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,
        functionDeclaration:'function(){return this.length;}',returnByValue:true});
      counts[key]=length.value;
      if(key==='canvases'){
        const {result:detached}=await cdp.send('Runtime.callFunctionOn',{objectId:objects.objectId,
          functionDeclaration:`function(){
            const retired=this.filter(c=>c.id==='game'&&!c.isConnected);
            for(const canvas of retired)canvas.__cs3RetiredCanvasDiagnostic=true;
            return retired.length;
          }`,returnByValue:true});
        counts.detachedGameCanvases=detached.value;
      }
    } finally {await cdp.send('Runtime.releaseObjectGroup',{objectGroup:group});}
  }
  return counts;
}

export async function writeRetainedProfile(cdp,out,label) {
  const {profile}=await cdp.send('HeapProfiler.getSamplingProfile'),sizes=new Map();
  function visit(node,stack) {
    const frame=node.callFrame,path=frame.url.replace(/^https?:\/\/[^/]+/,'').split('?')[0];
    const site=[...stack,(frame.functionName||'(anonymous)')+' '+path+'@'+(frame.lineNumber+1)].slice(-5);
    if(node.selfSize) {
      const name=site.join(' > ');
      sizes.set(name,(sizes.get(name)||0)+node.selfSize);
    }
    for(const child of node.children||[])visit(child,site);
  }
  visit(profile.head,[]);
  await writeFile(join(out,'retained-'+label+'.json'),JSON.stringify(Object.fromEntries(sizes),null,2)+'\n');
}

export async function parkedControl(cdp,page,out,durationMs) {
  // Keep the same room, actors, map, lobby camera, inputs and network patching.
  // Match the elapsed time of all switches, recording midpoint and endpoint.
  const start=performance.now(),samples=[];
  for(const fraction of [0,.5,1]) {
    await delay(Math.max(0,durationMs*fraction-(performance.now()-start)));
    samples.push({atMs:Math.round(performance.now()-start),...await readRetained(cdp,page)});
    await writeFile(join(out,'parked-progress.json'),JSON.stringify({durationMs,samples},null,2)+'\n');
  }
  samples.at(-1).livePrototypes=await countLivePrototypes(cdp);
  await writeRetainedProfile(cdp,out,'parked');
  return samples;
}

export async function snapshotDetachedCanvases(cdp,out) {
  // Preserve the object graph only for an explicitly requested diagnostic run.
  // This private artifact can include page contents. The public receipts use
  // allocation counts and names, without publishing a browser heap.
  const file=openSync(join(out,'detached-canvas.heapsnapshot'),'w',0o600);
  const chunk=({chunk})=>writeSync(file,chunk);
  cdp.on('HeapProfiler.addHeapSnapshotChunk',chunk);
  try {await cdp.send('HeapProfiler.takeHeapSnapshot',{reportProgress:false});}
  finally {cdp.off('HeapProfiler.addHeapSnapshotChunk',chunk);closeSync(file);}
}
