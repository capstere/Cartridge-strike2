import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../../vendor/three/three.module.js';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {floor5Baseline,resolveProjectScene} from './project-scene.mjs?v=5.7.2';
import {floorGaps,gapFloor,closedAreas} from './walkable-spaces.mjs?v=5.7.2';
import {architecturePreview} from './architecture-preview.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';
import {reconcileSurfaceColors} from './surface-style.mjs?v=5.1.0';
import {makeEntry} from './architecture.mjs?v=5.1.0';
import {PROCEDURAL_LIBRARY} from '../library/procedural.mjs';
import {buildProjectFurniture} from './project-visuals.mjs?v=5.1.0';
const floor={id:'BYGG-G-0001',name:'Rum',role:'room',surface:'carpet',x0:0,z0:0,x1:8,z1:8};
function fixture(){const p=exportProject({ground:{bounds:{x0:-10,z0:-10,x1:10,z1:10},wallHeightDefault:2.85,floors:[floor]}});p.architecture.added=[makeEntry('BYGG-V-0001','wall',[0,0],[8,0]),makeEntry('BYGG-D-0001','door',[3,0],[4.2,0]),makeEntry('BYGG-V-0002','window',[0,8],[8,8])];return p;}
test('surface colors survive ZIP, paint actual FPS surfaces/leaves, preserve clear window glass',async()=>{
 const p=fixture();p.surfaceColors={'BYGG-G-0001':'#456789','BYGG-V-0001':'#66bb44','BYGG-D-0001':'#cc5533','BYGG-V-0002':'#55aacc'};
 assert.deepEqual((await parseProjectZip(await exportProjectZip(p))).project,p);
 const world=createWorld({levelProject:p,fresh:true});
 assert.equal(world.description.surfaces.find(s=>s.id==='finish-BYGG-G-0001').studioColor,'#456789');
 assert.equal(world.doors.doors[0].studioColor,'#cc5533');
 const preview=architecturePreview(p,resolveProjectScene(p)),meshes=[];preview.traverse(o=>{if(o.isMesh)meshes.push(o);});
 assert(meshes.some(o=>o.userData.editId==='BYGG-V-0001'&&o.material.color.getHexString()==='66bb44'));
 assert(meshes.some(o=>o.userData.editId==='BYGG-D-0001'&&o.geometry.parameters.height>2));
 assert(meshes.some(o=>o.userData.editId==='BYGG-V-0002'&&o.material.transparent&&o.material.opacity===.28));
 assert(meshes.some(o=>o.userData.editId==='BYGG-V-0002'&&o.material.color.getHexString()==='55aacc'));
 const open=architecturePreview(p,resolveProjectScene(p),{openDoors:true,selected:'BYGG-D-0001'});
 const openLeaves=[];open.traverse(o=>{if(o.isMesh&&o.userData.editId==='BYGG-D-0001'&&o.geometry.parameters.height>2)openLeaves.push(o);});
 assert(openLeaves.some(o=>Math.abs(o.rotation.y)>0.5));
 assert.throws(()=>parseProject({...p,surfaceColors:{'unknown':'#ffffff'}}),/ytfärg/);
 assert.throws(()=>parseProject({...p,surfaceColors:{'BYGG-G-0001':'url(x)'}}),/ytfärg/);
});
test('lounge floor gap is reproduced and explicitly bridged; original world and furniture are unchanged',async()=>{
 const source=JSON.stringify(floor5Baseline().data),p=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(p);
 const gaps=floorGaps(scene.floors,floor5Baseline().data.floorPolygons,scene.closed),gap=gaps.find(g=>g.id.includes('C11:I25'));
 assert(gap);assert(Math.abs(gap.gap-.056)<1e-6);
 const before=createWorld({levelProject:p,fresh:true});assert.equal(before.scopeAllowed(38.04,28.5),false);
 p.ground.floors.push(gapFloor(gap,'BYGG-G-0001'));
 const round=(await parseProjectZip(await exportProjectZip(p))).project,after=createWorld({levelProject:round,fresh:true});
 assert(after.canOccupy(38.04,28.5));assert(after.segmentClear({x:37.8,z:28.5},{x:38.5,z:28.5}));
 const actor={x:37.8,y:0,z:28.5,radius:.22,height:1.7};for(let i=0;i<40;i++)after.move(actor,.025,0,0);assert(actor.x>38.7,'Real player capsule crosses lounge entrance');
 assert.deepEqual(resolveProjectScene(round).items,scene.items);
 p.ground.floors=[];assert.equal(createWorld({levelProject:p,fresh:true}).scopeAllowed(38.04,28.5),false);
 assert.equal(JSON.stringify(floor5Baseline().data),source);
});
test('closed areas require known source identity and explicit local-project opening',()=>{
 const data=floor5Baseline().data,p=exportProject({mode:'edit-floor5'}),area=closedAreas(data).find(r=>r.id==='X02'),original=JSON.stringify(data);
 assert(area);const x=area.polygon.reduce((s,v)=>s+v[0],0)/area.polygon.length,z=area.polygon.reduce((s,v)=>s+v[1],0)/area.polygon.length;assert(!createWorld({levelProject:p,fresh:true}).scopeAllowed(x,z));assert(!resolveProjectScene(p).floors.some(f=>f.id===area.id));
 p.ground.openedAreas=[area.id];assert(resolveProjectScene(parseProject(p)).floors.some(f=>f.id===area.id));
 const world=createWorld({levelProject:p,fresh:true});assert(!world.data.excludedRooms.some(r=>r.id===area.id));assert(world.scopeAllowed(x,z));
 assert.equal(JSON.stringify(data),original);
 assert.throws(()=>parseProject({...p,ground:{...p.ground,openedAreas:['unknown']}}),/stängd/);
 assert.throws(()=>parseProject({...fixture(),ground:{...fixture().ground,openedAreas:[area.id]}}),/stängd/);
});
test('gap analysis ignores touching, distant, already bridged and blocked areas',()=>{
 const a={...floor,x1:4},b={...floor,id:'BYGG-G-0002',x0:4.05};assert.equal(floorGaps([a,b]).length,1);
 assert.equal(floorGaps([a,{...b,x0:4}]).length,0);assert.equal(floorGaps([a,{...b,x0:4.3}]).length,0);
 const polygon=[[3,0],[5,0],[5,8],[3,8]];assert.equal(floorGaps([a,b],[polygon]).length,0);assert.equal(floorGaps([a,b],[],[{polygon}]).length,0);
});
test('eleven reused MIT props are measured, centered and grounded with identical studio/FPS geometry',async()=>{
 const entries=PROCEDURAL_LIBRARY.filter(e=>e.prefab);assert.equal(entries.length,11);
 for(const e of entries){const root=new T.Group();await buildProjectFurniture([{id:'NY-OBJ-0001',assetId:e.id,w:e.width,d:e.depth,height:e.height,x:0,z:0,yaw:0}],root);const b=new T.Box3().setFromObject(root),s=b.getSize(new T.Vector3());assert(Math.abs(b.min.y)<1e-5);assert(Math.abs(b.min.x+b.max.x)<1e-5);assert(Math.abs(s.x-e.width)<1e-5);assert(Math.abs(s.z-e.depth)<1e-5);assert(Math.abs(s.y-e.height)<1e-5);}
});

test('paint survives splitting a wall and removed paint cannot leave an invalid project',()=>{
 const p=fixture();p.surfaceColors={'BYGG-V-0001':'#447788'};const previous=structuredClone(p),old=structuredClone(p.architecture.added);p.architecture.added=p.architecture.added.filter(e=>e.id!=='BYGG-V-0001');p.architecture.added.push(makeEntry('BYGG-V-0003','wall',[0,0],[3,0]),makeEntry('BYGG-V-0004','wall',[4.2,0],[8,0]));reconcileSurfaceColors(p,previous,p.architecture.added,old,p.ground.floors);assert.equal(p.surfaceColors['BYGG-V-0003'],'#447788');assert.equal(p.surfaceColors['BYGG-V-0004'],'#447788');assert(!p.surfaceColors['BYGG-V-0001']);assert(!p.surfaceColors['BYGG-D-0001']);parseProject(p);
});
