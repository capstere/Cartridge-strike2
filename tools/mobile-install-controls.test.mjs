import assert from 'node:assert/strict';
import test from 'node:test';

for (const [title,secure,standalone,canInstall] of [
  ['standalone launch',true,true,false],['insecure LAN',false,false,false],['supported browser',true,false,true]
])test(title+' offers only a usable install action and retains worker updates',async t=>{
  const globals=['window','navigator','matchMedia','document'];
  const originals=Object.fromEntries(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [k,desc] of Object.entries(originals)){if(desc)Object.defineProperty(globalThis,k,desc);else delete globalThis[k];}});
  let registrations=0;
  for(const [key,value] of Object.entries({window:Object.assign(new EventTarget(),{isSecureContext:secure}),matchMedia:()=>({matches:standalone}),
    navigator:{serviceWorker:{register:async()=>{registrations++;}}},document:Object.assign(new EventTarget(),{readyState:'complete',querySelectorAll:()=>[]})}))
    Object.defineProperty(globalThis,key,{configurable:true,value});
  const {canOfferInstall,installAppControls}=await import('../ui/cs-install.mjs?case='+encodeURIComponent(title));
  assert.equal(canOfferInstall(),canInstall);installAppControls();assert.equal(registrations,secure?1:0);
  if(canInstall){window.dispatchEvent(new Event('appinstalled'));assert.equal(canOfferInstall(),false);}
});
