import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEntry,entryLength} from './architecture.mjs?v=5.1.0';
import {planPaintOverWall} from './paint-over-wall.mjs?v=5.1.0';
import {planResizeFloor,planResizeFloorEdge,planSlideInsert,planMoveWallEnd,roomBoundaryIds} from './direct-manipulation.mjs?v=5.1.0';
import {exportProject,parseProject} from './level-project.mjs?v=5.7.2';
import {projectWallPieces} from './project-scene.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';

const wall=(n,a,b)=>makeEntry('BYGG-V-'+String(n).padStart(4,'0'),'wall',a,b);
const floor={id:'BYGG-G-0001',name:'Kök',role:'room',surface:'vinyl',x0:2,z0:2,x1:8,z1:8};
const room=()=>[
 wall(1,[2,2],[8,2]),wall(2,[8,2],[8,8]),wall(3,[8,8],[2,8]),wall(4,[2,8],[2,2])
];
const fit=(entries,id,kind,a,b)=>planPaintOverWall(entries,id,a,b,kind).entries.filter(e=>!e.deleted);
const approx=(a,b)=>Math.abs(a-b)<.002;

test('dragging a fitted door closes the old opening and makes one new physical opening',()=>{
 let entries=fit(room(),'BYGG-V-0001','door',[4,2],[5.2,2]);
 const before=structuredClone(entries),door=entries.find(e=>e.kind==='door');
 const moved=planSlideInsert(entries,door.id,{x:5.5,z:4});
 const current=moved.insert;
 assert(approx(entryLength(current),1.2));
 assert(approx(current.a[1],2)&&approx(current.b[1],2),'magnetic wall alignment');
 assert(approx(current.a[0],4.9)&&approx(current.b[0],6.1));
 const north=moved.entries.filter(e=>e.kind==='wall'&&approx(e.a[1],2)&&approx(e.b[1],2));
 assert(north.some(e=>approx(e.b[0],current.a[0])));
 assert(north.some(e=>approx(e.a[0],current.b[0])));
 assert(!projectWallPieces(moved.entries).some(e=>e.kind==='wall'&&
  Math.min(e.a[0],e.b[0])<5.5&&Math.max(e.a[0],e.b[0])>5.5&&approx(e.a[1],2)),
  'collision uses the same cutout as the visible wall');
 assert.deepEqual(entries,before,'planning is pure and can be undone in one step');
 const wider=planSlideInsert(entries,door.id,{x:4.6,z:2},{width:1.4});
 assert(approx(entryLength(wider.insert),1.4));
 assert(wider.entries.filter(e=>e.kind==='wall'&&approx(e.a[1],2)).some(e=>approx(e.b[0],wider.insert.a[0])));
 assert.throws(()=>planSlideInsert(entries,door.id,{x:8,z:2}),/stanna på väggen|0,25/);
});

test('an existing Floor 5 style door can slide over its backing wall without altering the source wall',()=>{
 const backing=wall(1,[0,0],[8,0]);backing.source=true;
 const door=makeEntry('BYGG-D-0001','door',[3,0],[4.2,0]);
 const plan=planSlideInsert([backing,door],door.id,{x:5,z:2});
 assert.deepEqual(plan.entries.find(e=>e.id===backing.id),backing);
 assert(approx(plan.insert.a[0],4.4)&&approx(plan.insert.b[0],5.6));
 assert(!projectWallPieces(plan.entries).some(e=>e.kind==='wall'&&e.a[0]<5&&e.b[0]>5));
});

test('window sliding retains sill and finish; overlapping inserts and mounted decor refuse unsafe moves',()=>{
 let entries=fit(room(),'BYGG-V-0002','window',[8,4],[8,5.6]);
 const item=entries.find(e=>e.kind==='window');item.sill=1.15;
 const moved=planSlideInsert(entries,item.id,{x:11,z:6}).insert;
 assert(approx(moved.a[0],8)&&approx(moved.b[0],8));
 assert(approx(entryLength(moved),entryLength(item)));
 assert.equal(moved.sill,1.15);
 const neighbor=entries.find(e=>e.kind==='wall'&&e.b[0]===item.a[0]&&e.b[1]===item.a[1]);
 assert.throws(()=>planSlideInsert(entries,item.id,{x:8,z:6},{posters:[{wallId:neighbor.id}]}),/dekorationen/);
});

