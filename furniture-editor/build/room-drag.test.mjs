import test from 'node:test';
import assert from 'node:assert/strict';
import {planDraggedRoom,MIN_ROOM_SPAN,MAX_ROOM_SPAN} from './room-drag.mjs?v=5.1.0';
import {validateEntry,validateFloorRect} from './architecture.mjs?v=5.1.0';
import {exportProject,parseProject} from './level-project.mjs?v=5.7.2';
import {planAdjacentRoom} from '../adjacent-room.mjs?v=5.1.0';

const bounds={x0:-40,z0:-40,x1:40,z1:40};
const room=(a,b,map=bounds)=>planDraggedRoom(a,b,map);
const segment=(id,a,b)=>({id,kind:'wall',a,b,height:2.85,thickness:.11,sill:.9,finish:'white'});
const assertConnected=edges=>{
 assert.equal(edges.length,4);
 for(let i=0;i<4;i++)assert.deepEqual(edges[i][1],edges[(i+1)%4][0]);
};

test('regression: 72 × 68 room is accepted, with four actual walls and no hidden 50-unit limit',()=>{
 const a={x:-36,z:-34},b={x:36,z:34},result=room(a,b);
 assert.deepEqual(result.rect,{x0:-36,x1:36,z0:-34,z1:34});
 assertConnected(result.edges);
 assert(result.edges.every(([p,q])=>Math.hypot(q[0]-p[0],q[1]-p[1])<=100));
 assert.equal(result.clipped,false);
 assert.deepEqual(a,{x:-36,z:-34});
 assert.deepEqual(b,{x:36,z:34});
});

test('an 80 × 80 room can fill the default entire ground area',()=>{
 const result=room({x:-40,z:-40},{x:40,z:40});
 assert.equal(result.rect.x1-result.rect.x0,80);
 assert.equal(result.rect.z1-result.rect.z0,80);
 assertConnected(result.edges);
});

test('map setting 100 × 100 permits a full-size authored room and 100-unit walls',()=>{
 const map={x0:-40,z0:-40,x1:60,z1:60};
 const result=room({x:-40,z:-40},{x:60,z:60},map);
 assert.equal(MAX_ROOM_SPAN,100);
 assert.equal(MIN_ROOM_SPAN,.5);
 assert.equal(result.rect.x1-result.rect.x0,100);
 for(const [a,b] of result.edges){
  assert.equal(Math.hypot(b[0]-a[0],b[1]-a[1]),100);
  assert.equal(validateEntry(segment('BYGG-V-0001',a,b),{isNew:true}),true);
 }
 assert.equal(validateFloorRect({id:'BYGG-G-0001',name:'Stort rum',...result.rect}),true);
});

test('a large room is still valid when stored, reloaded and exported as real FPS geometry',()=>{
 const rect=room({x:-35,z:-32},{x:35,z:32});
 const floor={id:'BYGG-G-0001',role:'room',name:'Hall',surface:'vinyl',...rect.rect};
 const walls=rect.edges.map(([a,b],i)=>segment('BYGG-V-'+String(i+1).padStart(4,'0'),a,b));
 const project=exportProject({ground:{bounds,wallHeightDefault:2.85,floors:[floor]},
  architecture:{schemaVersion:1,edits:[],added:walls,removed:[],floors:[],posters:[],treatments:[]}});
 const saved=parseProject(JSON.stringify(project));
 assert.equal(saved.ground.floors[0].x1-saved.ground.floors[0].x0,70);
 assert.deepEqual(saved.architecture.added,walls);
});

test('a drag may extend outside the canvas; endpoints stop at the map boundary',()=>{
 const a={x:-300,z:-100},b={x:100,z:200};
 const result=room(a,b);
 assert.deepEqual(result.rect,bounds);
 assert.equal(result.clipped,true);
 assertConnected(result.edges);
});

test('a tiny or invalid room never becomes valid by accident',()=>{
 assert.throws(()=>room({x:0,z:0},{x:.3,z:.4}),/Dra lite längre/);
 assert.throws(()=>room({x:0,z:0},{x:0,z:8}),/Dra lite längre/);
 assert.throws(()=>room({x:NaN,z:0},{x:7,z:8}),/giltiga hörn/);
 assert.throws(()=>room({x:0,z:0},{x:7,z:8},{x0:2,x1:2,z0:0,z1:40}),/giltiga hörn/);
});

test('reversed dragging and touchscreen precision produce the same room',()=>{
 const normal=room({x:-15.2,z:-16},{x:23.5,z:12.8});
 const reversed=room({x:23.5,z:12.8},{x:-15.2,z:-16});
 assert.deepEqual(reversed.rect,normal.rect);
 assert.deepEqual(reversed.edges,normal.edges);
});

test('adding a second large room preserves its whole shared wall and a genuine standard doorway',()=>{
 const map={x0:-40,z0:-40,x1:60,z1:60};
 const first={id:'BYGG-G-0001',role:'room',name:'Rum 1',x0:-30,x1:30,z0:-10,z1:10};
 const existing=[segment('BYGG-V-0001',[-30,-10],[30,-10]),
  segment('BYGG-V-0002',[30,-10],[30,10]),
  segment('BYGG-V-0003',[30,10],[-30,10]),
  segment('BYGG-V-0004',[-30,10],[-30,-10])];
 const planned=planAdjacentRoom(first,'below',[first],existing,map);
 assert.equal(planned.ok,true,planned.reason);
 assert.equal(planned.rect.x1-planned.rect.x0,60);
 assert.equal(planned.rect.z1-planned.rect.z0,20);
 assert.equal(Math.hypot(planned.doorEnd[0]-planned.doorStart[0],
  planned.doorEnd[1]-planned.doorStart[1]),1.2);
});
