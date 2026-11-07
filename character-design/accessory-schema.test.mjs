import test from 'node:test';
import assert from 'node:assert/strict';
import {newProject,addPart,mirrorPart,validateProject,upgradeAccessories} from './project-schema.mjs?v=6.1.2';
test('new accessories preserve semantic identity through save, clone and mirror',()=>{
 const p=newProject(),part=addPart(p,'shoulder');part.anchor='clavicle_l';part.fitVersion=1;
 const mirrored=mirrorPart(p,part.id);assert.equal(mirrored.preset,'shoulder');assert.equal(mirrored.anchor,'clavicle_r');assert.equal(mirrored.mirrored,true);validateProject(JSON.parse(JSON.stringify(p)));
});
test('legacy presets gain quality geometry without discarding manually edited transforms',()=>{
 const p=newProject(),standard=addPart(p,'glasses'),custom=addPart(p,'cap');delete standard.preset;delete standard.fitVersion;delete custom.preset;delete custom.fitVersion;custom.position[0]=.12;
 upgradeAccessories(p);assert.equal(standard.preset,'glasses');assert.equal(standard.fitVersion,0);assert.equal(custom.preset,'cap');assert.equal(custom.fitVersion,1);assert.equal(custom.position[0],.12);
 const cube=addPart(p,'box');upgradeAccessories(p);assert.equal(cube.preset,undefined);
});
test('unknown semantic accessory data is rejected rather than exported as a misleading cube',()=>{
 const p=newProject(),part=addPart(p,'cap');part.preset='unknown';assert.throws(()=>validateProject(p),/tillbehör/);
});
