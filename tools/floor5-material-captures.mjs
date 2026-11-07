/** Same legal game-scene cameras for before/after comparisons; no hardware FPS claim. */
import {createRequire} from 'node:module';
import fs from 'node:fs';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const repo=fileURLToPath(new URL('..',import.meta.url)).replace(/\/$/,'');
const require=createRequire(repo+'/frontline/source/tools/dev/package.json');const {chromium}=require('playwright-core');
const mode=process.argv[2]||'after';const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const page=await browser.newPage({viewport:{width:1100,height:660}});const errors=[];page.on('pageerror',e=>errors.push(e.message));
await page.addInitScript(p=>{localStorage.setItem('cartridge-level-walk',JSON.stringify(p));const raf=window.requestAnimationFrame;window.stopFrames=false;window.requestAnimationFrame=cb=>raf.call(window,t=>{if(!window.stopFrames)cb(t);});},JSON.parse(fs.readFileSync(repo+'/levels/floor5-prepared.json')));
await page.goto((process.env.CAPTURE_ORIGIN||'http://127.0.0.1:8765')+'/fps/walk.html?test=1');await page.waitForFunction(()=>window.__walk,null,{timeout:180000});
const reports=await page.evaluate(async({mode})=>{
 window.stopFrames=true;const {world:w,renderer:r}=__walk;const T=await import('/vendor/three/three.module.js');const notes=await (await fetch('/docs/floor5-visual-direction/capture-notes.json')).json();
 const fixtures=notes.captures.filter(c=>c.version==='current').map(c=>({...c.fixture,id:c.fixture.room}));
 for(const id of ['I01','I04','I26','I31']){const room=w.data.rooms.find(q=>q.id===id),p=room.polygon,xs=p.map(q=>q[0]),zs=p.map(q=>q[1]);let best=null;
 const cx=(Math.min(...xs)+Math.max(...xs))/2,cz=(Math.min(...zs)+Math.max(...zs))/2;
 for(let z=Math.min(...zs)+.8;z<Math.max(...zs)-.4;z+=.4)for(let x=Math.min(...xs)+.8;x<Math.max(...xs)-.4;x+=.4){if(w.roomAt(x,z)?.id!==id||!w.canOccupy(x,z,.22))continue;
 if(w.projectScene.items.some(o=>{if((o.elevation||0)+o.height<1.4)return false;const dx=x-o.x,dz=z-o.z,c=Math.cos(o.yaw||0),s=Math.sin(o.yaw||0);return Math.abs(c*dx-s*dz)<o.w/2+.28&&Math.abs(s*dx+c*dz)<o.d/2+.28;}))continue;const dist=Math.hypot(x-cx,z-cz);if(!best||dist>best.dist)best={x,z,dist};}
 fixtures.push({id,room:id,point:{x:best.x,z:best.z},look:{x:cx,z:cz}});}
 for(const f of fixtures)if(!w.canOccupy(f.point.x,f.point.z,.22)){
 let best=null;for(let dz=-1;dz<=1;dz+=.1)for(let dx=-1;dx<=1;dx+=.1){const x=f.point.x+dx,z=f.point.z+dz,dist=Math.hypot(dx,dz);if(w.canOccupy(x,z,.22)&&w.roomAt(x,z)?.id===f.room&&(!best||dist<best.dist))best={x,z,dist};}if(!best)throw Error('Camera has no walkable point: '+f.room);f.point={x:best.x,z:best.z};
 }
 window.captureFixtures=fixtures;r.scene.updateMatrixWorld(true);return {fixtures,decor:r.decor.userData.counts,lights:(()=>{let n=0;r.scene.traverse(o=>{if(o.isLight)n++;});return n;})(),projectItems:w.projectScene.items.length};
},{mode});
const captures=[];for(const f of reports.fixtures){const result=await page.evaluate(f=>{const {renderer:r,world:w}=__walk;r.camera.position.set(f.point.x,1.6,f.point.z);r.camera.lookAt(f.look.x,1.35,f.look.z);r.camera.updateMatrixWorld(true);r.projectBatches?.update(r.camera);r.doorVisuals?.update(r.camera,[]);r.renderer.info.reset();r.renderer.render(r.scene,r.camera);return {room:f.room,canOccupy:w.canOccupy(f.point.x,f.point.z,.22),calls:r.renderer.info.render.calls,triangles:r.renderer.info.render.triangles};},f);await page.locator('#game').screenshot({path:repo+'/test-results/floor5-materials/'+mode+'-'+f.id+'.png'});captures.push({...f,...result});}
assert(captures.every(c=>c.canOccupy),'all arranged cameras are legal');assert.deepEqual(errors,[]);
fs.writeFileSync(repo+'/test-results/floor5-materials/'+mode+'.json',JSON.stringify({...reports,captures,errors},null,2));console.log(JSON.stringify({mode,decor:reports.decor,captures,errors}));await browser.close();
