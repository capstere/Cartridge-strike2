// Check installed scope, public cache and failed-navigation behavior in a real browser.
// The optional origin may include a Pages-style repository prefix.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {join} from 'node:path';
import http from 'node:http';
import https from 'node:https';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const source=new URL(process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765');
let reachable=true;
const gateway=http.createServer((req,res)=>{
  if (!reachable){req.socket.destroy();return;}
  const transport=source.protocol==='https:'?https:http;
  const upstream=transport.request(new URL(req.url,source.origin),{method:req.method,headers:{...req.headers,host:source.host}},reply=>{
    res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
  });
  upstream.on('error',()=>res.destroy());req.pipe(upstream);
  res.on('close',()=>upstream.destroy());
});
await new Promise(resolve=>gateway.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+gateway.address().port+source.pathname.replace(/\/$/,'');
const native=process.env.CHROMIUM_PATH;
const output=process.env.CS3_MOBILE_EVIDENCE;
const browser=await chromium.launch({executablePath:native,channel:native?undefined:'chromium',headless:process.env.FPS_NETWORK_HEADED!=='1',
  args:native?['--ozone-platform=wayland','--use-angle=gl-egl','--disable-dev-shm-usage']:['--enable-unsafe-swiftshader']});
try{
 const phase=label=>console.log(new Date().toISOString(),label);
 const ctx=await browser.newContext({viewport:{width:844,height:390},isMobile:true,hasTouch:true,reducedMotion:'reduce'});
 const page=await ctx.newPage();page.setDefaultTimeout(90000);
 phase('Opening game shell');await page.goto(origin+'/fps/',{waitUntil:'domcontentloaded'});
 await page.waitForFunction(()=>!!navigator.serviceWorker.controller);
 phase('Worker controls the page; reading scope, manifest, public cache and updating');
 const receipt=await page.evaluate(async()=>{
   const registration=await navigator.serviceWorker.ready,manifestURL=document.querySelector('link[rel=manifest]').href;
   const manifest=await (await fetch(manifestURL)).json(),scope=registration.scope;
   const cached=await Promise.all((await caches.keys()).filter(k=>k.startsWith('cs3-install:')).map(async k=>(await(await caches.open(k)).keys()).map(r=>r.url)));
   await registration.update();
   return {scope,start:new URL(manifest.start_url,manifestURL).href,worker:registration.active.scriptURL,
     iconSizes:manifest.icons.map(icon=>icon.sizes),cached:cached.flat(),language:manifest.lang,active:registration.active.state};
 });
 assert.equal(receipt.scope,origin+'/fps/');assert.equal(receipt.start,receipt.scope);assert.equal(receipt.worker,origin+'/fps/sw.js');
 assert.deepEqual(receipt.iconSizes,['192x192','512x512']);assert.equal(receipt.language,'en');
 assert(receipt.cached.every(url=>url===origin+'/fps/offline.html'));assert.equal(receipt.active,'activated');
 phase('Disconnecting worker and page from origin');
 reachable=false;gateway.closeAllConnections();
 await ctx.setOffline(true);const offlineResponse=await page.goto(origin+'/fps/index.html',{waitUntil:'domcontentloaded'});
 console.log('Offline navigation',offlineResponse.status(),await page.title(),await page.locator('h1').first().innerText({timeout:5000}));
 await page.getByRole('heading',{name:/offline/i}).waitFor();receipt.offline=await page.locator('main').innerText();
 phase('Checking offline invitation bypass');let privateBypassed=false;
 try{await page.goto(origin+'/fps/?network=internet&room=TEST',{waitUntil:'domcontentloaded',timeout:10000});}
 catch{privateBypassed=true;}
 assert(privateBypassed,'An invitation must not receive the cached shell.');
 phase('Restoring online shell');reachable=true;await ctx.setOffline(false);await page.goto(origin+'/fps/',{waitUntil:'domcontentloaded'});await page.locator('#home-title').waitFor();
 receipt.recovered=true;receipt.privateBypassed=privateBypassed;
 if(output){await mkdir(output,{recursive:true});await writeFile(join(output,'install-scope.json'),JSON.stringify(receipt,null,2)+'\n');}
 console.log(JSON.stringify(receipt));await ctx.close();
}finally{await browser.close();gateway.closeAllConnections();await new Promise(resolve=>gateway.close(resolve));}
