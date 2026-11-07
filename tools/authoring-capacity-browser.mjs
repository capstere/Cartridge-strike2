/** Synthetic editor regression. No owner plan or uploaded assets are published. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {parseProjectZip} from '../furniture-editor/build/level-project.mjs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/authoring-capacity';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1600,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];
page.setDefaultTimeout(30000);page.on('pageerror',e=>errors.push(e.message));
const get=()=>page.evaluate(()=>structuredClone(__levelStudio.project));
try{
 await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 const seed=await page.evaluate(async()=>{
  const {exportProject}=await import('./build/level-project.mjs?v=5.7.3');const {makeEntry}=await import('./build/architecture.mjs?v=5.7.3');
  const p=exportProject({projectId:'lvl-capacity-regression',name:'Synthetic 250-part source'});
  p.ground.floors=[{id:'BYGG-G-0001',name:'Test floor',role:'room',surface:'vinyl',x0:-35,z0:-25,x1:35,z1:30}];
  p.architecture.added=Array.from({length:250},(_,i)=>makeEntry('BYGG-V-'+String(i+1).padStart(4,'0'),'wall',[-30+(i%20)*3,10+Math.floor(i/20)],[-28+(i%20)*3,10+Math.floor(i/20)]));
  p.architecture.added[0].a=[0,-20];p.architecture.added[0].b=[8,-20];return p;
 });
 await page.locator('#open').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
 await page.waitForFunction(()=>__levelStudio.project.projectId==='lvl-capacity-regression');
 assert.equal((await get()).architecture.added.length,250);
 // Real wall-placement button and pointer hit: this used to throw at 250.
 await page.locator('[data-tool="window"]').click();
 const target=await page.evaluate(()=>__levelStudio.screenWorldPoint(4,-20));await page.mouse.click(target.x,target.y);
 await page.waitForFunction(()=>__levelStudio.project.architecture.added.length===252);
 assert.match(await page.locator('#authoringStatus').textContent(),/252 nya byggdelar/);
 const inserted=await get();assert.equal(inserted.architecture.added.filter(e=>e.kind==='window').length,1);
 await page.locator('#undo').click();assert.equal((await get()).architecture.added.length,250);
 await page.locator('#redo').click();assert.equal((await get()).architecture.added.length,252);
 const download=page.waitForEvent('download');await page.locator('#save').click();const zip=readFileSync(await (await download).path());
 const saved=await parseProjectZip(zip);assert.deepEqual(saved.project.architecture,inserted.architecture);
 assert.equal(saved.project.validation.summary.playable,false);
 await page.locator('#open').setInputFiles({name:'source.zip',mimeType:'application/zip',buffer:zip});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
 assert.deepEqual((await get()).architecture,saved.project.architecture);
 await page.reload();await page.waitForFunction(()=>!!window.__levelStudio);assert.equal((await get()).architecture.added.length,252);
 await page.locator('#threeView').click();await page.waitForFunction(()=>__levelStudio.architectureVisuals.length>250);
 await page.screenshot({path:out+'/source-252.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',nativeClick250to252:true,undoRedo:true,nativeZIP:true,reload:true,webGL:true,unfinishedNotMarkedPlayable:true,errors},null,2));
 console.log('Authoring-capacity browser PASS');
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.json',JSON.stringify({message:e.message,errors},null,2));throw e;}finally{await browser.close();}
