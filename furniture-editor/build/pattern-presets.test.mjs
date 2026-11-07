import test from 'node:test';
import assert from 'node:assert/strict';
import {FLOOR_FINISHES,WALL_PATTERNS,hasPattern,floorBaseColor} from './pattern-presets.mjs?v=5.6.0';
import {surfaceColor,paintDescription,validateSurfaceMaterials,reconcileSurfaceColors} from './surface-style.mjs?v=5.6.0';
import {exportProject,parseProject} from './level-project.mjs?v=5.7.2';

test('all requested finishes have stable IDs and visible base colors',()=>{
 assert(['dark-tile','dark-gloss-laminate','dark-large-stone'].every(k=>FLOOR_FINISHES.includes(k)&&hasPattern(k)&&/^#[a-f\d]{6}$/i.test(floorBaseColor(k))));
 assert(WALL_PATTERNS.includes('white-tile-gray-grout'));
 assert.equal(surfaceColor({},{id:'F',surface:'dark-tile'}),floorBaseColor('dark-tile'));
});
test('opaque wall tile paints only authored opaque panels, never glass or logo',()=>{
 const d={boxes:[{id:'W-1',material:'wall'},{id:'W-1-panel',material:'wall'},{id:'W-1-logo',material:'blue-graphic'},{id:'W-1-glass',material:'glass'}],surfaces:[]};
 paintDescription(d,{walls:[{id:'W-1',studioPattern:'white-tile-gray-grout'}],rooms:[],corridors:[],doors:[]});
 assert.equal(d.boxes[0].studioPattern,'white-tile-gray-grout');
 assert.equal(d.boxes[1].studioPattern,'white-tile-gray-grout');
 assert.equal(d.boxes[2].studioPattern,undefined);
 assert.equal(d.boxes[3].studioPattern,undefined);
});
test('wall tile map accepts only known opaque wall IDs',()=>{
 assert.doesNotThrow(()=>validateSurfaceMaterials({surfaceMaterials:{W:'white-tile-gray-grout'}},new Set(['W'])));
 assert.throws(()=>validateSurfaceMaterials({surfaceMaterials:{WINDOW:'white-tile-gray-grout'}},new Set(['W'])),/väggmaterial/);
 assert.throws(()=>validateSurfaceMaterials({surfaceMaterials:{W:'fancy-sky'}},new Set(['W'])),/väggmaterial/);
});
test('wall splitting preserves tile on both surviving segments',()=>{
 const before={surfaceMaterials:{W:'white-tile-gray-grout'}},after=structuredClone(before),old=[{id:'W',kind:'wall',a:[0,0],b:[4,0]}],entries=[{id:'A',kind:'wall',a:[0,0],b:[2,0]},{id:'B',kind:'wall',a:[2,0],b:[4,0]}];
 reconcileSurfaceColors(after,before,entries,old,[]);
 assert.deepEqual(after.surfaceMaterials,{A:'white-tile-gray-grout',B:'white-tile-gray-grout'});
});
test('schema-2 keeps new floor and wall finishes without changing physics or origin',()=>{
 const p=exportProject({mode:'new-level',ground:{bounds:{x0:-5,z0:-5,x1:5,z1:5},wallHeightDefault:2.85,floors:[{id:'BYGG-G-0001',name:'Test',role:'room',surface:'dark-tile',x0:0,z0:0,x1:3,z1:3}]},
  architecture:{schemaVersion:1,edits:[],removed:[],floors:[],posters:[],treatments:[],added:[{id:'BYGG-V-0001',kind:'wall',a:[0,0],b:[3,0],height:2.85,thickness:.1,sill:.9,finish:'white'}]}});
 p.floorFinishes={'BYGG-G-0001':'dark-large-stone'};p.surfaceMaterials={'BYGG-V-0001':'white-tile-gray-grout'};
 const restored=parseProject(JSON.stringify(p));
 assert.equal(restored.floorFinishes['BYGG-G-0001'],'dark-large-stone');
 assert.equal(restored.surfaceMaterials['BYGG-V-0001'],'white-tile-gray-grout');
 assert.throws(()=>parseProject({...p,floorFinishes:{'BYGG-G-0001':'imaginary-tiles'}}),/golvfinish/);
});

test('new-level floor overrides drive resolved scene and FPS after external ZIP round-trip',async()=>{
 const {resolveProjectScene}=await import('./project-scene.mjs?v=5.7.2');
 const {levelProjectToWorldData}=await import('../../src/fps/level-adapter.mjs?v=5.7.2');
 const {exportProjectZip,parseProjectZip}=await import('./level-project.mjs?v=5.7.2');
 const p=exportProject({mode:'new-level',ground:{bounds:{x0:-5,z0:-5,x1:5,z1:5},wallHeightDefault:2.85,floors:[{id:'BYGG-G-0001',name:'Test',role:'room',surface:'carpet',x0:0,z0:0,x1:3,z1:3}]}});
 p.floorFinishes={'BYGG-G-0001':'dark-large-stone'};
 const restored=(await parseProjectZip(await exportProjectZip(p))).project;
 assert.equal(resolveProjectScene(restored).floors[0].surface,'dark-large-stone');
 assert.equal(levelProjectToWorldData(restored).data.rooms[0].surface,'dark-large-stone');
 assert.deepEqual(restored.ground,p.ground,'Appearance overrides never rewrite floor geometry or its stored base');
});
