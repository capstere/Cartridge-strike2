// Rebuild only the original fixed furniture from the reviewed source. All other
// real scene geometry and materials stay in place for the paired native draws.
module.exports=async function compareFurniture() {
  const r=window.rushRenderer.deref(),gpu=r.renderer,gl=gpu.getContext();
  const T=await import('/vendor/three/three.module.js');
  const {buildFpsFurniture}=await import('/src/fps/project-batches-before.mjs');
  const original=new T.Group();
  const reference=await buildFpsFurniture(r.world.projectScene.items,original,{world:r.world,assets:r.world.project.assets.local});
  const candidate=r.projectFurniture.children.filter(node=>node.name.startsWith('floor5-cell-'));
  if(!candidate.length || original.children.length!==candidate.length)throw Error('Different source furniture cell counts');
  const originalSceneParent=r.projectFurniture;
  const previous=r.camera.clone(),counts={},output=[];
  const size=gl.drawingBufferWidth*gl.drawingBufferHeight;
  function capture() {
    gpu.info.reset();gpu.autoClear=true;r.nativeRender(r.scene,r.camera);
    const bytes=new Uint8Array(size*4);
    gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,bytes);
    return {bytes,draws:gpu.info.render.calls,tris:gpu.info.render.triangles};
  }
  function colors(nodes) {
    const attrs=new Set();
    for(const node of nodes)node.traverse(part=>{if(part.geometry?.attributes.color)attrs.add(part.geometry.attributes.color);});
    return [...attrs].reduce((n,a)=>n+a.array.byteLength,0);
  }
  counts.originalColors=colors([original]); counts.updatedColors=colors(candidate);
  try {
    // The complete comparison loop is synchronous, so simulation and actor
    // animation cannot advance between a pair of GPU readbacks.
    r.scene.add(original);
    for(const [name,x,z,yaw,pitch] of [
      ['lift',-20.541,-30.03999,Math.PI,0],['lift side',-20.541,-30.03999,Math.PI/2,0],
      ['lift threshold',-20.541,-28,2.7,-.05],['C08',20,-5.4,-2.36,0],
      ['C08 reverse',20,-5.4,Math.PI-2.36,0],['I04 desk',-9,-6.657,Math.PI/2,-.48],
      ['I04 reverse',-11.3,-6.657,-Math.PI/2,-.48],
    ]) {
      r.camera.position.set(x,1.6,z);r.camera.rotation.set(pitch,yaw,0,'YXZ');r.camera.updateMatrixWorld();
      original.visible=false;for(const node of candidate)originalSceneParent.add(node);
      r.projectBatches.update(r.camera);const updated=capture();
      for(const node of candidate)node.removeFromParent();
      original.visible=true;reference.update(r.camera);const before=capture();
      let changed=0,overOne=0,overTwo=0,max=0;
      for(let i=0;i<before.bytes.length;i+=4){
        let d=0;
        for(let c=0;c<4;c++)d=Math.max(d,Math.abs(before.bytes[i+c]-updated.bytes[i+c]));
        changed+=Number(d>0);overOne+=Number(d>1);overTwo+=Number(d>2);max=Math.max(max,d);
      }
      output.push({name,originalDraws:before.draws,candidateDraws:updated.draws,originalTriangles:before.tris,candidateTriangles:updated.tris,
        pixels:size,changed,maxDifference:max,overOne,overTwo});
    }
  } finally {
    r.scene.remove(original);for(const node of candidate)originalSceneParent.add(node);
    r.camera.copy(previous);r.camera.updateMatrixWorld();r.projectBatches.update(r.camera);
  }
  return {counts,views:output};
};
