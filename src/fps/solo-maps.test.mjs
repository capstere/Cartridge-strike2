import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {soloCatalog,resolveSoloSelection,soloMapURL} from './solo-maps.mjs';

const original = JSON.parse(readFileSync(new URL('../../levels/manifest.json',import.meta.url),'utf8'));
const entries = original.levels.filter(entry => entry.id !== 'meltem');
const manifest = {...original, levels:[...entries,
  {id:'meltem',file:'levels/meltem.json',name:'Meltem',modes:['endless']},
  {id:'unqualified',file:'levels/unqualified.json',name:'Prototype'},
  {id:'bad-file',file:'levels/unrelated.json',modes:['classic']},
]};
const select = (q, preference) => resolveSoloSelection(manifest, new URLSearchParams(q), preference);

test('approved Solo rows preserve existing Floor 5 and exclude test, room-only and unqualified files', () => {
  const catalog = soloCatalog(manifest);
  assert.ok(catalog.find(entry=>entry.id==='floor5-prepared').modes.includes('classic'));
  assert.deepEqual(catalog.find(entry=>entry.id==='meltem').modes,['endless']);
  for (const id of ['compact-arena','synthetic-demo','unqualified','bad-file','preview']) assert.ok(!catalog.some(entry=>entry.id===id));
  assert.ok(!catalog.some(entry=>entry.random && entry.id==='meltem' && entry.modes.includes('classic')));
});

test('eligibility for Random is separate from appearing in the picker', () => {
  const candidate = soloCatalog(manifest).find(entry=>entry.id==='meltem');
  assert.equal(candidate.random,false);
  const release = {...manifest,levels:manifest.levels.map(row => row.id === 'meltem' ? {...row, randomEligible:true} : row)};
  const random = soloCatalog(release).filter(entry=>entry.random);
  assert.ok(random.some(entry=>entry.id==='meltem' && entry.modes.includes('endless')));
  assert.ok(!random.some(entry=>entry.id==='meltem' && entry.modes.includes('classic')));
  assert.ok(random.some(entry=>entry.id==='floor5-prepared'));
});

test('private previews are selectable only on this device and excluded from Random', () => {
  const preview = soloCatalog(manifest,true).find(entry=>entry.id==='preview');
  assert.ok(preview);
  assert.ok(!preview.random);
  assert.equal(select('level=preview','endless').mode,'endless');
  assert.equal(select('level=classic-floor5').id,'classic-floor5');
  assert.equal(select('level=synthetic-demo').file,'levels/synthetic-demo.json');
});

test('the map owns its mode constraints and an unsupported explicit combination resolves before loading', () => {
  assert.equal(select('level=meltem','classic').mode,'endless');
  const unsupported = select('level=meltem&mode=classic','endless');
  assert.equal(unsupported.id,'floor5-prepared');
  assert.equal(unsupported.mode,'classic');
  assert.match(unsupported.notice,/Meltem.*does not support/);
  for (const id of ['compact-arena','unqualified','missing']) {
    assert.equal(select('level='+id).id,'floor5-prepared');
    assert.match(select('level='+id).notice,/unavailable in Solo/);
  }
});

test('map changes keep local character, team, seed, deployment subpath and other entry information', () => {
  const url = soloMapURL('https://example.test/game/fps/?screen=maps&avatar=private&id=xxx#entry',
    select('level=meltem'),{team:'counterAnalysts',seed:142});
  assert.equal(url.pathname,'/game/fps/');
  assert.equal(url.hash,'#entry');
  assert.deepEqual(Object.fromEntries(url.searchParams),{screen:'solo',avatar:'private',id:'xxx',level:'meltem',mode:'endless',team:'counterAnalysts',seed:'142'});
});
