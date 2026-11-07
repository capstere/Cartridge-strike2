/** Browser end-to-end: narrow WC wall insertion, source toilet restyling and FPS leaf. */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const page=await context.newPage(),errors=[];
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const wait=fn=>page.waitForFunction(fn,null,{timeout:90000});
try{
 for(const mode of ['new-level','edit-floor5']){
  await page.goto(origin+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));
  await wait(()=>window.__levelStudio?.scene?.entries?.length>=0);
  let target;
  if(mode==='new-level'){
   await page.locator('#kidRoom').click();
   await page.locator('[data-tool="wc-door"]').click();
   const wall=await page.evaluate(()=>{
    const items=__levelStudio.scene.entries.filter(e=>e.kind==='wall'&&e.id.startsWith('BYGG-'));
    return items.sort((a,b)=>Math.hypot(b.b[0]-b.a[0],b.b[1]-b.a[1])-Math.hypot(a.b[0]-a.a[0],a.b[1]-a.a[1]))[0];
   });
   assert(wall);
   const p=await page.evaluate(v=>__levelStudio.screenWorldPoint(v[0],v[1]),[(wall.a[0]+wall.b[0])/2,(wall.a[1]+wall.b[1])/2]);
   await page.mouse.click(p.x,p.y);
   target=await page.evaluate(()=>__levelStudio.project.architecture.added.find(d=>d.doorStyle==='wc')?.id);
   assert(target,'WC click should create a real attached door');
   const width=await page.evaluate(id=>{const d=__levelStudio.scene.entries.find(e=>e.id===id);return Math.hypot(d.a[0]-d.b[0],d.a[1]-d.b[1]);},target);
   assert(Math.abs(width-.85)<.002);
  }else{
   target='D43';
   await page.evaluate(id=>__levelStudio.select(id),target);
   await page.locator('#doorStyle').selectOption('wc');
   const edited=await page.evaluate(id=>__levelStudio.project.architecture.edits.find(d=>d.id===id),target);
   assert.equal(edited.doorStyle,'wc');
   assert(Math.abs(Math.hypot(edited.a[0]-edited.b[0],edited.a[1]-edited.b[1])-.8542142)<.002);
  }
  await page.locator('#threeView').click();
  await wait(()=>__levelStudio.architectureVisuals?.some(a=>a.part?.includes('WC-sign')));
  const badge=await page.evaluate(id=>__levelStudio.architectureVisuals.filter(v=>v.id===id&&v.part?.includes('WC-sign')).length,target);
  assert(badge>=2,mode+': WC sign must be present on both sides of the door');
  await page.locator('#save').click();
  await page.locator('#walkView').click();
  await wait(()=>document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.doorVisuals?.root);
  const frame=page.frames().find(frame=>frame.url().includes('/fps/walk.html'));assert(frame,'FPS walk iframe not found');
  const state=await frame.evaluate(id=>{
   const w=window.__walk?.world,r=window.__walk?.renderer;
   const door=w?.doors.doors.find(d=>d.id===id);
   const sign=r?.doorVisuals.root.getObjectByName(id+'-wc-badge');
   return {width:door?.width,style:door?.doorStyle,sign:!!sign};
  },target);
  assert.equal(state.style,'wc');assert(state.sign);assert(state.width>=.65);
  await page.setViewportSize({width:390,height:844});
  await page.setViewportSize({width:1440,height:1000});
  assert.deepEqual(errors,[]);
  console.log('WC door PASS',mode,state);
 }
}finally{await browser.close();}
