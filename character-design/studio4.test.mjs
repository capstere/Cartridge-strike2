import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,validateProject,addPart,mirrorPart,animationContract} from './project-schema.mjs?v=6.1.2';
import {ensureCreative} from './creative-schema.mjs?v=6.1.2';
import {packZip} from './zip-export.mjs';
test('v3 projects gain layer/print controls without losing existing creative decisions',()=>{
 const p=newProject();p.creative.hair='ponytail';delete p.creative.fit;delete p.creative.printTransform;
 ensureCreative(p);assert.equal(p.creative.hair,'ponytail');assert.equal(p.creative.fit,100);assert.deepEqual(p.creative.printTransform,{x:0,y:0,rotation:0,scale:100});validateProject(p);
});
test('imported accessories require embedded originals; corrupted data and transforms fail closed',()=>{
 const p=newProject(),part=addPart(p);part.shape='glb';part.asset='mine.glb';
 assert.throws(()=>validateProject(p),/originalfil/);
 p.references.push({name:'mine.glb',type:'glb',bytes:4});p.embeddedReferences={'mine.glb':'YWJjZA=='};validateProject(p);
 p.embeddedReferences['mine.glb']='https://example.test/model.glb';assert.throws(()=>validateProject(p),/inbäddad/);
 p.embeddedReferences['mine.glb']='YWJjZA==';p.creative.printTransform.scale=Infinity;assert.throws(()=>validateProject(p),/tryckplacering/);
});
test('mirror preserves original asset and reflects geometry as well as attachment and location',()=>{
 const p=newProject(),part=addPart(p);part.asset='custom.glb';part.anchor='hand_l';part.position=[.2,1.2,.1];
 const mirrored=mirrorPart(p,part.id);assert.equal(mirrored.asset,'custom.glb');assert.equal(mirrored.anchor,'hand_r');assert.equal(mirrored.mirrored,true);assert.equal(mirrored.position[0],-.2);assert.equal(mirrorPart(p,mirrored.id).mirrored,false);
 assert.equal(animationContract(p).prototype_only,true);assert.match(animationContract(p).studio_preview_status,/NOT gameplay-validated/);
});
test('ZIP capacity accommodates originals, preview, faces, manifest and eight references',()=>{
 const entries=Array.from({length:25},(_,i)=>({name:'FILE_'+i+'.txt',data:'bytes'}));assert.ok(packZip(entries).byteLength>0);
 assert.throws(()=>packZip([...entries,entries[0]]),/duplicerat/);
});
