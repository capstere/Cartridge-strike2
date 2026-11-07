import test from 'node:test';
import assert from 'node:assert/strict';
import {planAdjacentRoom,ADJACENT_SIDES} from './adjacent-room.mjs?v=5.1.0';
import {STANDARD_PASSAGE_WIDTH} from './build/architecture.mjs?v=5.1.0';
import {planPaintOverWall} from './build/paint-over-wall.mjs?v=5.1.0';

const bounds={x0:-40,z0:-40,x1:40,z1:40};
const room={id:'BYGG-G-0001',name:'Rum 1',role:'room',x0:-4,x1:4,z0:-4,z1:4};
const wall=(id,a,b)=>({id,kind:'wall',a,b,height:2.85,thickness:.11,sill:.9,finish:'white'});
const walls=[
 wall('bottom',[-4,-4],[4,-4]),wall('right',[4,-4],[4,4]),
 wall('top',[4,4],[-4,4]),wall('left',[-4,4],[-4,-4])
];

test('all four adjacent directions share exactly one existing wall and never overlap the first room',()=>{
 const expected={
  right:{x0:4,x1:12,z0:-4,z1:4},
  left:{x0:-12,x1:-4,z0:-4,z1:4},
  above:{x0:-4,x1:4,z0:-12,z1:-4},
  below:{x0:-4,x1:4,z0:4,z1:12}
 };
 for(const side of ADJACENT_SIDES){
  const plan=planAdjacentRoom(room,side,[room],walls,bounds);
  assert(plan.ok,side+': '+plan.reason);
  assert.deepEqual(plan.rect,expected[side]);
  assert.equal(plan.roomId,room.id);
  assert(walls.some(w=>w.id===plan.sharedWallId));
  assert.equal(Math.hypot(plan.doorEnd[0]-plan.doorStart[0],
    plan.doorEnd[1]-plan.doorStart[1]),STANDARD_PASSAGE_WIDTH);
 }
});
test('the real standard door replaces the old shared wall segment with no solid duplicate',()=>{
 const plan=planAdjacentRoom(room,'right',[room],walls,bounds);
 assert(plan.ok);
 const painted=planPaintOverWall(walls,plan.sharedWallId,plan.doorStart,plan.doorEnd,'door');
 const active=painted.entries.filter(e=>!e.deleted);
 const doors=active.filter(e=>e.kind==='door');
 assert.equal(doors.length,1);
 assert.equal(Math.hypot(doors[0].a[0]-doors[0].b[0],doors[0].a[1]-doors[0].b[1]),1.2);
 assert(!active.some(e=>e.kind==='wall'&&e.a[0]===4&&e.b[0]===4&&
  Math.min(e.a[1],e.b[1])<0&&Math.max(e.a[1],e.b[1])>0),
  'No solid wall through the center of the doorway');
 assert.deepEqual(walls[1],wall('right',[4,-4],[4,4]),'Helper never mutates old walls');
});
test('building to the right of room 2 can form a third room without overlapping room 1',()=>{
 const first=planAdjacentRoom(room,'right',[room],walls,bounds);
 const nextRoom={id:'BYGG-G-0002',name:'Rum 2',role:'room',...first.rect};
 const nextWalls=[...walls,wall('next-right',[12,-4],[12,4])];
 const third=planAdjacentRoom(nextRoom,'right',[room,nextRoom],nextWalls,bounds);
 assert.equal(third.ok,true);
 assert.deepEqual(third.rect,{x0:12,x1:20,z0:-4,z1:4});
});
test('room occupancy, bounds and changed shared walls are safe hard stops (not invalid geometry)',()=>{
 const right=planAdjacentRoom(room,'right',[room],walls,bounds);
 const taken={id:'BYGG-G-0002',role:'room',...right.rect};
 assert.match(planAdjacentRoom(room,'right',[room,taken],walls,bounds).reason,/redan ett rum/);
 assert.match(planAdjacentRoom(room,'right',[room],walls,{...bounds,x1:8}).reason,/trångt/);
 assert.match(planAdjacentRoom(room,'right',[room],walls.filter(w=>w.id!=='right'),bounds).reason,/öppning/);
 assert.match(planAdjacentRoom(room,'right',[room],walls,bounds,
  {treatments:[{wallId:'right',type:'curtain'}]}).reason,/gardin/);
});
test('supports deliberately resized rectangular rooms without moving their original corners',()=>{
 const resized={...room,x0:0,x1:6,z0:1,z1:8};
 const shared=wall('w',[6,1],[6,8]);
 const out=planAdjacentRoom(resized,'right',[resized],[shared],bounds);
 assert(out.ok,out.reason);
 assert.deepEqual(out.rect,{x0:6,x1:12,z0:1,z1:8});
 assert.deepEqual(resized,{...room,x0:0,x1:6,z0:1,z1:8});
});
test('invalid source, unknown direction and short walls return a useful reason',()=>{
 assert.equal(planAdjacentRoom(room,'diagonal',[room],walls,bounds).ok,false);
 assert.equal(planAdjacentRoom({...room,source:true},'right',[room],walls,bounds).ok,false);
 const tiny={...room,x1:-3};
 assert.match(planAdjacentRoom(tiny,'right',[tiny],walls,bounds).reason,/längre|lång/);
});
