import test from 'node:test';
import assert from 'node:assert/strict';
import {loadHeadlessWorld} from '../headless.mjs';
import {prepareNetworkWorld} from '../../shared/multiplayer/world.mjs';
import {glassCrossing} from '../../tools/network-glass-fixture.mjs';

function orderedGraph(navigation) {
  const edges = [];
  return navigation.nodes.map(({id, x, z}) => {
    navigation.graph.getEdgesOfNode(id, edges);
    return [id, x, z, edges.map(edge => [edge.from, edge.to, edge.cost])];
  });
}

test('prepared Floor 5 recreates the original graph and routes with private room state', async () => {
  const {world: cold} = await loadHeadlessWorld('floor5-prepared');
  const {world: warm} = await loadHeadlessWorld('floor5-prepared');
  const originalGraph = orderedGraph(cold.navigation);
  assert.deepEqual(orderedGraph(warm.navigation), originalGraph);
  assert.notEqual(warm.navigation.nodes[0], cold.navigation.nodes[0]);
  assert.notEqual(warm.navigation.graph.getNode(0), cold.navigation.graph.getNode(0));

  const paths = [];
  for (const team of ['analysts', 'counterAnalysts']) {
    for (const goal of ['bomb', 'hostages']) {
      const src = cold.anchors[team][0];
      const dst = goal === 'bomb' ? cold.anchors.bomb : cold.anchors.hostages[0];
      const original = cold.tactical.choices(team, goal);
      const hydrated = warm.tactical.choices(team, goal);
      assert.deepEqual(hydrated, original);
      assert.notEqual(hydrated, original);
      assert.deepEqual(warm.findPath(src, dst), cold.findPath(src, dst));
      paths.push({team, goal, original: structuredClone(original)});
      if (original.length) original[0].path.pop();
    }
  }

  assert.ok(paths.some(({original}) => original.some(route => route.path.length)));

  prepareNetworkWorld(cold);
  prepareNetworkWorld(warm);
  const {pane, from, dir} = glassCrossing(cold);
  const to = {x: from.x + dir.x * 1.6, z: from.z + dir.z * 1.6};
  assert.equal(cold.navigation.clear(from, to), false);
  assert.ok(cold.glass.breakAt(pane.parts[0]));
  assert.equal(cold.navigation.clear(from, to), true);
  assert.equal(warm.navigation.clear(from, to), false);
  assert.deepEqual(orderedGraph(warm.navigation), originalGraph);

  const {world: next} = await loadHeadlessWorld('floor5-prepared');
  prepareNetworkWorld(next);
  assert.deepEqual(orderedGraph(next.navigation), originalGraph);
  for (const {team, goal, original} of paths) {
    assert.deepEqual(next.tactical.choices(team, goal), original);
    assert.deepEqual(warm.tactical.choices(team, goal), original);
  }
  assert.equal(next.navigation.clear(from, to), false);
  assert.ok(warm.glass.breakAt(warm.glass.panes.get(pane.id).parts[0]));
  assert.deepEqual(orderedGraph(warm.navigation), orderedGraph(cold.navigation));
  assert.equal(cold.glass.reset(), true);
  assert.equal(cold.navigation.clear(from, to), false);
  assert.equal(warm.navigation.clear(from, to), true);
  assert.equal(next.glass.brokenCount, 0);
});
