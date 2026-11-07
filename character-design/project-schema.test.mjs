import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,addPart,clonePart,mirrorPart,validateProject,aiBrief,animationContract,REQUIRED_CLIPS} from './project-schema.mjs?v=6.1.2';

test('new and revised projects keep a known original game skeleton',()=>{
 const p=newProject({newCharacter:true,gender:'female',template:'blank'});
 assert.equal(p.intent,'create');assert.equal(p.base.original_glb,'quaternius-operator-female.glb');
 assert.equal(validateProject(p),p);
 assert.equal(newProject().intent,'revise');
});
test('custom parts are bounded and can attach to named bones',()=>{
 const p=newProject();
 const a=addPart(p,'helmet');assert.equal(a.anchor,'Head');
 const b=clonePart(p,a.id);assert.notEqual(b.id,a.id);
 assert.equal(p.parts.length,2);
 const mirrored=mirrorPart(p,a.id);
 assert.equal(mirrored.position[0],-a.position[0]);
 assert.equal(mirrored.anchor,a.anchor);
 assert.equal(p.parts.length,3);
 assert.equal(validateProject(p),p);
 b.dimensions[0]=5;assert.throws(()=>validateProject(p),/objektdel/);
 b.dimensions[0]=.2;b.anchor='unknown';assert.throws(()=>validateProject(p),/objektdel/);
});
test('independent props are free-standing and cannot carry a skeleton parent',()=>{
 const p=newProject({kind:'object'});const a=addPart(p,'box');
 assert.equal(a.anchor,'root');assert.equal(validateProject(p),p);
 a.anchor='hand_r';assert.throws(()=>validateProject(p),/Fristående/);
});
test('AI handoff encodes all exact changes and existing required motion clips',()=>{
 const p=newProject({newCharacter:true});p.notes.face='Långt rött hår';
 const a=addPart(p,'backpack');
 const prompt=aiBrief(p,['Idle_Loop','Death01'],['Head','spine_03']);
 assert.match(prompt,/Långt rött hår/);
 assert.ok(prompt.includes('anchor='+a.anchor));
 for(const name of REQUIRED_CLIPS)assert.ok(prompt.includes(name),name);
 const contract=animationContract(p,['Idle_Loop'],['Head']);
 assert.equal(contract.reference_height_m,1.69);
 assert.ok(contract.observed_bone_names.includes('Head'));
});

test('version 6 body profiles preserve old saved files and reject unsupported extremes',()=>{
 const p=newProject();
 assert.deepEqual([p.body.shoulders,p.body.chest,p.body.arms,p.body.waist],[100,100,100,100]);
 p.body={height:100,width:100};assert.equal(validateProject(p),p);
 p.body.shoulders=82;p.body.arms=75;
 assert.equal(animationContract(p).regional_body_shape_percent.shoulders,82);
 assert.match(aiBrief(p),/Regional bind-space torso\/arm shape/);
 p.body.chest=250;assert.throws(()=>validateProject(p),/Ogiltigt kroppsreglage/);
});
test('custom GLB hairstyle must remain attached to the Head',()=>{
 const p=newProject(),hair=addPart(p,'box');
 hair.shape='glb';hair.asset='hair.glb';hair.anchor='Head';hair.hairReplacement=true;
 p.references.push({name:'hair.glb',type:'glb',bytes:3});p.embeddedReferences={'hair.glb':'AAAA'};
 assert.equal(validateProject(p),p);
 hair.anchor='spine_03';assert.throws(()=>validateProject(p),/Ersättningshår/);
 hair.anchor='Head';hair.shape='sphere';assert.throws(()=>validateProject(p),/Ersättningshår/);
});
