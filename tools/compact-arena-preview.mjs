// Photograph the published LevelProject with the game renderer.
// Serve the checkout (python3 -m http.server 8765 --bind 127.0.0.1) first.
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN || 'http://127.0.0.1:8765';
assert(['127.0.0.1','localhost','[::1]'].includes(new URL(origin).hostname));
const out=process.env.FPS_MAP_PREVIEW || 'assets/fps/maps/compact-arena.jpg';
const angle=process.env.FPS_NETWORK_ANGLE || (process.platform==='darwin'?'metal':'swiftshader');
const browser=await chromium.launch({headless:process.env.FPS_NETWORK_HEADED!=='1',executablePath:process.env.CHROMIUM_PATH,
  args:['--use-angle='+angle,'--enable-unsafe-swiftshader','--ignore-gpu-blocklist',...(process.env.WAYLAND_DISPLAY?['--ozone-platform=wayland']:[])]});
try {
  const page=await browser.newPage({viewport:{width:960,height:540},deviceScaleFactor:1});
  await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0})));
  await page.goto(origin+'/levels/compact-arena.json');
  await page.evaluate(async()=>{
    const response=await fetch('/levels/compact-arena.json');
    if(!response.ok)throw Error('Missing arena');
    localStorage.setItem('cartridge-level-preview',await response.text());
  });
  await page.goto(origin+'/fps/?test&level=preview',{waitUntil:'domcontentloaded'});
  await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:90000});
  assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
  await page.addStyleTag({content:'#game{z-index:2147483647!important;opacity:1!important}'});
  const view=await page.evaluate(()=>{
    const {renderer:r,world,game}=window.__fps;
    if(world.project.projectId!=='lvl-compact-arena')throw Error('Unexpected level');
    window.__fps.stopFrameLoop();
    const actor={x:11.3,z:8,y:0,height:1.76,yaw:-1.76,pitch:-.04,radius:.32};
    if(!world.canOccupy(actor.x,actor.z,actor.radius,actor.height,0))throw Error('Camera inside solids');
    r.viewScene.visible=false;
    r.render(game,actor,1/60);
    return {name:world.project.name,draws:r.stats.drawCalls,camera:[actor.x,actor.height-.12,actor.z,actor.yaw,actor.pitch]};
  });
  assert(view.draws>0);
  await mkdir(dirname(out),{recursive:true}); await page.screenshot({path:out,quality:88});
  console.log(JSON.stringify({...view,out}));
} finally {await browser.close();}
