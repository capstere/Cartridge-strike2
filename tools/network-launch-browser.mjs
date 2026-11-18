// Normal launch smoke: no ?test query and no __fps controls/state hooks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createTestServer} from './network-test-server.mjs';
import {createTestPeer} from './network-test-peer.mjs';
import {testLanHost} from './network-lan-host.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const headed=process.env.FPS_NETWORK_HEADED==='1';
const protocolPeer=process.env.FPS_LAN_PROTOCOL_PEER==='1';let peer;
const angle=process.env.FPS_NETWORK_ANGLE||(process.platform==='darwin'?'metal':'swiftshader');
const local=await createTestServer({port:0,...(process.env.FPS_NETWORK_LAN==='1'?{lan:true,host:testLanHost()}:{})}),browsers=[],pages=[],errors=[];
async function until(predicate,label,timeout=10000){const end=performance.now()+timeout;while(!predicate()){assert(performance.now()<end,label);await new Promise(r=>setTimeout(r,25));}}
async function open(mobile){
 // Each human has its own browser/GPU process, as in the full Floor 5 harness.
 // Two software scenes in one GPU process can stall focus/gesture delivery.
 const browser=await chromium.launch({channel:'chromium',headless:!headed,args:['--use-angle='+angle,'--disable-background-timer-throttling','--disable-renderer-backgrounding','--disable-backgrounding-occluded-windows']});browsers.push(browser);
 const c=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||1)}),p=await c.newPage();
 pages.push(p);
 p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>{localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0}));window.__launchEvents=[];
  for(const type of ['pointerlockchange','pointerlockerror','fullscreenchange','focus','blur'])window.addEventListener(type,e=>__launchEvents.push({type,target:e.target===window?'window':e.target.nodeName,at:performance.now(),focused:document.hasFocus(),pointer:document.pointerLockElement?.id,fullscreen:!!document.fullscreenElement}),true);
 });
 await p.goto(local.url+'/fps/?network=local',{waitUntil:'domcontentloaded'});await p.locator('#network-code').waitFor();
 assert.equal(await p.evaluate(()=>typeof window.__fps),'undefined');console.log('Normal launch ready',mobile?'mobile':'desktop');return p;
}
async function form(p,room=''){
 assert.equal(await p.locator('#network-endpoint').inputValue(),local.url);await p.locator('#network-code').fill('private-123');
 await p.locator('#network-room').fill(room);await p.locator(`[data-create=${!room}]`).click();
}
try{
 const a=await open(false);let b;
 if(!protocolPeer){const setup=await a.context().newCDPSession(a);
 await setup.send('Page.setWebLifecycleState',{state:'frozen'});
 try{b=await open(true);}finally{await setup.send('Page.setWebLifecycleState',{state:'active'});await setup.detach();}
 }
 await form(a);await a.locator('#resume').waitFor({state:'visible'});
 const id=await a.locator('#network-room').inputValue();assert(id);
 if(protocolPeer)peer=await createTestPeer(local.url,id);
 else{await form(b,id);await b.locator('#resume').click();await b.locator('#hud').waitFor({state:'visible'});}
 await until(()=>[...local.rooms][0]?.sim.game.actors.length===2,'two humans on the independent authority');
 const authority=[...local.rooms][0];assert.equal(authority.sim.game.actors.length,2);
 let resumeAttempts=0,resumePoint;
 for(;resumeAttempts<2;){
  resumeAttempts++;await a.bringToFront();const box=await a.locator('#resume').boundingBox();resumePoint={x:box.x+box.width/2,y:box.y+box.height/2};await a.locator('#resume').click();
  try{await a.waitForFunction(()=>document.pointerLockElement?.id==='game'&&document.querySelector('#pause').hidden,null,{timeout:5000});break;}
  catch(e){if(resumeAttempts===2||!(await a.locator('#pause').textContent()).includes('Muslås'))throw e;}
 }
 assert.equal(await a.evaluate(()=>!!document.fullscreenElement),false,'LAN Resume leaves fullscreen to its explicit menu action');
 const player=authority.sim.game.actors.find(x=>x.id==='analysts-0'),z=player.z,ammo=player.inventory.primary.ammo;
 // Hold real input until authority observes it; a fixed 250 ms press can fit
 // entirely between two frames on a software runner. Keep bounded deadlines.
 await a.keyboard.down('w');await until(()=>Math.abs(player.z-z)>.1,'real keyboard input reaches authority');await a.keyboard.up('w');
 await a.mouse.down();await until(()=>player.inventory.primary.ammo<ammo,'real mouse fire reaches authority');await a.mouse.up();
 assert(Math.abs(player.z-z)>.1);assert(player.inventory.primary.ammo<ammo);
 const shots=ammo-player.inventory.primary.ammo;
 if(peer)await until(()=>peer.room.state.actors.get(player.id)?.ammo<ammo,'protocol peer receives the browser shots');
 // Exercise real mouse look too. A downward view keeps this transient HUD
 // check observable on software GPUs; the full-map job uses the normal camera.
 await a.mouse.move(resumePoint.x,resumePoint.y+360);
 await until(()=>player.pitch<-.3,'real mouse look reaches authority');
 // Observe before the key: a driver round trip can miss a short reload label.
 await a.evaluate(()=>{window.__reloadHudSeen=new Promise(resolve=>{
  const element=document.querySelector('#reload-text');let timer;
  const finish=value=>{clearTimeout(timer);observer.disconnect();resolve(value);};
  const observer=new MutationObserver(()=>{if(element.textContent.includes('Laddar om')&&!element.closest('[hidden]')&&element.getBoundingClientRect().height>0)finish(true);});
  observer.observe(element,{childList:true,characterData:true,subtree:true});timer=setTimeout(()=>finish(false),15000);
 });});
 await a.keyboard.press('r');assert(await a.evaluate(()=>__reloadHudSeen),'real reload displays its HUD state');
 await until(()=>player.inventory.primary.ammo===30,'real reload finishes on authority');
 await a.keyboard.press('Escape');await a.locator('#fullscreen-toggle').click();await a.waitForFunction(()=>!!document.fullscreenElement);
 await a.locator('#resume').click();await a.waitForFunction(()=>document.pointerLockElement?.id==='game'&&document.querySelector('#pause').hidden);
 const fullscreenZ=player.z;await a.keyboard.down('s');await until(()=>Math.abs(player.z-fullscreenZ)>.1,'keyboard input also works after explicit fullscreen');await a.keyboard.up('s');
 await a.keyboard.press('Escape');await a.locator('#restart').click();await a.locator('#network-code').waitFor();
 await until(()=>authority.sim.game.actors.length===1,'leaving cleans up only the departing player');
 assert(await a.locator('#fatal').isHidden(),'returning to the empty network lobby must keep the render loop alive');assert.deepEqual(errors,[]);
 if(peer)assert.deepEqual(peer.errors,[]);
 const result={hostPlatform:process.platform,physicalDevices:false,status:'PASS',contract:CONTRACT,headed,testHooks:false,humans:2,browserProcesses:browsers.length,peer:protocolPeer?'Colyseus SDK (no renderer)':'second rendered browser',angle,resumeAttempts,desktopPointerLock:true,manualFullscreen:true,actualKeysAndMouse:true,mouseLook:true,movement:Math.abs(fullscreenZ-z),shots,reloadHud:true,leaveKeepsOther:true,errors};
 fs.mkdirSync('test-results/network',{recursive:true});fs.writeFileSync('test-results/network/normal-launch.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}catch(error){
 fs.mkdirSync('test-results/network',{recursive:true});
 const bounded=promise=>Promise.race([promise,new Promise(resolve=>setTimeout(()=>resolve('Diagnostic timed out'),5000))]);
 const clients=await Promise.all(pages.map(p=>bounded(p.evaluate(()=>({events:__launchEvents,focused:document.hasFocus(),pointer:document.pointerLockElement?.id,fullscreen:!!document.fullscreenElement,paused:!document.querySelector('#pause').hidden,pause:document.querySelector('#pause').textContent,network:document.querySelector('#phase').textContent,fps:document.querySelector('#perf').textContent,fatal:document.querySelector('#fatal pre').textContent})).catch(e=>String(e)))));
 const rooms=[...local.rooms].map(r=>({tick:r.sim.tickNumber,metrics:r.metrics,lag:r.lag,seats:[...r.seats.values()].map(({actor,...s})=>({...s,x:actor?.x,z:actor?.z}))}));
 fs.writeFileSync('test-results/network/normal-launch-failure.json',JSON.stringify({error:String(error),errors,clients,rooms},null,2));console.error('Normal launch failure',JSON.stringify({error:String(error),errors,clients,rooms}));throw error;
}finally{await Promise.all(browsers.map(b=>b.close()));await peer?.close();await local.close();}
