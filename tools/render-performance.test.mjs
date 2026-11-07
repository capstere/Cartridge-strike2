import test from 'node:test';
import assert from 'node:assert/strict';
import * as T from '../vendor/three/three.module.js';
import { TracerBatch } from '../src/fps/tracer-batch.mjs';
import { MinimapCache } from '../src/fps/minimap-cache.mjs';
import { RenderBudget } from '../src/fps/render-budget.mjs';

function canvasFake(width=224,height=158) {
  const counts={};const methods=['clearRect','drawImage','beginPath','lineTo','moveTo','closePath','fill','stroke','fillText','save','restore','arc'];
  const context={};for(const k of methods)context[k]=()=>counts[k]=(counts[k]||0)+1;
  return {width,height,counts,getContext:()=>context};
}
const world=()=>({data:{floorPolygons:[[[0,0],[10,0],[10,10],[0,10]]],walls:[{a:[0,0],b:[10,0]}]},anchors:{bomb:{x:2,z:2},rescue:{x:7,z:7},hostages:[{x:5,z:5}]},tactical:{lanes:[]}});
const game={team:'a',actors:[{team:'a',alive:true,isPlayer:true,x:3,z:3,yaw:1},{team:'b',alive:true,x:7,z:7}]};

test('hidden minimap makes zero canvases and zero draw calls',()=>{
 const c=canvasFake(),m=new MinimapCache(c,()=>{throw Error('Hidden map must not allocate');});
 for(let i=0;i<1000;i++)assert.equal(m.draw(world(),game,false,false),false);
 assert.equal(m.stats.builds,0);assert.equal(m.stats.hiddenSkips,1000);assert.deepEqual(c.counts,{});
});
test('100 map frames rebuild static walls only once; only friendly markers draw dynamically',()=>{
 const c=canvasFake(),layers=[],m=new MinimapCache(c,()=>{const n=canvasFake();layers.push(n);return n;}),w=world();
 for(let i=0;i<100;i++)m.draw(w,game);
 assert.equal(m.stats.builds,1);assert.equal(layers[0].counts.stroke,1);
 assert.equal(c.counts.drawImage,100);assert.equal(c.counts.arc,100);
 assert.equal(c.getContext().lineWidth,.5);
});
test('map resize/mode/world invalidate while cache remains bounded',()=>{
 const c=canvasFake(),m=new MinimapCache(c,canvasFake),w=world();
 m.draw(w,game);c.width=448;c.height=316;m.draw(w,game,true);
 c.width=224;c.height=158;m.draw(w,game);assert.equal(m.stats.builds,2);
 c.width=300;m.draw(w,game);assert.equal(m.layers.size,2);
 m.draw(world(),game);assert.equal(m.layers.size,1);assert.equal(m.stats.builds,4);
 m.dispose();assert.equal(m.layers.size,0);assert.equal(m.world,null);
});
test('live visible matches keep every supplied display frame',()=>{
 for(const hz of [30,60,120,144]){const b=new RenderBudget();for(let n=0;n<hz;n++)assert.ok(b.shouldRender(n*1000/hz,false,false));assert.equal(b.stats.active,hz);}
});
test('paused/menu frames cap at ten per second independently of refresh rate',()=>{
 for(const hz of [60,120,144]){const b=new RenderBudget();for(let n=0;n<hz;n++)b.shouldRender(n*1000/hz,false,true);assert.ok(b.stats.idle<=10&&b.stats.idle>=9);}
});
test('hidden page draws nothing and returns/resumes immediately',()=>{
 const b=new RenderBudget();assert.ok(b.shouldRender(0,false,true));assert.equal(b.shouldRender(1,false,true),false);
 for(let n=2;n<20;n++)assert.equal(b.shouldRender(n,true,false),false);
 assert.ok(b.shouldRender(20,false,true));assert.ok(b.shouldRender(21,false,false));assert.ok(b.shouldRender(22,false,true));
 assert.equal(b.shouldRender(NaN),false);
});
test('tracers preserve endpoints and fade independently by simulation time',()=>{
 const s=new T.Scene(),b=new TracerBatch(s,4),a={x:1,y:2,z:3},z={x:4,y:5,z:6};
 b.add(a,z,1);b.add(z,a,1.02);b.update(1.025);
 assert.equal(b.count,2);assert.equal(b.geometry.drawRange.count,4);
 assert.deepEqual([...b.positions.slice(0,6)],[1,2,3,4,5,6]);
 assert.ok(Math.abs(b.colors[3]-(.020/.045))<1e-6);assert.ok(b.colors[11]>b.colors[3]);
 const before=[...b.colors];b.update(1.025);assert.deepEqual([...b.colors],before);
 b.update(1.05);assert.equal(b.count,1);b.update(1.07);assert.equal(b.count,0);assert.equal(b.mesh.visible,false);
 b.dispose();
});
test('5000 shots reuse the same typed buffers/geometry/material and one scene object',()=>{
 const s=new T.Scene(),b=new TracerBatch(s,32),ids=[b.points,b.positions,b.colors,b.geometry,b.material];
 for(let i=0;i<5000;i++){b.add({x:0,y:0,z:0},{x:i,y:1,z:-1},i/100);b.update(i/100);}
 assert.equal(s.children.length,1);assert.deepEqual([b.points,b.positions,b.colors,b.geometry,b.material],ids);
 b.clear();assert.equal(b.count,0);assert.equal(b.geometry.drawRange.count,0);assert.equal(s.children.length,1);b.dispose();
});
test('pool overflow is bounded and affects cosmetic tracers only',()=>{
 const b=new TracerBatch(new T.Scene(),8),a=Object.freeze({x:0,y:1,z:0}),z=Object.freeze({x:10,y:1,z:0});
 for(let n=0;n<100;n++)assert.ok(b.add(a,z,0));b.update(0);assert.equal(b.count,8);
 assert.equal(b.add(a,{x:NaN,y:0,z:0},0),false);assert.equal(b.add(a,z,0,-1),false);
 b.dispose();assert.equal(b.add(a,z,0),false);
});
test('tracer teardown is idempotent and keeps unrelated scene resources',()=>{
 const s=new T.Scene(),other=new T.Group();s.add(other);const b=new TracerBatch(s);let geos=0,mats=0;
 b.geometry.addEventListener('dispose',()=>geos++);b.material.addEventListener('dispose',()=>mats++);
 b.dispose();b.dispose();assert.equal(geos,1);assert.equal(mats,1);assert.deepEqual(s.children,[other]);
});
test('invalid budgets are rejected',()=>{
 for(const value of [0,-1,NaN,Infinity])assert.throws(()=>new RenderBudget(value),RangeError);
 for(const value of [0,-1,1.1,5000,NaN])assert.throws(()=>new TracerBatch(new T.Scene(),value),RangeError);
});
