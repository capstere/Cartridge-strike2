/** Locally generated radio recordings + simulation-synchronised mechanical Foley. */
import {AudioSystem as BaseAudio} from './audio.mjs';
import {RADIO} from './action-rules.mjs';
import {PRIMARY_RELOADS,ReloadFoley} from './reload-foley.mjs';
import {FloorAudio} from './floor-audio.mjs';
export class AudioSystem extends BaseAudio{
 constructor(world,settings){super(world,settings);this.voiceBuffers=new Map();this.reloadFoley=new ReloadFoley();this.voicePromise=null;this.floorAudio=new FloorAudio();}
 async prepareFloorAudio(){
  try{if(this.initializeContext())await this.floorAudio.load(this);}
  catch(e){this.errors.push('Floor audio: '+e.message);}
 }
 async unlock(){
  const ok=await super.unlock();if(!ok)return false;
  this.voicePromise??=Promise.all([...RADIO.map(r=>r.id),'death'].map(async id=>{
   try{const response=await fetch(new URL(`../../assets/fps/audio/action-${id}.ogg`,import.meta.url));if(!response.ok)throw Error(`HTTP ${response.status}`);const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.voiceBuffers.set(id,buffer);}
   catch(e){this.errors.push(`action-${id}: ${e.message}`);}
  }));await Promise.all([this.voicePromise,this.reloadFoley.load(this),this.floorAudio.load(this)]);return true;
 }
 play(event){
  if(event.type==='radio'){
   if(this.settings.radioVoice===false||event.team!==this.game?.team)return;
   const e={...event,actorId:this.listenerId};this.tone(e,1850,.025,.07,'sine');this.noise(e,.045,.04,2800);
   const buffer=this.voiceBuffers.get(event.command);if(buffer){const source=this.context.createBufferSource();source.buffer=buffer;const channel=this.channel(e,.5,.07);source.connect(channel.gain);this.track(source,channel,Math.min(3.4,buffer.duration));this.stats.played++;}
   this.tone(e,1550,.04,.04,'sine',1000,.12+(buffer?.duration||.25));return;
  }
  if(event.type==='reload' && PRIMARY_RELOADS[event.weapon])return;
  if(event.type==='kill'){
   const own=event.actorId===this.game?.player?.id,e=own?{...event,actorId:this.listenerId}:event;
   const buffer=this.voiceBuffers.get('death');if(buffer){const source=this.context.createBufferSource();source.buffer=buffer;source.playbackRate.value=.9+((event.serial||0)%3)*.07;const c=this.channel(e,own?.55:.3);source.connect(c.gain);this.track(source,c,Math.min(1.1,buffer.duration));}
   this.sample('impactSoft_medium_000',e,.55,.65,.13,.5);this.noise(e,.22,.12,850,.04);return;
  }
  if(event.type==='rocket-launch'){this.noise(event,.48,.5,2300);this.tone(event,105,.5,.36,'sawtooth',36);return;}
  if(event.type==='shot'&&event.weapon==='bazooka')return;
  if(event.type==='rocket-explosion'){super.play({...event,type:'he'});this.noise(event,.65,.3,1100,.05);return;}
  if(event.type==='respawn'&&event.actorId===this.game?.player?.id){this.tone({...event,actorId:this.listenerId},420,.14,.10,'sine',840);return;}
  super.play(event);
 }
 handle(events,listener,time){
  const previous=this.lastSimTime;
  super.handle(events,listener,time);
  this.floorAudio.update(this,events,listener?.floorAudioReady);
  this.reloadFoley.update(this,previous,time);
 }
 reset(){super.reset();this.floorAudio?.reset();this.reloadFoley?.voices.clear();}
 async dispose(){this.floorAudio.buffers.clear();this.reloadFoley.buffers.clear();this.voiceBuffers.clear();await super.dispose();}
}
