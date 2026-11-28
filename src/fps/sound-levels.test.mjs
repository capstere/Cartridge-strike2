import assert from 'node:assert/strict';
import test from 'node:test';
import {soundLevels} from './sound-levels.mjs';
import {AudioSystem} from './audio.mjs';

test('old settings keep their master and new categories start at full gain', () => {
  assert.deepEqual(soundLevels(), {master:.55, menuMusic:.55, announcements:1});
  assert.deepEqual(soundLevels({volume:'0.3'}), {master:.3, menuMusic:.3, announcements:1});
  assert.deepEqual(soundLevels({volume:.5, menuMusicVolume:.4, announcementVolume:0}),
    {master:.5, menuMusic:.2, announcements:0});
  assert.deepEqual(soundLevels({volume:0, menuMusicVolume:1, announcementVolume:2}),
    {master:0, menuMusic:0, announcements:1});
});

test('radio and round reports can be muted independently while gunfire still reaches the master', () => {
  function node() {
    return {
      gain:{setTargetAtTime(value){ this.value=value; }},
      frequency:{},
      connect(destination){ this.output=destination; return destination; },
    };
  }
  const settings = {volume:.6, menuMusicVolume:.8, announcementVolume:1};
  const audio = new AudioSystem(null, settings);
  audio.context = {currentTime:12, createGain:node, createBiquadFilter:node};
  audio.master=node();
  audio.announcements=node();
  audio.listenerId='local';
  for (const type of ['radio','round','match','result','shot']) {
    const channel=audio.channel({type, actorId:'local'});
    assert.equal(channel.nodes[1].output, type==='shot' ? audio.master : audio.announcements, type);
  }
  settings.announcementVolume=0;
  audio.setVolume(.6);
  assert.equal(audio.announcements.gain.value,0);
  assert.equal(audio.master.gain.value,.6);
  assert.equal(soundLevels(settings).menuMusic,.48);
});
