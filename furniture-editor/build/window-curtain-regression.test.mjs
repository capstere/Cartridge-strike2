import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEntry,wallPieces} from './architecture.mjs';
import {projectWallPieces,resolveProjectScene} from './project-scene.mjs?v=5.7.2';
import {exportProject,parseProject,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {collisionExport} from './ai-export.mjs?v=5.7.2';
import {makeZip,readZip} from '../library/zip.mjs?v=5.7.2';
import {paintDescription} from './surface-style.mjs';
import {sceneArchitectureData,levelProjectToWorldData} from '../../src/fps/level-adapter.mjs?v=5.7.2';
import {sealWindowBands} from './wall-joints.mjs';
import {createCurtain,parseTreatments,treatmentPosition,CURTAIN_STYLES} from './treatments.mjs';
import {createCurtainMesh} from './curtain-mesh.mjs';
import {FLOOR_FINISHES} from './pattern-presets.mjs';
const wall=()=>makeEntry('BYGG-V-0001','wall',[0,0],[10,0]);
const win=()=>makeEntry('BYGG-V-0002','window',[3,0],[5,0]);
function fixture(){const p=exportProject();p.architecture.added=[wall(),win()];
 p.ground.floors=[{id:'BYGG-G-0001',name:'Test',role:'room',surface:'carpet',x0:0,z0:0,x1:10,z1:6}];return p;}
function desc(p){const data=sceneArchitectureData(p,resolveProjectScene(p));const d={__custom:true,...data,rooms:data.zones,corridors:[],floorPolygons:[],obstacles:[],excludedRooms:[],routes:[],targets:[]};return paintDescription(globalThis.SpelWorldForLevel(d).build({}),d);}

test('window cuts meet the opaque wall exactly, without the door allowance',()=>{
 const a=projectWallPieces([wall(),win()]);const solids=a.filter(e=>e.kind==='wall');
 assert.deepEqual(solids.map(e=>[e.a[0],e.b[0]]),[[0,3],[5,10]]);
 assert.deepEqual(projectWallPieces([wall(),win()],{glazingClearance:.015}).filter(e=>e.kind==='wall').map(e=>[e.a[0],e.b[0]]),[[0,2.985],[5.015,10]]);
});
test('all samples across both lower and upper window joins hit rendered solid geometry',()=>{
 const boxes=desc(fixture()).boxes.filter(b=>b.material==='wall');
 for(const y of [.1,.5,2.7,2.8])for(const join of [3,5])for(let n=-30;n<=30;n++){
  const x=join+n*.001;
  assert(boxes.some(b=>Math.abs(x-b.x)<=b.w/2+1e-8&&Math.abs(y-b.y)<=b.h/2+1e-8),`Open seam at ${x},${y}`);
 }
});
test('real doors keep their clearance, including doors across glazing',()=>{
 const d=makeEntry('BYGG-D-0001','door',[6,0],[7.2,0]);
 assert.deepEqual(projectWallPieces([wall(),d]),wallPieces([wall(),d]));
 const out=projectWallPieces([wall(),win(),d]).filter(e=>e.kind==='wall');
 assert(out.some(e=>Math.abs(e.b[0]-5.985)<1e-8));
 assert(out.some(e=>Math.abs(e.a[0]-7.215)<1e-8));
});
test('reversed and diagonal glazing meets its own cut and unrelated/deleted panes do not cut',()=>{
 const w={...wall(),a:[0,0],b:[6,8]},g={...win(),a:[3,4],b:[1.8,2.4]};
 const out=projectWallPieces([w,g]);assert.equal(out.length,3);
 assert(out.filter(e=>e.kind==='wall').some(e=>Math.hypot(e.b[0]-1.8,e.b[1]-2.4)<.002));
 assert.deepEqual(projectWallPieces([w,{...g,deleted:true}]),projectWallPieces([w]));
 assert.equal(projectWallPieces([wall(),{...win(),a:[3,4],b:[5,4]}]).filter(e=>e.kind==='wall').length,1);
});
test('raster sealing is idempotent and cannot bridge an actual gap or canonical map',()=>{
 const base={boxes:[{id:'W',material:'wall',x:1,y:1.425,z:0,w:2,h:2.85,d:.1,angle:0},{id:'G-sill-wall',material:'wall',x:3,y:.45,z:0,w:2,h:.9,d:.1,angle:0}]};
 const data={__custom:true,walls:[{id:'W'},{id:'G'}]};const copy=structuredClone(base);
 sealWindowBands(copy,data);assert.equal(copy.boxes[1].jointSealed,true);
 const once=structuredClone(copy);sealWindowBands(copy,data);assert.deepEqual(copy,once);
 const gap=structuredClone(base);gap.boxes[1].x+=.02;const original=structuredClone(gap);sealWindowBands(gap,data);assert.deepEqual(gap,original);
 sealWindowBands(base,{...data,__custom:false});assert.equal(base.boxes[1].jointSealed,undefined);
});
test('revision-1 ZIP is verified exactly and new export upgrades to revision 2',async()=>{
 const p=fixture(),old=JSON.stringify(collisionExport(p,{geometryRevision:1}),null,2)+'\n';
 const entries=[{name:'project.json',data:JSON.stringify(p)},{name:'COLLISION_MAP.json',data:old}];
 assert.deepEqual((await parseProjectZip(makeZip(entries))).project,p);
 const zip=await exportProjectZip(p),map=JSON.parse(new TextDecoder().decode(readZip(zip).get('COLLISION_MAP.json')));
 assert.equal(map.geometryRevision,2);assert.deepEqual((await parseProjectZip(zip)).project,p);
 const tampered=JSON.parse(old);tampered.staticWalls[0].a[0]+=.1;
 await assert.rejects(()=>parseProjectZip(makeZip([entries[0],{name:'COLLISION_MAP.json',data:JSON.stringify(tampered,null,2)+'\n'}])),/kollisionskarta/);
});
test('reopened excluded and uncertain floors accept every finish, but closed ones stay forbidden',async()=>{
 for(const id of ['X28','I35'])for(const finish of FLOOR_FINISHES){
  const p=exportProject({mode:'edit-floor5'});p.ground.openedAreas=[id];p.floorFinishes={[id]:finish};
  const read=parseProject(p);assert.equal(resolveProjectScene(read).floors.find(f=>f.id===id).surface,finish);
  assert.equal(levelProjectToWorldData(read).data.rooms.find(f=>f.id===id).surface,finish);
  assert.deepEqual((await parseProjectZip(await exportProjectZip(read))).project,read);
  delete p.ground.openedAreas;assert.throws(()=>parseProject(p),/golvfinish/);
 }
});
test('three curtain variants round-trip on either wall side without adding collision',async()=>{
 for(const style of CURTAIN_STYLES)for(const side of [-1,1]){
  const p=fixture(),before=collisionExport(p);
  p.architecture.treatments=[createCurtain(p.architecture.added,[],win().id,[3.02,0],[4.98,0],{style,side})];
  assert.deepEqual(collisionExport(p),before);
  assert.deepEqual((await parseProjectZip(await exportProjectZip(p))).project,p);
  const item=p.architecture.treatments[0],at=treatmentPosition(item,p.architecture.added);
  const mesh=createCurtainMesh(item,at),fabric=mesh.children.filter(x=>x.name==='continuous-curtain-fabric');
  assert.equal(fabric.length,1);assert.equal(fabric[0].material.depthWrite,style==='white-opaque');
  assert.equal(fabric[0].material.transparent,style!=='white-opaque');assert.equal(fabric[0].material.forceSinglePass,true);
  if(style==='sheer')assert.equal(fabric[0].material.opacity,.32);
  const b=fabric[0].geometry.boundingBox;assert(Math.abs(b.max.x-b.min.x-at.width)<1e-6);assert(b.min.z>=.0079);
  mesh.traverse(o=>{o.geometry?.dispose();o.material?.dispose();});
 }
});
