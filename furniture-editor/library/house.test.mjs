import test from 'node:test';import assert from 'node:assert/strict';import {readFileSync,existsSync} from 'node:fs';import {createHash} from 'node:crypto';
import {HOUSE_LIBRARY} from './house-catalog.mjs';import {LIBRARY_MAP} from './catalog.mjs';import {inspectGLB} from './glb-utils.mjs';import {exportProject,exportProjectZip,parseProjectZip} from '../build/level-project.mjs?v=5.7.2';
const report=JSON.parse(readFileSync(new URL('./models/house-interior/conversion-report.json',import.meta.url)));
test('122 owner-approved static derivatives match pinned source and Blender 4.5 round-trip report',()=>{
 assert.equal(HOUSE_LIBRARY.length,122);assert.equal(report.blender,'4.5.3 LTS');assert.equal(report.files.length,123);assert.deepEqual(report.files.filter(f=>f.status==='FAILED').map(f=>f.source),['Drawer_4.blend']);
 for(const e of HOUSE_LIBRARY){assert.deepEqual(LIBRARY_MAP.get(e.id),e);const r=report.files.find(f=>f.output===e.model+'.glb'),bytes=readFileSync(new URL(e.url.replace('./library/','./'),import.meta.url)),glb=inspectGLB(bytes);assert(glb.meshCount>0);assert.equal(createHash('sha256').update(bytes).digest('hex'),e.sha256);assert.equal(e.sha256,r.sha256);assert.equal(r.triangles,r.roundTripTriangles);assert.equal(r.status,'PASS');assert(existsSync(new URL(e.thumb.replace('./library/','./'),import.meta.url)));assert(Math.abs(e.width-r.dimensionsXYZ[0])<.00006);assert(Math.abs(e.height-r.dimensionsXYZ[2])<.00006);}
});
test('all house models persist as references in backwards-compatible project ZIP',async()=>{
 const p=exportProject();p.assets.library=HOUSE_LIBRARY.map(e=>e.id);p.furniture.added=HOUSE_LIBRARY.map((e,i)=>({id:'NY-OBJ-'+String(i+1).padStart(4,'0'),assetId:e.id,assetName:e.name,kind:'prop',x:0,z:0,w:e.width,d:e.depth,height:e.height,yaw:0}));const bytes=await exportProjectZip(p);assert.deepEqual((await parseProjectZip(bytes)).project,p);
});
test('legacy transparent window shader remains transmissive instead of opaque white',()=>{
 const b=readFileSync(new URL('./models/house-interior/Window_Large1.glb',import.meta.url)),json=JSON.parse(b.subarray(20,20+b.readUInt32LE(12)).toString());const glass=json.materials.find(m=>m.name==='Glass');assert.equal(glass.extensions.KHR_materials_transmission.transmissionFactor,1);assert.equal(glass.extensions.KHR_materials_ior.ior,1);
});
