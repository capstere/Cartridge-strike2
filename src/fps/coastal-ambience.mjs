// Riposte MAP_DEFS.meltem / MAP_DEFS.embruns and 05c-ambiance ambStart/ambTick.
import {coastalRecordings, coastalClipPath} from './coastal-recordings.mjs';

const spread = (low, high, random) => low + (high - low) * random();
const clamp = (low, high, value) => Math.max(low, Math.min(high, value));
const water = x => Math.max(0, x + 30);
const fixed = (bank, positions, gain, ref, roll, max) => positions.map(position => ({bank, position, gain, ref, roll, max}));
const box = (x, y, z) => (_, random) => [spread(...x, random), spread(...y, random), spread(...z, random)];
const spot = (bank, every, gain, at, ref = 8, roll = 1) => ({bank, every, gain, at, ref, roll, max:400});
const nearPlayer = (p, random) => {
  const angle = random() * Math.PI * 2, d = spread(4, 12, random);
  return [p.x + Math.cos(angle) * d, spread(2, 7, random), p.z + Math.sin(angle) * d];
};

export const coastalMaps = {
  meltem: {
    bedGain:.55, water,
    loops:[
      ...fixed('a_waves', [-36,-12,12,36].map(z => [-31.5,-.4,z]), .4, 5, 1.3, 110),
      ...fixed('a_cicadas', [[40,3,-30],[40,3,30],[-6,3,70],[-6,3,-70]], .3, 8, 1.2, 140),
      ...fixed('a_mill', [[-10,18.2,50.6],[-10,18.2,-50.6]], .22, 5, 1.4, 70),
    ],
    spots:[
      spot('a_gull', [7,18], .4, (p,r) => [spread(-70,-34,r),spread(10,22,r),clamp(-58,58,p.z + spread(-25,25,r))], 10),
      spot('a_bell', [70,160], .3, () => [-39.6,4,0], 14, .8),
      spot('a_goats', [35,80], .25, box([50,90],[4,12],[-60,60]), 10, .9),
      spot('a_gust', [10,24], .35, nearPlayer),
    ],
  },
  embruns: {
    bedGain:.45, water:(x,z) => Math.min(water(x), Math.hypot(Math.max(0,x+18),Math.max(0,Math.abs(z)-11))),
    loops:fixed('a_waves', [[-31.5,-1,38],[-31.5,-1,14],[-31.5,-1,-14],[-31.5,-1,-38],[-24,-1.2,0]], .45, 5, 1.3, 120),
    spots:[
      spot('a_gull', [6,16], .4, box([-80,-20],[8,22],[-55,55]), 10),
      spot('a_rigging', [10,25], .3, box([-37,-30],[3,8],[-40,40]), 6),
      spot('a_creak', [12,30], .3, box([-37,-24],[-.5,1.5],[-40,40]), 5),
      spot('a_buoybell', [25,60], .3, box([-110,-70],[0,0],[-60,60]), 20, .7),
      spot('a_foghorn', [90,200], .4, box([-400,-400],[5,5],[-200,200]), 80, .5),
    ],
  },
};

const decoders = new WeakMap();
function decoderFor(context, coarse) {
  const rate = Math.min(context.sampleRate, coarse ? 24000 : 32000);
  let state = decoders.get(context);
  if (!state) { state = {byRate:new Map(), pending:Promise.resolve()}; decoders.set(context, state); }
  if (!state.byRate.has(rate)) {
    let decoder = context;
    const Offline = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
    if (rate < context.sampleRate && Offline) {
      try { decoder = new Offline(1, 1, rate); } catch { /* Older devices can use their output rate within the same byte budget. */ }
    }
    state.byRate.set(rate, decoder);
  }
  return {state, decoder:state.byRate.get(rate)};
}

// Browser MP3 decoders differ on trimming the encoder's 576/1105 sample lead.
// Match the absolute peak near its known sample from the pack, as in sfxLead.
function startOffset(buffer, length, peak) {
  const scale = buffer.sampleRate / 48000, encodedScale = buffer.sampleRate / 32000;
  if (buffer.length < length * scale + 576 * encodedScale - 64) return 0;
  const data = buffer.getChannelData(0), expected = peak * scale;
  const low = Math.max(0, Math.floor(expected - 200 * scale));
  const high = Math.min(data.length, Math.ceil(expected + 1105 * encodedScale + 400 * scale));
  let strongest = low;
  for (let i = low + 1; i < high; i++) if (Math.abs(data[i]) > Math.abs(data[strongest])) strongest = i;
  const lead = [0, 576 * encodedScale, 1105 * encodedScale].reduce((a,b) => Math.abs(strongest-expected-a) <= Math.abs(strongest-expected-b) ? a : b);
  return buffer.length >= length * scale + lead - 64 ? lead / buffer.sampleRate : 0;
}

export class CoastalAmbience {
  constructor(context, output, mapId, coarse = false, random = Math.random) {
    this.context = context;
    this.output = output;
    this.mapId = mapId;
    this.map = coastalMaps[mapId];
    this.random = random;
    this.abort = new AbortController();
    this.banks = new Map();
    this.voices = new Set();
    this.loops = new Map();
    this.lastTake = new Map();
    this.bytes = 0;
    this.loadErrors = [];
    this.lastUpdate = -Infinity;
    this.timers = this.map.spots.map(({every}) => spread(every[0]*.2, every[1]*.7, random));
    const {state, decoder} = decoderFor(context, coarse);
    // A decode already started on the previous map cannot be aborted by Web Audio.
    // Serializing packs keeps that last allocation and the new pack from overlapping.
    this.ready = state.pending = state.pending.then(() => this.load(decoder, coarse));
  }

