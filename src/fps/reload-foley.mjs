// Times are fractions of the authoritative reload duration. Start the recording
// early enough for its contact transient to meet the moving part at the socket.
import {WEAPONS} from './config.mjs';

const cue = (at, take, gain, emptyOnly=false) => ({at,take,gain,emptyOnly});
export const PRIMARY_RELOADS = {
  ar47: [cue(.23,'magout_rifle-2',.55), cue(.77,'magin_rifle-2',.36)],
  cr4: [cue(.25,'magout_rifle-2',.52), cue(.63,'magin_rifle-1',.51), cue(.71,'charge_rifle-2',.48,true)],
  smg: [cue(.22,'magout_smg',.52), cue(.77,'magin_smg',.31)],
  shotgun: [cue(.246,'shell-1',.43), cue(.497,'shell-2',.51),
    cue(.747,'shell-1',.43), cue(.893,'shell-3',.51)],
  sniper: [cue(.25,'magout_rifle-1',.56), cue(.77,'magin_rifle-1',.47)],
  bazooka: [cue(.30,'pickup-2',.44), cue(.756,'stow-2',.50)],
};

export class ReloadFoley {
  constructor() {
    this.buffers = new Map();
    this.voices = new Map();
  }

  load(audio) {
    const takes = new Set(Object.values(PRIMARY_RELOADS).flat().map(cue=>cue.take));
    this.loading ??= Promise.all([...takes].map(async take=>{
      try {
        const url = new URL('../../assets/fps/audio/ffsl-f_'+take+'.mp3',import.meta.url);
        const response = await fetch(url);
        if (!response.ok) throw Error('HTTP '+response.status);
        const buffer = await audio.context.decodeAudioData(await response.arrayBuffer());
        if (!audio.disposed) this.buffers.set(take,buffer);
      } catch (e) {
        if (!audio.disposed) audio.errors.push('Reload '+take+': '+e.message);
      }
    }));
    return this.loading;
  }

  update(audio,previous,time) {
    const audible = audio.volume>0 && audio.context?.state==='running' && !audio.game?.state.paused;
    for (const [actor,voice] of this.voices) {
      if (!audible || !actor.alive || actor.weapon!==voice.weapon ||
          actor.reloadUntil!==voice.until || time>=voice.until) {
        voice.source.stop();
        this.voices.delete(actor);
      }
    }
    if (!audible || !Number.isFinite(previous) || time<=previous) return;
    for (const actor of audio.game?.actors || []) {
      if (!actor.alive || !(actor.reloadUntil>time)) continue;
      const cues = PRIMARY_RELOADS[actor.weapon];
      if (!cues) continue;
      const duration = WEAPONS[actor.weapon].reload;
      const start = actor.reloadUntil-duration;
      for (const cue of cues) {
        const at = start+cue.at*duration;
        // Crossing an animation marker owns one sound. Discard missed markers
        // after a stall, mute, tab switch or suspended context.
        if (at<=previous || at>time || time-at>.12) continue;
        if (cue.emptyOnly && actor.inventory.primary?.ammo!==0) continue;
        this.play(audio,actor,cue,actor.reloadUntil-time);
      }
    }
  }

  play(audio,actor,cue,remaining) {
    const buffer = this.buffers.get(cue.take);
    if (!buffer || audio.active.size>=94) return;
    const old = this.voices.get(actor);
    if (old) old.source.stop();
    const source = audio.context.createBufferSource();
    source.buffer = buffer;
    const channel = audio.channel({type:'reload',actorId:actor.id,x:actor.x,y:actor.y,z:actor.z},cue.gain);
    source.connect(channel.gain);
    const length = Math.min(buffer.duration,remaining);
    channel.gain.gain.setValueAtTime(channel.gain.gain.value,channel.when+Math.max(0,length-.008));
    channel.gain.gain.linearRampToValueAtTime(0,channel.when+length);
    audio.track(source,channel,length);
    this.voices.set(actor,{source,weapon:actor.weapon,until:actor.reloadUntil});
    const ended = source.onended;
    source.onended = () => {
      if (this.voices.get(actor)?.source===source) this.voices.delete(actor);
      ended();
    };
    audio.stats.played++;
  }
}
