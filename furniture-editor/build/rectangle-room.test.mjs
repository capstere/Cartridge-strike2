import {AUTHORING_LIMITS} from '../project-limits.mjs?v=5.7.3';
import test from 'node:test';
import assert from 'node:assert/strict';
import {createRectangleRoom,rectangleFromDimensions} from './rectangle-room.mjs?v=5.1.0';
import {exportArchitecture,parseArchitecture} from './architecture.mjs?v=5.1.0';
const a=[1.137,2.271],b=[7.137,6.271];
test('rectangle creates four exact shared corners and a matching floor',()=>{
 const made=createRectangleRoom([],[],a,b,{height:3.1,thickness:.15,name:'Test'});
 assert.equal(made.walls.length,4);assert.equal(made.width,6);assert.equal(made.depth,4);
 assert.equal(made.floor.name,'Test');assert.equal(made.floor.x0,a[0]);assert.equal(made.floor.z1,b[1]);
 for(let i=0;i<4;i++){
  const current=made.walls[i],next=made.walls[(i+1)%4];
  assert.deepEqual(current.b,next.a);
  assert.equal(current.height,3.1);assert.equal(current.thickness,.15);
  assert.match(current.id,/^BYGG-V-\d{4}$/);
 }
 assert.deepEqual([...new Set(made.walls.map(w=>w.id))].length,4);
});
test('reverse corner order generates the same rectangle outline',()=>{
 const f=createRectangleRoom([],[],a,b);
 const r=createRectangleRoom([],[],b,a);
 assert.deepEqual(f.walls.map(w=>[w.a,w.b]),r.walls.map(w=>[w.a,w.b]));
 assert.deepEqual(f.floor,r.floor);
});
test('using a floor is optional, and existing entries are not mutated',()=>{
 const existing=createRectangleRoom([],[],[0,0],[2,2]);
 const old=JSON.stringify(existing.walls);
 const added=createRectangleRoom(existing.walls,[existing.floor],[2,2],[4,4],{withFloor:false});
 assert.equal(added.floor,null);assert.equal(new Set([...existing.walls,...added.walls].map(e=>e.id)).size,8);
 assert.equal(JSON.stringify(existing.walls),old);
});
test('valid small wall heights, and named room persistence in schema v1',()=>{
 const made=createRectangleRoom([],[],[0,0],[1,1],{height:.45,name:'Min bana'});
 assert(made.walls.every(w=>w.sill<=w.height-.15));
 const saved=exportArchitecture(made.walls,[],[made.floor]);
 const loaded=parseArchitecture(JSON.parse(JSON.stringify(saved)),[]);
 assert.deepEqual(exportArchitecture(loaded.entries,[],loaded.floors),saved);
 assert.equal(loaded.floors[0].name,'Min bana');
});
test('exact dimension mode measures +X and +Z from an arbitrary anchor',()=>{
 assert.deepEqual(rectangleFromDimensions([1.137,2.271],'6','4'),[7.137,6.271]);
});
test('invalid geometry and dimensions reject atomically before mutating input',()=>{
 for(const [a,b,opts] of [
  [[0,0],[.4,2],{}],[[0,0],[3,.4],{}],
  [[0,0],[51,4],{}],[[0,0],[4,51],{}],
  [[0,0],[3,4],{height:7}],[[0,0],[3,4],{thickness:0}],
  [[99,99],[101,101],{}],[[0,0],[3,4],{name:'X'.repeat(61)}],
 ])assert.throws(()=>createRectangleRoom([],[],a,b,opts));
 assert.throws(()=>rectangleFromDimensions([1,1],0,5));
 assert.throws(()=>rectangleFromDimensions([99,99],51,1));
});
test('respect architecture export limits on added parts and floors',()=>{
 const base=createRectangleRoom([],[],[0,0],[2,2]);
 const manyWalls=Array.from({length:AUTHORING_LIMITS.buildingParts-3},(_,i)=>({...base.walls[0],id:'BYGG-V-'+String(i+1).padStart(4,'0')}));
 assert.throws(()=>createRectangleRoom(manyWalls,[],[3,3],[5,5]),new RegExp(String(AUTHORING_LIMITS.buildingParts)));
 const floors=Array.from({length:AUTHORING_LIMITS.floors},(_,i)=>({...base.floor,id:'BYGG-G-'+String(i+1).padStart(4,'0')}));
 assert.throws(()=>createRectangleRoom([],floors,[3,3],[5,5]),new RegExp(String(AUTHORING_LIMITS.floors)));
});