  async load(decoder, coarse) {
    const {signal} = this.abort, timings = coastalRecordings[this.mapId];
    const limit = (coarse ? 12 : 17) * 1024 * 1024;
    const ordered = new Set(['a_bed', ...this.map.loops.map(loop => loop.bank), ...Object.keys(timings)]);
    for (const take of ordered) {
      if (signal.aborted) return;
      if (coarse && /-[34]$/.test(take)) continue;
      const [length,peak] = timings[take];
      const seconds = length / 48000;
      const predicted = seconds * decoder.sampleRate * (take === 'a_bed' ? 2 : 1) * 4;
      if (this.bytes + predicted > limit) continue;
      try {
        const url = new URL(`../../${coastalClipPath(this.mapId,take)}`, import.meta.url);
        const response = await fetch(url, {signal});
        if (!response.ok) throw Error(`HTTP ${response.status}`);
        const data = await response.arrayBuffer();
        if (signal.aborted) return;
        const buffer = await decoder.decodeAudioData(data);
        if (signal.aborted) return;
        const bytes = buffer.length * buffer.numberOfChannels * 4;
        if (this.bytes + bytes > limit) continue;
        const bank = take.replace(/-\d+$/, '');
        if (!this.banks.has(bank)) this.banks.set(bank, []);
        const offset = startOffset(buffer, length, peak);
        this.banks.get(bank).push({take, buffer, offset, duration:Math.min(seconds, buffer.duration - offset)});
        this.bytes += bytes;
      } catch (error) {
        if (!signal.aborted) this.loadErrors.push(`${take}: ${error.message}`);
      }
    }
  }

  play(spec, position, loop, inside) {
    const takes = this.banks.get(spec.bank);
    if (!takes?.length) return;
    const last = this.lastTake.get(spec.bank);
    const choices = takes.length < 2 ? takes : takes.filter(t => t !== last);
    const clip = choices[Math.floor(this.random() * choices.length)];
    this.lastTake.set(spec.bank, clip);
    const ctx = this.context, source = ctx.createBufferSource(), gain = ctx.createGain(), filter = ctx.createBiquadFilter();
    source.buffer = clip.buffer; source.loop = loop; filter.type = 'lowpass';
    const panner = position ? ctx.createPanner() : null;
    source.connect(filter);
    if (panner) {
      panner.panningModel = 'equalpower'; panner.distanceModel = 'inverse'; panner.refDistance = spec.ref; panner.rolloffFactor = spec.roll; panner.maxDistance = spec.max;
      panner.setPosition(...position); filter.connect(panner).connect(gain);
      source.playbackRate.value = loop ? spread(.96,1.04,this.random) : spread(.94,1.06,this.random);
    } else filter.connect(gain);
    gain.connect(this.output);
    // The streamed sea bed used to bypass the world hearing bus on this map.
    // Start smoothly even when the first decoded sample arrives mid-match.
    gain.gain.value = loop ? 0 : spec.gain * (1 - .6 * inside);
    if (loop) gain.gain.setTargetAtTime(spec.gain,ctx.currentTime,.25);
    const voice = {source,gain,filter,panner,position,loop,take:clip.take};
    this.voices.add(voice);
    source.onended = () => this.release(voice);
    let start = clip.offset;
    if (loop) {
      source.loopStart = start; source.loopEnd = start + clip.duration;
      start += spread(0,position ? 4 : 20,this.random) % clip.duration;
    }
    source.start(ctx.currentTime,start);
    return voice;
  }

  update(position, world) {
    const now = this.context.currentTime, elapsed = now - this.lastUpdate;
    if (!position || this.abort.signal.aborted || elapsed < .25) return;
    this.lastUpdate = now;
    const inside = world.raycast({x:position.x,y:position.y+.15,z:position.z},{x:0,y:1,z:0},6,{vision:true}) ? 1 : 0;
    if (!this.bed) this.bed = this.play({bank:'a_bed',gain:this.map.bedGain}, null, true, inside);
    if (this.bed) {
      const t = clamp(0,1,(this.map.water(position.x,position.z)-3)/32), far = t*t*(3-2*t);
      this.bed.gain.gain.setTargetAtTime(this.map.bedGain*(1-.45*inside)*(1-.85*far),now,.25);
      this.bed.filter.frequency.setTargetAtTime(Math.min(18000-16900*inside,18000-15500*far),now,.25);
    }
    for (const spec of this.map.loops) {
      if (this.loops.has(spec)) continue;
      const voice = this.play(spec, spec.position, true, inside);
      if (voice) this.loops.set(spec,voice);
    }
    for (const [i,spec] of this.map.spots.entries()) {
      this.timers[i] -= Math.min(.5, elapsed);
      if (this.timers[i] > 0) continue;
      this.timers[i] = spread(...spec.every,this.random);
      // Never accumulate a backlog of overdue calls after a background/foreground transition.
      if (this.voices.size - this.loops.size - Number(!!this.bed) < 3) this.play(spec, spec.at(position,this.random), false, inside);
    }
    for (const voice of this.voices) {
      if (!voice.position) continue;
      const [x,y,z] = voice.position, distance = Math.hypot(position.x-x,position.y-y,position.z-z);
      voice.filter.frequency.setTargetAtTime(18000 * (1400/18000)**Math.min(1,distance/(voice.loop ? 60 : 120)), now, .1);
    }
  }

  release(voice) {
    if (!this.voices.delete(voice)) return;
    voice.source.onended = null;
    voice.source.disconnect(); voice.filter.disconnect(); voice.panner?.disconnect(); voice.gain.disconnect();
  }

  dispose() {
    this.abort.abort();
    for (const voice of this.voices) {
      voice.source.stop();
      this.release(voice);
    }
    this.banks.clear(); this.lastTake.clear(); this.loops.clear(); this.bed = null; this.bytes = 0;
  }
}
