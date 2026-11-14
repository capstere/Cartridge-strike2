import test from 'node:test';
import assert from 'node:assert/strict';
import { createFullscreenController } from './fullscreen.mjs';

function fakeFullscreen() {
  let requested = 0, exited = 0;
  const doc = { fullscreenElement: null };
  doc.documentElement = { requestFullscreen() {
    requested++;
    doc.fullscreenElement = doc.documentElement;
    return Promise.resolve();
  } };
  doc.exitFullscreen = () => { exited++; doc.fullscreenElement = null; return Promise.resolve(); };
  return { doc, calls: () => ({ requested, exited }) };
}

test('Start requests fullscreen once, resume does not repeat it, lobby exits', () => {
  const {doc,calls} = fakeFullscreen();
  const fullscreen = createFullscreenController(doc);
  assert.equal(fullscreen.supported, true);
  assert.equal(fullscreen.start(), true);
  assert.equal(fullscreen.active, true);
  assert.equal(fullscreen.resume(), false);
  assert.deepEqual(calls(), {requested: 1, exited: 0});
  assert.equal(fullscreen.exit(), true);
  assert.equal(fullscreen.active, false);
  assert.deepEqual(calls(), {requested: 1, exited: 1});
});

test('Manual exit stays windowed on resume, next match defaults to fullscreen', () => {
  const {doc,calls} = fakeFullscreen();
  const fullscreen = createFullscreenController(doc);
  fullscreen.start();
  assert.equal(fullscreen.toggle(), true);
  assert.equal(fullscreen.preferred, false);
  assert.equal(fullscreen.resume(), false);
  assert.deepEqual(calls(), {requested: 1, exited: 1});
  assert.equal(fullscreen.start(), true);
  assert.deepEqual(calls(), {requested: 2, exited: 1});
});

test('Unsupported browser falls back without throwing or blocking gameplay', () => {
  const fullscreen = createFullscreenController({documentElement: {}, fullscreenElement: null});
  assert.equal(fullscreen.supported, false);
  assert.equal(fullscreen.start(), false);
  assert.equal(fullscreen.resume(), false);
  assert.equal(fullscreen.toggle(), false);
  assert.equal(fullscreen.exit(), false);
});

test('Synchronous fullscreen exceptions are harmless', () => {
  const doc = {documentElement: {requestFullscreen() {throw Error('denied');}},fullscreenElement:null};
  const fullscreen = createFullscreenController(doc);
  assert.equal(fullscreen.start(), false);
});

test('Promise rejections are handled and do not break start or retry', async () => {
  const doc = {documentElement: {requestFullscreen() {return Promise.reject(Error('denied'));}},fullscreenElement:null};
  const fullscreen = createFullscreenController(doc);
  assert.equal(fullscreen.start(), true);
  assert.equal(fullscreen.resume(), true);
  await Promise.resolve();
});
