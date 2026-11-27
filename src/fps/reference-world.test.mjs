import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import '../../server/register-shared.mjs';
import {advanceGrenade} from './grenade-physics.mjs';
const {createWorld}=await import('./world.mjs');
const {Game}=await import('./game.mjs');
const {collisionContract}=await import('../../shared/multiplayer/collision-contract.mjs');
const {parseProject}=await import('../../furniture-editor/build/level-project.mjs');
const project=parseProject(await readFile(new URL('../../levels/meltem.json',import.meta.url),'utf8'));
const world=createWorld({levelProject:project,fresh:true});

test('the Meltem pilot is selectable only in its reviewed modes',async()=>{
  const {DEFAULT_MAP_ID,networkMap}=await import('../../shared/multiplayer/maps.mjs');
  const catalog=JSON.parse(await readFile(new URL('../../levels/manifest.json',import.meta.url),'utf8'));
  const entry=catalog.levels.find(map=>map.id==='meltem'),online=networkMap('meltem');
  assert.deepEqual(entry.modes,['endless']);assert.notEqual(entry.randomEligible,true);
  assert.deepEqual(online.modes,['tdm']);assert.equal(online.residents,false);
  assert.equal(entry.file,online.file);assert.equal(entry.preview,online.preview);
  assert.equal(catalog.defaultLevel,DEFAULT_MAP_ID);
  assert.ok(networkMap('compact-arena')&&networkMap(DEFAULT_MAP_ID));
});

test('Meltem retains all source collision volumes, layered routes and the ten reviewed spawn anchors',()=>{
  assert.equal(world.staticBoxes.length,791);
  assert.deepEqual(world.navigation.statistics,{nodes:5376,edges:31504,source:'Riposte layered walk graph'});
  for(const a of world.anchors.analysts)for(const b of world.anchors.counterAnalysts){
    assert.ok(world.canOccupy(a.x,a.z,.215,1.7,a.y)&&world.canOccupy(b.x,b.z,.215,1.7,b.y));
    assert.ok(world.findPath(a,b).length);
  }
  assert.deepEqual(world.anchors.hostages,[]);assert.equal(world.anchors.bomb,null);
  const second=createWorld({levelProject:structuredClone(project),fresh:true});
  assert.notEqual(world.navigation,second.navigation);assert.equal(collisionContract(world),collisionContract(second));
});

test('a body can stand under the tavern roof or take a genuine stair route to it',()=>{
  const low={x:-19.5,y:0,z:18.5},roof={...low,y:3.4};
  assert.ok(world.canOccupy(low.x,low.z,.2,1.7,low.y));assert.ok(world.canOccupy(roof.x,roof.z,.2,1.7,roof.y));
  assert.equal(world.groundHeight(low.x,low.z,0),0);
  assert.ok(Math.abs(world.groundHeight(roof.x,roof.z,3.4)-3.4)<.01);
  assert.notEqual(world.navigation.nearest(low).id,world.navigation.nearest(roof).id);
  assert.equal(world.navigation.clear(low,roof),false);
  const route=world.findPath(low,roof);assert.ok(route.length>=3);
  assert.ok(route.some(n=>Math.hypot(n.x-low.x,n.z-low.z)>2));
  const runner={x:-4.05,y:0,z:28.7,radius:.2,height:1.7};
  for(let i=0;i<83;i++)world.move(runner,-.068,-.033,0);
  assert.ok(runner.y>3.2&&runner.onGround);
  for(let i=0;i<82;i++)world.move(runner,.068,-.068,0);
  assert.ok(runner.y<.2);
});

test('pier, sea and wells use distinct floor and ray heights',()=>{
  assert.equal(world.groundHeight(-34,0,0),0);
  assert.equal(world.groundHeight(-34,10,0),-6.4);
  const ray={x:0,y:-1,z:0};
  assert.equal(world.raycast({x:-34,y:2,z:0},ray,20).material,'wood');
  assert.ok(Math.abs(world.raycast({x:-34,y:2,z:10},ray,20).point.y+.9)<1e-5);
  const well=world.raycast({x:-4.2,y:.8,z:38.8},ray,10);
  assert.equal(well.material,'water');assert.ok(Math.abs(well.point.y+2.4)<1e-5);
  const grenade={x:-4.2,y:-.5,z:38.8,vx:0,vy:0,vz:0,radius:.06};
  advanceGrenade(grenade,world,9.81,1/60);assert.ok(grenade.y<-.5);
  assert.equal(world.scopeAllowed(-60,0),false);
});

test('an empty or one-team Endless room starts with an inactive bomb at a real map anchor',()=>{
  for(const controllers of [{},{'analysts-0':'human'}]){
    const game=new Game(world,{controllers,config:{mode:'endless',networkSlice:true,wanderers:false}}).start();
    assert.equal(game.actors.length,Object.keys(controllers).length);
    assert.equal(game.bomb.status,'inactive');
    const anchor=world.anchors.counterAnalysts[0];
    assert.deepEqual([game.bomb.x,game.bomb.y,game.bomb.z],[anchor.x,anchor.y,anchor.z]);
  }
});
