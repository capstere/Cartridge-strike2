import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProject,exportProjectZip,parseProjectZip} from './level-project.mjs?v=5.7.2';
import {resolveProjectScene,writeProjectScene} from './project-scene.mjs?v=5.7.2';
import {collisionExport,aiAgentBrief} from './ai-export.mjs?v=5.7.2';
import {inheritFloor5Gameplay,createWorld} from '../../src/fps/world.mjs?v=5.7.2';
import {validateLevel} from './validate-level.mjs?v=5.7.2';
import {planPaintOverWall} from './paint-over-wall.mjs?v=5.1.0';
import {duplicateFurnitureAssembly} from '../smart-placement.mjs?v=5.7.2';

test('Floor 5 is editable and exported through the same scene contract as new levels',async()=>{
 const p=inheritFloor5Gameplay(exportProject({mode:'edit-floor5'})),scene=resolveProjectScene(p);
 assert(scene.entries.length>300);assert(scene.items.length>100);assert.equal(p.gameplay.spawns.length,10);
 const removed=scene.items.shift(),moved=scene.items[0];moved.x+=.2;
 const wall=scene.entries.find(e=>e.kind==='wall'&&Math.hypot(e.b[0]-e.a[0],e.b[1]-e.a[1])>4);
 const painted=planPaintOverWall(scene.entries,wall.id,wall.a,wall.b,'window');scene.entries=painted.entries.filter(e=>!e.deleted);
 writeProjectScene(p,scene);
 assert(p.furniture.removed.includes(removed.id));assert(p.furniture.placements.some(o=>o.id===moved.id));
 assert(p.architecture.removed.includes(wall.id)||p.architecture.edits.some(e=>e.id===wall.id));
 const round=(await parseProjectZip(await exportProjectZip(p))).project;
 assert.deepEqual(round,p);const map=collisionExport(round);
 assert.equal(map.floor5Inherited,true);assert(map.staticWalls.some(w=>w.kind==='window'));
 assert.match(aiAgentBrief(round),/apply ALL edits/);
 assert.equal(resolveProjectScene(round).items.length,scene.items.length);
});
test('unmodified Floor 5 project inherits playable anchors and routes; default world is isolated',()=>{
 const original=createWorld(),p=exportProject({mode:'edit-floor5'}),world=createWorld({levelProject:p,fresh:true});
 assert.notStrictEqual(world,original);assert.strictEqual(createWorld(),original);
 assert(world.findPath(world.anchors.analysts[0],world.anchors.rescue).length);
 assert.equal(validateLevel(p,{engine:true}).summary.errors,0);
});
test('rotated mounted furniture collider uses original dimensions and elevation once',()=>{
 const p=exportProject({ground:{bounds:{x0:0,z0:0,x1:12,z1:12},wallHeightDefault:2.85,floors:[{id:'BYGG-G-0001',name:'Room',role:'room',surface:'carpet',x0:0,z0:0,x1:12,z1:12}]},
  furniture:{placements:[],removed:[],added:[{id:'NY-OBJ-0001',kind:'prop',x:5,z:5,yaw:Math.PI/4,w:2,d:.8,height:.4,elevation:.8}]}});
 const world=createWorld({levelProject:p,fresh:true}),box=world.description.boxes.find(b=>b.id==='NY-OBJ-0001');
 assert.equal(box.w,2);assert.equal(box.d,.8);assert.equal(box.y,1);assert.equal(box.angle,Math.PI/4);
});
test('duplicating a desk rotates and remaps the complete attachment tree',()=>{
 const desk={id:'NY-OBJ-0001',kind:'desk',x:1,z:1,yaw:0,w:2,d:1,height:.8};
 const screen={id:'NY-OBJ-0002',kind:'prop',x:1,z:1.4,yaw:0,w:1,d:.1,height:.4,elevation:.8,mountId:desk.id};
 const [copy,child]=duplicateFurnitureAssembly(desk,[desk,screen],{x:5,z:5,yaw:Math.PI/2});
 assert.notEqual(copy.id,desk.id);assert.equal(child.mountId,copy.id);assert.equal(child.elevation,.8);
 assert.equal(child.x,5.4);assert.equal(child.z,5);assert.equal(child.yaw,Math.PI/2);
 assert.equal(screen.mountId,desk.id);assert.equal(desk.x,1);
});
