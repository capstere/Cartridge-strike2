#!/usr/bin/env node
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {chromium} = require(path.join(__dirname, '../frontline/source/tools/dev/node_modules/playwright-core'));
const origin = process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
const args = ['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist'];

async function gallery(browser) {
  const context = await browser.newContext({viewport:{width:1200,height:760},deviceScaleFactor:1});
  const page = await context.newPage();
  await page.goto(origin+'/credits.html', {waitUntil:'domcontentloaded'});
  await page.setContent(`<html><head><script type="importmap">{"imports":{"three":"${origin}/vendor/three/three.module.js"}}</script><style>body{margin:0;background:#17252e;color:#e8f1f1;font-family:Arial,sans-serif}h1{position:absolute;left:40px;top:20px;font-size:25px;letter-spacing:3px}p{position:absolute;left:40px;bottom:16px;color:#acbfca;font-size:15px}canvas{display:block}</style></head><body><h1>CARTRIDGE STRIKE / THROWABLES</h1><p>HE · FLASH · SMOKE — original fictional game models</p><canvas id="gallery"></canvas></body></html>`);
  await page.evaluate(async base => {
    const T = await import(base+'/vendor/three/three.module.js');
    const {createThrowableCartridge} = await import(base+'/src/fps/throwable-cartridge.mjs');
    const r = new T.WebGLRenderer({canvas:document.getElementById('gallery'),antialias:true,preserveDrawingBuffer:true});
    r.setSize(1200,760);r.outputColorSpace=T.SRGBColorSpace;r.toneMapping=T.ACESFilmicToneMapping;
    const scene = new T.Scene();scene.background=new T.Color(0x17252e);
    scene.add(new T.HemisphereLight(0xe3f4ff,0x394956,2.3));
    const key=new T.DirectionalLight(0xffffff,3);key.position.set(-.3,.7,.8);scene.add(key);
    const rim=new T.DirectionalLight(0x92c3ff,2);rim.position.set(.5,.3,-.4);scene.add(rim);
    const floor=new T.Mesh(new T.PlaneGeometry(3,3),new T.MeshStandardMaterial({color:0x233743,roughness:.95}));floor.rotation.x=-Math.PI/2;floor.position.y=-.002;scene.add(floor);
    ['he','flash','smoke'].forEach((type,i)=>{const m=createThrowableCartridge(type);m.position.x=(i-1)*.23;m.rotation.y=-.26+(i===2?1.05:0);scene.add(m);});
    const c=new T.PerspectiveCamera(35,1200/760,.01,10);c.position.set(.12,.34,.86);c.lookAt(0,.10,0);
    r.render(scene,c);r.getContext().finish();
  },origin);
  await page.screenshot({path:'test-results/cartridge-family.png',timeout:60000});
  await context.close();
}
async function boot(browser,mobile){
  const context=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:1});
  const page=await context.newPage(),errors=[];
  page.on('pageerror',e=>errors.push(String(e)));
  await page.addInitScript(()=>{
    localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',hudMode:'clean'}));
    HTMLElement.prototype.requestFullscreen=()=>Promise.resolve();
    HTMLCanvasElement.prototype.requestPointerLock=function(){Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>this});return Promise.resolve();};
    document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,get:()=>null});
  });
  await page.goto(origin+'/fps/?test',{waitUntil:'domcontentloaded',timeout:60000});
  await page.waitForFunction(()=>globalThis.__fps||!document.getElementById('fatal').hidden,null,{timeout:180000});
  assert.equal(await page.locator('#fatal').isVisible(),false);
  await page.evaluate(()=>{window.requestAnimationFrame=()=>0;});
  await page.locator('#start').click();
  await page.evaluate(()=>{
    __fps.start('analysts',{mode:'endless',firefight:false,wanderers:false,botFire:false,friendlyFire:false,loadout:'smg'});
    for(const a of __fps.game.actors)if(!a.isPlayer){a.alive=false;a.bot=null;}
  });
  return {context,page,errors};
}
(async()=>{
  const browser=await chromium.launch({headless:true,args});
  fs.mkdirSync('test-results',{recursive:true});
  try{
    await gallery(browser);
    for(const mobile of [true,false]){
      const {context,page,errors}=await boot(browser,mobile);
      const cdp=mobile?await context.newCDPSession(page):null;
      for(const type of ['he','flash','smoke']){
        const held=await page.evaluate(type=>{
          const g=__fps.game,p=g.player;g.state.grenades=[];g.state.smokes=[];
          g.select('smg');p.inventory[type]=1;g.select(type);
          for(let i=0;i<6;i++)__fps.step(null,.1);
          const m=__fps.renderer.weaponModel.getObjectByName('cartridge-'+type);
          window.__heldCartridge=m;window.__assetDisposals=0;
          if(m)m.children[0].geometry.addEventListener('dispose',()=>window.__assetDisposals++);
          return {id:m?.userData.visualModel,type:m?.userData.type,batches:m?.children.length,
            meshes:m?.children.every(o=>o.material?.userData.sharedThrowableCartridge),ammo:p.inventory[type],
            guide:__fps.grenadeAssist.group.visible,hand:__fps.renderer.weaponModel.visible};
        },type);
        assert.equal(held.id,'throwable-cartridge-v1');assert.equal(held.type,type);
        assert.equal(held.batches,5);assert.equal(held.meshes,true);assert.equal(held.ammo,1);
        assert.equal(held.guide,true,'Existing trajectory must still work');assert.equal(held.hand,true);
        await page.screenshot({path:`test-results/cartridge-${type}-${mobile?'mobile':'desktop'}.png`,timeout:60000,animations:'disabled'});
        if(mobile){
          const trigger=page.locator('[data-mobile-action=fire]');assert.equal(await trigger.isVisible(),true);
          const b=await trigger.boundingBox();
          await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:b.x+b.width/2,y:b.y+b.height/2,id:1}]});
        }else await page.mouse.down({button:'left'});
        await page.evaluate(()=>__fps.step(null,1/60));
        if(mobile)await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
        else await page.mouse.up({button:'left'});
        const result=await page.evaluate(type=>{
          const g=__fps.game,thrown=g.state.grenades.find(x=>x.type===type);
          const model=thrown&&__fps.renderer.grenades.get(thrown.id);
          const held=window.__heldCartridge;
          return {ammo:g.player.inventory[type],count:g.state.grenades.length,kind:model?.userData.type,
            id:model?.userData.visualModel,sameGeometry:held?.children[0].geometry===model?.children[0].children[0].geometry,
            sameMaterial:held?.children[0].material===model?.children[0].children[0].material};
        },type);
        assert.equal(result.ammo,0,'Real input throws exactly one Cartridge');assert.equal(result.count,1);
        assert.equal(result.kind,type);assert.equal(result.id,'throwable-cartridge-v1');
        assert.equal(result.sameGeometry,true);assert.equal(result.sameMaterial,true);
        const cleanup=await page.evaluate(()=>{
          __fps.game.state.grenades=[];__fps.render();
          return {remaining:__fps.renderer.grenades.size,disposed:window.__assetDisposals};
        });
        assert.equal(cleanup.remaining,0);assert.equal(cleanup.disposed,0,'Expired throw must not destroy the held model');
      }
      assert.equal(await page.locator('#fatal').isVisible(),false);
      assert.equal(errors.length,0,errors.join('\n'));
      console.log(`CARTRIDGE ${mobile?'MOBILE':'DESKTOP'} PASS: all three hand models, actual throws, five batches, shared assets, preview and expiry cleanup`);
      await context.close();
    }
  }finally{await browser.close();}
})().catch(e=>{console.error(e.stack||e);process.exitCode=1;});
