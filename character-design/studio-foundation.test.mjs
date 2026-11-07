import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import * as T from '../vendor/three/three.module.js';
import {makeStudioHair,makeStudioJacket,scalpLine} from './studio-foundation.mjs';
import {applyStudioFoundation,ensureCreative} from './creative-schema.mjs?v=6.1.2';
import {newProject,validateProject} from './project-schema.mjs?v=6.1.2';
// Read the actual original GLB accessors. No hand-made substitute anatomy.
async function sourceAvatar(gender){
 const bytes=await readFile(new URL('../assets/fps/models/quaternius-operator-'+gender+'.glb',import.meta.url)),jsonLength=bytes.readUInt32LE(12),json=JSON.parse(bytes.toString('utf8',20,20+jsonLength)),bin=bytes.subarray(28+jsonLength),meshes=[];
 const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4},types={5126:Float32Array,5123:Uint16Array,5125:Uint32Array,5121:Uint8Array};
 const attribute=id=>{const a=json.accessors[id],view=json.bufferViews[a.bufferView],Type=types[a.componentType],size=sizes[a.type],array=new Type(a.count*size),start=(view.byteOffset||0)+(a.byteOffset||0),stride=view.byteStride||size*Type.BYTES_PER_ELEMENT;for(let i=0;i<a.count;i++)for(let n=0;n<size;n++){const off=start+i*stride+n*Type.BYTES_PER_ELEMENT;array[i*size+n]=a.componentType===5126?bin.readFloatLE(off):Type.BYTES_PER_ELEMENT===1?bin[off]:Type.BYTES_PER_ELEMENT===2?bin.readUInt16LE(off):bin.readUInt32LE(off);}return new T.BufferAttribute(array,size);};
 for(const mesh of json.meshes)for(const p of mesh.primitives){const g=new T.BufferGeometry();for(const [key,name]of [['POSITION','position'],['NORMAL','normal'],['JOINTS_0','skinIndex'],['WEIGHTS_0','skinWeight']])if(p.attributes[key]!==undefined)g.setAttribute(name,attribute(p.attributes[key]));if(p.indices!==undefined)g.setIndex(attribute(p.indices));const m=new T.SkinnedMesh(g,new T.MeshStandardMaterial({name:json.materials[p.material].name}));m.name=mesh.name;meshes.push(m);}
 const skin=meshes.find(m=>m.material.name==='face-skin'),box=new T.Box3().setFromBufferAttribute(skin.geometry.attributes.position),a={skin,top:box.max.y,width:box.max.x-box.min.x,depth:box.max.z-box.min.z,centerZ:(box.max.z+box.min.z)/2};return {meshes,rigHeadTop:a.top,a};
}
for(const gender of ['male','female'])test('studio cut and jacket use real '+gender+' anatomy with bounded geometry and normalized weights',async()=>{
 const avatar=await sourceAvatar(gender),male=await sourceAvatar('male'),donor=male.meshes.find(m=>m.material.name==='hair'&&!/eyebrow/i.test(m.name));donor.scalpBounds=male.a;
 const hair=makeStudioHair(avatar.a,'#352922',donor,Float32Array.from(avatar.a.skin.geometry.attributes.position.array));let triangles=0;
 hair.traverse(m=>{if(!m.isMesh)return;const p=m.geometry.attributes.position;assert.ok(p.array.every(Number.isFinite));triangles+=(m.geometry.index?.count||p.count)/3;assert.ok(p.count>100);});
 assert.ok(triangles<14000);assert.ok(hair.getObjectByName('studio-swept-scalp'));assert.ok(hair.getObjectByName('studio-swept-locks'));
 const scalp=hair.getObjectByName('studio-swept-scalp').geometry.attributes.position;
 for(let i=0;i<scalp.count;i++)if(Math.abs(scalp.getX(i))>avatar.a.width*.43)assert.ok(scalp.getY(i)>avatar.a.top-.071,'scalp underlayer must exclude the outer ear surface');
 assert.ok(scalpLine(avatar.a,new T.Vector3(.09,avatar.a.top-.1,avatar.a.centerZ))>avatar.a.top-.10,'temples clear the ear tops');
 const parts=makeStudioJacket(avatar,'#465e68','#8faaa7');assert.equal(parts.length,2);
 for(const m of parts){assert.ok(m.isSkinnedMesh);const p=m.geometry.attributes.position,w=m.geometry.attributes.skinWeight;assert.ok(p.array.every(Number.isFinite));for(let i=0;i<w.count;i++)assert.ok(Math.abs([0,1,2,3].reduce((s,k)=>s+w.getComponent(i,k),0)-1)<1e-6);}
});
test('new foundation is explicit; legacy designs and authored assets are preserved',()=>{
 const legacy=newProject();legacy.creative.hair='ponytail';legacy.creative.fit=112;const before=structuredClone(legacy.creative);ensureCreative(legacy);assert.deepEqual(legacy.creative,before);
 const p=newProject({newCharacter:true});p.references.push({name:'idea.png',type:'png',bytes:3});const references=structuredClone(p.references);applyStudioFoundation(p);validateProject(p);assert.equal(p.creative.hair,'swept');assert.equal(p.creative.outfit,'fieldjacket');assert.deepEqual(p.references,references);assert.equal(p.creative.realism.fiberHair,false);
});
