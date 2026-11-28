// Riposte amb_tephra/meta.json measures duration and peak in 48 kHz samples.
export const tephraRecordings = {
  'a_bed': [1296000, 6637],
  'a_boom-1': [576000, 37784],
  'a_boom-2': [511614, 36282],
  'a_bubble': [384000, 12664],
  'a_gust-1': [188822, 63106],
  'a_gust-2': [188022, 52449],
  'a_hum': [480000, 12067],
  'a_steam': [576000, 81683],
  'a_thunder-1': [288000, 28396],
  'a_thunder-2': [288000, 23724],
};

// tephraLightning schedules one sound for the start of a bolt, including a double flash.
// Only an active, audible match can subscribe. A departed world has no receiver.
const listeners = new WeakMap();
export function emitTephraLightning(world, delaySeconds) {
  if (Number.isFinite(delaySeconds) && delaySeconds >= 1.5 && delaySeconds <= 4) {
    listeners.get(world)?.(delaySeconds);
  }
}

function listen(world, ambience) {
  const thunder = {bank:'a_thunder', gain:.7, ref:240, roll:.3, max:400, air:90, rate:[.92,1.05], weather:true};
  const onLightning = delay => {
    // Source duration ≤6 s, shortest bolt interval 3 s and maximum delay 4 s.
    const weatherVoices = ambience.voices.size - ambience.loops.size - Number(!!ambience.bed) - ambience.spotVoices;
    if (weatherVoices < 4) ambience.play(thunder, [-290,320,0], false, 0, delay);
  };
  listeners.set(world,onLightning);
  return () => { if (listeners.get(world) === onLightning) listeners.delete(world); };
}

export function tephraSoundscape(fixed, spot, nearPlayer) {
  return {
    recordings:tephraRecordings, bedGain:.5, listen,
    loops:[
      ...fixed('a_steam', [[-23.6,5.2,30],[-23.6,5.2,-30]], .4, 6, 1.4, 160),
      ...fixed('a_bubble', [[-18.2,.3,4.9],[-11,.3,-5],[-24.6,.3,-5.6],[-8.8,.3,6.2]], .3, 3, 1.5, 60),
      ...fixed('a_hum', [[23,2.5,0]], .3, 7, 1.6, 90),
    ],
    spots:[
      spot('a_boom', [18,40], 1, () => [-290,150,0], 220, .25),
      spot('a_gust', [9,22], .35, nearPlayer),
    ],
  };
}
