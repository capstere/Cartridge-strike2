import test from 'node:test';
import assert from 'node:assert/strict';
import { TrajectoryCache } from '../src/fps/trajectory-cache.mjs';
import { FrameTimeWindow } from '../src/fps/frame-time-window.mjs';
import { predictGrenade } from '../src/fps/grenade-physics.mjs';
import { CONFIG } from '../src/fps/config.mjs';
import { createWorld } from '../src/fps/world.mjs';

const actor=()=>({id:'p',weapon:'he',x:0,y:0,z:0,height:1.7,yaw:0,pitch:.2});
const box=()=>({x:4,y:1,z:0,w:1,h:2,d:.08,angle:0,cos:1,sin:0});
function fixture(){
 const p=actor(),config={...CONFIG},world={staticBoxes:[],doors:{boxes:[box()]},raycast:()=>null};
 return {p,config,world,cache:new TrajectoryCache()};
}

test('stationary aim reuses exactly one result and door snapshot allocation',()=>{
 const {p,config,world,cache}=fixture();const expected=predictGrenade(p,config,world);
 const first=cache.read(p,config,world),buffer=cache.boxes;
 for(let n=0;n<125;n++)assert.equal(cache.read(p,config,world),first);
 assert.deepEqual(first,expected);assert.equal(cache.stats.predictions,1);
 assert.equal(cache.stats.reuses,125);assert.equal(cache.boxes,buffer);
});
test('every exact launch input and physics parameter invalidates without quantisation',()=>{
 for(const key of ['x','y','z','height','yaw','pitch']){
  const {p,config,world,cache}=fixture();const first=cache.read(p,config,world);
  p[key]+=1e-9;assert.notEqual(cache.read(p,config,world),first,key);
  assert.deepEqual(cache.result,predictGrenade(p,config,world));
 }
 for(const key of ['fixedStep','grenadeFuse','grenadeSpeed','grenadeRadius','gravity']){
  const {p,config,world,cache}=fixture();const first=cache.read(p,config,world);
  config[key]+=1e-7;assert.notEqual(cache.read(p,config,world),first,key);
  assert.deepEqual(cache.result,predictGrenade(p,config,world));
 }
});
test('weapon changes and live movement preserve exact reference trajectories',()=>{
 const {p,config,world,cache}=fixture();
 for(let n=0;n<100;n++){
  p.weapon=['he','flash','smoke'][n%3];p.x=n/100;p.yaw=n/33;p.pitch=.3*Math.sin(n);
  assert.deepEqual(cache.read(p,config,world),predictGrenade(p,config,world));
 }
 assert.equal(cache.stats.predictions,100);
});
test('every moving-box collision field is observed',()=>{
 for(const key of ['x','y','z','w','h','d','angle','cos','sin']){
  const {p,config,world,cache}=fixture();const first=cache.read(p,config,world);
  world.doors.boxes[0][key]+=.00001;
  assert.notEqual(cache.read(p,config,world),first,key);
 }
});
test('world replacement, raycast replacement, static array/count and door topology invalidate',()=>{
 const changes=[w=>({...w}),w=>(w.raycast=()=>null,w),w=>(w.staticBoxes=[...w.staticBoxes],w),
  w=>(w.staticBoxes.push(box()),w),w=>(w.doors.boxes=[...w.doors.boxes],w),
  w=>(w.doors.boxes.push(box()),w),w=>(w.doors.boxes.pop(),w)];
 for(const change of changes){const {p,config,world,cache}=fixture();const first=cache.read(p,config,world);
  assert.notEqual(cache.read(p,config,change(world)),first);
 }
});
test('clearing on pause/weapon removal/rewind keeps buffers but invalidates result',()=>{
 const {p,config,world,cache}=fixture();const first=cache.read(p,config,world),buffer=cache.boxes;
 cache.clear();assert.equal(cache.result,null);assert.equal(cache.world,null);assert.equal(cache.boxes,buffer);
 assert.notEqual(cache.read(p,config,world),first);assert.equal(cache.boxes,buffer);
});
test('unknown dynamic worlds and oversized door lists fall back without stale reuse',()=>{
 for(const transform of [w=>(delete w.doors,w),w=>(w.staticBoxes=null,w),w=>(w.doors.boxes=Array.from({length:257},box),w),w=>(w.doors.boxes[0].x=NaN,w)]){
  const {p,config,world,cache}=fixture();transform(world);
  for(let i=0;i<3;i++)cache.read(p,config,world);
  assert.equal(cache.stats.predictions,3);assert.equal(cache.stats.reuses,0);assert.equal(cache.result,null);
  assert.equal(cache.boxes.length,0);
 }
});
test('null prediction cannot poison the cache',()=>{
 const {p,config,world}=fixture();const cache=new TrajectoryCache(()=>null);
 cache.read(p,config,world);cache.read(p,config,world);assert.equal(cache.stats.predictions,2);
});
test('frozen actor/config are not mutated; cached results use no randomness',()=>{
 const {p,config,world,cache}=fixture();Object.freeze(p);Object.freeze(config);
 const rng=Math.random;Math.random=()=>{throw Error('Cache may not consume RNG');};
 try{const a=cache.read(p,config,world);assert.equal(cache.read(p,config,world),a);}finally{Math.random=rng;}
});
test('real floor: 125 identical queries replace 13625 rays with 109, matching endpoint exactly',()=>{
 const world=createWorld(),p={...actor(),...world.anchors.analysts[0]},cache=new TrajectoryCache();
 let rays=0;const original=world.raycast;
 world.raycast=function(...args){rays++;return original.apply(this,args);};
 try{
  let expected;for(let i=0;i<125;i++)expected=predictGrenade(p,CONFIG,world);
  const baseline=rays;rays=0;
  let actual;for(let i=0;i<125;i++)actual=cache.read(p,CONFIG,world);
  assert.deepEqual(actual,expected);assert.equal(baseline,13625);assert.equal(rays,109);
  console.log(JSON.stringify({stationaryQueries:125,baselineRays:baseline,cachedRays:rays,doorLeaves:world.doors.boxes.length,cacheHits:cache.stats.reuses}));
 }finally{world.raycast=original;}
});
test('real moving door poses invalidate; cached prediction equals fresh physics at every angle',()=>{
 const world=createWorld(),p={...actor(),...world.anchors.analysts[0]},cache=new TrajectoryCache();
 const d=world.doors.doors[0],angle=d.angle;
 try{
  for(const a of [0,.1,.7,1.57,.7,0]){
   world.doors.pose(d,a);const before=cache.result;
   const next=cache.read(p,CONFIG,world);
   assert.notEqual(next,before);assert.deepEqual(next,predictGrenade(p,CONFIG,world));
  }
 }finally{world.doors.pose(d,angle);}
});
test('frame-duration ring matches the legacy last-120 average over 10000 samples',()=>{
 const window=new FrameTimeWindow(),legacy=[],storage=window.samples;
 for(let i=0;i<10000;i++){
  const ms=5+(i*13%79)/2;legacy.push(ms);if(legacy.length>120)legacy.shift();
  const avg=legacy.reduce((a,b)=>a+b,0)/legacy.length;
  assert.equal(window.push(ms),Math.round(1000/avg));assert.equal(window.mean,avg);
 }
 assert.equal(window.samples,storage);assert.equal(window.count,120);
});
test('fractional samples keep a precise rolling average',()=>{
 const w=new FrameTimeWindow(),legacy=[];
 for(let i=0;i<10000;i++){
  const ms=1000/(30+(i%113));legacy.push(ms);if(legacy.length>120)legacy.shift();w.push(ms);
  const avg=legacy.reduce((a,b)=>a+b,0)/legacy.length;
  assert.ok(Math.abs(w.mean-avg)<1e-10);
 }
});
test('reset reuses storage without stale statistics; zero and invalid samples remain finite',()=>{
 const w=new FrameTimeWindow(),storage=w.samples;
 for(let i=0;i<140;i++)w.push(40);
 w.clear();assert.equal(w.count,0);assert.equal(w.fps,0);assert.equal(w.samples,storage);
 for(const v of [NaN,Infinity,-2])w.push(v);assert.equal(w.count,0);
 assert.equal(w.push(0),0);w.clear();assert.equal(w.push(20),50);
});
test('frame window rejects invalid capacities',()=>{
 for(const n of [0,-1,1.5,Infinity,4097])assert.throws(()=>new FrameTimeWindow(n),RangeError);
});
