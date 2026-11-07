#!/usr/bin/env node
const assert=require('node:assert/strict');
const path=require('node:path');
const fs=require('node:fs');
const {chromium}=require(path.join(__dirname,'../frontline/source/tools/dev/node_modules/playwright-core'));
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const args=['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];
async function boot(browser,mobile){
  const context=await browser.newContext({viewport:{width:844,height:390},hasTouch:mobile,isMobile:mobile,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low'}));
    HTMLCanvasElement.prototype.requestPointerLock=function(){Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>this});return Promise.resolve();};
    document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>null});
  });
  await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>globalThis.__fps||!document.getElementById('fatal').hidden,null,{timeout:180000});
  assert.equal(await page.locator('#fatal').isVisible(),false);
  // This suite explicitly calls __fps.step/render. Stop the redundant idle RAF
  // AFTER boot so software GPU queues cannot starve screenshot compositing.
  // No change to the shipped render loop or any game-control behavior.
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#start').click();
  await page.evaluate(()=>{
    __fps.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false,friendlyFire:false});
    const g=__fps.game;for(const a of g.actors)if(!a.isPlayer){a.alive=false;a.bot=null;}
    // This endpoint comparison tests a static snapshot; real moving doors can
    // legitimately change the future flight, as stated in the user guide.
    if(g.world.doors)g.world.doors.update=()=>{};
    g.player.inventory.he=1;g.select('he');
    for(let i=0;i<5;i++)__fps.step(null,.1);
  });
  return {context,page,errors};
}
(async()=>{
  const browser=await chromium.launch({headless:true,args});
  fs.mkdirSync('test-results',{recursive:true});
  try{
    for(const mobile of [true,false]){
      const {context,page,errors}=await boot(browser,mobile);
      const initial=await page.evaluate(()=>{
        const a=__fps.grenadeAssist,p=__fps.game.player;
        window.__prediction=structuredClone(a.preview);
        return {visible:a.group.visible,note:!a.note.hidden,count:a.geometry.drawRange.count,
          depth:a.path.material.depthTest,write:a.path.material.depthWrite,
          points:a.preview?.points.length,geometry:a.geometry.uuid,ammo:p.inventory.he};
      });
      assert.equal(initial.visible,true);assert.equal(initial.note,true);assert.ok(initial.count>3);
      assert.equal(initial.depth,true,'Guide must not be drawn through walls');assert.equal(initial.write,false);
      assert.equal(initial.ammo,1,'Preview cannot spend ammunition');
      await page.screenshot({path:`test-results/grenade-guide-${mobile?'mobile':'desktop'}.png`,timeout:60000,animations:'disabled'});
      const memory=await page.evaluate(()=>{
        for(let i=0;i<5;i++)__fps.render();
        return {geometry:__fps.grenadeAssist.geometry.uuid,ammo:__fps.game.player.inventory.he};
      });
      assert.equal(memory.geometry,initial.geometry,'No GPU geometry churn while displaying guide');assert.equal(memory.ammo,1);
      await page.evaluate(()=>{
        const g=__fps.game,original=g.detonateGrenade;
        window.__landed=null;
        g.detonateGrenade=function(grenade){window.__landed={x:grenade.x,y:grenade.y,z:grenade.z};return original.call(this,grenade);};
      });
      let cdp;
      if(mobile){
        cdp=await context.newCDPSession(page);
        const trigger=page.locator('[data-mobile-action=fire]');
        assert.equal(await trigger.textContent(),'KASTA');
        const r=await trigger.boundingBox();
        await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:r.x+r.width/2,y:r.y+r.height/2,id:21}]});
      }else await page.evaluate(()=>document.getElementById('game').dispatchEvent(new MouseEvent('mousedown',{button:0,bubbles:true})));
      const thrown=await page.evaluate(()=>{__fps.step(null,1/60);return {ammo:__fps.game.player.inventory.he,n:__fps.game.state.grenades.length,guide:__fps.grenadeAssist.group.visible};});
      if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
      else await page.evaluate(()=>window.dispatchEvent(new MouseEvent('mouseup',{button:0,bubbles:true})));
      assert.deepEqual(thrown,{ammo:0,n:1,guide:false},'Actual input must throw once and hide guide');
      const landed=await page.evaluate(()=>{
        const g=__fps.game;
        for(let i=0;i<120&&g.state.grenades.length;i++)g.update(1/60,{fire:false,yaw:g.player.yaw,pitch:g.player.pitch});
        __fps.step(null,1/60);
        return {actual:window.__landed,predicted:window.__prediction.endpoint,grenades:g.state.grenades.length};
      });
      assert.ok(landed.actual);assert.equal(landed.grenades,0);
      const difference=Math.hypot(...['x','y','z'].map(k=>landed.actual[k]-landed.predicted[k]));
      assert.ok(difference<1e-6,'Real world throw matches guide: '+JSON.stringify(landed));
      console.log(`${mobile?'Mobile':'Desktop'} real grenade endpoint error: ${difference}`);
      const danger=await page.evaluate(()=>{
        const g=__fps.game,p=g.player,enemy=g.actors.find(a=>a.team!==p.team);
        let q;
        for(let i=0;i<16;i++){
          const a=i*Math.PI/8,c={x:p.x+Math.cos(a)*1.4,y:.15,z:p.z+Math.sin(a)*1.4};
          if(g.world.segmentClear({...c,y:.23},{x:p.x,y:p.y+p.height*.55,z:p.z},{vision:false})){q=c;break;}
        }
        if(!q)throw new Error('Could not find an unobstructed nearby grenade position');
        p.spawnProtectedUntil=0;
        g.state.grenades.push({...q,id:'warning-fixture',type:'he',ownerId:enemy.id,vx:0,vy:0,vz:0,radius:.1,deadline:g.state.time+1.2,lastBounce:-Infinity});
        __fps.step(null,.1);
        return {hidden:__fps.grenadeAssist.danger.hidden,threat:__fps.grenadeAssist.threat};
      });
      assert.equal(danger.hidden,false);assert.equal(danger.threat.type,'he');
      await page.screenshot({path:`test-results/grenade-danger-${mobile?'mobile':'desktop'}.png`,timeout:60000,animations:'disabled'});
      const rotated=await page.evaluate(()=>{
        const g=__fps.game;__fps.step({yaw:g.player.yaw+Math.PI/2,pitch:0,fire:false},.1);
        return __fps.grenadeAssist.threat.angle;
      });
      const change=rotated-danger.threat.angle;
      assert.ok(Math.abs(Math.atan2(Math.sin(change),Math.cos(change))-Math.PI/2)<.01,'Warning rotates with view');
      if(mobile)await page.locator('[data-mobile-action=pause]').tap();else await page.keyboard.press('Escape');
      assert.equal(await page.locator('#grenade-danger').isVisible(),false,'Pause clears danger');
      assert.equal(await page.locator('#grenade-preview-note').isVisible(),false,'Pause clears guide');
      await page.locator('#pause [data-setting=grenadeGuide]').uncheck();
      await page.locator('#pause [data-setting=grenadeWarning]').uncheck();
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cartridge-settings')));
      assert.equal(saved.grenadeGuide,false);assert.equal(saved.grenadeWarning,false);
      await page.locator('#resume').click();
      await page.evaluate(()=>{const g=__fps.game;g.player.inventory.he=1;g.select('he');__fps.step(null,.1);});
      assert.equal(await page.locator('#grenade-preview-note').isVisible(),false);assert.equal(await page.locator('#grenade-danger').isVisible(),false);
      assert.equal(await page.locator('#fatal').isVisible(),false);assert.deepEqual(errors,[]);
      console.log(`GRENADE ${mobile?'MOBILE':'DESKTOP'} PASS: visible depth-tested guide, real throw endpoint ${difference}, ammo, hazard direction, pause, persistent opt-out`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
