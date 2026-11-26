import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import test from 'node:test';
import {validateLevel} from '../furniture-editor/build/validate-level.mjs';

test('Compact Arena passes LevelProject validation with the furnished collision world',()=>{
  const project=JSON.parse(readFileSync(new URL('../levels/compact-arena.json',import.meta.url)));
  const report=validateLevel(project,{engine:true});
  assert.deepEqual(report.summary,{errors:0,warnings:0,playable:true},JSON.stringify(report.results));
});
