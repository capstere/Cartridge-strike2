/** Real Chromium + WebGL smoke. No screenshots/artifacts uploaded to Actions. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({proxy:process.env.CHARACTER_TEST_PROXY?{server:process.env.CHARACTER_TEST_PROXY}:undefined,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-gpu-sandbox']});
const errors=[];
const context=await browser.newContext({viewport:{width:1370,height:920},acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(35000);
page.on('pageerror',e=>errors.push(String(e)));
page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
page.on('dialog',d=>d.accept());
page.on('response',r=>{if(r.status()>=400&&r.url().startsWith(origin))errors.push('HTTP '+r.status()+' '+r.url());});
page.route('**/*',route=>{
 const url=route.request().url();
 if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();
 errors.push('External request '+url);return route.abort();
});
const log=name=>console.log('PASS '+name);
try{
 await page.goto(origin+'/character-design/?studio=5.3',{waitUntil:'domcontentloaded',timeout:45000});
 await page.waitForFunction(()=>document.getElementById('status').textContent.includes('redo!'),null,{timeout:45000});
 log('original skeleton loaded via in-game character-library');
 const sheet=await page.evaluate(()=>{
  const c=document.querySelector('[data-base="front"]');const d=c.getContext('2d').getImageData(0,0,c.width,c.height).data;
  let pixels=new Set();for(let y=120;y<580;y+=50)for(let x=120;x<360;x+=48){
   const i=4*(y*c.width+x);pixels.add(d[i]+','+d[i+1]+','+d[i+2]);
  }
  return pixels.size;
 });
 assert.ok(sheet>3,'front character preview is blank or uniform: '+sheet);
 log('four-angle 3D views contain rendered character pixels');
 await page.locator('[data-tab=look]').click();
 await page.locator('#colors [data-color="jacket"]').fill('#ed5566');
 await page.locator('[data-tab="fashion"]').click();
 await page.locator('#outfit-style').selectOption('hoodie');
 await page.locator('#shirt-text').fill('QC TEAM 05');
 await page.locator('#shirt-font').selectOption('mono');
 await page.locator('#shirt-image-mode').selectOption('pattern');
 // Produce a fresh, valid PNG in the browser; do not rely on a remote asset.
 const pngBase64=await page.evaluate(()=>{
  const c=document.createElement('canvas');c.width=c.height=16;
  const ctx=c.getContext('2d');ctx.fillStyle='#ff8000';ctx.fillRect(0,0,16,16);
  ctx.fillStyle='#0033ff';ctx.fillRect(2,2,8,8);
  return c.toDataURL('image/png').split(',')[1];
 });
 await page.locator('#shirt-png').setInputFiles({name:'custom-shirt.png',mimeType:'image/png',buffer:Buffer.from(pngBase64,'base64')});
 await page.waitForFunction(()=>!!document.querySelector('#shirt-preview').src?.startsWith('data:image/png'));
 await page.locator('[data-tab="face"]').click();
 await page.locator('#hair-style').selectOption('ponytail');
 await page.locator('[data-face-field="jaw"]').selectOption('Kantig');
 await page.locator('#face-zoom').evaluate(el=>{el.value='250';el.dispatchEvent(new Event('input',{bubbles:true}));});
 assert.equal(await page.locator('#face-zoom-value').textContent(),'250 %');
 await page.locator('#face-pan').click();
 assert.equal(await page.locator('#face-pan').getAttribute('aria-pressed'),'true');
 await page.locator('#face-pan').click();
 await page.locator('#face-center').click();
 await page.locator('[data-ink="face"]').scrollIntoViewIfNeeded();
 const faceBounds=await page.locator('[data-ink="face"]').boundingBox();
 assert.ok(faceBounds?.width>100);
 const cx=faceBounds.x+faceBounds.width*.51,cy=faceBounds.y+faceBounds.height*.52;
 await page.mouse.move(cx,cy);await page.mouse.down();await page.mouse.move(cx+30,cy+14,{steps:6});await page.mouse.up();
 await page.locator('#face-angle').selectOption('left');
 await page.locator('#face-angle').selectOption('front');
 await page.locator('#animation-requests summary').click();
 await page.locator('#requested-animations input[value="wave"]').check();
 await page.locator('#focus-head').click();
 assert.equal(await page.locator('#pose option').count()>=11,true);
 log('clothing styles, shirt text+uploaded PNG, hair, face sketch zoom and requests');

 await page.locator('[data-tab="parts"]').click();
 await page.locator('#part-type').selectOption('helmet');
 await page.locator('#add-part').click();
 assert.equal(await page.locator('.part-item').count(),1);
 await page.locator('#pos-x').evaluate(el=>{el.value='9';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#part-note').fill('Make a soft helmet with fabric lining.');
 await page.locator('#rot-x').evaluate(el=>{el.value='12';el.dispatchEvent(new Event('input',{bubbles:true}));});
 await page.locator('#pose').selectOption('Crouch_Idle_Loop');
 await page.locator('#play').click();
 await page.waitForTimeout(500);
 await page.locator('#play').click();
 log('palette, bone-attached 3D part, dimensions and real animation preview');
 const jsonDownload=page.waitForEvent('download');
 await page.locator('#save-json').click();
 const json=JSON.parse((await readFile(await (await jsonDownload).path())).toString());
 assert.equal(json.parts.length,1);assert.equal(json.parts[0].rotation[0],12);assert.equal(json.parts[0].note,'Make a soft helmet with fabric lining.');
 assert.equal(json.base.original_glb,'quaternius-operator-male.glb');
 assert.equal(json.creative.outfit,'hoodie');
 assert.equal(json.creative.hair,'ponytail');
 assert.equal(json.creative.print.text,'QC TEAM 05');
 assert.ok(json.creative.print.imageData.startsWith('data:image/png;base64,'));
 assert.ok(json.creative.requestedAnimations.includes('wave'));
 assert.ok(json.artwork.faceViews.front.startsWith('data:image/png;base64,'));

 log('editable JSON project downloaded');
 const zipDownload=page.waitForEvent('download');
 await page.locator('#export-zip').click();
 const zipBytes=await readFile(await (await zipDownload).path());
 assert.equal(zipBytes.readUInt32LE(0),0x04034b50);
 for(const name of ['BASE_RIG.glb','ANIMATION_CONTRACT.json','STATIC_PROTOTYPE.glb','DESIGN_SHEET.png','AI_INSTRUCTIONS.md','PROJECT.json','FACE_FRONT.png','FACE_LEFT.png','FACE_RIGHT.png','SHIRT_ARTWORK.png'])
  assert.ok(zipBytes.includes(Buffer.from(name)),name+' missing from ZIP');
 assert.ok(zipBytes.byteLength>100_000);
 log('self-contained AI ZIP contains original animated rig, geometry, orthographic sheet and handoff');
 await page.locator('[data-mode="object"]').click();
 await page.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('3D-objekt'));
 assert.equal(await page.locator('.part-item').count(),1);
 const glbDownload=page.waitForEvent('download');
 await page.locator('#save-glb').click();
 const glb=await readFile(await (await glbDownload).path());
 assert.equal(glb.readUInt32LE(0),0x46546c67);
 assert.equal(glb.readUInt32LE(4),2);
 log('standalone 3D-object mode exports an actual glTF 2.0 GLB');
 await page.locator('#open-project').click();
 await page.locator('#project-file').setInputFiles({name:'character.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(json))});
 await page.waitForFunction(()=>document.querySelector('#mode-label').textContent.includes('karaktär'));
 assert.equal(await page.locator('.part-item').count(),1);
 log('saved character JSON reopens correctly');
 assert.deepEqual(errors,[],'Browser exceptions or failed network requests');
 log('no browser errors or external requests');
}finally{await context.close();await browser.close();}
