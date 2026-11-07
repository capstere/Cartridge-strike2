import {MAX_FURNITURE_RECORDS} from '../project-limits.mjs?v=5.7.3';
import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProject,parseProject,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {draftText,collectDraftFiles,exportDraftZip,readDraftZip,createDraftStore} from './draft-save.mjs?v=5.7.2';
import {prepareProjectSave} from './safe-save.mjs?v=5.7.2';
import {assetHash} from '../library/glb-utils.mjs';
import {readZip,makeZip} from '../library/zip.mjs?v=5.7.2';
const item=i=>({id:'NY-OBJ-'+String(i).padStart(4,'0'),kind:'table',x:0,z:0,yaw:0,w:.5,d:.5,height:.5});
const memory=()=>{const m=new Map();return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),m};};
test('over 350 authoring records survive ordinary JSON and native ZIP',async()=>{
 const p=exportProject();p.furniture.added=Array.from({length:507},(_,i)=>item(i));assert.equal(parseProject(p).furniture.added.length,507);
 const r=await prepareProjectSave(p,async()=>null);assert.equal(r.kind,'project');assert.deepEqual((await parseProjectZip(r.bytes)).project.furniture,p.furniture);
 assert.equal(r.document.validation.engine.ran,false);assert.equal(r.document.validation.summary.playable,false);
});
test('schema checks remain strict; fallback preserves rejected fields without truncating',async()=>{
 const p=exportProject();p.furniture.added=[{...item(1),w:-2,custom:{text:'DO NOT DROP'}}];
 assert.throws(()=>parseProject(p));const original=structuredClone(p);const r=await prepareProjectSave(p,async()=>null);
 assert.equal(r.kind,'recovery');assert.deepEqual(p,original);assert.deepEqual((await readDraftZip(r.bytes)).project,original);
 await assert.rejects(()=>parseProjectZip(r.bytes));
});
test('exceeding the authoring resource ceiling still allows a lossless draft download',async()=>{
 const p=exportProject();p.furniture.added=Array.from({length:MAX_FURNITURE_RECORDS+1},(_,i)=>item(i));assert.throws(()=>parseProject(p),/möbelposter/);
 const r=await prepareProjectSave(p,async()=>null);assert.equal(r.kind,'recovery');assert.equal((await readDraftZip(r.bytes)).project.furniture.added.length,MAX_FURNITURE_RECORDS+1);
});
test('valid draft backup remains separate from playable project and round-trips assets',async()=>{
 const data=new Uint8Array([1,2,3]),id='local:'+await assetHash(data),p=exportProject();p.assets.local=[{assetId:id,file:`assets/models/${id.slice(6)}.glb`,bytes:3}];
 const c=await collectDraftFiles(p,async()=>({data}));assert.equal(c.missing.length,0);
 const bytes=await exportDraftZip(p,c),read=await readDraftZip(bytes);assert.deepEqual(read.project,p);assert.deepEqual([...read.files.values()][0],data);
 await assert.rejects(()=>parseProjectZip(bytes),/oväntad ZIP-fil/);
});
test('missing local files are listed, not silently removed or fabricated',async()=>{
 const p=exportProject();p.assets.local=[{assetId:'local:'+'a'.repeat(64),file:'assets/models/'+'a'.repeat(64)+'.glb',bytes:10}];
 const r=await prepareProjectSave(p,async()=>{throw Error('database unavailable');});assert.equal(r.kind,'recovery');assert.equal(r.missing.length,1);
 const saved=await readDraftZip(r.bytes);assert.deepEqual(saved.project,p);assert.equal(saved.recovery.missing.length,1);
});
test('draft detects modified raw data and binary identity; zip path checks stay active',async()=>{
 const p=exportProject(),bytes=await exportDraftZip(p),entries=readZip(bytes);entries.set('project.json',new TextEncoder().encode(draftText({...p,name:'changed'})));
 await assert.rejects(()=>readDraftZip(makeZip([...entries].map(([name,data])=>({name,data})))));
 assert.throws(()=>makeZip([{name:'../bad',data:'x'}]));
});
test('a rejected autosave is kept byte-exact and cannot be overwritten by fallback scene',()=>{
 const storage=memory();storage.setItem('key','{"unknown":"keep"}');const store=createDraftStore(storage,'key');assert.equal(store.load(parseProject),null);
 assert.equal(store.save(exportProject()).ok,false);assert.equal(storage.getItem('key'),'{"unknown":"keep"}');
 store.acceptImport(exportProject());assert.equal(store.rejected,null);assert([...storage.m.values()].includes('{"unknown":"keep"}'));
});
test('quota failure preserves the previous data and reports failure honestly',()=>{
 const storage=memory(),p=exportProject();storage.setItem('key',JSON.stringify(p));const store=createDraftStore(storage,'key');store.load(parseProject);
 storage.setItem=()=>{throw Error('QuotaExceededError');};assert.equal(store.save({...p,name:'new'}).ok,false);assert.equal(storage.getItem('key'),JSON.stringify(p));assert.equal(store.failed,true);
});
test('another tab cannot be silently overwritten',()=>{
 const storage=memory(),store=createDraftStore(storage,'key');store.load(parseProject);storage.setItem('key','other tab');
 assert.equal(store.save(exportProject()).ok,false);assert.equal(storage.getItem('key'),'other tab');assert.throws(()=>store.acceptImport(exportProject()));
});
test('successive local writes retain the prior draft',()=>{
 const storage=memory(),store=createDraftStore(storage,'key');store.load(parseProject);const p=exportProject();store.save(p);store.save({...p,name:'new'});
 assert.equal(storage.getItem('key:previous'),JSON.stringify(p));assert.equal(store.failed,false);
});
