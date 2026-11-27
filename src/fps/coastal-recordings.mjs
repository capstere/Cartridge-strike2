// Authored duration and first peak, measured in 48 kHz samples by Riposte.
// Packed MP3 files use 32 kHz. See docs/cartridge-strike-3/maps/audio/takes.json.
export const coastalRecordings = {
  meltem: {
    'a_bed': [1296000, 40287],
    'a_bell': [287530, 19157],
    'a_cicadas': [480000, 74407],
    'a_goats-1': [233449, 31157],
    'a_goats-2': [233356, 35231],
    'a_gull-1': [144000, 10661],
    'a_gull-2': [144000, 10782],
    'a_gull-3': [144000, 10972],
    'a_gull-4': [144000, 13561],
    'a_gust-1': [186611, 91640],
    'a_gust-2': [188972, 70654],
    'a_mill': [768000, 71130],
    'a_waves': [576000, 48769],
  },
  embruns: {
    'a_bed': [1296000, 58058],
    'a_buoybell-1': [288000, 534],
    'a_buoybell-2': [288000, 494],
    'a_creak-1': [161332, 78755],
    'a_creak-2': [192000, 22733],
    'a_foghorn': [251105, 62556],
    'a_gull-1': [240382, 8111],
    'a_gull-2': [245420, 91487],
    'a_gull-3': [288000, 82083],
    'a_gull-4': [259862, 81508],
    'a_rigging-1': [165353, 114],
    'a_rigging-2': [164638, 105],
    'a_waves': [288000, 77761],
  },
};

export function coastalClipPath(mapId, take) {
  const file = mapId === 'meltem' && take === 'a_bed' ? 'sea.mp3' : `audio/${take}.mp3`;
  return `assets/fps/maps/${mapId}/${file}`;
}
