/**
 * NORD-01 portable adapter for static Three.js assets. Instances own hierarchy
 * only: geometry, materials and textures stay shared until library disposal.
 * Pending loads cannot resurrect a disposed library. GLTFLoader cannot cancel
 * an in-flight parse, so late results are disposed as soon as they arrive.
 */
export function createAssetLibrary({THREE, GLTFLoader, baseURL=new URL('./',import.meta.url), catalog=null, fetch:fetchAsset=globalThis.fetch}={}){
  if(!THREE||!GLTFLoader) throw new TypeError('Supply THREE and GLTFLoader.');
  const root=new URL(baseURL,import.meta.url), loader=new GLTFLoader(), cache=new Map(), ready=new Map(), live=new Set();
  const geometries=new Set(), materials=new Set(), textures=new Set(), destroyed=new WeakSet(), abort=new AbortController();
  let manifestPromise=null, disposed=false;
  const assertActive=()=>{if(disposed){const e=new Error('NORD library disposed');e.name='AbortError';throw e;}};
  function ownScene(scene){
    scene.traverse(o=>{
      if(o.geometry)geometries.add(o.geometry);
      for(const m of Array.isArray(o.material)?o.material:[o.material])if(m){
        materials.add(m);
        for(const v of Object.values(m))if(v?.isTexture)textures.add(v);
      }
    });
  }
  function disposeResources(){
    for(const resources of [geometries,materials,textures]){
      for(const resource of resources)if(!destroyed.has(resource)){destroyed.add(resource);resource.dispose();}
      resources.clear();
    }
  }
  function manifest(){
    assertActive();
    if(catalog)return Promise.resolve(catalog);
    if(!manifestPromise){
      manifestPromise=fetchAsset(new URL('manifest.json',root),{signal:abort.signal}).then(r=>{
        if(!r.ok)throw new Error('NORD manifest HTTP '+r.status);return r.json();
      }).then(m=>{assertActive();return m;}).catch(e=>{manifestPromise=null;throw e;});
    }
    return manifestPromise;
  }
  async function template(id,lod){
    assertActive();
    const m=await manifest();assertActive();
    const meta=m.assets.find(a=>a.id===id);
    if(!meta)throw new Error('Unknown NORD asset: '+id);
    const spec=meta.lods.find(x=>x.level===Number(lod));
    if(!spec)throw new Error(id+' has no LOD '+lod);
    const key=id+':'+spec.level;
    if(!cache.has(key)){
      const pending=loader.loadAsync(new URL(spec.path,root).href).then(g=>{
        ownScene(g.scene);
        if(disposed){disposeResources();assertActive();}
        const t={g,meta,spec};ready.set(key,t);return t;
      }).catch(e=>{cache.delete(key);throw e;});
      cache.set(key,pending);
    }
    return cache.get(key);
  }
  function instantiate(id,{lod=0}={}){
    assertActive();
    const t=ready.get(id+':'+Number(lod));
    if(!t)throw new Error('Preload NORD asset before instantiation: '+id+':'+lod);
    const object=t.g.scene.clone(true);object.name='NORD01_'+id+'_instance';live.add(object);
    let released=false;
    return {object,animations:t.g.animations,metadata:t.meta,lod:t.spec,
      release(){if(released)return;object.removeFromParent();live.delete(object);released=true;}};
  }
  async function load(id,{lod=0}={}){
    await template(id,lod);return instantiate(id,{lod});
  }
  /** Preload does not allocate instance hierarchies. Failed URLs can be retried. */
  async function preload(entries){
    const templates=await Promise.all(entries.map(e=>template(typeof e==='string'?e:e.id,typeof e==='string'?0:e.lod??0)));
    assertActive();return templates.map(t=>({metadata:t.meta,lod:t.spec}));
  }
  async function loadLOD(id,{distances=[0,10,25],hysteresis=.15}={}){
    if(distances.length!==3||distances.some((d,i)=>!Number.isFinite(d)||d<0||(i&&d<=distances[i-1])))throw new RangeError('Supply three increasing LOD distances.');
    // Wait for every attempt so one failure cannot leak other completed levels.
    const results=await Promise.allSettled([0,1,2].map(lod=>load(id,{lod})));
    const failed=results.find(r=>r.status==='rejected');
    if(failed||disposed){for(const r of results)if(r.status==='fulfilled')r.value.release();if(failed)throw failed.reason;assertActive();}
    const levels=results.map(r=>r.value),object=new THREE.LOD();object.name='NORD01_'+id+'_LOD';
    levels.forEach((x,i)=>object.addLevel(x.object,distances[i],hysteresis));live.add(object);
    let released=false;
    return {object,metadata:levels[0].metadata,levels,
      release(){if(released)return;object.removeFromParent();levels.forEach(x=>x.release());live.delete(object);released=true;}};
  }
  function dispose(){
    if(disposed)return;disposed=true;abort.abort();
    for(const object of live)object.removeFromParent();live.clear();
    disposeResources();ready.clear();cache.clear();manifestPromise=null;
  }
  function stats(){return {disposed,pending:cache.size-ready.size,templates:ready.size,instances:live.size,geometries:geometries.size,materials:materials.size,textures:textures.size};}
  return {manifest,preload,instantiate,load,loadLOD,dispose,stats};
}
