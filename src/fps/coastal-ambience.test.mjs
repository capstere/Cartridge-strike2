import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {coastalMaps} from './coastal-ambience.mjs';
import {coastalRecordings, coastalClipPath} from './coastal-recordings.mjs';

const root = new URL('../../', import.meta.url);
const read = name => readFileSync(new URL(name,root));
const credits = JSON.parse(read('docs/cartridge-strike-3/maps/audio/takes.json'));

test('all 26 coastal takes match the original MP3s, duration, peak and credited recordings', () => {
  const sourceCredits = JSON.parse(read('frontline/source/assets/sfx/credits.json'));
  assert.equal(credits.takes.length,26);
  for (const [id, takes] of Object.entries(coastalRecordings)) {
    const pack = 'amb_'+id, files = credits.takes.filter(c => c.map === id);
    assert.deepEqual(takes,JSON.parse(read(`frontline/source/assets/sfx/${pack}/meta.json`)).s);
    assert.deepEqual(files.map(f => f.take).sort(), Object.keys(takes).sort());
    const def = coastalMaps[id];
    assert.deepEqual(new Set(Object.keys(takes).map(take => take.replace(/-\d+$/,''))),new Set(['a_bed',...[...def.loops,...def.spots].map(v=>v.bank)]));
    for (const f of files) {
      assert.equal(f.file,coastalClipPath(id,f.take));
      const bytes = read(f.file);
      assert.equal(bytes.length,f.bytes);
      assert.equal(createHash('sha256').update(bytes).digest('hex'),f.sha256);
      assert.deepEqual(bytes,read(f.donor));
      assert.deepEqual(f.sources.map(s=>[s.source,s.originalFile]), sourceCredits.sons.filter(s => s.pack===pack && s.id===f.take).map(s=>[s.source,s.fichier]));
      for (const s of f.sources) assert.equal(credits.sources[s.source].license,'CC0 1.0');
    }
  }
});

test('Meltem and Kervénec follow their own authored shoreline and source positions', () => {
  const {meltem,embruns} = coastalMaps;
  assert.equal(meltem.water(-35,35),0);
  assert.equal(meltem.water(-18,0),12);
  assert.equal(embruns.water(-18,0),0);
  assert.equal(embruns.water(-14,14),5);
  assert.equal(embruns.water(-22,22),8);
  assert.deepEqual(meltem.loops.filter(s=>s.bank==='a_mill').map(s=>s.position),[[-10,18.2,50.6],[-10,18.2,-50.6]]);
  assert.deepEqual(meltem.spots.find(s=>s.bank==='a_bell').at(),[-39.6,4,0]);
  assert.equal(meltem.loops.length,10); assert.equal(embruns.loops.length,5);
  assert.deepEqual(embruns.loops.at(-1).position,[-24,-1.2,0]);
});
