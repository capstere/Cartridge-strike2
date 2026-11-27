import test from 'node:test';
import assert from 'node:assert/strict';
import {initialScreen, parentScreenURL} from './menu-navigation.mjs';
import {selectedMapName} from './english-ui.mjs';

const url = query => new URL('https://example.test/game/fps/' + query);

test('fresh visitors start at Main and established match links still open setup', () => {
  for (const query of ['', '?test', '?screen=unknown']) assert.equal(initialScreen(url(query)), 'main', query);
  for (const key of ['team','seed','level','avatar','character']) {
    assert.equal(initialScreen(url('?' + key + '=saved')), 'solo', key);
  }
  for (const screen of ['play','friends','maps','news','options','profile','classes','outfits','solo']) {
    assert.equal(initialScreen(url('?screen=' + screen)), screen, screen);
  }
});

test('private entry survives its options round trip', () => {
  for (const network of ['internet','local','lan']) {
    assert.equal(initialScreen(url('?network=' + network)), 'network');
    const direct = url('?network=' + network + '&room=opaque-room&family=JESPERS-ROOM&screen=options');
    assert.equal(initialScreen(direct), 'options');
    const previous = parentScreenURL(direct, 'options');
    assert.equal(initialScreen(previous), 'network');
    assert.equal(previous.searchParams.has('screen'),false);
    assert.equal(previous.searchParams.get('network'),network);
    assert.equal(previous.searchParams.get('room'),'opaque-room');
    assert.equal(previous.searchParams.get('family'),'JESPERS-ROOM');
  }
});

test('map names use the supplied identity, including saved player names verbatim', () => {
  assert.equal(selectedMapName(url('').searchParams), 'Floor 5 Laboratory');
  assert.equal(selectedMapName(url('?level=synthetic-demo').searchParams), 'Training fixture');
  assert.equal(selectedMapName(url('?level=local').searchParams), 'Selected map');
  assert.equal(selectedMapName(url('?level=local').searchParams, 'My Floor #2'), 'My Floor #2');
});
