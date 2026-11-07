import test from 'node:test';
import assert from 'node:assert/strict';
import {makeEntry,entryLength,standardDoorMarkerSpan,standardPassageSpan,WC_PASSAGE_WIDTH,WC_MIN_PASSAGE_WIDTH} from './architecture.mjs';
import {planPaintOverWall} from './paint-over-wall.mjs';
import {exportProject,exportProjectZip,parseProjectZip,parseProject} from './level-project.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';
import {testDoorTraversal} from './door-traversal.mjs';

const room={id:'BYGG-G-0001',name:'WC test',role:'room',surface:'vinyl',x0:0,z0:0,x1:8,z1:8};
function fixture(){
 const wall=makeEntry('BYGG-V-0001','wall',[4,0],[4,8]);
 const result=planPaintOverWall([wall],wall.id,[4,3.1],[4,3.95],'door',{doorWidth:WC_PASSAGE_WIDTH});
 const door=result.entries.find(e=>e.id===result.paintedId);
 door.doorStyle='wc';door.finish='white';
 const project=exportProject({ground:{bounds:{x0:0,z0:0,x1:12,z1:12},wallHeightDefault:2.85,floors:[room]}});
 project.architecture.added=result.entries.filter(e=>!e.deleted);
 return {project,door};
}

test('new WC inserts are 0.85 wide, aligned to real wall and persist in ZIP',async()=>{
 const {project,door}=fixture();
 assert.equal(door.kind,'door');
 assert.equal(door.doorStyle,'wc');
 assert(Math.abs(entryLength(door)-WC_PASSAGE_WIDTH)<.002);
 assert.equal(entryLength(standardDoorMarkerSpan(door)),entryLength(door));
 assert.equal(project.architecture.added.filter(e=>e.kind==='wall').length,2);
 const result=await parseProjectZip(await exportProjectZip(project));
 assert.deepEqual(result.project,parseProject(project));
 const d=createWorld({levelProject:result.project,fresh:true}).doors.doors.find(d=>d.id===door.id);
 assert(d);assert.equal(d.doorStyle,'wc');assert.equal(d.leaves.length,1);
});

test('WC leaf is traversable by real moving capsule from both sides',()=>{
 const {project,door}=fixture(),world=createWorld({levelProject:project,fresh:true});
 const rows=testDoorTraversal(world,{ids:new Set([door.id])});
 assert.equal(rows.length,2);
 assert(rows.every(r=>r.status==='pass'),JSON.stringify(rows));
});

test('ordinary passages keep 1.10 minimum, while WC has a 0.65 minimum',()=>{
 assert.equal(WC_MIN_PASSAGE_WIDTH,.65);
 assert(Math.abs(entryLength(standardPassageSpan([0,0],[2,0]))-1.2)<1e-9);
 assert.throws(()=>standardPassageSpan([0,0],[2,0],.85),/1,10/);
 assert(Math.abs(entryLength(standardPassageSpan([0,0],[2,0],.85,{minWidth:WC_MIN_PASSAGE_WIDTH}))-.85)<1e-9);
 assert.throws(()=>standardPassageSpan([0,0],[2,0],.64,{minWidth:WC_MIN_PASSAGE_WIDTH}),/0,65/);
 const wc=fixture().project.architecture.added.find(d=>d.doorStyle==='wc');
 assert(wc&&entryLength(wc)>=WC_MIN_PASSAGE_WIDTH);
});

test('existing narrow toilet doors keep their source dimensions and accept a visual WC style',async()=>{
 const {floor5Baseline,resolveProjectScene,writeProjectScene}=await import('./project-scene.mjs?v=5.7.2');
 const p=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(p);
 const existing=scene.entries.filter(e=>['D43','D44','D45','D46','D47','D63'].includes(e.id));
 assert.equal(existing.length,6);
 for(const door of existing){assert(entryLength(door)<1.1);door.doorStyle='wc';door.finish='white';}
 writeProjectScene(p,scene);
 const round=(await parseProjectZip(await exportProjectZip(p))).project;
 assert.equal(round.architecture.edits.filter(e=>e.doorStyle==='wc').length,6);
 for(const id of ['D43','D44','D45','D46','D47','D63']){
  const before=floor5Baseline().entries.find(e=>e.id===id),after=resolveProjectScene(round).entries.find(e=>e.id===id);
  assert.deepEqual(after.a,before.a);assert.deepEqual(after.b,before.b);
  assert.equal(after.doorStyle,'wc');
 }
 const rows=testDoorTraversal(createWorld({levelProject:round,fresh:true}),{ids:new Set(['D43','D44','D45','D46','D47','D63'])});
 assert.equal(rows.length,12);
 assert(rows.every(r=>r.status==='pass'),JSON.stringify(rows));
});
