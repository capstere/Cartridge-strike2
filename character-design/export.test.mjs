import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import {makePrototypeGLB} from './prototype-glb.mjs';
import {inspectGLB} from '../furniture-editor/library/glb-utils.mjs';
import {crc32,packZip} from './zip-export.mjs';

test('exports a valid, locally parseable static 3D prototype with exact node metadata',()=>{
 const root=new T.Group();
 const mesh=new T.Mesh(new T.BoxGeometry(1,1,1),new T.MeshStandardMaterial({color:'#f25383'}));
 root.add(mesh);mesh.name='Hjälm';mesh.position.set(0,1.7,.08);mesh.scale.set(.25,.16,.29);
 root.updateMatrixWorld(true);
 const bytes=makePrototypeGLB([{id:'7',name:'Hjälm',anchor:'Head',mesh}]);
 const info=inspectGLB(bytes);
 assert.equal(info.meshCount,1);
 const v=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 const length=v.getUint32(12,true);
 const gltf=JSON.parse(new TextDecoder().decode(bytes.subarray(20,20+length)).trim());
 assert.equal(gltf.nodes[0].extras.anchor,'Head');
 assert.equal(gltf.accessors.length,3);
 assert.equal(gltf.buffers[0].byteLength>0,true);
 mesh.geometry.dispose();mesh.material.dispose();
});
test('store ZIP has standard headers, records and fixed CRC',()=>{
 const files=[{name:'PROJECT.json',data:'{"ok":true}'},{name:'DESIGN_SHEET.png',data:Uint8Array.of(137,80,78,71)}];
 const zip=packZip(files);
 const v=new DataView(zip.buffer,zip.byteOffset,zip.byteLength);
 assert.equal(v.getUint32(0,true),0x04034b50);
 assert.equal(v.getUint32(zip.length-22,true),0x06054b50);
 assert.equal(v.getUint16(zip.length-12,true),2);
 assert.equal(crc32(new TextEncoder().encode('hello')),0x3610a686);
 assert.throws(()=>packZip([{name:'../unsafe.json',data:'x'}]),/filnamn/);
});
