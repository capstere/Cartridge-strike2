/** Focused real-WebGL contract for the prepared floor, low quality and moving doors/glass.
 * Arranged scene checks, not a hardware performance benchmark or human playtest.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,writeFileSync} from 'node:fs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/floor5-materials';mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:660}}),errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
await page.addInitScript(()=>{const raf=requestAnimationFrame.bind(window);window.requestAnimationFrame=cb=>raf(t=>{if(!window.__fps)cb(t);});});
try{
 await page.goto(origin+'/fps/?test=1');await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:180000,polling:100});
 assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
 const report=await page.evaluate(async()=>{
  const f=__fps,w=f.world,r=f.renderer;f.stopFrameLoop();f.start('analysts',{mode:'endless',botFire:false,botSpeed:0,wanderers:false});
  const check=(value,message)=>{if(!value)throw Error(message);};
  check(w.projectScene.items.length===1020,'all furnished project items retained');
  check(r.decor.userData.counts.cartridgeBoxes===0,'no generated lab boxes');
  const plan=r.decor.userData.detectorPlan;
  for(const id of ['I01','I02','I04','I12','I26','C02'])check(plan.some(p=>p.roomId===id),'detector coverage '+id);
  const service=r.materialFor(w.description.surfaces.find(s=>s.id==='finish-I12'));
  check(service.roughness===.58&&service.metalness===0&&service.map.name==='floor5-vinyl-grain','actual service floor uses vinyl');
  const {architecturePreview}=await import('/furniture-editor/build/architecture-preview.mjs');
  const preview=architecturePreview(w.project,w.projectScene),floor=preview.children.find(n=>n.userData.editId==='I12'&&n.userData.architecturePart==='floor');
  check(floor.material.map===service.map&&floor.material.roughness===service.roughness,'studio and FPS use identical service finish');
  const painted=r.materialFor({material:'metal',studioColor:'#52788a'}),steel=r.registry.get('metal');
  check(painted.metalness===0&&steel.metalness===.85&&!!steel.roughnessMap,'paint and brushed steel stay separate');
  let lights=0;r.scene.traverse(o=>{if(o.isLight)lights++;});check(lights===3,'three existing world lights');check(!r.renderer.shadowMap.enabled,'neutral lighting keeps shadows disabled');
  for(const progress of [0,1]){w.setElevatorProgress(progress);r.doorVisuals.update(r.camera,[]);f.render();check(w.doors.elevators.progress===progress,'elevator pose');}
  const glassDoor=w.doors.doors.find(d=>d.doorStyle==='frosted');check(!!glassDoor,'existing glass door');
  for(const angle of [0,Math.PI/2]){w.doors.pose(glassDoor,angle);r.doorVisuals.update(r.camera,[]);f.render();}
  const pane=[...w.glass.panes.values()][0];check(!!w.glass.breakAt({id:pane.parts[0].id}),'glass still breaks');r.glassVisuals.sync();check(w.glass.brokenCount===1,'broken pane state');w.glass.reset();r.glassVisuals.sync();
  const camera={x:6.699,z:16.548};f.game.player.x=camera.x;f.game.player.z=camera.z;f.game.player.yaw=Math.PI/2;f.game.player.pitch=0;
  for(const quality of ['standard','low']){f.settings.graphics=quality;f.render();check(!r.renderer.shadowMap.enabled,'no added shadows in '+quality);}
  f.settings.graphics='standard';f.render();
  // A short move on a known corridor uses the real player capsule and movement solver.
  const actor={x:6.699,z:16.548,y:0,vy:0,radius:.22,height:1.7};
  for(let i=0;i<12;i++)w.move(actor,-.025,0,0);check(actor.x<6.45,'corridor remains traversable');
  return {status:'PASS',level:w.project.projectId||w.project.name,items:w.projectScene.items.length,generatedLabBoxes:r.decor.userData.counts.cartridgeBoxes,smokeDetectors:plan.length,lights,qualities:['standard','low'],studioFinish:true,elevatorPoses:2,glassDoorPoses:2,glassBreakReset:true,capsuleMove:true};
 });
 await page.locator('#game').screenshot({path:out+'/game-standard.png'});
 await page.evaluate(()=>{__fps.settings.graphics='low';__fps.render();});await page.locator('#game').screenshot({path:out+'/game-low.png'});
 assert.deepEqual(errors,[]);writeFileSync(out+'/webgl.json',JSON.stringify({...report,errors},null,2)+'\n');console.log(JSON.stringify({...report,errors}));
}finally{await browser.close();}
