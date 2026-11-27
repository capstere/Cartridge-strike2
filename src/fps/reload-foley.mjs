// Times are fractions of the authoritative reload duration. Start the recording
// early enough for its contact transient to meet the moving part at the socket.
import {WEAPONS} from './config.mjs';

const cue = (at,take,gain,variant='',mechanism=false) => ({
  at,take,gain,emptyOnly:variant==='empty',loadedOnly:variant==='loaded',mechanism
});
// Riposte 06-weapons. Shot cycle markers are in seconds from the visible shot.
// Reload marker fractions preserve the shared authoritative time to refill.
export const SHOT_CYCLES = {
  sniper:cue(.15,'bolt-1',.42,'',true),
  shotgun:cue(.30,'pump-1',.43,'',true)
};
export const PRIMARY_RELOADS = {
  ar47: [cue(.23,'magout_rifle-2',.55), cue(.77,'magin_rifle-2',.36),cue(.78,'charge_rifle-1',.44,'empty',true)],
  cr4: [cue(.25,'magout_rifle-2',.52), cue(.63,'magin_rifle-1',.51), cue(.71,'charge_rifle-2',.48,'empty',true)],
  smg: [cue(.22,'magout_smg',.52), cue(.77,'magin_smg',.31),cue(.77,'charge_rifle-1',.40,'empty',true)],
  shotgun: [cue(.246,'shell-1',.43), cue(.497,'shell-2',.51),
    cue(.747,'shell-1',.43),cue(.893,'shell-3',.51,'loaded'),cue(.82,'shell-3',.51,'empty'),
    cue(.905,'pump-1',.43,'empty',true)],
  sniper: [cue(.25,'magout_rifle-1',.56), cue(.77,'magin_rifle-1',.47,'loaded'),cue(.625,'magin_rifle-1',.47,'empty'),
    cue(.663,'bolt-1',.42,'empty',true)],
  bazooka: [cue(.30,'pickup-2',.44), cue(.756,'stow-2',.50)],
};

export class ReloadFoley {
  constructor() {
    this.buffers = new Map();
    this.voices = new Map();
    this.pending = new Map();
    this.seen = new Set();
  }

  load(audio) {
    const takes = new Set([...Object.values(PRIMARY_RELOADS).flat(),...Object.values(SHOT_CYCLES)].map(cue=>cue.take));
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

  update(audio,previous,time,events=[]) {
    const game=audio.game;
    const audible=!!game && audio.volume>0 && audio.context?.state==='running' && !game.state.paused;
    for(const [key,voice] of this.voices){
      const actor=game?.actors.find(a=>a.id===voice.id);
      if(!audible || !actor?.alive || actor.weapon!==voice.weapon || actor.lifeId!==voice.life ||
         actor.controlEpoch!==voice.epoch || actor.reloadUntil!==voice.reloadUntil ||
         voice.round!==game.state.round || time>=voice.until){
        voice.source.stop();this.voices.delete(key);
      }
    }
    if(!audible || !Number.isFinite(previous) || time<previous){
      this.pending.clear();
      return;
    }
    for(const event of events){
      const {type,actorId,weapon}=event;
      if(type==='switch' || type==='death' || type==='reload'){
        this.pending.delete(actorId);
        for(const [key,voice] of this.voices)if(voice.id===actorId){
          voice.source.stop();this.voices.delete(key);
        }
      }
      const marker=SHOT_CYCLES[weapon];
      if(type!=='shot' || !marker || (Number.isFinite(event.time) && (time-event.time>.4 || event.time-time>.1)))continue;
      const key=event.actionId || event.eventId || event.serial;
      if(key!=null){
        if(this.seen.has(key))continue;
        this.seen.add(key);if(this.seen.size>256)this.seen.delete(this.seen.values().next().value);
      }
      const actor=game?.actors.find(a=>a.id===actorId);
      if(actor?.alive && actor.weapon===weapon && !actor.reloadUntil)this.pending.set(actorId,{
        weapon,marker,life:actor.lifeId,epoch:actor.controlEpoch,round:game.state.round,at:time+marker.at
      });
    }
    for(const [id,pending] of this.pending){
      const actor=game.actors.find(a=>a.id===id);
      if(!actor?.alive || actor.weapon!==pending.weapon || actor.lifeId!==pending.life || actor.reloadUntil ||
         actor.controlEpoch!==pending.epoch || pending.round!==game.state.round || game.phase!=='active'){
        this.pending.delete(id);
      }else if(time+1e-8>=pending.at){
        this.pending.delete(id);
        if(time-pending.at<=.12)this.play(audio,actor,pending.marker,.95);
      }
    }
    if(time===previous)return;
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
        const empty=actor.inventory?.primary?.ammo===0;
        if ((cue.emptyOnly && !empty) || (cue.loadedOnly && empty)) continue;
        this.play(audio,actor,cue,actor.reloadUntil-time);
      }
    }
  }

  reset(){
    // AudioSystem.reset stops all tracked Web Audio sources.
    this.voices.clear();this.pending.clear();this.seen.clear();
  }

  play(audio,actor,cue,remaining) {
    const buffer = this.buffers.get(cue.take);
    if (!buffer || audio.active.size>=94) return;
    // Magazine and mechanism recordings overlap briefly at the final contact.
    // Network presentation replaces actor records on every snapshot.
    const key=actor.id+'/'+(cue.mechanism?'action':'magazine');
    const old = this.voices.get(key);
    if (old) old.source.stop();
    const source = audio.context.createBufferSource();
    source.buffer = buffer;
    const channel = audio.channel({type:'reload',actorId:actor.id,x:actor.x,y:actor.y,z:actor.z},cue.gain);
    source.connect(channel.gain);
    const length = Math.min(buffer.duration,remaining);
    channel.gain.gain.setValueAtTime(channel.gain.gain.value,channel.when+Math.max(0,length-.008));
    channel.gain.gain.linearRampToValueAtTime(0,channel.when+length);
    audio.track(source,channel,length);
    this.voices.set(key,{source,id:actor.id,weapon:actor.weapon,life:actor.lifeId,epoch:actor.controlEpoch,
      round:audio.game.state.round,reloadUntil:actor.reloadUntil,until:audio.game.state.time+remaining});
    const ended = source.onended;
    source.onended = () => {
      if (this.voices.get(key)?.source===source) this.voices.delete(key);
      ended();
    };
    audio.stats.played++;
  }
}
