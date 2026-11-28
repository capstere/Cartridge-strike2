import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';

const code=readFileSync(new URL('../fps/sw.js',import.meta.url),'utf8');
function worker(scope,respond,cacheOverrides={}){
  let claimed=false;
  const events={},stores=new Map(),reads=[],requestOptions=[];
  const cache=name=>{
    if(!stores.has(name)) stores.set(name,new Map());
    return stores.get(name);
  };
  const urlOf=req=>typeof req==='string'?req:req.url;
  vm.runInNewContext(code,{URL,Request,Response,self:{registration:{scope},addEventListener:(name,fn)=>{events[name]=fn;},clients:{claim:async()=>{claimed=true;}}},
    caches:{open:async name=>({put:async(req,response)=>cache(name).set(urlOf(req),response)}),
      keys:async()=>[...stores.keys()],delete:async name=>stores.delete(name),
      match:async(url,{cacheName})=>stores.get(cacheName)?.get(url)?.clone(),...cacheOverrides},
    fetch:async(req,options)=>{reads.push(req);requestOptions.push(options);return respond(req);}});
  const lifecycle=async name=>{let awaitable;events[name]({waitUntil:p=>{awaitable=p;}});await awaitable;};
  const navigation=(path,mode='navigate',method='GET')=>{
    let promise;events.fetch({request:{url:new URL(path,scope).href,mode,method},respondWith:p=>{promise=p;}});return promise;
  };
  return {stores,reads,requestOptions,lifecycle,navigation,get claimed(){return claimed;}};
}
const offline=()=>{throw Error('Network disconnected');};
for(const path of ['/fps/','/Cartridge-strike2/fps/']){
  test('public offline shell and live-only private requests at '+path,async()=>{
    const scope='https://example.test'+path;
    let connected=true;
    const w=worker(scope,req=>{
      if(!connected)return offline();
      const page=new Response('public offline page',{headers:{'Content-Type':'text/html'}});
      Object.defineProperty(page,'url',{value:req.url});return page;
    });
    await w.lifecycle('install');await w.lifecycle('activate');connected=false;
    assert.equal(w.reads[0].credentials,'omit');
    assert.equal(await (await w.navigation('./')).text(),'public offline page');
    assert.equal(await (await w.navigation('index.html')).text(),'public offline page');
    assert.equal(w.requestOptions.at(-1).cache,'no-store');
    for(const url of ['?room=ABCD','?network=internet','account.html','../api/session','../room/private','icon-192.png'])assert.equal(w.navigation(url),undefined);
    assert.equal(w.navigation('./','cors'),undefined);assert.equal(w.navigation('./','navigate','POST'),undefined);
  });
}
test('a protected pilot can install, retain its auth response and recover offline without caching private content',async()=>{
  for (const variant of ['auth','redirect','private']){
    let online=true;
    const w=worker('https://example.test/fps/',req=>{
      if(!online)return offline();
      if(req.credentials==='omit'&&variant==='redirect')throw TypeError('redirect refused');
      const privatePage=variant==='private'&&req.credentials==='omit';
      const response=new Response('proprietary',{status:privatePage?200:401,headers:{'Cache-Control':'private, no-store','Content-Type':'text/html'}});
      Object.defineProperty(response,'url',{value:req.url});return response;
    });
    await w.lifecycle('install');await w.lifecycle('activate');
    assert.equal(w.stores.size,0);assert.equal((await w.navigation('./')).status,401);
    online=false;const r=await w.navigation('./');assert.equal(r.status,503);
    assert.match(await r.text(),/You are offline/);assert.equal(w.stores.size,0);
  }
});
test('activation cleans only prior versions under the exact app scope',async()=>{
  const a=worker('https://example.test/games/fps/',offline);
  for(const n of ['cs3-install:/games/fps/:0','cs3-install:/other/fps/:0','unrelated-cache'])a.stores.set(n,new Map());
  await a.lifecycle('install');await a.lifecycle('activate');
  assert.deepEqual([...a.stores.keys()],['cs3-install:/other/fps/:0','unrelated-cache']);
});

test('a browser denying cache storage claims the installed game and serves its embedded offline page',async()=>{
  const denied=async()=>{throw new DOMException('Storage unavailable','SecurityError');};
  const w=worker('https://example.test/games/fps/',offline,{keys:denied,match:denied});
  await w.lifecycle('install');
  await w.lifecycle('activate');
  assert.equal(w.claimed,true);
  const page=await w.navigation('./');
  assert.equal(page.status,503);
  assert.equal(page.headers.get('cache-control'),'no-store');
  assert.match(await page.text(),/You are offline/);
  assert.equal(w.navigation('?room=ABCD'),undefined);
});
