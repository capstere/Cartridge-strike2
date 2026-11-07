import test from 'node:test';
import assert from 'node:assert/strict';
import {validate,snapFurnitureToWall} from './core.mjs?v=5.7.2';
import {doorOnWallSegment,makeEntry,wallPieces,entryLength} from './build/architecture.mjs?v=5.1.0';
const data={
 rooms:[{id:'TEST',status:'included',polygon:[[0,0],[6,0],[6,6],[0,6]]}],
 walls:[{id:'W',a:[0,0],b:[0,6],thickness:.10,height:2.8},{id:'N',a:[0,0],b:[6,0],thickness:.10,height:2.8}],
 doors:[{id:'D',a:[0,2.4],b:[0,3.4]}], excludedRooms:[],obstacles:[]
};
const chair={id:'NEW-CHAIR',roomId:'TEST',kind:'chair',source:'added',x:.362,z:1.2,w:.60,d:.60,height:.9,yaw:0};
test('chair may touch actual wall within 12 mm; fake 7 cm blanket distance eliminated',()=>{
 assert.equal(validate(chair,[],data),null);
 assert.equal(validate({...chair,x:.33},[],data),'Möbeln överlappar själva väggen. Flytta ut den några millimeter.');
 assert.equal(validate({...chair,z:2.9},[],data),'Möbeln blockerar en dörröppning.');
});
test('opt-in wall snap aligns edge with actual wall surface while preserving orientation',()=>{
 const original={...chair,x:.45};const r=snapFurnitureToWall(original,data);
 assert(Math.abs(r.x-.362)<.001);assert.equal(r.z,1.2);assert.equal(r.yaw,0);
 assert.equal(validate(r,[],data),null);
 assert.equal(snapFurnitureToWall({...chair,x:1.7},data).x,1.7);
});
test('quick door draws exactly on selected wall and carves preview opening',()=>{
 const wall=makeEntry('BYGG-V-0001','wall',[0,0],[6,0]);
 const door=doorOnWallSegment(wall,'BYGG-D-0001');
 assert.equal(door.kind,'door');assert.equal(door.id,'BYGG-D-0001');
 assert(Math.abs(entryLength(door)-1.2)<.001);
 assert.equal(door.a[1],0);assert.equal(door.b[1],0);
 assert.equal(wallPieces([wall,door]).length,2);
 assert.throws(()=>doorOnWallSegment(makeEntry('BYGG-V-0002','wall',[0,0],[.4,0]),'BYGG-D-0002'),/kort/);
});
