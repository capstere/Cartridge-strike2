/** Strike Kit audio: authored cached PCM + simulation-synchronised reload Foley.
 * Gunshots are original synthesized sound-design layers. Six recorded CC0
 * mechanical cues are registered in reviews/industrial-reference/audio-provenance.json. No external network, new AI hearing events or match-RNG calls.
 */
import {AudioSystem as CombatAudio} from './combat-audio.mjs';
import {kitWeapon,RELOAD_CUES,reloadIsEmpty} from './strike-kit-timing.mjs';
export const KIT_AUDIO_VERSION='strike-kit-audio-2';
export const KIT_FOLEY = Object.freeze({
 'p9:out:0':'f_magout_pistol.mp3', 'p9:in:0':'f_magin_pistol.mp3', 'p9:action:0':'f_slide_pistol-1.mp3',
 'cr4:out:0':'f_magout_rifle-1.mp3', 'cr4:in:0':'f_magin_rifle-1.mp3', 'cr4:action:0':'f_charge_rifle-1.mp3'
});
export function kitPCM(kind,weapon='p9',sampleRate=48000,variant=0){
 const rifle=weapon==='cr4',duration=kind==='shot'?(rifle?.34:.29):kind==='tail'?.48:kind==='out'?.20:kind==='in'?.23:.16;
 const data=new Float32Array(Math.ceil(sampleRate*duration));let seed=19073+variant*7919+(rifle?1103:37),low=0,body=0;
 for(let i=0;i<data.length;i++){
  const t=i/sampleRate;seed=(Math.imul(seed,1664525)+1013904223)|0;const white=(seed>>>0)/2147483648-1;
  low+=.16*(white-low);body+=.035*(white-body);let v=0;
  const click=(at,amp,decay,freq)=>{const a=t-at;return a>=0?amp*(.63*(white-low)+.37*Math.sin(2*Math.PI*freq*a))*Math.exp(-a/decay):0;};
  if(kind==='shot'){
   const attack=Math.min(1,t/.0012);
   v=attack*((white-low)*.56*Math.exp(-t/(rifle?.030:.023))+low*.66*Math.exp(-t/(rifle?.075:.052))
    +Math.sin(2*Math.PI*((rifle?83:108)*t-38*t*t))*.62*Math.exp(-t/.052));
   v+=click(.025,.18,.009,2120)+click(.064,.10,.017,780);
  }else if(kind==='tail'){
   v=(low*.50+body*.45)*Math.exp(-t/.125)*(1-Math.exp(-t/.014));
   v+=click(.039,.045,.022,620)+click(.073,.025,.026,420);
  }else if(kind==='release')v=click(.002,.58,.010,rifle?1450:1900)+click(.019,.23,.008,880);
  else if(kind==='out')v=white*.16*Math.sin(Math.PI*t/duration)**2+click(.012,.25,.013,610)+low*.18;
  else if(kind==='in')v=click(.005,.40,.020,370)+click(.049,.72,.013,1450)+body*.2*Math.exp(-t/.070);
  else if(kind==='action')v=click(.005,.38,.014,1100)+white*.18*Math.exp(-Math.abs(t-.045)/.025)+click(.098,.68,.011,2100);
  else if(kind==='draw')v=click(.003,.35,.015,850)+low*.30*Math.exp(-t/.045);
  data[i]=v*Math.min(1,(duration-t)/.008);
 }
 let peak=0;for(const v of data)peak=Math.max(peak,Math.abs(v));const gain=peak>.001?.78/Math.max(.78,peak):1;
 for(let i=0;i<data.length;i++)data[i]*=gain;return data;
}
export class AudioSystem extends CombatAudio{
 constructor(world,settings){super(world,settings);this.kitBuffers=new Map();this.kitReloads=new Map();this.kitStats={shots:0,foley:0,tails:0,cancelled:0};this.kitReady=false;this.recordedFoley=new Map();this.foleyLoadPromise=null;}
 async unlock(){const ok=await super.unlock();if(!ok||this.disposed)return false;
  if(!this.kitReady){
  for(const weapon of['p9','cr4'])for(const kind of['shot','tail','release','out','in','action','draw'])for(let v=0;v<(kind==='shot'?3:1);v++){
   const pcm=kitPCM(kind,weapon,this.context.sampleRate,v),buffer=this.context.createBuffer(1,pcm.length,this.context.sampleRate);buffer.copyToChannel(pcm,0);this.kitBuffers.set(`${weapon}:${kind}:${v}`,buffer);
  }this.kitReady=true;
  }
  // Decode once on the existing user-gesture unlock, never during a reload.
  // A failed optional recording remains explicit in errors and uses the existing
  // synthesized cue, so audio failure cannot change authoritative reload timing.
  this.foleyLoadPromise??=Promise.all(Object.entries(KIT_FOLEY).map(async([key,file])=>{
   try{
    const response=await fetch(new URL(`../../assets/fps/audio/ffsl-${file}`,import.meta.url));
    if(!response.ok)throw Error(`HTTP ${response.status}`);
    const bytes=await response.arrayBuffer();if(this.disposed)return;
    const buffer=await this.context.decodeAudioData(bytes);if(!this.disposed)this.recordedFoley.set(key,buffer);
   }catch(error){if(!this.disposed)this.errors.push(`FFSL ${file}: ${error.message}`);}
  }));
  await this.foleyLoadPromise;return !this.disposed&&this.context.state==='running';
 }
 kitSample(kind,event,volume=1,variant=0){
  const key=`${event.weapon==='cr4'?'cr4':'p9'}:${kind}:${variant}`,recorded=this.recordedFoley.get(key),buffer=recorded||this.kitBuffers.get(key);if(!buffer||this.active.size>=94)return;
  const source=this.context.createBufferSource();source.buffer=buffer;const c=this.channel(event,volume*(recorded?1.45:1));
  const position=event.position||event,distance=Math.hypot((position.x||0)-(this.listener?.x||0),(position.z||0)-(this.listener?.z||0));
  const filter=c.nodes[1];filter.frequency.value=Math.min(filter.frequency.value,18000/(1+distance*.075));
  source.connect(c.gain);this.track(source,c,buffer.duration+.005);
 }
 play(e){
  if(e.type==='reload'&&kitWeapon(e.weapon)){
   const a=this.game?.actors.find(a=>a.id===e.actorId);this.kitReloads.set(e.actorId,{event:{...e},at:e.time,duration:e.duration||1.55,empty:reloadIsEmpty(a,e.weapon),stage:0});return;
  }
  if(e.type==='shot'&&kitWeapon(e.weapon)&&this.kitReady){
   this.serial++;this.kitSample('shot',e,e.actorId===this.listenerId?.75:.63,this.serial%3);this.kitStats.shots++;
   const room=this.world.roomAt?.(e.x,e.z)||this.world.roomAt?.(this.listener?.x,this.listener?.z),hard=/HISS|KORRIDOR|LAB|PQC/.test(room?.name||'');
   this.kitSample('tail',e,hard?.30:.13);this.kitStats.tails++;this.stats.played++;return;
  }
  if((e.type==='switch'||e.type==='weaponSwitch')&&kitWeapon(e.weapon)&&this.kitReady){this.kitSample('draw',e,.24);this.stats.played++;return;}
  if(e.type==='kill')this.kitReloads.delete(e.actorId);
  super.play(e);
 }
 handle(events,listener,time){
  super.handle(events,listener,time);
  if(!this.context||this.context.state!=='running'||!this.kitReady||this.volume===0)return;
  for(const[id,r]of this.kitReloads){
   const a=this.game?.actors.find(a=>a.id===id);
   if(!a?.alive||a.weapon!==r.event.weapon||!a.reloadUntil||Math.abs(a.reloadUntil-r.at-r.duration)>.03){this.kitReloads.delete(id);this.kitStats.cancelled++;continue;}
   const f=(time-r.at)/r.duration;
   while(r.stage<RELOAD_CUES.length&&f>=RELOAD_CUES[r.stage].at){
    const cue=RELOAD_CUES[r.stage++];if(cue.emptyOnly&&!r.empty)continue;
    // Never play several obsolete cues on resume/time jumps. At most recent cue.
    if((f-cue.at)*r.duration>.15)continue;
    this.kitSample(cue.id,{...r.event,x:a.x,y:a.y,z:a.z},cue.id==='in'?.38:.27);this.kitStats.foley++;
   }
   if(r.stage===RELOAD_CUES.length)this.kitReloads.delete(id);
  }
 }
 reset(){super.reset();this.kitReloads?.clear();}
 async dispose(){this.recordedFoley.clear();this.kitBuffers.clear();this.kitReady=false;await super.dispose();}
}
