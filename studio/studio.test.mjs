import {test} from 'node:test';
import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {dirname,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
const source=path=>readFileSync(join(root,path),'utf8');

test('one Studio hub links to working character and level editors without replacing the game',()=>{
 const html=source('studio/index.html');
 assert.match(html,/<html lang="sv">/);
 assert.match(html,/href="\.\.\/character-design\/"/);
 assert.match(html,/href="\.\.\/furniture-editor\/new\.html"/);
 assert.match(html,/href="\.\.\/furniture-editor\/new\.html\?mode=edit-floor5"/);
 assert.match(html,/href="\.\.\/fps\/"/);
 assert.match(html,/klassiska möbelstudion/i);
 assert.equal((html.match(/class="studio-card /g)||[]).length,2);
 assert.match(html,/ändrar <em>inte<\/em> automatiskt/i);
 for(const [,href] of html.matchAll(/href="([^"]+)"/g)){
  if(href.startsWith('data:')||href.startsWith('#'))continue;
  assert(!/^https?:/.test(href),'Hub must not load external dependencies');
  const path=resolve(root,'studio',decodeURIComponent(href.split(/[?#]/)[0]));
  assert(existsSync(href.split(/[?#]/)[0].endsWith('/')?join(path,'index.html'):path),
   'Broken Studio link: '+href);
 }
});

test('character workflow offers task-first navigation, accessible quiet mode and existing export',()=>{
 const html=source('character-design/index.html');
 const app=source('character-design/app.mjs');
 assert.match(html,/href="\.\.\/studio\/"/);
 for(const task of ['sculpt','fashion','face','parts','export'])
  assert(html.includes('data-jump="'+task+'"'),'Missing character task '+task);
 for(const id of ['focus-design','export-zip','save-slot','preview3d','jump-to-face'])
  assert(html.includes('id="'+id+'"'),'Missing character control '+id);
 assert.match(app,/function setupQuickStudio\(\)/);
 assert.match(app,/function setTab\(/);
 assert.match(app,/setupQuickStudio\(\);initDrawing/);
});

test('mobile level editor has a canvas-first task drawer and retains save/export',()=>{
 const html=source('furniture-editor/new.html');
 const code=source('furniture-editor/studio-ui.mjs');
 const css=source('furniture-editor/new.css');
 assert.match(html,/href="\.\.\/studio\/"/);
 for(const task of ['build','furnish','play'])
  assert(html.includes('data-mobile-tab="'+task+'"'),'Missing level task '+task);
 for(const id of ['plan','scene3d','save','quickSave','mobileSave','toolsPanel','savePanel','mobileBackdrop','closeTools','closeSave'])
  assert(html.includes('id="'+id+'"'),'Missing level control '+id);
 assert.match(code,/openSheet\(/);
 assert.match(code,/document\.querySelector\('\.tool-panel \[data-tab=/);
 assert.match(css,/@media\(max-width:700px\)/);
 assert.match(css,/body\[data-studio-sheet="tools"\]/);
 assert.match(html,/studio-ui\.mjs/);
});


test('context furniture dock edits the actual model with real validation and undo actions',()=>{
 const html=source('furniture-editor/new.html'),code=source('furniture-editor/selection-dock.mjs'),editor=source('furniture-editor/new.mjs');
 for(const id of ['editDock','editDockName','editDockMessage','editDockReopen',
  'dockX','dockZ','dockWidth','dockDepth','dockHeight','dockCollision',
  'dockRotate','dockDuplicate','dockUndo','dockDelete'])
  assert(html.includes('id="'+id+'"'),'Missing contextual control '+id);
 assert.match(code,/dispatchEvent\(new Event\('change'/);
 assert.match(code,/onHeight\(value\)/);
 assert.match(editor,/installSelectionDock/);
 assert.match(editor,/selectionDock\.sync\(o/);
 assert.match(editor,/child\.elevation=/);
 assert.match(html,/src="new\.mjs\?v=\d+\.\d+\.\d+"/);
});

test('free building defaults to optional smart placement, with explicit diagnostics',()=>{
 const html=source('furniture-editor/new.html'),code=source('furniture-editor/new.mjs');
 const dock=source('furniture-editor/selection-dock.mjs');
 assert.match(html,/id="autoPlace"[^>]*checked/);
 assert.match(code,/findNearbyFreePlacement/);
 assert.match(code,/function easyFurniturePose/);
 assert.match(code,/Visa tekniska detaljer/);
 assert.match(dock,/const diagnostics=\$\('showPhysics'\).checked/);
});


test('four child-sized buttons expose a genuine one-click room and standard doorway workflow',()=>{
 const html=source('furniture-editor/new.html');
 const editor=source('furniture-editor/new.mjs');
 const ui=source('furniture-editor/studio-ui.mjs');
 const styles=source('furniture-editor/new.css');
 for(const id of ['kidRoom','kidFurnish','kidWalk','kidSave'])
  assert(html.includes('id="'+id+'"'),'Child-facing build button missing: '+id);
 for(const cat of ['all','stolar','bord','kok','dekor'])
  assert(html.includes('data-kid-category="'+cat+'"'));
 assert.match(editor,/function makeStarterRoom\(\)/);
 assert.match(editor,/planPaintOverWall\(arch\(\),bottom\.id/);
 assert.match(editor,/makeFloor\(\{x:x0,z:z0\},\{x:x1,z:z1\},'room'\)/);
 assert.match(editor,/commit\(before\)/);
 assert.match(editor,/zoom=clamp\(Math\.max\(/);
 assert.match(ui,/category\.dispatchEvent\(new Event\('change'/);
 assert.match(styles,/\.kid-steps button/);
 assert.match(styles,/@media\(max-width:700px\)/);
});

test('a ten-year-old can choose a side for an adjoining room, without losing precise room drawing',()=>{
 const html=source('furniture-editor/new.html');
 const js=source('furniture-editor/new.mjs');
 const planner=source('furniture-editor/adjacent-room.mjs');
 const css=source('furniture-editor/new.css');
 for(const id of ['roomChoices','roomChoiceHint','roomChoiceClose','roomDrawCustom'])
  assert(html.includes('id="'+id+'"'),'Room picker missing: '+id);
 for(const side of ['above','right','below','left'])
  assert(html.includes('data-room-side="'+side+'"'),'Room side missing: '+side);
 assert.match(js,/function makeAdjacentRoom\(side\)/);
 assert.match(js,/planPaintOverWall\(arch\(\),shared\.id,plan\.doorStart,plan\.doorEnd,'door'/);
 assert.match(js,/function startCustomRoom\(\)/);
 assert.match(planner,/export function planAdjacentRoom\(/);
 assert.match(css,/\.room-choice-grid button/);
});

test('Sims wall arrows are offered only for safe edges, and both 2D/3D use the same room resize plan',()=>{
 const html=source('furniture-editor/new.html');
 const editor=source('furniture-editor/new.mjs');
 const planner=source('furniture-editor/build/direct-manipulation.mjs');
 for(const label of ['gröna pilarna','orange hörnen'])assert(html.includes(label));
 assert.match(editor,/function allowedEdgeHandles\(f\)/);
 assert.match(editor,/planResizeFloorEdge\(info\.initialFloor/);
 assert.match(editor,/handle\.startsWith\('edge-'\)/);
 assert.match(editor,/ctx\.arc\(x,z,14\*dpr/);
 assert.match(editor,/mesh\.userData\.editHandle=handle/);
 assert.match(editor,/parsePosters\(p\(\)\.architecture\.posters\|\|\[\],result\.entries\)/);
 assert.match(planner,/export function planResizeFloorEdge\(/);
});


test('kid-friendly mounting is a real editor action, not decoration-only UI',()=>{
 const html=source('furniture-editor/new.html');
 const editor=source('furniture-editor/new.mjs');
 const inspector=source('furniture-editor/selection-dock.mjs');
 const smart=source('furniture-editor/smart-placement.mjs');
 const walls=source('furniture-editor/wall-mounts.mjs');
 const procedural=source('furniture-editor/library/procedural.mjs');
 for(const id of ['placementMode','dockMountMode','dockWallY','dockWallHeightRow'])
  assert.match(html,new RegExp('id="'+id+'"'));
 for(const mode of ['auto','surface','wall','floor'])
  assert(html.includes('value="'+mode+'"'));
 assert.match(editor,/function mountPose\(/);
 assert.match(editor,/onMountMode:mode/);
 assert.match(editor,/onWallHeight:value/);
 assert.match(editor,/syncWallMounts\(objects\(\),arch\(\)\)/);
 assert.match(inspector,/mount\.addEventListener\('change'/);
 assert.match(smart,/export function inferPlacementRole/);
 assert.match(walls,/export function poseOnWall/);
 for(const id of ['studio:wall-picture','studio:wall-clock','studio:wall-shelf'])
  assert(procedural.includes(id));
});

test('the highlighted 3D snap target is tied to actual tabletop/wall placement, not a decorative mockup',()=>{
 const editor=source('furniture-editor/new.mjs');
 const preview=source('furniture-editor/snap-highlights.mjs');
 const browser=source('tools/studio-ux-browser.mjs');
 assert.match(editor,/preferredPlacementPoint\(pick,objects\(\),arch\(\)\)/);
 assert.match(editor,/feedback=placementPreview\(base,q,objects\(\),arch\(\)/);
 assert.match(editor,/highlightSnapSurface\(snapFeedback\)/);
 assert.match(editor,/userData\.snapTargetId=spec\.targetId/);
 assert.match(editor,/showModelGhost\(calculated\.item\)/);
 assert.match(editor,/buildProjectFurniture\(\[\{\.\.\.item,id:\x27ghost\x27\}\]/);
 assert.match(editor,/addFurniture\(pendingFurniture,q\.x,q\.z,q\.y,q\)/);
 assert.match(editor,/ctx\.strokeStyle='#13b48d'/);
 assert.match(editor,/if\(edge\)/);
 assert.match(preview,/export function preferredPlacementPoint/);
 assert.match(preview,/export function placementPreview/);
 assert.match(browser,/visual3DSnapTargets:true/);
});

test('large rooms are real, atomic and not rejected by the obsolete 50-unit limit',()=>{
 const html=source('furniture-editor/new.html');
 const editor=source('furniture-editor/new.mjs');
 const geometry=source('furniture-editor/build/room-drag.mjs');
 const architecture=source('furniture-editor/build/architecture.mjs');
 const suite=source('tools/studio-ux-browser.mjs');
 assert.match(html,/src="new\.mjs\?v=\d+\.\d+\.\d+"/);
 assert.match(editor,/const \{rect,edges\}=planDraggedRoom\(a,b,p\(\)\.ground\.bounds\)/);
 assert.match(editor,/if\(role==='room'\)for\(const \[u,v\] of edges\)makeSegment\('wall',u,v\)/);
 assert.match(editor,/p\(\)\.ground\.floors\.length=beforeFloors/);
 assert.match(editor,/arch\(\)\.length=beforeWalls/);
 assert.match(editor,/if\(drawGesture\)first=null/);
 assert.match(geometry,/export const MIN_ROOM_SPAN=\.5,MAX_ROOM_SPAN=100/);
 assert.match(geometry,/validateFloorRect\(/);
 assert.match(geometry,/validateEntry\(/);
 assert.match(architecture,/e\.x1-e\.x0>100\|\|e\.z1-e\.z0>100/);
 assert.match(suite,/largeRoomDragAndUndo:true/);
});
