/** Real modifier clicks and keyboard clipboard gestures; no OS clipboard permission needed. */
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core'),out='test-results/studio-clipboard';mkdirSync(out,{recursive:true});
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
const wait=f=>page.waitForFunction(f,null,{timeout:90000}),doc=()=>page.evaluate(()=>structuredClone(__levelStudio.project)),items=()=>page.evaluate(()=>structuredClone(__levelStudio.scene.items)),ids=()=>page.evaluate(()=>__levelStudio.selectedIds);
const point=async(id,view)=>page.evaluate(({id,view})=>{const o=__levelStudio.scene.items.find(o=>o.id===id);return view==='3d'?__levelStudio.screen3DPoint(o.x-.3,(o.elevation||0)+o.height,o.z-.3):__levelStudio.screenWorldPoint(o.x-.3,o.z-.3);},{id,view});
async function click(id,view,key){const q=await point(id,view);if(key)await page.keyboard.down(key);await page.mouse.click(q.x,q.y);if(key)await page.keyboard.up(key);}
async function centerFixtures(){
 // Zoom out with the same wheel gesture as a user until both raised fixtures fit the canvas.
 for(let i=0;i<12;i++){const a=await point('NY-OBJ-8001','3d'),b=await point('NY-OBJ-8002','3d'),r=await page.locator('#scene3d').boundingBox();
  if([a,b].every(q=>q.x>r.x+70&&q.x<r.x+r.width-70&&q.y>r.y+50&&q.y<r.y+r.height-80))return;
  await page.mouse.move(r.x+r.width*.7,r.y+r.height*.4);await page.mouse.wheel(0,120);await page.waitForTimeout(80);
 }
}
async function centerPlanFixtures(){const a=await point('NY-OBJ-8001','plan'),b=await point('NY-OBJ-8002','plan'),r=await page.locator('#plan').boundingBox(),x=r.x+r.width*.5,y=r.y+r.height*.4;
 await page.keyboard.down('Shift');await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+x-(a.x+b.x)/2,y+y-(a.y+b.y)/2,{steps:8});await page.mouse.up();await page.keyboard.up('Shift');
}
async function focusFloor(mode){if(mode==='edit-floor5'){await page.locator('#spaceTools summary').click();const value=await page.locator('#spaceSelect option').evaluateAll(o=>o.find(o=>o.value.includes('C11:I25')).value);await page.locator('#spaceSelect').selectOption(value);}else await page.locator('#threeView').click();}
try{
 for(const mode of (process.env.CLIPBOARD_TEST_MODE?[process.env.CLIPBOARD_TEST_MODE]:['new-level','edit-floor5'])){
  console.log('start',mode);await page.goto(origin+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));await wait(()=>window.__levelStudio);if(mode==='new-level')await page.locator('#kidRoom').click();
  const fixture=await page.evaluate(mode=>{const p=structuredClone(__levelStudio.project),f=mode==='new-level'?p.ground.floors[0]:__levelStudio.scene.floors.find(f=>f.id==='I25'),x=(f.x0+f.x1)/2,z=(f.z0+f.z1)/2;
   // Raised fixtures ensure Floor 5's original furniture cannot occlude modifier picking.
   const row=(id,x)=>({id,kind:'desk',roomId:f.id,x,z,yaw:0,w:1,d:1,height:.8,elevation:3.2,collision:'solid',mirrored:true});p.furniture.added.push(row('NY-OBJ-8001',x-1.3),row('NY-OBJ-8002',x+1.3));
   p.furniture.added.push({...row('NY-OBJ-8003',x-1.3),kind:'prop',w:.2,d:.2,height:.2,elevation:4,mountId:'NY-OBJ-8001',z:z+.32});return p;},mode);
  await page.locator('#open').setInputFiles({name:'clipboard-test.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await wait(()=>__levelStudio.scene.items.some(o=>o.id==='NY-OBJ-8003'));
  const originals=await items(),baseline=await doc();await focusFloor(mode);await page.locator('#cutaway').check();await centerFixtures();
  for(const view of ['3d','plan']){
   await page.locator(view==='3d'?'#threeView':'#planView').click();await page.locator('#clearFurnitureSelection').click();if(view==='plan')await centerPlanFixtures();
   const camera=await page.evaluate(()=>__levelStudio.viewState);await click('NY-OBJ-8001',view,'Control');await click('NY-OBJ-8002',view,'Meta');assert.deepEqual((await ids()).sort(),['NY-OBJ-8001','NY-OBJ-8002']);assert.deepEqual(await doc(),baseline,'modifier selection never edits instances');assert.deepEqual(await page.evaluate(()=>__levelStudio.viewState),camera,'modifier click does not pan');
   await click('NY-OBJ-8002',view,'Control');assert.deepEqual(await ids(),['NY-OBJ-8001']);await click('NY-OBJ-8002',view,'Meta');
   assert(await page.locator('#editDock').isHidden());assert(await page.locator('#furnitureHandles').isHidden());await page.screenshot({path:`${out}/${mode}-${view}-selected.png`});
   await page.keyboard.press('Control+c');await page.keyboard.press('Meta+v');let copied=(await items()).filter(o=>!originals.some(a=>a.id===o.id));assert.equal(copied.length,3);assert.equal((await ids()).length,3);assert.equal(copied.filter(o=>o.mountId&&copied.some(p=>p.id===o.mountId)).length,1);
   for(const row of originals)assert.deepEqual((await items()).find(o=>o.id===row.id),row,'original instance unchanged');
   await page.keyboard.press('Meta+z');assert.deepEqual(await doc(),baseline);await page.keyboard.press('Meta+Shift+z');assert.equal((await items()).length,originals.length+3);
   await page.keyboard.press('Control+v');assert.equal((await items()).length,originals.length+6);const latest=await ids();assert.equal(latest.length,3);assert(!latest.some(id=>copied.some(o=>o.id===id)));
   await page.keyboard.press('Delete');assert.equal((await items()).length,originals.length+3);await page.keyboard.press('Control+z');assert.equal((await items()).length,originals.length+6);
   await page.keyboard.press('Control+z');await page.keyboard.press('Control+z');assert.deepEqual(await doc(),baseline);
  }
  // An ordinary click replaces a multiple selection. Text fields retain their native shortcuts.
  await click('NY-OBJ-8001','plan','Control');await click('NY-OBJ-8002','plan','Control');await click('NY-OBJ-8001','plan');assert.deepEqual(await ids(),['NY-OBJ-8001']);
  await page.locator('#name').focus();await page.evaluate(()=>{window.clipboardInputEvents=[];document.addEventListener('keydown',e=>{if(e.target.id==='name'&&['c','v'].includes(e.key))clipboardInputEvents.push(e.defaultPrevented);});});await page.keyboard.press('Control+c');await page.keyboard.press('Control+v');assert.deepEqual(await page.evaluate(()=>clipboardInputEvents),[false,false]);assert.deepEqual(await items(),originals);await page.locator('#name').fill(baseline.name);await page.locator('#name').blur();
  await page.locator('#copyFurniture').click();await page.locator('#pasteFurniture').click();assert.equal((await items()).length,originals.length+2);
  // Actual ZIP download/reload includes new IDs and remapped attachment relationships.
  const download=page.waitForEvent('download');await page.locator('#save').click();const bytes=readFileSync(await (await download).path()),saved=await doc();await page.reload();await wait(()=>window.__levelStudio);await page.locator('#open').setInputFiles({name:'clipboard.zip',mimeType:'application/zip',buffer:bytes});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));assert.deepEqual(await doc(),saved);
  await page.setViewportSize({width:390,height:844});if(await page.locator('body').getAttribute('data-studio-sheet')==='checks')await page.locator('#closeSave').click();await page.locator('#threeView').click();await page.evaluate(()=>__levelStudio.select('NY-OBJ-8001'));assert(await page.locator('#copyFurniture').isVisible());await page.locator('#copyFurniture').click();await page.locator('#pasteFurniture').click();assert.equal((await ids()).length,2);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${mode}-mobile.png`});await page.setViewportSize({width:1440,height:1000});console.log('PASS',mode);
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',origin,modifierClicks:['Control','Meta'],views:['plan','3d'],modes:['new-level','edit-floor5'],snapshot:true,uniqueIDs:true,attachments:true,originalsUnchanged:true,undoRedo:true,ZIP:true,nativeTextClipboard:true,narrowViewport:390,errors},null,2));
}catch(e){await page.screenshot({path:`${out}/failure.png`});console.log('selection on failure',await ids(),await page.locator('#status').textContent());throw e;}finally{await browser.close();}
