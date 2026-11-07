/** Selected CC0 Riposte SFX on the existing positional/occlusion/mute channel.
 * No new simulation hearing events and no delayed replay after decoding.
 * Source names, licenses and exact hashes: reviews/responsiveness-riposte/reuse-provenance.json.
 */
import {AudioSystem as ExistingAudio} from './strike-kit-audio.mjs';
const GUNS=Object.freeze({p9:'glock',p12:'pistol',cr4:'rifle',ar47:'ak',smg:'smg',shotgun:'shotgun',sniper:'sniper'});
export const RIPOSTE_AUDIO_FILES=Object.freeze([
 ...[...new Set(Object.values(GUNS))].flatMap(g=>['pov','near'].map(r=>`armes/g_${g}_${r}-1.mp3`)),
 ...['flesh','metal','concrete','glass','wood'].map(s=>`impacts/i_${s}-1.mp3`),
 ...['dry','draw','knife','knife_hit','throw','pickup'].map(s=>`foley/f_${s}-1.mp3`)
]);
export class AudioSystem extends ExistingAudio{
 constructor(world,settings){super(world,settings);this.reuseBuffers=new Map();this.reuseLoad=null;this.reuseStats={played:0,loaded:0,fallback:0};}
 async unlock(){
  const ready=await super.unlock();if(!ready||this.disposed)return false;
  this.reuseLoad??=Promise.all(RIPOSTE_AUDIO_FILES.map(async name=>{
   try{const response=await fetch(new URL('../../assets/fps/audio/riposte-'+name.split('/').at(-1),import.meta.url));if(!response.ok)throw Error('HTTP '+response.status);
    const bytes=await response.arrayBuffer();if(this.disposed)return;const buffer=await this.context.decodeAudioData(bytes);
    if(!this.disposed){this.reuseBuffers.set(name,buffer);this.reuseStats.loaded++;}
   }catch(e){if(!this.disposed)this.errors.push('Riposte '+name+': '+e.message);}
  }));
  await this.reuseLoad;return !this.disposed&&this.context.state==='running';
 }
 play(e){
  let name=null,gain=.45;
  if(e.type==='shot'&&GUNS[e.weapon]){name=`armes/g_${GUNS[e.weapon]}_${e.actorId===this.listenerId?'pov':'near'}-1.mp3`;gain=e.actorId===this.listenerId?.55:.42;}
  else if(e.type==='shot'&&e.weapon==='knife'){name='foley/f_knife-1.mp3';gain=.35;}
  else if(e.type==='damage'){name=e.weapon==='knife'?'foley/f_knife_hit-1.mp3':'impacts/i_flesh-1.mp3';gain=.28;}
  else if(e.type==='impact'){
   const surface=/metal/.test(e.surface)?'metal':/glass|frost/.test(e.surface)?'glass':/wood/.test(e.surface)?'wood':'concrete';name=`impacts/i_${surface}-1.mp3`;gain=.28;
  }else if(e.type==='empty'){name='foley/f_dry-1.mp3';gain=.4;}
  else if(e.type==='switch'){name='foley/f_draw-1.mp3';gain=.3;}
  else if(e.type==='throw'){name='foley/f_throw-1.mp3';gain=.35;}
  else if(e.type==='pickup'){name='foley/f_pickup-1.mp3';gain=.35;}
  const buffer=name&&this.reuseBuffers.get(name);
  if(!buffer){if(name)this.reuseStats.fallback++;return super.play(e);}
  if(this.active.size>=94){this.stats.dropped++;return;}
  const source=this.context.createBufferSource(),channel=this.channel(e,gain);source.buffer=buffer;source.connect(channel.gain);this.track(source,channel,buffer.duration+.005);this.reuseStats.played++;this.stats.played++;
  if(e.type==='shot'&&['p9','p12','cr4'].includes(e.weapon))this.kitStats.shots++;
 }
 dispose(){super.dispose();this.reuseBuffers.clear();}
}
