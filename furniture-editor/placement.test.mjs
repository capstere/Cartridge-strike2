import test from 'node:test';
import assert from 'node:assert/strict';
import {findCameraPlacement} from './placement.mjs';
const rooms=[
 {id:'A',status:'included',polygon:[[0,0],[5,0],[5,5],[0,5]]},
 {id:'B',status:'included',polygon:[[10,0],[15,0],[15,5],[10,5]]}
];
const inside=(x,z,poly)=>x>poly[0][0]&&x<poly[1][0]&&z>poly[0][1]&&z<poly[2][1];
const round=n=>Math.round(n*1000)/1000;
const helpers={inside,round,validate:()=>null};
const plant={width:.3,depth:.3,height:1};
test('placing at camera in room B does not use previous room A',()=>{
 const cam={x:12,z:2};
 const found=findCameraPlacement(plant,cam,rooms,[],{},helpers);
 assert.deepEqual(found,{x:12,z:2,roomId:'B'});
 assert.deepEqual(cam,{x:12,z:2});
});
test('a busy spot searches within a short local radius instead of jumping across the map',()=>{
 const found=findCameraPlacement(plant,{x:12,z:2},rooms,[],{},
  {...helpers,validate:q=>Math.hypot(q.x-12,q.z-2)<.8?'occupied':null});
 assert.equal(found.roomId,'B');
 assert(Math.hypot(found.x-12,found.z-2)>=.8);
 assert(Math.hypot(found.x-12,found.z-2)<1.5);
});
test('outside known included rooms fails without camera mutation or guessing nearest room',()=>{
 const cam={x:7,z:2};
 assert.equal(findCameraPlacement(plant,cam,rooms,[],{},helpers),null);
 assert.equal(findCameraPlacement(plant,{x:12,z:2},rooms,[],{},
  {...helpers,validate:()=> 'no free spot'}),null);
});
test('rejects invalid dimensions and does not mutate objects or entry',()=>{
 const list=[{id:'existing'}],snapshot=JSON.stringify(list);
 assert.equal(findCameraPlacement({...plant,width:NaN},{x:12,z:2},rooms,list,{},helpers),null);
 assert.equal(JSON.stringify(list),snapshot);
});
