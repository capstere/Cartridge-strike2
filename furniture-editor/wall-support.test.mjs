import test from 'node:test';
import assert from 'node:assert/strict';
import {applyFurnitureAssemblyPose,findWallMount,poseOnWall,syncWallMounts} from './wall-mounts.mjs';

const close=(a,b)=>assert(Math.abs(a-b)<2e-6,`${a} should equal ${b}`);
const angle=a=>Math.atan2(Math.sin(a),Math.cos(a));
const wall={id:'BYGG-V-0001',kind:'wall',a:[0,0],b:[8,0],height:2.85,thickness:.12};
function attached(parent,id,x,z,elevation,yaw=0){
 const c=Math.cos(parent.yaw),s=Math.sin(parent.yaw);
 return {id,kind:'prop',assetId:'studio:shoes',x:parent.x+c*x+s*z,z:parent.z-s*x+c*z,
  yaw:angle(parent.yaw+yaw),elevation:parent.elevation+elevation,w:.26,d:.3,height:.13,
  mountId:parent.id,mountSurface:0,color:'#2877b6'};
}
function fixture(point={x:4,z:.1}){
 const shelf={id:'NY-OBJ-0001',kind:'prop',assetId:'studio:shoe-shelf-white',x:4,z:0,
  yaw:0,elevation:0,w:1,d:.34,height:.14,collision:'solid'};
 Object.assign(shelf,findWallMount(shelf,point,[wall]),{collision:'solid'});
 const tray={...attached(shelf,'NY-OBJ-0002',-.23,.01,.14,.13),assetId:'local:tray',height:.04};
 const nested=attached(tray,'NY-OBJ-0003',.035,-.045,.04,-.2);
 const shoes=attached(shelf,'NY-OBJ-0004',.21,-.025,.14,.25);
 const unrelated={...attached(shelf,'NY-OBJ-0005',2,3,-shelf.elevation),mountId:null,mountSurface:null};
 // Descendants precede the root, exercising order-independent traversal.
 return {shelf,tray,nested,shoes,unrelated,items:[nested,shoes,shelf,unrelated,tray]};
}
function localPose(item,root){
 const c=Math.cos(root.yaw),s=Math.sin(root.yaw),x=item.x-root.x,z=item.z-root.z;
 return {x:c*x-s*z,z:s*x+c*z,elevation:item.elevation-root.elevation,yaw:angle(item.yaw-root.yaw)};
}
function assertAttachmentPreserved(before,item,oldRoot,root){
 const a=localPose(before,oldRoot),b=localPose(item,root);
 for(const key of Object.keys(a))close(a[key],b[key]);
 assert.equal(item.mountId,before.mountId);assert.equal(item.mountSurface,before.mountSurface);
 assert.equal(item.color,before.color);assert.equal(item.assetId,before.assetId);
 assert.deepEqual([item.w,item.d,item.height],[before.w,before.d,before.height]);
}

test('translating and rotating a wall moves the shelf and its entire nested attachment tree once',()=>{
 const f=fixture(),before=structuredClone(f),moved={...wall,a:[3,2],b:[3,10]};
 const result=syncWallMounts(f.items,[moved]);
 assert.deepEqual(result,{updated:1,missing:0});
 close(f.shelf.x,2.758);close(f.shelf.z,6);close(f.shelf.yaw,Math.PI/2);
 assert.equal(f.shelf.collision,'solid','authored collision override is retained');
 for(const key of ['tray','nested','shoes'])assertAttachmentPreserved(before[key],f[key],before.shelf,f.shelf);
 assert.deepEqual(f.unrelated,before.unrelated);
});

test('shortening and lowering a wall clamps the shelf and keeps shoes on their original shelf level',()=>{
 const f=fixture({x:7.3,z:.1}),before=structuredClone(f);
 const shortened={...wall,b:[1.4,0],height:.8};
 syncWallMounts(f.items,[shortened]);
 close(f.shelf.x,.855);close(f.shelf.wallMount.y,.67);close(f.shelf.elevation,.6);
 assert(f.shelf.wallMount.t<before.shelf.wallMount.t,'position is clamped inside the shorter wall');
 for(const key of ['tray','nested','shoes'])assertAttachmentPreserved(before[key],f[key],before.shelf,f.shelf);
 close(f.shoes.elevation,.74);close(f.nested.elevation,.78);
});

test('switching a shelf to the opposite wall face rotates attached shoes with the shelf',()=>{
 const f=fixture(),before=structuredClone(f);
 const pose=poseOnWall(f.shelf,{...f.shelf.wallMount,side:-f.shelf.wallMount.side},[wall]);
 assert.equal(applyFurnitureAssemblyPose(f.shelf,f.items,pose),f.shelf);
 assert(f.shelf.z<0);close(Math.abs(angle(f.shelf.yaw-before.shelf.yaw)),Math.PI);
 for(const key of ['tray','nested','shoes'])assertAttachmentPreserved(before[key],f[key],before.shelf,f.shelf);
});

test('an unchanged or repeated wall pose does not round child coordinates or accumulate drift',()=>{
 const f=fixture(),before=structuredClone(f.items);
 for(let i=0;i<10;i++)syncWallMounts(f.items,[wall]);
 assert.deepEqual(f.items,before);
 const moved={...wall,a:[-2,3],b:[5,6],height:1.2};syncWallMounts(f.items,[moved]);
 const once=structuredClone(f.items);
 for(let i=0;i<10;i++)syncWallMounts(f.items,[moved]);
 assert.deepEqual(f.items,once);
});

test('partial assembly poses preserve unchanged axes, attachment metadata and unrelated objects',()=>{
 const f=fixture(),before=structuredClone(f);
 applyFurnitureAssemblyPose(f.shelf,f.items,{x:f.shelf.x+1.25,elevation:f.shelf.elevation+.2});
 for(const key of ['tray','nested','shoes']){
  close(f[key].x,before[key].x+1.25);close(f[key].elevation,before[key].elevation+.2);
  assert.equal(f[key].z,before[key].z);assert.equal(f[key].yaw,before[key].yaw);
  assert.equal(f[key].color,before[key].color);assert.equal(f[key].mountSurface,before[key].mountSurface);
 }
 assert.deepEqual(f.unrelated,before.unrelated);
});

test('a missing or impossibly short wall leaves the complete assembly in its saved pose',()=>{
 for(const walls of [[],[{...wall,height:.15}]]){
  const f=fixture(),before=structuredClone(f.items);
  assert.deepEqual(syncWallMounts(f.items,walls),{updated:0,missing:1});
  assert.deepEqual(f.items,before);
 }
});
