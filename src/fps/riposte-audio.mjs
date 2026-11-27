/** Riposte recordings on the existing positional/occlusion channel. The game
 * owns combat timing. A late decode is available to subsequent events only. */
import {AudioSystem as ExistingAudio} from './strike-kit-audio.mjs';
import {firstShotTakes, shotSound, decoderLead} from './shot-audio.mjs';
import {shotTiming} from './shot-timing.mjs';

export const RIPOSTE_AUDIO_FILES = Object.freeze([
  ...firstShotTakes.map(take => 'armes/'+take+'.mp3'),
  ...['flesh','metal','concrete','glass','wood'].map(s => `impacts/i_${s}-1.mp3`),
  'foley/f_pin.mp3',
  ...['dry','draw','knife','knife_hit','throw','pickup'].map(s => `foley/f_${s}-1.mp3`),
]);

export class AudioSystem extends ExistingAudio {
  constructor(world,settings) {
    super(world,settings);
    this.reuseBuffers=new Map();
    this.reuseOffsets=new Map();
    this.lastTake=new Map();
    this.extraTakes=new Set();
    this.extraLoad=Promise.resolve();
    this.reuseLoad=null;
    this.reuseStats={played:0,loaded:0,fallback:0};
  }
  async loadTake(name) {
    if(this.disposed)return;
    const filename=name.split('/').at(-1);
    try {
      const response=await fetch(new URL('../../assets/fps/audio/riposte-'+filename,import.meta.url));
      if(!response.ok)throw Error('HTTP '+response.status);
      const bytes=await response.arrayBuffer();
      if(this.disposed)return;
      const buffer=await this.context.decodeAudioData(bytes);
      if(this.disposed)return;
      const timing=shotTiming[filename.slice(0,-4)];
      if(timing)this.reuseOffsets.set(name,decoderLead(buffer,timing));
      this.reuseBuffers.set(name,buffer);
      this.reuseStats.loaded++;
    } catch(error) {
      if(!this.disposed)this.errors.push('Riposte '+name+' · '+error.message);
    }
  }
  async unlock() {
    if(!await super.unlock()||this.disposed)return false;
    if(!this.reuseLoad) {
      // A small shared queue bounds peak decoder memory on mobile and on the Pi.
      const queue=RIPOSTE_AUDIO_FILES.values();
      const worker=async()=>{for(const name of queue)await this.loadTake(name);};
      this.reuseLoad=Promise.all([worker(),worker(),worker()]);
    }
    await this.reuseLoad;
    return !this.disposed&&this.context.state==='running';
  }
  shotTake(bank) {
    const first='armes/'+bank+'-1.mp3', second='armes/'+bank+'-2.mp3';
    if(this.reuseBuffers.has(first)&&!this.extraTakes.has(second)) {
      this.extraTakes.add(second);
      this.extraLoad=this.extraLoad.then(()=>this.loadTake(second));
    }
    const chosen=this.lastTake.get(bank)===first&&this.reuseBuffers.has(second)?second:first;
    if(this.reuseBuffers.has(chosen))this.lastTake.set(bank,chosen);
    return chosen;
  }
  play(e) {
    let name, gain=.45, delay=0;
    const shot=e.type==='shot'&&shotSound(e,this.listener,this.listenerId);
    if(shot) {
      name=this.shotTake(shot.bank);
      gain=shot.gain;
      delay=shot.delay;
    } else if(e.type==='shot'&&e.weapon==='knife'){name='foley/f_knife-1.mp3';gain=.35;}
    else if(e.type==='damage'){name=e.weapon==='knife'?'foley/f_knife_hit-1.mp3':'impacts/i_flesh-1.mp3';gain=.28;}
    else if(e.type==='impact'){
      const surface=/metal/.test(e.surface)?'metal':/glass|frost/.test(e.surface)?'glass':/wood/.test(e.surface)?'wood':'concrete';
      name=`impacts/i_${surface}-1.mp3`;gain=.28;
    }else if(e.type==='empty'){name='foley/f_dry-1.mp3';gain=.4;}
    else if(e.type==='switch'){name='foley/f_draw-1.mp3';gain=.3;}
    else if(e.type==='cartridge-latch'){name='foley/f_pin.mp3';gain=.28;}
    else if(e.type==='throw'){name='foley/f_throw-1.mp3';gain=.35;}
    else if(e.type==='pickup'){name='foley/f_pickup-1.mp3';gain=.35;}
    const buffer=name&&this.reuseBuffers.get(name);
    if(!buffer){if(name)this.reuseStats.fallback++;return super.play(e);}
    if(this.active.size>=94){this.stats.dropped++;return;}
    const source=this.context.createBufferSource(),channel=this.channel(e,gain,delay);
    source.buffer=buffer;
    source.connect(channel.gain);
    const offset=this.reuseOffsets.get(name)||0;
    this.track(source,channel,buffer.duration-offset+.005,offset);
    this.reuseStats.played++;this.stats.played++;
    if(shot&&['p9','p12','cr4'].includes(e.weapon))this.kitStats.shots++;
  }
  async dispose() {
    const closing=super.dispose();
    this.reuseBuffers.clear();this.reuseOffsets.clear();this.lastTake.clear();this.extraTakes.clear();
    await closing;
  }
}
