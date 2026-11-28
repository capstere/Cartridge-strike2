// Optional CDP-side evidence for Three r180's lazy per-renderer geometry upload.
// The original WebGLGeometries.get adds onGeometryDispose exactly once, on the
// same path that increments renderer.info.memory.geometries. Hold weak refs only.
export async function installGeometryCensus(){
  const url=performance.getEntriesByType('resource').find(r=>new URL(r.name).pathname.endsWith('/src/fps/render.mjs'))?.name;
  const {Renderer}=await import(url||'/src/fps/render.mjs?v=floor5-environment-1');
  const {BufferGeometry}=await import('/vendor/three/three.module.js');
  const uploads=new WeakMap();
  let drawing=null;
  const render=Renderer.prototype.render,subscribe=BufferGeometry.prototype.addEventListener;
  Renderer.prototype.render=function(...args){
    const parent=drawing;drawing=this;
    try{return render.apply(this,args);}finally{drawing=parent;}
  };
  BufferGeometry.prototype.addEventListener=function(type,listener){
    if(drawing&&type==='dispose'&&listener.name==='onGeometryDispose'&&!this.hasEventListener(type,listener)){
      let list=uploads.get(drawing);
      if(!list){list=[];uploads.set(drawing,list);}
      list.push({geometry:new WeakRef(this),at:performance.now()});
    }
    return subscribe.call(this,type,listener);
  };
  window.mapGeometryCensus=()=>{
    const renderer=mapProbe.last.deref(),lineages=new Map();
    function visit(node,path){
      const geometry=node.geometry;
      if(geometry){
        const owners=lineages.get(geometry)||[];
        if(owners.length<3)owners.push(path);
        lineages.set(geometry,owners);
      }
      node.children.forEach((child,index)=>visit(child,path+'/'+index+':'+(child.name||child.type)));
    }
    visit(renderer.scene,'world');visit(renderer.viewScene,'firstPerson');
    const rows=[],captured=new Set();
    function add(g,at){
      if(!g||captured.has(g))return;
      captured.add(g);
      const listeners=g._listeners?.dispose?.filter(fn=>fn.name==='onGeometryDispose').length||0;
      if(!listeners)return;
      rows.push({owners:lineages.get(g)||[],type:g.type,name:g.name,vertices:g.attributes.position?.count||0,
        indices:g.index?.count||0,listeners,at:at&&Math.round(at)});
    }
    for(const {geometry,at} of uploads.get(renderer)||[])add(geometry.deref(),at);
    // Include startup work outside the normal frame call, also identified by
    // the actual GL disposal listener on the current scene's geometry.
    for(const g of lineages.keys())add(g,null);
    return {map:renderer.world.project.projectId,uploaded:renderer.renderer.info.memory.geometries,
      camera:renderer.camera.position.toArray(),cameraRotation:renderer.camera.rotation.toArray().slice(0,3),rows};
  };
}

// A stationary Meltem lobby camera sees this authored vessel's deck only on a
// swell. Observe its first real draw on every visit before comparing uploaded
// geometry. Geometry ownership, the camera and culling remain unmodified.
export async function waitForMeltemDeck(page){
  const started=performance.now();
  const findDeck=()=>{
    const r=window.mapProbe.last.deref(),environment=r.referenceScene.root.getObjectByName('Map environment');
    const boat=environment.children.find(node=>node.name==='Moored boat'&&node.position.x===-50&&node.position.z===26);
    const part=boat?.children.find(mesh=>mesh.geometry.attributes.position.count===54&&mesh.geometry.index.count===108);
    if(!part)throw Error('The original Meltem deck no longer matches the source fixture.');
    return {uploaded:part.geometry._listeners?.dispose?.some(fn=>fn.name==='onGeometryDispose')||false,
      geometries:r.renderer.info.memory.geometries,deck:[boat.position.x,boat.position.y,boat.position.z],
      pitch:boat.rotation.x,roll:boat.rotation.z,camera:r.camera.position.toArray()};
  };
  const before=await page.evaluate(findDeck);
  let visible=before;
  while(!visible.uploaded){
    if(performance.now()-started>60000)throw Error('The waiting camera never rendered the moored deck.');
    await page.waitForTimeout(150);
    visible=await page.evaluate(findDeck);
  }
  return {before,visible,waitMs:Math.round(performance.now()-started)};
}
