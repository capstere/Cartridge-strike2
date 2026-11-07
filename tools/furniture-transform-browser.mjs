/** Shared editor UI, imported asymmetric GLB and real TV; no original assets modified. */
import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/furniture-transforms';mkdirSync(out,{recursive:true});rmSync(`${out}/result.json`,{force:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:1000},acceptDownloads:true});
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(90000);
const wait=f=>page.waitForFunction(f,null,{timeout:90000}),items=()=>page.evaluate(()=>JSON.parse(JSON.stringify(__levelStudio.scene.items))),last=async()=>(await items()).at(-1);
const click=async(x,z)=>{const p=await page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);await page.mouse.click(p.x,p.y);};
const choose=async id=>{await page.locator('[data-tab="furnish"]').click();await page.locator('#catalogSearch').fill('');await page.locator('#catalogCategory').selectOption('all');await page.locator(`[data-asset="${id}"]`).click();await wait(()=>__levelStudio.pendingAsset?.ready);};
const near=(a,b)=>assert(Math.abs(a-b)<1e-5,`${a} != ${b}`);
const saveReload=async()=>{const before=await items(),download=page.waitForEvent('download');await page.locator('#save').click();const file=await download,bytes=readFileSync(await file.path());await page.reload();await wait(()=>window.__levelStudio);await page.locator('#open').setInputFiles({name:'project.zip',mimeType:'application/zip',buffer:bytes});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));const authored=list=>list.map(({source,original,...item})=>item);assert.deepEqual(authored(await items()),authored(before));};
try{
 for(const mode of ['new-level','edit-floor5']){
  await page.goto((process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765')+'/furniture-editor/new.html?test=1'+(mode==='edit-floor5'?'&mode=edit-floor5':''));await wait(()=>window.__levelStudio);
  if(mode==='new-level')await page.locator('#kidRoom').click();
  const baseline=await page.evaluate(()=>JSON.stringify({entries:__levelStudio.scene.entries,gameplay:__levelStudio.project.gameplay}));
  const fixture=await page.evaluate(async()=>{const T=await import('../vendor/three/three.module.js'),{GLTFExporter}=await import('../vendor/three/addons/exporters/GLTFExporter.js');const root=new T.Group();root.position.set(4,2,-3);const body=new T.Mesh(new T.BoxGeometry(1,.7,.5),new T.MeshStandardMaterial({color:'#446677'})),marker=new T.Mesh(new T.BoxGeometry(.18,.3,.2),new T.MeshStandardMaterial({color:'#ff5533'}));marker.name='asymmetric-detail';marker.position.set(.55,.25,.12);root.add(body,marker);return [...new Uint8Array(await new GLTFExporter().parseAsync(root,{binary:true}))];});
  await page.locator('[data-tab="furnish"]').click();await page.locator('#glb').setInputFiles({name:'Asymmetrisk-testmobel.glb',mimeType:'model/gltf-binary',buffer:Buffer.from(fixture)});await wait(()=>document.querySelector('#status').textContent.includes('GLB-filer tillagda'));
  const localId=await page.locator('[data-asset^="local:"]').first().getAttribute('data-asset');await choose(localId);await page.locator('#placementMode').selectOption('floor');await page.locator('#autoPlace').uncheck();await click(mode==='new-level'?0:1,mode==='new-level'?0:1);await page.keyboard.press('Escape');
  let item=await last();const original=structuredClone(item);
  await page.locator('#dockRotate').click();near((await last()).yaw,original.yaw-Math.PI/12);await page.locator('#dockRotateLeft').click();near((await last()).yaw,original.yaw);
  await page.locator('#threeView').click();await wait(()=>__levelStudio.visualFurniture.some(o=>o.realModel));
  const markerPosition=async id=>page.evaluate(id=>__levelStudio.visualFurniture.find(o=>o.id===id)?.meshes.find(m=>m.name==='asymmetric-detail'),id);
  const before=await markerPosition(item.id);assert(before);await page.screenshot({path:`${out}/${mode}-before.png`});
  await page.locator('#dockMirror').click();await wait(()=>__levelStudio.visualFurniture.some(o=>o.meshes.some(m=>m.determinant<0)));const reflected=await markerPosition(item.id);
  near(reflected.position[0]+before.position[0],2*item.x);near(reflected.position[1],before.position[1]);near(reflected.position[2],before.position[2]);assert.equal(await page.locator('#dockMirror').getAttribute('aria-pressed'),'true');
  await page.screenshot({path:`${out}/${mode}-mirrored.png`});await page.locator('#undo').click();assert(!(await last()).mirrored);await page.locator('#redo').click();assert((await last()).mirrored);
  // Shortcut reversibility and input isolation.
  await page.locator('#scene3d').focus();await page.keyboard.press('r');await page.keyboard.press('Shift+r');near((await last()).yaw,original.yaw);await page.keyboard.press('m');assert(!(await last()).mirrored);await page.keyboard.press('m');assert((await last()).mirrored);
  const unchanged=await last();await page.locator('.dock-details summary').click();await page.locator('#dockX').focus();await page.keyboard.press('r');await page.keyboard.press('m');assert.deepEqual(await last(),unchanged);await page.locator('.dock-details summary').click();
  await page.locator('#dockMirror').click();assert(!(await last()).mirrored);await page.locator('#dockMirror').click();
  await page.locator('#planView').click();await page.locator('#dockDuplicate').click();await click(2,2);await page.keyboard.press('Escape');assert((await last()).mirrored);
  await saveReload();const data=await page.evaluate(async id=>{const {getLocalFile}=await import('./library/models.mjs?v=6.1.2');return [...new Uint8Array((await getLocalFile(id)).data)];},localId);assert.deepEqual(data,fixture);
  // Real wall model, same UI and fixed anchor in both entry points.
  const target=await page.evaluate(()=>{const w=__levelStudio.scene.entries.find(w=>w.kind==='wall'&&Math.hypot(w.b[0]-w.a[0],w.b[1]-w.a[1])>5&&w.height>2.7);return {x:(w.a[0]+w.b[0])/2,z:(w.a[1]+w.b[1])/2};});
  await choose('onboard:tv-with-a-wall-mount');await page.locator('#placementMode').selectOption('wall');await click(target.x,target.z);await page.keyboard.press('Escape');item=await last();assert(item.wallMount);
  // Centre it slightly lower so a 15-degree roll fits the standard room height.
  await page.locator('#dockDown').click();item=await last();const anchor=structuredClone(item.wallMount);
  // An older project without measured bounds must measure its original GLB before turning.
  const legacy=await page.evaluate(()=>JSON.parse(JSON.stringify(__levelStudio.project)));delete legacy.furniture.added.find(o=>o.id===item.id).modelSize;
  await page.locator('#open').setInputFiles({name:'legacy.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await wait(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));await page.evaluate(id=>__levelStudio.select(id),item.id);
  await page.locator('#dockRotate').click();await wait(()=>__levelStudio.scene.items.at(-1).wallRoll!==undefined);assert((await last()).modelSize);near((await last()).wallRoll,-Math.PI/12);assert.deepEqual((await last()).wallMount,anchor);
  await page.locator('#dockMirror').click();assert((await last()).mirrored);assert.deepEqual((await last()).wallMount,anchor);
  await page.locator('#threeView').click();await wait(()=>__levelStudio.visualFurniture.some(o=>o.meshes.some(m=>m.determinant<0)));await page.screenshot({path:`${out}/${mode}-wall-turned.png`});
  await page.locator('#dockRotateLeft').click();near((await last()).wallRoll,0);await page.locator('#dockRotate').click();
  await page.locator('#dockWallSide').click();assert.equal((await last()).wallMount.side,-anchor.side);await page.locator('#dockWallSide').click();assert.deepEqual((await last()).wallMount,anchor);
  await saveReload();assert.deepEqual(await page.evaluate(()=>JSON.stringify({entries:__levelStudio.scene.entries,gameplay:__levelStudio.project.gameplay})),baseline);
  await page.setViewportSize({width:390,height:844});await page.evaluate(id=>__levelStudio.select(id),item.id);assert(await page.locator('#dockMirror').isVisible());assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:`${out}/${mode}-narrow.png`});await page.setViewportSize({width:1440,height:1000});
  await page.locator('#walkView').click();await wait(()=>document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.projectFurniture?.children.length>0);assert(await page.locator('#editDock').isHidden());const walk=page.frame({url:/\/fps\/walk\.html/});
  const finalItem=(await items()).find(o=>o.id===item.id);const rendered=await walk.evaluate(o=>{const r=__walk.renderer,holder=r.projectFurniture.children.find(h=>h.userData.editId===o.id);holder.updateWorldMatrix(true,true);let determinant=1;holder.traverse(m=>{if(m.isMesh)determinant=m.matrixWorld.determinant();});const nx=Math.sin(o.yaw),nz=Math.cos(o.yaw);r.camera.position.set(o.x+nx*3,o.wallMount.y,o.z+nz*3);r.camera.lookAt(o.x,o.wallMount.y,o.z);r.renderer.render(r.scene,r.camera);return {determinant,roll:holder.children.find(c=>c.userData.furnitureFrame)?.rotation.z};},finalItem);assert(rendered.determinant<0);near(rendered.roll,finalItem.wallRoll);await page.screenshot({path:`${out}/${mode}-fps-wall.png`});
  console.log('TRANSFORM_'+mode+'_PASS');
 }
 assert.deepEqual(errors,[]);writeFileSync(`${out}/result.json`,JSON.stringify({status:'PASS',bothModes:true,realGLBReflection:true,rotateBothDirections:true,wallAnchor:true,undoRedo:true,duplicate:true,zipReload:true,originalGLBBytes:true,fpsRenderer:true,narrowViewport:true,errors},null,2));
}finally{await context.close();await browser.close();}
