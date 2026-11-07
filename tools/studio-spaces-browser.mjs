/** New/Floor 5: real paint controls, door previews, lounge repair, ZIP and FPS. */
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/studio-spaces';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const wait=f=>page.waitForFunction(f,null,{timeout:90000});const select=id=>page.evaluate(id=>__levelStudio.select(id),id);
async function paint(id,color){await select(id);assert(await page.locator('#surfaceDock').isVisible());await page.locator('#surfaceColor').fill(color);await page.locator('#surfaceColor').dispatchEvent('change');assert.equal(await page.evaluate(id=>__levelStudio.project.surfaceColors[id],id),color);}
async function saveOpen(){const download=page.waitForEvent('download');await page.locator('#save').click();const bytes=readFileSync(await (await download).path()),before=await page.evaluate(()=>JSON.stringify(__levelStudio.project));await page.reload();await wait(()=>window.__levelStudio);await page.locator('#open').setInputFiles({name:'design.zip',mimeType:'application/zip',buffer:bytes});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));const after=await page.evaluate(()=>JSON.stringify(__levelStudio.project));assert.equal(after,before);}
try{
 for(const mode of ['new-level','edit-floor5']){
  await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));await wait(()=>window.__levelStudio);
  if(mode==='new-level')await page.locator('#kidRoom').click();
  await page.locator('#threeView').click();assert(!(await page.locator('#cutaway').isChecked()));
  const ids=await page.evaluate(()=>({floor:(__levelStudio.project.mode==='edit-floor5'?'I25':__levelStudio.project.ground.floors[0].id),wall:__levelStudio.scene.entries.find(e=>e.kind==='wall').id,door:__levelStudio.scene.entries.find(e=>e.kind==='door'&&!e.originallyBlocked).id}));
  await paint(ids.floor,'#82af94');await paint(ids.wall,'#c5a7d8');await paint(ids.door,'#267d99');
  await page.locator('#previewDoor').click();assert.equal(await page.locator('#previewDoor').textContent(),'Visa dörren stängd');await page.locator('#previewDoor').click();
  assert(await page.evaluate(id=>__levelStudio.architectureVisuals.some(o=>o.id===id&&o.color==='267d99'&&o.size.height>2),ids.door));
  await page.screenshot({path:`${out}/${mode}-painted.png`});
  await page.locator('#cutaway').check();await page.screenshot({path:`${out}/${mode}-cutaway.png`});await page.locator('#cutaway').uncheck();
  if(mode==='edit-floor5'){
   await page.locator('#spaceTools summary').click();const gap=await page.locator('#spaceSelect option').evaluateAll(options=>options.find(o=>o.value.includes('C11:I25')).value);
   await page.locator('#spaceSelect').selectOption(gap);assert(Math.abs((await page.evaluate(()=>__levelStudio.viewState.threeCenter.x))-38.066)<.0001);assert.match(await page.locator('#spaceHint').textContent(),/0.056/);await page.screenshot({path:`${out}/lounge-gap.png`});
   await page.locator('#openSpace').click();assert.equal(await page.evaluate(()=>__levelStudio.project.ground.floors.length),1);
   await page.locator('#undo').click();assert.equal(await page.evaluate(()=>__levelStudio.project.ground.floors.length),0);await page.locator('#redo').click();assert.equal(await page.evaluate(()=>__levelStudio.project.ground.floors.length),1);
  }
  if(mode==='new-level'){
   await page.locator('#planView').click();await page.locator('[data-tab="furnish"]').click();await page.locator('#catalogCategory').selectOption('house-interior');assert.equal(await page.locator('#catalogCards button').count(),122);await page.locator('#autoPlace').uncheck();await page.locator('#placementMode').selectOption('floor');
   for(const [id,x,z] of [['onboard:house-chair-1',-1,0],['onboard:house-houseplant-2',1,0],['onboard:house-nightstand-2',-1,2]]){await page.locator(`[data-asset="${id}"]`).click();await wait(()=>__levelStudio.pendingAsset?.ready);const q=await page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);await page.mouse.click(q.x,q.y);await page.keyboard.press('Escape');}
   await page.locator('#threeView').click();await page.locator('#cutaway').check();await wait(()=>__levelStudio.visualFurniture.filter(o=>o.realModel).length===3);await page.screenshot({path:`${out}/house-furniture-in-studio.png`});await page.locator('[data-tab="build"]').click();
  }
  await saveOpen();await page.locator('#threeView').click();
  await page.setViewportSize({width:390,height:844});await select(ids.door);assert(await page.locator('#surfaceDock').isVisible());const dock=await page.locator('#surfaceDock').boundingBox();assert(dock.x>=0&&dock.x+dock.width<=390);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${mode}-mobile.png`});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#walkView').click();await wait(()=>document.querySelector('#walkFrame').contentWindow.__walk?.renderer);const walk=page.frame({url:/\/fps\/walk\.html/});
  const result=await walk.evaluate(({ids,mode})=>{const {world:w,renderer:r}=__walk;
   const f=w.description.surfaces.find(s=>s.id==='finish-'+ids.floor),d=w.doors.doors.find(d=>d.id===ids.door);let crossed=null;
   if(mode==='edit-floor5'){const a={x:37.8,y:0,z:28.5,radius:.22,height:1.7};for(let i=0;i<40;i++)w.move(a,.025,0,0);crossed=a.x>38.7;r.camera.position.set(37.5,1.6,28.4);r.camera.lookAt(41,1.3,27);}
   else{r.camera.position.set(3,1.6,3);r.camera.lookAt(0,1.2,0);}
   r.renderer.render(r.scene,r.camera);return {floor:f.studioColor,door:d.studioColor,crossed};
  },{ids,mode});assert.equal(result.floor,'#82af94');assert.equal(result.door,'#267d99');if(mode==='edit-floor5')assert(result.crossed);await page.screenshot({path:`${out}/${mode}-fps.png`});
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',newAndFloor5:true,colors:true,doorPoses:true,fullWalls:true,localLoungeRepair:true,houseFurniture:true,undoRedo:true,ZIP:true,narrowViewport:390,FPS:true,consoleErrors:errors},null,2));console.log('PASS studio surfaces, lounge, ZIP and FPS');
}finally{await browser.close();}
