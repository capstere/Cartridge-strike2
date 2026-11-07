import test from 'node:test';import assert from 'node:assert/strict';
import {ClothSolver} from './cloth-solver.mjs';
import {newRealism,validateRealism} from './realism-schema.mjs';
test('XPBD hanging sheet retains pinned positions and bounded stretch under gravity and wind',()=>{
 const pos=[],edges=[],pins=[];for(let y=0;y<9;y++)for(let x=0;x<7;x++){const i=y*7+x;pos.push((x-3)*.04,1-y*.04,0);if(!y)pins.push(i);if(x<6)edges.push([i,i+1]);if(y<8)edges.push([i,i+7]);if(x<6&&y<8)edges.push([i,i+8],[i+1,i+7]);}
 const c=new ClothSolver(pos,edges,pins);for(let i=0;i<360;i++)c.step(1/120,pos,[],1);for(const id of pins)assert.deepEqual(Array.from(c.positions.slice(id*3,id*3+3)),pos.slice(id*3,id*3+3));assert.ok(c.positions.some((v,i)=>i%3===2&&Math.abs(v)>.005));assert.ok(Math.max(...c.edges.map(e=>Math.abs(Math.hypot(...[0,1,2].map(k=>c.positions[e.a*3+k]-c.positions[e.b*3+k]))/e.length-1)))<.08);const saved=Array.from(c.positions);c.reset();for(let i=0;i<360;i++)c.step(1/120,pos,[],1);assert.deepEqual(Array.from(c.positions),saved);
});
test('capsule collision projects free particles outside the body and protects ground',()=>{const c=new ClothSolver([.02,.5,0,0,-.02,0],[],[]);c.step(1/120,c.rest,[{a:[0,.2,0],b:[0,.8,0],r:.1}]);assert.ok(Math.hypot(c.positions[0],c.positions[2])>=.0999);assert.ok(c.positions[4]>=.012);assert.throws(()=>c.step(1,c.rest));});
test('realism settings reject unbounded and unknown solver choices',()=>{assert.equal(validateRealism(newRealism()).head,'original');for(const patch of [{wind:NaN},{wind:101},{garment:'dress'},{head:'fake'},{fiberHair:'true'}])assert.throws(()=>validateRealism({...newRealism(),...patch}));});
test('capsule-axis and degenerate capsules cannot trap a free cloth particle',()=>{
 for(const [a,b] of [[[0,.2,0],[0,.8,0]],[[0,.5,0],[0,.5,0]]]){const c=new ClothSolver([0,.5,0],[],[]);c.step(1/120,c.rest,[{a,b,r:.1}]);const y=Math.max(a[1],Math.min(b[1],c.positions[1]));assert.ok(Math.hypot(c.positions[0],c.positions[1]-y,c.positions[2])>=.0999);assert.ok(c.positions.every(Number.isFinite));}
});
test('custom proportions accept old projects and reject malformed new settings',()=>{
 const old={head:'original',fiberHair:false,fabric:'original',garment:'none',wind:15};assert.equal(validateRealism(old),old);
 for(const patch of [{hairLength:49},{hairVolume:151},{garmentLength:NaN},{hairLength:'100'},{garmentLength:131}])assert.throws(()=>validateRealism({...newRealism(),...patch}));
});
