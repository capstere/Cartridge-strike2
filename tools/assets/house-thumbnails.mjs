/** Render every added model with the actual Three.js GLTF loader, on demand. */
import {createRequire} from 'node:module';import {mkdirSync,writeFileSync} from 'node:fs';import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('../../frontline/source/tools/dev/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--no-sandbox']});
const page=await browser.newPage();const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/furniture-editor/new.html');
await page.waitForFunction(()=>window.__levelStudio);
const results=[];mkdirSync('furniture-editor/library/thumbs/house-interior',{recursive:true});mkdirSync('furniture-editor/library/thumbs/reuse',{recursive:true});
try{
 const entries=await page.evaluate(async()=>{const {HOUSE_LIBRARY}=await import('./library/house-catalog.mjs'),{PROCEDURAL_LIBRARY}=await import('./library/procedural.mjs');return [...HOUSE_LIBRARY,...PROCEDURAL_LIBRARY.filter(e=>e.prefab)];});
 for(const entry of entries){
  const result=await page.evaluate(async e=>{
   const T=await import('../vendor/three/three.module.js'),{GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js'),{createPrefab}=await import('../src/fps/riposte-procedural-props.mjs');
   const canvas=document.createElement('canvas'),renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true});renderer.setSize(256,256);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;
   const scene=new T.Scene();scene.background=new T.Color('#edf3f0');scene.add(new T.HemisphereLight(0xffffff,0x5d7266,2));const key=new T.DirectionalLight(0xffffff,3);key.position.set(4,6,5);scene.add(key);
   const model=e.prefab?createPrefab(T,e.prefab).group:(await new GLTFLoader().loadAsync(e.url)).scene;scene.add(model);const b=new T.Box3().setFromObject(model),size=b.getSize(new T.Vector3()),center=b.getCenter(new T.Vector3()),span=Math.max(size.x,size.y,size.z);const camera=new T.PerspectiveCamera(38,1,.01,500);camera.position.copy(center).add(new T.Vector3(1.1,.8,1.5).normalize().multiplyScalar(span*2.3));camera.lookAt(center);renderer.render(scene,camera);
   let triangles=0;model.traverse(o=>{if(o.isMesh)triangles+=(o.geometry.index?.count||o.geometry.attributes.position.count)/3;});
   const data=canvas.toDataURL('image/webp',.85).split(',')[1];model.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});renderer.dispose();renderer.forceContextLoss();return {data,size:size.toArray(),triangles};
  },entry);
  assert(result.triangles>0);assert(result.size.every(n=>Number.isFinite(n)&&n>0));
  const file=entry.prefab?'reuse/'+entry.prefab:'house-interior/'+entry.model;writeFileSync('furniture-editor/library/thumbs/'+file+'.webp',Buffer.from(result.data,'base64'));results.push({id:entry.id,size:result.size,triangles:result.triangles});
 }
 assert.deepEqual(errors,[]);mkdirSync('test-results/studio-spaces',{recursive:true});writeFileSync('test-results/studio-spaces/library-render.json',JSON.stringify({status:'PASS',models:results,consoleErrors:errors},null,2));console.log('PASS actual GLTF/procedural rendering',results.length);
}finally{await browser.close();}
