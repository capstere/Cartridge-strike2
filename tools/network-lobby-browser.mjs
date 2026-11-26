// Static network lobby pixels, resize, quality and actual WebGL restoration.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
const angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const local=await createLocalServer({testMatch:{continuous:true},port:0}),browser=await chromium.launch({channel:'chromium',args:['--use-angle='+angle]}),errors=[];
fs.mkdirSync('test-results/network',{recursive:true});
try {
 const page=await browser.newPage({viewport:{width:1280,height:720}});
 page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(120000);
 await page.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0})));
 const levelRequests=[];
 page.on('request',request=>{if(/\/levels\/(?!manifest\.json)[^/?]+\.json$/.test(new URL(request.url()).pathname))levelRequests.push(new URL(request.url()).pathname);});
 await page.goto(local.url+'/fps/?network=local&test&realtime');
 await page.locator('#network-map').waitFor();
 await page.waitForFunction(()=>!!window.__fps);
 await page.waitForTimeout(2000);
 const initial=await page.evaluate(()=>({world:!!__fps.world,renderer:!!__fps.renderer,draws:__fps.renderBudget.stats.rendered}));
 assert.deepEqual(initial,{world:false,renderer:false,draws:0});
 assert.deepEqual(levelRequests,[],'room selection must precede LevelProject download');
 await page.locator('#network-code').fill('lobby-render');
 await page.locator('#network-fill-bots').uncheck();
 await page.locator('[data-create="true"]').click();
 await page.waitForFunction(()=>__fps.network?.view.player?.alive&&__fps.renderBudget.stats.active>0&&__fps.renderer?.stats.drawCalls>0);
 assert.deepEqual(levelRequests,['/levels/floor5-prepared.json']);
 await page.keyboard.press('Escape');await page.locator('#restart').click();
 await page.waitForFunction(()=>!__fps.network&&__fps.modal==='menu'&&__fps.renderBudget.stillOwner===__fps.game);

 // Raise only the existing world canvas for pixel comparison; no scene/camera
 // or render method changes. Restore its CSS before any form interaction.
 const style=await page.addStyleTag({content:'#game{z-index:2147483647!important;opacity:1!important}'});
 const frames=await page.evaluate(()=>__fps.renderBudget.stats.rendered);
 const first=await page.screenshot();await page.waitForTimeout(2000);const second=await page.screenshot();
 const idleFrames=await page.evaluate(start=>__fps.renderBudget.stats.rendered-start,frames);
 if(process.env.FPS_LOBBY_BASELINE==='1')assert(idleFrames>0);else assert.equal(idleFrames,0);assert(first.equals(second),'composited world pixels remain unchanged without redraws');
 fs.writeFileSync('test-results/network/static-lobby.png',first);
 await page.setViewportSize({width:1000,height:600});
 await page.waitForFunction(start=>__fps.renderBudget.stats.rendered>start,frames);
 const resized=await page.evaluate(()=>({width:document.querySelector('#game').width,height:document.querySelector('#game').height,frames:__fps.renderBudget.stats.rendered}));
 assert.equal(resized.width,850);assert.equal(resized.height,510);
 await page.evaluate(()=>{__fps.settings.graphics='standard';});
 await page.waitForFunction(start=>__fps.renderBudget.stats.rendered>start,resized.frames);
 const graphics=await page.evaluate(()=>({quality:__fps.renderer.quality,frames:__fps.renderBudget.stats.rendered}));
 assert.equal(graphics.quality,'standard');
 await page.evaluate(()=>{window.__contextLost=false;document.querySelector('#game').addEventListener('webglcontextlost',()=>window.__contextLost=true,{once:true});window.__contextExtension=__fps.renderer.renderer.getContext().getExtension('WEBGL_lose_context');__contextExtension.loseContext();});
 await page.waitForFunction(()=>window.__contextLost);await page.waitForTimeout(250);
 await page.evaluate(()=>__contextExtension.restoreContext());
 await page.waitForFunction(start=>__fps.renderBudget.stats.rendered>start,graphics.frames);
 await page.waitForTimeout(250);
 const restored=await page.evaluate(()=>({lost:__fps.renderer.renderer.getContext().isContextLost(),draws:__fps.renderer.stats.drawCalls,fatal:!document.querySelector('#fatal').hidden}));
 assert(!restored.lost&&!restored.fatal);assert(restored.draws>0);assert.deepEqual(errors,[]);
 await style.evaluate(e=>e.remove());
 const result={harnessSha256:createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex'),runtimeManifestSha256:createHash('sha256').update(fs.readFileSync(new URL('../build-info.json',import.meta.url))).digest('hex'),status:'PASS',environment:{browser:browser.version(),platform:process.platform,arch:process.arch,angle,deviceScaleFactor:1},initial,levelRequests,windowMs:2000,idleFrames,pixelEqual:true,canvasPngSha256:createHash('sha256').update(first).digest('hex'),resized,graphics,restored,errors};
 fs.writeFileSync('test-results/network/static-lobby.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await local.close();}
