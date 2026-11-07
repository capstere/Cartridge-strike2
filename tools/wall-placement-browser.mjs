/** Real editor inputs, real GLBs and the shared FPS renderer. No private source assets. */
import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync,readFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/wall-placement';mkdirSync(out,{recursive:true});rmSync(`${out}/result.json`,{force:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},deviceScaleFactor:1,acceptDownloads:true});
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
const page=await context.newPage(),errors=[];page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
const wait=fn=>page.waitForFunction(fn,null,{polling:100,timeout:90000});
const snap=async name=>page.screenshot({path:`${out}/${name}.png`});
const point=async(x,z)=>page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);
const clickPlan=async(x,z)=>{const q=await point(x,z);await page.mouse.click(q.x,q.y);};
const choose=async id=>{await page.locator('[data-tab="furnish"]').click();await page.locator('#catalogSearch').fill('');await page.locator('#catalogCategory').selectOption('all');await page.locator(`[data-asset="${id}"]`).click();await wait(()=>__levelStudio.pendingAsset?.ready);};
const items=()=>page.evaluate(()=>JSON.parse(JSON.stringify(__levelStudio.scene.items)));
const saveOpen=async()=>{const before=await items();const download=page.waitForEvent('download');await page.locator('#save').click();const file=await download,bytes=readFileSync(await file.path());await page.reload();await wait(()=>window.__levelStudio);await page.locator('#open').setInputFiles({name:'room.zip',mimeType:'application/zip',buffer:bytes});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));assert.deepEqual(await items(),before);return bytes;};
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await wait(()=>window.__levelStudio);await page.locator('#kidRoom').click();
 assert(await page.evaluate(()=>__levelStudio.scene.entries.some(w=>w.kind==='door')));
 const tv='onboard:tv-with-a-wall-mount';await choose(tv);await page.locator('#placementMode').selectOption('wall');
 // Both sides of both axes, including a split wall beside the standard doorway.
 for(const [x,z] of [[4,0],[0,4],[-4,0],[2,-4]])await clickPlan(x,z);
 let placed=await items();assert.equal(placed.length,4);
 for(const o of placed){assert(o.wallMount);assert(o.modelSize);assert(o.x>-4&&o.x<4&&o.z>-4&&o.z<4);assert.equal(o.wallFacing,'+z');const inward={x:-o.x,z:-o.z};assert(Math.sin(o.yaw)*inward.x+Math.cos(o.yaw)*inward.z>0,'TV screen faces room');}
 await page.keyboard.press('Escape');await page.locator('#dockWallSide').click();let flipped=(await items()).at(-1);assert.notEqual(flipped.wallMount.side,placed.at(-1).wallMount.side);await page.locator('#undo').click();assert.deepEqual((await items()).at(-1),placed.at(-1));await page.locator('#redo').click();assert.deepEqual((await items()).at(-1),flipped);await page.locator('#dockWallSide').click();
 await page.locator('#dockUp').click();const raised=(await items()).at(-1);assert(raised.wallMount.y>placed.at(-1).wallMount.y);
 await page.locator('#dockDuplicate').click();await clickPlan(-2,-4);await page.keyboard.press('Escape');assert.equal((await items()).length,5);assert.equal((await items()).at(-1).wallMount.y,raised.wallMount.y);
 // Explicit wall placement cannot become a floor object.
 await choose(tv);const count=(await items()).length;await clickPlan(0,0);assert.equal((await items()).length,count);assert.match(await page.locator('#status').innerText(),/vägg/);
 await page.keyboard.press('Escape');await page.locator('#threeView').click();await page.locator('#cutaway').uncheck();
 // Aim at the room-facing left wall, above an existing TV, to test actual face picking.
 await choose(tv);const surface=await page.evaluate(()=>__levelStudio.screen3DPoint(-3.945,2.1,2));await page.mouse.move(surface.x,surface.y);
 await wait(()=>__levelStudio.snapPreview.ghostLoaded&&__levelStudio.snapPreview.kind==='wall');
 const ghost=await page.evaluate(()=>__levelStudio.snapPreview);await snap('preview-3d');await page.mouse.click(surface.x,surface.y);
 const after=(await items()).at(-1);assert.deepEqual([after.x,after.elevation,after.z],ghost.ghostPose.position);assert.equal(after.yaw,ghost.ghostPose.yaw);assert(after.x>-4&&after.wallMount);
 await page.keyboard.press('Escape');await wait(()=>__levelStudio.visualFurniture.filter(o=>o.realModel).length===6);await page.locator('#editDockClose').click();await snap('placed-3d');
 // Actual rendered model back plane, not a nominal catalogue box.
 const visuals=await page.evaluate(()=>__levelStudio.visualFurniture);
 for(const o of (await items())){const v=visuals.find(v=>v.id===o.id);assert(v);const w=await page.evaluate(id=>__levelStudio.scene.entries.find(w=>w.id===id),o.wallMount.wallId);const gap=w.a[0]===w.b[0]?(w.a[0]>0?w.a[0]-w.thickness/2-v.max[0]:v.min[0]-w.a[0]-w.thickness/2):(w.a[1]>0?w.a[1]-w.thickness/2-v.max[2]:v.min[2]-w.a[1]-w.thickness/2);assert(Math.abs(gap-.012)<.00001,`Physical wall gap ${gap}`);}
 // Repeated drags keep the chosen wall and height; no drop to the floor.
 await page.evaluate(id=>__levelStudio.select(id),after.id);
 const dragStart=await page.evaluate(o=>__levelStudio.screen3DPoint(o.x,o.wallMount.y,o.z),after),dragEnd=await page.evaluate(o=>__levelStudio.screen3DPoint(o.x,o.wallMount.y+.15,o.z-.3),after);
 await page.mouse.move(dragStart.x,dragStart.y);await page.mouse.down();await page.mouse.move(dragEnd.x,dragEnd.y,{steps:4});await page.mouse.up();
 assert.equal((await items()).at(-1).wallMount.wallId,after.wallMount.wallId);
 await page.locator('#planView').click();await choose('studio:desk-120');await page.locator('#placementMode').selectOption('floor');await clickPlan(0,0);await choose('studio:orange-kitchen-chair');await clickPlan(0,1);await page.keyboard.press('Escape');await saveOpen();
 // Other real meshes and procedural wall art share the same placement pipeline.
 for(const id of ['kenney:furniture-kit:bathroommirror','studio:wall-picture']){await choose(id);await page.locator('#placementMode').selectOption('wall');await clickPlan(0,4);await page.keyboard.press('Escape');assert((await items()).at(-1).wallMount);}
 await page.setViewportSize({width:390,height:844});await snap('narrow');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.setViewportSize({width:1440,height:1000});
 console.log('WALL_SCENARIO_A_OK');
 // A user-imported, off-centre GLB facing +X, without filename-based calibration.
 const fixture=await page.evaluate(async()=>{const T=await import('../vendor/three/three.module.js'),{GLTFExporter}=await import('../vendor/three/addons/exporters/GLTFExporter.js');const root=new T.Group();root.position.set(7,2,-3);const body=new T.Mesh(new T.BoxGeometry(.12,.7,.9),new T.MeshStandardMaterial({color:'#555555'}));const face=new T.Mesh(new T.BoxGeometry(.015,.6,.8),new T.MeshStandardMaterial({color:'#ee5533'}));face.position.x=.065;const bulb=new T.Mesh(new T.SphereGeometry(.12,12,8),new T.MeshStandardMaterial({color:'#fff4ce',emissive:'#665522'}));bulb.position.x=.2;root.add(body,face,bulb);return [...new Uint8Array(await new GLTFExporter().parseAsync(root,{binary:true}))];});
 await page.locator('#glb').setInputFiles({name:'Importerad-vägglampa.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(fixture)});await wait(()=>document.querySelector('#status').textContent.includes('GLB-filer tillagda'));
 const localId=await page.locator('[data-asset^="local:"]').first().getAttribute('data-asset');await choose(localId);await page.locator('#placementMode').selectOption('wall');await clickPlan(4,-2);await page.keyboard.press('Escape');await page.locator('#dockFacing').click();await page.locator('#dockFacing').click();
 const imported=(await items()).at(-1);assert.equal(imported.wallFacing,'+x');assert(imported.modelSize[0]<imported.modelSize[2]);assert(Math.sin(imported.yaw+Math.PI/2)<-.99999);
 const data=await page.evaluate(async id=>{const {getLocalFile}=await import('./library/models.mjs?v=6.1.2');return [...new Uint8Array((await getLocalFile(id)).data)];},localId);assert.deepEqual(data,fixture);await saveOpen();assert.equal((await items()).at(-1).wallFacing,'+x');console.log('WALL_SCENARIO_C_OK');
 // Floor 5 baseline remains intact. Only a new authored furniture row is added.
 await page.goto(origin+'/furniture-editor/new.html?mode=edit-floor5&test=1');await wait(()=>window.__levelStudio);
 const baseline=await page.evaluate(()=>JSON.stringify({entries:__levelStudio.scene.entries,gameplay:__levelStudio.project.gameplay,ground:__levelStudio.project.ground}));
 const target=await page.evaluate(async()=>{const {findWallMount}=await import('./wall-mounts.mjs'),{LIBRARY_MAP}=await import('./library/catalog.mjs');const e=LIBRARY_MAP.get('onboard:tv-with-a-wall-mount'),o={assetId:e.id,w:e.width,d:e.depth,height:e.height};const s=__levelStudio.scene;for(const w of s.entries.filter(w=>w.kind==='wall'&&Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>4)){const q={x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2};const pose=findWallMount(o,q,[w],{floors:s.floors});if(pose&&s.floors.some(f=>pose.x>f.x0+.1&&pose.x<f.x1-.1&&pose.z>f.z0+.1&&pose.z<f.z1-.1))return {q,w};}throw Error('No valid Floor 5 test wall');});
 await choose(tv);await page.locator('#placementMode').selectOption('wall');await clickPlan(target.q.x,target.q.z);await page.keyboard.press('Escape');let floorTV=(await items()).find(o=>o.assetId===tv);assert(floorTV?.wallMount);await page.locator('#dockUp').click();
 await page.locator('.dock-details summary').click();const z=await page.locator('#dockZ').inputValue();if(target.w.a[0]===target.w.b[0]){await page.locator('#dockZ').fill(String(Number(z)+.2));await page.locator('#dockZ').dispatchEvent('change');}
 floorTV=(await items()).find(o=>o.assetId===tv);assert(floorTV.wallMount);assert.equal(await page.evaluate(()=>JSON.stringify({entries:__levelStudio.scene.entries,gameplay:__levelStudio.project.gameplay,ground:__levelStudio.project.ground})),baseline);
 await saveOpen();await page.locator('#walkView').click();await wait(()=>document.querySelector('#walkFrame')?.contentWindow?.__walk?.renderer?.projectFurniture?.children?.length>0);
 const walk=page.frame({url:/\/fps\/walk\.html/});assert(walk);const rendered=await walk.evaluate(({o,w})=>{const r=__walk.renderer,holder=r.projectFurniture.children.find(h=>h.userData.editId===o.id);if(!holder)return null;const nx=Math.sin(o.yaw),nz=Math.cos(o.yaw);r.camera.position.set(o.x+nx*2.8,o.wallMount.y,o.z+nz*2.8);r.camera.lookAt(o.x,o.wallMount.y,o.z);r.renderer.render(r.scene,r.camera);return {position:holder.position.toArray(),yaw:holder.rotation.y};},{o:floorTV,w:target.w});assert(rendered);assert.deepEqual(rendered.position,[floorTV.x,floorTV.elevation,floorTV.z]);assert.equal(rendered.yaw,floorTV.yaw);await snap('floor5-walk-front');
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',newRoom:true,fourWalls:true,realTV:true,wallGap:.012,previewEqualsPlaced:true,flipUndoRedo:true,duplicate:true,importedOffCentreGLB:true,zipReload:true,floor5BaselineUnchanged:true,fpsRenderer:true,narrowViewport:true,errors},null,2));console.log('WALL_SCENARIO_B_D_OK');
}finally{await context.close();await browser.close();}
