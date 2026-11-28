import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const browser=await chromium.launch({channel:'chromium',args:['--use-angle=metal']});
const report={revision:process.env.PROFILE_REVISION||'current',runs:[]};
try{for(let repetition=0;repetition<3;repetition++){
 const context=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true});const page=await context.newPage(),cdp=await context.newCDPSession(page),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await cdp.send('Network.enable');const network=[];cdp.on('Network.responseReceived',e=>network.push({url:e.response.url,cache:e.response.fromDiskCache||false,mime:e.response.mimeType}));let transfer=0;cdp.on('Network.loadingFinished',e=>transfer+=e.encodedDataLength);
 for(const cache of ['cold','warm']){
  network.length=0;transfer=0;const start=performance.now();await page.goto('http://127.0.0.1:8765/fps/?test&seed=42');await page.waitForFunction(()=>window.__fps&&!document.querySelector('#start').disabled,null,{timeout:180000});
  const lobbyMs=performance.now()-start;await page.locator('#start').click();
  await page.locator('#csl-deploy').click();await page.waitForFunction(()=>__fps.game.player&&document.querySelector('#cs-loading').hidden,null,{timeout:180000});if(await page.locator('#resume').isVisible())await page.locator('#resume').click();
  await page.evaluate(()=>__fps.stopFrameLoop());await cdp.send('HeapProfiler.collectGarbage');
  const resources=await page.evaluate(()=>{
   const f=__fps,r=f.renderer,geometries=new Set(),textures=new Set(),skeletons=new Set(),arrays=new Set(),clips=new Set();let meshes=0,skinMeshes=0;
   for(const root of [r.scene,r.viewScene])root.traverse(o=>{if(o.isMesh)meshes++;if(o.geometry)geometries.add(o.geometry);if(o.skeleton){skinMeshes++;skeletons.add(o.skeleton);}for(const m of [].concat(o.material||[]))for(const t of Object.values(m))if(t?.isTexture)textures.add(t);});
   for(const m of r.actors.values())for(const map of [m.userData.avatar?.base,m.userData.avatar?.upper])if(map)for(const a of map.values())clips.add(a.getClip());
   for(const c of clips)for(const t of c.tracks){arrays.add(t.times);arrays.add(t.values);}
   const a=f.audio;return {meshes,geometries:geometries.size,textures:textures.size,skinMeshes,skeletons:skeletons.size,boneGroups:new Set([...skeletons].map(s=>s.bones.map(b=>b.uuid).join())).size,clips:clips.size,clipBytes:[...arrays].reduce((n,a)=>n+a.byteLength,0),gpu:r.renderer.info.memory,textureImages:[...textures].map(t=>({name:t.name,w:t.image?.width,h:t.image?.height})),audioBytes:[a.buffers,a.voiceBuffers,a.reuseBuffers,a.kitBuffers,a.recordedFoley,a.reloadFoley.buffers,a.floorAudio.buffers].reduce((n,m)=>n+[...m.values()].reduce((s,b)=>s+b.length*b.numberOfChannels*4,0),0),assets:performance.getEntriesByType('resource').filter(e=>/\.(glb|gz|mp3|ogg)(\?|$)/.test(e.name)).map(e=>({url:e.name,body:e.encodedBodySize,transfer:e.transferSize}))};
  });
  const row={repetition,cache,lobbyMs,matchMs:performance.now()-start,transfer,requests:network.length,resources,heap:await cdp.send('Runtime.getHeapUsage')};report.runs.push(row);console.log(JSON.stringify({...row,resources:{...resources,assets:undefined,textureImages:undefined}}));assert.deepEqual(errors,[]);
 }
 await context.close();
}}finally{await browser.close();fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/asset-memory-'+(process.env.PROFILE_LABEL||'current')+'.json',JSON.stringify(report,null,2));}
