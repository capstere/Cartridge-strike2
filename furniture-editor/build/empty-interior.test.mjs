import test from 'node:test';
import assert from 'node:assert/strict';
import {clearFloor5Interior,restoreFloor5Interior} from './empty-interior.mjs?v=5.7.2';
import {resolveProjectScene,floor5Baseline,writeProjectScene} from './project-scene.mjs?v=5.7.2';
import {exportProject,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {collisionExport} from './ai-export.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';

test('empty Floor 5 removes 107 inherited furniture and fixed items without touching the architecture',async()=>{
 const project=exportProject({mode:'edit-floor5'});
 const scene=resolveProjectScene(project),baseline=floor5Baseline();
 assert(scene.items.length>100&&scene.fixed.length>0);
 const before={walls:structuredClone(scene.entries),floors:structuredClone(scene.floors),
  gameplay:structuredClone(project.gameplay),projectId:project.projectId};
 const counts=clearFloor5Interior(project,scene);
 assert.equal(counts.furniture,baseline.items.length);
 assert(counts.fixed>0);
 writeProjectScene(project,scene);
 assert.equal(project.furniture.removed.length,baseline.items.length);
 assert.equal(project.legacyPatch.emptyFixed,true);
 assert.equal(project.furniture.added.length,0);
 assert.equal(project.furniture.placements.length,0);
 const resolved=resolveProjectScene(project),collision=collisionExport(project);
 assert.deepEqual(resolved.entries,before.walls);
 assert.deepEqual(resolved.floors,before.floors);
 assert.deepEqual(project.gameplay,before.gameplay);
 assert.equal(project.projectId,before.projectId);
 assert.equal(resolved.items.length,0);
 assert.equal(resolved.fixed.length,0);
 assert.equal(collision.furniture.length,0);
 assert.equal(collision.fixedObstacles.length,0);
 assert(collision.staticWalls.some(w=>w.kind==='window'));
 assert(collision.passages.length>0);
 // A source Floor 5 world remains unchanged, while the bankopia stays empty.
 const original=createWorld();
 const empty=createWorld({levelProject:project,fresh:true});
 assert.equal(empty.data.obstacles.length,0);
 assert(empty.description.boxes.every(b=>!b.id.startsWith('pantry-')&&!b.id.startsWith('light-')));
 assert.notStrictEqual(original,empty);
 assert.strictEqual(createWorld(),original);
 const zipped=(await parseProjectZip(await exportProjectZip(project))).project;
 assert.deepEqual(zipped,project);
 assert.equal(resolveProjectScene(zipped).items.length,0);
});

test('restore original interior preserves newly added pieces and does not change walls or game anchors',()=>{
 const project=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(project);
 const added={id:'NY-OBJ-4321',kind:'prop',x:5,z:5,w:.4,d:.4,height:.5,
  yaw:0,assetId:'studio:microwave',assetName:'Mikro'};
 const floor=structuredClone(scene.floors),walls=structuredClone(scene.entries);
 clearFloor5Interior(project,scene);
 scene.items.push(added);
 writeProjectScene(project,scene);
 const restore=restoreFloor5Interior(project,scene);
 assert.equal(restore.personalPreserved,1);
 writeProjectScene(project,scene);
 const final=resolveProjectScene(project);
 assert.equal(project.legacyPatch.emptyFixed,false);
 assert.equal(project.furniture.removed.length,0);
 assert.equal(final.items.length,floor5Baseline().items.length+1);
 assert(final.items.some(o=>o.id===added.id));
 assert(final.fixed.length>0);
 assert.deepEqual(final.floors,floor);
 assert.deepEqual(final.entries,walls);
});

test('new-level projects cannot use the Floor 5 empty-interior preset',()=>{
 const project=exportProject({mode:'new-level'}),scene=resolveProjectScene(project);
 assert.throws(()=>clearFloor5Interior(project,scene),/Floor 5/);
 assert.throws(()=>restoreFloor5Interior(project,scene),/Floor 5/);
});
