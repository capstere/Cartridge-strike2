/** Actual uploaded GLBs: catalogue -> placement -> native ZIP -> FPS renderer.
 * Synthetic room only. GENERATE_THUMBS=1 writes thumbnails from the real models.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/genexpert';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
const page=await context.newPage(),errors=[],failed=[];
page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push(r.status()+' '+r.url());});
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
// Deterministic stills use the real FPS WebGL renderer; movement/physics is tested separately.
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 const models=await page.evaluate(async generate=>{
  const T=await import('../vendor/three/three.module.js');const {readLibraryAsset}=await import('./library/models.mjs?v=6.1.2');
  const {GENEXPERT_LIBRARY}=await import('./library/genexpert-catalog.mjs');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(384,320);renderer.setPixelRatio(1);
  renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.1;
  const scene=new T.Scene();scene.background=new T.Color(0xe5ebed);
  scene.add(new T.HemisphereLight(0xffffff,0x647582,2.4));const key=new T.DirectionalLight(0xffffff,3);key.position.set(3,5,4);scene.add(key);
  const camera=new T.PerspectiveCamera(34,384/320,.01,100),rows=[];
  try{for(const e of GENEXPERT_LIBRARY){const a=await readLibraryAsset(e.id);const obj=a.scene.clone(true),root=new T.Group();root.add(obj);
   const center=a.originalBounds.getCenter(new T.Vector3());obj.position.sub(center);root.scale.setScalar(2.2/Math.max(a.originalSize.x,a.originalSize.y,a.originalSize.z));scene.add(root);
   camera.position.set(3,1.7,5.2);camera.lookAt(0,0,0);renderer.render(scene,camera);
   let textures=0,meshes=0;obj.traverse(n=>{if(n.isMesh){meshes++;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.map){if(!m.map.image?.width)throw Error(e.id+' undecoded texture');textures++;}}});
   if(renderer.getContext().getError()!==0)throw Error(e.id+' WebGL error');
   rows.push({id:e.id,model:e.model,size:a.originalSize.toArray(),meshes,textures,thumb:generate?renderer.domElement.toDataURL('image/png').split(',')[1]:null});
   scene.remove(root);
  }}finally{renderer.dispose();}return rows;
 },process.env.GENERATE_THUMBS==='1');
 for(const row of models){assert(row.meshes>=13);assert(row.textures>=2);if(row.thumb){mkdirSync('furniture-editor/library/thumbs/genexpert',{recursive:true});writeFileSync(`furniture-editor/library/thumbs/genexpert/${row.model}.png`,Buffer.from(row.thumb,'base64'));delete row.thumb;}}
 if(process.env.THUMBS_ONLY==='1'){console.log(JSON.stringify({status:'PASS',models}));await browser.close();process.exit(0);}
 const seed=await page.evaluate(async()=>{
  const {exportProject}=await import('./build/level-project.mjs');const {makeEntry}=await import('./build/architecture.mjs');
  const p=exportProject({projectId:'lvl-genexpert-test',name:'GeneXpert test lab'});
  p.ground.bounds={x0:-7,z0:-6,x1:7,z1:6};p.ground.floors=[{id:'BYGG-G-0001',name:'Lab',role:'room',surface:'vinyl',x0:-6,z0:-5,x1:6,z1:5}];
  p.architecture.added=[makeEntry('BYGG-V-0001','wall',[-6,-5],[6,-5]),makeEntry('BYGG-V-0002','wall',[6,-5],[6,5]),makeEntry('BYGG-V-0003','wall',[-6,-5],[-6,5])];
  p.furniture.added=[{id:'NY-OBJ-0100',kind:'table',assetName:'Labbänk',x:-2,z:0,yaw:0,w:1.8,d:.8,height:.9}];return p;
 });
 await page.locator('#open').setInputFiles({name:'gx-lab.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
 await page.waitForFunction(()=>__levelStudio.project.projectId==='lvl-genexpert-test');
 await page.locator('[data-tab="furnish"]').click();await page.locator('#catalogCategory').selectOption('labb');await page.locator('#catalogSearch').fill('genexpert');
 assert.equal(await page.locator('.catalog-card').count(),2);await page.locator('#autoPlace').uncheck();
 await page.locator('[data-asset="genexpert:gx16"]').click();await page.waitForFunction(()=>__levelStudio.pendingAsset?.ready);
 let screen=await page.evaluate(()=>__levelStudio.screenWorldPoint(-2,0));await page.mouse.click(screen.x,screen.y);await page.keyboard.press('Escape');
 const gx=await page.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.assetId==='genexpert:gx16'));
 assert(gx,'real catalogue click places GX16');assert.equal(gx.mountId,'NY-OBJ-0100');assert.equal(gx.elevation,.892);assert.equal(gx.wallFacing,'+z');
 await page.locator('[data-asset="genexpert:infinity80"]').click();await page.waitForFunction(()=>__levelStudio.pendingAsset?.ready);
 screen=await page.evaluate(()=>__levelStudio.screenWorldPoint(2,0));await page.mouse.click(screen.x,screen.y);await page.keyboard.press('Escape');
 const inf=await page.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.assetId==='genexpert:infinity80'));
 assert(inf);assert.equal(inf.elevation,0);assert.equal(inf.mountId,null);assert.equal(inf.wallFacing,'+z');
 await page.locator('#threeView').click();
 await page.waitForFunction(ids=>ids.every(id=>__levelStudio.visualFurniture.some(o=>o.id===id&&o.realModel)),[gx.id,inf.id]);
 let visuals=await page.evaluate(()=>__levelStudio.visualFurniture);
 for(const o of [gx,inf]){const v=visuals.find(v=>v.id===o.id);assert(Math.abs(v.min[1]-o.elevation)<.0001);assert(Math.abs(v.max[1]-v.min[1]-o.height)<.0001);}
 // Rotate using the actual control, then undo/redo; save the resulting orientation.
 await page.evaluate(id=>__levelStudio.select(id),inf.id);await page.locator('#rotate').click();
 const rotated=await page.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).yaw,inf.id);assert(Math.abs(rotated)>0);
 await page.locator('#undo').click();assert.equal(await page.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).yaw,inf.id),0);
 await page.locator('#redo').click();assert.equal(await page.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).yaw,inf.id),rotated);
 await page.screenshot({path:out+'/designstudio.png'});
 const download=page.waitForEvent('download');await page.locator('#save').click();
 const zip=readFileSync(await (await download).path());
 // Save intentionally refreshes validation metadata. Compare to that exact saved state.
 const before=await page.evaluate(()=>structuredClone(__levelStudio.project));
 await page.locator('#open').setInputFiles({name:'gx-test.zip',mimeType:'application/zip',buffer:zip});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
 assert.deepEqual(await page.evaluate(()=>structuredClone(__levelStudio.project)),before);
 await page.locator('#walkView').click();await page.waitForFunction(()=>!!document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.projectFurniture);
 const frame=page.frames().find(f=>f.url().includes('/fps/walk.html'));assert(frame);
 const fps=await frame.evaluate(ids=>{
  const {world,renderer:r}=__walk;const rows=ids.map(id=>{const holder=r.projectFurniture.children.find(o=>o.userData.editId===id);if(!holder)throw Error('Missing FPS '+id);let meshes=0,textures=0;holder.traverse(o=>{if(o.isMesh){meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.map?.image?.width)textures++;}});return {id,realModel:holder.userData.realModel,meshes,textures,y:holder.position.y,yaw:holder.rotation.y};});
  r.camera.position.set(4,2.2,6.7);r.camera.lookAt(0,1,0);r.camera.updateMatrixWorld();r.renderer.render(r.scene,r.camera);
  return {rows,blocksInfinity:!world.staticCanOccupy(2,0,.22,1.7,0),frontAisle:world.staticCanOccupy(2,1.5,.22,1.7,0),webgl:r.renderer.getContext().getError()};
 },[gx.id,inf.id]);
 assert(fps.rows.every(r=>r.realModel&&r.textures>=2));assert.equal(fps.rows[0].y,.892);assert.equal(fps.rows[1].yaw,rotated);assert(fps.blocksInfinity&&fps.frontAisle);assert.equal(fps.webgl,0);
 await frame.locator('#game').screenshot({path:out+'/fps.png'});
 await page.evaluate(()=>__levelStudio.leaveWalk());await page.reload();await page.waitForFunction(()=>!!window.__levelStudio);
 assert.deepEqual(await page.evaluate(()=>__levelStudio.project.furniture.added),before.furniture.added,'autosave retains model and pose');
 await page.goto(origin+'/furniture-editor/new.html?test=1&mode=edit-floor5');await page.waitForFunction(()=>!!window.__levelStudio);
 await page.locator('[data-tab="furnish"]').click();await page.locator('#catalogSearch').fill('genexpert');assert.equal(await page.locator('.catalog-card').count(),2);
 assert.equal(await page.evaluate(()=>__levelStudio.project.furniture.added.filter(o=>o.assetId?.startsWith('genexpert:')).length),0,'No automatic replacements in existing Floor 5');
 assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
 const result={status:'PASS',models,uiPlacement:true,nativeZIP:true,rotationUndoRedo:true,autosave:true,fps,existingFloor5Untouched:true,errors,failed};
 writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),stack:error.stack,errors,failed},null,2));throw error;}finally{await browser.close();}
