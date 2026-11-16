import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {SpatialIndex,insidePolygon,distanceSegment} from '../src/fps/physics.mjs';
import {createWorld} from '../src/fps/world.mjs';

test('cached grid queries preserve ordered unique membership, mutation and insert invalidation',()=>{
 const index=new SpatialIndex(2),items=Array.from({length:25},(_,i)=>({i,disabled:false}));
 for(const item of items)index.insert(item,{minX:item.i%5-4,maxX:item.i%5-.7,minZ:Math.floor(item.i/5)-3,maxZ:Math.floor(item.i/5)+.4});
 const out=[];
 for(let n=0;n<500;n++){
  const x=Math.sin(n*.14)*6,z=Math.cos(n*.37)*6,r=(n%7)*.23;
  const expected=[];
  for(let ix=Math.floor((x-r)/2);ix<=Math.floor((x+r)/2);ix++)for(let iz=Math.floor((z-r)/2);iz<=Math.floor((z+r)/2);iz++)for(const item of index.cells.get(`${ix},${iz}`)||[])if(!expected.includes(item))expected.push(item);
  assert.deepEqual(index.query(x,z,r,out),expected);
  out.reverse();assert.deepEqual(index.query(x,z,r,out),expected,'caller cannot corrupt retained order');
 }
 index.query(0,0,.1,out);items[0].disabled=true;index.insert(items[0],{minX:0,maxX:0,minZ:0,maxZ:0});
 assert(index.query(0,0,.1,out).includes(items[0]));assert(out.find(v=>v===items[0]).disabled);
});

test('cached floor lookups preserve the polygon and epsilon rule at interiors and edges',()=>{
 const w=createWorld({levelProject:JSON.parse(fs.readFileSync('levels/floor5-prepared.json'))});
 const polygons=w.data.floorPolygons;
 const reference=(x,z)=>polygons.some(p=>insidePolygon(x,z,p)||p.some((a,i)=>distanceSegment(x,z,a,p[(i+1)%p.length])<1e-5));
 for(let x=-42;x<43;x+=.731)for(let z=-36;z<37;z+=.619)assert.equal(w.onFloor(x,z),reference(x,z),`${x},${z}`);
 for(const p of polygons)for(let i=0;i<p.length;i++){
  const a=p[i],b=p[(i+1)%p.length];
  for(const t of [0,.25,.5,.75,1])for(const offset of [-.000011,-.000009,0,.000009,.000011]){
   const x=a[0]+(b[0]-a[0])*t+offset,z=a[1]+(b[1]-a[1])*t-offset;
   assert.equal(w.onFloor(x,z),reference(x,z),`edge ${x},${z}`);
  }
 }
});
