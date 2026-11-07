import test from 'node:test';
import assert from 'node:assert/strict';
import {readBaseline,parseArchitecture,exportArchitecture,makeEntry,wallPieces,
 validateEntry,validateFloorRect,floorRect,getNextId,entryLength,warningsForLayout} from './architecture.mjs?v=5.1.0';
const data={walls:[
 {id:'WALL-001',a:[0,0],b:[10,0],height:2.85,thickness:.1},
 {id:'WALL-002',a:[0,2],b:[6,2],surfaceType:'glazed'},
 {id:'WALL-003',a:[0,4],b:[4,4],surfaceType:'window'}],
 doors:[{id:'D01',a:[3,0],b:[4,0],doorType:'elevator'},
 {id:'D08',a:[1,2],b:[2,2],accessCardConfirmed:true},
 {id:'D05',a:[4,4],b:[5,4],kind:'open-passage-no-leaf'}],
 floorPolygons:[[[0,-2],[12,-2],[12,8],[0,8]]]};
const baseline=readBaseline(data);
test('baseline is mapped into exact current source IDs and author colors/types, no original mutation',()=>{
 assert.equal(baseline.length,6);
 assert.equal(baseline.find(x=>x.id==='WALL-002').kind,'glazed');
 assert.equal(baseline.find(x=>x.id==='WALL-003').kind,'window');
 assert.equal(baseline.find(x=>x.id==='D08').kind,'card-door');
 assert.equal(baseline.find(x=>x.id==='D01').kind,'elevator-door');
 assert.equal(baseline.find(x=>x.id==='D05').kind,'opening');
 baseline[0].a[0]=99;assert.equal(data.walls[0].a[0],0);baseline[0].a[0]=0;
});
test('walls render as two pieces when an aligned door is in the middle, not when crossing perpendicularly',()=>{
 const floor=makeEntry('BYGG-V-0001','wall',[0,0],[10,0]);
 const door=makeEntry('BYGG-D-0001','door',[3,0],[4,0]);
 let pieces=wallPieces([floor,door]);assert.equal(pieces.length,2);
 assert(pieces[0].b[0]<3 && pieces[1].a[0]>4);
 pieces=wallPieces([floor,makeEntry('BYGG-D-0001','door',[5,-1],[5,1])]);
 assert.equal(pieces.length,1);assert.equal(entryLength(pieces[0]),10);
});
test('multiple overlapping openings merge and do not draw invisible blocking center',()=>{
 const wall=makeEntry('BYGG-V-0001','glazed',[0,0],[10,0]);
 const doors=[makeEntry('BYGG-D-0001','door',[2,0],[4,0]),makeEntry('BYGG-D-0002','opening',[3,0],[7,0])];
 const pieces=wallPieces([wall,...doors]);assert.equal(pieces.length,2);
 assert(pieces[0].b[0]<2&&pieces[1].a[0]>7);
});
test('wall source edits, additions, removed sources and floor rectangles serialize deterministically and roundtrip',()=>{
 const entries=readBaseline(data),f=entries.find(x=>x.id==='WALL-001');f.kind='window';f.sill=1.1;
 entries.find(x=>x.id==='D05').deleted=true;
 entries.push(makeEntry('BYGG-V-0001','glazed',[8,3],[10,3]));
 entries.push(makeEntry('BYGG-D-0001','card-door',[9,3],[9.9,3]));
 const floors=[floorRect('BYGG-G-0001',[1,5],[4,7])];
 const patch=exportArchitecture(entries,baseline,floors);
 assert.equal(patch.edits.length,1);assert.equal(patch.added.length,2);
 assert.deepEqual(patch.removed,['D05']);assert.equal(patch.floors[0].x1,4);
 const got=parseArchitecture(JSON.parse(JSON.stringify(patch)),baseline);
 assert.deepEqual(exportArchitecture(got.entries,baseline,got.floors),patch);
 assert.equal(baseline.find(x=>x.id==='WALL-001').kind,'wall');
});
test('old Furniture Studio JSON without architecture remains usable',()=>{
 const p=parseArchitecture(undefined,baseline);
 assert.equal(p.entries.length,baseline.length);assert.equal(p.floors.length,0);
 assert.equal(exportArchitecture(p.entries,baseline,p.floors).added.length,0);
});
test('refuse unsafe IDs, oversize input and forged source edits on import',()=>{
 const original=exportArchitecture(baseline,baseline);
 for(const modified of [
  {...original,added:[{...makeEntry('BYGG-V-0001','wall',[0,0],[2,0]),a:[Infinity,0]}]},
  {...original,added:[{...makeEntry('BYGG-V-0001','wall',[0,0],[2,0]),kind:'javascript:alert(1)'}]},
  {...original,edits:[{...makeEntry('WALL-999','wall',[0,0],[2,0])}]},
  {...original,removed:['BYGG-V-0001']},
  {...original,added:[{...makeEntry('BYGG-V-0001','wall',[0,0],[2,0]),height:500}]},
  {...original,floors:[{...floorRect('BYGG-G-0001',[1,1],[1.2,1.4])}]},
 ])assert.throws(()=>parseArchitecture(modified,baseline));
});
test('IDs are unique across new walls, doors and floors, and dimensions are bounded',()=>{
 const entries=[makeEntry('BYGG-V-0001','wall',[0,0],[1,0]),makeEntry('BYGG-D-0001','door',[0,0],[1,0])];
 const floors=[floorRect('BYGG-G-0001',[0,0],[1,1])];
 assert.equal(getNextId(entries,floors,'wall'),'BYGG-V-0002');
 assert.equal(getNextId(entries,floors,'door'),'BYGG-D-0002');
 assert.equal(getNextId(entries,floors,'floor'),'BYGG-G-0002');
 assert.equal(validateEntry(entries[0],{isNew:true}),true);
 assert.equal(validateFloorRect(floors[0]),true);
 assert.throws(()=>validateEntry(makeEntry('BYGG-V-0002','window',[0,0],[.1,0])));
});
test('editing may be free but warns about removed canonical walls, doors and out-of-floor proposals',()=>{
 const entries=readBaseline(data);entries[0].deleted=true;entries.find(x=>x.id==='D01').deleted=true;
 entries.push(makeEntry('BYGG-V-0001','wall',[-9,10],[-3,10]));
 const warnings=warningsForLayout(entries,[],data);
 assert(warnings.length>=3);assert(warnings.join(' ').includes('ursprungliga'));
});

