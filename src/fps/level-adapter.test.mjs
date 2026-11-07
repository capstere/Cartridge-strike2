import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {levelProjectToWorldData} from './level-adapter.mjs?v=5.7.2';
import {createWorld} from './world.mjs?v=5.7.2';
import {validateLevel} from '../../furniture-editor/build/validate-level.mjs?v=5.7.2';
import {Game} from './game.mjs';

const project=JSON.parse(readFileSync(new URL('../../levels/synthetic-demo.json',import.meta.url),'utf8'));
test('synthetic project adapts rooms, corridor, surfaces, doors, furniture and 5+5 anchors',()=>{
 const {data,anchors}=levelProjectToWorldData(project);assert.equal(data.rooms.length,2);assert.equal(data.corridors.length,1);
 assert.equal(data.walls.filter(w=>w.surfaceType==='window').length,2);assert.equal(data.obstacles.length,2);
 assert.equal(data.doors.length,2);assert.equal(anchors.analysts.length,5);assert.equal(anchors.counterAnalysts.length,5);
});
test('engine validates all spawn/objective routes and both sides of both doors',()=>{
 const shallow=validateLevel(project);assert.equal(shallow.summary.playable,false);assert.equal(shallow.engine.ran,false);
 const authoritative=validateLevel(project,{engine:true});assert.equal(authoritative.summary.errors,0);
 assert.equal(authoritative.summary.playable,true);assert(authoritative.results.some(r=>r.check==='V06'&&r.detail.includes('Båda riktningar')));
});
test('window parapet changes real colliders and panes are broken by a shot',()=>{
 const world=createWorld({levelProject:project,fresh:true});const sill=world.description.boxes.find(b=>b.id.includes('BYGG-V-0003')&&b.id.endsWith('sill-wall'));
 assert.equal(sill.h,1.05);assert.equal(sill.y,.525);
 const pane=[...world.glass.panes.values()][0];assert(pane);const glassBox=world.staticBoxes.find(b=>b.glassId===pane.id);
 assert(glassBox);assert.equal(glassBox.disabled,false);
 assert(world.glass.breakAt({id:glassBox.id}));assert.equal(glassBox.disabled,true);
 world.glass.reset();assert.equal(glassBox.disabled,false);
});
test('separate world cache never leaks into Floor 5 and match creates ten actors',()=>{
 const custom=createWorld({levelProject:project}),again=createWorld({levelProject:project});assert.strictEqual(custom,again);
 const floor5=createWorld();assert.notStrictEqual(custom,floor5);assert.equal(floor5.data.rooms.length>2,true);
 const game=new Game(custom);game.start('analysts',{mode:'classic'});assert.equal(game.actors.length,10);assert.equal(game.hostages.length,2);
 for(let i=0;i<30;i++)game.update(1/60,{forward:0,strafe:0,yaw:0,pitch:0});
 assert.equal(game.actors.length,10);
});
test('blocked door and disconnected floor fail motor validation',()=>{
 const blocked=structuredClone(project);blocked.architecture.added.find(a=>a.kind==='door').b[1]=2.9;
 assert(validateLevel(blocked,{engine:true}).results.some(r=>r.check==='V06'&&r.status==='fail'));
 const isolated=structuredClone(project);isolated.architecture.added=isolated.architecture.added.filter(a=>a.kind!=='door');
 assert(validateLevel(isolated,{engine:true}).summary.errors>0);
});

test('nonblocking furniture keeps visuals but loses physics and nav blockers',()=>{
 const free=structuredClone(project);free.furniture.added[0].collision='none';
 const blockedWorld=createWorld({levelProject:project,fresh:true}),freeWorld=createWorld({levelProject:free,fresh:true});
 const asset=free.furniture.added[0];
 assert(blockedWorld.staticBoxes.some(b=>b.id===asset.id));
 assert(freeWorld.description.boxes.some(b=>b.id===asset.id));
 assert(!freeWorld.staticBoxes.some(b=>b.id===asset.id));
 assert.equal(blockedWorld.staticCanOccupy(asset.x,asset.z,.2),false);
 assert.equal(freeWorld.staticCanOccupy(asset.x,asset.z,.2),true);
});

test('window fitting removes hidden solid layers from overlapping room walls',()=>{
 const p=structuredClone(project),window=p.architecture.added.find(e=>e.kind==='window');
 p.architecture.added.push({...window,id:'BYGG-V-0999',kind:'wall'});
 const world=createWorld({levelProject:p,fresh:true});
 const pane=[...world.glass.panes.values()].find(g=>g.wallId.startsWith(window.id));
 const box=world.staticBoxes.find(b=>b.glassId===pane.id),dx=window.b[0]-window.a[0],dz=window.b[1]-window.a[1],length=Math.hypot(dx,dz);
 const a={x:box.x-dz/length*.4,y:box.y,z:box.z+dx/length*.4},b={x:box.x+dz/length*.4,y:box.y,z:box.z-dx/length*.4};
 assert.equal(world.segmentClear(a,b),false);world.glass.breakAt({id:box.id});
 assert.equal(world.segmentClear(a,b),true,'no invisible solid wall may survive behind the broken pane');
});
