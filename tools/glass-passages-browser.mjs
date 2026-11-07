/** Actual FPS shots, movement, bot steering and pooled glass rendering. */
import assert from 'node:assert/strict';import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/glass-passages';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:960,height:600}}),errors=[];
page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{requestAnimationFrame=()=>0;localStorage.setItem('cartridge-settings',JSON.stringify({mode:'classic',graphics:'standard',wanderers:false}));});
// A separate in-memory copy adds a sheer curtain to the real office pane, retaining its blind.
const fixture=JSON.parse(fs.readFileSync('levels/floor5-prepared.json'));
fixture.architecture.treatments.push({id:'BYGG-T-9999',type:'curtain',wallId:'WALL-139-v1-1',t0:.005,t1:.14,side:1,style:'sheer'});
await page.route('**/levels/floor5-prepared.json',route=>route.fulfill({contentType:'application/json',body:JSON.stringify(fixture)}));
const report={errors};
try{
 await page.goto(origin+'/fps/?test=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{polling:100,timeout:240000});assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
 report.intact=await page.evaluate(()=>{
  __fps.start('analysts',{mode:'classic',botFire:false,botSpeed:0,buyTime:0,wanderers:false});__fps.step({},.1);
  const {world:w,game:g}=__fps,p=w.glass.panes.get('WALL-139-v1-1-1/pane-0');window.glassFixture={id:p.id,x:p.x,z:p.z,a:{x:p.x,z:p.z+.7},b:{x:p.x,z:p.z-.7}};
  Object.assign(g.player,glassFixture.a,{y:0,yaw:0,pitch:0,weapon:'p9',nextShot:0});
  for(let i=0;i<30;i++)g.update(1/60,{forward:1,yaw:0});__fps.render();return {broken:p.broken,side:g.player.z-p.z};
 });assert(!report.intact.broken);assert(report.intact.side>.15);await page.screenshot({path:out+'/intact.png'});
 report.shot=await page.evaluate(()=>{
  const {world:w,game:g,renderer:r}=__fps;Object.assign(g.player,glassFixture.a,{y:0,yaw:0,pitch:0,nextShot:0});g.events=[];const before=w.navigation.revision,started=performance.now();__fps.step({fire:true,yaw:0,pitch:0},1/60);return {updateMs:performance.now()-started,broken:w.glass.panes.get(glassFixture.id).broken,revision:w.navigation.revision-before,shards:r.glassVisuals.shards.count,capacity:r.glassVisuals.particles.length,curtain:r.projectFurniture.children.some(o=>o.userData.editId==='BYGG-T-9999'),treatments:w.project.architecture.treatments.filter(t=>t.wallId==='WALL-139-v1-1').map(t=>t.type)};
 });assert(report.shot.broken);assert(report.shot.curtain);assert.equal(report.shot.revision,1);assert(report.shot.shards>0&&report.shot.shards<=128);assert(report.shot.treatments.includes('curtain')&&report.shot.treatments.includes('blind'));await page.screenshot({path:out+'/broken-curtain.png'});
 report.crossings=await page.evaluate(()=>{
  const {world:w,game:g}=__fps,results=[];const {id,a,b,z}=glassFixture;
  for(const [start,sign]of [[a,1],[b,-1]]){Object.assign(g.player,start,{y:0});let peak=0;
   for(let i=0;i<45;i++){g.update(1/60,{moveWorld:{x:0,z:-sign*.035},yaw:sign===1?0:Math.PI});peak=Math.max(peak,g.player.y);}
   __fps.render();results.push({passed:(g.player.z-z)*sign<-.4,peak,legal:w.scopeAllowed(g.player.x,g.player.z),height:g.player.height});
  }
  return results;
 });for(const result of report.crossings){assert(result.passed);assert(result.legal);assert(result.peak>=.09&&result.peak<.121);}await page.screenshot({path:out+'/crossed.png'});
 report.bot=await page.evaluate(()=>{
  const {game:g,world:w}=__fps;Object.assign(g.player,{x:glassFixture.a.x+2,z:glassFixture.a.z});g.config.botSpeed=1.8;
  const actor=g.actors[1],bot=actor.bot;bot.vehicle.maxSpeed=g.config.botSpeed;Object.assign(actor,glassFixture.a,{y:0});bot.goal=glassFixture.b;bot.nextPath=Infinity;bot.navigationRevision=w.navigation.revision-1;
  for(let i=0;i<150;i++){const input={};bot.follow(1/60,input);g.moveActor(actor,input,1/60);g.state.time+=1/60;}__fps.render();
  return {distance:Math.hypot(actor.x-glassFixture.b.x,actor.z-glassFixture.b.z),revision:bot.navigationRevision,worldRevision:w.navigation.revision};
 });assert(report.bot.distance<.15);assert.equal(report.bot.revision,report.bot.worldRevision);
 report.reset=await page.evaluate(()=>{
  const {game:g,world:w,renderer:r}=__fps,before=w.navigation.revision;g.beginRound();__fps.step({},.1);Object.assign(g.player,glassFixture.a,{y:0,yaw:0,pitch:0});
  for(let i=0;i<30;i++)g.update(1/60,{forward:1,yaw:0});__fps.render();
  const rev=w.navigation.revision,uploads=r.glassVisuals.batches.map(b=>b.mesh.instanceMatrix.version);for(let i=0;i<10;i++)r.glassVisuals.update(g.state.time);
  return {broken:w.glass.brokenCount,side:g.player.z-glassFixture.z,revisionDelta:rev-before,shards:r.glassVisuals.shards.count,stableUpdates:w.navigation.revision===rev&&uploads.every((v,i)=>v===r.glassVisuals.batches[i].mesh.instanceMatrix.version)};
 });assert.equal(report.reset.broken,0);assert(report.reset.side>.15);assert.equal(report.reset.revisionDelta,1);assert.equal(report.reset.shards,0);assert(report.reset.stableUpdates);await page.screenshot({path:out+'/reset.png'});
 assert.deepEqual(errors,[]);report.status='PASS';fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(error){fs.writeFileSync(out+'/failure.json',JSON.stringify({message:error.message,report},null,2));throw error;}finally{await browser.close();}
