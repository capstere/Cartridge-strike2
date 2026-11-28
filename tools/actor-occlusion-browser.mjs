import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const b=await chromium.launch({channel:'chromium',args:process.platform==='darwin'?['--use-angle=metal']:[]});
try{
 const p=await b.newPage({viewport:{width:844,height:390},deviceScaleFactor:2,hasTouch:true,isMobile:true}),errors=[];
 p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'low'})));
 await p.goto(origin+'/fps/?test&seed=42');await p.locator('#start').click();
 await p.locator('#csl-deploy').click();
 await p.waitForFunction(()=>window.__fps?.game.player&&document.querySelector('#cs-loading').hidden,null,{timeout:180000});
 const result=await p.evaluate(async()=>{
  const f=__fps,r=f.renderer,gpu=r.renderer,gl=gpu.getContext();f.stopFrameLoop();f.pause(false);
  const {actorBounds}=await import('../src/fps/actor-occlusion.mjs'),{skinSampler}=await import('../src/fps/skin-sampler.mjs'),{Box3,Vector3}=await import('../vendor/three/three.module.js');
  const box=new Box3(),v=new Vector3(),cached=new Vector3(),views=[],bounds={vertices:0,failures:0,samplingDifferences:0};
  const sampling={originalMs:0,cachedMs:0,scans:0,vertices:0};
  const poses=[['lift',-20.541,-30.03999,Math.PI,0],['lift door',-20.541,-28,2.7,-.05],['C08',20,-5.4,-2.36,0],['C08 back',20,-5.4,Math.PI-2.36,0],['I04',-9,-6.657,Math.PI/2,-.48]];
  const capture=()=>{gpu.info.reset();gpu.autoClear=true;r.nativeRender(r.scene,r.camera);const pixels=new Uint8Array(gl.drawingBufferWidth*gl.drawingBufferHeight*4);gl.readPixels(0,0,gl.drawingBufferWidth,gl.drawingBufferHeight,gl.RGBA,gl.UNSIGNED_BYTE,pixels);return {pixels,calls:gpu.info.render.calls};};
  let previous=0;
  for(const tick of [60,360,720,1440,2700]){
   for(let i=previous;i<tick;i++)f.game.step(1/60);previous=tick;
   const events=f.game.drainEvents();r.events(events,f.game);
   for(const [name,x,z,yaw,pitch]of poses){
    const observer=Object.assign(Object.create(f.game.player),{x,z,y:0,yaw,pitch,moving:0});
    r.actorOcclusion.enabled=false;r.render(f.game,observer,1/60);
    for(const model of r.actors.values())if(model.visible&&actorBounds(model,box))model.traverseVisible(mesh=>{
     if(!mesh.isMesh)return;if(mesh.isSkinnedMesh)mesh.skeleton.update();
     const sample=skinSampler(mesh);
     for(let i=0;i<mesh.geometry.attributes.position.count;i++){
      mesh.getVertexPosition(i,v);if(!sample(i,cached).equals(v))bounds.samplingDifferences++;
      v.applyMatrix4(mesh.matrixWorld);bounds.vertices++;if(!box.containsPoint(v))bounds.failures++;
     }
     if(mesh.isSkinnedMesh){
      const results={};
      // Alternate order, identical actual meshes/poses and accumulation work.
      for(const fast of (sampling.scans%2?[true,false]:[false,true])){
       const start=performance.now(),read=fast?skinSampler(mesh):(i,p)=>mesh.getVertexPosition(i,p),extent=new Box3();
       for(let i=0;i<mesh.geometry.attributes.position.count;i++)extent.expandByPoint(read(i,cached).applyMatrix4(mesh.matrixWorld));
       sampling[fast?'cachedMs':'originalMs']+=performance.now()-start;results[fast]=extent;
      }
      if(!results.true.equals(results.false))throw Error('Exact posed bounds changed');
      sampling.scans++;sampling.vertices+=mesh.geometry.attributes.position.count;
     }
    });
    const before=capture();r.actorOcclusion.enabled=true;r.actorOcclusion.update(r.actors.values(),r.camera);const after=capture();
    let changed=0;for(let i=0;i<before.pixels.length;i++)if(before.pixels[i]!==after.pixels[i])changed++;
    views.push({tick,name,before:before.calls,after:after.calls,hidden:r.actorOcclusion.hidden,changed});
   }
  }
  return {views,bounds,sampling};
 });
 console.log(JSON.stringify(result));assert.equal(result.bounds.failures,0);assert.equal(result.bounds.samplingDifferences,0);assert(result.bounds.vertices>100000);assert(result.views.some(v=>v.hidden>0));assert(result.views.every(v=>v.changed===0));assert.deepEqual(errors,[]);
 fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/actor-occlusion.json',JSON.stringify(result,null,2));
}finally{await b.close();}
