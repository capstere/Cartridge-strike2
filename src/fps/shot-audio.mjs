// Adapted from Riposte 05-audio.js (GUN_CLS, GUN_NEAR, gunShot) and
// 05a-sfx.js (sfxLead). Third-person range is measured in world metres.
const banks = Object.freeze({
  p9: 'glock', p12: 'pistol', cr4: 'rifle', ar47: 'ak',
  smg: 'smg', shotgun: 'shotgun', sniper: 'sniper',
});
const families = Object.freeze({
  glock: 'pistol', pistol: 'pistol', rifle: 'rifle', ak: 'rifle',
  smg: 'smg', shotgun: 'shotgun', sniper: 'sniper',
});
const nearBanks = Object.values(banks).flatMap(name => [`g_${name}_pov`, `g_${name}_near`]);
const farBanks = [...new Set(Object.values(families))].map(name => `g_far_${name}`);
export const firstShotTakes = [...nearBanks, ...farBanks].map(bank => `${bank}-1`);
export const shotTakes = [...firstShotTakes, ...[...nearBanks, ...farBanks].map(bank => `${bank}-2`)];

export function shotSound(event, listener, listenerId) {
  const weapon = banks[event.weapon];
  if (!Object.hasOwn(banks,event.weapon) || !listener) return null;
  if (event.actorId != null && event.actorId === listenerId) return {bank:`g_${weapon}_pov`, delay:0, gain:.55};
  const pos = event.position || event;
  const distance = Math.hypot((pos.x || 0) - listener.x, (pos.y || 0) - listener.y, (pos.z || 0) - listener.z);
  const bank = distance < 40 ? `g_${weapon}_near` : `g_far_${families[weapon]}`;
  return {bank, delay:Math.min(distance / 343, .5), gain:.42};
}

// Some MP3 decoders keep a short encoder delay. Locate the measured attack in
// its expected window before skipping samples. An already-trimmed clip starts at zero.
export function decoderLead(buffer, [length, peak]) {
  const scale = buffer.sampleRate / 48000;
  const expected = peak * scale, samples = buffer.getChannelData(0);
  const lo = Math.max(0, Math.floor(expected - 200 * scale));
  const hi = Math.min(samples.length, Math.ceil(expected + 1505 * scale));
  let loudest = lo;
  for (let i = lo + 1; i < hi; i++) {
    if (Math.abs(samples[i]) > Math.abs(samples[loudest])) loudest = i;
  }
  const leads = [0, 576 * scale, 1105 * scale];
  const lead = leads.reduce((a,b) => Math.abs(loudest-expected-a) <= Math.abs(loudest-expected-b) ? a : b);
  return buffer.length >= length * scale + lead - 64 ? lead / buffer.sampleRate : 0;
}
