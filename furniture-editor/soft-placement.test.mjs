import test from 'node:test';
import assert from 'node:assert/strict';
import {findNearbyFreePlacement} from './soft-placement.mjs';
const original=Object.freeze({id:'NY-OBJ-0001',x:3,z:3,w:.7,d:.7,height:.8,yaw:0,collision:'solid'});
test('leave already-valid position unchanged',()=>{
 const r=findNearbyFreePlacement(original,()=>true);
 assert.equal(r.adjusted,false);assert.strictEqual(r.item,original);
});
test('suggest a small nudge while preserving furniture properties',()=>{
 const r=findNearbyFreePlacement(original,p=>p.x>=3.3);
 assert.equal(r.adjusted,true);assert(r.item.x>=3.3);
 assert(Math.hypot(r.item.x-3,r.item.z-3)<=.9);
 for(const field of ['id','w','d','height','yaw','collision'])assert.equal(r.item[field],original[field]);
});
test('do not teleport or reject a user-selected exact position when no fit exists',()=>{
 let tries=0;const r=findNearbyFreePlacement(original,()=>{tries++;return false});
 assert.equal(r.adjusted,false);assert.strictEqual(r.item,original);
 assert(tries>10&&tries<200);
});
test('only choose positions allowed by a callers room-aware geometry checker',()=>{
 const r=findNearbyFreePlacement(original,p=>p.x>3.3&&p.x<=3.6&&p.z===3);
 assert.equal(r.adjusted,true);assert(r.item.x>3.3&&r.item.x<=3.6);
});
test('reject missing checker',()=>assert.throws(()=>findNearbyFreePlacement(original,null)));
