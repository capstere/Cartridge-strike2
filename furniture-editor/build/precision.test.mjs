import test from 'node:test';
import assert from 'node:assert/strict';
import {snapDraftPoint,dimensionsFromWall,joinNearbyEnds,straightenEntry} from './precision.mjs?v=5.1.0';
import {makeEntry} from './architecture.mjs?v=5.1.0';

const a=makeEntry('BYGG-V-0001','wall',[1.137,2.271],[5.137,2.271]);
a.height=3.25;a.thickness=.15;
const b=makeEntry('BYGG-V-0002','wall',[5.137,2.271],[5.137,6.271]);
test('joins exact non-grid source junctions before 10cm grid rounding',()=>{
 const value=snapDraftPoint([5.18,2.24],[a,b],{start:[4,2.23]});
 assert.deepEqual(value.point,[5.137,2.271]);assert.equal(value.kind,'ände');
});
test('draw straight even if pointer misses target axis slightly',()=>{
 const value=snapDraftPoint([4.23,3.14],[],{start:[1,3],snapToGeometry:false});
 assert.deepEqual(value.point,[4.2,3]);assert.equal(value.kind,'rät vinkel');
});
test('project exact wall-axis coordinates for T-junctions without glips',()=>{
 const value=snapDraftPoint([3.246,2.38],[a],{start:null,grid:0});
 assert.deepEqual(value.point,[3.246,2.271]);assert.equal(value.kind,'vägglinje');
});
test('disable snapping for intentionally diagonal or free placement',()=>{
 const p=snapDraftPoint([4.23,3.14],[a,b],{start:[1,3],grid:0,snapToGeometry:false,axisLock:false});
 assert.deepEqual(p.point,[4.23,3.14]);assert.equal(p.kind,'fri');
});
test('inherit neighboring wall dimensions and avoid random global height',()=>{
 assert.deepEqual(dimensionsFromWall([2.4,2.3],[a,b]),{height:3.25,thickness:.15,sourceId:a.id});
 assert.equal(dimensionsFromWall([9,9],[a,b]),null);
});
test('manual one-click connection and straightening preserves source',()=>{
 const loose=makeEntry('BYGG-V-0003','wall',[5.09,6.2],[8.2,6.34]);
 const joined=joinNearbyEnds(loose,[a,b],{radius:.3});
 assert.deepEqual(joined.a,[5.137,6.271]);assert.deepEqual(loose.a,[5.09,6.2]);
 const straight=straightenEntry(loose);
 assert.deepEqual(straight.b,[8.2,6.2]);
 assert.deepEqual(loose.b,[8.2,6.34]);
});
test('short joined geometry is rejected, never creates illegal segments',()=>{
 const x=makeEntry('BYGG-V-0004','wall',[5.05,6.2],[5.12,6.24]);
 assert.equal(joinNearbyEnds(x,[b],{radius:.3}),null);
});
