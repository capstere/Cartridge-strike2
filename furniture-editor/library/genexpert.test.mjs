import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {GENEXPERT_LIBRARY} from './genexpert-catalog.mjs';
import {LIBRARY_ALL,LIBRARY_MAP} from './catalog.mjs';
import {inspectGLB} from './glb-utils.mjs';
import {inferPlacementRole,proposeSmartPose,duplicateFurnitureAssembly} from '../smart-placement.mjs?v=5.7.2';
import {modelFront,fittedSize} from '../model-alignment.mjs';
import {isTable,isChair} from '../appearance.mjs';
import {exportProject,exportProjectZip,parseProjectZip} from '../build/level-project.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';
import {resolveProjectScene,floor5Baseline} from '../build/project-scene.mjs?v=5.7.2';

const entries=GENEXPERT_LIBRARY;
const bytesOf=e=>readFileSync(new URL(e.url,new URL('../',import.meta.url)));
const item=(e,i=1)=>({id:'NY-OBJ-'+String(i).padStart(4,'0'),assetId:e.id,assetName:e.name,
 kind:e.kind,x:0,z:0,yaw:0,w:e.width,d:e.depth,height:e.height,wallFacing:e.wallFacing,modelSize:e.modelSize});
const bench={id:'NY-OBJ-0100',assetId:'studio:white-counter',assetName:'Labbänk',kind:'table',
 x:-2,z:0,yaw:Math.PI/2,w:1.8,d:.8,height:.9};

test('both GeneXpert assets are discoverable, unchanged uploads and self-contained',()=>{
 assert.equal(entries.length,2);assert.equal(new Set(LIBRARY_ALL.map(e=>e.id)).size,LIBRARY_ALL.length);
 for(const e of entries){const b=bytesOf(e);const report=inspectGLB(b);
  assert.equal(b.length,e.bytes);assert.equal(createHash('sha256').update(b).digest('hex'),e.sha256);
  assert.deepEqual(LIBRARY_MAP.get(e.id),e);assert.equal(e.category,'labb');assert(report.meshCount>0);
  assert(existsSync(new URL(e.thumb,new URL('../',import.meta.url))));
  const j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  assert.equal(j.animations?.length||0,0);assert.equal(j.skins?.length||0,0);
  assert(j.images.length>=2);assert(j.images.every(i=>Number.isInteger(i.bufferView)&&!i.uri));
  const triangles=j.meshes.reduce((n,m)=>n+m.primitives.reduce((s,p)=>s+j.accessors[p.indices].count/3,0),0);
  assert.equal(triangles,e.triangles);
 }
});

test('physical sizes and source +Z fronts are measured, with no semantic recoloring',()=>{
 for(const e of entries){const b=bytesOf(e),j=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)));
  const ps=j.meshes.flatMap(m=>m.primitives.map(p=>j.accessors[p.attributes.POSITION]));
  const min=[0,1,2].map(k=>Math.min(...ps.map(a=>a.min[k]))),max=[0,1,2].map(k=>Math.max(...ps.map(a=>a.max[k])));
  max.forEach((v,k)=>assert(Math.abs(v-min[k]-e.modelSize[k])<1e-7));assert(Math.abs(min[1])<1e-7);
  assert.equal(modelFront(item(e)),'+z');assert.equal(isTable(item(e)),false);assert.equal(isChair(item(e)),false);
  const fit=fittedSize(item(e));assert(Math.abs(fit.h-e.height)<.0001);assert(Math.abs(fit.w-e.width)<.0001);
  const front=j.nodes.find(n=>n.name.startsWith(e.id==='genexpert:gx16'?'Front_White':'Infinity80_FrontModules'));
  const a=j.accessors[j.meshes[front.mesh].primitives[0].attributes.POSITION];
  assert(a.min[2]>0&&Math.abs(a.max[2]-a.min[2])<1e-7,'front artwork is on +Z');
 }
});

test('GX16 mounts on benches; Infinity remains on the floor; manual floor placement works',()=>{
 assert.equal(inferPlacementRole(item(entries[0])),'countertop');assert.equal(inferPlacementRole(item(entries[1])),'floor');
 const pose=proposeSmartPose(item(entries[0]),{x:-2,z:0},[bench]);
 assert.equal(pose.mountId,bench.id);assert(Math.abs(pose.elevation-.892)<1e-9);assert.equal(pose.yaw,bench.yaw);
 const floor=proposeSmartPose(item(entries[1]),{x:-2,z:0},[bench]);assert.equal(floor.mountId,null);assert.equal(floor.elevation,0);
 const explicit=proposeSmartPose(item(entries[0]),{x:-2,z:0},[bench],{mode:'floor'});assert.equal(explicit.mountId,null);assert.equal(explicit.elevation,0);
 const placed={...item(entries[0]),...pose},clones=duplicateFurnitureAssembly(bench,[bench,placed],{x:3,z:3,yaw:0});
 assert.equal(clones[1].mountId,clones[0].id);assert.equal(clones[1].elevation,pose.elevation);
});

test('catalogue identity, dimensions, elevation and orientation survive native ZIP in both modes',async()=>{
 const before=JSON.stringify(floor5Baseline().data);
 for(const mode of ['new-level','edit-floor5']){
  const p=exportProject({mode});p.assets.library=entries.map(e=>e.id);
  p.furniture.added=[{...bench}, {...item(entries[0]),...proposeSmartPose(item(entries[0]),{x:-2,z:0},[bench])},
   {...item(entries[1],2),x:2,z:0,yaw:Math.PI}];
  // Bench is plain authored geometry; there is no dependent model asset.
  delete p.furniture.added[0].assetId;
  const q=await parseProjectZip(await exportProjectZip(p));assert.deepEqual(q.project,p);assert.equal(q.files.size,0);
  const scene=resolveProjectScene(q.project);for(const e of entries)assert(scene.items.some(o=>o.assetId===e.id));
 }
 assert.equal(JSON.stringify(floor5Baseline().data),before,'default Floor 5 and its furniture remain untouched');
});

test('FPS world uses real static footprints, retains bench height and allows surrounding passage',()=>{
 const p=exportProject();p.ground.floors=[{id:'BYGG-G-0001',name:'Test lab',role:'room',surface:'vinyl',x0:-6,z0:-5,x1:6,z1:5}];
 p.furniture.added=[{...bench,assetId:undefined}, {...item(entries[0]),...proposeSmartPose(item(entries[0]),{x:-2,z:0},[bench])}, {...item(entries[1],2),x:2}];
 p.assets.library=entries.map(e=>e.id);
 const world=createWorld({levelProject:p,fresh:true});
 assert.equal(world.staticCanOccupy(2,0,.22,1.7,0),false,'Infinity cabinet blocks walking');
 assert.equal(world.staticCanOccupy(2,1.4,.22,1.7,0),true,'front aisle remains free');
 assert.equal(world.staticCanOccupy(-2,0,.22,1.7,0),false,'bench and GX16 stay solid');
 assert(world.data.obstacles.some(o=>o.id==='NY-OBJ-0001'&&o.elevation===.892));
 assert(world.raycast({x:2,y:1,z:2},{x:0,y:0,z:-1},5),'Infinity blocks a physical ray');
});