test('resizing a room moves its four boundaries while door/window widths remain fixed and JSON survives',()=>{
 let entries=fit(room(),'BYGG-V-0001','door',[4,2],[5.2,2]);
 entries=fit(entries,'BYGG-V-0002','window',[8,4],[8,5.6]);
 const before=structuredClone(entries),door=entries.find(e=>e.kind==='door'),window=entries.find(e=>e.kind==='window');
 const plan=planResizeFloor(floor,entries,'nw',{x:1,z:1},{bounds:{x0:0,z0:0,x1:20,z1:20}});
 assert.deepEqual([plan.floor.x0,plan.floor.z0,plan.floor.x1,plan.floor.z1],[1,1,8,8]);
 assert(approx(entryLength(plan.entries.find(e=>e.id===door.id)),entryLength(door)));
 assert(approx(entryLength(plan.entries.find(e=>e.id===window.id)),entryLength(window)));
 assert(plan.entries.some(e=>e.kind==='wall'&&approx(e.a[0],1)&&approx(e.b[0],1)));
 const project=exportProject({ground:{bounds:{x0:0,z0:0,x1:20,z1:20},wallHeightDefault:2.85,floors:[plan.floor]},
  architecture:{schemaVersion:1,edits:[],added:plan.entries,removed:[],floors:[],posters:[],treatments:[]}});
 assert.deepEqual(parseProject(JSON.stringify(project)).architecture.added,plan.entries);
 assert.deepEqual(entries,before,'resize never mutates the saved source');
 assert.throws(()=>planResizeFloor(floor,entries,'nw',{x:7.9,z:2},{bounds:{x0:0,z0:0,x1:20,z1:20}}),/Golvet|smalt|0,25/);
});

test('a shared side is protected; a free wall endpoint can be dragged without invisible collision geometry',()=>{
 const beside={...floor,id:'BYGG-G-0002',x0:8,x1:14};
 assert.throws(()=>planResizeFloor(floor,room(),'ne',{x:9,z:1},{bounds:{x0:0,z0:0,x1:20,z1:20},otherFloors:[beside]}),/delas/);
 const standalone=[wall(9,[10,10],[12,10])];
 const moved=planMoveWallEnd(standalone,standalone[0].id,'b',{x:13,z:10},{bounds:{x0:0,z0:0,x1:20,z1:20}});
 assert.deepEqual(moved.wall.b,[13,10]);assert.deepEqual(standalone[0].b,[12,10]);
 assert.throws(()=>planMoveWallEnd(room(),'BYGG-V-0001','a',{x:1,z:1}),/sitter ihop/);
});

test('deleting a room removes its fitted perimeter but retains a wall shared by another room',()=>{
 const original=room(),beside={...floor,id:'BYGG-G-0002',x0:8,x1:14};
 const inserted=fit(original,'BYGG-V-0001','door',[4,2],[5.2,2]);
 const ids=roomBoundaryIds(floor,inserted,[beside]);
 assert(ids.includes(inserted.find(e=>e.kind==='door').id));
 assert(!ids.includes('BYGG-V-0002'),'east wall still belongs to adjacent room');
 assert(ids.includes('BYGG-V-0004'),'unshared west wall belongs to the deleted room');
 assert(!roomBoundaryIds(floor,[{...wall(9,[2,2],[8,2]),source:true}],[]).length,
  'deleting an added Floor 5 room must preserve its coincident original wall');
});

test('the actual FPS physics closes the previous gap after a door is dragged',()=>{
 const entries=fit(room(),'BYGG-V-0001','door',[4,2],[5.2,2]);
 const door=entries.find(e=>e.kind==='door'),result=planSlideInsert(entries,door.id,{x:6.2,z:2});
 const project=exportProject({ground:{bounds:{x0:0,z0:0,x1:20,z1:20},wallHeightDefault:2.85,floors:[floor]},
  architecture:{schemaVersion:1,edits:[],added:result.entries,removed:[],floors:[],posters:[],treatments:[]}});
 const world=createWorld({levelProject:project,fresh:true});
 assert.equal(world.canOccupy(4.6,2,.22),false,'the original gap has real solid collision');
 assert(world.data.doors.some(d=>d.id===door.id&&Math.abs(d.center[0]-6.2)<.01));
});


