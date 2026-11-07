/** Arranged valid cameras + actual game firing. Software WebGL, not hardware FPS. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out=resolve('test-results/facility-details');await mkdir(out,{recursive:true});
const report={status:'RUNNING',checks:[],fixtures:[],errors:[],failed:[],external:[],limitations:['Arranged legal camera fixtures and controlled simulation steps, not human match play.','Software WebGL does not measure consumer hardware FPS.','Lab contents are generic illustrative furniture; excluded areas stay inaccessible.']};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1024,height:640},deviceScaleFactor:1}),page=await context.newPage();page.setDefaultTimeout(30000);
page.on('pageerror',e=>report.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')report.errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)report.failed.push({url:r.url(),status:r.status()});});
await page.route('**/*',r=>{const u=r.request().url();if(u.startsWith(origin+'/')||/^(blob|data):/.test(u))return r.continue();report.external.push(u);return r.abort();});
await page.addInitScript(()=>{localStorage.setItem('cartridge-settings',JSON.stringify({mode:'endless',graphics:'standard',blood:'standard'}));const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__fps)cb(t);});window.__trusted={keys:0,mouse:0};addEventListener('keydown',e=>{if(e.isTrusted)__trusted.keys++;});addEventListener('mousedown',e=>{if(e.isTrusted)__trusted.mouse++;});});
const check=(name,ok)=>{report.checks.push({name,ok:!!ok});console.log(name,!!ok);if(!ok)throw Error(name);};
async function capture(name){const b=await page.evaluate(()=>{__fps.render();return __fps.renderer.renderer.domElement.toDataURL('image/png').split(',')[1];});await writeFile(resolve(out,name+'.png'),Buffer.from(b,'base64'));}
try{
 await page.goto(origin+'/fps/?level=classic-floor5&test=1');await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});check('startup has no fatal error',await page.locator('#fatal').isHidden());
 check('menu version 0.17.0',(await page.locator('#game-version').textContent()).includes('0.17.0'));
 await page.locator('#start').click();await page.evaluate(()=>{__fps.start('analysts',{mode:'endless',botFire:false,botSpeed:0,wanderers:false});__fps.step({},1/60);});
 report.details=await page.evaluate(()=>({...__fps.world.details.counts,panes:__fps.world.glass.panes.size}));check('12 toilets, 12 basins, appliances and glass panes present',report.details.toilets===12&&report.details.basins===12&&report.details.kitchen===7&&report.details.panes>100);
 for(const cfg of [
  {name:'01-wc',fixture:'WC-L3-toilet',near:[.60,.90],pitch:-.56},
  {name:'02-kitchen',xyz:[10.5,14.1],look:[7.8,15.2],pitch:-.22},
  {name:'03-orange-chairs',xyz:[13.5,12.2],look:[7,9.9],pitch:-.28},
  {name:'04-lab-north',xyz:[-10.5,-11.9],look:[-10.5,-16],pitch:-.12},
  {name:'05-lab-bulk',xyz:[-10,16.7],look:[-10,21],pitch:-.12},
  {name:'06-exterior',xyz:[-17.2,-23.6],look:[-23,-28.4],pitch:-.08}
 ]){
  const result=await page.evaluate(c=>{const f=__fps,w=f.world,p=f.game.player;for(const d of w.doors.doors){d.angle=Math.PI/2;d.target=d.angle;d.holdUntil=Infinity;w.doors.pose(d);}let desired=c.xyz,look=c.look;
   if(c.fixture){const q=w.details.props.find(q=>q.id===c.fixture);desired=[q.x+c.near[0],q.z+c.near[1]];look=[q.x,q.z];}
   // Prefer exact fixture camera when valid; otherwise nearest valid navigation sample.
   const exact={x:desired[0],z:desired[1]},n=w.canOccupy(exact.x,exact.z,.2)?exact:w.navigation.nodes.filter(n=>w.canOccupy(n.x,n.z,.2)).sort((a,b)=>Math.hypot(a.x-exact.x,a.z-exact.z)-Math.hypot(b.x-exact.x,b.z-exact.z))[0];
   if(!n||Math.hypot(n.x-exact.x,n.z-exact.z)>3)throw Error('No legal camera '+c.name);
   Object.assign(p,{x:n.x,z:n.z,y:0,height:1.7,yaw:Math.atan2(-(look[0]-n.x),-(look[1]-n.z)),pitch:c.pitch});f.renderer.shadowAt=-Infinity;f.render();return {name:c.name,x:p.x,z:p.z,legal:w.canOccupy(p.x,p.z,.2),stats:{...f.renderer.stats}};
  },cfg);report.fixtures.push(result);check(cfg.name+' legal camera',result.legal);await capture(cfg.name);
 }
 // Actual ordinary firearm event at a pane (camera/state arranged explicitly).
 const prepared=await page.evaluate(()=>{const f=__fps,g=f.game,w=f.world;g.beginRound();g.state.phase='active';g.state.paused=false;for(const a of g.actors)if(!a.isPlayer){a.x=30;a.z=30;}const pane=[...w.glass.panes.values()].find(p=>p.wallId==='WALL-031');Object.assign(g.player,{x:pane.x,z:pane.z+1,y:0,height:1.7,yaw:0,pitch:0,reloadUntil:0,nextShot:0});g.events=[];g.player.weapon='p9';return {pane:pane.id,legal:w.canOccupy(g.player.x,g.player.z,.2),ammo:g.item().ammo};});
 check('glass shot fixture is on legal floor',prepared.legal);await capture('07-glass-intact');
 await page.mouse.down();await page.evaluate(()=>__fps.step(null,.1));await page.mouse.up();
 const shot=await page.evaluate(()=>({broken:__fps.world.glass.brokenCount,ammo:__fps.game.item().ammo,shards:__fps.renderer.glassVisuals.shards.count,events:{...__trusted}}));report.shot=shot;check('trusted shot consumes ammo and breaks one pane',shot.ammo<prepared.ammo&&shot.broken===1);await capture('08-glass-broken');
 const life=await page.evaluate(()=>{const f=__fps,w=f.world,r=f.renderer.renderer;f.render();const before={...r.info.memory};for(let i=0;i<15;i++)f.render();const after={...r.info.memory};f.game.beginRound();f.renderer.events(f.game.events,f.game);f.render();return {before,after,restored:w.glass.brokenCount===0,shards:f.renderer.glassVisuals.shards.count,actors:f.game.actors.length,hostages:f.game.hostages.length};});report.lifecycle=life;
 check('stationary frames allocate no persistent geometry',life.before.geometries===life.after.geometries);check('new round restores panes and clears shards',life.restored&&life.shards===0);check('teams and hostages preserved',life.actors===10&&life.hostages===2);
 check('no script, shader, HTTP or external resource failures',!report.errors.length&&!report.failed.length&&!report.external.length);report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(e.stack||String(e));console.error(e);}finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2));await context.close();await browser.close();}
if(report.status!=='PASS')process.exitCode=1;
