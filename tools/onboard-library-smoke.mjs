/** Every added model must load and render through the browser's real GLTF loader. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1400,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>window.__levelStudio);
 const result=await page.evaluate(async(generate)=>{
  const T=await import('../vendor/three/three.module.js'),{GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js'),{ONBOARD_LIBRARY}=await import('./library/onboard-catalog.mjs');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true}),scene=new T.Scene(),camera=new T.PerspectiveCamera(45,1,.01,100);renderer.setSize(192,192);scene.add(new T.HemisphereLight(0xffffff,0x777777,3));camera.position.set(3,2,3);camera.lookAt(0,0,0);let count=0;const thumbs=[];scene.background=new T.Color(0x24303b);
  try{for(const entry of ONBOARD_LIBRARY){
   const gltf=await new GLTFLoader().loadAsync(new URL(entry.url,location.href).href),object=gltf.scene;object.updateMatrixWorld(true);const box=new T.Box3().setFromObject(object),size=box.getSize(new T.Vector3());
   if(![size.x,size.y,size.z].every(v=>Number.isFinite(v)&&v>0))throw Error(entry.id+' invalid bounds');
   const group=new T.Group();group.add(object);object.position.sub(box.getCenter(new T.Vector3()));group.scale.setScalar(2/Math.max(size.x,size.y,size.z));scene.add(group);renderer.render(scene,camera);
   if(renderer.getContext().getError()!==0)throw Error(entry.id+' WebGL error');if(generate)thumbs.push({model:entry.model,data:renderer.domElement.toDataURL('image/png').split(',')[1]});scene.remove(group);
   const textures=new Set(),materials=new Set(),geometries=new Set();object.traverse(o=>{if(o.geometry)geometries.add(o.geometry);for(const m of Array.isArray(o.material)?o.material:o.material?[o.material]:[]){materials.add(m);for(const value of Object.values(m))if(value?.isTexture)textures.add(value);}});textures.forEach(t=>t.dispose());materials.forEach(m=>m.dispose());geometries.forEach(g=>g.dispose());count++;
  }}finally{renderer.dispose();}
  return {count,thumbs};
 },process.env.GENERATE_THUMBS==='1');
 for(const t of result.thumbs){mkdirSync('furniture-editor/library/thumbs/onboard',{recursive:true});writeFileSync(`furniture-editor/library/thumbs/onboard/${t.model}.png`,Buffer.from(t.data,'base64'));}delete result.thumbs;assert.equal(result.count,15);assert.deepEqual(errors,[]);
 await page.locator('[data-tab="furnish"]').click();
 await page.locator('#catalogCategory').selectOption('onboard');
 assert.equal(await page.locator('.catalog-card').count(),15);
 await page.locator('#catalogSearch').fill('gas');assert.equal(await page.locator('.catalog-card').count(),1);
 await page.locator('#catalogSearch').fill('mixer vortex');assert.equal(await page.locator('.catalog-card').count(),1);
 await page.locator('.catalog-card').click();
 const at=await page.evaluate(()=>__levelStudio.screenWorldPoint(5,5));await page.mouse.click(at.x,at.y);
 assert.equal(await page.evaluate(()=>__levelStudio.project.furniture.added[0].assetId),'onboard:vortex-mixer');
 await page.locator('#resetCatalog').click();await page.locator('#catalogCategory').selectOption('used');
 assert.equal(await page.locator('.catalog-card').count(),1);
 const restored=await page.evaluate(async()=>{const m=await import('./build/level-project.mjs?v=3.7.0');return m.parseProject(JSON.stringify(__levelStudio.project)).furniture.added[0].assetId;});assert.equal(restored,'onboard:vortex-mixer');
 await page.locator('#catalogCategory').selectOption('onboard');
 await page.screenshot({path:'/tmp/onboard-studio.png'});
 console.log(JSON.stringify({status:'PASS',...result,consoleErrors:errors.length}));
}finally{await browser.close();}
