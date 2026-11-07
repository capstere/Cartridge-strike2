/** Authentic user-interaction smoke test of independent architectural sketch editor.
 * Chromium WebGL is exercised in CI; full FPS is not started or modified.
 */
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const require=createRequire(import.meta.url);
const {chromium}=require('../../frontline/source/tools/dev/node_modules/playwright-core');
const origin=process.env.FURNITURE_TEST_ORIGIN||'http://127.0.0.1:8765',out=resolve('test-results/build-studio');
await mkdir(out,{recursive:true});
const report={status:'RUNNING',checks:[],errors:[],external:[],httpFailures:[],screenshots:[]};
const browser=await chromium.launch({headless:true,args:['--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader','--ignore-gpu-blocklist','--no-sandbox','--disable-gpu-sandbox']});
const context=await browser.newContext({viewport:{width:1512,height:920},deviceScaleFactor:1,acceptDownloads:true});
const page=await context.newPage();page.setDefaultTimeout(30000);
const check=(name,cond)=>{report.checks.push({name,pass:!!cond});console.log(name,cond?'PASS':'FAIL');if(!cond)throw Error(name);};
page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error')report.errors.push('console:'+m.text());});
page.on('response',r=>{if(r.status()>=400)report.httpFailures.push({code:r.status(),url:r.url()});});
await page.route('**/*',route=>{const url=route.request().url();if(url.startsWith(origin+'/')||url.startsWith('data:')||url.startsWith('blob:'))return route.continue();report.external.push(url);return route.abort();});
async function shot(name){
 // Software WebGL often clears canvas buffers during full-page capture: explicitly
 // render a frame before taking the screenshot, and keep the viewport proof.
 await page.evaluate(()=>__furnitureEditor.renderNow());
 await page.waitForTimeout(80);
 await page.evaluate(()=>__furnitureEditor.renderNow());
 await page.screenshot({path:resolve(out,name+'.png'),fullPage:true,animations:'disabled'});
 report.screenshots.push(name+'.png');
}
async function clickWorld(x,z){
 await page.locator('#viewport').scrollIntoViewIfNeeded();
 const at=await page.evaluate(v=>__furnitureEditor.screenWorldPoint(v.x,v.z),{x,z});
 const rect=await page.locator('#viewport').boundingBox();
 assert(Number.isFinite(at.x)&&Number.isFinite(at.y) && !!rect &&
   at.x>rect.x && at.x<rect.x+rect.width && at.y>rect.y && at.y<rect.y+rect.height,
   'Target must lie inside the visible actual editor canvas '+JSON.stringify({at,rect}));
 await page.mouse.click(at.x,at.y);
}
try{
 await page.goto(origin+'/furniture-editor/',{waitUntil:'networkidle',timeout:45000});
 await page.waitForFunction(()=>window.__furnitureEditor?.build?.getEntries()?.length>380,{timeout:45000});
 const info=await page.evaluate(()=>__furnitureEditor.getState());
 check('standalone editor started with no FPS gameplay',info.chairs>=50&&!info.gameModuleLoaded);
 check('original game version and source unchanged',info.gameVersion==='0.17.0'&&info.sourceCommit==='7b99da56c9cc7f7e5bdbc626a174c8db9a9e33bc');
 check('actual WebGL rendering is present',await page.evaluate(()=>!!document.querySelector('#viewport').getContext('webgl2')));
 check('build mode button starts hidden architecture tools',await page.locator('#buildSidebar').isHidden()&&await page.locator('#modeBuild').isVisible());
 await page.locator('#modeBuild').click();
 check('build mode is active; furniture controls hidden',await page.evaluate(()=>__furnitureEditor.build.active)&&await page.locator('#buildSidebar').isVisible()&&await page.locator('#furnitureSidebar').isHidden());
 check('exact source walls and doors loaded as editable preview',await page.evaluate(()=>{const e=__furnitureEditor.build.getEntries();return e.some(x=>x.id==='WALL-001')&&e.some(x=>x.id==='D08')&&e.length>390}));
 check('smart snap and right angle assistance enabled by default',
   await page.locator('#buildSmartSnap').isChecked()&&await page.locator('#buildRightAngles').isChecked());
 check('precision helpers are disabled for unselected geometry',
   await page.locator('#buildStraighten').isDisabled()&&await page.locator('#buildJoinEnds').isDisabled());
 const temporary=await page.evaluate(()=>__furnitureEditor.build.testCreate('wall',[20,20],[23,20.12]));
 check('new construction permits one-click precision repair',await page.locator('#buildStraighten').isEnabled());
 await page.locator('#buildStraighten').click();
 check('straighten turns slightly skewed wall into exact axis alignment',
  await page.evaluate(id=>{const e=__furnitureEditor.build.getEntries().find(x=>x.id===id);return e.a[1]===e.b[1];},temporary));
 await page.locator('#buildUndo').click();
 check('precision repair can be undone without changing base geometry',
  await page.evaluate(id=>Math.abs(__furnitureEditor.build.getEntries().find(x=>x.id===id).b[1]-20.12)<.001,temporary));
 await page.evaluate(()=>__furnitureEditor.build.load(undefined));

 await page.locator('#buildSearch').fill('WALL-001');await page.locator('.build-list-item').first().click();
 check('existing wall selected and endpoint coordinates populated',(await page.locator('#buildSelectionId').textContent())==='WALL-001'&&!!(await page.locator('#buildA_X').inputValue()));
 await page.locator('#buildKind').selectOption('window');
 check('source wall converted to window in SKETCH only',await page.evaluate(()=>__furnitureEditor.build.getEntries().find(e=>e.id==='WALL-001').kind==='window'));
 await page.locator('#buildSill').fill('1.12');await page.locator('#buildSill').press('Tab');
 const changed=await page.evaluate(()=>__furnitureEditor.getPatch());
 check('window kind and sill survive combined export',changed.architecture.edits.some(e=>e.id==='WALL-001'&&e.kind==='window'&&Math.abs(e.sill-1.12)<.001));
 await page.locator('#buildUndo').click();
 check('build undo restores earlier sill',await page.evaluate(()=>Math.abs(__furnitureEditor.build.getEntries().find(e=>e.id==='WALL-001').sill-.9)<.001));
 await page.locator('#buildRedo').click();
 check('build redo restores edited sill',await page.evaluate(()=>Math.abs(__furnitureEditor.build.getEntries().find(e=>e.id==='WALL-001').sill-1.12)<.001));
 await page.locator('.build-list-item').first().click();
 check('one-click door shortcut enabled on selected wall',await page.locator('#buildDoorInWall').isEnabled());
 await page.locator('#buildDoorInWall').click();
 check('quick door uses STANDARD 1.20 length',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.some(e=>e.kind==='door'&&Math.abs(Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1])-1.2)<.002)));
 check('quick door is aligned with wall',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.some(e=>e.kind==='door'&&Math.abs(e.a[1]+33.7147944)<.1)));
 await page.locator('#buildUndo').click();
 check('quick door undo restores unchanged original wall',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.length===0));
 await page.locator('#buildSearch').fill('');
 await page.locator('#buildRoom').selectOption('I09');await page.locator('#focus').click();
 await page.locator('#buildTool').selectOption('glazed');
 await clickWorld(8.2,12.4);await clickWorld(10.4,12.4);
 check('actual two pointer clicks draw new full-height glazed wall',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.some(e=>e.kind==='glazed')));
 await page.locator('#buildTool').selectOption('door');
 check('door draw mode selected',await page.evaluate(()=>__furnitureEditor.build.getDrawingState().mode==='door'));
 await clickWorld(9.1,12.4);
 check('actual door first endpoint registered',await page.evaluate(()=>__furnitureEditor.build.getDrawingState().first!==null));
 await clickWorld(10.0,12.4);
 check('door tool produces separate door object',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.some(e=>e.kind==='door')));
 await page.locator('#buildTool').selectOption('floor');
 await clickWorld(7.1,10.1);await clickWorld(8.2,11.2);
 check('rectangle floor painter persists a new floor region',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.floors.length===1));
 await shot('01-draw-glass-wall');
 check('save project button stays available in both modes',await page.locator('#downloadTop').isVisible());
 await page.locator('#threeView').click();
 await page.waitForTimeout(180);
 check('3D view uses same independent render state',await page.evaluate(()=>__furnitureEditor.getState().view==='3d'&&__furnitureEditor.build.active));
 await shot('02-build-3d');
 const [save]=await Promise.all([page.waitForEvent('download'),page.locator('#downloadTop').click()]);
 const saved=JSON.parse(await readFile(await save.path(),'utf8'));
 check('JSON project includes both furniture and architectural sketch',saved.format==='cartridge-strike-furniture-studio'&&saved.architecture?.schemaVersion===1&&saved.architecture.edits.length>0&&saved.architecture.added.length>=2&&saved.architecture.floors.length===1);
 check('export contains no proprietary workplace plan or hidden internal file',!JSON.stringify(saved).includes('Cepheid'));
 await page.reload({waitUntil:'networkidle'});
 await page.waitForFunction(()=>window.__furnitureEditor?.build?.getEntries()?.length>390);
 check('browser autosave restores walls, door and floor',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.added.length>=2&&__furnitureEditor.getPatch().architecture.floors.length===1));
 const dlg=page.waitForEvent('dialog').then(d=>d.accept());await page.locator('#reset').click();await dlg;
 check('reset removes sketch without modifying original data',await page.evaluate(()=>{const p=__furnitureEditor.getPatch();return !p.architecture.edits.length&&!p.architecture.added.length&&!p.architecture.floors.length;}));
 await page.locator('#importFile').setInputFiles({name:'MyWholeDesign.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});
 await page.waitForFunction(()=>__furnitureEditor.getPatch()?.architecture?.floors?.length===1);
 check('project can reopen previously saved windows, doors, floors and furniture',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.edits.length>0&&__furnitureEditor.getPatch().architecture.added.length>=2));
 await page.locator('#modeBuild').click();
 await shot('03-imported-sketch');
 await page.locator('#modeFurniture').click();
 check('furniture mode still works after loading a building project',await page.locator('#furnitureSidebar').isVisible()&&await page.evaluate(()=>__furnitureEditor.getState().chairs>=50));
 await page.locator('#modeBuild').click();
 await page.locator('#topView').click();
 await page.locator('#buildRoom').selectOption('I09');await page.locator('#focus').click();
 await page.locator('#buildTool').selectOption('room-rect');
 check('new room tool shows settings in two-click mode',await page.locator('#buildRoomSettings').isVisible());
 check('exact room button needs a first corner',await page.locator('#buildRoomCreateExact').isDisabled());
 const roomBefore=await page.evaluate(()=>__furnitureEditor.getPatch().architecture);
 await clickWorld(7.1,10.1);await clickWorld(9.3,12.3);
 const newRoom=await page.evaluate(()=>__furnitureEditor.getPatch().architecture);
 check('two clicks create four connected walls and one floor',newRoom.added.length===roomBefore.added.length+4&&newRoom.floors.length===roomBefore.floors.length+1);
 const priorRoomIds=new Set(roomBefore.added.map(x=>x.id));
 const edges=newRoom.added.filter(x=>!priorRoomIds.has(x.id));
 check('room geometry has exact shared corners',edges.length===4&&edges.every((edge,i)=>JSON.stringify(edge.b)===JSON.stringify(edges[(i+1)%4].a)));
 await page.locator('#buildUndo').click();
 check('single undo removes the entire room',await page.evaluate(n=>{const p=__furnitureEditor.getPatch().architecture;return p.added.length===n.added.length&&p.floors.length===n.floors.length;},roomBefore));
 await page.locator('#buildTool').selectOption('room-rect');
 await page.locator('#buildRoomWidth').fill('2.4');await page.locator('#buildRoomDepth').fill('1.6');
 await page.locator('#buildRoomHeight').fill('3.2');await page.locator('#buildRoomName').fill('Testlokal');
 await clickWorld(7.1,10.1);
 check('exact room button activates after choosing start corner',await page.locator('#buildRoomCreateExact').isEnabled());
 await page.locator('#buildRoomCreateExact').click();
 check('exact dimensions, height and floor name survive export',await page.evaluate(n=>{
  const p=__furnitureEditor.getPatch().architecture,ids=new Set(n.added.map(x=>x.id)),edges=p.added.filter(x=>!ids.has(x.id)),
   oldFloors=new Set(n.floors.map(x=>x.id)),f=p.floors.find(x=>!oldFloors.has(x.id));
  return p.added.length===n.added.length+4&&edges.length===4&&p.floors.length===n.floors.length+1&&
   edges.every(w=>w.height===3.2)&&f?.name==='Testlokal'&&
   Math.abs(f.x1-f.x0-2.4)<.002&&Math.abs(f.z1-f.z0-1.6)<.002;
 },roomBefore));
 await page.locator('#buildFloorName').fill('Namn efter redigering');
 await page.locator('#buildFloorName').press('Tab');
 check('room floor can be renamed through properties',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.floors.at(-1)?.name==='Namn efter redigering'));
 await page.locator('#buildUndo').click();
 check('single undo restores room name',await page.evaluate(()=>__furnitureEditor.getPatch().architecture.floors.at(-1)?.name==='Testlokal'));
 await page.locator('#buildUndo').click();
 check('exact room creation undo is atomic',await page.evaluate(n=>{const p=__furnitureEditor.getPatch().architecture;return p.added.length===n.added.length&&p.floors.length===n.floors.length;},roomBefore));
 // Prototype: wall and door color options persist without touching gameplay.
 await page.evaluate(()=>__furnitureEditor.build.select('WALL-001'));
 await page.locator('#buildFinish').selectOption('gray');
 check('selected source wall stores gray finish in proposal',
   await page.evaluate(()=>__furnitureEditor.getPatch().architecture.edits.some(e=>e.id==='WALL-001'&&e.finish==='gray')));
 await page.locator('#threeView').click();
 const cameraBefore=await page.evaluate(()=>__furnitureEditor.getCameraTarget());
 const area=await page.locator('#viewport').boundingBox();
 await page.mouse.move(area.x+area.width/2,area.y+area.height/2);
 await page.keyboard.down('Shift');
 await page.mouse.down();await page.mouse.move(area.x+area.width/2+45,area.y+area.height/2+18,{steps:4});
 await page.mouse.up();await page.keyboard.up('Shift');
 check('Shift + left drag pans 3D camera in build mode',await page.evaluate(before=>{
  const after=__furnitureEditor.getCameraTarget();
  return Math.hypot(after.x-before.x,after.z-before.z)>.02;
 },cameraBefore));
 await page.evaluate(()=>__furnitureEditor.build.testCreate('wall',[23,23],[25,23]));
 const buildDupBefore=await page.evaluate(()=>__furnitureEditor.build.export().added.length);
 await page.keyboard.press('Control+d');
 check('Ctrl+D duplicates selected architecture part',await page.evaluate(n=>__furnitureEditor.build.export().added.length===n+1,buildDupBefore));
 // Value posters must be editable on a wall and survive version-1 architecture JSON.
 await page.evaluate(()=>{
  const wall=__furnitureEditor.build.getBaseline().find(w=>w.kind==='wall'&&Math.hypot(w.a[0]-w.b[0],w.a[1]-w.b[1])>4&&w.height>2);
  if(!wall)throw Error('No valid wall for test poster');
  __furnitureEditor.build.addPoster(wall.id);
 });
 check('poster properties appear for selected wall artwork',await page.locator('#posterFields').isVisible());
 await page.locator('#posterText').fill('SAMARBETE');
 await page.locator('#posterText').press('Tab');
 check('custom value word saved to design architecture',await page.evaluate(()=>
  __furnitureEditor.getPatch().architecture.posters.some(p=>p.text==='SAMARBETE')));
 const art=await readFile(resolve('furniture-editor/library/thumbs/hissrum12/pallet.webp'));
 await page.locator('#posterImage').setInputFiles({name:'vardeposter.webp',mimeType:'image/webp',buffer:art});
 await page.waitForFunction(()=>__furnitureEditor.getPatch().architecture.posters.some(p=>p.image?.startsWith('data:image/jpeg;base64,')));
 check('local poster image compressed and embedded in portable architecture JSON',
  await page.evaluate(()=>__furnitureEditor.getPatch().architecture.posters.some(p=>p.image?.startsWith('data:image/jpeg;base64,')&&p.image.length<100000)));
 const posterCount=await page.evaluate(()=>__furnitureEditor.getPatch().architecture.posters.length);
 await page.locator('#viewport').focus();
 await page.keyboard.press('Control+d');
 check('Ctrl+D duplicates selected wall poster',await page.evaluate(count=>
  __furnitureEditor.getPatch().architecture.posters.length===count+1,posterCount));
 const posterSaved=await page.evaluate(()=>__furnitureEditor.getPatch().architecture);
 await page.evaluate(p=>__furnitureEditor.build.load(p),posterSaved);
 check('poster list survives load in project editor',await page.evaluate(count=>
  __furnitureEditor.build.posters().length===count,posterSaved.posters.length));
 await page.locator('#buildTool').selectOption('poster');
 check('poster tool can be selected in build toolbar',await page.evaluate(()=>
  __furnitureEditor.build.getTool()==='poster'));
 // SMART RITA over an existing standalone authored wall: real mouse drag, one undo.
 await page.locator('#topView').click();
 const painting=await page.evaluate(()=>{
   const c=__furnitureEditor.getCameraTarget(),z=c.z;
   const id=__furnitureEditor.build.testCreate('wall',[c.x-2.2,z],[c.x+2.2,z]);
   return {id,x:c.x,z,before:__furnitureEditor.build.getEntries().length};
 });
 await page.locator('#buildSmartPaint').click();
 check('one-click SMART RITA mode opens dedicated in-place type palette',
   await page.locator('#buildPaintSettings').isVisible()&&
   await page.evaluate(()=>__furnitureEditor.build.getDrawingState().mode==='paint'));
 const screenPoint=async x=>page.evaluate(({x,z})=>__furnitureEditor.screenWorldPoint(x,z),{x,z:painting.z});
 const paintStart=await screenPoint(painting.x-1.4),paintEnd=await screenPoint(painting.x+.7);
 await page.mouse.move(paintStart.x,paintStart.y);
 await page.mouse.down();
 await page.mouse.move(paintEnd.x,paintEnd.y,{steps:14});
 await page.mouse.up();
 check('mouse drag paints a short window OVER a wall, splitting into three without overlap',
  await page.evaluate(({id,before})=>{
   const entries=__furnitureEditor.build.getEntries();
   return entries.length===before+2&&!entries.some(e=>e.id===id)&&
    entries.filter(e=>e.kind==='window'&&e.id.startsWith('BYGG-')).length>0;
  },painting));
 check('SMART RITA remains selected for the next window without changing tools',
  await page.evaluate(()=>__furnitureEditor.build.getTool()==='paint'));
 await page.locator('#buildUndo').click();
 check('single undo restores original unsplit wall',await page.evaluate(({id,before})=>{
  const entries=__furnitureEditor.build.getEntries();
  return entries.length===before&&entries.some(e=>e.id===id&&e.kind==='wall');
 },painting));
 await page.locator('#buildPaintKind').selectOption('glazed');
 check('changing from window to glass does not exit SMART RITA',
  await page.evaluate(()=>__furnitureEditor.build.getDrawingState().mode==='paint'&&
   __furnitureEditor.build.getDrawingState().paintType==='glazed'));
 // Lightweight window treatments are independent decorative attachments.
 const treatmentIds=await page.evaluate(()=>{
  const c=__furnitureEditor.getCameraTarget();
  const wall=__furnitureEditor.build.testCreate('window',[c.x+3,c.z+2],[c.x+5.5,c.z+2]);
  const blind=__furnitureEditor.build.attachBlind(wall);
  const curtain=__furnitureEditor.build.drawCurtain(wall,[c.x+3.4,c.z+2],[c.x+5.1,c.z+2]);
  return {wall,blind,curtain};
 });
 check('click-to-window dark-gray blind becomes a saved wall attachment',
  await page.evaluate(({wall,blind})=>__furnitureEditor.getPatch().architecture.treatments.some(t=>
   t.id===blind&&t.wallId===wall&&t.type==='blind'),treatmentIds));
 check('line-drawn translucent curtain attaches to same wall with exact width',
  await page.evaluate(({wall,curtain})=>__furnitureEditor.getPatch().architecture.treatments.some(t=>
   t.id===curtain&&t.wallId===wall&&t.type==='curtain'&&t.t1>t.t0),treatmentIds));
 await page.locator('#buildTool').selectOption('curtain');
 check('curtain drawing tool remains available as a single selectable action',
  await page.evaluate(()=>__furnitureEditor.build.getTool()==='curtain'));
 await page.locator('#buildTool').selectOption('blind');
 check('blind tool remains independently selectable in build mode',
  await page.evaluate(()=>__furnitureEditor.build.getTool()==='blind'));
 const treatmentDoc=await page.evaluate(()=>__furnitureEditor.getPatch().architecture);
 await page.evaluate(p=>__furnitureEditor.build.load(p),treatmentDoc);
 check('decorations persist through architecture save/reload',
  await page.evaluate(n=>__furnitureEditor.build.treatments().length===n,treatmentDoc.treatments.length));
 check('no FPS boot, JS/shader errors, external resources or HTTP failures',!report.errors.length&&!report.httpFailures.length&&!report.external.length&&await page.evaluate(()=>!window.__fps));
 report.status='PASS';
}catch(e){report.status='FAIL';report.errors.push(e.stack||String(e));console.error(e);}
finally{await writeFile(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');await context.close();await browser.close();}
if(report.status!=='PASS')process.exitCode=1;
