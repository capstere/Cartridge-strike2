import assert from 'node:assert/strict';
import test from 'node:test';
import {OUTFITS, CHALLENGE_OUTFITS, readOutfit, saveOutfit} from './operator-outfits.mjs';

test('issued uniforms survive existing, invalid and unavailable storage', () => {
  assert.equal(readOutfit(null).id, 'issued');
  const storage = new Map();
  const api = {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value)};
  assert.equal(readOutfit(api).id, 'issued');
  for (const outfit of OUTFITS) {
    assert.equal(saveOutfit(outfit.id, api), outfit);
    assert.equal(readOutfit(api), outfit);
  }
  for (const [locked] of CHALLENGE_OUTFITS) assert.throws(() => saveOutfit(locked, api));
  assert.equal(readOutfit({getItem: () => 'unknown'}).id, 'issued');
});
