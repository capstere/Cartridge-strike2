import test from 'node:test';
import assert from 'node:assert/strict';
import {placementPreview,preferredPlacementPoint} from './snap-highlights.mjs?v=5.7.2';
import {proposeSmartPose} from './smart-placement.mjs?v=5.7.2';
const counter={id:'NY-OBJ-0001',kind:'prop',assetId:'studio:counter-120',assetName:'Köksbänk',x:0,z:0,yaw:0,w:1.2,d:.62,height:.9};
const microwave={id:'NY-OBJ-0002',kind:'prop',assetId:'kenney:furniture-kit:kitchenmicrowave',assetName:'Mikrovågsugn',x:0,z:0,yaw:0,w:.54,d:.41,height:.34};
const picture={...microwave,id:'NY-OBJ-0003',assetId:'studio:wall-picture',assetName:'Tavla',w:.85,d:.07,height:.62};
const wall={id:'BYGG-V-0001',kind:'wall',a:[4,-4],b:[4,4],height:2.85,thickness:.11};
test('highlighted counter is the exact support used by the real placement action',()=>{
 const q={x:0.08,z:-.1,y:.9},view=placementPreview(microwave,q,[counter],[wall]);
 assert.equal(view.kind,'surface');assert.equal(view.targetId,counter.id);
 assert(view.surface.w>1&&Math.abs(view.surface.y-(counter.height+.018))<.001);
 assert.deepEqual(view.pose,proposeSmartPose(microwave,q,[counter],{walls:[wall]}));
});
test('wall highlight uses actual anchored pose, width, height and wall ID',()=>{
 const q={x:3.9,z:.3,y:1.7};
 const view=placementPreview(picture,q,[counter],[wall]);
 assert.equal(view.kind,'wall');assert.equal(view.targetId,wall.id);
 assert.equal(view.pose.wallMount.wallId,wall.id);
 assert.equal(view.surface.w,picture.w+.13);
 assert(Math.abs(view.surface.y-(view.pose.elevation+picture.height/2))<.0001);
 assert.deepEqual(view.pose,proposeSmartPose(picture,q,[counter],{walls:[wall]}));
});
test('forced floor never advertises tabletop or wall, even when close to them',()=>{
 const view=placementPreview(picture,{x:3.9,z:0},[counter],[wall],{mode:'floor'});
 assert.equal(view.kind,'floor');assert.equal(view.targetId,null);assert.equal(view.surface,null);
});
test('cannot fake a valid target when the wall or surface is missing',()=>{
 assert.equal(placementPreview(picture,{x:50,z:50},[counter],[wall]).kind,'needs-wall');
 assert.equal(placementPreview(microwave,{x:50,z:50},[counter],[wall]).kind,'needs-surface');
 assert.equal(placementPreview(microwave,{x:50,z:50},[counter],[wall],{mode:'surface'}).targetId,null);
});
test('a 3D hit on actual furniture or wall beats the ray projected through to the floor',()=>{
 const pick={id:counter.id,ground:{x:2,z:4},surface:{x:.1,z:.05,y:.9}};
 assert.deepEqual(preferredPlacementPoint(pick,[counter],[wall]),pick.surface);
 const w={...pick,id:wall.id,surface:{x:3.95,z:0,y:1.55}};
 assert.deepEqual(preferredPlacementPoint(w,[counter],[wall]),w.surface);
 assert.deepEqual(preferredPlacementPoint({...pick,id:'UNKNOWN'},[counter],[wall]),pick.ground);
 assert.deepEqual(preferredPlacementPoint({...pick,surface:null},[counter],[wall]),pick.ground);
 assert.equal(preferredPlacementPoint(null,[counter],[wall]),null);
});
test('a support highlight cannot interfere with unrelated objects or project data',()=>{
 const before=structuredClone([counter,microwave,wall]);
 const item={...microwave,id:'NY-OBJ-0004'};
 const view=placementPreview(item,{x:0,z:0},[counter],[wall]);
 assert.equal(view.targetId,counter.id);
 assert.deepEqual([counter,microwave,wall],before);
 assert.equal(placementPreview(null,{x:0,z:0},[counter],[wall]),null);
 assert.equal(placementPreview(item,{x:NaN,z:0},[counter],[wall]),null);
});
test('surface highlight follows a rotated/moved support without resizing the placed item',()=>{
 const rotated={...counter,x:2,z:-1,yaw:Math.PI/2};
 const result=placementPreview(microwave,{x:2,z:-1},[rotated],[wall]);
 assert.equal(result.kind,'surface');assert.equal(result.surface.x,2);
 assert.equal(result.surface.z,-1);assert.equal(result.surface.yaw,Math.PI/2);
 assert.equal(result.pose.mountId,rotated.id);
 assert.equal(microwave.w,.54);
});
