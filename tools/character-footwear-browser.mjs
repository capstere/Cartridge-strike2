/** Actual UI + exported GLB + actual runtime avatar, including the reported run pose. */
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readRuntimePackage} from '../character-design/runtime-package.mjs?v=6.1.2';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/footwear-fit';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
const context=await browser.newContext({viewport:{width:1400,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[],results=[],models=new Map();
page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
await context.route('**/__shoe-test/*.glb',r=>{const b=models.get(new URL(r.request().url()).pathname.split('/').at(-1));return b?r.fulfill({contentType:'model/gltf-binary',body:b}):r.abort();});
try{
 await page.goto(origin+'/character-design/?test=1');await page.waitForFunction(()=>!!window.__characterStudio&&document.querySelector('#status')?.textContent.includes('redo!'));
 for(const role of ['player','hostage'])for(const gender of ['male','female']){
  const label=role+'-'+gender;await page.locator('#actor-role').selectOption(role);await page.waitForFunction(r=>!document.querySelector('main').inert&&__characterStudio.project.runtime.role===r,role);
  await page.locator('#gender').selectOption(gender);await page.waitForFunction(g=>__characterStudio.workbench.avatar.gender===g,gender);
  await page.locator('#actor-target').selectOption(role==='hostage'?'hostage-0':'analysts-1');await page.locator('#project-name').fill('Ankle regression '+label);
  await page.locator('[data-tab="fashion"]').click();await page.locator('#outfit-style').selectOption('original');
  // Actual range keyboard input; fill() is not supported for type=range.
  await page.locator('#garment-fit').focus();await page.locator('#garment-fit').press('End');assert.equal(await page.locator('#garment-fit').inputValue(),'120');
  const checks=await page.evaluate(async()=>{
   const {footwearMetrics}=await import('../tools/character-footwear-checks.mjs');const w=__characterStudio.workbench,checks=[];
   w.playing=false;
   for(const name of ['Idle_Loop','Walk_Loop','Sprint_Loop','Crouch_Fwd_Loop','Jump_Loop','Death01'])for(const f of [.1,.5,.9]){
    w.pose(name,false);w.avatar.mixer.setTime(w.avatar.clips.get(name).duration*f);w.avatar.root.updateMatrixWorld(true);w.renderPreview();
    checks.push({name,f,...footwearMetrics(w.avatar.root)});
   }
   return checks;
  });
  for(const c of checks){assert(!c.belt&&!c.buckle,label+' belt');for(const s of c.sides){assert.equal(s.misses,0,label+' '+c.name+' cuff');assert.equal(s.soleMisses,0,label+' '+c.name+' sole');}}
  await page.evaluate(()=>{const w=__characterStudio.workbench;w.pose('Sprint_Loop',false);w.avatar.mixer.setTime(.23);w.avatar.root.updateMatrixWorld(true);w.focus='shoes';w.zoom=.42;w.yaw=1.5;w.pitch=.03;w.renderPreview();});
  await page.locator('#preview3d').screenshot({path:out+'/'+label+'-running-shoes.png'});
  await page.evaluate(()=>{const w=__characterStudio.workbench;w.pose('Idle_Loop',false);w.focus='body';w.zoom=1;w.yaw=.3;w.pitch=.03;w.renderPreview();});
  await page.locator('#preview3d').screenshot({path:out+'/'+label+'-no-belt.png'});
  const download=page.waitForEvent('download');await page.locator('#export-runtime').click();
  await page.waitForFunction(()=>{const s=document.querySelector('#status')?.textContent||'';return s.startsWith('Spelpaket klart:')||s.startsWith('Direkt spelexport stoppades');});
  assert.match(await page.locator('#status').innerText(),/^Spelpaket klart:/);
  const zip=await readFile(await (await download).path()),read=await readRuntimePackage(zip);assert.equal(read.contract.footwear,'ankle-fitted-v2');
  models.set(label+'.glb',Buffer.from(read.bytes));
  const runtime=await page.evaluate(async({url,contract})=>{
   const T=await import('../vendor/three/three.module.js'),{GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js');
   const {installCharacterOverride,clearCharacterOverrides}=await import('../src/fps/character-overrides.mjs?v=6.1.2');
   const {createAuthoredAvatar,disposeAvatar}=await import('../src/fps/character-library.mjs?v=6.1.2');
   const {footwearMetrics}=await import('../tools/character-footwear-checks.mjs');
   const loader=new GLTFLoader(),asset=await loader.loadAsync(url),source=await loader.loadAsync('../assets/fps/models/'+contract.source.file);installCharacterOverride(asset,contract,source);
   const avatar=createAuthoredAvatar(contract.role==='hostage'?'hostage':'analysts',contract.target,contract.role==='hostage'),checks=[];
   if(!avatar.roleDesign)throw Error('Real engine override was not used');
   for(const clip of avatar.clips.values())for(const f of [.1,.5,.9]){avatar.mixer.stopAllAction();avatar.mixer.clipAction(clip).reset().play();avatar.mixer.setTime(clip.duration*f);checks.push({clip:clip.name,f,...footwearMetrics(avatar.root)});}
   avatar.mixer.stopAllAction();avatar.mixer.clipAction(avatar.clips.get('Sprint_Loop')).reset().play();avatar.mixer.setTime(.23);avatar.holder.rotation.y=0;
   const scene=new T.Scene();scene.background=new T.Color('#eef4f3');scene.add(new T.HemisphereLight(0xffffff,0x778888,2.3));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,4,4);scene.add(light,avatar.holder);
   // Frame both actually posed feet, not a fixed box at the origin.
   avatar.holder.updateWorldMatrix(true,true);avatar.root.updateMatrixWorld(true);avatar.root.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});
   const bounds=new T.Box3(),point=new T.Vector3();
   avatar.root.traverse(m=>{if(m.isMesh&&/^(shoe-upper-|boot-sole-)/.test(m.name))for(let i=0;i<m.geometry.attributes.position.count;i++){m.getVertexPosition(i,point);bounds.expandByPoint(point.applyMatrix4(m.matrixWorld));}});
   const center=bounds.getCenter(new T.Vector3()),size=bounds.getSize(new T.Vector3()),aspect=960/676,span=Math.max(size.y+.25,(size.z+.25)/aspect);center.y+=.045;
   const camera=new T.OrthographicCamera(-span*aspect/2,span*aspect/2,span/2,-span/2,.01,20);camera.position.copy(center).add(new T.Vector3(4,.03,.08));camera.lookAt(center);
   const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(960,676);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.render(scene,camera);
   const image=renderer.domElement.toDataURL();renderer.dispose();disposeAvatar(avatar);clearCharacterOverrides();return {checks,image};
  },{url:origin+'/__shoe-test/'+label+'.glb',contract:read.contract});
  for(const c of runtime.checks){assert(!c.belt&&!c.buckle);for(const s of c.sides){assert.equal(s.misses,0,label+' runtime '+c.clip);assert.equal(s.soleMisses,0);}}
  await writeFile(out+'/'+label+'-engine-shoes.png',Buffer.from(runtime.image.split(',')[1],'base64'));
  await page.locator('#project-file').setInputFiles({name:'PROJECT.json',mimeType:'application/json',buffer:Buffer.from(read.files.get('PROJECT.json'))});
  await page.waitForFunction(()=>document.querySelector('#status')?.textContent.startsWith('Projektet öppnades'));
  assert.equal(await page.locator('#gender').inputValue(),gender);assert.equal(await page.locator('#actor-role').inputValue(),role);
  results.push({label,zipBytes:zip.length,studioSamples:checks.length,runtimeSamples:runtime.checks.length,clips:13,attachmentPass:true,belt:false});console.log('FOOTWEAR_FIT_PASS',label);
 }
 await page.reload();await page.waitForFunction(()=>!!window.__characterStudio&&document.querySelector('#status')?.textContent.includes('redo!'));assert.equal(await page.locator('#actor-role').inputValue(),'hostage');assert.equal(await page.locator('#gender').inputValue(),'female');
 assert.deepEqual(errors,[]);await writeFile(out+'/result.json',JSON.stringify({status:'PASS',results,errors},null,2));console.log('FOOTWEAR_BROWSER_PASS');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failure.json',JSON.stringify({message:e.message,stack:e.stack,errors},null,2));throw e;}finally{await browser.close();}
