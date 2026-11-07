/** Owner v1 WebGL review: arranged legal camera fixtures + trusted UI input.
 * Software WebGL/controlled steps are NOT hardware-FPS or human-match evidence. */
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const out=resolve(process.env.REVIEW_OUTPUT||'test-results/owner-layout');await mkdir(out,{recursive:true});
const report={status:'RUNNING',checks:[],errors:[],external:[],failed:[],fixtures:[],limitations:['Arranged legal camera positions for visual comparison; not manual gameplay.','Trusted UI input is consumed with fixed simulation steps.','CI software rendering is not a consumer-device FPS measurement.']};
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1024,height:640},deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});
page.on('response',r=>{if(r.status()>=400)report.failed.push({url:r.url(),status:r.status()});});
await page.route('**/*',route=>{const u=route.request().url();if(u.startsWith(origin+'/')||/^(blob|data):/.test(u))return route.continue();report.external.push(u);return route.abort();});
await page.addInitScript(()=>{localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'standard',blood:'standard'}));const raf=requestAnimationFrame.bind(window);window.__reviewRAF=raf;window.requestAnimationFrame=cb=>raf(t=>{if(!window.__fps)cb(t);});window.__trusted={keys:0,mouse:0};addEventListener('keydown',e=>{if(e.isTrusted)__trusted.keys++;});addEventListener('mousedown',e=>{if(e.isTrusted)__trusted.mouse++;});});
const check=(name,ok)=>{report.checks.push({name,ok:!!ok});console.log(name,!!ok);if(!ok)throw Error(name);};
async function capture(name){const data=await page.evaluate(()=>{__fps.render();return __fps.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];});await writeFile(resolve(out,name+'.png'),Buffer.from(data,'base64'));}
try{
 await page.goto(origin+'/fps/?level=classic-floor5&test=1');await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});check('scene and shaders load',await page.locator('#fatal').isHidden());
 await page.locator('#start').click();
 await page.evaluate(async()=>{__fps.start('analysts',{mode:'endless',botFire:false,botSpeed:0,wanderers:false});await __fps.audio.unlock();});
 check('original game actors, hostages and audio preserved',await page.evaluate(()=>__fps.game.actors.length===10&&__fps.game.hostages.length===2&&__fps.audio.context.state==='running'));
 for(const cfg of [
  {name:'01-lobby',room:'I33',near:[.32,.70],look:[.75,.4],pitch:-.13},
  {name:'02-lunch',room:'I09',near:[.85,.85],look:[.35,.3],pitch:-.15},
  {name:'03-lounge',room:'I25',near:[.55,.85],look:[.5,.2],pitch:-.15},
  {name:'04-office-glass',room:'I26',near:[.26,.6],look:[.1,.15],pitch:-.10},
  {name:'05-lab-glazing',room:'I02',near:[.5,.35],look:[.6,0],pitch:-.10},
  {name:'06-WC-corridor',door:'D45',range:.9},
  {name:'07-elevators',door:'D02',range:1.9},
  {name:'08-main-card-entry',door:'D06',range:1.7}
 ]){
  const fixture=await page.evaluate(c=>{const f=__fps,w=f.world,p=f.game.player;w.doors.reset();let desired,look;
   if(c.room){const r=w.data.rooms.find(r=>r.id===c.room),xs=r.polygon.map(p=>p[0]),zs=r.polygon.map(p=>p[1]),x0=Math.min(...xs),x1=Math.max(...xs),z0=Math.min(...zs),z1=Math.max(...zs);desired={x:x0+(x1-x0)*c.near[0],z:z0+(z1-z0)*c.near[1]};look={x:x0+(x1-x0)*c.look[0],z:z0+(z1-z0)*c.look[1]};}
   else{const d=w.data.doors.find(d=>d.id===c.door),dx=d.b[0]-d.a[0],dz=d.b[1]-d.a[1],l=Math.hypot(dx,dz);look={x:d.center[0],z:d.center[1]};desired={x:look.x-dz/l*c.range,z:look.z+dx/l*c.range};}
   const candidates=w.navigation.nodes.filter(n=>w.canOccupy(n.x,n.z,.2)).sort((a,b)=>Math.hypot(a.x-desired.x,a.z-desired.z)-Math.hypot(b.x-desired.x,b.z-desired.z));const n=candidates[0];if(!n||Math.hypot(n.x-desired.x,n.z-desired.z)>4)throw Error('No legal camera '+c.name);
   Object.assign(p,{x:n.x,z:n.z,y:0,height:1.7,yaw:Math.atan2(-(look.x-n.x),-(look.z-n.z)),pitch:c.pitch??-.08});f.renderer.shadowAt=-Infinity;f.render();f.render();return {name:c.name,position:{x:p.x,z:p.z},legal:w.canOccupy(p.x,p.z,.2),stats:{...f.renderer.stats}};
  },cfg);report.fixtures.push(fixture);check(cfg.name+' legal camera',fixture.legal);await capture(cfg.name);
 }
 report.resources=await page.evaluate(()=>{const f=__fps,r=f.renderer.renderer;f.render();const before={...r.info.memory};for(let i=0;i<25;i++)f.render();return {before,after:{...r.info.memory},stats:{...f.renderer.stats}};});
 check('repeated rendering does not allocate persistent GPU geometry',report.resources.before.geometries===report.resources.after.geometries);
 await page.evaluate(()=>__fps.newMatch());await page.selectOption('#game-mode','endless');await page.locator('#start').click();await page.waitForFunction(()=>document.pointerLockElement?.id==='game');
 // Consume the actual new-round events before holding W; app clears input on round start.
 await page.evaluate(()=>__fps.step({},1/60));
 const from=await page.evaluate(()=>{__fps.game.config.botFire=false;return {x:__fps.game.player.x,z:__fps.game.player.z};});
 await page.keyboard.down('KeyW');await page.evaluate(()=>{for(let i=0;i<30;i++)__fps.step(null,1/60);});await page.keyboard.up('KeyW');check('trusted keyboard movement',await page.evaluate(p=>Math.hypot(__fps.game.player.x-p.x,__fps.game.player.z-p.z)>.1,from));
 const ammo=await page.evaluate(()=>__fps.game.item().ammo);await page.mouse.down();await page.evaluate(()=>__fps.step(null,.1));await page.mouse.up();check('trusted fire consumes ammunition',await page.evaluate(a=>__fps.game.item().ammo<a,ammo));
 await page.keyboard.press('KeyR');check('trusted reload',await page.evaluate(()=>__fps.game.player.reloadUntil>__fps.game.state.time));
 report.trusted=await page.evaluate(()=>({keys:window.__trusted.keys,mouse:window.__trusted.mouse}));
 await page.keyboard.press('Escape');check('pause freezes simulation time',await page.evaluate(()=>{const g=__fps.game,t=g.state.time;g.update(.5,{});return g.state.paused&&g.state.time===t;}));
 await page.locator('#resume').click();await page.waitForFunction(()=>document.pointerLockElement?.id==='game');check('resume restores game',await page.evaluate(()=>!__fps.game.state.paused));
 // End after the asserted real resume; no extra controlled frame or compositor wait.
 // Eight actual WebGL fixture captures and trusted event counts were already recorded.
 check('no JS/shader/resource or external request failures',!report.errors.length&&!report.failed.length&&!report.external.length);report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(e.stack||String(e));console.error(e);}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
if(report.status!=='PASS')process.exitCode=1;
