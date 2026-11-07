/** Real user journey: original Floor 5 -> empty interior -> ZIP -> reopen -> restore. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,mkdirSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
 '--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.on('pageerror',e=>errors.push(e.message));
page.on('dialog',d=>d.accept());
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const wait=f=>page.waitForFunction(f,null,{timeout:90000});
const snapshot=()=>page.evaluate(()=>{
 const p=__levelStudio.project,s=__levelStudio.scene;
 return {mode:p.mode,items:s.items.length,fixed:s.fixed.length,
  removed:p.furniture.removed.length,emptyFixed:!!p.legacyPatch?.emptyFixed,
  walls:JSON.stringify(s.entries),floors:JSON.stringify(s.floors),
  gameplay:JSON.stringify(p.gameplay),posters:p.architecture.posters.length};
});
try{
 await page.goto(origin+'/furniture-editor/new.html?mode=edit-floor5&test=1');
 await wait(()=>!!window.__levelStudio);
 const before=await snapshot();
 assert.equal(before.mode,'edit-floor5');
 assert(before.items>100&&before.fixed>0);
 await page.locator('[data-tab="furnish"]').click();
 assert(await page.locator('#clearFloor5Interior').isVisible());
 await page.locator('#clearFloor5Interior').click();
 await wait(()=>window.__levelStudio.project.legacyPatch?.emptyFixed===true);
 const empty=await snapshot();
 assert.equal(empty.items,0);
 assert.equal(empty.fixed,0);
 assert.equal(empty.removed,before.items);
 assert.equal(empty.walls,before.walls);
 assert.equal(empty.floors,before.floors);
 assert.equal(empty.gameplay,before.gameplay);
 assert(await page.locator('#restoreFloor5Interior').isVisible());
 await page.locator('#threeView').click();
 await wait(()=>__levelStudio.visualFurniture.length===0);
 const pending=page.waitForEvent('download');
 await page.locator('#save').click();
 const download=await pending;
 const zip=readFileSync(await download.path());
 assert(zip.length>500);
 await page.reload();
 await wait(()=>!!window.__levelStudio);
 const loaded=await snapshot();
 assert.equal(loaded.items,0);
 assert.equal(loaded.fixed,0);
 // Import ZIP to prove the portable handoff, not just browser autosave.
 await page.locator('#open').setInputFiles({name:'floor5-empty.zip',mimeType:'application/zip',buffer:zip});
 await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
 const imported=await snapshot();
 assert.deepEqual(imported,empty);
 await page.locator('[data-tab="furnish"]').click();
 await page.locator('#restoreFloor5Interior').click();
 const restored=await snapshot();
 assert.equal(restored.items,before.items);
 assert.equal(restored.fixed,before.fixed);
 assert.equal(restored.removed,0);
 assert.equal(restored.emptyFixed,false);
 assert.equal(restored.walls,before.walls);
 assert.equal(restored.floors,before.floors);
 assert.equal(restored.gameplay,before.gameplay);
 assert.deepEqual(errors,[]);
 console.log('STUDIO_EMPTY_FLOOR5_PASS',JSON.stringify({
   removed:empty.removed,fixedRemoved:before.fixed,
   wallsPreserved:true,floorsPreserved:true,gameplayPreserved:true,
   zipReload:true,originalRestored:true,errors
 }));
} finally {
 await browser.close();
}
