/** Synthetic authoring failures only. No private Floor 5 project is uploaded. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';
import {readZip} from '../furniture-editor/library/zip.mjs';
import {readDraftZip} from '../furniture-editor/build/draft-save.mjs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/draft-save';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1360,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const get=()=>page.evaluate(()=>structuredClone(__levelStudio.project));
async function download(id){const pending=page.waitForEvent('download');await page.locator('#'+id).click();const d=await pending;return {name:d.suggestedFilename(),bytes:readFileSync(await d.path())};}
async function open(data,name){await page.locator('#open').setInputFiles({name,mimeType:name.endsWith('.zip')?'application/zip':'text/plain',buffer:data});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));}
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 const p=await get();p.projectId='lvl-draft-regression';p.name='507 objects - unfinished';
 p.ground.floors=[{id:'BYGG-G-0001',name:'Synthetic',role:'room',surface:'vinyl',x0:-10,z0:-10,x1:10,z1:10}];
 p.furniture.added=Array.from({length:507},(_,i)=>({id:'NY-OBJ-'+String(i).padStart(4,'0'),kind:'table',x:-7+(i%26)*.5,z:-7+Math.floor(i/26)*.5,yaw:0,w:.3,d:.3,height:.6,collision:'none'}));
 await open(Buffer.from(JSON.stringify(p)),'rescue.json.txt');assert.equal((await get()).furniture.added.length,507);
 const saved=await download('save'),files=readZip(saved.bytes),doc=JSON.parse(new TextDecoder().decode(files.get('project.json')));
 assert(!files.has('RECOVERY.json'));assert.equal(doc.furniture.added.length,507);assert.equal(doc.validation.summary.playable,false);assert.equal(doc.validation.engine.ran,false);
 await open(saved.bytes,'valid.zip');assert.deepEqual((await get()).furniture,doc.furniture);
 await page.reload();await page.waitForFunction(()=>!!window.__levelStudio);assert.equal((await get()).furniture.added.length,507);
 const backup=await download('saveBackup'),roundtrip=await readDraftZip(backup.bytes);assert.equal(roundtrip.project.furniture.added.length,507);
 await open(backup.bytes,'backup.zip');assert.equal((await get()).furniture.added.length,507);
 // A malformed live object cannot be played, but its exact data must be saved.
 await page.evaluate(()=>{__levelStudio.project.furniture.added[0].w=-2;__levelStudio.project.intent.keep='untouched invalid draft';});
 const invalid=await get(),rescue=await download('save');assert(rescue.name.includes('SAKERHETSKOPIA'));
 assert.deepEqual((await readDraftZip(rescue.bytes)).project,invalid);
 const raw=await download('saveJson');assert.deepEqual(JSON.parse(raw.bytes),invalid);
 // Missing binary does not delete the manifest entry or stop source backup.
 await page.evaluate(()=>{const id='local:'+'a'.repeat(64);__levelStudio.project.assets.local=[{assetId:id,file:'assets/models/'+id.slice(6)+'.glb',bytes:10}];});
 const missing=await download('save');const missingRead=await readDraftZip(missing.bytes);assert.equal(missingRead.recovery.missing.length,1);assert.equal(missingRead.project.assets.local.length,1);
 // Reloading rejected data locks recovery before any fallback scene can overwrite it.
 const rejected=JSON.stringify(invalid);await page.evaluate(raw=>localStorage.setItem('cartridge-new-level-v2',raw),rejected);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#recoveryDialog')?.open);
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-new-level-v2')),rejected);
 const protectedDownload=page.waitForEvent('download');await page.getByRole('button',{name:'HÄMTA ORIGINALUTKAST',exact:true}).click();
 assert.equal(readFileSync(await (await protectedDownload).path(),'utf8'),rejected);
 const chooser=page.waitForEvent('filechooser');await page.getByRole('button',{name:'ÖPPNA REPARERAD JSON/ZIP',exact:true}).click();
 await (await chooser).setFiles({name:'repaired.zip',mimeType:'application/zip',buffer:saved.bytes});
 await page.waitForFunction(()=>!document.querySelector('#recoveryDialog').open);
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-new-level-v2:before-import')),rejected);
 assert.equal((await get()).furniture.added.length,507);
 await page.screenshot({path:out+'/recovered.png'});
 // Import / demo / undo must keep the other editing mode's storage untouched.
 const newRaw=await page.evaluate(()=>localStorage.getItem('cartridge-new-level-v2'));
 const floor=await page.evaluate(async()=>{const {exportProject}=await import('./build/level-project.mjs?v=5.7.2');return exportProject({mode:'edit-floor5',projectId:'lvl-mode-switch',name:'Saved Floor 5'});});
 await open(Buffer.from(JSON.stringify(floor)),'floor.json');await page.waitForFunction(()=>__levelStudio.project.projectId==='lvl-mode-switch');
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-new-level-v2')),newRaw);
 const floorRaw=await page.evaluate(()=>localStorage.getItem('cartridge-floor5-level-v2'));
 await page.locator('#demo').click();await page.waitForFunction(()=>__levelStudio.project.mode==='new-level');
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-floor5-level-v2')),floorRaw);
 await page.locator('#undo').click();assert.equal((await get()).projectId,'lvl-mode-switch');
 assert.equal(await page.evaluate(()=>localStorage.getItem('cartridge-floor5-level-v2')),floorRaw);

 assert.deepEqual(errors,[]);writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',objects:507,nativeZIP:true,jsonTxtImport:true,invalidDraftPreserved:true,missingAssetReported:true,rejectedAutosaveProtected:true,modeSwitchIsolated:true,errors},null,2));
 console.log('Draft-save browser regression PASS');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.json',JSON.stringify({error:e.message,stack:e.stack,errors},null,2));throw e;}finally{await browser.close();}
