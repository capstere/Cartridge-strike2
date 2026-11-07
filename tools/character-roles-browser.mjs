/** Real author/export/import/install/render journey using synthetic designs only. */
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {readRuntimePackage} from '../character-design/runtime-package.mjs?v=6.1.2';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/character-roles';await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),context=await browser.newContext({viewport:{width:1400,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
const models=new Map(),registry={schema:1,characters:[]},results=[];
await context.route('**/assets/fps/character-overrides.json',r=>r.fulfill({contentType:'application/json',body:JSON.stringify(registry)}));
await context.route('**/assets/fps/custom-characters/*.glb',r=>{const b=models.get(new URL(r.request().url()).pathname.split('/').at(-1));return b?r.fulfill({contentType:'model/gltf-binary',body:b}):r.abort();});
await context.addInitScript(()=>{HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.resolve();};if(location.pathname.endsWith('/fps/')&&new URLSearchParams(location.search).has('test'))requestAnimationFrame=()=>0;});
try{
 await page.goto(origin+'/character-design/?test=1');await page.waitForFunction(()=>!!window.__characterStudio&&document.querySelector('#status').textContent.includes('redo!'));
 // No private hand-authored source files: these are public original-based fixtures.
 const variants=[{role:'dwarf',target:'dwarf-all',color:'#306a87',outfit:'fieldjacket',part:'glasses'},
  {role:'hostage',target:'hostage-0',color:'#f1ede5',gender:'female',outfit:'labcoat',part:'badge'},
  {role:'player',target:'analysts-1',color:'#246099',gender:'male',outfit:'fieldjacket',part:'badge'},
  {role:'player',target:'counterAnalysts-0',color:'#f1f1ec',gender:'female',outfit:'tshirt',part:'glasses'}];
 for(let index=0;index<variants.length;index++){
  const v=variants[index];await page.locator('#actor-role').selectOption(v.role);
  await page.waitForFunction(role=>!document.querySelector('main').inert&&__characterStudio.project.runtime.role===role,v.role);
  if(v.gender)await page.locator('#gender').selectOption(v.gender);
  await page.locator('#actor-target').selectOption(v.target);await page.locator('#project-name').fill('Synthetic '+v.role+' '+index);
  await page.locator('[data-tab="look"]').click();const beforeColour=await page.evaluate(()=>__characterStudio.workbench.avatar.root.uuid);await page.locator('[data-color="jacket"]:visible').first().fill(v.color);assert.equal(await page.evaluate(()=>__characterStudio.workbench.avatar.root.uuid),beforeColour);
  await page.locator('[data-tab="fashion"]').click();await page.locator('#outfit-style').selectOption(v.outfit);
  await page.locator('#shirt-text').fill(v.role==='dwarf'?'D5':'LAB');
  await page.locator('[data-tab="parts"]').click();await page.locator('#part-type').selectOption(v.part);await page.locator('#add-part').click();
  assert.equal(await page.locator('#pose option').count(),v.role==='dwarf'?3:11);
  await page.locator('#pose').selectOption('Walk_Loop');await page.locator('#play').click();await page.waitForTimeout(120);await page.locator('#play').click();
  await page.locator('#export-runtime').scrollIntoViewIfNeeded();
  // Observe both outcomes without leaving an error poll alive after a download.
  // A losing waitForFunction in Promise.race survives navigation to /fps/, where
  // #status does not exist; those test-generated exceptions masked real results.
  const download=page.waitForEvent('download').then(value=>({value}),error=>({error}));
  await page.locator('#export-runtime').click();
  await page.waitForFunction(()=>{
   const main=document.querySelector('main'),status=document.querySelector('#status');
   return main&&!main.inert&&/^(Spelpaket klart:|Direkt spelexport stoppades:)/.test(status?.textContent||'');
  });
  const exportStatus=await page.locator('#status').innerText();
  if(exportStatus.startsWith('Direkt spelexport stoppades:'))throw Error(exportStatus);
  const result=await download;if(result.error)throw result.error;const d=result.value;
  const zip=await readFile(await d.path()),read=await readRuntimePackage(zip);assert.equal(read.contract.role,v.role);assert.equal(read.contract.target,v.target);
  const report=JSON.parse(new TextDecoder().decode(read.files.get('COMPATIBILITY.json')));assert(report.sourceAnimationsPreserved);assert(report.finitePosedGeometry);assert.equal(report.clips.length,v.role==='dwarf'?3:13);if(v.role==='player')assert(report.firstPersonMaterialsMatched);
  const file=`assets/fps/custom-characters/${read.contract.sha256}.glb`;models.set(read.contract.sha256+'.glb',Buffer.from(read.bytes));registry.characters.push({file,contract:read.contract});
  // Verify saved design can be opened and re-exported with same semantic target.
  await page.locator('#open-project').click();await page.locator('#project-file').setInputFiles({name:'PROJECT.json',mimeType:'application/json',buffer:Buffer.from(read.files.get('PROJECT.json'))});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnades'));
  assert.equal(await page.locator('#actor-target').inputValue(),v.target);assert.equal(await page.locator('#actor-role').inputValue(),v.role);
  await page.evaluate(()=>{const w=__characterStudio.workbench;w.pose('Idle_Loop',false);w.yaw=.35;w.pitch=.05;w.focus='body';w.renderPreview();});
  await page.locator('#preview3d').screenshot({path:`${out}/studio-${index}-${v.role}.png`});
  if(index===2){await page.evaluate(()=>{const w=__characterStudio.workbench;w.focus='shoes';w.yaw=.65;w.renderPreview();});await page.locator('#preview3d').screenshot({path:out+'/shoes.png'});}
  results.push({role:v.role,target:v.target,bytes:zip.length,report});console.log('ROLE_EXPORT_PASS',v.role,v.target,JSON.stringify(report));
 }
 await page.reload();await page.waitForFunction(()=>!!window.__characterStudio&&document.querySelector('#status').textContent.includes('redo!'));assert.equal(await page.locator('#actor-target').inputValue(),'counterAnalysts-0');
 await page.goto(origin+'/fps/?test=1');await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').innerText());
 await page.locator('#start').click();
 const runtime=await page.evaluate(async()=>{
  const T=await import('../vendor/three/three.module.js');__fps.start('analysts');const {game,renderer}=__fps;
  const before=JSON.stringify(game.actors.map(a=>({id:a.id,hp:a.hp,height:a.height,radius:a.radius,team:a.team})));__fps.render();
  const a=renderer.actors.get('analysts-1').userData.avatar,c=renderer.actors.get('counterAnalysts-0').userData.avatar,h=renderer.actors.get('hostage-0').userData.avatar;
  if(!a.roleDesign||!c.roleDesign||!h.roleDesign||!h.isHostage||h.upper.size!==0)throw Error('Runtime role selection failed');
  if(renderer.actors.get('analysts-2').userData.avatar.roleDesign)throw Error('Unassigned player was changed');
  // Existing ActionVisuals with real game actors, not a separate toy animator.
  const actors=Array.from({length:5},(_,i)=>({id:'dwarf-'+i,variant:i,x:i*.6,y:0,z:0,yaw:Math.PI,alive:true,moving:1,steps:.3}));const frozen=JSON.stringify(actors);
  const fixture={config:{wanderers:true},state:{time:2,wanderers:actors,projectiles:[]}};renderer.actionVisuals.update(fixture,new T.PerspectiveCamera());
  if([...renderer.actionVisuals.dwarfs.values()].some(m=>!m.userData.roleAvatar))throw Error('Dwarf override not installed');
  if(JSON.stringify(actors)!==frozen||JSON.stringify(game.actors.map(a=>({id:a.id,hp:a.hp,height:a.height,radius:a.radius,team:a.team})))!==before)throw Error('Cosmetic rendering changed gameplay');
  const dwarf=renderer.actionVisuals.dwarfs.get('dwarf-0');
  const view=new T.Scene();view.background=new T.Color('#e5eceb');view.add(new T.HemisphereLight(0xffffff,0x778888,2.3));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,4,4);view.add(light);
  const figures=[a.holder,c.holder,h.holder,dwarf];figures.forEach((o,i)=>{o.removeFromParent();view.add(o);o.position.set((i-1.5)*.65,0,0);o.rotation.set(0,0,0);});
  const cam=new T.PerspectiveCamera(32,1.6,.01,20);cam.position.set(2.6,1.7,5.1);cam.lookAt(0,.8,0);
  const r=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});r.setSize(1200,750);r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;r.render(view,cam);const image=r.domElement.toDataURL();r.dispose();
  return {actors:game.actors.length,hostageSkins:2,dwarfInstances:5,unchangedGame:true,playerClips:a.clips.size,hostageClips:h.clips.size,dwarfClips:dwarf.userData.roleAvatar.clips.size,image};
 });
 await writeFile(out+'/engine-lineup.png',Buffer.from(runtime.image.split(',')[1],'base64'));delete runtime.image;assert.equal(runtime.actors,10);assert.equal(runtime.dwarfClips,3);assert.equal(runtime.hostageClips,13);assert.deepEqual(errors,[]);
 await writeFile(out+'/result.json',JSON.stringify({status:'PASS',exports:results,runtime,errors},null,2));console.log('CHARACTER_ROLES_BROWSER_PASS');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});await writeFile(out+'/failure.json',JSON.stringify({message:e.message,stack:e.stack,errors,status:await page.locator('#status').textContent().catch(()=>null)},null,2));throw e;}finally{await browser.close();}
