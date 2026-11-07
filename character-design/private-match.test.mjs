import test from 'node:test';
import assert from 'node:assert/strict';
import {newMatchPilot,validateMatchPilot} from './private-match.mjs?v=6.1.2';
import {inspectPrivateGLB,validCharacterId,MAX_CHARACTER_BYTES} from '../src/fps/private-character-store.mjs';
test('pilot preserves user project and rejects unverified combinations before export',()=>{
 const p=newMatchPilot();p.creative.print.text='MIN DESIGN';p.palette.jacket='#abcdef';const before=JSON.stringify(p);assert.equal(validateMatchPilot(p),p);assert.equal(JSON.stringify(p),before);
 for(const change of [p=>p.base.gender='female',p=>p.body.arms=80,p=>p.creative.fit=90,p=>p.creative.hair='swept',p=>p.creative.realism.garment='cape',p=>p.creative.face.jaw='Bred',p=>p.creative.shoes='boots']){const copy=structuredClone(p);change(copy);const snapshot=JSON.stringify(copy);assert.throws(()=>validateMatchPilot(copy));assert.equal(JSON.stringify(copy),snapshot);}
});
test('private links and malformed/oversized GLB fail closed',()=>{
 assert.equal(validCharacterId('../secret'),false);assert.equal(validCharacterId('https://host/asset.glb'),false);assert.equal(validCharacterId('00112233-4455-6677-8899-aabbccddeeff'),true);
 assert.throws(()=>inspectPrivateGLB(new ArrayBuffer(MAX_CHARACTER_BYTES+1)),/24 MiB/);assert.throws(()=>inspectPrivateGLB(new ArrayBuffer(28)),/skadad/);
});

test('saving an untouched head adds metadata but does not make it sculpted',()=>{
 const p=newMatchPilot();p.creative.sculpt.models.male={'face-skin':{count:1,topology:'s1-12345678',deltas:[],paint:[]}};assert.equal(validateMatchPilot(p),p);p.creative.sculpt.models.male['face-skin'].deltas=[0,.001,0,0];assert.throws(()=>validateMatchPilot(p),/skulptering/);
});

test('exposed arm colour samples the original atlas with glTF UV orientation and tint',async()=>{
 const {skinColorAt}=await import('./fashion-preview.mjs?v=6.1.2');const T=await import('../vendor/three/three.module.js');const pixels={width:1,height:2,data:new Uint8Array([128,64,32,255,240,200,180,255])},tint=new T.Color(.8,.7,.6);
 const expected=new T.Color().setRGB(128/255,64/255,32/255,T.SRGBColorSpace).multiply(tint);assert(skinColorAt(pixels,.5,0,false,tint).equals(expected));assert(skinColorAt(pixels,.5,1,true,tint).equals(expected));
});
