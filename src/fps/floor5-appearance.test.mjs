import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from './world.mjs';
import {planSmokeDetectors} from './smoke-detectors.mjs';
import {preparedFloorFinish} from '../../furniture-editor/build/floor5-appearance.mjs';
const project=JSON.parse(readFileSync(new URL('../../levels/floor5-prepared.json',import.meta.url)));
const world=createWorld({levelProject:project});

test('display finish is restricted to the prepared rooms and selected source finish',()=>{
 assert.equal(preparedFloorFinish(project,'I12','dark-gloss-laminate'),'service-vinyl');
 assert.equal(preparedFloorFinish(project,'I13','dark-gloss-laminate'),'service-vinyl');
 assert.equal(preparedFloorFinish(project,'I02','vinyl'),'cold-lab-vinyl');
 assert.equal(preparedFloorFinish(project,'I01','vinyl'),'lab-vinyl');
 assert.equal(preparedFloorFinish(project,'I31','dark-large-stone'),'quiet-stone');
 assert.equal(preparedFloorFinish(project,'I12','carpet'),null);
 assert.equal(preparedFloorFinish(project,'X21','vinyl'),null);
 assert.equal(preparedFloorFinish({},'I12','dark-gloss-laminate'),null);
});

test('ceiling fittings cover labs, office and corridors without mutating the level or physics',()=>{
 const before=JSON.stringify(project),staticBefore=JSON.stringify(world.staticBoxes),plan=planSmokeDetectors(world);
 assert.deepEqual(planSmokeDetectors(world),plan,'placement is reproducible');
 for(const id of ['I01','I02','I04','I12','I26','C02','C16'])assert(plan.some(p=>p.roomId===id),id+' has a detector');
 assert(plan.length<100,'bounded cosmetic geometry');
 for(const p of plan){
  assert(world.canOccupy(p.x,p.z,.2));assert.equal(world.roomAt(p.x,p.z)?.id,p.roomId);
  assert(p.y-.062>2.2,'whole fitting remains above player capsule');
  for(const q of plan)if(p!==q)assert(Math.hypot(p.x-q.x,p.z-q.z)>=2,'no neighbouring duplicates');
 }
 assert.equal(JSON.stringify(project),before);assert.equal(JSON.stringify(world.staticBoxes),staticBefore);
});

test('authored smoke detectors suppress nearby automatic decoration',()=>{
 const first=planSmokeDetectors(world)[0],items=world.projectScene.items;
 items.push({id:'test-owner-detector',assetName:'Vit rökdetektor',x:first.x,z:first.z});
 try{assert(planSmokeDetectors(world).every(p=>Math.hypot(p.x-first.x,p.z-first.z)>=3));}finally{items.pop();}
});
