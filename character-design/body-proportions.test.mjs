import test from 'node:test';
import assert from 'node:assert/strict';
import {BODY_REGIONS,bodyRegions,shapeBodyVertex,applyBodyRegions} from './body-proportions.mjs';
test('legacy profiles are identity, including a real torso vertex',()=>{
 assert.deepEqual(bodyRegions({height:102,width:90}),{shoulders:100,chest:100,arms:100,waist:100});
 assert.deepEqual(shapeBodyVertex(.32,1.42,.12,{}),[.32,1.42,.12]);
});
test('regional sliders edit garment vertices but not head and hands',()=>{
 const slim={shoulders:80,chest:80,arms:75,waist:85};
 const shoulder=shapeBodyVertex(.35,1.43,.12,slim,'jacket-fabric');
 assert.ok(shoulder[0]<.35&&shoulder[2]<.12);
 const arm=shapeBodyVertex(.48,1.32,.16,slim,'jacket-fabric');
 assert.ok(arm[2]<.16);
 const waist=shapeBodyVertex(.18,1.05,.12,slim,'trousers-fabric');
 assert.ok(waist[0]<.18&&waist[2]<.12);
 assert.deepEqual(shapeBodyVertex(.2,1.69,.11,slim,'face-skin'),[.2,1.69,.11]);
 assert.deepEqual(shapeBodyVertex(.55,.95,.07,slim,'gloves-leather'),[.55,.95,.07]);
});
test('limits reject corrupted saved projects',()=>{
 for(const [key,bounds] of Object.entries(BODY_REGIONS)){
  for(const v of [NaN,Infinity,bounds.min-1,bounds.max+1,'100']){
   assert.throws(()=>bodyRegions({[key]:v}),/Ogiltigt kroppsreglage/);
  }
 }
});
test('mesh mutation edits positions only, repeated application is caller-controlled',()=>{
 const data=[.36,1.4,.14,.19,1.04,.12];let writes=0;
 const attribute={count:2,getX:i=>data[i*3],getY:i=>data[i*3+1],getZ:i=>data[i*3+2],
  setXYZ:(i,x,y,z)=>{writes++;data.splice(i*3,3,x,y,z);}};
 assert.equal(applyBodyRegions(attribute,{shoulders:80,chest:90,arms:85,waist:90},'jacket-fabric'),true);
 assert.equal(writes,2);assert.ok(data.every(Number.isFinite));assert.equal(attribute.needsUpdate,true);
 assert.equal(applyBodyRegions(attribute,{},'jacket-fabric'),false);
 assert.equal(applyBodyRegions(attribute,{shoulders:80},'face-skin'),false);
});
