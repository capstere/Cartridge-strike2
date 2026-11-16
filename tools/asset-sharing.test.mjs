import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {gunzipSync} from 'node:zlib';
import * as T from '../vendor/three/three.module.js';
import {cloneSkinned} from '../src/fps/skinned-clone.mjs';
test('compressed Danceman is byte-identical to the complete original',()=>{
 const original=readFileSync('assets/fps/Danceman/Danceman.glb');
 assert.deepEqual(gunzipSync(readFileSync('assets/fps/Danceman/Danceman.glb.gz')),original);
 const json=JSON.parse(original.subarray(20,20+original.readUInt32LE(12)));assert.equal(json.animations.length,16);
});
test('clones share one source skin within a character and isolate all characters',()=>{
 const source=new T.Group(),bone=new T.Bone();source.add(bone);const skin=new T.Skeleton([bone]);
 for(let i=0;i<2;i++){const mesh=new T.SkinnedMesh(new T.BufferGeometry(),new T.MeshBasicMaterial());mesh.bind(skin);source.add(mesh);}
 const a=cloneSkinned(source),b=cloneSkinned(source),skins=root=>root.children.filter(o=>o.isSkinnedMesh).map(o=>o.skeleton);
 assert.equal(skins(a)[0],skins(a)[1]);assert.notEqual(skins(a)[0],skins(b)[0]);assert.notEqual(skins(a)[0],skin);
 skins(a)[0].bones[0].position.y=2;assert.equal(skins(b)[0].bones[0].position.y,0);assert.equal(bone.position.y,0);
 skins(a)[0].computeBoneTexture();skins(b)[0].computeBoneTexture();assert.notEqual(skins(a)[0].boneTexture,skins(b)[0].boneTexture);
 skins(a)[0].dispose();assert.ok(skins(b)[0].boneTexture);
});
