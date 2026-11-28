// Serve two real, public exports at one loopback origin. Chromium owns the HTTP cache.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {createReadStream} from 'node:fs';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {createServer} from 'node:http';
import {extname,resolve,join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const [oldRoot,currentRoot,output] = process.argv.slice(2);
assert(oldRoot && currentRoot && output,'Pass the exported CS2 site, the exported CS3 site and a new output directory.');
await mkdir(output,{recursive:true});
const hash = bytes=>createHash('sha256').update(bytes).digest('hex');
const legacyHTML='4330aeae56695692dd5f84b7ef9d751f451e695c04c80668a7a7797a96e09a55';
const contentTypes = {'.html':'text/html','.mjs':'text/javascript','.js':'text/javascript','.json':'application/json',
  '.css':'text/css','.webmanifest':'application/manifest+json','.mp3':'audio/mpeg','.woff2':'font/woff2',
  '.webp':'image/webp','.jpg':'image/jpeg','.png':'image/png','.svg':'image/svg+xml','.glb':'model/gltf-binary'};
async function site(root) {
  const dir=resolve(root),manifest=JSON.parse(await readFile(join(dir,'build-info.json'),'utf8'));
  const files=new Map(manifest.files.map(entry=>[entry.path,entry]));
  const html=hash(await readFile(join(dir,'fps/index.html')));
  const build=await readFile(join(dir,'shared/multiplayer/build.mjs'),'utf8');
  return {dir,html,files,build:JSON.parse(build.match(/"buildHash":\s*("[a-f0-9]{64}")/)[1])};
}
const old=await site(oldRoot),current=await site(currentRoot);
assert.equal(old.html,legacyHTML,'Use the actual CS2 8307e911 HTML');
let served=old;
const server = createServer((req,res)=>{
  const url=new URL(req.url,'http://localhost');
  const route=decodeURIComponent(url.pathname).replace(/^\//,'');
  const key=route===''?'index.html':route.endsWith('/')?route+'index.html':route;
  const info=served.files.get(key);
  if(!info){res.writeHead(404,{'Cache-Control':'no-store'});return res.end();}
  const tag='"'+info.sha256+'"';
  const headers={'Cache-Control':'public, max-age=600','ETag':tag,'Content-Type':contentTypes[extname(key)]||'application/octet-stream',
    'X-Test-Source':served===old?'CS2':'CS3'};
  if(req.headers['if-none-match']===tag){res.writeHead(304,headers);return res.end();}
  res.writeHead(200,{...headers,'Content-Length':info.bytes});createReadStream(join(served.dir,key)).pipe(res);
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
const origin='http://127.0.0.1:'+server.address().port;
const native=process.env.CHROMIUM_PATH;
const headed=process.env.FPS_NETWORK_HEADED==='1';
const angle=process.env.FPS_NETWORK_ANGLE || (process.platform==='darwin'?'metal':headed?'gl-egl':'swiftshader');
const args=['--use-angle='+angle,'--disable-dev-shm-usage','--disable-background-timer-throttling'];
if(process.platform==='linux'&&headed)args.push('--ozone-platform=wayland');
if(angle==='swiftshader')args.push('--enable-unsafe-swiftshader');
const browser=await chromium.launch({headless:!headed,executablePath:native,channel:native?undefined:'chromium',args});
const report={oldBuild:old.build,oldHTML:old.html,candidateBuild:current.build,candidateHTML:current.html,
  started:new Date().toISOString(),browser:browser.version(),platform:process.platform,angle,headed,cache:'public, max-age=600',samples:[]};
const openContext=(locale='sv-SE')=>browser.newContext({viewport:{width:932,height:430},hasTouch:true,isMobile:true,locale,deviceScaleFactor:1});
async function openPage(context,label,path,verify,forceHTML,reload=false) {
  const page=await context.newPage(),trace=[],errors=[];
  page.setDefaultTimeout(60000);
  const debug=await context.newCDPSession(page);
  await debug.send('Network.enable');
  debug.on('Network.responseReceived',({type,response})=>{
    const url=new URL(response.url);
    if(url.origin!==origin||!['Document','Script','Stylesheet'].includes(type))return;
    const owner=response.headers['X-Test-Source']||response.headers['x-test-source'];
    trace.push({path:url.pathname+url.search,type,servedBy:owner,fromDiskCache:response.fromDiskCache===true});
  });
  page.on('pageerror',e=>errors.push(e.message));
  const sample={label,trace,errors};report.samples.push(sample);
  try {
    await page.goto(origin+path,{waitUntil:'domcontentloaded'});
    if(reload){
      sample.initialLanguage=await page.locator('html').getAttribute('lang');
      await page.reload({waitUntil:'domcontentloaded'});
      // Ignore resources requested by the pre-reload document for this post-reload check.
      trace.splice(0,trace.findLastIndex(row=>row.type==='Document'));
    }
    sample.language=await page.locator('html').getAttribute('lang');
    if(forceHTML)assert.equal(sample.language,'en','This scenario requires fresh CS3 HTML');
    if(verify==='old'){
      assert.equal(sample.language,'sv');
      await page.waitForFunction(()=>window.__csFlow && document.querySelector('#loading')?.hidden,null,{timeout:120000});
      // A real saved graphics preference goes through the same storage key on both versions.
      await page.evaluate(()=>{
        const key='cartridge-settings',data=JSON.parse(localStorage.getItem(key)||'{}');
        data.graphics='low';data.volume=.35;localStorage.setItem(key,JSON.stringify(data));
      });
    }else if(verify==='deploy'){
      await page.waitForFunction(()=>!!window.__csFlow||document.querySelector('#fatal:not([hidden])'),null,{timeout:120000});
      sample.readyModule=await page.locator('#csl-ready').count()===1;
      const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('cartridge-settings')||'{}'));
      sample.savedGraphics=saved.graphics;sample.savedVolume=saved.volume;
      if(!sample.readyModule){sample.outcome='BLOCKED · CS3 deployment selector absent';return;}
      await page.getByRole('button',{name:'Play',exact:true}).first().tap();
      await page.locator('[data-go=solo]:visible').first().tap();
      await page.locator('#lb-mode-seg [data-value=endless]').tap();
      await page.locator('#start').tap();await page.locator('#csl-choice').selectOption('scout',{timeout:120000});
      assert(await page.locator('#hud').isHidden());
      await page.locator('#csl-deploy').tap();
      await page.waitForFunction(()=>/scout rifle/i.test(document.getElementById('weapon-name').textContent)&&!document.getElementById('hud').hidden,null,{timeout:120000});
      sample.deployed=await page.locator('#weapon-name').innerText();
      sample.cacheStorage=await page.evaluate(async()=>{
        const urls=[];for(const key of await caches.keys()){const cache=await caches.open(key);for(const r of await cache.keys())urls.push(new URL(r.url).pathname);}
        return urls;
      });
      assert(sample.cacheStorage.every(url=>url.endsWith('/fps/offline.html')));
      assert.deepEqual(errors,[]);
    }
    sample.outcome='PASS';
  } catch(error) {
    sample.outcome='FAIL';sample.reason=error.message.split('\n')[0];
  } finally {
    // Retain representative bytes from each version; omit per-run server paths, session data and bodies.
    sample.changedLegacyResponses=trace.filter(row=>{
      const path=row.path.split('?')[0].slice(1);
      return row.type!=='Document'&&row.servedBy==='CS2'&&old.files.get(path)?.sha256!==current.files.get(path)?.sha256;
    }).map(row=>row.path);
    sample.received={cs2:trace.filter(row=>row.servedBy==='CS2').length,cs3:trace.filter(row=>row.servedBy==='CS3').length};
    const core = /\/(?:fps\/(?:index\.html)?(?:\?|$)|src\/fps\/(?:app|match-flow|menu-navigation)\.mjs|fps\/(?:match-loading|routes)\.css)/;
    sample.trace=trace.filter(row=>core.test(row.path));
    await page.close();
  }
}
try{
  const warm=await openContext();
  await openPage(warm,'original with ordinary callbacks','/fps/','old',false);
  served=current;
  await openPage(warm,'same navigation URL after cutover','/fps/','identity',false);
  // A unique document URL guarantees new HTML; all of its dependency URLs retain normal HTTP reuse.
  await openPage(warm,'new HTML with warm CS2 subresources','/fps/?migration-probe=1','deploy',true);
  await openPage(warm,'ordinary reload with saved CS2 settings','/fps/','deploy',true,true);
  await warm.close();
  const cold=await openContext('fr-FR');
  await openPage(cold,'new HTML in a fresh browser cache','/fps/?migration-probe=1','deploy',true);
  await cold.close();
  const [legacy,,mixed,reloaded,control]=report.samples;
  assert.equal(legacy.outcome,'PASS');assert.equal(control.outcome,'PASS','cold control must deploy');
  assert.notEqual(control.savedVolume,.35,'The clean control must distinguish the legacy volume preference');
  report.migrationPass=[mixed,reloaded].every(sample=>sample.outcome==='PASS' && sample.savedGraphics==='low' && sample.savedVolume===.35 &&
    sample.deployed==='SCOUT RIFLE' && sample.changedLegacyResponses.length===0);
  if(!report.migrationPass)process.exitCode=1;
} finally{
  report.finished=new Date().toISOString();
  await writeFile(join(output,'cache-migration.json'),JSON.stringify(report,null,2)+'\n');
  await browser.close();server.closeAllConnections();await new Promise(resolve=>server.close(resolve));
}
