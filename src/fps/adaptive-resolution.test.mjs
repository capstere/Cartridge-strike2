import test from 'node:test';
import assert from 'node:assert/strict';
import {AdaptiveResolution} from './adaptive-resolution.mjs';
import {FrameTimeWindow} from './frame-time-window.mjs';

test('requires enough fresh active frames and a two-second interval',()=>{
 const a=new AdaptiveResolution();a.arm(0);
 assert.equal(a.update(1.9,29,80),false);
 assert.equal(a.update(3,29,20),false);
 assert.equal(a.update(3,29,80),true);
 assert.equal(a.scale,.9);
 assert.equal(a.update(3.5,30,80),false);
 assert.equal(a.update(5.1,28,80),true);
 assert.equal(a.scale,.8);
});
test('sustained overload floors at safe resolution',()=>{
 const a=new AdaptiveResolution();a.arm(0);
 for(let t=2;t<40;t+=2)a.update(t,44,50);
 assert.equal(a.scale,.55);
});
test('recovers slowly when near vsync and holds within the hysteresis band',()=>{
 const a=new AdaptiveResolution();a.arm(0);
 a.update(2,26,50);assert.equal(a.scale,.9);
 a.update(4,16.7,50);assert.equal(a.scale,.95);
 a.update(6,16.7,50);assert.equal(a.scale,1);
 a.update(8,18.2,50);assert.equal(a.scale,1);
});
test('pause and next match rearm measurement',()=>{
 const a=new AdaptiveResolution();a.arm(9);
 assert.equal(a.update(10,50,120),false);
 a.arm(0);assert.equal(a.update(.4,50,120),false);
 assert.equal(a.update(2.2,50,120),true);
});
test('uses actual rolling mean and rejects invalid data',()=>{
 const a=new AdaptiveResolution(),w=new FrameTimeWindow(50);
 a.arm(0);for(let i=0;i<50;i++)w.push(24);
 assert.equal(a.update(2,w.mean,w.count),true);
 assert.equal(a.update(4,NaN,120),false);
});
