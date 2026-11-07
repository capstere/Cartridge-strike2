import test from 'node:test';
import assert from 'node:assert/strict';
import {exportProject,parseProject,parseProjectZip,exportProjectZip} from './level-project.mjs?v=5.7.2';
import {makeEntry,entryLength} from './architecture.mjs';
import {resolveProjectScene,writeProjectScene,floor5Baseline} from './project-scene.mjs?v=5.7.2';
import {levelProjectToWorldData} from '../../src/fps/level-adapter.mjs?v=5.7.2';
import {createWorld} from '../../src/fps/world.mjs?v=5.7.2';
import {testDoorTraversal} from './door-traversal.mjs';

const floor={id:'BYGG-G-0001',name:'Kontor',role:'room',surface:'office-carpet',x0:0,z0:0,x1:8,z1:8};
function fixture(){
 const wall=makeEntry('BYGG-V-0001','wall',[4,0],[4,8]);
 const glass=makeEntry('BYGG-V-0002','glazed',[0,0],[0,8]);glass.glazingStyle='office-band';
 const door=makeEntry('BYGG-D-0001','door',[4,3.4],[4,4.6]);door.doorStyle='office';door.finish='gray';
 return exportProject({ground:{bounds:{x0:0,z0:0,x1:12,z1:12},wallHeightDefault:2.85,floors:[floor]},
  architecture:{schemaVersion:1,added:[wall,glass,door],edits:[],removed:[],floors:[],posters:[],treatments:[]}});
}

test('Office door, carpet and branded-free glass survive schema 2 ZIP import exactly',async()=>{
 const p=fixture(),after=(await parseProjectZip(await exportProjectZip(p))).project;
 assert.deepEqual(after,p);
 const {data}=levelProjectToWorldData(after);
 assert.equal(data.rooms[0].surface,'office-carpet');
 assert(data.walls.some(w=>w.surfaceType==='glazed'&&w.glazingStyle==='office-band'));
 assert(data.doors.some(d=>d.doorStyle==='office'));
 const world=createWorld({levelProject:after,fresh:true});
 assert.equal(world.description.surfaces.find(s=>s.id==='finish-'+floor.id)?.material,'office-carpet');
 const signals=world.description.boxes.filter(b=>b.material==='blue-graphic');
 assert(signals.length>=3);
 assert(signals.every(b=>b.decorative===true));
 assert(signals.every(b=>!world.staticBoxes.some(c=>c.id===b.id)),'Decorative blue marks must not block the FPS capsule');
 const door=world.doors.doors.find(d=>d.id==='BYGG-D-0001');
 assert.equal(door.doorStyle,'office');
 assert(Math.abs(door.width-1.2)<.001);
 const rows=testDoorTraversal(world,{ids:new Set([door.id])});
 assert.equal(rows.length,2);
 assert(rows.every(r=>r.status==='pass'),JSON.stringify(rows));
});

test('Photo-inspired floor and glass appearances do not change source Floor 5 architecture',async()=>{
 const p=exportProject({mode:'edit-floor5'}),scene=resolveProjectScene(p);
 const baseline=floor5Baseline(),original=baseline.entries.find(e=>e.id==='D26');
 assert(original);
 const door=scene.entries.find(e=>e.id==='D26');door.doorStyle='office';door.finish='gray';
 const glass=scene.entries.find(e=>e.kind==='glazed');
 if(glass)glass.glazingStyle='office-band';
 writeProjectScene(p,scene);
 p.floorFinishes={I25:'office-carpet'};
 const round=(await parseProjectZip(await exportProjectZip(p))).project,rendered=resolveProjectScene(round);
 assert.equal(rendered.floors.find(f=>f.id==='I25').surface,'office-carpet');
 const edited=rendered.entries.find(e=>e.id==='D26');
 assert.deepEqual(edited.a,original.a);assert.deepEqual(edited.b,original.b);
 assert.equal(edited.doorStyle,'office');
 assert.equal(rendered.entries.length,baseline.entries.length);
 if(glass)assert.equal(rendered.entries.find(e=>e.id===glass.id).glazingStyle,'office-band');
 const pristine=resolveProjectScene(exportProject({mode:'edit-floor5'}));
 assert.equal(pristine.floors.find(f=>f.id==='I25').surface,'carpet');
 assert.equal(pristine.entries.find(e=>e.id==='D26').doorStyle,undefined);
});

test('Unknown floor IDs and unsupported glazing or door styles cannot enter project',()=>{
 const p=fixture();
 const wrong=structuredClone(p);wrong.floorFinishes={nonexistent:'office-carpet'};
 assert.throws(()=>parseProject(wrong),/golvfinish/);
 const broken=structuredClone(p);broken.architecture.added.find(e=>e.kind==='wall').glazingStyle='office-band';
 assert.throws(()=>parseProject(broken),/glas/);
 const badDoor=structuredClone(p);badDoor.architecture.added.find(e=>e.kind==='door').doorStyle='secret';
 assert.throws(()=>parseProject(badDoor),/dörr/);
 const legacy=structuredClone(p);delete legacy.floorFinishes;delete legacy.architecture.added[1].glazingStyle;
 assert.doesNotThrow(()=>parseProject(legacy));
});
