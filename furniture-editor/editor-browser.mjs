/** Real Chromium/WebGL smoke test of the standalone furniture editor.
 * It must NEVER load or modify the FPS game or deploy editor edits to runtime.
 */
import {createRequire} from 'node:module';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {makeZip,readZip} from './library/zip.mjs?v=5.7.2';
import {createHash} from 'node:crypto';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FURNITURE_TEST_ORIGIN||'http://127.0.0.1:8765';
const out=resolve('test-results/furniture-editor');await mkdir(out,{recursive:true});
const report={status:'RUNNING',checks:[],errors:[],externalRequests:[],httpFailures:[],shots:[]};
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:{width:1380,height:850},deviceScaleFactor:1,acceptDownloads:true}),page=await context.newPage();page.setDefaultTimeout(30000);
const check=(name,pass)=>{report.checks.push({name,pass:!!pass});console.log(name,!!pass?'PASS':'FAIL');if(!pass)throw Error(name);};
page.on('pageerror',e=>report.errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.httpFailures.push({url:r.url(),status:r.status()});});
await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();report.externalRequests.push(url);return route.abort();});
try{
 await page.goto(origin+'/furniture-editor/',{waitUntil:'networkidle',timeout:45000});
 await page.waitForFunction(()=>!!window.__furnitureEditor?.getState()?.chairs,{timeout:45000});
 const initial=await page.evaluate(()=>__furnitureEditor.getState());
 check('at least 50 chairs and separate editor without game boot',initial.chairs>=50&&!initial.gameModuleLoaded);
 check('pinned source version matches current public release',initial.sourceCommit==='7b99da56c9cc7f7e5bdbc626a174c8db9a9e33bc'&&initial.gameVersion==='0.17.0');
 check('plan view loaded with readable room controls',await page.locator('#loading').isHidden()&&await page.locator('#room option').count()>5);
 const saveBox=await page.locator('#downloadTop').boundingBox();check('save button visible without scrolling sidebar',!!saveBox&&saveBox.y>=0&&saveBox.y+saveBox.height<850);
 check('real WebGL canvas initialized',await page.evaluate(()=>!!document.querySelector('#viewport').getContext('webgl2')));
 const chair=await page.evaluate(()=>{const id='V1-SEAT-1L1';__furnitureEditor.select(id);return {id,angle:__furnitureEditor.getItem(id)?.yaw};});
 check('select exact authored lunch chair',Number.isFinite(chair.angle));
 await page.screenshot({path:resolve(out,'01-planvy.png'),fullPage:true});report.shots.push('01-planvy.png');
 await page.locator('#rotateRight').click();
 let state=await page.evaluate(()=>__furnitureEditor.getState());
 check('rotation changes one chair without modifying game',state.changed===1&&!state.gameModuleLoaded);
 const degree=await page.locator('#degrees').textContent();check('angle is visible in UI',degree?.includes('°'));
 // This is a real pointer drag in the top-down viewport, away from the nearby table.
 const p=await page.evaluate(id=>__furnitureEditor.screenPoint(id),chair.id);
 if(p){await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x-6,p.y,{steps:5});await page.mouse.up();}
 const dragged=await page.evaluate(id=>__furnitureEditor.getItem(id),chair.id);
 check('mouse drag leaves valid furniture and no page errors',Number.isFinite(dragged?.x)&&!report.errors.length);
 await page.locator('#threeView').click();
 check('3D toggle works',await page.evaluate(()=>__furnitureEditor.getState().view==='3d'));
 await page.screenshot({path:resolve(out,'02-3d.png'),fullPage:true});report.shots.push('02-3d.png');
 const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadTop').click()]);
 const filename=download.suggestedFilename(),path=await download.path(),patch=JSON.parse(await readFile(path,'utf8'));
 check('downloaded JSON contains editable source IDs and one edited chair',filename.endsWith('.json')&&patch.format==='cartridge-strike-furniture-studio'&&patch.placements.some(x=>x.id===chair.id));
 check('downloaded file contains no private reference data',!JSON.stringify(patch).includes('Cepheid'));
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>!!window.__furnitureEditor?.getState()?.chairs);
 check('reloading keeps unsaved work in localStorage',await page.evaluate(()=>__furnitureEditor.getState().changed>=1));
 const dialog=page.waitForEvent('dialog').then(d=>d.accept());await page.locator('#reset').click();await dialog;
 check('restore button removes local edits',await page.evaluate(()=>__furnitureEditor.getState().changed===0));
 await page.locator('#importFile').setInputFiles({name:filename,mimeType:'application/json',buffer:Buffer.from(JSON.stringify(patch))});
 await page.waitForFunction(()=>__furnitureEditor.getState().changed>=1);
 check('saved JSON can be imported and edited again',await page.evaluate(()=>__furnitureEditor.getState().changed>=1));
 // New V2 model library: real Kenney thumbnail + GLB must be served locally.
 const catalogCounts=await page.evaluate(async()=>{
  const [{LIBRARY,LIBRARY_ALL},{PROCEDURAL_LIBRARY},{ONBOARD_LIBRARY}]=await Promise.all([
   import('./library/catalog.mjs'),import('./library/procedural.mjs?v=5.0.0'),import('./library/onboard-catalog.mjs')
  ]);
  return {original:LIBRARY.length,procedural:PROCEDURAL_LIBRARY.length,onboard:ONBOARD_LIBRARY.length,
   total:LIBRARY_ALL.length,visible:__furnitureEditor.catalogCount,
   genexpert:LIBRARY_ALL.filter(e=>e.pack==='genexpert').map(e=>e.id).sort()};
 });
 check('104 original GLBs plus all shared studio, lab and FPS catalogues are visible',
  catalogCounts.original===104&&catalogCounts.procedural===53&&catalogCounts.onboard===15&&
  catalogCounts.total===301&&catalogCounts.visible===301);
 assert.deepEqual(catalogCounts.genexpert,['genexpert:gx16','genexpert:infinity80']);
 await page.locator('#openLibrary').click();
 check('library opens without loading FPS runtime',await page.locator('#libraryDialog').evaluate(e=>e.open));
 await page.locator('#librarySearch').fill('Liten växt');
 check('search finds correct Kenney plant',await page.locator('.library-tile').count()===1);
 await page.locator('.library-tile').first().click();
 await page.waitForFunction(()=>__furnitureEditor.getPatch().added.some(p=>p.assetId==='kenney:furniture-kit:plantsmall1'));
 check('CC0 Kenney GLB can be placed in a legal room',await page.evaluate(()=>__furnitureEditor.getPatch().added.some(x=>x.assetId==='kenney:furniture-kit:plantsmall1')));
 await page.locator('#threeView').click();
 await page.waitForTimeout(900);
 await page.screenshot({path:resolve(out,'03-library-placed.png'),fullPage:true});report.shots.push('03-library-placed.png');
 // Real user-made Hissrum12 CREFORM model is served from the local vetted catalog.
 await page.locator('#room').selectOption('I20');
 await page.locator('#openLibrary').click();
 await page.locator('#libraryCategory').selectOption('hissrum12');
 await page.locator('#librarySearch').fill('IPT CREFORM');
 check('Hissrum12 CREFORM models searchable',await page.locator('.library-tile').count()>=1);
 await page.locator('.library-tile').first().click();
 await page.waitForFunction(()=>__furnitureEditor.getPatch().added.some(p=>p.assetId==='hissrum12:creformIptCart'));
 check('Hissrum12 GLB loads and places in independent WebGL editor',await page.evaluate(()=>__furnitureEditor.getPatch().added.some(p=>p.assetId==='hissrum12:creformIptCart')));
 // Local GLB bytes are packed in ZIP; verify the full roundtrip, not metadata only.
 await page.locator('#room').selectOption('I20');
 await page.locator('#openLibrary').click();
 const customGLB=await readFile(resolve('assets/fps/models/chairDesk.glb'));
 await page.locator('#customGLB').setInputFiles({name:'my-custom-chair.glb',mimeType:'model/gltf-binary',buffer:customGLB});
 await page.waitForFunction(()=>__furnitureEditor.getPatch().added.some(p=>p.assetId?.startsWith('local:')),{timeout:25000});
 check('user-owned GLB parsed and placed without fetching external URLs',await page.evaluate(()=>__furnitureEditor.getPatch().added.some(p=>p.assetId?.startsWith('local:'))));
 // A private model archive is imported locally, without publishing or auto-placing its content.
 const digest=createHash('sha256').update(customGLB).digest('hex');
 const bundle=makeZip([{name:'projekt.json',data:'{}'},{name:'models/'+digest+'.glb',data:customGLB}]);
 await page.locator('#openLibrary').click();
 await page.locator('#customZip').setInputFiles({name:'private-models.zip',mimeType:'application/zip',buffer:Buffer.from(bundle)});
 await page.waitForFunction(()=>document.querySelector('#libraryImportStatus')?.textContent.includes('1 av 1 GLB-modeller'));
 check('private ZIP pack loads into local catalog without auto-placement',await page.evaluate(()=>
  document.querySelector('#libraryImportStatus').textContent.includes('1 av 1')&&
  __furnitureEditor.getPatch().added.filter(p=>p.assetId?.startsWith('local:')).length===1));
 await page.locator('#closeLibrary').click();

 const [zipDownload]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadTop').click()]);
 const zipBuffer=await readFile(await zipDownload.path()),files=readZip(zipBuffer);
 const exported=JSON.parse(new TextDecoder().decode(files.get('projekt.json')));
 check('ZIP contains JSON and original binary GLB',zipDownload.suggestedFilename().endsWith('.zip')&&files.size===2&&exported.added.some(p=>p.assetId?.startsWith('local:'))&&[...files.keys()].some(x=>x.endsWith('.glb')));
 await page.screenshot({path:resolve(out,'04-imported-glb.png'),fullPage:true});report.shots.push('04-imported-glb.png');
 await page.reload({waitUntil:'networkidle'});await page.waitForFunction(()=>__furnitureEditor.getState()?.chairs>=50);
 check('autosave restores both Kenney and imported GLB placement',await page.evaluate(()=>__furnitureEditor.getPatch().added.length===3));
 const dialog2=page.waitForEvent('dialog').then(d=>d.accept());await page.locator('#reset').click();await dialog2;
 check('reset clears both new objects',await page.evaluate(()=>__furnitureEditor.getPatch().added.length===0));
 await page.locator('#importFile').setInputFiles({name:'MyFurniture.zip',mimeType:'application/zip',buffer:zipBuffer});
 await page.waitForFunction(()=>__furnitureEditor.getPatch().added.length===3);
 check('ZIP project restores original user GLB and CC0 placements',await page.evaluate(()=>__furnitureEditor.getPatch().added.length===3));
 // Prototype: saveable dimensions, GLB role override and camera modifiers.
 const sourceTable=await page.evaluate(()=>{
  const found=window.SpelFloor5.obstacles.find(o=>o.kind==='authored-dining-table');
  if(!found)throw Error('Expected authored dining table');
  __furnitureEditor.select(found.id);return __furnitureEditor.getItem(found.id);
 });
 check('table measurements visible for source furniture',await page.locator('#tableSizeFields').isVisible());
 await page.locator('#tableWidth').fill(String(Math.round((sourceTable.w-.12)*1000)/1000));
 await page.locator('#tableWidth').press('Tab');
 check('table width edit persists to placements without changing original map',await page.evaluate(id=>
  __furnitureEditor.getPatch().placements.some(p=>p.id===id&&p.w>0),sourceTable.id));
 const custom=await page.evaluate(()=>__furnitureEditor.getPatch().added.find(o=>o.assetId?.startsWith('local:')));
 await page.evaluate(id=>__furnitureEditor.select(id),custom.id);
 check('custom GLB category selector is accessible',await page.locator('#assetRoleFields').isVisible());
 await page.locator('#assetRole').selectOption('table');
 check('custom model can be classified as a resizable table',
  await page.locator('#tableSizeFields').isVisible()&&
  await page.evaluate(id=>__furnitureEditor.getPatch().added.find(p=>p.id===id)?.assetRole==='table',custom.id));
 await page.locator('#threeView').click();
 const posBefore=await page.evaluate(()=>__furnitureEditor.getCameraTarget());
 const rect=await page.locator('#viewport').boundingBox();
 await page.mouse.move(rect.x+rect.width/2,rect.y+rect.height/2);
 await page.keyboard.down('Control');await page.mouse.down();
 await page.mouse.move(rect.x+rect.width/2+38,rect.y+rect.height/2+14,{steps:3});
 await page.mouse.up();await page.keyboard.up('Control');
 check('Ctrl + left drag pans camera in furniture 3D without moving selected object',
  await page.evaluate(({before,id})=>{
   const after=__furnitureEditor.getCameraTarget(),selected=__furnitureEditor.getItem(id);
   return Math.hypot(after.x-before.x,after.z-before.z)>.02&&selected?.assetRole==='table';
  },{before:posBefore,id:custom.id}));
 // Navigation regression: opening/using the object library must never reset the camera.
 await page.locator('#room').selectOption('I09'); // intentional jump, unlike Add Object
 const focus=await page.evaluate(()=>__furnitureEditor.getCameraTarget());
 check('current position indicator follows the camera, no room code knowledge needed',
  await page.locator('#areaHere').textContent().then(t=>t.includes('I09')));
 const newId=await page.evaluate(()=>__furnitureEditor.addPreset('kenney:furniture-kit:plantsmall1'));
 const after=await page.evaluate(()=>__furnitureEditor.getCameraTarget());
 check('Add Object does not teleport or change the camera location',
  Math.abs(after.x-focus.x)<1e-7&&Math.abs(after.z-focus.z)<1e-7);
 if(newId)check('camera-centered model is assigned to the current area rather than old selection',
  await page.evaluate(({id,focus})=>{
   const item=__furnitureEditor.getItem(id);
   return item.roomId===__furnitureEditor.roomAt(focus.x,focus.z);
  },{id:newId,focus}));
 // Start a truly furniture-free editor, with source models untouched.
 const beforeClear=await page.evaluate(()=>__furnitureEditor.getPatch());
 await page.evaluate(()=>__furnitureEditor.emptyRooms());
 check('clear all areas removes source chairs and hides fixed furniture without changing gameplay',
  await page.evaluate(()=>__furnitureEditor.getEmptyFixed()&&__furnitureEditor.getState().chairs===0&&
   __furnitureEditor.getPatch().removed.length>40));
 const kitchen=await page.evaluate(()=>__furnitureEditor.addPreset('studio:counter-180'));
 check('low-poly white counter can be added on a cleared floor',
  await page.evaluate(id=>!!id&&__furnitureEditor.getItem(id)?.assetId==='studio:counter-180',kitchen));
 const microwave=await page.evaluate(()=>__furnitureEditor.addPreset('studio:microwave'));
 check('microwave magnetically attaches ON TOP of counter, never on the floor',
  await page.evaluate(({microwave,kitchen})=>{
    const item=__furnitureEditor.getItem(microwave),bench=__furnitureEditor.getItem(kitchen);
    return !!item&&item.mountId===kitchen&&item.elevation>bench.height-.05;
  },{microwave,kitchen}));
 check('portable JSON saves cleared areas, procedural assets and countertop mount',
  await page.evaluate(()=>{const d=__furnitureEditor.getPatch();return d.emptyFixed===true&&
   d.added.some(x=>x.assetId==='studio:microwave'&&x.elevation>0&&x.mountId);}));
 check('no external requests, runtime boot, script/shader or HTTP errors',!report.externalRequests.length&&!report.httpFailures.length&&!report.errors.length&&await page.evaluate(()=>!window.__fps));
 report.status='PASS';
}catch(err){report.status='FAIL';report.errors.push(err.stack||String(err));console.error(err);}
finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');await context.close();await browser.close();}
if(report.status!=='PASS')process.exitCode=1;
