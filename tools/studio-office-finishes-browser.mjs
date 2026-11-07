/** Reference-inspired office finishes: UI -> ZIP -> actual FPS renderer. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const wait=()=>page.waitForFunction(()=>!!window.__levelStudio);
try {
 for(const mode of ['new-level','edit-floor5']){
  await page.goto(origin+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));
  await wait();
  if(mode==='new-level')await page.locator('#kidRoom').click();
  const floor=mode==='new-level'?(await page.evaluate(()=>__levelStudio.project.ground.floors[0].id)):'I25';
  await page.evaluate(id=>__levelStudio.select(id),floor);
  await page.locator('#selection details summary').click();
  await page.locator('#selectedSurface').selectOption('office-carpet');
  assert.equal(await page.evaluate(id=>__levelStudio.scene.floors.find(f=>f.id===id).surface,floor),'office-carpet');
  if(mode==='new-level'){
   for(const [tool,kind] of [['office-door','door'],['office-glass','glazed']]){
    await page.locator('[data-tool="'+tool+'"]').click();
    const wall=await page.evaluate(()=>{
     const excluded=__levelStudio.project.architecture.added.find(e=>e.doorStyle==='office');
     return __levelStudio.scene.entries.filter(e=>e.kind==='wall'&&e.id.startsWith('BYGG-'))
      .filter(e=>!excluded||Math.hypot(e.b[0]-excluded.b[0],e.b[1]-excluded.b[1])>2)[0];
    });
    assert(wall,'A different wall must exist for '+tool);
    const pos=await page.evaluate(v=>__levelStudio.screenWorldPoint(v[0],v[1]),[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2]);
    await page.mouse.click(pos.x,pos.y);
    const entry=await page.evaluate(k=>__levelStudio.project.architecture.added.find(e=>e.kind===k&&(k==='door'?e.doorStyle==='office':e.glazingStyle==='office-band')),kind);
    assert(entry,tool+' must create an authored style on the wall');
   }
  }else{
   await page.evaluate(()=>__levelStudio.select('D26'));
   await page.locator('#doorStyle').selectOption('office');
   assert.equal(await page.evaluate(()=>__levelStudio.project.architecture.edits.find(e=>e.id==='D26').doorStyle),'office');
   const glassId=await page.evaluate(()=>__levelStudio.scene.entries.find(e=>e.kind==='glazed')?.id||null);
   if(glassId){
    await page.evaluate(id=>__levelStudio.select(id),glassId);
    await page.locator('#glazingStyle').selectOption('office-band');
    assert.equal(await page.evaluate(id=>__levelStudio.scene.entries.find(e=>e.id===id).glazingStyle,glassId),'office-band');
   }
  }
  await page.locator('#threeView').click();
  const download=page.waitForEvent('download');
  await page.locator('#save').click();
  const before=await page.evaluate(()=>structuredClone(__levelStudio.project));
  const bytes=readFileSync(await (await download).path());
  await page.locator('#open').setInputFiles({name:'office.zip',mimeType:'application/zip',buffer:bytes});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
  assert.deepEqual(await page.evaluate(()=>structuredClone(__levelStudio.project)),before);
  assert.equal((await page.evaluate(id=>__levelStudio.scene.floors.find(f=>f.id===id).surface,floor)),'office-carpet');
  if(mode==='new-level'){
   await page.locator('#walkView').click();
   await page.waitForFunction(()=>!!document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.doorVisuals?.root,{timeout:90000});
   const frame=page.frames().find(f=>f.url().includes('/fps/walk.html'));
   assert(frame,'walk iframe missing');
   const summary=await frame.evaluate(()=>{
    const {world,renderer}=window.__walk;
    const office=world.doors.doors.filter(d=>d.doorStyle==='office');
    return {office:office.length,
     panel:office.every(d=>{const group=renderer.doorVisuals.root.getObjectByName(d.id+'-office');return !!group?.getObjectByName('office-panel');}),
     signal:world.description.boxes.filter(b=>b.material==='blue-graphic').length};
   });
   assert(summary.office>=1);assert(summary.panel);assert(summary.signal>=3);
  }
  assert.deepEqual(errors,[]);
  console.log('Office finishes PASS',mode);
 }
} finally {await browser.close();}
