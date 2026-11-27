import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {ACTOR_FORMAT,inspectActorGLB,validateActorContract} from './character-runtime-contract.mjs';
import {ROLE_NAMES,targetLabel} from './character-roles.mjs';
import {inspectPrivateGLB,savePrivateCharacter,loadPrivateCharacter,SavedCharacterError,savedCharacterMessage} from './private-character-store.mjs';

const file=readFileSync(new URL('../../assets/fps/models/quaternius-operator-male.glb',import.meta.url));
const bytes=file.buffer.slice(file.byteOffset,file.byteOffset+file.byteLength);
const hash='8'.repeat(64);

test('the original playable rig still passes both character-package size profiles',()=>{
 const privateModel=inspectPrivateGLB(bytes), exportedModel=inspectActorGLB(file);
 assert.equal(privateModel.animations.length,13);
 assert.ok(privateModel.skins.length>0);
 assert.deepEqual(privateModel.asset,exportedModel.asset);
 const c={format:ACTOR_FORMAT,version:1,role:'player',target:'analysts-0',gender:'male',rig:'quaternius-operator-male',
  file:'CHARACTER.glb',bytes:bytes.byteLength,sha256:hash,front:'+Z',up:'+Y',source:{file:'quaternius-operator-male.glb',sha256:hash},view:{shortSleeves:true}};
 assert.equal(validateActorContract(c),c);
 assert.throws(()=>validateActorContract({...c,role:'unknown'}),/Unknown character role or roster slot/);
 assert.throws(()=>validateActorContract({...c,rig:'other'}),/rig does not match/);
});

test('character storage errors expose a stable recovery without echoing native exceptions', async()=>{
 await assert.rejects(loadPrivateCharacter('invalid'),{name:'SavedCharacterError',code:'link'});
 await assert.rejects(savePrivateCharacter({bytes,name:'Stored operator',sourceHash:''}),{name:'SavedCharacterError',code:'source'});
 await assert.rejects(savePrivateCharacter({bytes,name:'Stored operator',sourceHash:hash,projectId:'invalid'}),{name:'SavedCharacterError',code:'project'});
 assert.throws(()=>inspectPrivateGLB(new ArrayBuffer(0)),{name:'SavedCharacterError',code:'size'});
 const fallback='Choose another saved operator.';
 assert.match(savedCharacterMessage(new SavedCharacterError('rig-version'),fallback),/different rig version/);
 assert.equal(savedCharacterMessage({code:'missing',message:'untrusted data'},fallback),'This character is missing from this device.');
 assert.equal(savedCharacterMessage(new Error('untrusted data'),fallback),fallback);
});

test('cosmetic roles retain their slot identifiers and have English labels',()=>{
 assert.equal(ROLE_NAMES.hostage,'Hostage');
 assert.equal(targetLabel('hostage-all'),'All hostages');
 assert.equal(targetLabel('dwarf-variant-1'),'Dwarf appearance 2 · shared');
 assert.equal(targetLabel('analysts-0'),'A-01');
 assert.equal(targetLabel('counterAnalysts-all'),'All Counter Analysts');
});
