import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {dirname,resolve} from 'node:path';
import {LIBRARY,LIBRARY_ALL,LIBRARY_MAP,LIBRARY_SOURCE} from './catalog.mjs';
import {crc32,makeZip,readZip} from './zip.mjs?v=5.7.2';
import {inspectGLB,safeFilename} from './glb-utils.mjs';
import {exportPatch,parsePatch,BASE_COMMIT} from '../core.mjs?v=5.7.2';
const dir=dirname(fileURLToPath(import.meta.url)),root=resolve(dir,'../..');

test('104 rights-audited, isolated models and supported model types',()=>{
 assert.equal(LIBRARY.length,104);assert.equal(LIBRARY_MAP.size,LIBRARY_ALL.length);
 assert.equal(LIBRARY_SOURCE.commit,'37f5baddf99899547ae661668880809c42b450f0');
 assert.equal(LIBRARY.filter(o=>o.pack==='furniture-kit'||o.id.startsWith('kenney:')).length,72);
 for(const o of LIBRARY){
  assert.match(o.name,/\S/);assert.match(o.id,/^(kenney|nord01|hissrum12):/);
  assert(o.width>.05&&o.depth>.05&&o.height>.05);
  assert(['stolar','bord','kontor','kok','badrum','labb','industri','dekor','hissrum12'].includes(o.category));
  assert(o.license==='CC0-1.0 · Kenney'||o.license==='Original (NORD-01)'||o.license.startsWith('Original · Hissrum12'));
  assert(!o.url.startsWith('http:')&&!o.url.startsWith('https:'));
 }
 assert.equal(LIBRARY.filter(o=>o.pack==='hissrum12').length,28);
 assert(!LIBRARY_MAP.has('hissrum12:sampleBag'));
 for(const id of ['kenney:furniture-kit:toilet','kenney:furniture-kit:kitchenfridge','kenney:space-kit:machine-generator','nord01:built-in:nord01-supply_crate-lod0'])assert(LIBRARY_MAP.has(id));
});

test('new Kenney and local props export/import; old furniture format retained',()=>{
 const base=[{id:'CHAIR-1',kind:'chair',roomId:'I09',x:0.5,z:0.5,yaw:0,w:.5,d:.5,height:.7}];
 const items=base.map(o=>({...o}));items.push({id:'NY-OBJ-0001',kind:'prop',roomId:'I09',x:2,z:2,yaw:0,w:.6,d:.66,height:1.7,assetId:'kenney:furniture-kit:kitchenfridge',assetName:'Kylskåp'});
 items.push({id:'NY-OBJ-0002',kind:'prop',roomId:'I09',x:3,z:3,yaw:0,w:.8,d:.6,height:.9,assetId:'local:'+'a'.repeat(64),assetName:'Mina våg' });
 const old=exportPatch(base,base);assert.deepEqual(parsePatch(old,base).map(x=>x.id),base.map(x=>x.id));
 const patch=exportPatch(items,base,{createdAt:'2026-10-27T00:00:00Z'});
 assert.equal(patch.added.length,2);assert.equal(patch.source.commit,BASE_COMMIT);
 const parsed=parsePatch(patch,base);assert.equal(parsed.length,3);assert.equal(parsed[1].assetId,items[1].assetId);
 assert.equal(parsed[2].assetName,'Mina våg');
 assert.throws(()=>parsePatch({...patch,added:[{...patch.added[0],assetId:'http://malware.tld/a.glb'}]},base),/Ogiltig ny möbel/);
 assert.throws(()=>parsePatch({...patch,added:[{...patch.added[0],kind:'chair'}]},base),/Ogiltig ny möbel/);
});

test('GLB parser rejects external file references and oversize payload',()=>{
 const good=readFileSync(resolve(root,'assets/fps/models/chairDesk.glb'));
 assert(inspectGLB(good).meshCount>0);assert.throws(()=>inspectGLB(Buffer.alloc(44)),/GLB|glTF/);
 assert.throws(()=>inspectGLB(new Uint8Array(9*1024*1024)),/8 MB/);
 const tampered=Buffer.from(good);tampered.writeUInt32LE(tampered.length+4,8);assert.throws(()=>inspectGLB(tampered),/glTF 2.0/);
 assert(!safeFilename('../bad<script>.glb').includes('/'));
});

test('ZIP project imports only exact project and digest-named self-contained GLBs',()=>{
 const data=new TextEncoder().encode('{"schemaVersion":1}');const file=new Uint8Array([1,3,5,7,9]);const name='models/'+'f'.repeat(64)+'.glb';
 const zipped=makeZip([{name:'projekt.json',data},{name,data:file}]);const extracted=readZip(zipped);
 assert.deepEqual([...extracted.keys()],['projekt.json',name]);assert.deepEqual(extracted.get(name),file);
 assert.equal(crc32(file),0xd9a19dcb); // stable CRC against standard ZIP tooling
 assert.throws(()=>makeZip([{name:'../evil.sh',data:file}]),/Ogiltigt filnamn/);
 const damaged=Uint8Array.from(zipped);damaged[55]^=1;assert.throws(()=>readZip(damaged),/skadades|Ogiltigt/);
});
