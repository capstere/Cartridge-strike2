/** Studio foundation: full UI roundtrip plus independent animated GLB inspection. */
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const hash=b=>createHash('sha256').update(b).digest('hex');
function unzip(b){const files=new Map();let o=0;while(b.readUInt32LE(o)===0x04034b50){const n=b.readUInt16LE(o+26),extra=b.readUInt16LE(o+28),len=b.readUInt32LE(o+18),start=o+30+n+extra;files.set(b.toString('utf8',o+30,o+30+n),b.subarray(start,start+len));o=start+len;}return files;}
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
try{for(const mobile of [false,true]){
 const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1000},isMobile:mobile,hasTouch:mobile,acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(60000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
 const $=id=>page.locator('#'+id),tab=name=>page.locator('[data-tab='+name+']').click(),download=async id=>{const event=page.waitForEvent('download');await $(id).click();return readFile(await(await event).path());},save=async()=>JSON.parse((await download('save-json')).toString());
 await page.goto(origin+'/character-design/?studio=5.3');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));await page.locator('[data-mode=create]').click();
 if(mobile)await $('gender').selectOption('female');
 const first=await save();assert.equal(first.creative.hair,'swept');assert.equal(first.creative.outfit,'fieldjacket');
 if(mobile)await $('viewer-tools').locator(':scope > summary').click();await $('pose').selectOption('Crouch_Idle_Loop');
 await $('sculpt-focus').click();assert.equal(await $('pose').inputValue(),'Idle_Loop');await $('preview3d').scrollIntoViewIfNeeded();const box=await $('preview3d').boundingBox(),x=box.x+box.width*.60,y=box.y+box.height*.53;
 if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});for(let i=1;i<=6;i++)await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+12*i/6,y:y-5*i/6,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}else{await page.mouse.move(x,y);await page.mouse.down();await page.mouse.move(x+12,y-5,{steps:6});await page.mouse.up();}
 const formed=await save(),gender=mobile?'female':'male';assert.ok(formed.creative.sculpt.models[gender]?.['face-skin'].deltas.length>0,'real face drag');await $('undo-design').click();assert.deepEqual((await save()).creative.sculpt,first.creative.sculpt);await $('redo-design').click();assert.deepEqual((await save()).creative.sculpt,formed.creative.sculpt);
 await tab('face');await $('hair-style').selectOption('buzz');await $('hair-style').selectOption('swept');await tab('fashion');await $('outfit-style').selectOption('jacket');await $('outfit-style').selectOption('fieldjacket');await $('garment-fit').fill('108');await $('garment-fit').dispatchEvent('input');await $('garment-fit').dispatchEvent('change');
 const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAIAAAABACAYAAADS1n9/AAAAzklEQVR4nO3SQQ0AIBAEsbN21hCGIUSACZIloY9RMK01ev9cj/l1lR6QLj0gHQAPTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA0gPSAfDABAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAgDsdRbrUz7UTRH0AAAAASUVORK5CYII=','base64');await $('shirt-png').setInputFiles({name:'original.png',mimeType:'image/png',buffer:png});await $('shirt-text').fill('STUDIO 5.3');
 await tab('look');for(const [id,val] of [['shoulders','84'],['chest','90'],['arms','80'],['waist','94']]){await $(id).fill(val);await $(id).dispatchEvent('input');}await tab('fashion');
 await $('pose').selectOption('Pistol_Reload');await $('play').click();await page.waitForTimeout(200);await $('play').click();await $('save-slot').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Alla ändringar'));const saved=await save();assert.equal(saved.body.shoulders,84);assert.equal(saved.body.chest,90);assert.equal(saved.body.arms,80);assert.equal(saved.body.waist,94);
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));assert.deepEqual((await save()).creative,saved.creative);
 // Portable JSON import, not just IndexedDB.
 await $('project-file').setInputFiles({name:'roundtrip.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await page.waitForTimeout(250);assert.deepEqual((await save()).creative,saved.creative);
 const files=unzip(await download('export-zip')),manifest=JSON.parse(files.get('MANIFEST.json'));
 assert.equal(hash(files.get('SPEL_SOURCE.glb')),hash(files.get('PREVIEW.glb')));
 const bridge=JSON.parse(files.get('SPEL_BRIDGE.json'));
 assert.equal(bridge.appearance.regional_shape_percent.shoulders,84);
 assert.equal(bridge.verification.spel_paint_roundtrip_verified,false);
 assert.match(files.get('BLENDER_SPEL_GUIDE.md').toString(),/Kontrollera utseendet/);
 for(const f of manifest.files){assert.equal(hash(files.get(f.name)),f.sha256);assert.equal(files.get(f.name).length,f.bytes);}assert.equal(hash(files.get('SHIRT_ARTWORK.png')),hash(png));if(mobile)assert.ok(files.has('HAIR_SOURCE_MALE.glb'));assert.deepEqual(JSON.parse(files.get('PROJECT.json')).creative,saved.creative);
 const parsed=await page.evaluate(async data=>{
  const {GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js'),T=await import('../vendor/three/three.module.js'),{DesignWorkbench}=await import('./workbench.mjs?v=6.1.2'),{newProject}=await import('./project-schema.mjs?v=6.1.2'),{applyStudioFoundation}=await import('./creative-schema.mjs?v=6.1.2');
  const bytes=Uint8Array.from(atob(data.glb),c=>c.charCodeAt(0)),g=await new GLTFLoader().parseAsync(bytes.buffer,'');
  const collar=g.scene.getObjectByName('studio-jacket-collar'),zipper=g.scene.getObjectByName('studio-jacket-zipper'),hair=g.scene.getObjectByName('studio-swept-scalp');if(!collar?.isSkinnedMesh||!zipper?.isSkinnedMesh||!hair)throw Error('Missing exported studio geometry');
  let finite=true,weights=true;const mixer=new T.AnimationMixer(g.scene);for(const clip of g.animations){mixer.stopAllAction();mixer.clipAction(clip).play();for(const fraction of [.15,.45,.8]){mixer.setTime(clip.duration*fraction);g.scene.updateMatrixWorld(true);for(const mesh of [collar,zipper]){mesh.skeleton.update();for(let i=0;i<mesh.geometry.attributes.position.count;i++){const p=mesh.getVertexPosition(i,new T.Vector3());finite&&=p.toArray().every(Number.isFinite);weights&&=Math.abs([0,1,2,3].reduce((s,k)=>s+mesh.geometry.attributes.skinWeight.getComponent(i,k),0)-1)<1e-5;}}}}
  // A fresh independent scene exercises the cached second appearance pass.
  const canvas=document.createElement('canvas');document.body.replaceChildren(canvas);const w=new DesignWorkbench(canvas,new Map());await w.initialize();const p=applyStudioFoundation(newProject({gender:data.gender}));w.update(p,{recreate:true,rebuild:true});w.updateAppearance();const vest=w.avatar.meshes.find(m=>m.material.name==='vest-shell'),brows=w.avatar.meshes.filter(m=>/eyebrow/i.test(m.name));const jacketColor=vest.material.color.getHexString(),visibleBrows=brows.every(m=>m.visible);p.creative.shoes='sneakers';w.update(p,{rebuild:true});w.updateAppearance();const hiddenShafts=w.avatar.meshes.filter(m=>m.name.startsWith('boot-shaft')).every(m=>!m.visible);
  // Render the actual exported result, including all embedded original clips.
  w.avatar.holder.visible=false;w.scene.add(g.scene);mixer.stopAllAction();mixer.clipAction(g.animations.find(c=>c.name==='Pistol_Reload')).play();mixer.setTime(.65);g.scene.updateMatrixWorld(true);g.scene.traverse(m=>{if(m.isSkinnedMesh)m.skeleton.update();});w.focus='head';w.yaw=.4;w.pitch=0;w.renderPreview();const head=canvas.toDataURL();w.focus='body';w.renderPreview();const body=canvas.toDataURL();w.dispose();return {clips:g.animations.length,finite,weights,jacketColor,visibleBrows,hiddenShafts,head,body};
 },{glb:files.get('PREVIEW.glb').toString('base64'),gender});
 assert.equal(parsed.clips,13);assert.ok(parsed.finite&&parsed.weights&&parsed.visibleBrows&&parsed.hiddenShafts);assert.equal(parsed.jacketColor,'465e68');assert.deepEqual(errors,[]);
 await mkdir('test-results',{recursive:true});for(const key of ['head','body'])await import('node:fs/promises').then(fs=>fs.writeFile('test-results/foundation-export-'+gender+'-'+key+'.png',Buffer.from(parsed[key].split(',')[1],'base64')));
 console.log('PASS foundation '+gender+': real face drag, undo/redo, hair/outfit/fit, original PNG, animation, named save/reload/JSON import, hashed ZIP, independently parsed skinned collar/zipper and all 13 exported animations; idempotent brows/clothes/shoes');await context.close();
}}finally{await browser.close();}