test('green wall handle moves just one wall, not the opposite wall; attached door and window keep their exact widths',()=>{
 let entries=fit(room(),'BYGG-V-0001','door',[4,2],[5.2,2]);
 entries=fit(entries,'BYGG-V-0002','window',[8,4],[8,5.6]);
 const before=structuredClone(entries),door=entries.find(e=>e.kind==='door'),window=entries.find(e=>e.kind==='window');
 const east=planResizeFloorEdge(floor,entries,'right',{x:10,z:-123},
  {bounds:{x0:0,z0:0,x1:20,z1:20}});
 assert.deepEqual([east.floor.x0,east.floor.x1,east.floor.z0,east.floor.z1],[2,10,2,8]);
 const resizedDoor=east.entries.find(e=>e.id===door.id);
 const resizedWindow=east.entries.find(e=>e.id===window.id);
 assert(approx(entryLength(resizedDoor),1.2));
 assert(approx(entryLength(resizedWindow),1.6));
 assert(approx(resizedWindow.a[0],10)&&approx(resizedWindow.b[0],10));
 assert(approx(resizedDoor.a[1],2)&&approx(resizedDoor.b[1],2));
 assert.deepEqual(entries,before,'Planning cannot mutate original objects or geometry');
 const north=planResizeFloorEdge(floor,entries,'top',{x:999,z:1},
  {bounds:{x0:0,z0:0,x1:20,z1:20}});
 assert.deepEqual([north.floor.x0,north.floor.x1,north.floor.z0,north.floor.z1],[2,8,1,8]);
 assert(approx(north.entries.find(e=>e.id===door.id).a[1],1));
 const project=exportProject({ground:{bounds:{x0:0,z0:0,x1:20,z1:20},wallHeightDefault:2.85,floors:[east.floor]},
  architecture:{schemaVersion:1,edits:[],added:east.entries,removed:[],floors:[],posters:[],treatments:[]}});
 assert.deepEqual(parseProject(JSON.stringify(project)).architecture.added,east.entries);
});

test('free outside wall of a connected second room moves while its shared door remains walkable',()=>{
 const neighbor={...floor,id:'BYGG-G-0002',name:'Room 2',x0:8,x1:14};
 const withDoor=fit(room(),'BYGG-V-0002','door',[8,4],[8,5.2]);
 const second=[wall(5,[8,2],[14,2]),wall(6,[14,2],[14,8]),wall(7,[14,8],[8,8])];
 const original=[...withDoor,...second],before=structuredClone(original);
 const moved=planResizeFloorEdge(neighbor,original,'right',{x:16,z:99},
  {bounds:{x0:0,z0:0,x1:20,z1:20},otherFloors:[floor]});
 assert.deepEqual([moved.floor.x0,moved.floor.x1,moved.floor.z0,moved.floor.z1],[8,16,2,8]);
 const door=moved.entries.find(e=>e.kind==='door');
 assert(door&&approx(entryLength(door),1.2));
 assert(door.a.every((v,i)=>approx(v,before.find(e=>e.id===door.id).a[i])));
 assert(door.b.every((v,i)=>approx(v,before.find(e=>e.id===door.id).b[i])));
 assert(moved.entries.some(e=>e.kind==='wall'&&approx(e.a[0],16)&&approx(e.b[0],16)));
 assert.deepEqual(original,before);
 assert.throws(()=>planResizeFloorEdge(neighbor,original,'left',{x:7,z:4},
  {bounds:{x0:0,z0:0,x1:20,z1:20},otherFloors:[floor]}),/delas/);
});

test('edge-resize guards invalid input, minimum width and world bounds',()=>{
 assert.throws(()=>planResizeFloorEdge(floor,room(),'diagonal',{x:4,z:4}),/fyra väggsidor/);
 assert.throws(()=>planResizeFloorEdge(floor,room(),'right',{x:NaN,z:5}),/giltig plats/);
 assert.throws(()=>planResizeFloorEdge(floor,room(),'left',{x:8.1,z:4},
  {bounds:{x0:0,z0:0,x1:20,z1:20}}),/Golvet|rektangel|mått|smalt/);
 assert.throws(()=>planResizeFloorEdge(floor,room(),'right',{x:25,z:4},
  {bounds:{x0:0,z0:0,x1:20,z1:20}}),/grundyta/);
});
