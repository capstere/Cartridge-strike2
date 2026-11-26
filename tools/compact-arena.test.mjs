import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createWorld} from '../src/fps/world.mjs';
import {prepareNetworkWorld} from '../shared/multiplayer/world.mjs';
import {multiplayerMapAnchors} from '../src/fps/minimap-cache.mjs';

const project=JSON.parse(readFileSync(new URL('../levels/compact-arena.json',import.meta.url)));

test('all ten arena spawns reach both flanks, the center and every patrol destination',()=>{
  const world=prepareNetworkWorld(createWorld({levelProject:project,fresh:true}));
  const anchors=multiplayerMapAnchors(world);
  assert.deepEqual(anchors.map(a=>a.label).sort(),project.ground.floors.map(f=>f.name).sort());
  assert.equal(new Set(anchors.map(a=>a.id)).size,7);
  const spawns=[...world.anchors.analysts,...world.anchors.counterAnalysts];
  const goals=world.tactical.patrolPoints;
  assert.equal(spawns.length,10);
  assert.equal(goals.length,6);
  for(const start of spawns){
    for(const goal of goals){
      assert.ok(world.canOccupy(goal.x,goal.z,.22));
      const path=world.findPath(start,goal);
      assert.ok(path.length);
      const from=[start,...path];
      for(let i=1;i<from.length;i++) assert.ok(world.navigation.clear(from[i-1],from[i],.20));
    }
  }
  for(const a of world.anchors.analysts)for(const b of world.anchors.counterAnalysts){
    assert.equal(world.segmentClear({...a,y:1.55},{...b,y:1.55},{vision:true}),false);
  }
});
