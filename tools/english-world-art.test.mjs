import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {englishPublishedFixtures, makeArtAtlas} from '../furniture-editor/build/environment-art.mjs';

const project = JSON.parse(readFileSync(new URL('../levels/floor5-prepared.json',import.meta.url),'utf8'));
const legacyTitle = 'VECKANS FIKA';

test('the shipped Floor 5 atlas draws English signage and screens', t => {
  const painted = new Set();
  const noop = () => {};
  const ctx = {fillText: text => painted.add(text)};
  for (const name of ['fillRect','strokeRect','save','restore','translate','scale','beginPath','rect','clip',
    'moveTo','lineTo','stroke','fill','arc','ellipse','closePath']) ctx[name]=noop;
  const previous=globalThis.document;
  globalThis.document={createElement: () => ({getContext: () => ctx})};
  t.after(() => { if(previous===undefined)delete globalThis.document; else globalThis.document=previous; });
  const authored = project.environment;
  const atlas = makeArtAtlas([...authored.fixtures, ...authored.displays.map(row=>({...row,kind:'display'}))]);
  try {
    for (const label of ['EXIT','FIRST AID','EYEWASH','SAFETY GLASSES','FIRE ALARM','FIRE EXTINGUISHER',
      'PRINT ROOM SERVICE','SERVICE / UNIT 27','CALIBRATED · K-04','WEEKLY COFFEE BREAK','CLEANING ROUNDS',
      'CLEANING SCHEDULE','Coffee per meeting','NO SIGNAL']) assert(painted.has(label),label);
    assert(![...painted].some(text=>/[åäöÅÄÖ]|\b(?:FIKA|REPRO|ENHET|REKVISITION)\b/.test(text)));
  } finally { atlas.map.dispose(); }
});

test('only the historical official fixture title is mapped and its original data is retained', () => {
  assert.strictEqual(englishPublishedFixtures(project),project);
  const row=project.environment.fixtures.find(f=>f.id==='ENV-069');
  const legacy={...project,environment:{...project.environment,fixtures:[{...row,title:legacyTitle}]}};
  const restored=englishPublishedFixtures(legacy);
  assert.deepEqual(restored.environment.fixtures[0],{...legacy.environment.fixtures[0],title:'WEEKLY COFFEE BREAK'});
  assert.equal(legacy.environment.fixtures[0].title,legacyTitle);
  const personal={...legacy,projectId:'private-level'};
  assert.strictEqual(englishPublishedFixtures(personal),personal);
  const renamed={...legacy,environment:{...legacy.environment,fixtures:[{...row,title:'Åkes rum'}]}};
  assert.strictEqual(englishPublishedFixtures(renamed),renamed);
});