test('wall gray/white and door red/elevator finishes roundtrip with schema v1',()=>{
 const entries=readBaseline(data);
 const wall=entries.find(x=>x.id==='WALL-001'),door=entries.find(x=>x.id==='D08');
 wall.finish='gray';door.finish='red';
 const other=makeEntry('BYGG-D-1234','elevator-door',[8,3],[9,3]);entries.push(other);
 const patch=exportArchitecture(entries,baseline,[]);
 assert.equal(patch.edits.find(x=>x.id==='WALL-001').finish,'gray');
 assert.equal(patch.edits.find(x=>x.id==='D08').finish,'red');
 assert.equal(patch.added.find(x=>x.id===other.id).finish,'elevator');
 const loaded=parseArchitecture(JSON.parse(JSON.stringify(patch)),baseline);
 assert.deepEqual(exportArchitecture(loaded.entries,baseline),patch);
});
test('invalid wall or door colors reject safely, legacy projects default predictably',()=>{
 const wall=makeEntry('BYGG-V-4001','wall',[0,0],[2,0]);
 assert.throws(()=>validateEntry({...wall,finish:'red'}),/Färgval/);
 const door=makeEntry('BYGG-D-4001','door',[0,0],[1,0]);
 assert.throws(()=>validateEntry({...door,finish:'invisible'}),/Färgval/);
 const legacy={...wall};delete legacy.finish;
 const doc=exportArchitecture([legacy],[],[]);
 assert.equal(doc.added[0].finish,'white');
 assert.equal(parseArchitecture(doc,[]).entries[0].finish,'white');
});

test('standard 1.20 span and leafless opening physically cut wall segments',async()=>{
 const {standardPassageSpan,STANDARD_PASSAGE_WIDTH}=await import('./architecture.mjs?v=5.1.0');
 assert.equal(STANDARD_PASSAGE_WIDTH,1.2);
 const span=standardPassageSpan([2,0],[8,0]);assert(Math.abs(entryLength(span)-1.2)<1e-9);
 assert.deepEqual(span.a,[4.4,0]);assert.deepEqual(span.b,[5.6,0]);
 const pieces=wallPieces([makeEntry('BYGG-V-0008','wall',[2,0],[8,0]),makeEntry('BYGG-D-0008','opening',span.a,span.b)]);
 assert.equal(pieces.length,2);assert(pieces[0].b[0]<4.4&&pieces[1].a[0]>5.6);
 assert.throws(()=>standardPassageSpan([1,1],[1,1]),/två olika/);
 assert.throws(()=>standardPassageSpan([0,0],[2,0],.8),/1,10/);
});

test('STANDARD markers are 1.20 for all door types and source geometry is unchanged',async()=>{
 const {standardDoorMarkerSpan,STANDARD_PASSAGE_WIDTH,doorOnWallSegment}=await import('./architecture.mjs?v=5.1.0');
 assert.equal(STANDARD_PASSAGE_WIDTH,1.20);
 for(const kind of ['door','card-door','elevator-door','terrace-door','opening']){
  for(const [a,b] of [[[0,0],[.8,0]],[[0,0],[2.4,0]],[[2,3],[2,4.6]],[[1,1],[3,3]]]){
   const source=makeEntry('BYGG-D-0012',kind,a,b),old=JSON.stringify(source);
   const marker=standardDoorMarkerSpan(source);
   assert(Math.abs(entryLength(marker)-STANDARD_PASSAGE_WIDTH)<1e-9,kind);
   assert.equal((marker.a[0]+marker.b[0])/2,(a[0]+b[0])/2);
   assert.equal((marker.a[1]+marker.b[1])/2,(a[1]+b[1])/2);
   assert.equal(JSON.stringify(source),old,'no source door geometry mutation');
  }
 }
 const wall=makeEntry('BYGG-V-0012','wall',[0,0],[5,0]);
 const door=doorOnWallSegment(wall,'BYGG-D-0012');
 assert(Math.abs(entryLength(door)-1.2)<.001);
 assert.equal(door.a[0],1.9);assert.equal(door.b[0],3.1);
 assert.throws(()=>doorOnWallSegment(makeEntry('BYGG-V-0022','wall',[0,0],[1.3,0]),'BYGG-D-0022'),/STANDARD/);
});
