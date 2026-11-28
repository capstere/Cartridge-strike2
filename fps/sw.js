// The browser always fetches the live build, room and account. Only a clean
// shell navigation that fails to reach the network can use the public offline page.
const scope=new URL(self.registration.scope);
const prefix='cs3-install:'+scope.pathname+':';
const cacheName=prefix+'1';
const offline=new URL('offline.html',scope).href;
const fallback='<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline · Cartridge-Strike 3</title><main><h1>You are offline</h1><p>Reconnect to open Cartridge-Strike 3. Your local characters and controls stay on this device.</p><a href="./">Try again</a></main></html>';

self.addEventListener('install',event=>event.waitUntil((async()=>{
  // Public deployments can supply the branded offline page. Authenticated
  // deployments retain the embedded fallback, without persisting a private response.
  try {
    const request=new Request(offline,{credentials:'omit',cache:'no-store',redirect:'error'});
    const response=await fetch(request);
    const directives=response.headers.get('cache-control')||'';
    if (response.ok && response.url===offline && response.headers.get('content-type')?.startsWith('text/html')
        && !/\b(?:private|no-store)\b/i.test(directives)) {
      const cache=await caches.open(cacheName);
      await cache.put(request,response);
    }
  } catch { /* No public cache is required for installation. */ }
})()));
self.addEventListener('activate',event=>event.waitUntil((async()=>{
  for (const name of await caches.keys()) if (name.startsWith(prefix)&&name!==cacheName)await caches.delete(name);
  await self.clients.claim();
})()));
self.addEventListener('fetch',event=>{
  const req=event.request;
  if (req.method!=='GET' || req.mode!=='navigate')return;
  const url=new URL(req.url);
  if (url.search || url.hash || (url.href!==scope.href && url.href!==new URL('index.html',scope).href))return;
  event.respondWith(fetch(req).catch(async()=>{
    const cached=await caches.match(offline,{cacheName});
    return cached||new Response(fallback,{status:503,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store'}});
  }));
});
