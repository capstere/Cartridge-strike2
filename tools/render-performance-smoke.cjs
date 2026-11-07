#!/usr/bin/env node
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {chromium}=require(path.join(__dirname,'../frontline/source/tools/dev/node_modules/playwright-core'));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
async function boot(browser,mobile){
 const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(String(e)));
 await page.addInitScript(()=>{
  localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',hudMode:'clean'}));
  HTMLElement.prototype.requestFullscreen=undefined;
  HTMLCanvasElement.prototype.requestPointerLock=function(){Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>this});return Promise.resolve();};
  document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>null});
 });
 await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded',timeout:60000});
 await page.waitForFunction(()=>globalThis.__fps||!document.getElementById('fatal').hidden,null,{timeout:180000});
 assert.equal(await page.locator('#fatal').isVisible(),false);
 const before=await page.evaluate(()=>__fps.renderBudget.stats.idle);
 await page.waitForTimeout(650);
 const idle=await page.evaluate(()=>__fps.renderBudget.stats.idle);
 assert.ok(idle>before&&idle-before<=8,'Menus should redraw without a full-rate render loop');
 await page.evaluate(()=>__fps.stopFrameLoop());
 await page.locator('#start').click();
 await page.evaluate(()=>{
  __fps.start('analysts',{mode:'endless',firefight:false,botFire:false,wanderers:false,loadout:'smg'});
  for(const a of __fps.game.actors)if(!a.isPlayer){a.alive=false;a.bot=null;}
  __fps.step({},.02);
 });
 return {context,page,errors,idleFrames:idle-before};
}
(async()=>{
 fs.mkdirSync('test-results',{recursive:true});
 const browser=await chromium.launch({headless:true,args});const report={};
 try{
  for(const mobile of [true,false]){
   const {context,page,errors,idleFrames}=await boot(browser,mobile);
   const result=await page.evaluate(async({origin,mobile})=>{
    const f=__fps,g=f.game,p=g.player;
    const {MinimapCache}=await import(origin+'/src/fps/minimap-cache.mjs');
    const {legacyMinimap}=await import(origin+'/tools/fixtures/minimap-0.15.1.mjs');
    // Pixel readback must use the same rasterizer for the reference, the cached
    // static layer and the destination. GPU/CPU text and subpixel coverage differ.
    const referenceCanvas=()=>{const canvas=document.createElement('canvas');canvas.getContext('2d',{willReadFrequently:true});return canvas;};
    const a=referenceCanvas(),b=referenceCanvas();
    const map=new MinimapCache(b,referenceCanvas);let maxDifference=0,differentChannels=0,rawMaxDifference=0,squaredError=0,pixelCount=0,changedPixels=0;const mapShots=[];
    for(const expanded of [false,true]){
     a.width=b.width=expanded?448:224;a.height=b.height=expanded?316:158;
     legacyMinimap(a,f.world,g,expanded);map.draw(f.world,g,expanded);
     const rawA=a.getContext('2d').getImageData(0,0,a.width,a.height).data;
     const rawB=b.getContext('2d').getImageData(0,0,b.width,b.height).data;
     for(let i=0;i<rawA.length;i++)rawMaxDifference=Math.max(rawMaxDifference,Math.abs(rawA[i]-rawB[i]));
     const displayed=source=>{const c=document.createElement('canvas');c.width=source.width;c.height=source.height;
      const x=c.getContext('2d',{willReadFrequently:true});x.fillStyle='#13212b';x.fillRect(0,0,c.width,c.height);x.drawImage(source,0,0);return c;};
     const expectedCanvas=displayed(a),actualCanvas=displayed(b);
     const expected=expectedCanvas.getContext('2d').getImageData(0,0,a.width,a.height).data;
     const actual=actualCanvas.getContext('2d').getImageData(0,0,b.width,b.height).data;
     for(let i=0;i<expected.length;i+=4){let altered=false;pixelCount++;
      for(let k=0;k<3;k++){const diff=Math.abs(expected[i+k]-actual[i+k]);maxDifference=Math.max(diff,maxDifference);squaredError+=diff*diff;if(diff)differentChannels++;if(diff>2)altered=true;}
      if(altered)changedPixels++;
     }
     // Image caching introduces one 8-bit compositing boundary. Also verify
     // exact primitive coordinates so antialias tolerances cannot hide shifts.
     const commands=()=>{const calls=[],ctx={};for(const key of ['clearRect','drawImage','beginPath','moveTo','lineTo','closePath','fill','stroke','fillText','save','restore','arc'])ctx[key]=(...args)=>{if(key!=='clearRect')calls.push([key,...args]);};
      return {width:a.width,height:a.height,calls,getContext:()=>ctx};};
     const oldCommands=commands();legacyMinimap(oldCommands,f.world,{...g,actors:[]},expanded);
     const staticCommands=commands(),commandMap=new MinimapCache(commands(),()=>staticCommands);
     commandMap.layer(f.world,expanded);
     if(JSON.stringify(oldCommands.calls)!==JSON.stringify(staticCommands.calls))throw Error('Static map drawing coordinates changed');
     mapShots.push({expanded,expected:expectedCanvas.toDataURL(),actual:actualCanvas.toDataURL()});
    }
    a.width=b.width=224;a.height=b.height=158;
    const builds=map.stats.builds;
    for(let n=0;n<100;n++)map.draw(f.world,g,false);
    const cacheBuilds=map.stats.builds-builds;
    const hiddenBefore=f.minimapCache.stats.draws;
    f.render();f.render();
    const hiddenDraws=f.minimapCache.stats.draws-hiddenBefore;
    p.weapon='smg';p.nextShot=g.state.time;p.reloadUntil=0;p.fireHeld=false;
    const ammo=g.item(p).ammo;
    f.step({fire:true,yaw:p.yaw,pitch:p.pitch},.02);
    const shot={spent:ammo-g.item(p).ammo,count:f.renderer.tracerBatch.count,
     legacyObjects:f.renderer.effects.filter(e=>e.mesh.isLine).length};
    const geometry=f.renderer.tracerBatch.geometry;
    f.renderer.resetTransient();
    const reset=f.renderer.tracerBatch.count===0&&f.renderer.tracerBatch.geometry===geometry;
    return {maxDifference,rawMaxDifference,differentChannels,rmse:Math.sqrt(squaredError/(pixelCount*3)),changedPixelRatio:changedPixels/pixelCount,commandsIdentical:true,mapShots,cacheBuilds,cacheEntries:map.layers.size,
     hiddenDraws,wallCount:f.world.data.walls.length,shot,reset};
   },{origin,mobile});
   for(const image of result.mapShots)for(const kind of ['expected','actual'])
    fs.writeFileSync(`test-results/map-${mobile?'mobile':'desktop'}-${image.expanded?'large':'small'}-${kind}.png`,Buffer.from(image[kind].split(',')[1],'base64'));
   delete result.mapShots;
   // Permit only sparse edge coverage differences after flattening a cached layer.
   // All static primitive coordinates must still match exactly (checked above).
   assert.ok(result.rmse<.5&&result.changedPixelRatio<.001&&result.maxDifference<=32,
    'Cached map differs beyond subpixel compositing tolerance: '+JSON.stringify(result));
   assert.equal(result.cacheBuilds,0,'Compact/expanded layers should both be reused');
   assert.equal(result.cacheEntries,2);assert.equal(result.shot.spent,1);assert.ok(result.shot.count>0);
   assert.equal(result.shot.legacyObjects,0);assert.ok(result.reset);
   if(mobile)assert.equal(result.hiddenDraws,0,'Hidden mobile map must draw nothing');
   else assert.ok(result.hiddenDraws>0);
   if(mobile){await page.locator('#mobile-more').tap();await page.locator('[data-utility=karta]').tap();}
   else await page.keyboard.press('m');
   const opened=await page.evaluate(()=>({draws:__fps.minimapCache.stats.draws,width:document.getElementById('minimap').width,
    visible:!!document.querySelector('.map-panel').getClientRects().length}));
   assert.equal(opened.width,448);assert.equal(opened.visible,true);assert.ok(opened.draws>0);
   // Capture the real GPU frame immediately, before its drawing buffer is discarded.
   // Keep the actual expanded map, full HUD, original CSS and viewport in the proof image.
   // SwiftShader can otherwise stall in DevTools while copying a live WebGL surface.
   const restoreSurface=await page.evaluateHandle(async()=>{
    const canvases=[__fps.renderer.renderer.domElement,document.getElementById('minimap')];
    __fps.render();
    const surfaces=canvases.map(canvas=>{
     const still=new Image();
     for(const attribute of canvas.attributes)still.setAttribute(attribute.name,attribute.value);
     still.src=canvas.toDataURL('image/png');
     return {canvas,still};
    });
    await Promise.all(surfaces.map(({still})=>still.decode()));
    if(surfaces.some(({canvas,still})=>still.naturalWidth!==canvas.width||still.naturalHeight!==canvas.height))throw Error('Incomplete canvas capture');
    for(const {canvas,still} of surfaces)canvas.replaceWith(still);
    return ()=>{for(const {canvas,still} of surfaces)still.replaceWith(canvas);};
   });
   try{
    await page.screenshot({path:`test-results/perf-${mobile?'mobile':'desktop'}.png`,animations:'disabled',timeout:60000});
   }finally{
    await restoreSurface.evaluate(restore=>restore());
    await restoreSurface.dispose();
   }
   assert.deepEqual(errors,[]);assert.equal(await page.locator('#fatal').isVisible(),false);
   report[mobile?'mobile':'desktop']={...result,idleFrames};
   if(!mobile){
    report.tracers=await page.evaluate(async base=>{
     const T=await import(base+'/vendor/three/three.module.js');const {TracerBatch}=await import(base+'/src/fps/tracer-batch.mjs');
     const r=new T.WebGLRenderer({antialias:false});r.setSize(256,128);
     const scene=new T.Scene(),camera=new T.PerspectiveCamera(50,2,.01,50);camera.position.z=5;
     const materials=[],geometries=[];
     for(let n=0;n<32;n++){
      const y=(n-16)*.035,a=new T.Vector3(-1,y,0),b=new T.Vector3(1,y,0);
      const geo=new T.BufferGeometry().setFromPoints([a,b]),mat=new T.LineBasicMaterial({color:0xf3da9b,transparent:true});
      geometries.push(geo);materials.push(mat);scene.add(new T.Line(geo,mat));
     }
     r.render(scene,camera);const before=r.info.render.calls;
     scene.clear();for(const g of geometries)g.dispose();for(const m of materials)m.dispose();
     const batch=new TracerBatch(scene);
     for(let n=0;n<32;n++){const y=(n-16)*.035;batch.add({x:-1,y,z:0},{x:1,y,z:0},0);}
     batch.update(.01);r.render(scene,camera);const after=r.info.render.calls;
     const initial=r.info.memory.geometries,uuid=batch.geometry.uuid;
     for(let n=0;n<250;n++){batch.add({x:-1,y:0,z:0},{x:1,y:0,z:0},n*.01);batch.update(n*.01);r.render(scene,camera);}
     const final=r.info.memory.geometries;batch.update(10);r.render(scene,camera);const expired=r.info.render.calls;
     const stable=batch.geometry.uuid===uuid;batch.dispose();r.dispose();r.forceContextLoss();
     return {before,after,initial,final,expired,stable};
    },origin);
    assert.equal(report.tracers.before,32);assert.equal(report.tracers.after,1);
    assert.equal(report.tracers.initial,report.tracers.final);assert.equal(report.tracers.expired,0);assert.ok(report.tracers.stable);
   }
   await context.close();
  }
  fs.writeFileSync('test-results/render-performance.json',JSON.stringify(report,null,2));
  console.log('RENDER PERFORMANCE PASS',JSON.stringify(report));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
