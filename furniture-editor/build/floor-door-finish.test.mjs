import {testDoorTraversal} from './door-traversal.mjs';
import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {makeEntry} from './architecture.mjs';import {floor5Baseline,resolveProjectScene,writeProjectScene} from './project-scene.mjs?v=5.7.2';
import {planFloorEdge,floorEdgeHandles,remainingSourceTiles} from './floor-edge.mjs';import {architecturePreview} from './architecture-preview.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';import {sceneArchitectureData} from '../../src/fps/level-adapter.mjs?v=5.7.2';import {paintDescription} from './surface-style.mjs';
const bounds={x0:-50,x1:52,z0:-35,z1:40},floor={id:'BYGG-G-0001',name:'Rum',role:'room',surface:'carpet',x0:0,x1:8,z0:0,z1:8};
function fixture(){const p=exportProject({ground:{bounds,wallHeightDefault:2.85,floors:[{...floor}]}});p.architecture.added=[makeEntry('BYGG-V-0001','wall',[0,0],[8,0]),makeEntry('BYGG-D-0001','door',[3,0],[4.2,0])];return p;}
test('lintel closes .015 cutter gaps, follows wall plane/depth/height/paint in either endpoint order',()=>{
 for(const angle of [0,Math.PI/2,.51])for(const reverse of [false,true]){
  const p=fixture(),rot=([x,z])=>[x*Math.cos(angle)-z*Math.sin(angle),x*Math.sin(angle)+z*Math.cos(angle)];
  p.architecture.added.forEach(e=>{e.a=rot(e.a);e.b=rot(e.b);if(reverse)[e.a,e.b]=[e.b,e.a];});p.architecture.added[0].height=3.2;p.architecture.added[0].thickness=.22;p.surfaceColors={'BYGG-V-0001':'#112233'};
  const {walls,doors,zones}=sceneArchitectureData(p,resolveProjectScene(p)),d={__custom:true,walls,doors,rooms:zones,corridors:[],floorPolygons:[],excludedRooms:[],obstacles:[],targets:[],routes:[]};
  const desc=paintDescription(globalThis.SpelWorldForLevel(d).build({doors:{}}),d),lintel=desc.boxes.find(b=>b.id.endsWith('-lintel'));
  assert(Math.abs(lintel.w-1.234)<.003);assert(Math.abs(lintel.d-.22)<.0002);assert.equal(lintel.y+lintel.h/2,3.2);assert.equal(lintel.studioColor,'#112233');
  // Both cut ends are covered at lintel height. This tests actual source box geometry.
  for(const w of walls){const join=[w.a,w.b].sort((a,b)=>Math.hypot(a[0]-lintel.x,a[1]-lintel.z)-Math.hypot(b[0]-lintel.x,b[1]-lintel.z))[0];const dx=join[0]-lintel.x,dz=join[1]-lintel.z;assert(Math.abs(dx*Math.cos(lintel.angle)-dz*Math.sin(lintel.angle))<=lintel.w/2+.001);}
 }
});
test('floor-only drag snaps to physical non-grid wall face and never moves architecture',()=>{
 const wall={...makeEntry('BYGG-V-0001','wall',[8.073,0],[8.073,8]),thickness:.16},before=JSON.stringify(wall);
 const f=planFloorEdge(floor,1,{x:8.04,z:4},[wall],{bounds});assert(Math.abs(f.x1-7.995)<1e-9);assert.equal(f.snapped,wall.id);assert.equal(JSON.stringify(wall),before);
 const reversed={...wall,a:wall.b,b:wall.a};assert.deepEqual(planFloorEdge(floor,1,{x:8.04,z:4},[reversed],{bounds}),f);
 assert.throws(()=>planFloorEdge(floor,1,{x:-1,z:4},[],{bounds}),/golv|Golv/);assert.throws(()=>planFloorEdge(floor,1,{x:80,z:4},[],{bounds}),/grundyta/);
 assert.equal(Object.keys(floorEdgeHandles(floor)).length,4);
});
test('source floor edits round-trip, change real walkable footprint and leave source intact',async()=>{
 const p=exportProject({mode:'edit-floor5',ground:{bounds,wallHeightDefault:2.85,floors:[]}}),base=floor5Baseline().data,before=JSON.stringify(base),f=resolveProjectScene(p).floors.find(f=>f.id==='I25');
 const edited=planFloorEdge(f,1,{x:46,z:26},[],{bounds});p.ground.floorEdits={I25:edited.polygon};p.surfaceColors={I25:'#000000'};
 const restored=(await parseProjectZip(await exportProjectZip(p))).project;assert.deepEqual(restored,p);
 const world=createWorld({levelProject:restored,fresh:true});assert(!world.onFloor(47,26),'old underlying source tile removed');assert(world.onFloor(45,26));assert.equal(world.description.surfaces.find(s=>s.id==='finish-I25').studioColor,'#000000');
 assert.equal(JSON.stringify(base),before);assert.deepEqual(remainingSourceTiles(base),base.floorPolygons);
 assert.throws(()=>parseProject({...p,ground:{...p.ground,floorEdits:{unknown:edited.polygon}}}),/Okänd/);
 const invalid=structuredClone(p);invalid.ground.floorEdits.I25[1]=[0,0];assert.throws(()=>parseProject(invalid),/Golv|golv/);
});
test('frosted leaf preserves hinge, collision, automatic opening and project serialization in both modes',async()=>{
 for(const mode of ['new-level','edit-floor5']){
  const p=mode==='new-level'?fixture():exportProject({mode}),scene=resolveProjectScene(p),door=scene.entries.find(e=>e.kind==='door'&&!e.originallyBlocked);door.doorStyle='frosted';if(mode==='new-level')p.architecture.added=scene.entries;else writeProjectScene(p,scene);
  const saved=(await parseProjectZip(await exportProjectZip(p))).project,w=createWorld({levelProject:saved,fresh:true}),d=w.doors.doors.find(d=>d.id===door.id);assert.equal(d.doorStyle,'frosted');const closed=structuredClone(d.leaves[0].box);w.doors.pose(d,Math.PI/3);assert.notEqual(d.leaves[0].box.angle,closed.angle);assert.equal(d.leaves[0].box.w,closed.w);
  const vis=architecturePreview(saved,resolveProjectScene(saved),{openDoors:true,selected:door.id}),glass=vis.children.find(o=>o.userData.editId===door.id&&o.material?.transmission>.5);assert(glass);assert(glass.material.roughness>.6);assert(Math.abs(glass.rotation.y-closed.angle)>.5);
 }
 const p=fixture();p.architecture.added[0].doorStyle='frosted';assert.throws(()=>parseProject(p),/frostad/);
});
test('published JSON schema parses and describes optional floor edits, colors and frosted doors',()=>{
 const s=JSON.parse(readFileSync(new URL('./level-project.schema.json',import.meta.url)));assert(s.properties.ground.properties.floorEdits);assert(s.properties.surfaceColors);assert(s.$defs.segment.properties.doorStyle);
});

