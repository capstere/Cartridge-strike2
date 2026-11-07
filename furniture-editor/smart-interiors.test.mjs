import test from 'node:test';import assert from 'node:assert/strict';
import {PROCEDURAL_LIBRARY,PROCEDURAL_MAP} from './library/procedural.mjs';
import {LAB_FURNITURE_LIBRARY} from './library/lab-furniture.mjs';
import {FPS_LIBRARY} from './library/fps-catalog.mjs';
import {findSupport,proposeSmartPose} from './smart-placement.mjs?v=5.7.2';
import {exportPatch,parsePatch} from './core.mjs?v=5.7.2';
const desk={id:'NY-OBJ-0001',kind:'prop',assetId:'studio:desk-160',assetName:'Skrivbord 160',roomId:'I09',source:'added',x:4,z:4,yaw:0,w:1.6,d:.8,height:.75};
const oven={id:'NY-OBJ-0002',kind:'prop',assetId:'studio:microwave',assetName:'Mikrovågsugn',roomId:'I09',source:'added',x:4,z:4,yaw:0,w:.5,d:.42,height:.31};
test('original 36 procedural presets and new lab/FPS objects have unique valid IDs',()=>{
 const expected=36+LAB_FURNITURE_LIBRARY.length+FPS_LIBRARY.filter(e=>!e.url).length;
 assert.equal(PROCEDURAL_LIBRARY.length,expected);assert.equal(new Set(PROCEDURAL_LIBRARY.map(x=>x.id)).size,expected);
 assert(PROCEDURAL_LIBRARY.every(x=>x.width>0&&x.depth>0&&x.height>0&&x.url===undefined));
 for(const name of ['desk-120','slim-240','round-110','desk-screen-160','counter-180','microwave','lab-instrument'])
  assert(PROCEDURAL_MAP.has('studio:'+name));
});
test('microwave attaches to countertop and uses its height, not the floor',()=>{
 const bench={...desk,assetId:'studio:counter-180',height:.9,w:1.8};
 const mounted=findSupport(oven,{x:4.1,z:4.1},[bench]);
 assert(mounted&&mounted.mountId===bench.id&&mounted.elevation>.88);
 assert.deepEqual(proposeSmartPose(oven,{x:20,z:20},[bench],{enabled:false}),{x:20,z:20,mountId:null,elevation:0});
});
test('desk screen magnetically attaches to back edge and shares desk orientation',()=>{
 const divider={...oven,assetId:'studio:desk-screen-160',w:1.6,d:.07,height:.48};
 const mounted=findSupport(divider,{x:4,z:4.24},[desk],{radius:.38});
 assert(mounted&&mounted.mountId===desk.id&&mounted.z>desk.z&&mounted.elevation>.7);
});
test('magnetic placement never attaches to unrelated objects or far-away desks',()=>{
 assert.equal(findSupport(oven,{x:20,z:20},[desk]),null);
 assert.equal(findSupport({...oven,assetId:'studio:round-80'},{x:4,z:4},[desk]),null);
});
test('studio assets and supported elevation persist through old furniture schema',()=>{
 const built={...oven,mountId:desk.id,elevation:.742};
 const saved=exportPatch([desk,built],[],{createdAt:'2026-10-28T00:00:00.000Z'});
 const parsed=parsePatch(saved,[]);
 assert.equal(parsed.find(x=>x.id===oven.id).mountId,desk.id);
 assert.equal(parsed.find(x=>x.id===oven.id).elevation,.742);
 assert.throws(()=>parsePatch({...saved,added:saved.added.map(x=>x.id===oven.id?{...x,elevation:-2}:x)},[]),/höjd/);
 assert.throws(()=>parsePatch({...saved,added:saved.added.map(x=>x.id===oven.id?{...x,mountId:'MISSING'}:x)},[]),/fäste/);
});
