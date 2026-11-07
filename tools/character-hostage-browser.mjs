/** Controlled escort in the actual FPS, using its interaction, navigation and collision. */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765',out='test-results/business-hostages';fs.mkdirSync(out,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']}),page=await browser.newPage({viewport:{width:1100,height:700}}),errors=[],requests=[];
page.setDefaultTimeout(180000);page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('request',r=>{if(r.url().includes('Business_Man_Quaternius_Anims.glb'))requests.push(r.url());});
await page.addInitScript(()=>{localStorage.setItem('cartridge-settings',JSON.stringify({mode:'classic',graphics:'standard',wanderers:false}));requestAnimationFrame=()=>0;HTMLCanvasElement.prototype.requestPointerLock=()=>Promise.resolve();});
const report={status:'RUNNING',errors};
const capture=async name=>{
 const saved=await page.evaluate(()=>{
  const {game:g,world:w}=__fps,p=g.player,h=g.hostages[0],saved={x:p.x,y:p.y,z:p.z,yaw:p.yaw,pitch:p.pitch};
  // A controlled, walkable observer spot makes the whole pose/feet reviewable.
  outer:for(const radius of [3,2.5,2])for(let i=0;i<32;i++){
   const a=i*Math.PI/16,x=h.x+Math.cos(a)*radius,z=h.z+Math.sin(a)*radius;
   if(w.canOccupy(x,z,.2)&&w.segmentClear({x,y:1.5,z},{x:h.x,y:.8,z:h.z},{vision:false})){Object.assign(p,{x,z,y:0});break outer;}
  }
  const distance=Math.hypot(h.x-p.x,h.z-p.z);p.yaw=Math.atan2(-(h.x-p.x),-(h.z-p.z));p.pitch=Math.atan2((h.alive===false?.15:.85)-(p.y+1.6),distance);__fps.render();return saved;
 });
 await page.screenshot({path:out+'/'+name+'.png'});
 await page.evaluate(saved=>{Object.assign(__fps.game.player,saved);__fps.render();},saved);
};
try{
 await page.goto(origin+'/fps/?test=1',{waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});assert(await page.locator('#fatal').isHidden(),await page.locator('#fatal').textContent());
 report.loaded=await page.evaluate(async()=>{
  __fps.start('counterAnalysts',{mode:'classic',buyTime:.01,botFire:false,botSpeed:0,wanderers:false,roundTime:300});__fps.step({},.1);
  const {game:g,renderer:r,world:w}=__fps,h=g.hostages[0],p=g.player;const anchors=g.hostages.map(h=>({x:h.x,y:h.y,z:h.z,height:h.height,radius:h.radius}));
  for(const a of g.hostages){const s=r.actors.get(a.id).userData.avatar;if(!s.defaultHostage)throw Error('Not Business default');}
  for(const a of g.actors)if(r.actors.get(a.id).userData.avatar.defaultHostage)throw Error('Player changed');
  // Arrange only the observer/escort. The hostages keep their shipped spawn positions.
  const positions=[];for(let i=0;i<32;i++){const a=i*Math.PI/16,x=h.x+Math.cos(a)*1.25,z=h.z+Math.sin(a)*1.25;if(w.canOccupy(x,z,.2)&&w.segmentClear({x,y:1.5,z},{x:h.x,y:.4,z:h.z},{vision:false}))positions.push({x,z});}
  if(!positions.length)throw Error('No reachable observer near hostage');Object.assign(p,positions[0],{y:0});__fps.render();
  const a=r.actors.get('hostage-0').userData.avatar,b=r.actors.get('hostage-1').userData.avatar;
  return {phase:g.phase,anchors,clips:[...a.clips.keys()],bones:a.meshes[0].skeleton.bones.length,meshes:a.meshes.length,sharedGeometry:a.meshes.every((m,i)=>m.geometry===b.meshes[i].geometry),sharedMaterials:a.meshes.every((m,i)=>m.material===b.meshes[i].material),independentSkeleton:a.bones.get('Hips')!==b.bones.get('Hips'),idle:a.activeBase};
 });
 assert.equal(report.loaded.phase,'active');assert.equal(report.loaded.bones,71);assert(report.loaded.sharedGeometry&&report.loaded.sharedMaterials&&report.loaded.independentSkeleton);assert.equal(report.loaded.idle,'Idle_Loop');await capture('idle');
 report.escort=await page.evaluate(async()=>{
  const {game:g,world:w,renderer:r}=__fps,h=g.hostages[0],p=g.player;
  const interaction=g.interaction(p,h.id);if(interaction?.type!=='escort')throw Error('No real escort interaction');__fps.step({interact:true},.1);__fps.step({interact:false},.1);if(h.escortId!==p.id)throw Error('Escort did not attach');
  const from={x:h.x,z:h.z},start={x:p.x,z:p.z};let route=null;
  for(let radius=4;radius>=2&&!route;radius-=.5)for(let i=0;i<24;i++){
   const angle=i*Math.PI/12,target={x:start.x+Math.cos(angle)*radius,z:start.z+Math.sin(angle)*radius};if(!w.canOccupy(target.x,target.z,.2))continue;
   const path=w.findPath(p,target);if(path.length&&Math.hypot(path.at(-1).x-target.x,path.at(-1).z-target.z)<.6){route=path;break;}
  }
  if(!route)throw Error('No escort test route');const clips=new Set(),floors=[];let peakTravel=0;
  for(let i=0;i<70;i++){
   while(route.length&&Math.hypot(route[0].x-p.x,route[0].z-p.z)<.15)route.shift();const target=route[0];let moveWorld={x:0,z:0};
   if(target){const dx=target.x-p.x,dz=target.z-p.z,d=Math.hypot(dx,dz),step=Math.min(d,.035);moveWorld={x:dx/d*step,z:dz/d*step};}
   __fps.step({moveWorld,yaw:Math.atan2(-(h.x-p.x),-(h.z-p.z)),pitch:.13},.1);
   const s=r.actors.get(h.id).userData.avatar;clips.add(s.activeBase);peakTravel=Math.max(peakTravel,h.distanceWalked);
   const {posedBounds}=await import('/src/fps/character-library.mjs?v=6.1.2');floors.push(posedBounds(s.root).min.y*s.scale+s.holder.position.y);
  }
  return {escortId:h.escortId,playerId:p.id,clips:[...clips],distanceWalked:peakTravel,displacement:Math.hypot(h.x-from.x,h.z-from.z),height:h.height,radius:h.radius,minFloor:Math.min(...floors),maxFloor:Math.max(...floors),phase:g.phase};
 });
 assert.equal(report.escort.escortId,report.escort.playerId);assert(report.escort.distanceWalked>1);assert(report.escort.clips.some(n=>/Walk|Jog/.test(n)));assert(Math.abs(report.escort.minFloor-.004)<1e-4);assert(Math.abs(report.escort.maxFloor-.004)<1e-4);await capture('escort');
 report.death=await page.evaluate(async()=>{const g=__fps.game,h=g.hostages[0];g.damage(h,1000,g.player,'bullet');for(let i=0;i<10;i++)__fps.step({},.1);const model=__fps.renderer.actors.get(h.id),s=model.userData.avatar,{posedBounds}=await import('/src/fps/character-library.mjs?v=6.1.2');return {alive:h.alive,clip:s.death?.action.getClip().name,finite:s.holder.position.toArray().every(Number.isFinite),floor:posedBounds(model).min.y+model.position.y};});assert.equal(report.death.alive,false);assert.equal(report.death.clip,'Death01');assert(report.death.finite);assert(Math.abs(report.death.floor-.006)<1e-4);await capture('death');
 await page.evaluate(()=>{__fps.game.beginRound();__fps.step({},.1);});
 await capture('next-round'); // Culled actors resume their pose when actually viewed.
 report.nextRound=await page.evaluate(async()=>{const {game:g,renderer:r}=__fps;const {posedBounds}=await import('/src/fps/character-library.mjs?v=6.1.2');return g.hostages.map(h=>{const s=r.actors.get(h.id).userData.avatar;return {id:h.id,x:h.x,y:h.y,z:h.z,height:h.height,radius:h.radius,defaultHostage:s.defaultHostage,clip:s.activeBase,deathCleared:!s.death,idleRunning:s.base.get('Idle_Loop').isRunning(),visualHeight:(posedBounds(s.root).max.y-posedBounds(s.root).min.y)*s.scale};});});
 for(let i=0;i<2;i++){assert(report.nextRound[i].defaultHostage);assert(report.nextRound[i].deathCleared);assert(report.nextRound[i].idleRunning);assert(report.nextRound[i].visualHeight>1.5);for(const k of ['x','y','z','height','radius'])assert.equal(report.nextRound[i][k],report.loaded.anchors[i][k]);}
 assert.equal(requests.length,1);assert.deepEqual(errors,[]);report.modelRequests=requests.length;report.status='PASS';fs.writeFileSync(out+'/report.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));
}catch(e){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});fs.writeFileSync(out+'/failure.json',JSON.stringify({message:e.message,errors,report},null,2));throw e;}finally{await browser.close();}
