import assert from 'node:assert/strict';
import test from 'node:test';
import {BONUSES,createBonusState} from './bonuses.mjs';
import {BONUS_KEYS,BONUS_PAD,bonusBindings,bonusPresentation} from './bonus-hud.mjs';
import {GamepadControls} from './gamepad-controls.mjs';

test('bonus labels distinguish locked, charged, spent and active at fixed ticks', () => {
  const state = createBonusState(), uav = BONUSES[0];
  state.progress = 2;
  assert.deepEqual(bonusPresentation(state,uav,40),['locked','2/3']);
  state.earnedMask = 1;
  assert.deepEqual(bonusPresentation(state,uav,40),['spent','Used']);
  state.charges.uav = 1;
  assert.deepEqual(bonusPresentation(state,uav,40),['ready','Ready']);
  state.charges.uav = 0;
  state.active = {id:'uav',startTick:40,endTick:940};
  assert.deepEqual(bonusPresentation(state,uav,40),['active','15 s']);
  assert.deepEqual(bonusPresentation(state,uav,939),['active','1 s']);
  assert.deepEqual(bonusPresentation(state,uav,940),['spent','Used']);
});
test('stored bindings cannot duplicate a weapon, radio, inspect or another bonus', () => {
  for (const invalid of [null,['KeyZ','Digit1','KeyH'],['KeyH','KeyJ','KeyJ']]) {
    assert.deepEqual(bonusBindings(invalid,BONUS_KEYS),['KeyH','KeyJ','KeyK']);
  }
  assert.deepEqual(bonusBindings(['KeyP','KeyO','KeyH'],BONUS_KEYS),['KeyP','KeyO','KeyH']);
  assert.deepEqual(bonusBindings([14,13,12],BONUS_PAD),[12,15,13]);
  const pad = new GamepadControls();
  const device = {id:'controller',axes:[0,0,0,0],buttons:Array.from({length:17},()=>({pressed:false,value:0}))};
  pad.sample(device);
  device.buttons[12].pressed = true;
  assert.equal(pad.sample(device).pressedEdges,1 << 12);
  assert.equal(pad.sample(device).pressedEdges,0);
  pad.clear();
  assert.equal(pad.sample(device),null);
});
