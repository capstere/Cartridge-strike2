import assert from 'node:assert/strict';import fs from 'node:fs';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/bot-tactics';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1000,height:650}}),errors=[],reports=[];
page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{requestAnimationFrame=()=>0;localStorage.setItem('cartridge-settings',JSON.stringify({mode:'classic',graphics:'standard',wanderers:false}));});
try{
 await page.goto(origin+'/fps/?test=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{polling:100,timeout:240000});assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
 for(const [index,seed]of [17,42,93].entries()){
  await page.evaluate(seed=>{document.querySelector('#seed').value=String(seed);},seed);
  await page.evaluate(async team=>{
   __fps.start(team,{mode:'classic',buyTime:1,wanderers:false},true);
   const {roundFrames}=await import('/tools/bot-tactics-scenarios.mjs');window.tacticsFrames=roundFrames(__fps.game);__fps.render();
  },index%2?'counterAnalysts':'analysts');
  for(let i=0;i<40;i++){
   const step=await page.evaluate(()=>{const s=tacticsFrames.next();__fps.step({},0);return s;});
   if(step.done){reports.push(step.value);break;}
   if(seed===17&&['exit-1','round-1-19','exit-2'].includes(step.value.name))await page.screenshot({path:out+'/'+seed+'-'+step.value.name+'.png'});
  }
  const r=reports.at(-1);assert.equal(r?.seed,seed);assert.equal(r.results.length,2);assert.equal(r.earlyShots,0);assert(r.maxMovingStall<15);
  for(const exit of r.exits)for(const a of exit.actors)if(a.alive)assert(!['BYGG-G-41001','BYGG-G-41002'].includes(a.room));
  for(const team of ['analysts','counterAnalysts'])for(const round of [1,2])assert(new Set(r.routes.filter(v=>v.round===round&&v.actor.startsWith(team+'-')).map(v=>v.lane)).size>=2);
  console.log(JSON.stringify({seed,results:r.results,routes:r.routes.length,yields:r.yields,maxMovingStall:r.maxMovingStall}));
 }
 assert.deepEqual(errors,[]);fs.writeFileSync(out+'/browser.json',JSON.stringify({status:'PASS',errors,reports},null,2));
}catch(error){fs.writeFileSync(out+'/browser-failure.json',JSON.stringify({message:error.message,errors,reports},null,2));await page.screenshot({path:out+'/failure.png'}).catch(()=>{});throw error;}finally{await browser.close();}
