import {MAX_FURNITURE_RECORDS} from './project-limits.mjs?v=5.7.3';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {EDITOR_VERSION,GAME_VERSION,BASE_COMMIT,PATCH_FORMAT,round,normalizeAngle,
  inside,corners,intersects,segmentIntersectsRectangle,catalog,validate,exportPatch,parsePatch} from './core.mjs?v=5.7.2';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'..');
function fixture(){
 const data={rooms:[{id:'I09',name:'Lunch room',status:'included',polygon:[[0,0],[12,0],[12,12],[0,12]]}],
 obstacles:[{id:'CHAIR-01',kind:'authored-chair',roomId:'I09',polygon:[[2,2],[2.45,2],[2.45,2.45],[2,2.45]],yaw:Math.PI/2},
 {id:'TABLE-01',kind:'authored-dining-table',roomId:'I09',polygon:[[5,5],[7,5],[7,6],[5,6]]},
 {id:'BENCH-01',kind:'lab-bench',roomId:'I09',polygon:[[9,9],[10,9],[10,10],[9,10]]}],walls:[{a:[0,0],b:[12,0],thickness:.10}],doors:[{id:'D01',a:[0,6],b:[0,7]}],
 excludedRooms:[]};
 const f={boxes:[{asset:'chairDesk',id:'fps-I09-pantry-table-1-chair-b-1',roomId:'I09',x:4,z:4,w:.44,h:.94,d:.44,angle:Math.PI,furnishingId:'fps-I09-pantry-table-1'}],instances:[{id:'fps-I09-pantry-table-1',roomId:'I09',prefab:'pantry-table',transform:{x:6,y:0,z:4,yaw:0},footprint:{w:2,d:1.8}}]};
 return {data,f,base:catalog(data,f)};
}
test('geometry and angle helpers remain deterministic',()=>{
 assert.equal(round(1.23456),1.235);assert(Math.abs(normalizeAngle(3*Math.PI))===Math.PI);
 const q={x:5,z:5,w:1,d:1,yaw:Math.PI/2};assert.equal(corners(q).length,4);
 assert(inside(5,5,[[4,4],[6,4],[6,6],[4,6]]));
 assert(intersects({x:0,z:0,w:1,d:1,yaw:0},{x:.5,z:.2,w:1,d:1,yaw:0}));
 assert(!intersects({x:0,z:0,w:1,d:1,yaw:0},{x:3,z:3,w:1,d:1,yaw:0}));
 assert(segmentIntersectsRectangle([0,1],[5,1],{x:2,z:1,w:.5,d:.5,yaw:0}));
});
test('stable editable identity for source chairs, other props and generated chairs',()=>{
 const {base}=fixture();assert.equal(base.length,4);
 assert.equal(base.find(o=>o.id==='CHAIR-01').kind,'chair');
 assert.equal(base.find(o=>o.id==='fps-I09-pantry-table-1-chair-b-1').yaw,Math.PI);
 assert(base.every(o=>Number.isFinite(o.x)&&Number.isFinite(o.z)));
});
test('existing chair rotation works; moved chair cannot cross fixed bench or room',()=>{
 const {data,base}=fixture();const original=base[0],objects=base.map(o=>({...o,original:{...o}}));
 assert.equal(validate({...original,yaw:Math.PI},objects,data,original),null);
 assert.match(validate({...original,x:9.5,z:9.5},objects,data,original),/fast möbel/);
 assert.match(validate({...original,x:-1},objects,data,original),/utanför/);
});
test('export/import roundtrip captures move, rotation, deletion and copy without mutating original model',()=>{
 const {base}=fixture(),modified=base.map(o=>({...o}));
 modified[0].yaw=Math.PI;modified[0].x=3;
 modified[1].deleted=true;
 modified.push({id:'NY-STOL-001',kind:'chair',roomId:'I09',x:8,z:5,yaw:0,w:.45,d:.45,height:.76,source:'added'});
 const doc=exportPatch(modified,base,{createdAt:'2026-10-27T00:00:00.000Z'});
 assert.equal(doc.format,PATCH_FORMAT);assert.equal(doc.source.commit,BASE_COMMIT);
 assert.equal(doc.placements.length,1);assert.equal(doc.added.length,1);assert.equal(doc.removed.length,1);
 const imported=parsePatch(doc,base);assert.equal(imported.find(o=>o.id===modified[0].id).x,3);
 assert(imported.some(o=>o.id==='NY-STOL-001'));assert(imported.find(o=>o.id===modified[1].id).deleted);
 assert.equal(base[0].x,2.225);assert.equal(exportPatch(imported,base).placements.length,1);
});
test('unsafe or incompatible JSON imports are rejected, gameplay remains unmodified',()=>{
 const {base}=fixture();const doc=exportPatch(base,base);
 assert.throws(()=>parsePatch({...doc,source:{...doc.source,commit:'other'}},base),/annan spelversion/);
 assert.throws(()=>parsePatch({...doc,placements:[{id:'UNKNOWN',kind:'chair',roomId:'I09',x:1,z:1,yaw:0}]},base),/matchar inte/);
 assert.throws(()=>parsePatch({...doc,added:[{id:'../evil',kind:'chair',roomId:'I09',x:1,z:1,yaw:0,w:1,d:1,height:1}]},base),/ny möbel/);
 assert.throws(()=>parsePatch({...doc,placements:Array(MAX_FURNITURE_RECORDS+1).fill({})},base),/många/);
 assert.throws(()=>parsePatch({...doc,placements:Array(400).fill({})},base),/Ogiltigt/);
 const html=readFileSync(resolve(root,'furniture-editor/index.html'),'utf8');
 assert(html.includes('SPARA MITT PROJEKT'));assert(!html.includes('src/fps/app.mjs'));
 for(const path of ['furniture-editor/main.mjs','furniture-editor/core.mjs']){
  const s=readFileSync(resolve(root,path),'utf8');assert(!s.includes('fetch('));assert(!s.includes('localStorage.setItem(\'cartridge-settings'));
 }
});
console.log('Furniture editor '+EDITOR_VERSION+' tested for '+GAME_VERSION);

