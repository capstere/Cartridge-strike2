/** Real catalogue controls, shelf placement, per-pair colour and FPS/ZIP parity.
 * GENERATE_THUMBS=1 regenerates small previews from the actual shipped meshes.
 */
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {readFile} from 'node:fs/promises';
import {createServer} from 'node:http';
import {resolve,extname,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const require=createRequire(import.meta.url),{chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const root=fileURLToPath(new URL('../',import.meta.url)),out=resolve(root,'test-results/studio-lab');mkdirSync(out,{recursive:true});
let server;
const mime={'.mjs':'text/javascript','.js':'text/javascript','.html':'text/html','.css':'text/css','.json':'application/json','.glb':'model/gltf-binary','.png':'image/png','.webp':'image/webp','.svg':'image/svg+xml','.ogg':'audio/ogg','.mp3':'audio/mpeg','.jpg':'image/jpeg'};
let origin=process.env.FPS_TEST_ORIGIN;
if(!origin){
 server=createServer(async(req,res)=>{try{const url=new URL(req.url,'http://localhost'),path=resolve(root,'.'+decodeURIComponent(url.pathname)+(url.pathname.endsWith('/')?'index.html':''));if(!path.startsWith(root)){res.writeHead(403);res.end();return;}
  const bytes=await readFile(path);res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(bytes);
 }catch{res.writeHead(404);res.end();}});
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));origin=`http://127.0.0.1:${server.address().port}`;
}
const browser=await chromium.launch({headless:true,...(process.env.PLAYWRIGHT_EXECUTABLE_PATH?{executablePath:process.env.PLAYWRIGHT_EXECUTABLE_PATH}:{}),args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox']});
const context=await browser.newContext({viewport:{width:1600,height:1050},acceptDownloads:true});
await context.addInitScript(()=>{if(location.pathname.endsWith('/walk.html'))requestAnimationFrame=()=>0;});
const page=await context.newPage(),errors=[],failed=[];page.setDefaultTimeout(45000);
page.on('pageerror',e=>errors.push(e.message));page.on('response',r=>{if(r.status()>=400&&!r.url().endsWith('/favicon.ico'))failed.push(r.status()+' '+r.url());});
try{
 await page.goto(origin+'/furniture-editor/new.html?test=1');await page.waitForFunction(()=>!!window.__levelStudio);
 const models=await page.evaluate(async generate=>{
  const T=await import('../vendor/three/three.module.js'),{buildProjectFurniture}=await import('./build/project-visuals.mjs');
  const {LAB_FURNITURE_LIBRARY}=await import('./library/lab-furniture.mjs'),{OFFICE_LIBRARY}=await import('./library/office-catalog.mjs'),{FPS_LIBRARY}=await import('./library/fps-catalog.mjs');
  const renderer=new T.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});renderer.setSize(384,320);renderer.setPixelRatio(1);renderer.outputColorSpace=T.SRGBColorSpace;renderer.toneMapping=T.ACESFilmicToneMapping;renderer.toneMappingExposure=1.05;
  const scene=new T.Scene();scene.background=new T.Color(0xe5ebed);scene.add(new T.HemisphereLight(0xffffff,0x667785,2.4));const key=new T.DirectionalLight(0xffffff,2.7);key.position.set(-3,5,-4);scene.add(key);
  const camera=new T.PerspectiveCamera(34,384/320,.001,100),rows=[];
  for(const entry of [...LAB_FURNITURE_LIBRARY,...OFFICE_LIBRARY,...FPS_LIBRARY]){
   const group=new T.Group();scene.add(group);
   await buildProjectFurniture([{id:'model',kind:'prop',assetId:entry.id,assetName:entry.name,assetRole:'other',w:entry.width,d:entry.depth,height:entry.height,x:0,z:0,yaw:0}],group);
   group.updateMatrixWorld(true);const bounds=new T.Box3().setFromObject(group),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
   group.position.sub(center);const scale=2.2/Math.max(size.x,size.y,size.z);group.scale.setScalar(scale);group.position.multiplyScalar(scale);
   const front=entry.wallFacing||'-z',sign=front.startsWith('-')?-1:1;
   camera.position.set(front.endsWith('x')?sign*5.1:3,1.8,front.endsWith('x')?3:sign*5.1);camera.lookAt(0,0,0);renderer.render(scene,camera);
   let meshes=0,textures=0;group.traverse(n=>{if(n.isMesh){meshes++;for(const m of Array.isArray(n.material)?n.material:[n.material])if(m.map){if(!m.map.image?.width)throw Error(entry.id+' texture not decoded');textures++;}}});
   if(renderer.getContext().getError())throw Error('WebGL error: '+entry.id);
   const thumb=entry.thumb||`./library/thumbs/${entry.pack==='fps'?'fps':'lab-furniture'}/${entry.model||entry.shape}.png`;
   rows.push({id:entry.id,name:entry.name,size:size.toArray(),meshes,textures,drawCalls:renderer.info.render.calls,triangles:renderer.info.render.triangles,thumb,image:generate?renderer.domElement.toDataURL('image/png').split(',')[1]:null});scene.remove(group);
  }
  renderer.dispose();return rows;
 },process.env.GENERATE_THUMBS==='1');
 for(const row of models){assert(row.meshes>0&&row.triangles>0);if(row.image){const path=resolve(root,'furniture-editor',row.thumb);mkdirSync(dirname(path),{recursive:true});writeFileSync(path,Buffer.from(row.image,'base64'));delete row.image;}}
 if(process.env.THUMBS_ONLY==='1'){writeFileSync(out+'/models.json',JSON.stringify(models,null,2));console.log(JSON.stringify({status:'PASS',models}));}
 else{
  const seed=await page.evaluate(async()=>{const {exportProject}=await import('./build/level-project.mjs'),{makeEntry}=await import('./build/architecture.mjs');const p=exportProject({projectId:'lvl-lab-furniture-test',name:'Labb och entré'});
   p.ground.bounds={x0:-7,z0:-6,x1:7,z1:6};p.ground.floors=[{id:'BYGG-G-0001',name:'Labb',role:'room',surface:'vinyl',x0:-6,z0:-5,x1:6,z1:5}];
   p.architecture.added=[makeEntry('BYGG-V-0001','wall',[-6,-5],[6,-5]),makeEntry('BYGG-V-0002','wall',[-6,-5],[-6,5]),makeEntry('BYGG-V-0003','wall',[6,-5],[6,5])];return p;});
  await page.locator('#open').setInputFiles({name:'lab.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(seed))});await page.waitForFunction(()=>__levelStudio.project.projectId==='lvl-lab-furniture-test');
  await page.locator('[data-tab="furnish"]').click();await page.locator('#autoPlace').uncheck();
  for(const [query,id]of [['biosafety','studio:biosafety-cabinet'],['skostall','studio:shoe-rack-black'],['skohylla','studio:shoe-shelf-white'],['skor','studio:shoes'],['whiteboard','office:whiteboard-mobile'],['ricoh','office:ricoh-printer'],['cartridge','fps:cartridge'],['binder','fps:binder-vacuum-oven']]){
   await page.locator('#catalogSearch').fill(query);assert(await page.locator(`[data-asset="${id}"]`).count()>0,query+' is searchable');
  }
  await page.locator('#catalogSearch').fill('');
  const place=async(id,x,z)=>{await page.locator(`[data-asset="${id}"]`).click();await page.waitForFunction(id=>__levelStudio.pendingAsset?.id===id&&__levelStudio.pendingAsset.ready,id);const q=await page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);await page.mouse.click(q.x,q.y);await page.keyboard.press('Escape');const item=await page.evaluate(id=>__levelStudio.project.furniture.added.filter(o=>o.assetId===id).at(-1),id);assert(item,id+' placed');return item;};
  const bsc=await place('studio:biosafety-cabinet',-4,1.8),rack=await place('studio:shoe-rack-black',-1.4,0),shelf=await place('studio:shoe-shelf-white',-2,-4.9);
  assert(shelf.wallMount&&shelf.elevation>1,'wall shelf attaches');
  const shoe=await place('studio:shoes',rack.x-.2,rack.z);assert.equal(shoe.mountId,rack.id);assert.equal(shoe.mountSurface,2);assert.equal(shoe.elevation,.6);
  await page.evaluate(id=>__levelStudio.select(id),shoe.id);await page.locator('#dockShelf').selectOption('0');
  await page.locator('#dockColor').evaluate(el=>{el.value='#2474d8';el.dispatchEvent(new Event('change',{bubbles:true}));});
  const savedItem=id=>page.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id),id);
  const dragOnPlan=async(fromX,fromZ,toX,toZ)=>{
   const point=(x,z)=>page.evaluate(([x,z])=>__levelStudio.screenWorldPoint(x,z),[x,z]);
   const from=await point(fromX,fromZ),to=await point(toX,toZ);
   await page.mouse.move(from.x,from.y);await page.mouse.down();await page.mouse.move(to.x,to.y,{steps:4});await page.mouse.up();
  };
  await page.locator('#dockShelf').selectOption('1');assert.equal((await savedItem(shoe.id)).elevation,.36);
  await page.locator('#dockShelf').selectOption('0');
  await page.locator('#dockRotateLeft').click();
  const turned=await savedItem(shoe.id);assert(Math.abs(turned.yaw-Math.PI/12)<1e-5);
  await page.locator('#editDockClose').click();
  await dragOnPlan(turned.x,turned.z,rack.x+.1,rack.z);
  const slid=await savedItem(shoe.id);assert(Math.abs(slid.x-turned.x)>.1,'shoe pair moved along the shelf');
  assert.equal(slid.yaw,turned.yaw,'sliding shoes on the same shelf must keep their rotation');
  // Grab the exposed end of the rack, then rotate the selected assembly.
  await dragOnPlan(rack.x-.4,rack.z,rack.x+.2,rack.z+.5);
  const movedRack=await savedItem(rack.id),movedPair=await savedItem(shoe.id);
  assert(Math.abs(movedRack.z-rack.z)>.3,'rack moved');
  assert(Math.abs((movedPair.x-slid.x)-(movedRack.x-rack.x))<1e-5);
  assert(Math.abs((movedPair.z-slid.z)-(movedRack.z-rack.z))<1e-5);
  await page.locator('#dockRotateLeft').click();
  const changed=await savedItem(shoe.id);assert(Math.abs(changed.yaw-slid.yaw-Math.PI/12)<1e-5);
  assert.equal(changed.color,'#2474d8');assert.equal(changed.elevation,.12);assert.equal(changed.mountId,rack.id);assert.equal(changed.mountSurface,0);
  const wallShoe=await place('studio:shoes',shelf.x+.2,shelf.z);assert.equal(wallShoe.mountId,shelf.id);assert(Math.abs(wallShoe.elevation-shelf.elevation-.14)<.001);
  // Exercise the real inspector callbacks with an occupied wall shelf. The
  // off-centre shoe pair catches rotation/translation bugs that a centred prop
  // would hide; its selected support and colour must survive every operation.
  const angle=value=>Math.atan2(Math.sin(value),Math.cos(value));
  const localPose=(child,parent)=>{const c=Math.cos(parent.yaw),s=Math.sin(parent.yaw),x=child.x-parent.x,z=child.z-parent.z;return {x:c*x-s*z,z:s*x+c*z,yaw:angle(child.yaw-parent.yaw)};};
  const originalWallShoePose=localPose(wallShoe,shelf),wallShelfControls=[];
  const checkWallShelf=async action=>{
   const state=await page.evaluate(([parentId,childId])=>({shelf:__levelStudio.project.furniture.added.find(o=>o.id===parentId),shoes:__levelStudio.project.furniture.added.find(o=>o.id===childId)}),[shelf.id,wallShoe.id]);
   const local=localPose(state.shoes,state.shelf),near=(a,b)=>Math.abs(a-b)<.00002;
   assert(near(local.x,originalWallShoePose.x)&&near(local.z,originalWallShoePose.z),action+': shoes keep their offset on the shelf');
   assert(near(angle(local.yaw-originalWallShoePose.yaw),0),action+': shoes turn with the shelf');
   assert(near(state.shoes.elevation,(state.shelf.elevation||0)+state.shelf.height),action+': shoes stay on the physical top surface');
   assert.equal(state.shoes.mountId,shelf.id,action+': support identity');assert.equal(state.shoes.mountSurface,0,action+': chosen shelf surface');assert.equal(state.shoes.color,wallShoe.color,action+': colour');
   assert.deepEqual([state.shoes.w,state.shoes.d,state.shoes.height],[wallShoe.w,wallShoe.d,wallShoe.height],action+': shoes are not resized with their shelf');
   wallShelfControls.push({action,...state});return state;
  };
  await page.evaluate(id=>__levelStudio.select(id),shelf.id);
  if(!await page.locator('#editDock .dock-details').evaluate(el=>el.open))await page.locator('#editDock .dock-details > summary').click();
  const setDockNumber=async(id,value)=>{await page.locator('#'+id).fill(String(value));await page.locator('#'+id).press('Tab');};
  await setDockNumber('dockHeight',.28);let wallState=await checkWallShelf('resize shelf height');assert.equal(wallState.shelf.height,.28);
  await setDockNumber('dockWallY',1.9);wallState=await checkWallShelf('change mounting height');assert.equal(wallState.shelf.wallMount.y,1.9);
  await page.locator('#dockWallSide').click();wallState=await checkWallShelf('opposite wall side');assert.equal(wallState.shelf.wallMount.side,-shelf.wallMount.side);
  await page.locator('#dockWallSide').click();wallState=await checkWallShelf('restore wall side');assert.equal(wallState.shelf.wallMount.side,shelf.wallMount.side);
  for(const front of ['+z','+x']){await page.locator('#dockFacing').click();wallState=await checkWallShelf('face '+front);assert.equal(wallState.shelf.wallFacing,front);}
  await page.locator('#dockMountMode').selectOption('floor');wallState=await checkWallShelf('place occupied shelf on floor');assert.equal(wallState.shelf.wallMount,null);assert.equal(wallState.shelf.elevation,0);
  await page.locator('#dockMountMode').selectOption('wall');wallState=await checkWallShelf('reattach occupied shelf to wall');assert(wallState.shelf.wallMount);assert.equal(await page.locator('#dockMountMode').inputValue(),'wall');
  for(const front of ['-x','-z']){await page.locator('#dockFacing').click();wallState=await checkWallShelf('face '+front);assert.equal(wallState.shelf.wallFacing,front);}
  await setDockNumber('dockHeight',shelf.height);await checkWallShelf('restore shelf height');
  await setDockNumber('dockWallY',shelf.wallMount.y);await checkWallShelf('restore mounting height');
  await page.evaluate(id=>__levelStudio.select(id),wallShoe.id);assert.equal(await page.locator('#dockShelf').inputValue(),'0');assert.equal(await page.locator('#dockMountMode').inputValue(),'surface');
  assert.deepEqual(await page.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id),shoe.id),changed,'editing the wall assembly leaves the floor-rack pair untouched');
  writeFileSync(out+'/wall-shelf-controls.json',JSON.stringify(wallShelfControls,null,2));
  const printer=await place('office:ricoh-printer',3.9,1.5),board=await place('office:whiteboard-mobile',3.4,-1.4);
  assert.equal(printer.elevation,0);assert.equal(board.elevation,0);
  const cartridge=await place('fps:cartridge',bsc.x,bsc.z);assert.equal(cartridge.mountId,bsc.id);assert.equal(cartridge.elevation,.904);
  for(const item of [board,printer,cartridge]){
   if(await page.locator('#editDockClose').isVisible())await page.locator('#editDockClose').click();
   await dragOnPlan(item.x,item.z,item.x+.2,item.z);
   assert.equal(await page.evaluate(()=>__levelStudio.selected),item.id,'pointer selects '+item.assetId);
   const moved=await savedItem(item.id);assert(moved.x>item.x+.1,'pointer moves '+item.assetId);
   await page.locator('#dockRotateLeft').click();assert(Math.abs((await savedItem(item.id)).yaw-moved.yaw-Math.PI/12)<1e-5,'rotate '+item.assetId);
  }
  await page.locator('#threeView').click();await page.waitForFunction(ids=>ids.every(id=>__levelStudio.visualFurniture.some(o=>o.id===id&&o.realModel)),[printer.id,board.id]);
  assert(await page.evaluate(id=>__levelStudio.visualColors.some(o=>o.id===id&&o.color==='2474d8'),shoe.id),'shoe colour reaches actual material');
  assert(await page.evaluate(id=>!__levelStudio.visualColors.some(o=>o.id===id&&o.color==='2474d8'),wallShoe.id),'one pair cannot recolour another');
  await page.screenshot({path:out+'/studio.png'});
  const download=page.waitForEvent('download');await page.locator('#save').click();const zip=readFileSync(await(await download).path()),before=await page.evaluate(()=>JSON.parse(JSON.stringify(__levelStudio.project)));
  await page.locator('#open').setInputFiles({name:'lab.zip',mimeType:'application/zip',buffer:zip});await page.waitForFunction(()=>document.querySelector('#status').textContent.startsWith('Projektet öppnat'));assert.deepEqual(await page.evaluate(()=>structuredClone(__levelStudio.project)),before);
  await page.locator('#walkView').click();await page.waitForFunction(()=>!!document.querySelector('#walkFrame').contentWindow.__walk?.renderer?.projectFurniture);
  const frame=page.frames().find(f=>f.url().includes('/fps/walk.html'));assert(frame);
  const fps=await frame.evaluate(ids=>{const r=__walk.renderer,rows=ids.map(id=>{const holder=r.projectFurniture.children.find(o=>o.userData.editId===id);if(!holder)throw Error('Missing FPS furniture '+id);let meshes=0,colors=[];holder.traverse(o=>{if(o.isMesh){meshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])if(m.color)colors.push(m.color.getHexString());}});return {id,meshes,colors,x:holder.position.x,y:holder.position.y,z:holder.position.z,yaw:holder.rotation.y};});r.camera.position.set(5.2,2.55,4.4);r.camera.lookAt(-1,.85,-1);r.camera.updateMatrixWorld();r.renderer.render(r.scene,r.camera);return {rows,webgl:r.renderer.getContext().getError()};},[bsc.id,rack.id,shelf.id,shoe.id,wallShoe.id,printer.id,board.id,cartridge.id]);
  assert(fps.rows.every(r=>r.meshes>0));assert.equal(fps.webgl,0);assert(fps.rows.find(r=>r.id===shoe.id).colors.includes('2474d8'));assert.equal(fps.rows.find(r=>r.id===shoe.id).y,.12);
  for(const row of fps.rows){
   const item=before.furniture.added.find(o=>o.id===row.id);
   assert.deepEqual([row.x,row.y,row.z,row.yaw],[item.x,item.elevation||0,item.z,item.yaw],'reopened FPS pose for '+item.assetId);
  }
  await frame.locator('#game').screenshot({path:out+'/fps.png'});await page.evaluate(()=>__levelStudio.leaveWalk());await page.reload();await page.waitForFunction(()=>!!window.__levelStudio);assert.deepEqual(await page.evaluate(()=>__levelStudio.project.furniture.added),before.furniture.added);
  await page.goto(origin+'/furniture-editor/');await page.waitForFunction(()=>!!window.__furnitureEditor);await page.locator('#openLibrary').click();await page.locator('#librarySearch').fill('skor');assert(await page.locator('.library-tile').count()>=1);await page.locator('#librarySearch').fill('ricoh');assert.equal(await page.locator('.library-tile').count(),1);
  assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);const result={status:'PASS',models,shelfLevels:true,wallShelfControls:wallShelfControls.map(step=>step.action),perPairColor:true,zipRoundtrip:true,autosave:true,classicCatalogue:true,fps,errors,failed};writeFileSync(out+'/result.json',JSON.stringify(result,null,2));console.log(JSON.stringify(result));
 }
}catch(error){await page.screenshot({path:out+'/failure.png'}).catch(()=>{});writeFileSync(out+'/failure.json',JSON.stringify({error:String(error),stack:error.stack,errors,failed},null,2));throw error;}
finally{await browser.close();if(server)await new Promise(resolve=>server.close(resolve));}
