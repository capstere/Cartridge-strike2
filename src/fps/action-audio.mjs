/** Locally generated radio recordings + simulation-synchronised mechanical Foley. */
import {AudioSystem as BaseAudio} from './audio.mjs';
import {RADIO} from './action-rules.mjs';
export class AudioSystem extends BaseAudio{
 constructor(world,settings){super(world,settings);this.voiceBuffers=new Map();this.reloads=new Map();this.voicePromise=null;}
 async unlock(){
  const ok=await super.unlock();if(!ok)return false;
  this.voicePromise??=Promise.all([...RADIO.map(r=>r.id),'death'].map(async id=>{
   try{const response=await fetch(new URL(`../../assets/fps/audio/action-${id}.ogg`,import.meta.url));if(!response.ok)throw Error(`HTTP ${response.status}`);const buffer=await this.context.decodeAudioData(await response.arrayBuffer());if(!this.disposed)this.voiceBuffers.set(id,buffer);}
   catch(e){this.errors.push(`action-${id}: ${e.message}`);}
  }));await this.voicePromise;return true;
 }
 play(event){
  if(event.type==='radio'){
   if(this.settings.radioVoice===false||event.team!==this.game?.team)return;
   const e={...event,actorId:this.listenerId};this.tone(e,1850,.025,.07,'sine');this.noise(e,.045,.04,2800);
   const buffer=this.voiceBuffers.get(event.command);if(buffer){const source=this.context.createBufferSource();source.buffer=buffer;const channel=this.channel(e,.5,.07);source.connect(channel.gain);this.track(source,channel,Math.min(3.4,buffer.duration));this.stats.played++;}
   this.tone(e,1550,.04,.04,'sine',1000,.12+(buffer?.duration||.25));return;
  }
  if(event.type==='reload'){
   this.reloads.set(event.actorId,{event:{...event},at:event.time,duration:event.duration||2,stage:0});return;
  }
  if(event.type==='kill'){
   this.reloads.delete(event.actorId);const own=event.actorId===this.game?.player?.id,e=own?{...event,actorId:this.listenerId}:event;
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
  super.handle(events,listener,time);
  if(!this.context||this.context.state!=='running'||this.volume===0)return;
  for(const[id,r]of this.reloads){
   const a=this.game?.actors.find(a=>a.id===id);
   if(!a?.alive||a.weapon!==r.event.weapon||!a.reloadUntil||Math.abs(a.reloadUntil-(r.at+r.duration))>.03){this.reloads.delete(id);continue;}
   const f=(time-r.at)/r.duration,stages=[0,.27,.65,.88];
   while(r.stage<stages.length&&f>=stages[r.stage]){
    const i=r.stage++,rocket=r.event.weapon==='bazooka',shotgun=r.event.weapon==='shotgun';
    this.sample(i===2?'impactMetal_medium_000':i===1?'impactMetal_light_001':'impactMetal_light_000',r.event,[.32,.22,.4,.3][i],rocket?.64:shotgun?.9:[1.05,.82,.9,1.5][i],0,.18);
    this.noise(r.event,i===1?.14:.04,i===1?.09:.035,i===1?1800:5700);
    if(i===2)this.tone(r.event,rocket?95:260,.08,.07,'triangle',60);
   }
   if(r.stage===4)this.reloads.delete(id);
  }
 }
 reset(){super.reset();this.reloads?.clear();}
 async dispose(){this.voiceBuffers.clear();await super.dispose();}
}
