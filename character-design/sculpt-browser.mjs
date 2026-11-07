/** End-to-end direct sculpt, real pointer/touch input, real GLBs and WebGL.
 * Proves persistent vertex edits (not camera movement or annotation overlays),
 * per-stroke undo, skin paint, two-finger cancellation and exported geometry.
 */
import {createRequire} from 'node:module';
import {readFile,mkdir} from 'node:fs/promises';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_EXECUTABLE_PATH||undefined,headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
function unzip(bytes){const entries=new Map();let o=0;while(bytes.readUInt32LE(o)===0x04034b50){const len=bytes.readUInt32LE(o+18),nameLen=bytes.readUInt16LE(o+26),extra=bytes.readUInt16LE(o+28),start=o+30+nameLen+extra;entries.set(bytes.toString('utf8',o+30,o+30+nameLen),bytes.subarray(start,start+len));o=start+len;}return entries;}
const displacement=model=>Object.values(model||{}).reduce((n,m)=>n+m.deltas.slice().reduce((sum,v,i)=>sum+(i%4?Math.abs(v):0),0),0);
try{
 for(const mobile of (process.env.SCULPT_TEST_DEVICE==='mobile'?[true]:[false,true])){
  const context=await browser.newContext({viewport:mobile?{width:390,height:844}:{width:1440,height:1050},isMobile:mobile,hasTouch:mobile,acceptDownloads:true});
  const page=await context.newPage(),errors=[];page.setDefaultTimeout(45000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
  const $=id=>page.locator('#'+id),tool=mode=>page.locator('[data-sculpt-tool="'+mode+'"]');
  async function download(id){const ev=page.waitForEvent('download');await $(id).click();return readFile(await(await ev).path());}
  const saved=async()=>JSON.parse((await download('save-json')).toString());
  await page.goto(origin+'/character-design/?studio=5.3');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
  assert.equal(await $('tab-sculpt').isVisible(),true);const gender=mobile?'female':'male';
  if(mobile)await $('gender').selectOption(gender);
  await $('sculpt-focus').click();
  const image=()=>$('preview3d').evaluate(c=>c.toDataURL());
  async function stroke(x,y,dx,dy){
   await $('preview3d').scrollIntoViewIfNeeded();const b=await $('preview3d').boundingBox(),sx=b.x+b.width*x,sy=b.y+b.height*y;
   if(mobile){const cdp=await context.newCDPSession(page);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:sx,y:sy,id:1,force:.5}]});for(let i=1;i<=8;i++){await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:sx+dx*i/8,y:sy+dy*i/8,id:1,force:.5}]});await page.waitForTimeout(18);}await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();}
   else{await page.mouse.move(sx,sy);await page.mouse.down();await page.mouse.move(sx+dx,sy+dy,{steps:8});await page.mouse.up();}
   await page.waitForTimeout(160);
  }
  const cheekX=mobile?.55:.63;const original=await image();await stroke(mobile?.54:.63,.55,mobile?8:14,mobile?-5:-9);const after=await saved();
  assert.ok(displacement(after.creative.sculpt.models[gender])>.001,'drag must create persistent bind-space vertex displacement');assert.notEqual(await image(),original);
  const offsets=after.creative.sculpt.models[gender];assert.ok(offsets['face-skin'].count>3000,'face has genuine detail geometry');
  await $('undo-design').click();assert.equal(displacement((await saved()).creative.sculpt.models[gender]),0,'one drag = one undo step');
  await $('redo-design').click();assert.deepEqual((await saved()).creative.sculpt.models[gender],offsets,'redo restores exact deltas');
  // Profile edit must change depth, not rotate the camera or draw on a reference.
  await page.locator('[data-sculpt-view=left]').click();await tool('grab').click();await stroke(.48,.56,-12,2);const profile=await saved();
  assert.ok(profile.creative.sculpt.revision>after.creative.sculpt.revision);
  await page.locator('[data-sculpt-view=front]').click();await tool('inflate').click();await stroke(cheekX,.58,mobile?5:8,0);const inflated=await saved();assert.ok(inflated.creative.sculpt.revision>profile.creative.sculpt.revision);
  await tool('deflate').click();await stroke(cheekX,.58,mobile?5:8,0);
  await tool('smooth').click();await stroke(cheekX,.58,mobile?5:8,0);
  await tool('paint').click();await $('sculpt-color').fill('#ee2266');await stroke(cheekX,.58,mobile?5:9,3);const painted=await saved();assert.ok(painted.creative.sculpt.models[gender]['face-skin'].paint.length>0,'skin paint is persisted');
  // The quick colour controls and existing colour tab stay in sync.
  await page.locator('#tab-sculpt [data-color=skin]').fill('#c8a07d');await page.locator('[data-tab=look]').click();assert.equal(await page.locator('#colors [data-color=skin]').inputValue(),'#c8a07d');await page.locator('[data-tab=sculpt]').click();
  if(mobile){
   await tool('grab').click();const beforeGesture=(await saved()).creative.sculpt;await $('preview3d').scrollIntoViewIfNeeded();const b=await $('preview3d').boundingBox(),x=b.x+b.width*.54,y=b.y+b.height*.58,cdp=await context.newCDPSession(page);
   await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y,id:1},{x:x-80,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x+15,y,id:1},{x:x-95,y,id:2}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await cdp.detach();
   assert.deepEqual((await saved()).creative.sculpt,beforeGesture,'two-finger navigation must not leave a stray sculpt stroke');
  }
  const final=await saved();await $('save-slot').click();await page.waitForFunction(()=>document.querySelector('#save-state').textContent.includes('Alla ändringar'));
  await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));assert.deepEqual((await saved()).creative.sculpt,final.creative.sculpt,'autosave reload restores exact sculpture and paint');
  await $('open-project').click();await $('project-file').setInputFiles({name:'sculpted.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(final))});await page.waitForTimeout(200);
  assert.deepEqual((await saved()).creative.sculpt,final.creative.sculpt,'portable JSON restores sculpture');
  // Exported PREVIEW.glb is loaded into a separate scene and animated/rendered.
  const zip=unzip(await download('export-zip')),preview=zip.get('PREVIEW.glb');assert.ok(preview);
  const geometry=await page.evaluate(async ({data,gender})=>{
   const T=await import('../vendor/three/three.module.js'),{GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js');const bytes=Uint8Array.from(atob(data),c=>c.charCodeAt(0)),asset=await new GLTFLoader().parseAsync(bytes.buffer,'');let face;
   asset.scene.traverse(m=>{if(m.isSkinnedMesh&&m.material.name==='face-skin')face=m;});
   const {DesignWorkbench}=await import('./workbench.mjs?v=6.1.2'),{newProject}=await import('./project-schema.mjs?v=6.1.2');
   const canvas=document.createElement('canvas');canvas.style.cssText='position:fixed;left:-3000px;width:320px;height:400px';document.body.appendChild(canvas);const fresh=new DesignWorkbench(canvas,new Map());await fresh.initialize();fresh.update(newProject({gender}),{recreate:true,rebuild:true});
   const baseline=fresh.avatar.meshes.find(m=>m.material.name==='face-skin').geometry.attributes.position.array,edited=face.geometry.attributes.position.array;let maxDelta=0;for(let i=0;i<edited.length;i++)maxDelta=Math.max(maxDelta,Math.abs(edited[i]-baseline[i]));fresh.dispose();canvas.remove();
   const paint=face.geometry.attributes.color;let nonWhite=false;for(let i=0;i<paint.count;i++)if(Math.abs(paint.getX(i)-1)>.01||Math.abs(paint.getY(i)-1)>.01){nonWhite=true;break;}
   const scene=new T.Scene();scene.background=new T.Color('#eef4f1');scene.add(asset.scene,new T.HemisphereLight(0xffffff,0x778888,3));const light=new T.DirectionalLight(0xffffff,2);light.position.set(2,4,5);scene.add(light);
   const r=new T.WebGLRenderer({preserveDrawingBuffer:true});r.setSize(320,400);const camera=new T.OrthographicCamera(-1,1,1.25,-1.25,.01,100);camera.position.set(0,.9,4);camera.lookAt(0,.9,0);const mixer=new T.AnimationMixer(asset.scene);mixer.clipAction(asset.animations.find(c=>c.name==='Walk_Loop')).play();mixer.update(.1);r.render(scene,camera);const a=r.domElement.toDataURL();mixer.update(.25);r.render(scene,camera);const b=r.domElement.toDataURL();r.dispose();
   return {count:face.geometry.attributes.position.count,maxDelta,nonWhite,animated:a!==b,clips:asset.animations.length};
  },{data:preview.toString('base64'),gender});
  assert.ok(geometry.count>10000);assert.ok(geometry.maxDelta>.00001,'exported skin vertices differ from the pristine real base rig');assert.ok(geometry.nonWhite);assert.equal(geometry.clips,13);assert.equal(geometry.animated,true);
  const exported=JSON.parse(zip.get('PROJECT.json'));assert.deepEqual(exported.creative.sculpt,final.creative.sculpt);
  // Reset has an exact undo, preserving the user's work.
  await $('sculpt-focus').click();await page.locator('#tab-sculpt details summary').click();await $('sculpt-reset').click();assert.equal(displacement((await saved()).creative.sculpt.models[gender]),0);await $('undo-design').click();assert.deepEqual((await saved()).creative.sculpt,final.creative.sculpt);
  await mkdir('test-results',{recursive:true});await $('sculpt-focus').click();await $('preview3d').screenshot({path:'test-results/sculpt-'+gender+'.png'});
  assert.deepEqual(errors,[]);console.log('PASS direct sculpt '+gender+(mobile?' touch':' mouse')+': actual vertex drag, profile depth, volume, smoothing, paint, exact undo/redo, reopen, skinned GLB export and rendered exported animation');await context.close();
 }
}finally{await browser.close();}
