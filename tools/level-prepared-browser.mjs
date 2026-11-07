/** Normal FPS entry, real WebGL models, both door states and a walk out of each cabin. */
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {chromium} from '../frontline/source/tools/dev/node_modules/playwright-core/index.mjs';

const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),
 args:['--use-gl=angle','--use-angle='+(process.env.FPS_TEST_ANGLE||'swiftshader'),'--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
try{
 const page=await browser.newPage({viewport:{width:880,height:510}}),errors=[],loads=[];
 page.on('pageerror',e=>errors.push(e.message));
 page.on('response',r=>{if(r.status()>=400)errors.push(r.status()+' '+r.url());if(/\.glb($|\?)/.test(r.url()))loads.push(r.url());});
 // Headless shells cannot capture a native mouse. Keep the real menu and simulation.
 await page.addInitScript(()=>{
  Element.prototype.requestPointerLock=function(){Object.defineProperty(document,'pointerLockElement',{configurable:true,value:this});return Promise.resolve();};
  document.exitPointerLock=()=>Object.defineProperty(document,'pointerLockElement',{configurable:true,value:null});
 });
 await page.goto(origin+'/fps/?test=1');
 await page.waitForFunction(()=>Boolean(globalThis.__fps)||!document.querySelector('#fatal').hidden,null,{timeout:180000});
 assert.equal(await page.locator('#fatal').isVisible(),false,await page.locator('#fatal').textContent());
 assert.equal(await page.evaluate(()=>__fps.world.project.projectId),'lvl-floor5-preppad-20261105');
 const screen=async name=>{if(process.env.FPS_SCREENSHOTS){await mkdir(process.env.FPS_SCREENSHOTS,{recursive:true});
  await page.screenshot({path:join(process.env.FPS_SCREENSHOTS,name+'.jpg'),animations:'disabled',timeout:60000});}};
 const before=loads.length;assert.equal(new Set(loads.filter(u=>/\/assets\/models\/[a-f0-9]{64}\.glb$/.test(u))).size,13);
 // Simulation steps and draws below explicitly control the captured frame.
 await page.evaluate(()=>__fps.stopFrameLoop());
 await page.locator('#start').click();
 for(const team of ['analysts','counterAnalysts']){
  if(team==='counterAnalysts')await page.evaluate(()=>__fps.start('counterAnalysts',{buyTime:2},false));
  assert.equal(await page.evaluate(()=>__fps.world.doors.elevators.progress),0);
  const actors=await page.evaluate(()=>{
   const {game,world,renderer}=__fps;__fps.render();
   return {positions:game.actors.every(a=>world.roomAt(a.x,a.z)?.id===
    world.project.gameplay.startElevators.find(c=>c.team===a.team).floorId),
    visible:game.actors.filter(a=>a.team===game.team&&renderer.actors.get(a.id)?.visible).length};
  });
  assert(actors.positions);if(team==='analysts')assert(actors.visible>=2,'Teammates must be visible before the freight doors open');
  await screen(team+'-closed');
  const state=await page.evaluate(()=>{
   const {game,renderer,world}=__fps;game.pause(false);
   while(game.phase==='buy')game.step(1/60);
   __fps.render();
   return {doors:world.doors.elevators.progress,light:renderer.presentationReport.kind,shadow:renderer.renderer.shadowMap.enabled,
    instanced:renderer.projectBatches.instancedItems,depth:!!renderer.visualDepth,draws:renderer.stats.drawCalls};
  });
  assert.equal(state.doors,1);assert.equal(state.light,'neutral-daylight');assert.equal(state.shadow,false);assert.equal(state.depth,false);
  assert(state.instanced>400&&state.draws>0);await screen(team+'-open');
  const lobby=await page.evaluate(()=>{
   const {game,world}=__fps;for(let i=0;i<61;i++)game.step(1/60,{forward:1,yaw:Math.PI});
   __fps.render();return world.roomAt(game.player.x,game.player.z)?.id;
  });
  assert.equal(lobby,team==='analysts'?'I12':'I31');console.log(team,lobby,state);
 }
 assert.equal(loads.length,before,'All GLB requests must finish before Start.');
 for(const room of ['I18','I27']){
  const printer=await page.evaluate(id=>{
   const t=__fps,p=t.world.projectScene.items.find(item=>item.roomId===id&&item.assetId==='office:ricoh-printer');
   Object.assign(t.game.player,{x:p.x-1.6,z:p.z,y:0,yaw:-Math.PI/2,pitch:-.14});
   t.render();return t.world.canOccupy(t.game.player.x,t.game.player.z);
  },room);
  assert(printer);await screen(room+'-ricoh');
 }
 // Inspect an actual monitor face. Only the two shared signal variants are animated.
 const details=await page.evaluate(()=>{
  const {game,renderer,world}=__fps,layer=renderer.floorEnvironment,root=layer.root;
  const signal=root.getObjectByName('environment-signal').material.map;
  const camera=renderer.camera.clone();camera.position.set(20.64,1.60,14.183);
  camera.lookAt(22.39,1.80,14.62);camera.updateMatrixWorld();
  const normal={graphics:'standard',reducedMotion:false};
  const tick=(time,settings=normal)=>{renderer.projectBatches.update(camera);layer.update(camera,time,settings,world);return signal.offset.y;};
  const a=tick(20.125),held=tick(20.20),next=tick(20.251);
  camera.lookAt(19,1.6,13.9);camera.updateMatrixWorld();
  const hidden=tick(20.5),reduced=tick(21,{...normal,reducedMotion:true}),low=tick(21.25,{...normal,graphics:'low'});
  game.beginRound();
  return {a,held,next,hidden,reduced,low,reused:renderer.floorEnvironment.root===root,
   hasLab:root.children.some(cell=>cell.name.startsWith('environment-X21/')),
   hasFacade:root.children.some(cell=>cell.name.startsWith('environment-facade/'))};
 });
 assert.equal(details.a,details.held);assert.notEqual(details.next,details.a);
 assert.equal(details.next,details.hidden);assert.equal(details.reduced,0);assert.equal(details.low,0);
 assert(details.reused&&details.hasLab&&details.hasFacade);
 assert.deepEqual(errors,[]);console.log('Default Floor 5 WebGL, model preloading and both printer rooms passed.');
}finally{await browser.close();}
