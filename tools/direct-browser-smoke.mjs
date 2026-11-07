/** Mouse-first editing on real Chromium/WebGL; no editor-private mutation. */
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',errors=[];
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:900},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(120000);
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
const point=async(x,z)=>page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);
const click=async(x,z)=>{const p=await point(x,z);await page.mouse.click(p.x,p.y);};
const drag=async(from,to)=>{const a=await point(...from),b=await point(...to);
 await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:9});await page.mouse.up();};
const data=()=>page.evaluate(()=>structuredClone(__levelStudio.project));
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 assert.equal(await page.locator('#firstBuild').getAttribute('data-step'),'0');
 // This regression exercises manual precision drawing; the beginner guide now creates a complete room in one click.
 await page.locator('#tool').selectOption('room');assert.equal(await page.locator('#tool').inputValue(),'room');
 await drag([2,2],[8,8]);
 assert.equal((await data()).ground.floors.length,1);
 assert.equal(await page.locator('#firstBuild').getAttribute('data-step'),'1');
 await page.keyboard.press('Escape');await click(5,5);
 const roomId=await page.evaluate(()=>__levelStudio.selected);
 assert(roomId?.startsWith('BYGG-G-'));
 await drag([2,2],[1,1]);
 let doc=await data(),room=doc.ground.floors.find(f=>f.id===roomId);
 assert.deepEqual([room.x0,room.z0,room.x1,room.z1],[1,1,8,8],'corner drag resizes floor');
 assert(doc.architecture.added.some(w=>w.kind==='wall'&&w.a[0]===1&&w.b[0]===1),'room wall follows the handle');
 await page.locator('#undo').click();assert.equal((await data()).ground.floors[0].x0,2);
 await page.locator('#redo').click();assert.equal((await data()).ground.floors[0].x0,1);
 await page.locator('[data-tool="room"]').click();await drag([11,2],[17,8]);
 await page.locator('#tool').selectOption('corridor');await drag([8,4],[11,6]);
 assert.equal((await data()).ground.floors.length,3);
 await page.locator('#firstBuildNext').click();assert.equal(await page.locator('#tool').inputValue(),'door');
 await click(8,5);
 assert.equal(await page.locator('#firstBuild').getAttribute('data-step'),'2');
 await click(11,5);
 doc=await data();assert.equal(doc.architecture.added.filter(w=>w.kind==='door').length,2);
 const firstDoor=doc.architecture.added.find(w=>w.kind==='door'&&w.a[0]===8);
 await page.keyboard.press('Escape');await drag([8,5],[8,5.8]);
 doc=await data();const moved=doc.architecture.added.find(w=>w.id===firstDoor.id);
 assert(Math.abs((moved.a[1]+moved.b[1])/2-5.8)<.12,
  JSON.stringify({reason:'door slides along wall',status:await page.locator('#status').innerText(),moved}));
 assert(doc.architecture.added.some(w=>w.kind==='wall'&&w.a[0]===8&&w.b[0]===8&&
  Math.min(w.a[1],w.b[1])<5&&Math.max(w.a[1],w.b[1])>5),'old door opening is now a solid wall');
 await page.locator('#undo').click();assert(Math.abs(((await data()).architecture.added.find(w=>w.id===firstDoor.id).a[1]+
  (await data()).architecture.added.find(w=>w.id===firstDoor.id).b[1])/2-5)<.1,'one undo restores door and both wall sides');
 await page.locator('#redo').click();
 const winButton=page.locator('[data-tool="window"]'),target=await point(4,1),box=await page.locator('#plan').boundingBox();
 await winButton.dragTo(page.locator('#plan'),{targetPosition:{x:target.x-box.x,y:target.y-box.y}});
 doc=await data();assert.equal(doc.architecture.added.filter(w=>w.kind==='window').length,1,
  JSON.stringify({status:await page.locator('#status').innerText(),target}));
 const windowId=doc.architecture.added.find(w=>w.kind==='window').id,sill=doc.architecture.added.find(w=>w.id===windowId).sill;
 await page.keyboard.press('Escape');await drag([4,1],[5.2,1]);
 doc=await data();const window=doc.architecture.added.find(w=>w.id===windowId);
 assert(Math.abs((window.a[0]+window.b[0])/2-5.2)<.12&&window.sill===sill,'window slides with its sill and wall');
 await page.keyboard.press('Escape');await click(4,4);
 assert.equal(await page.evaluate(()=>__levelStudio.selected),roomId);
 await drag([1,1],[.5,.5]);
 doc=await data();room=doc.ground.floors.find(f=>f.id===roomId);
 assert.deepEqual([room.x0,room.z0],[.5,.5]);
 assert(Math.abs(Math.hypot(...doc.architecture.added.find(w=>w.id===firstDoor.id).b.map((n,i)=>n-
  doc.architecture.added.find(w=>w.id===firstDoor.id).a[i]))-1.2)<.01,'room resize preserves door width');
 const resizedWindow=doc.architecture.added.find(w=>w.id===windowId);
 assert(Math.abs(Math.hypot(...resizedWindow.b.map((n,i)=>n-resizedWindow.a[i]))-1.6)<.01,'window was not distorted');
 await page.locator('#firstBuildNext').click();assert(await page.locator('[data-tab="furnish"]').getAttribute('class')==='active');
 await page.locator('#catalogSearch').fill('orange köksstol');
 await page.locator('#catalogCards [data-asset="studio:orange-kitchen-chair"]').click();await click(3,3);
 assert.equal(await page.locator('#firstBuild').getAttribute('data-step'),'3');
 await page.locator('#gameLook').click();assert.equal(await page.evaluate(()=>__levelStudio.viewState.view),'3d');
 await page.waitForFunction(()=>document.querySelector('#gameLookFrame')?.contentWindow?.__walk?.renderer?.projectFurniture?.children?.length===1,null,{timeout:120000});
 assert(await page.locator('#gameLookFrame').isVisible());
 const preview=page.frame({url:/\/fps\/walk\.html\?.*embed=1/});assert(preview);
 assert(await preview.evaluate(()=>__walk.world.newLevel&&__walk.renderer.projectFurniture.children.length===1));
 await page.waitForFunction(()=>document.querySelector('#firstBuild').dataset.step==='4',null,{timeout:20000});
 await page.locator('#walkView').click();
 await page.waitForFunction(()=>document.querySelector('#walkFrame')?.contentWindow?.__walk?.renderer?.projectFurniture?.children?.length===1,null,{timeout:120000});
 await page.frame({url:/\/fps\/walk\.html\?draft/}).locator('#exit').click();
 assert.equal(await page.evaluate(()=>__levelStudio.viewState.view),'3d','walk returns to the same authoring view');
 assert(await page.locator('#gameLook').getAttribute('aria-pressed')==='true');
 await page.locator('#gameLook').click();
 const download=page.waitForEvent('download');await page.locator('#save').click();const zip=await download,bytes=readFileSync(await zip.path());
 assert.equal(await page.locator('#firstBuild').getAttribute('data-step'),'-1');
 await page.locator('#open').setInputFiles({name:'my-first-level.zip',mimeType:'application/zip',buffer:bytes});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
 assert.equal((await data()).ground.floors.length,3);
 assert.equal((await data()).architecture.added.find(w=>w.id===windowId).sill,sill);
 await page.locator('#firstBuildDismiss').click();assert(await page.locator('#firstBuild').isHidden());
 await page.locator('#showGuide').click();assert(await page.locator('#firstBuild').isVisible());
 assert.deepEqual(errors,[]);
 console.log(JSON.stringify({status:'PASS',rooms:2,corridors:1,doorSlide:true,windowSlide:true,
  resize:true,liveFPS:true,zipBytes:bytes.length,consoleErrors:0}));
}finally{await browser.close();}
