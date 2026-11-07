/** Full workflow against real GLBs, real WebGL, exported bytes and touch viewport.
 * Run after starting a local HTTP server; CHARACTER_TEST_ORIGIN can verify Pages.
 */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {crc32} from './zip-export.mjs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({proxy:process.env.CHARACTER_TEST_PROXY?{server:process.env.CHARACTER_TEST_PROXY}:undefined,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-gpu-sandbox']});
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function unzip(bytes){const files=new Map();let off=0;while(bytes.readUInt32LE(off)===0x04034b50){assert.equal(bytes.readUInt16LE(off+8),0);const length=bytes.readUInt32LE(off+18),nameLen=bytes.readUInt16LE(off+26),extra=bytes.readUInt16LE(off+28),start=off+30+nameLen+extra,name=bytes.toString('utf8',off+30,off+30+nameLen),data=bytes.subarray(start,start+length);assert.equal(crc32(data),bytes.readUInt32LE(off+14),name+' CRC');files.set(name,data);off=start+length;}return files;}
const gltf=bytes=>{assert.equal(bytes.readUInt32LE(0),0x46546c67);assert.equal(bytes.readUInt32LE(8),bytes.length);return JSON.parse(bytes.toString('utf8',20,20+bytes.readUInt32LE(12)));};
try{
 for(const mobile of (process.env.CHARACTER_TEST_DEVICE==='mobile'?[true]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  page.on('dialog',d=>d.accept());
  const text=id=>page.locator('#'+id),tab=name=>page.locator('[data-tab="'+name+'"]');
  const pixels=()=>page.locator('[data-base="front"]').evaluate(c=>c.toDataURL());
  const settle=()=>page.waitForTimeout(140);
  const download=async id=>{const event=page.waitForEvent('download');await text(id).click();return readFile(await(await event).path());};
  const slider=async(id,value)=>{await text(id).fill(String(value));await text(id).dispatchEvent('input');await settle();};
  await page.goto(origin+'/character-design/?studio=5.3',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
  assert.equal(await page.title(),'Character Design Studio 6 · Cartridge Strike');
  if(mobile)await text('viewer-tools').locator(':scope > summary').click();
  if(mobile){await text('gender').selectOption('female');await settle();}
  const initial=await pixels();await tab('face').click();
  for(const [key,value]of [['jaw','Bred'],['eyes','Stora'],['nose','Bred'],['mouth','Brett leende'],['eyebrows','Tjocka'],['facialHair','Helskägg'],['freckles','Tydliga']]){
   const before=await pixels();await page.locator('[data-face-field="'+key+'"]').selectOption(value);await settle();assert.notEqual(await pixels(),before,key+' must visibly change actual WebGL rendering');
  }
  await text('hair-style').selectOption('ponytail');await settle();
  await tab('fashion').click();
  for(const outfit of ['tshirt','hoodie','jacket','polo','labcoat','vest','original']){await text('outfit-style').selectOption(outfit);await settle();assert.notEqual(await pixels(),initial);}
  await text('outfit-style').selectOption('hoodie');await text('shirt-text').fill('JESPER 4');await settle();
  const image=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=128;c.height=64;const g=c.getContext('2d');g.fillStyle='#f06d3b';g.fillRect(0,0,64,64);g.fillStyle='#8844dd';g.fillRect(64,0,64,64);return c.toDataURL().split(',')[1];});
  const originalPNG=Buffer.from(image,'base64');await text('shirt-png').setInputFiles({name:'logo.png',mimeType:'image/png',buffer:originalPNG});await settle();
  await slider('print-rotation',22);await slider('print-scale',85);await slider('garment-fit',112);
  await text('shoe-style').selectOption('sneakers');await text('glove-style').selectOption('skin');await text('vest-layer').check();await settle();
  let saved=JSON.parse((await download('save-json')).toString());assert.equal(saved.creative.fit,112);assert.equal(saved.creative.printTransform.rotation,22);assert.equal(saved.creative.print.imageData.split(',')[1],image,'original PNG preserved byte-for-byte');
  await text('undo-design').click();await settle();assert.equal(await text('vest-layer').isChecked(),false);
  await text('redo-design').click();await settle();assert.equal(await text('vest-layer').isChecked(),true);
  await text('vest-layer').uncheck();
  // Test an actual custom GLB exported by the same studio, then reimport as accessory.
  await tab('parts').click();await text('part-type').selectOption('sphere');await text('add-part').click();
  const prop=await download('save-glb');gltf(prop);
  await text('accessory-file').setInputFiles({name:'custom-prop.glb',mimeType:'model/gltf-binary',buffer:prop});
  await page.waitForFunction(()=>document.querySelectorAll('.part-item').length===2);
  await text('part-anchor').selectOption('Head');await text('part-name').fill('My imported accessory');
  await text('clone-part').click();await text('mirror-part').click();assert.equal(await page.locator('.part-item').count(),4);
  // Hide imported pieces, to keep the face readable in the design sheet.
  await text('toggle-part').click();await text('toggle-part').click();
  await text('pose').selectOption('Walk_Loop');await text('play').click();const beforeMotion=await page.locator('#preview3d').evaluate(c=>c.toDataURL());await page.waitForTimeout(250);assert.notEqual(await page.locator('#preview3d').evaluate(c=>c.toDataURL()),beforeMotion,'animation must render changing pixels');await text('play').click();
  // A full-body design sheet remains full-body after focusing on the face.
  const full=await pixels();await text('focus-head').click();await tab('face').click();await page.locator('[data-face-field="jaw"]').selectOption('Kantig');await settle();
  const sheetSize=await page.locator('[data-base="front"]').evaluate(c=>[c.width,c.height]);assert.deepEqual(sheetSize,[480,680]);assert.ok(full.length>10000);
  await text('focus-body').click();await page.locator('#preview3d').scrollIntoViewIfNeeded();
  const bounds=await text('preview3d').boundingBox(),gestureBefore=await text('preview3d').evaluate(c=>c.toDataURL());
  if(mobile){
   const cdp=await context.newCDPSession(page),x=bounds.x+bounds.width/2,y=bounds.y+bounds.height/2;
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x-30,y,id:1},{x:x+30,y,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x-60,y:y+15,id:1},{x:x+60,y:y+15,id:2}]});
   await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
  }else{await page.mouse.move(bounds.x+bounds.width/2,bounds.y+bounds.height/2);await page.mouse.down();await page.mouse.move(bounds.x+bounds.width/2+55,bounds.y+bounds.height/2+15,{steps:5});await page.mouse.up();}
  assert.notEqual(await text('preview3d').evaluate(c=>c.toDataURL()),gestureBefore,'real pointer/touch gestures must change rendered view');
  await text('focus-body').click();
  await text('save-slot').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Alla ändringar'));
  saved=JSON.parse((await download('save-json')).toString());assert.equal(saved.parts.length,4);assert.equal(saved.embeddedReferences['custom-prop.glb'],prop.toString('base64'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
  if(mobile)await text('viewer-tools').locator(':scope > summary').click();
  assert.equal(await page.locator('.part-item').count(),4,'autosave restores imported GLBs');
  await page.locator('[data-mode="create"]').click();
  await text('saved-projects').selectOption({label:(await text('saved-projects').locator('option').allTextContents()).find(s=>s.startsWith(saved.name))});
  await page.waitForFunction(()=>document.querySelectorAll('.part-item').length===4);await settle();
  const roundtrip=JSON.parse((await download('save-json')).toString());assert.deepEqual(roundtrip.embeddedReferences,saved.embeddedReferences);assert.deepEqual(roundtrip.creative,saved.creative);
  const zip=unzip(await download('export-zip')),manifest=JSON.parse(zip.get('MANIFEST.json'));
  for(const entry of manifest.files){assert.equal(zip.get(entry.name)?.length,entry.bytes,entry.name+' size');assert.equal(hash(zip.get(entry.name)),entry.sha256,entry.name+' SHA-256');}
  assert.equal(hash(zip.get('SHIRT_ARTWORK.png')),hash(originalPNG));assert.equal(hash(zip.get('REFERENCE_01.glb')),hash(prop));
  const preview=gltf(zip.get('PREVIEW.glb')),rig=gltf(zip.get('BASE_RIG.glb'));
  assert.ok(preview.skins.length>=5);assert.equal(preview.animations.length,rig.animations.length);assert.ok(preview.images.length>0,'embedded textures');assert.ok(preview.nodes.some(n=>n.name==='My imported accessory'));
  const loaded=await page.evaluate(async data=>{const {GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0));const asset=await new GLTFLoader().parseAsync(bytes.buffer,'');let skins=0;asset.scene.traverse(o=>{if(o.isSkinnedMesh)skins++;});return {skins,clips:asset.animations.length};},zip.get('PREVIEW.glb').toString('base64'));
  assert.ok(loaded.skins>=5);assert.equal(loaded.clips,rig.animations.length);
  // Exercise every embedded animation on the actual rig, including death and jumps.
  for(const clip of await text('pose').locator('option').evaluateAll(options=>options.map(o=>o.value))){await text('pose').selectOption(clip);await text('play').click();await page.waitForTimeout(60);await text('play').click();}
  await text('pose').selectOption('Idle_Loop');
  const aspect=await text('preview3d').evaluate(c=>[c.clientWidth/c.clientHeight,c.width/c.height]);assert.ok(Math.abs(aspect[0]-aspect[1])<.01,'viewport preserves exact character proportions');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'no horizontal mobile overflow');
  await mkdir('test-results',{recursive:true});await text('focus-body').click();if(mobile)await text('viewer-tools').locator(':scope > summary').click();await page.locator('.preview-frame').scrollIntoViewIfNeeded();await page.screenshot({path:'test-results/studio4-'+(mobile?'mobile':'desktop')+'.png'});
  assert.deepEqual(errors,[]);
  console.log('PASS Studio 4 '+(mobile?'mobile/touch':'desktop')+': visible facial changes, outfits, exact PNG, undo/redo, GLB imports, animations, IndexedDB reopen, ZIP hashes and parsed skinned preview ('+rig.animations.length+' clips)');
  await context.close();
 }
}finally{await browser.close();}
