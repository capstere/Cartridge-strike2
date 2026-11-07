/** Real author/save/reopen/rehearse flow and original-vs-loaded animation evidence. */
import {createRequire} from 'node:module';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import {verifyPrivateHands} from './private-hands-browser.mjs';
import {verifySavedCharacterMenu,verifyCharacterStorage} from './saved-character-menu-browser.mjs';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.CHARACTER_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true,args:['--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader']});
await mkdir('test-results/private-character',{recursive:true});
try{
 const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
 page.setDefaultTimeout(120000);page.on('pageerror',e=>errors.push(e.message));
 await page.addInitScript(()=>{
  HTMLCanvasElement.prototype.requestPointerLock=function(){return Promise.resolve();};
  // Test-mode frames are advanced by __fps.step/render below. An unbounded
  // live RAF loop otherwise queues GPU work faster than Linux SwiftShader can
  // capture a screenshot; assertions and the game renderer remain unchanged.
  if(location.pathname.endsWith('/fps/')&&new URLSearchParams(location.search).has('test'))window.requestAnimationFrame=()=>0;
 });
 await page.goto(origin+'/character-design/');await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
 await page.locator('#new-match-pilot').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Male-piloten är klar'));
 await page.locator('#shirt-text').fill('MITT SPEL');await page.locator('#save-slot').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('sparad i ateljén'));
 await page.reload();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('redo!'));
 assert.equal(await page.locator('#outfit-style').inputValue(),'tshirt');assert.equal(await page.locator('#shoe-style').inputValue(),'sneakers');assert.equal(await page.locator('#shirt-text').inputValue(),'MITT SPEL');
 console.log('STUDIO_SAVED');await page.locator('#save-game-character').click();await page.waitForFunction(()=>document.querySelector('#status').textContent.includes('sparad för spelet'));await page.locator('#private-match').click();await page.waitForURL(/\/fps\/\?character=/);
 const url=page.url();await page.goto(url+'&test=1');
 await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});
 assert.equal(await page.locator('#fatal').isHidden(),true,await page.locator('#fatal').textContent());
 assert.match(await page.locator('#private-character-note').textContent(),/A-02/);
 await page.locator('#start').click();
 const result=await page.evaluate(async()=>{
  const T=await import('../vendor/three/three.module.js'),{loadPrivateCharacter}=await import('../src/fps/private-character-store.mjs'),{GLTFLoader}=await import('../vendor/three/addons/loaders/GLTFLoader.js');
  const id=new URLSearchParams(location.search).get('character'),row=await loadPrivateCharacter(id),loaded=await new GLTFLoader().parseAsync(row.bytes.slice(0),'');
  const me=__fps.renderer.actors.get('analysts-0').userData.avatar,friend=__fps.renderer.actors.get('analysts-1').userData.avatar,other=__fps.renderer.actors.get('counterAnalysts-0').userData.avatar;
  if(!me.privateDesign||!friend.privateDesign||other.privateDesign)throw Error('Private avatar selection leaked');
  const data=mesh=>JSON.stringify(['position','normal','uv','color','skinIndex','skinWeight'].map(k=>mesh.geometry.attributes[k]&&Array.from(mesh.geometry.attributes[k].array)));
  let meshes=0,weights=true,binds=true,materials=true,geometry=true;
  loaded.scene.traverse(o=>{if(!o.isMesh)return;meshes++;const n=me.root.getObjectByName(o.name);geometry&&=!!n&&data(n)===data(o);materials&&=n.material.name===o.material.name&&n.material.color.equals(o.material.color)&&n.material.roughness===o.material.roughness&&!!n.material.map===!!o.material.map;if(o.isSkinnedMesh){binds&&=JSON.stringify(n.skeleton.boneInverses.map(m=>m.elements))===JSON.stringify(o.skeleton.boneInverses.map(m=>m.elements));const w=n.geometry.attributes.skinWeight;for(let i=0;i<w.count;i++)weights&&=Math.abs(w.getX(i)+w.getY(i)+w.getZ(i)+w.getW(i)-1)<1e-5;}});
  const clipDiff=[];
  const clips=loaded.animations.every(c=>{const n=me.clips.get(c.name);if(n)for(let i=0;i<c.tracks.length;i++){const a=n.tracks[i],b=c.tracks[i];if(a.name!==b.name||JSON.stringify(Array.from(a.values))!==JSON.stringify(Array.from(b.values)))clipDiff.push([a.name,b.name,a.values.length,b.values.length]);}return n&&n.duration===c.duration&&JSON.stringify(n.tracks.map(t=>({name:t.name,times:Array.from(t.times),values:Array.from(t.values)})))===JSON.stringify(c.tracks.map(t=>({name:t.name,times:Array.from(t.times),values:Array.from(t.values)})));});
  for(let i=0;i<1000;i++)__fps.game.update(1/60,{});
  const before={x:__fps.game.player.x,z:__fps.game.player.z};for(let i=0;i<30;i++)__fps.game.update(1/60,{forward:1});__fps.render();
  const movement=Math.hypot(__fps.game.player.x-before.x,__fps.game.player.z-before.z);
  return {clipDiff,meshes,bones:me.bones.size,clips:me.clips.size,weights,binds,materials,geometry,clipsEqual:clips,actors:__fps.game.actors.length,movement,sha256:row.sha256,glb:await new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result.split(',')[1]);reader.readAsDataURL(new Blob([row.bytes]));})};
 });
 const glb=result.glb;delete result.glb;console.log(JSON.stringify(result));
 assert.equal(result.bones,65);assert.equal(result.clips,13);assert.equal(result.actors,10);for(const key of ['weights','binds','materials','geometry','clipsEqual'])assert.equal(result[key],true,key);assert(result.movement>0);
 await writeFile('test-results/private-character/pilot.glb',Buffer.from(glb,'base64'));
 // The natural starting match, looking at A-02; no repositioned actors.
 await page.evaluate(()=>{__fps.start('analysts');const p=__fps.game.player,f=__fps.game.actors.find(a=>a.id==='analysts-1'),dx=f.x-p.x,dz=f.z-p.z;__fps.step({yaw:Math.atan2(-dx,-dz),pitch:Math.atan2((f.y+.9)-(p.y+1.6),Math.hypot(dx,dz))},1/60);});
 await page.screenshot({path:'test-results/private-character/match.png'});
 result.firstPerson=await verifyPrivateHands(page);
 // Render actual FPS avatar in isolated inspection lighting, without a second implementation.
 const images=await page.evaluate(async()=>{
  const T=await import('../vendor/three/three.module.js');const s=__fps.renderer.actors.get('analysts-1').userData.avatar;
  const scene=new T.Scene();scene.background=new T.Color('#e4edeb');scene.add(new T.HemisphereLight(0xffffff,0x778788,2.5));const light=new T.DirectionalLight(0xffffff,2);light.position.set(3,5,4);scene.add(light);
  s.holder.removeFromParent();scene.add(s.holder);s.holder.rotation.y=0;s.holder.position.set(0,0,0);s.mixer.stopAllAction();
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(600,760);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;
  const camera=new T.PerspectiveCamera(30,600/760,.01,20);camera.position.set(1.6,1.1,3.5);camera.lookAt(0,.87,0);
  const images={};let finite=true;
  for(const name of ['Idle_Loop','Walk_Loop','Crouch_Idle_Loop','Pistol_Reload','Death01']){
   s.mixer.stopAllAction();const clip=s.clips.get(name);s.mixer.clipAction(clip).reset().play();s.mixer.setTime(clip.duration*.45);scene.updateMatrixWorld(true);s.root.traverse(o=>{if(o.isSkinnedMesh){o.skeleton.update();for(let i=0;i<o.geometry.attributes.position.count;i++){const p=o.getVertexPosition(i,new T.Vector3());finite&&=p.toArray().every(Number.isFinite);}}});renderer.render(scene,camera);images[name]=renderer.domElement.toDataURL();
  }renderer.dispose();if(!finite)throw Error('Non-finite animated vertices');return images;
 });
 for(const [name,data]of Object.entries(images))await writeFile('test-results/private-character/'+name+'.png',Buffer.from(data.split(',')[1],'base64'));
 await page.reload();await page.waitForFunction(()=>window.__fps||!document.querySelector('#fatal').hidden,null,{timeout:240000,polling:100});assert(await page.locator('#fatal').isHidden());
 await page.locator('#original-character-match').click();await page.waitForFunction(()=>!document.querySelector('#start').disabled,null,{timeout:240000,polling:100});assert.equal(await page.locator('#private-character-note').count(),0);
 await page.goto(origin+'/fps/?character=invalid');await page.locator('#fatal').waitFor({state:'visible'});assert.match(await page.locator('#fatal').innerText(),/Ogiltig privat karaktärslänk/);
 await verifySavedCharacterMenu(page,origin);await verifyCharacterStorage(browser,origin);assert.deepEqual(errors,[]);await writeFile('test-results/private-character/result.json',JSON.stringify(result,null,2));console.log('PRIVATE_CHARACTER_MATCH_OK',JSON.stringify(result));
 await context.close();
}finally{await browser.close();}
