import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {deflateRawSync} from 'node:zlib';
import {readModelBundleZip,MODEL_PACK_MAX_FILES} from './model-bundle.mjs?v=5.7.2';
import {makeZip,readZip,crc32,PROJECT_ZIP_MAX_BYTES} from './zip.mjs?v=5.7.2';

const source=readFileSync(resolve('assets/fps/models/chairDesk.glb'));
function deflatedZip(name,payload) {
 const n=Buffer.from(name),packed=deflateRawSync(payload),crc=crc32(payload);
 const local=Buffer.alloc(30+n.length),a=new DataView(local.buffer,local.byteOffset,local.byteLength);
 a.setUint32(0,0x04034b50,true);a.setUint16(4,20,true);a.setUint16(8,8,true);
 a.setUint32(14,crc,true);a.setUint32(18,packed.length,true);a.setUint32(22,payload.length,true);
 a.setUint16(26,n.length,true);n.copy(local,30);
 const central=Buffer.alloc(46+n.length),b=new DataView(central.buffer,central.byteOffset,central.byteLength);
 b.setUint32(0,0x02014b50,true);b.setUint16(4,20,true);b.setUint16(6,20,true);
 b.setUint16(10,8,true);b.setUint32(16,crc,true);b.setUint32(20,packed.length,true);
 b.setUint32(24,payload.length,true);b.setUint16(28,n.length,true);n.copy(central,46);
 const end=Buffer.alloc(22),c=new DataView(end.buffer,end.byteOffset,end.byteLength);
 c.setUint32(0,0x06054b50,true);c.setUint16(8,1,true);c.setUint16(10,1,true);
 c.setUint32(12,central.length,true);c.setUint32(16,local.length+packed.length,true);
 return Buffer.concat([local,packed,central,end]);
}

test('private model pack reads stored GLB, ignores project JSON and never loads external files',async()=>{
 const bytes=makeZip([{name:'projekt.json',data:'{}'},{name:'models/'+('a'.repeat(64))+'.glb',data:source}]);
 const pack=await readModelBundleZip(bytes);
 assert.equal(pack.files.length,1);assert.equal(pack.rejected.length,0);
 assert.deepEqual(Buffer.from(pack.files[0].bytes),source);
});
test('ordinary deflated ZIP from system archivers imports GLB',async()=>{
 const pack=await readModelBundleZip(deflatedZip('models/chair.glb',source));
 assert.equal(pack.files[0].name,'chair.glb');assert.deepEqual(Buffer.from(pack.files[0].bytes),source);
});
test('traversal and corrupt ZIP contents are rejected',async()=>{
 await assert.rejects(()=>readModelBundleZip(deflatedZip('../escape.glb',source)),/osäkert/);
 const bad=Buffer.from(deflatedZip('chair.glb',source));bad[bad.length-30]^=1;
 await assert.rejects(()=>readModelBundleZip(bad),/kontrollsumma|felaktig|ZIP/);
});
test('project ZIP supports 19 user GLBs and totals above previous 24 MB limit',async()=>{
 assert.equal(MODEL_PACK_MAX_FILES,20);assert(PROJECT_ZIP_MAX_BYTES>=96*1024*1024);
 const entries=[{name:'projekt.json',data:'{}'}];
 const data=Buffer.alloc(1550000,7);
 for(let i=0;i<19;i++)entries.push({name:'models/'+i.toString(16).padStart(64,'0')+'.glb',data});
 const zipped=makeZip(entries);
 assert(zipped.length>24*1024*1024);
 assert.equal(readZip(zipped).size,20);
});
