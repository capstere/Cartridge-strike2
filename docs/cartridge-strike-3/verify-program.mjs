// Run with Node from any working directory. Check the recorded execution state.
import {readFile} from 'node:fs/promises';
import assert from 'node:assert/strict';

const manifest = JSON.parse(await readFile(new URL('tasks.json', import.meta.url), 'utf8'));
const report = await readFile(new URL('PROJECT_STATUS.md', import.meta.url), 'utf8');
const states = new Set(['NOT_STARTED', 'IN_PROGRESS', 'BLOCKED', 'REVIEW', 'VERIFIED']);
const active = new Set(['IN_PROGRESS', 'REVIEW', 'VERIFIED']);
const tasks = new Map(manifest.tasks.map(task => [task.id, task]));
assert.equal(tasks.size, manifest.tasks.length, 'Duplicate package ID');

const rows = new Map();
for (const [, id, state] of report.matchAll(/^\| (CS3-\d+) \| ([A-Z_]+) \|/gm)) {
  assert(!rows.has(id), 'Duplicate status row ' + id);
  rows.set(id, state);
}
assert.deepEqual([...tasks.keys()].sort(), [...rows.keys()].sort(), 'Status rows differ from task IDs');

const visited = new Set();
const pending = new Set();
function visit(id) {
  const task = tasks.get(id);
  assert(task, 'Unknown package ' + id);
  if (visited.has(id)) return;
  assert(!pending.has(id), 'Dependency cycle at ' + id);
  pending.add(id);
  assert(states.has(task.status), id + ' has unknown status ' + task.status);
  assert.equal(rows.get(id), task.status, id + ' differs between status and manifest');
  for (const dependency of task.dependsOn) {
    visit(dependency);
    if (active.has(task.status)) {
      assert.equal(tasks.get(dependency).status, 'VERIFIED', id + ' requires ' + dependency);
    }
  }
  pending.delete(id);
  visited.add(id);
}
for (const id of tasks.keys()) visit(id);

const ready = manifest.tasks.filter(task => task.status === 'NOT_STARTED' &&
  task.dependsOn.every(id => tasks.get(id).status === 'VERIFIED'));
console.log(JSON.stringify({
  packages: tasks.size,
  verified: manifest.tasks.filter(task => task.status === 'VERIFIED').map(task => task.id),
  inProgress: manifest.tasks.filter(task => task.status === 'IN_PROGRESS').map(task => task.id),
  ready: ready.map(task => task.id),
  blocked: manifest.tasks.filter(task => task.status === 'BLOCKED').map(task => task.id),
}));
