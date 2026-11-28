// Opt-in native room-transition test. Issue inputs through the actual waiting-room UI.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import '../server/register-shared.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');
const out=process.env.CS3_BONUS_EVIDENCE;
assert(out&&process.env.WAYLAND_DISPLAY,'Output directory and native Wayland session required');
await mkdir(out,{recursive:true});
const server=await createLocalServer({port:0});
const browser=await chromium.launch({executablePath:'/usr/bin/chromium',headless:false,args:[
  '--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']});
const page=await browser.newPage({viewport:{width:640,height:360},deviceScaleFactor:.75,isMobile:true,hasTouch:true});
page.setDefaultTimeout(45000);
const errors=[],result={build:CONTRACT.buildHash,protocol:CONTRACT.protocolVersion};
page.on('pageerror',e=>errors.push(e.message));
async function instrument(){
  const {Renderer}=await import('/src/fps/render.mjs?v=floor5-environment-1');
  const {uniformSwatch}=await import('/src/fps/operator-equipment.mjs');
  const {OUTFITS}=await import('/src/fps/operator-outfits.mjs');
  const tile=uniformSwatch(OUTFITS.find(o=>o.id==='shotgun'));
  const listeners=o=>o?._listeners?.dispose?.length??0;
  const records=[],owners=new WeakMap(),refs=[];
  const prep=Renderer.prototype.prepareOperatorPrograms,dispose=Renderer.prototype.dispose;
  function dimensions(i){
    const owner=refs[i]?.deref(),gpu=owner?.renderer,gl=gpu?.getContext();if(!gl||gl.isContextLost())return null;
    return {screen:[innerWidth,innerHeight],canvas:[gpu.domElement.width,gpu.domElement.height],
      buffer:[gl.drawingBufferWidth,gl.drawingBufferHeight],viewport:Array.from(gl.getParameter(gl.VIEWPORT)),
      aspect:owner.camera.aspect,viewAspect:owner.viewCamera.aspect,scissor:gl.isEnabled(gl.SCISSOR_TEST),
      defaultTarget:gpu.getRenderTarget()===null};
  }
  Renderer.prototype.prepareOperatorPrograms=async function(actors,signal){
    const i=records.length,gpu=this.renderer,gl=gpu.getContext(),clones=new Set();
    const entry={i,map:this.world.project.projectId,issued:actors.every(a=>a.userData.avatar?.outfitId==='issued'),
      start:performance.now(),fences:0,deletes:0,tileListenersAtStart:listeners(tile)};
    records.push(entry);owners.set(this,entry);refs.push(new WeakRef(this));
    const init=gpu.initTexture,make=gl.fenceSync,release=gl.deleteSync;
    gpu.initTexture=function(t){if(t.source===tile.source){if(t===tile)entry.sharedTileUploaded=true;else clones.add(t);}return init.call(this,t);};
    gl.fenceSync=function(...a){const sync=make.apply(this,a);if(sync)entry.fences++;return sync;};
    gl.deleteSync=function(sync){if(sync)entry.deletes++;return release.call(this,sync);};
    signal.addEventListener('abort',()=>{entry.aborted=true;entry.dimensionsAtAbort=dimensions(i);},{once:true});
    try{return await prep.call(this,actors,signal);}
    finally{
      entry.end=performance.now();entry.retained=this.operatorProgramMaterials?.length??0;
      entry.cloneCount=clones.size;entry.remainingCloneListeners=[...clones].map(listeners);
      entry.remainingTileListeners=listeners(tile);entry.finalDimensions=dimensions(i);
      gpu.initTexture=init;gl.fenceSync=make;gl.deleteSync=release;
    }
  };
  Renderer.prototype.dispose=function(...args){
    const entry=owners.get(this),mats=[...(this.operatorProgramMaterials||[])],gpu=this.renderer;
    try{return dispose.apply(this,args);}
    finally{if(entry)Object.assign(entry,{disposed:this.presentationDisposed,keptLibrary:!!args[0]?.keepCharacterLibrary,
      contextLost:gpu.getContext().isContextLost(),heldAfter:this.operatorProgramMaterials?.length??0,
      retainedMatListeners:mats.map(listeners)});}
  };
  window.cancelProof={records,dimensions};
}
async function create(){
  await page.locator('#network-code').fill('cold-fixture');
  await page.locator('#network-name').fill('Issued observer');
  await page.locator('#network-map').selectOption('compact-arena');
  await page.locator('#network-fill-bots').uncheck();
  await page.locator('[data-create=true]').tap();
}
async function resizeActive(i,width,height){
  await page.waitForFunction(i=>window.cancelProof.records[i]?.fences>0&&!window.cancelProof.records[i].end,i);
  await page.setViewportSize({width,height});
  await page.waitForFunction(({i,width,height})=>{
    const d=cancelProof.dimensions(i);
    return d?.screen[0]===width&&d.screen[1]===height&&d.aspect===width/height&&d.canvas[0]===d.viewport[2]&&d.canvas[1]===d.viewport[3];
  },{i,width,height});
  return page.evaluate(i=>({during:!cancelProof.records[i].end,size:cancelProof.dimensions(i)}),i);
}
function viewport(d){
  assert(d&&d.defaultTarget&&!d.scissor);assert.deepEqual(d.buffer,d.canvas);
  assert.deepEqual(d.viewport,[0,0,...d.canvas]);assert.equal(d.aspect,d.screen[0]/d.screen[1]);assert.equal(d.viewAspect,d.aspect);
}
try{
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',ambient:false})));
  await page.goto(server.url+'/',{waitUntil:'domcontentloaded'});
  await page.locator('[data-go=play]:visible').tap();await page.locator('[data-go=friends]').tap();await page.locator('[data-lan-link]').tap();
  await page.locator('#network-code').waitFor();await page.evaluate(instrument);await create();
  result.landscapeToPortrait=await resizeActive(0,384,640);
  await page.locator('#room-ready').waitFor();await page.waitForFunction(()=>!!cancelProof.records[0].end);
  result.admitted=await page.evaluate(()=>cancelProof.dimensions(0));viewport(result.admitted);
  await page.locator('#room-map').selectOption('meltem');
  result.portraitToLandscape=await resizeActive(1,640,360);
  await page.locator('#room-leave').tap();
  await page.waitForFunction(()=>!!cancelProof.records[1]?.disposed);
  await page.locator('#network-code').waitFor();
  for(let i=0;server.rooms.size&&i<200;i++)await delay(25);
  assert.equal(server.rooms.size,0);result.roomsAfterCancel=server.rooms.size;
  await create();await page.locator('#room-ready').waitFor();
  await page.waitForFunction(()=>!!cancelProof.records[2]?.end);
  result.retry=await page.evaluate(()=>cancelProof.dimensions(2));viewport(result.retry);
  await page.locator('#room-map').selectOption('meltem');
  await page.waitForFunction(()=>!!cancelProof.records[3]?.end);
  await page.locator('#room-leave').tap();await page.locator('#network-code').waitFor();
  for(let i=0;server.rooms.size&&i<200;i++)await delay(25);
  result.roomsAfterLeave=server.rooms.size;
  result.entries=await page.evaluate(()=>cancelProof.records);result.errors=errors;
  await writeFile(join(out,'cold-cancel.json'),JSON.stringify(result,null,2)+'\n');
  assert.equal(server.rooms.size,0);assert.deepEqual(errors,[]);
  for(const view of [result.landscapeToPortrait,result.portraitToLandscape]){assert(view.during);viewport(view.size);}
  const [first,cancel,retry]=result.entries;
  assert(cancel.aborted&&cancel.end&&cancel.retained===0);
  for(const e of [first,cancel,retry]){
    assert(e.issued&&e.disposed&&e.keptLibrary&&e.contextLost&&!e.heldAfter);
    assert(e.fences>0&&e.fences===e.deletes);assert(e.cloneCount>0&&!e.sharedTileUploaded);
    assert.equal(e.remainingTileListeners,e.tileListenersAtStart);
    assert(e.remainingCloneListeners.every(n=>n===0));assert(e.retainedMatListeners.every(n=>n===0));
  }
  console.log('Native all-issued resize, leave during texture preparation, room release and re-admission passed.');
}catch(e){
  result.entries=await page.evaluate(()=>window.cancelProof?.records).catch(()=>null);result.errors=errors;
  await writeFile(join(out,'cold-cancel.json'),JSON.stringify(result,null,2)+'\n');throw e;
}finally{await browser.close();await server.close();}
