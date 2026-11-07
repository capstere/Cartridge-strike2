/** Smoke for the human workflow, not only the schema. Uses real Chromium/WebGL. */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
const require=createRequire(import.meta.url);
const {chromium}=require('../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FPS_TEST_ORIGIN||'http://127.0.0.1:8765';
const browser=await chromium.launch({headless:true,args:[
 '--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
 '--ignore-gpu-blocklist','--no-sandbox'
]});
const errors=[];
const track=page=>page.on('pageerror',e=>errors.push(e.message));

try{
 const desktop=await browser.newContext({viewport:{width:1360,height:880}});
 const hub=await desktop.newPage();track(hub);
 assert.equal((await hub.goto(origin+'/studio/')).status(),200);
 assert.equal(await hub.locator('.studio-card').count(),2);
 assert.equal(await hub.locator('.card-link').count(),2);
 assert.equal(await hub.locator('.secondary-links a').count(),2);
 assert((await hub.locator('a[href="../character-design/"]').count())>=1);
 assert((await hub.locator('a[href="../furniture-editor/new.html"]').count())>=1);
 await hub.close();

 // The no-instructions beginner journey: one tap creates a valid room + real door,
 // then furniture, saving and first-person walking work on the same project.
 const beginnerContext=await browser.newContext({viewport:{width:1280,height:850},acceptDownloads:true});
 const beginner=await beginnerContext.newPage();track(beginner);
 await beginner.goto(origin+'/furniture-editor/new.html?test=1',{waitUntil:'domcontentloaded'});
 await beginner.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),0);
 await beginner.locator('#kidRoom').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),1);
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),1,
   'One-click room includes an actual standard door');
 const actualDoor=await beginner.evaluate(()=>__levelStudio.project.architecture.added.find(x=>x.kind==='door'));
 assert(Math.abs(Math.hypot(actualDoor.b[0]-actualDoor.a[0],actualDoor.b[1]-actualDoor.a[1])-1.2)<.002);
 const startup=await beginner.evaluate(()=>({walls:__levelStudio.project.architecture.added.length,
   zoom:__levelStudio.viewState.zoom}));
 assert(startup.walls>=5&&startup.zoom>4,'Room must fill the screen with actual wall geometry');
 await beginner.locator('#undo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),0,'Starter room undone in one step');
 await beginner.locator('#redo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),1,
   'Redo restores entire room and doorway in one step');

 // A second room shares the existing wall and inserts a real doorway.
 await beginner.locator('#kidRoom').click();
 await beginner.locator('#roomChoices').waitFor({state:'visible'});
 assert(await beginner.locator('[data-room-side="right"]').isEnabled());
 assert(await beginner.locator('[data-room-side="above"]').isDisabled(),
  'The starter rooms existing exterior doorway cannot be overwritten');
 await beginner.locator('[data-room-side="right"]').hover();
 await beginner.locator('[data-room-side="right"]').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),2);
 const adjacent=await beginner.evaluate(()=>({
  first:__levelStudio.project.ground.floors[0],
  second:__levelStudio.project.ground.floors[1],
  doors:__levelStudio.project.architecture.added.filter(e=>e.kind==='door'),
  walls:__levelStudio.project.architecture.added.filter(e=>e.kind==='wall')
 }));
 assert.equal(adjacent.first.x1,adjacent.second.x0,'Rooms share one precise boundary');
 assert.equal(adjacent.doors.length,2,'A real internal doorway connects the rooms');
 assert(adjacent.doors.some(d=>Math.abs(d.a[0]-adjacent.second.x0)<.002&&
  Math.abs(d.b[0]-adjacent.second.x0)<.002),'The internal door occupies the common wall');
 assert(!adjacent.walls.some(w=>Math.abs(w.a[0]-adjacent.second.x0)<.002&&
  Math.abs(w.b[0]-adjacent.second.x0)<.002&&
  Math.min(w.a[1],w.b[1])<0&&Math.max(w.a[1],w.b[1])>0),
  'No invisible solid wall remains across the door opening');
 await beginner.locator('#undo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),1,
  'Adding a room plus the internal doorway is a single undo action');
 await beginner.locator('#redo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),2);

 // Kid-friendly wall resizing: tap the room, drag its green arrow, and its
 // top/bottom corners follow. The shared door stays unchanged and passable.
 await beginner.evaluate(()=>__levelStudio.select(__levelStudio.project.ground.floors[1].id));
 const beforeWall=await beginner.evaluate(()=>structuredClone(__levelStudio.project.ground.floors));
 const wallDragStart=await beginner.evaluate(()=>{
  const f=__levelStudio.project.ground.floors[1];
  return __levelStudio.screenWorldPoint(f.x1,f.z0+(f.z1-f.z0)*.28);
 });
 const wallDragTarget=await beginner.evaluate(()=>{
  const f=__levelStudio.project.ground.floors[1];
  return __levelStudio.screenWorldPoint(f.x1+1.5,f.z0+(f.z1-f.z0)*.28);
 });
 await beginner.mouse.move(wallDragStart.x,wallDragStart.y);
 await beginner.mouse.down();
 await beginner.mouse.move(wallDragTarget.x,wallDragTarget.y,{steps:8});
 await beginner.mouse.up();
 const resized=await beginner.evaluate(()=>({
  first:structuredClone(__levelStudio.project.ground.floors[0]),
  second:structuredClone(__levelStudio.project.ground.floors[1]),
  doors:__levelStudio.project.architecture.added.filter(x=>x.kind==='door')
 }));
 assert.equal(resized.second.x0,beforeWall[1].x0,'The shared wall stays where it was');
 assert(resized.second.x1>beforeWall[1].x1+1,'The green arrow enlarges only the selected room');
 assert.deepEqual(resized.first,beforeWall[0],'Neighbor room remains exactly unchanged');
 assert.equal(resized.doors.length,2,'No door vanishes during a wall move');
 assert(resized.doors.every(d=>Math.abs(Math.hypot(d.b[0]-d.a[0],d.b[1]-d.a[1])-1.2)<.002),
  'Both actual doors retain the standard 1.20 opening');
 await beginner.locator('#undo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors[1].x1),beforeWall[1].x1,
  'A wall drag is exactly one undo step');
 await beginner.locator('#redo').click();
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors[1].x1),resized.second.x1,
  'Redo recovers the wall position and doorway');
 // Occupied sides are unavailable; choosing a different room remains possible.
 await beginner.evaluate(()=>__levelStudio.select(__levelStudio.project.ground.floors[0].id));
 await beginner.locator('#kidRoom').click();
 assert(await beginner.locator('[data-room-side="right"]').isDisabled());
 assert(await beginner.locator('[data-room-side="below"]').isEnabled());
 await beginner.locator('#roomChoiceClose').click();
 await beginner.locator('#kidFurnish').click();
 assert(await beginner.locator('[data-panel="furnish"]').isVisible());
 await beginner.locator('[data-kid-category="bord"]').click();
 assert.equal(await beginner.locator('#catalogCategory').inputValue(),'bord','Picture categories drive the real catalogue');
 assert(await beginner.locator('#catalogCards .catalog-card').count()>0);
 await beginner.locator('#catalogCards .catalog-card').first().click();
 const placement=await beginner.evaluate(()=>__levelStudio.screenWorldPoint(0,1));
 await beginner.mouse.click(placement.x,placement.y);
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.furniture.added.length),1,
   'A child can place furniture after one click on a picture');
 const downloadPromise=beginner.waitForEvent('download',{timeout:90000});
 await beginner.locator('#kidSave').click();
 const downloaded=await downloadPromise;
 assert.match(downloaded.suggestedFilename(),/\.zip$/,'One-click project export downloads a ZIP');
 await beginner.reload({waitUntil:'domcontentloaded'});
 await beginner.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors.length),2);
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.furniture.added.length),1);
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),2,
   'Both rooms, their doorways and the furniture survive reload');
 assert.equal(await beginner.evaluate(()=>__levelStudio.project.ground.floors[1].x1),resized.second.x1,
  'A dragged wall and its attached openings survive reload');
 await beginner.locator('#kidWalk').click();
 await beginner.locator('#walkFrame').waitFor({state:'visible',timeout:90000});
 await beginner.waitForFunction(()=>!!document.querySelector('#walkFrame')?.contentWindow?.__walk?.renderer,
   null,{timeout:90000});
 const connectedFrame=beginner.frame({url:/\/fps\/walk\.html/});
 assert(connectedFrame,'First-person preview is a real running game instance');
 const pathBetweenRooms=await connectedFrame.evaluate(()=>__walk.world.findPath({x:0,z:0},{x:8,z:0}));
 assert(Array.isArray(pathBetweenRooms)&&pathBetweenRooms.length>0,
  'The player and bots can navigate between the first and second room');
 await beginner.locator('#kidWalk').click();
 assert(await beginner.locator('#plan').isVisible(),'Simple walk button returns to the editor');
 await beginner.close();await beginnerContext.close();

 // Complete hands-on mounting: counter → microwave, wall picture, edit its height,
 // move its support, resize its wall, export and reload the same real 3D objects.
 const mountContext=await browser.newContext({viewport:{width:1280,height:860},acceptDownloads:true});
 const mountPage=await mountContext.newPage();track(mountPage);
 await mountPage.goto(origin+'/furniture-editor/new.html?test=1',{waitUntil:'domcontentloaded'});
 await mountPage.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 await mountPage.locator('#kidRoom').click();
 await mountPage.locator('#kidFurnish').click();
 assert.equal(await mountPage.locator('#placementMode').inputValue(),'auto');
 await mountPage.locator('#catalogCards [data-asset="studio:counter-120"]').click();
 let placeAt=await mountPage.evaluate(()=>__levelStudio.screenWorldPoint(0,0));
 await mountPage.mouse.click(placeAt.x,placeAt.y);
 const supportId=await mountPage.evaluate(()=>__levelStudio.project.furniture.added.at(-1).id);
 assert.equal(await mountPage.evaluate(()=>__levelStudio.project.furniture.added.at(-1).elevation),0);
 await mountPage.locator('#catalogCards [data-asset="kenney:furniture-kit:kitchenmicrowave"]').click();
 await mountPage.locator('#threeView').click();
 await mountPage.locator('#scene3d').waitFor({state:'visible'});
 await mountPage.waitForFunction(id=>__levelStudio.visualColors.some(row=>row.id===id),
  supportId,{timeout:30000});
 const topPoint=await mountPage.evaluate(()=>__levelStudio.screen3DPoint(0,.899,0));
 await mountPage.mouse.move(topPoint.x,topPoint.y);
 await mountPage.waitForFunction(id=>__levelStudio.snapPreview.kind==='surface'&&
  __levelStudio.snapPreview.targetId===id,supportId,{timeout:15000});
 const topPreview=await mountPage.evaluate(()=>__levelStudio.snapPreview);
 assert(topPreview.highlightCount>=2,'Actual table top has a transparent highlight and bright outline');
 assert.match(topPreview.label,/Ovanpå/);
 assert.match(await mountPage.locator('#activeHelp').textContent(),/Ovanpå/);
 // Manual floor placement intentionally turns off snapping and target highlights.
 await mountPage.locator('#placementMode').selectOption('floor');
 await mountPage.mouse.move(topPoint.x+4,topPoint.y);
 assert.equal(await mountPage.evaluate(()=>__levelStudio.snapPreview.kind),'floor');
 assert.equal(await mountPage.evaluate(()=>__levelStudio.snapPreview.highlightCount),0);
 await mountPage.locator('#placementMode').selectOption('auto');
 await mountPage.mouse.move(topPoint.x,topPoint.y);
 await mountPage.waitForFunction(id=>__levelStudio.snapPreview.targetId===id,
  supportId,{timeout:15000});
 await mountPage.mouse.click(topPoint.x,topPoint.y);
 const microwave=await mountPage.evaluate(()=>structuredClone(__levelStudio.project.furniture.added.at(-1)));
 await mountPage.locator('#planView').click();
 assert.equal(microwave.mountId,supportId,'A normal imported GLB microwave snaps on top of a procedural counter');
 assert(microwave.elevation>.8,'Microwave base rests on counter top, not inside the floor');
 await mountPage.locator('#catalogCards [data-asset="studio:wall-picture"]').click();
 await mountPage.locator('#threeView').click();
 await mountPage.locator('#cutaway').uncheck();
 const wallPoint=await mountPage.evaluate(()=>__levelStudio.screen3DPoint(4.055,1.55,0));
 await mountPage.mouse.move(wallPoint.x,wallPoint.y);
 await mountPage.waitForFunction(()=>__levelStudio.snapPreview.kind==='wall',{timeout:15000});
 const wallPreview=await mountPage.evaluate(()=>__levelStudio.snapPreview);
 assert(wallPreview.targetId?.startsWith('BYGG-V-'),'A real authored wall is highlighted');
 assert(wallPreview.highlightCount>=2,'Wall plane and edge outline are both visible');
 assert.match(wallPreview.label,/Väggen/);
 await mountPage.locator('#planView').click();
 placeAt=await mountPage.evaluate(()=>__levelStudio.screenWorldPoint(3.82,0));
 await mountPage.mouse.click(placeAt.x,placeAt.y);
 const wallPictureId=await mountPage.evaluate(()=>__levelStudio.project.furniture.added.at(-1).id);
 await mountPage.keyboard.press('Escape');
 const hanging=await mountPage.evaluate(()=>structuredClone(__levelStudio.project.furniture.added.at(-1)));
 assert(hanging.wallMount&&hanging.wallMount.wallId,'The picture has a stable real wall anchor');
 assert.equal(hanging.collision,'none','Wall decor never adds an invisible player blocker');
 assert(hanging.elevation>1);
 await mountPage.locator('.dock-details summary').click();
 await mountPage.locator('#dockWallHeightRow').waitFor({state:'visible'});
 await mountPage.locator('#dockWallY').fill('1.9');
 await mountPage.locator('#dockWallY').dispatchEvent('change');
 const raised=await mountPage.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id),wallPictureId);
 assert.equal(raised.wallMount.y,1.9,'The wall height control edits the actual saved geometry');
 assert(Math.abs(raised.elevation+raised.height/2-1.9)<.02);
 await mountPage.locator('#dockMountMode').selectOption('floor');
 assert.equal(await mountPage.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).wallMount,wallPictureId),null);
 await mountPage.locator('#dockMountMode').selectOption('wall');
 assert(await mountPage.evaluate(id=>!!__levelStudio.project.furniture.added.find(o=>o.id===id).wallMount,wallPictureId),
  'A user can switch freely between wall and floor mounting');
 await mountPage.evaluate(id=>__levelStudio.select(id),supportId);
 await mountPage.locator('#dockX').fill('1.1');
 await mountPage.locator('#dockX').dispatchEvent('change');
 const follow=await mountPage.evaluate(id=>{
  const things=__levelStudio.project.furniture.added;
  return {support:things.find(o=>o.id===id),microwave:things.find(o=>o.mountId===id)};
 },supportId);
 assert(follow.microwave,'The microwave still belongs to the moved counter');
 assert(Math.abs(follow.microwave.x-follow.support.x)<.15,'Mounted child follows support movement');
 await mountPage.locator('#dockHeight').fill('1.1');
 await mountPage.locator('#dockHeight').dispatchEvent('change');
 assert(await mountPage.evaluate(id=>{
  const objects=__levelStudio.project.furniture.added,s=objects.find(o=>o.id===id);
  return Math.abs(objects.find(o=>o.mountId===id).elevation-(s.height-.008))<.025;
 },supportId),'Counter height change keeps the microwave on top');
 await mountPage.locator('[data-tab="build"]').click();
 await mountPage.evaluate(()=>__levelStudio.select(__levelStudio.project.ground.floors[0].id));
 const oldWallX=await mountPage.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).x,wallPictureId);
 const dragStart=await mountPage.evaluate(()=>{
  const f=__levelStudio.project.ground.floors[0];
  return __levelStudio.screenWorldPoint(f.x1,f.z0+(f.z1-f.z0)*.28);
 });
 const dragEnd=await mountPage.evaluate(()=>{
  const f=__levelStudio.project.ground.floors[0];
  return __levelStudio.screenWorldPoint(f.x1+.7,f.z0+(f.z1-f.z0)*.28);
 });
 await mountPage.mouse.move(dragStart.x,dragStart.y);
 await mountPage.mouse.down();
 await mountPage.mouse.move(dragEnd.x,dragEnd.y,{steps:7});
 await mountPage.mouse.up();
 const movedPictureX=await mountPage.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).x,wallPictureId);
 assert(movedPictureX>oldWallX+.45,'The wall fixture follows a resized real wall');
 await mountPage.locator('#undo').click();
 assert(Math.abs((await mountPage.evaluate(id=>__levelStudio.project.furniture.added.find(o=>o.id===id).x,wallPictureId))-oldWallX)<.03,
  'Undo restores the wall and attached picture together');
 await mountPage.locator('#redo').click();
 await mountPage.locator('#threeView').click();
 assert(await mountPage.locator('#scene3d').isVisible());
 await mountPage.waitForFunction(id=>__levelStudio.visualColors.some(row=>row.id===id),
  wallPictureId,{timeout:30000});
 const fixtureDownload=mountPage.waitForEvent('download',{timeout:90000});
 await mountPage.locator('#kidSave').click();
 const fixtureZip=await fixtureDownload;
 assert.match(fixtureZip.suggestedFilename(),/\.zip$/);
 await mountPage.reload({waitUntil:'domcontentloaded'});
 await mountPage.waitForFunction(()=>!!window.__levelStudio?.project?.furniture?.added?.length,null,{timeout:90000});
 const restored=await mountPage.evaluate(id=>{
  const saved=__levelStudio.project.furniture.added;
  const picture=saved.find(o=>o.id===id);
  return {picture,attached:saved.find(o=>o.id!==id&&o.mountId)};
 },wallPictureId);
 assert(restored.picture.wallMount&&Math.abs(restored.picture.x-movedPictureX)<.02,
  'Wall mount pose and anchor persist through local autosave/reload');
 assert(restored.attached&&restored.attached.elevation>1,
  'Ordinary GLB on a counter persists as an actual mounted asset');
 await mountPage.close();await mountContext.close();

 // Regression: dragging a room larger than 50 used to fail with no floor.
 // A 100-unit map must also accept rooms almost as large as the whole level.
 const largeContext=await browser.newContext({viewport:{width:1280,height:850},acceptDownloads:true});
 const largePage=await largeContext.newPage();track(largePage);
 await largePage.goto(origin+'/furniture-editor/new.html?test=1',{waitUntil:'domcontentloaded'});
 await largePage.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 await largePage.locator('[data-tool="room"]').click();
 const dragRoom=async(a,b)=>{
  const start=await largePage.evaluate(q=>__levelStudio.screenWorldPoint(...q),a);
  const end=await largePage.evaluate(q=>__levelStudio.screenWorldPoint(...q),b);
  await largePage.mouse.move(start.x,start.y);
  const canvasBefore=await largePage.locator('#plan').boundingBox();
  await largePage.mouse.down();
  assert.deepEqual(await largePage.locator('#plan').boundingBox(),canvasBefore,'Status text must not resize the drawing surface mid-drag');
  await largePage.mouse.move(end.x,end.y,{steps:12});
  await largePage.mouse.up();
 };
 const cancelPoint=await largePage.evaluate(()=>__levelStudio.screenWorldPoint(0,0));
 await largePage.mouse.move(cancelPoint.x,cancelPoint.y);
 await largePage.mouse.down();
 await largePage.locator('#plan').dispatchEvent('pointercancel');
 await largePage.mouse.up();
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors.length),0,
  'A cancelled touch/drag may not create any ghost floor');
 await dragRoom([-34,-32],[34,32]);
 let big=await largePage.evaluate(()=>structuredClone(__levelStudio.project));
 assert.equal(big.ground.floors.length,1,'A 68 by 64 room must insert rather than silently fail');
 assert.deepEqual([big.ground.floors[0].x0,big.ground.floors[0].x1,big.ground.floors[0].z0,big.ground.floors[0].z1],
  [-34,34,-32,32]);
 assert.equal(big.architecture.added.filter(x=>x.kind==='wall').length,4,'All four walls must be real');
 assert.match(await largePage.locator('#status').innerText(),/Rummet är klart/);
 await largePage.locator('#undo').click();
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors.length),0,
  'Undo removes whole large room and its walls in one step');
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.architecture.added.length),0);
 await largePage.locator('#redo').click();
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors.length),1);
 await largePage.reload({waitUntil:'domcontentloaded'});
 await largePage.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors[0].x1-__levelStudio.project.ground.floors[0].x0),68,
  'A large room persists after reload without violating project validation');
 largePage.once('dialog',dialog=>dialog.accept());
 await largePage.locator('#newBlank').click();
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors.length),0,
  'A fresh map can start after reloading the first large room');
 await largePage.locator('#width').fill('100');
 await largePage.locator('#width').dispatchEvent('change');
 await largePage.locator('#depth').fill('100');
 await largePage.locator('#depth').dispatchEvent('change');
 await largePage.locator('#tool').selectOption('room');
 await dragRoom([-37,-37],[57,57]);
 big=await largePage.evaluate(()=>structuredClone(__levelStudio.project));
 assert.equal(big.ground.floors.length,1,'A 94 by 94 room fits on a 100 by 100 map');
 assert.equal(big.ground.floors[0].x1-big.ground.floors[0].x0,94);
 assert.equal(big.ground.floors[0].z1-big.ground.floors[0].z0,94);
 assert.equal(big.architecture.added.filter(x=>x.kind==='wall').length,4,
  'Long walls may not disappear, duplicate or leave invisible blockers');
 const largeDownload=largePage.waitForEvent('download',{timeout:90000});
 await largePage.locator('#kidSave').click();
 assert.match((await largeDownload).suggestedFilename(),/\.zip$/);
 await largePage.reload({waitUntil:'domcontentloaded'});
 await largePage.waitForFunction(()=>!!window.__levelStudio,null,{timeout:90000});
 assert.equal(await largePage.evaluate(()=>__levelStudio.project.ground.floors[0].x1-__levelStudio.project.ground.floors[0].x0),94,
  'Very large room survives export and autosave/reload');
 await largePage.close();await largeContext.close();

 const level=await desktop.newPage();track(level);
 await level.goto(origin+'/furniture-editor/new.html?test=1',{waitUntil:'domcontentloaded'});
 await level.waitForFunction(()=>!!window.__levelStudio,{timeout:90000});
 assert(await level.locator('#savePanel').isVisible(),'Desktop save panel initially visible');
 await level.locator('#stageFocus').click();
 assert.equal(await level.locator('#stageFocus').getAttribute('aria-pressed'),'true');
 assert(await level.locator('#savePanel').isHidden(),'Wide desktop scene removes clutter');
 assert(await level.locator('#quickSave').isVisible(),'ZIP save stays reachable');
 await level.locator('#stageFocus').click();
 assert(await level.locator('#savePanel').isVisible(),'Desktop inspector can return');

 // User journey: select a real room object, change 3 different visible attributes,
 // undo a change, autosave and reopen without touching project JSON by hand.
 await level.locator('#demo').click();
 await level.waitForFunction(()=>__levelStudio.project.furniture.added.some(o=>o.id==='NY-BORD-0001'));
 await level.evaluate(()=>__levelStudio.select('NY-BORD-0001'));
 await level.locator('#editDock').waitFor({state:'visible'});
 assert.match(await level.locator('#editDockName').textContent(),/bord|table/i);
 await level.locator('.dock-details summary').click();
 await level.locator('#dockWidth').fill('1.65');
 await level.locator('#dockWidth').dispatchEvent('change');
 assert.equal(await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').w),1.65);
 await level.locator('#dockHeight').fill('1.15');
 await level.locator('#dockHeight').dispatchEvent('change');
 assert.equal(await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').height),1.15);
 await level.locator('#dockCollision').selectOption('none');
 assert.equal(await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').collision),'none');
 const oldYaw=await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').yaw);
 await level.locator('#dockRotate').click();
 assert.notEqual(await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').yaw),oldYaw);
 await level.locator('#dockUndo').click();
 assert.equal(await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001').yaw),oldYaw);
 await level.locator('#editDockClose').click();
 assert(await level.locator('#editDock').isHidden());
 await level.locator('#editDockReopen').click();
 assert(await level.locator('#editDock').isVisible(),'Object editing reopens on demand');
 await level.locator('[data-tab="furnish"]').click();
 await level.locator('#catalogCards [data-asset="studio:orange-kitchen-chair"]').click();
 await level.locator('#editDock').waitFor({state:'hidden',timeout:5000});
 await level.reload({waitUntil:'domcontentloaded'});
 await level.waitForFunction(()=>!!window.__levelStudio?.project?.furniture?.added?.length);
 const saved=await level.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-BORD-0001'));
 assert(saved && saved.w===1.65 && saved.height===1.15 && saved.collision==='none',
   'Inspector changes survive autosave and reload');
 await level.close();await desktop.close();

 const mobile=await browser.newContext({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
 const phone=await mobile.newPage();track(phone);
 await phone.goto(origin+'/furniture-editor/new.html?test=1',{waitUntil:'domcontentloaded'});
 await phone.waitForFunction(()=>!!window.__levelStudio,{timeout:90000});
 const workBox=await phone.locator('.workspace').boundingBox();
 assert(workBox&&workBox.y<220,'Mobile scene should appear before all edit controls');
 assert(await phone.locator('#toolsPanel').isHidden(),'Mobile tools start hidden');
 assert(await phone.locator('#kidRoom').isVisible());
 await phone.locator('#kidRoom').click();
 assert.equal(await phone.evaluate(()=>__levelStudio.project.ground.floors.length),1);
 assert.equal(await phone.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),1);
 await phone.locator('#kidRoom').click();
 await phone.locator('#roomChoices').waitFor({state:'visible'});
 assert(await phone.locator('[data-room-side="right"]').isEnabled());
 await phone.locator('[data-room-side="right"]').click();
 assert.equal(await phone.evaluate(()=>__levelStudio.project.ground.floors.length),2);
 assert.equal(await phone.evaluate(()=>__levelStudio.project.architecture.added.filter(x=>x.kind==='door').length),2);
 await phone.locator('#kidFurnish').click();
 assert.equal(await phone.locator('body').getAttribute('data-studio-sheet'),'tools');
 await phone.locator('#closeTools').click();
 await phone.locator('#toolsPanel').waitFor({state:'hidden',timeout:5000});
 await phone.locator('[data-mobile-tab="furnish"]').click();
 assert.equal(await phone.locator('body').getAttribute('data-studio-sheet'),'tools');
 await phone.locator('#toolsPanel').waitFor({state:'visible',timeout:5000}); // wait for mobile drawer animation
 assert((await phone.locator('.tool-panel [data-tab="furnish"]').getAttribute('class')).includes('active'));
 await phone.locator('#catalogSearch').fill('vortex');
 await phone.locator('#catalogCards .catalog-card').first().click();
 assert.equal(await phone.locator('body').getAttribute('data-studio-sheet'),'none','Model selection closes the tool drawer');
 await phone.locator('#toolsPanel').waitFor({state:'hidden',timeout:5000});
 await phone.locator('#mobileSave').click();
 assert.equal(await phone.locator('body').getAttribute('data-studio-sheet'),'checks','Save button activates project panel');
 await phone.locator('#savePanel').waitFor({state:'visible',timeout:5000});
 assert(await phone.locator('#save').isVisible());
 await phone.locator('#closeSave').click();
 await phone.locator('#savePanel').waitFor({state:'hidden',timeout:5000});
 await phone.locator('#mobileSave').click();
 await phone.locator('#demo').click();
 await phone.waitForFunction(()=>__levelStudio.project.furniture.added.some(o=>o.id==='NY-STOL-0001'));
 await phone.locator('#closeSave').click();
 await phone.locator('#savePanel').waitFor({state:'hidden',timeout:5000});
 await phone.evaluate(()=>__levelStudio.select('NY-STOL-0001'));
 await phone.locator('#editDock').waitFor({state:'visible',timeout:5000});
 const dockRect=await phone.locator('#editDock').boundingBox();
 assert(dockRect && dockRect.x>=0 && dockRect.x+dockRect.width<=395,'Context inspector fits on phone');
 await phone.locator('.dock-details summary').click();
 await phone.locator('#dockWidth').fill('0.7');
 await phone.locator('#dockWidth').dispatchEvent('change');
 assert.equal(await phone.evaluate(()=>__levelStudio.project.furniture.added.find(o=>o.id==='NY-STOL-0001').w),0.7);
 await phone.locator('#editDockClose').click();
 await phone.locator('#editDockReopen').click();
 await phone.locator('#editDock').waitFor({state:'visible',timeout:5000});
 await phone.close();

 const character=await mobile.newPage();track(character);
 await character.goto(origin+'/character-design/',{waitUntil:'load',timeout:90000});
 await character.locator('#focus-design').click();
 assert.equal(await character.locator('#focus-design').getAttribute('aria-pressed'),'true');
 assert(await character.locator('.setup').isHidden(),'Focus mode hides setup');
 await character.locator('.quick-jobs [data-jump="fashion"]').click();
 assert(await character.locator('#tab-fashion').isVisible(),'Task chip opens working clothes controls');
 assert.equal(await character.locator('[data-tab="fashion"]').getAttribute('aria-selected'),'true');
 await character.locator('.quick-jobs [data-jump="export"]').click();
 assert(await character.locator('#export-zip').isVisible(),'AI package remains accessible in quiet mode');
 await character.locator('#focus-design').click();
 assert(await character.locator('.setup').isVisible(),'Full controls can be restored');
 await mobile.close();

 assert.deepEqual(errors,[],'No page-level exceptions in Studio navigation');
 console.log(JSON.stringify({status:'PASS',hub:true,wideScene:true,mobileDrawers:true,
   oneClickRoom:true,adjoiningRoom:true,wallEdgeDragging:true,smartSurfaceAndWallMounts:true,visual3DSnapTargets:true,largeRoomDragAndUndo:true,sharedDoorAndNavigation:true,doorAndUndo:true,beginnerSaveWalk:true,contextualFurniture:true,autosaveAndUndo:true,characterTaskShortcuts:true,consoleErrors:errors.length}));
}finally{await browser.close();}