test('frosted doors can be traversed with the actual player capsule in both directions',()=>{
 const p=JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url)));
 for(const e of p.architecture.added)if(['door','card-door'].includes(e.kind))e.doorStyle='frosted';
 const rows=testDoorTraversal(createWorld({levelProject:p,fresh:true}));assert.equal(rows.length,4);assert(rows.every(r=>r.status==='pass'),JSON.stringify(rows));
});

test('floor-only snap on both sides cannot leave an invisible gap under the existing doorway',()=>{
 const p=fixture();p.ground.floors=[{...floor,x1:3.947,z1:6},{...floor,id:'BYGG-G-0002',x0:4.053,z1:6}];p.architecture.added=[makeEntry('BYGG-V-0001','wall',[4,0],[4,6]),makeEntry('BYGG-D-0001','door',[4,2.4],[4,3.6])];
 const world=createWorld({levelProject:p,fresh:true});assert(world.onFloor(4,3));assert(world.scopeAllowed(4,3));assert(!world.onFloor(4,1),'no automatic floor outside the doorway');
 const rows=testDoorTraversal(world);assert.equal(rows.length,2);assert(rows.every(r=>r.status==='pass'),JSON.stringify(rows));
 p.ground.floors.pop();assert(!createWorld({levelProject:p,fresh:true}).onFloor(4,3),'no bridge without floor on the other side');
});

test('real Floor 5 D26 lintel reaches the actual wall ends, including the larger original source gaps',()=>{
 const p=exportProject({mode:'edit-floor5'}),world=createWorld({levelProject:p,fresh:true}),h=world.description.boxes.find(b=>b.id==='D26-lintel');
 assert(h.x-h.w/2<=38.556,'left source gap of 0.1326318 is covered');assert(h.x+h.w/2>=39.696,'right source gap of 0.028148 is covered');
 assert(h.w<1.15,'only the adjoining over-door span is filled');assert(h.y-h.h/2>=2.29,'door passage stays untouched');
});
