import test from 'node:test';
import assert from 'node:assert/strict';
import {FINISH_COLORS,WALL_FINISHES,DOOR_FINISHES,isTable,isChair,chairRole,chairColors,
 architecturalFinish,validateDimensions,modelScale,cameraPanVector} from './appearance.mjs';

test('table categories include desk, coffee table, catalog and personally named GLB',()=>{
 for(const item of [{kind:'table'},{kind:'desk'},{kind:'coffee-table'},{kind:'prop',assetId:'kenney:furniture-kit:table'},
  {kind:'prop',assetId:'local:123',assetName:'Vitt konferensbord'}])assert(isTable(item));
 assert(!isTable({kind:'chair'}));
});
test('stool and chair roles are deterministic, kitchen orange, office black, conference blue',()=>{
 const kitchen={kind:'chair',roomId:'I09'},office={kind:'chair',roomId:'I17'},conference={kind:'chair',chairRole:'conference',roomId:'I17'};
 assert.equal(chairRole(kitchen),'kitchen');assert.equal(chairColors(kitchen).body,FINISH_COLORS.orange);
 assert.equal(chairRole(office),'office');assert.equal(chairColors(office).body,FINISH_COLORS.black);
 assert.equal(chairColors(conference).body,FINISH_COLORS.blue);
 assert.equal(chairColors(conference).legs,FINISH_COLORS.black);
 assert(isChair({kind:'prop',assetId:'kenney:furniture-kit:chairdesk'}));
 assert.equal(chairRole({kind:'prop',assetName:'Kontorsstol',roomId:'I09'}),'office');
});
test('wall and door finishes never accept unapproved color options',()=>{
 assert.deepEqual(WALL_FINISHES,['white','gray']);
 assert.deepEqual(DOOR_FINISHES,['white','gray','red','elevator']);
 assert.equal(architecturalFinish('elevator-door'),'elevator');
 assert.equal(architecturalFinish('wall','red'),'white');
 assert.equal(architecturalFinish('door','red'),'red');
});
test('table dimensions accept bounded measurements and reject invalid or other objects',()=>{
 assert.deepEqual(validateDimensions(2.4,1.2,{kind:'table'}),{w:2.4,d:1.2});
 for(const value of [0,-1,8.01,Infinity,NaN,'4'])assert.throws(()=>validateDimensions(value,1,{kind:'table'}));
 assert.throws(()=>validateDimensions(2,1,{kind:'chair'}));
});
test('GLB table scaling has exact requested X/Y/Z sizes',()=>{
 assert.deepEqual(modelScale({x:1,y:2,z:4},{w:3,height:1,d:2}),{x:3,y:.5,z:.5});
});
test('3D modifier drag pans in camera plane and 2D remains axis-aligned',()=>{
 const right={x:1,z:0},up={x:0,z:-.7};
 const p=cameraPanVector(100,100,10,500,right,up,false);
 assert.equal(p.x,-2);assert(Math.abs(p.z+1.4)<1e-9);
 assert.deepEqual(cameraPanVector(100,100,10,500,right,up,true),{x:-2,z:-2});
});
