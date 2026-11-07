#!/usr/bin/env node
const assert=require('node:assert/strict');
const path=require('node:path'),fs=require('node:fs');
const {chromium}=require(path.join(__dirname,'../frontline/source/tools/dev/node_modules/playwright-core'));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
(async()=>{
 const browser=await chromium.launch({headless:true,args,...(process.env.CHROMIUM_PATH?{executablePath:process.env.CHROMIUM_PATH}:{})});
 const report={};fs.mkdirSync('test-results',{recursive:true});
 try{
  for(const mobile of [true,false]){
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
   // Deterministic snapshots use the existing manual test interface. The shipping
   // RAF and game time step remain untouched.
   await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
   await page.locator('#start').click();
   const checks=await page.evaluate(async()=>{
    const f=__fps;f.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false});
    const g=f.game,p=g.player,a=f.grenadeAssist;
    for(const other of g.actors)if(!other.isPlayer){other.alive=false;other.bot=null;}
    p.inventory.he=1;g.select('he');f.step({},.25);f.step({},.1);
    const {predictGrenade}=await import('../src/fps/grenade-physics.mjs');
    const equal=()=>JSON.stringify(a.preview)===JSON.stringify(predictGrenade(p,g.config,g.world));
    a.reset();a.update(g,p,null);const cache=a.predictionCache;
    const predictions=cache.stats.predictions,hits=cache.stats.reuses;
    const positionVersion=a.geometry.attributes.position.version,distanceVersion=a.geometry.attributes.lineDistance.version;
    const reference=a.preview,storage=cache.boxes,geometry=a.geometry;
    for(let i=0;i<125;i++){g.state.time+=.081;a.update(g,p,null);}
    const stationary={predictions:cache.stats.predictions-predictions,reuses:cache.stats.reuses-hits,
     positionUploads:a.geometry.attributes.position.version-positionVersion,distanceUploads:a.geometry.attributes.lineDistance.version-distanceVersion,
     sameResult:a.preview===reference,sameStorage:storage===cache.boxes,sameGeometry:a.geometry===geometry,exact:equal()};
    const before=cache.stats.predictions;p.pitch+=.1;g.state.time+=.081;a.update(g,p,null);
    const aimed={predictions:cache.stats.predictions-before,exact:equal()};
    const door=g.world.doors.doors[0],savedAngle=door.angle;
    let doorMatches=0;const beforeDoor=cache.stats.predictions;
    for(const angle of [.2,.7,1.4,0]){g.world.doors.pose(door,angle);g.state.time+=.081;a.update(g,p,null);if(equal())doorMatches++;}
    g.world.doors.pose(door,savedAngle);
    const doors={predictions:cache.stats.predictions-beforeDoor,exactMatches:doorMatches};
    const beforeMoving=cache.stats.predictions;
    for(let i=0;i<120;i++){p.yaw+=.001;g.state.time+=1/120;a.update(g,p,null);}
    const movingPredictions=cache.stats.predictions-beforeMoving;
    const beforeRewind=cache.stats.predictions;g.state.time-=2;a.update(g,p,null);
    const rewind=cache.stats.predictions===beforeRewind+1&&equal();
    g.state.paused=true;a.update(g,p,null);const paused=!a.group.visible&&cache.result===null;
    g.state.paused=false;a.update(g,p,null);const resumed=a.group.visible&&equal();
    a.settings.grenadeGuide=false;a.update(g,p,null);const off=!a.group.visible&&cache.result===null;
    a.settings.grenadeGuide=true;a.update(g,p,null);
    p.inventory.flash=1;p.weapon='flash';a.update(g,p,null);
    const switched=a.weapon==='flash'&&a.noteTitle.textContent.includes('FLASH')&&equal();
    const frameWindow=f.renderer.frameTimes,samples=frameWindow.samples;
    f.render();f.render();const fpsFinite=Number.isFinite(f.renderer.stats.fps);
    f.renderer.resetTransient();const frameReset=frameWindow.count===0&&frameWindow.samples===samples;
    // Restore actual game time/controls; all existing grenade tests still run
    // real touch/mouse throws and compare the detonation endpoint.
    f.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false});
    for(const other of f.game.actors)if(!other.isPlayer){other.alive=false;other.bot=null;}
    f.game.player.inventory.he=1;f.game.select('he');f.step({},.25);f.step({},.1);
    return {stationary,aimed,doors,movingPredictions,rewind,paused,resumed,off,switched,fpsFinite,frameReset,
     ammo:f.game.player.inventory.he,visible:a.group.visible,version:document.getElementById('game-version').textContent};
   });
   assert.deepEqual(checks.stationary,{predictions:0,reuses:125,positionUploads:0,distanceUploads:0,sameResult:true,sameStorage:true,sameGeometry:true,exact:true});
   assert.deepEqual(checks.aimed,{predictions:1,exact:true});
   assert.deepEqual(checks.doors,{predictions:4,exactMatches:4});
   assert.ok(checks.movingPredictions>=10&&checks.movingPredictions<=13,'Keep existing moving-aim update budget');
   for(const key of ['rewind','paused','resumed','off','switched','fpsFinite','frameReset','visible'])assert.equal(checks[key],true,key);
   assert.equal(checks.ammo,1);const expectedVersion=process.env.EXPECTED_GAME_VERSION||JSON.parse(fs.readFileSync(path.join(__dirname,'../build-info.json'),'utf8')).gameVersion;assert.ok(checks.version.includes(expectedVersion),`Expected game version ${expectedVersion}, got ${checks.version}`);
   assert.deepEqual(errors,[]);assert.equal(await page.locator('#fatal').isVisible(),false);
   await page.screenshot({path:`test-results/detail-${mobile?'mobile':'desktop'}.png`,timeout:60000,animations:'disabled'});
   report[mobile?'mobile':'desktop']=checks;console.log('DETAIL '+(mobile?'MOBILE':'DESKTOP')+' PASS',JSON.stringify(checks));
   await context.close();
  }
  fs.writeFileSync('test-results/detail-metrics.json',JSON.stringify(report,null,2));
 }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
