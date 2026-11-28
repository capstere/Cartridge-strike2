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

test('one lobby pad loop hands button history to the game and resumes only while the lobby owns it',async t=>{
  const globals=['window','document','navigator','requestAnimationFrame','cancelAnimationFrame'];
  const originals=Object.fromEntries(globals.map(k=>[k,Object.getOwnPropertyDescriptor(globalThis,k)]));
  t.after(()=>{for(const [key,desc] of Object.entries(originals)){if(desc)Object.defineProperty(globalThis,key,desc);else delete globalThis[key];}});
  let id=0,reads=0;
  const queue=new Map(),win=new EventTarget();
  for(const [key,value] of Object.entries({window:win,document:{hidden:false,querySelector:()=>null,getElementById:()=>null},
    navigator:{getGamepads(){reads++;return[];}},requestAnimationFrame:fn=>{queue.set(++id,fn);return id;},cancelAnimationFrame:token=>queue.delete(token)})){
    Object.defineProperty(globalThis,key,{configurable:true,value});
  }
  const {claimControllerForGame,installLobbyController}=await import('../src/fps/gamepad-controls.mjs?lobby-ownership');
  installLobbyController();installLobbyController();assert.equal(queue.size,1);
  const [token,poll]=[...queue][0];queue.delete(token);poll();assert.equal(reads,1);assert.equal(queue.size,1);
  win.dispatchEvent(new Event('pagehide'));assert.equal(queue.size,0);
  win.dispatchEvent(new Event('pageshow'));assert.equal(queue.size,1);
  claimControllerForGame();assert.equal(queue.size,0);
  win.dispatchEvent(new Event('pageshow'));installLobbyController();assert.equal(queue.size,0);
});
