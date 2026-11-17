// Normal launch smoke: no ?test query and no __fps controls/state hooks.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
import {createLocalServer} from '../server/local-server.mjs';
import {testLanHost} from './network-lan-host.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const headed=process.env.FPS_NETWORK_HEADED==='1';
const local=await createLocalServer({port:0,...(process.env.FPS_NETWORK_LAN==='1'?{lan:true,host:testLanHost()}:{})}),browser=await chromium.launch({channel:'chromium',headless:!headed,args:process.platform==='darwin'?['--use-angle=metal']:[]}),errors=[];
async function open(mobile){
 const c=await browser.newContext({viewport:mobile?{width:844,height:390}:{width:1280,height:720},isMobile:mobile,hasTouch:mobile,deviceScaleFactor:Number(process.env.FPS_NETWORK_DPR||1)}),p=await c.newPage();
 p.setDefaultTimeout(60000);p.on('pageerror',e=>errors.push(e.message));
 await p.addInitScript(()=>localStorage.setItem('cartridge-settings',JSON.stringify({graphics:'low',volume:0})));
 await p.goto(local.url+'/fps/?network=local');await p.locator('#network-code').waitFor();
 assert.equal(await p.evaluate(()=>typeof window.__fps),'undefined');return p;
}
async function form(p,room=''){
 assert.equal(await p.locator('#network-endpoint').inputValue(),local.url);await p.locator('#network-code').fill('private-123');
 await p.locator('#network-room').fill(room);await p.locator(`[data-create=${!room}]`).click();
}
try{
 const a=await open(false),b=await open(true);await form(a);await a.locator('#resume').waitFor({state:'visible'});
 const id=await a.locator('#network-room').inputValue();assert(id);await form(b,id);await b.locator('#resume').click();await b.locator('#hud').waitFor({state:'visible'});
 const authority=[...local.rooms][0];assert.equal(authority.sim.game.actors.length,2);
 let resumeAttempts=0;
 for(;resumeAttempts<2;){
  resumeAttempts++;await a.bringToFront();await a.locator('#resume').click();
  try{await a.waitForFunction(()=>document.pointerLockElement?.id==='game',null,{timeout:5000});break;}
  catch(e){if(resumeAttempts===2||!(await a.locator('#pause').textContent()).includes('Muslås'))throw e;}
 }
 const player=authority.sim.game.actors.find(x=>x.id==='analysts-0'),z=player.z,ammo=player.inventory.primary.ammo;
 await a.keyboard.down('w');await a.waitForTimeout(250);await a.keyboard.up('w');
 await a.mouse.down();await a.waitForTimeout(300);await a.mouse.up();await a.waitForTimeout(100);
 assert(Math.abs(player.z-z)>.1);assert(player.inventory.primary.ammo<ammo);
 await a.keyboard.press('r');await a.locator('#reload-text').filter({hasText:'Laddar om'}).waitFor();
 await a.keyboard.press('Escape');await a.locator('#restart').click();await a.locator('#network-code').waitFor();
 await a.waitForTimeout(350);assert.equal(authority.sim.game.actors.length,1);
 assert(await a.locator('#fatal').isHidden(),'returning to the empty network lobby must keep the render loop alive');assert.deepEqual(errors,[]);
 const result={status:'PASS',contract:CONTRACT,headed,testHooks:false,humans:2,resumeAttempts,desktopPointerLock:true,actualKeysAndMouse:true,movement:Math.abs(player.z-z),shots:ammo-player.inventory.primary.ammo,reloadHud:true,leaveKeepsOther:true,errors};
 fs.mkdirSync('test-results/network',{recursive:true});fs.writeFileSync('test-results/network/normal-launch.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
}finally{await browser.close();await local.close();}
