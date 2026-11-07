/** Real pointer floor editing, matching lintel images, frosted doors, ZIP and FPS. */
import assert from 'node:assert/strict';import {createRequire} from 'node:module';import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core'),out='test-results/studio-floor-door';mkdirSync(out,{recursive:true});
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']}),context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
const wait=f=>page.waitForFunction(f,null,{timeout:90000}),select=id=>page.evaluate(id=>__levelStudio.select(id),id),doc=()=>page.evaluate(()=>structuredClone(__levelStudio.project));
async function saveReload(){const dl=page.waitForEvent('download');await page.locator('#save').click();const bytes=readFileSync(await (await dl).path()),before=await doc();await page.reload();await wait(()=>window.__levelStudio);await page.locator('#open').setInputFiles({name:'test.zip',mimeType:'application/zip',buffer:bytes});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));assert.deepEqual(await doc(),before);}
try{
 for(const mode of ['new-level','edit-floor5']){console.log('start',mode);
  await page.goto(origin+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));await wait(()=>window.__levelStudio);
  if(mode==='new-level')await page.locator('#kidRoom').click();
  await page.locator('#threeView').click();
  if(mode==='edit-floor5'){await page.locator('#spaceTools summary').click();const opt=await page.locator('#spaceSelect option').evaluateAll(o=>o.find(o=>o.value.includes('C11:I25')).value);await page.locator('#spaceSelect').selectOption(opt);}
  const id=mode==='new-level'?(await doc()).ground.floors[0].id:'I25';await select(id);await page.getByRole('button',{name:'Svart',exact:true}).click();assert.equal((await doc()).surfaceColors[id],'#000000');
  if(mode==='new-level')await page.locator('#floorDragMode').click();assert.equal(await page.locator('#floorDragMode').textContent(),'Dra bara golvet ✓');
  const arch=JSON.stringify((await doc()).architecture),floor=await page.evaluate(id=>(__levelStudio.project.mode==='new-level'?__levelStudio.project.ground.floors:__levelStudio.scene.floors).find(f=>f.id===id),id);
  // Drag a visible floor-only handle using pointer events in perspective 3D.
  const key=mode==='new-level'?'floor-1':'floor-3';const h=await page.evaluate(key=>__levelStudio.floorHandles.find(h=>h.handle===key),key);assert(h);
  const a=await page.evaluate(v=>__levelStudio.screen3DPoint(...v),h.position),b=await page.evaluate(v=>__levelStudio.screen3DPoint(...v),[h.position[0]+(mode==='new-level'?-.7:.7),h.position[1],h.position[2]]);
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await page.mouse.up();
  let after=await doc();assert.equal(JSON.stringify(after.architecture),arch,'floor drag cannot move a wall/door');
  const getRight=p=>mode==='new-level'?p.ground.floors[0].x1:p.ground.floorEdits?.I25?.[0]?.[0];assert(mode==='new-level'?getRight(after)<floor.x1-.4:getRight(after)>floor.x0+.4,JSON.stringify({mode,status:await page.locator('#status').textContent(),after:after.ground}));
  await page.locator('#undo').click();assert(mode==='new-level'?(await doc()).ground.floors[0].x1===floor.x1:!(await doc()).ground.floorEdits);
  await page.locator('#redo').click();assert.equal(getRight(await doc()),getRight(after));
  // Cancel restores the last completed drag without changing the undo history.
  await select(id);const c=await page.evaluate(key=>__levelStudio.floorHandles.find(h=>h.handle===key),key),ca=await page.evaluate(v=>__levelStudio.screen3DPoint(...v),c.position);await page.mouse.move(ca.x,ca.y);await page.mouse.down();await page.mouse.move(ca.x-20,ca.y+10,{steps:3});await page.keyboard.press('Escape');await page.mouse.up();assert.deepEqual(await doc(),after);
  await select(id);await page.screenshot({path:`${out}/${mode}-floor-handles.png`});
  if(mode==='new-level'){
   // Pull back to the actual wall face (not its centre/grid); snapping is asserted.
   const start=await page.evaluate(()=>__levelStudio.floorHandles.find(h=>h.handle==='floor-1')),sa=await page.evaluate(v=>__levelStudio.screen3DPoint(...v),start.position),sb=await page.evaluate(v=>__levelStudio.screen3DPoint(...v),[floor.x1-.04,start.position[1],start.position[2]]);
   await page.mouse.move(sa.x,sa.y);await page.mouse.down();await page.mouse.move(sb.x,sb.y,{steps:8});await page.mouse.up();assert.match(await page.locator('#status').textContent(),/snäpper/);assert(Math.abs((await doc()).ground.floors[0].x1-(floor.x1-.055+.002))<.004);
  }
  const door=await page.evaluate(()=>__levelStudio.scene.entries.filter(e=>e.kind==='door'&&!e.originallyBlocked).sort((a,b)=>__levelStudio.project.mode==='edit-floor5'?Math.hypot(a.a[0]-38,a.a[1]-26)-Math.hypot(b.a[0]-38,b.a[1]-26):0)[0]);await select(door.id);await page.locator('#doorStyle').selectOption('frosted');await page.locator('#previewDoor').click();await page.screenshot({path:`${out}/${mode}-frosted-open.png`});await page.locator('#previewDoor').click();
  console.log('pointer and finish passed',mode);await saveReload();await page.locator('#threeView').click();await select(door.id);assert.equal(await page.locator('#doorStyle').inputValue(),'frosted');
  await page.setViewportSize({width:390,height:844});if(await page.locator('body').getAttribute('data-studio-sheet')==='checks')await page.locator('#closeSave').click();if(await page.locator('body').getAttribute('data-studio-sheet')==='tools')await page.locator('#closeTools').click();assert(await page.locator('#doorStyle').isVisible());await page.locator('#doorStyle').selectOption('solid');await page.locator('#doorStyle').selectOption('frosted');await page.locator('#previewDoor').click();await page.locator('#previewDoor').click();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${mode}-mobile.png`});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#walkView').click();await wait(()=>document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.doorVisuals);
  const frame=page.frame({url:/\/fps\/walk\.html/}),result=await frame.evaluate(({id,door})=>{const {world:w,renderer:r}=__walk,d=w.doors.doors.find(d=>d.id===door.id),g=r.doorVisuals.root.getObjectByName(door.id+'-frosted');
   const x=d.x,z=d.z,side=w.onFloor(x+d.nx*2,z+d.nz*2)?1:-1;r.camera.position.set(x+d.nx*2.8*side,1.7,z+d.nz*2.8*side);r.camera.lookAt(x,1.4,z);w.doors.pose(d,Math.PI/4);r.doorVisuals.update();r.renderer.render(r.scene,r.camera);
   return {style:d.doorStyle,hasGlass:g.children.some(m=>m.material.transmission>.5),angle:g.rotation.y,expected:d.leaves[0].box.angle,color:w.description.surfaces.find(s=>s.id==='finish-'+id).studioColor};},{id,door});assert.equal(result.style,'frosted');assert(result.hasGlass);assert.equal(result.angle,result.expected);assert.equal(result.color,'#000000');await page.screenshot({path:`${out}/${mode}-fps.png`});
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',floorDrag3D:true,originalWallsPreserved:true,undoRedo:true,cancel:true,snapPhysicalWall:true,blackFloor:true,frostedDoor:true,ZIP:true,FPS:true,narrowViewport:390,errors},null,2));console.log('PASS floor-only pointer drag, frosted door and black floor in both studios and FPS');
}finally{await browser.close();}