test('existing tables can change real dimensions and preserve them in old-format project JSON',()=>{
 const {base}=fixture(),table=base.find(x=>x.kind==='table');
 const changed=base.map(o=>o.id===table.id?{...o,w:o.w+.25,d:o.d+.1}:o);
 const doc=exportPatch(changed,base);
 const update=doc.placements.find(x=>x.id===table.id);
 assert(update&&update.w===round(table.w+.25)&&update.d===round(table.d+.1));
 const restored=parsePatch(doc,base).find(o=>o.id===table.id);
 assert(Math.abs(restored.w-changed.find(o=>o.id===table.id).w)<1e-9);
 assert(Math.abs(restored.d-changed.find(o=>o.id===table.id).d)<1e-9);
});
test('chair role and curated GLB role survive export and import',()=>{
 const {base}=fixture(),chair=base.find(x=>x.kind==='chair');
 const objects=base.map(o=>o.id===chair.id?{...o,chairRole:'conference'}:o);
 objects.push({id:'NY-OBJ-7000',source:'added',kind:'prop',assetId:'kenney:furniture-kit:table',
 assetName:'Bord',assetRole:'table',roomId:'I09',x:9,z:4,yaw:0,w:2,d:.8,height:.75});
 const doc=exportPatch(objects,base);
 assert.equal(doc.placements.find(x=>x.id===chair.id).chairRole,'conference');
 assert.equal(doc.added.find(x=>x.id==='NY-OBJ-7000').assetRole,'table');
 const loaded=parsePatch(doc,base);
 assert.equal(loaded.find(x=>x.id===chair.id).chairRole,'conference');
 assert.equal(loaded.find(x=>x.id==='NY-OBJ-7000').assetRole,'table');
 assert.throws(()=>parsePatch({...doc,added:doc.added.map(x=>({...x,assetRole:'elevator'}))},base),/kategori/);
});
test('copied desks and coffee tables are valid saved additions',()=>{
 const {base}=fixture();
 for(const kind of ['desk','coffee-table']){
  const item={id:'NY-BORD-7001',kind,source:'added',roomId:'I09',x:8,z:6,yaw:0,w:1.2,d:.6,height:.75};
  const saved=exportPatch([...base,item],base);
  assert.equal(parsePatch(saved,base).find(x=>x.id===item.id)?.kind,kind);
 }
});
