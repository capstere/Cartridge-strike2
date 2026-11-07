/** Actual browser controls + shared WebGL meshes + native ZIP round-trip.
 * All fixtures are synthetic or already-public defaults. No private plans/photos.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const out='test-results/studio-seams';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1440,height:970},acceptDownloads:true});
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',page=await context.newPage(),errors=[];
page.setDefaultTimeout(90000);page.on('pageerror',e=>errors.push(e.message));
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 const seed=await page.evaluate(async()=>{
  const {exportProject}=await import('./build/level-project.mjs?v=5.7.0');const {makeEntry}=await import('./build/architecture.mjs?v=5.7.0');
  const p=exportProject({projectId:'lvl-seam-test',name:'Synthetic window joins'});
  p.architecture.added=[makeEntry('BYGG-V-0001','wall',[-5,0],[5,0]),makeEntry('BYGG-V-0002','window',[-1,0],[1,0])];
  p.ground.floors=[{id:'BYGG-G-0001',name:'Floor',role:'room',surface:'carpet',x0:-5,z0:-5,x1:5,z1:5}];return p;
 });
 await page.locator('#open').setInputFiles({name:'synthetic.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});
 await page.waitForFunction(()=>__levelStudio.project.projectId==='lvl-seam-test');
 const get=()=>page.evaluate(()=>structuredClone(__levelStudio.project));
 await page.evaluate(()=>__levelStudio.select('BYGG-G-0001'));
 assert(await page.locator('#selectedSurface').isVisible(),'Floor material is visible without expanding advanced properties');
 await page.getByRole('button',{name:'Svart',exact:true}).click();
 await page.locator('#selectedSurface').selectOption('dark-tile');
 assert.equal((await get()).surfaceColors?.['BYGG-G-0001'],undefined);
 await page.locator('#threeView').click();
 assert.equal(await page.evaluate(()=>__levelStudio.architectureVisuals.find(x=>x.part==='floor').map),'floor5-dark-tile');
 await page.locator('#planView').click();await page.evaluate(()=>__levelStudio.select('BYGG-V-0002'));
 await page.locator('[data-curtain-preset="sheer"]').click();
 const mid=await page.evaluate(()=>__levelStudio.screenWorldPoint(0,0));await page.mouse.click(mid.x,mid.y);
 let curtain=(await get()).architecture.treatments.at(-1);assert.equal(curtain.style,'sheer');
 await page.locator('#threeView').click();
 let fabrics=await page.evaluate(id=>__levelStudio.decorationVisuals.filter(x=>x.id===id&&x.curtainStyle),curtain.id);
 assert.equal(fabrics.length,1);assert.equal(fabrics[0].opacity,.32);assert.equal(fabrics[0].depthWrite,false);
 await page.locator('#curtainStyle').selectOption('botanical-sheer');
 fabrics=await page.evaluate(id=>__levelStudio.decorationVisuals.filter(x=>x.id===id&&x.curtainStyle),curtain.id);
 assert.equal(fabrics[0].map,'floor5-botanical-voile');
 await page.locator('#undo').click();assert.equal((await get()).architecture.treatments.at(-1).style,'sheer');
 await page.locator('#redo').click();assert.equal((await get()).architecture.treatments.at(-1).style,'botanical-sheer');
 await page.locator('#curtainFlip').click();assert.equal((await get()).architecture.treatments.at(-1).side,-curtain.side);
 // Restore the camera-facing room side, not a curtain viewed through the far wall.
 await page.locator('#curtainFlip').click();assert.equal((await get()).architecture.treatments.at(-1).side,curtain.side);
 await page.screenshot({path:out+'/studio-pattern.png'});
 // Pixel-level texture alpha, independent of canvas/WebGL material settings.
 const alpha=await page.evaluate(async()=>{const {drawBotanicalCurtain}=await import('./build/curtain-mesh.mjs?v=5.7.0');
  const c=document.createElement('canvas');c.width=512;c.height=768;const g=c.getContext('2d');drawBotanicalCurtain(g);
  const pixels=g.getImageData(0,0,512,768).data;let min=255,max=0;for(let i=3;i<pixels.length;i+=4){min=Math.min(min,pixels[i]);max=Math.max(max,pixels[i]);}return {min,max};});
 assert(alpha.min<100&&alpha.max>150&&alpha.max<255,'Voile has a transparent base and a denser, nonopaque printed motif');
 const download=page.waitForEvent('download');await page.locator('#save').click();const zip=readFileSync(await (await download).path());
 const saved=await get();await page.locator('#open').setInputFiles({name:'test.zip',mimeType:'application/zip',buffer:zip});
 await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));
 assert.deepEqual(await get(),saved);
 // Real FPS renderer, not only the editor's geometry proxy.
 await page.locator('#walkView').click();await page.waitForFunction(()=>!!document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.scene);
 const frame=page.frames().find(f=>f.url().includes('/fps/walk.html'));assert(frame);
 const fps=await frame.evaluate(()=>{const r=__walk.renderer;const fabrics=[];r.projectFurniture.traverse(n=>{if(n.material?.userData?.curtainStyle)fabrics.push({style:n.material.userData.curtainStyle,map:n.material.map?.name,transparent:n.material.transparent,depthWrite:n.material.depthWrite});});return {fabrics,patterns:[...r.floor5PatternMaterials.keys()]};});
 assert.equal(fps.fabrics.length,1);assert.equal(fps.fabrics[0].map,'floor5-botanical-voile');assert.equal(fps.fabrics[0].depthWrite,false);assert(fps.patterns.includes('dark-tile'));
 await frame.evaluate(()=>{const r=__walk.renderer;r.camera.position.set(0,1.5,4.7);r.camera.lookAt(0,1.45,0);r.camera.updateMatrixWorld();r.renderer.render(r.scene,r.camera);});
 await frame.locator('#game').screenshot({path:out+'/fps-pattern.png'});
 // Inspect the same wall with the curtain hidden, then restore it. No geometry is changed.
 await frame.evaluate(()=>{const r=__walk.renderer;r.projectFurniture.visible=false;r.renderer.render(r.scene,r.camera);});
 await frame.locator('#game').screenshot({path:out+'/fps-window-joins.png'});
 await page.evaluate(()=>__levelStudio.leaveWalk());
 // Mobile visible material control.
 await page.evaluate(()=>__levelStudio.select('BYGG-G-0001'));await page.setViewportSize({width:390,height:844});
 assert(await page.locator('#selectedSurface').isVisible());await page.locator('#selectedSurface').selectOption('dark-large-stone');
 assert.equal((await get()).floorFinishes['BYGG-G-0001'],'dark-large-stone');await page.screenshot({path:out+'/mobile-material.png'});
 await page.setViewportSize({width:1440,height:970});
 // Reopened areas used to accept the UI change but reject saving its material.
 await page.goto(origin+'/furniture-editor/new.html?test=1&mode=edit-floor5');await page.waitForFunction(()=>!!window.__levelStudio);
 const reopened=await get();reopened.ground.openedAreas=[...(reopened.ground.openedAreas||[]),'X28'];
 await page.locator('#open').setInputFiles({name:'opened.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(reopened))});
 await page.waitForFunction(()=>__levelStudio.project.ground.openedAreas?.includes('X28'));
 await page.evaluate(()=>__levelStudio.select('X28'));assert(await page.locator('#selectedSurface').isVisible());
 for(const surface of ['dark-tile','dark-gloss-laminate','dark-large-stone']){await page.locator('#selectedSurface').selectOption(surface);assert.equal((await get()).floorFinishes.X28,surface);}
 const roundtrip=await page.evaluate(async()=>{const {parseProject,exportProjectZip,parseProjectZip}=await import('./build/level-project.mjs?v=5.7.0');const p=parseProject(__levelStudio.project);return (await parseProjectZip(await exportProjectZip(p))).project.floorFinishes.X28;});
 assert.equal(roundtrip,'dark-large-stone');assert.deepEqual(errors,[]);
 writeFileSync(out+'/result.json',JSON.stringify({status:'PASS',nativeZIP:true,editorMeshes:true,fpsMeshes:true,alpha,reopenedFloor:roundtrip,errors},null,2));
 console.log('Window/curtain/material browser regression PASS');
}catch(error){
 await page.screenshot({path:out+'/failure.png'}).catch(()=>{});
 const state=await page.evaluate(()=>({selected:window.__levelStudio?.selected,view:window.__levelStudio?.viewState,status:document.querySelector('#status')?.textContent,decorations:window.__levelStudio?.decorationVisuals,treatments:window.__levelStudio?.project?.architecture?.treatments})).catch(()=>null);
 writeFileSync(out+'/failure.json',JSON.stringify({message:error.message,stack:error.stack,state,errors},null,2));throw error;
}finally{await browser.close();}
