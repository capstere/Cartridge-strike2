import test from 'node:test';
import assert from 'node:assert/strict';
import {makeCreative,ensureCreative,validateCreative,creativeBrief} from './creative-schema.mjs?v=6.1.2';
import {newProject,validateProject,aiBrief} from './project-schema.mjs?v=6.1.2';

test('old v2 project loads with optional new creative fields',()=>{
 const old=newProject();delete old.creative;
 assert.equal(validateProject(old),old);
 assert.equal(ensureCreative(old).outfit,'original');
 assert.equal(validateProject(old),old);
});
test('outfits, shirt text and detailed face requests are preserved in handoff',()=>{
 const p=newProject({newCharacter:true});const c=p.creative;
 c.outfit='hoodie';c.hair='ponytail';c.face.eyeColor='#88aaff';
 c.face.jaw='Kantig';c.print.text='QC TEAM 05';
 c.print.imageMode='pattern';c.print.imageScale=130;c.print.imageData='data:image/png;base64,iVBORw0KGgo=';
 c.requestedAnimations=['wave','crouchJump'];
 validateProject(p);
 const md=aiBrief(p);
 for(const value of ['QC TEAM 05','Hoodie','Hästsvans','Kantig','130%','SHIRT_ARTWORK.png','Vinka','Hoppa hukande','NOT included'])assert.ok(md.includes(value),value);
});
test('reject corrupt images, wrong animation requests and invalid style names',()=>{
 const p=newProject();p.creative.print.imageData='https://example.com/track.png';
 assert.throws(()=>validateProject(p),/PNG/);
 p.creative.print.imageData=null;p.creative.outfit='not-a-style';
 assert.throws(()=>validateProject(p),/kläd/);
 p.creative.outfit='tshirt';p.creative.requestedAnimations=['wave','wave'];
 assert.throws(()=>validateProject(p),/animationer/);
 p.creative.requestedAnimations=['wave'];
 assert.equal(validateCreative(p.creative),p.creative);
});
test('face detail view remains a safe enum and project data is bounded',()=>{
 const c=makeCreative();c.faceView='left';assert.equal(validateCreative(c),c);
 c.faceView='http://example.com';assert.throws(()=>validateCreative(c),/närbildsvy/);
});
