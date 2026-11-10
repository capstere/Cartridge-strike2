// The game owns one audio context. These two local recordings use its master,
// listener, spatial channel and pause/reset lifecycle.
export class FloorAudio {
  constructor(){
    this.buffers=new Map();
    this.announced=new WeakMap();
  }
  load(audio){
    this.ready??=Promise.all(['prepare-to-fight','danceman'].map(async name=>{
      try{
        const response=await fetch(new URL('../../assets/fps/audio/'+name+'.mp3',import.meta.url));
        if(!response.ok)throw Error('HTTP '+response.status);
        const buffer=await audio.context.decodeAudioData(await response.arrayBuffer());
        if(!audio.disposed)this.buffers.set(name,buffer);
      }catch(error){if(!audio.disposed)audio.errors.push(name+': '+error.message);}
    }));
    return this.ready;
  }
  update(audio,events,presenting=true){
    const game=audio.game;
    if(!game || game.phase!=='active'){this.reset();return;}
    const round=game.state.round;
    if(this.announced.get(game.player)!==round && events.some(e=>e.type==='start')){
      this.announced.set(game.player,round);
      this.pending=audio.volume>0 ? game : null;
    }
    if(!presenting || !audio.volume || game.state.paused || audio.context?.state!=='running'){
      if(!audio.volume)this.pending=null;
      this.stopMusic();return;
    }
    if(this.pending===game){
      const buffer=this.buffers.get('prepare-to-fight');
      if(buffer){
        this.pending=null;
        const source=audio.context.createBufferSource();
        source.buffer=buffer;
        const channel=audio.channel({type:'round'},.65);
        source.connect(channel.gain);audio.track(source,channel,buffer.duration);
      }
    }
    const dancer=game.state.zombies?.find(z=>z.model==='danceman');
    if(!dancer?.alive || !audio.listener){this.stopMusic();return;}
    const position={x:dancer.x,y:dancer.y+1.15,z:dancer.z};
    const d=Math.hypot(position.x-audio.listener.x,position.z-audio.listener.z,position.y-audio.listener.y);
    if(d>=10){this.stopMusic();return;}
    const ctx=audio.context,buffer=this.buffers.get('danceman');
    if(!buffer)return;
    if(!this.music){
      const channel=audio.channel({type:'music',position},0);
      const source=ctx.createBufferSource();source.buffer=buffer;source.loop=true;
      source.connect(channel.gain);
      source.start(0,game.state.time%buffer.duration);
      this.music={source,channel};
    }
    const clear=audio.world.segmentClear(audio.listener,position,{vision:false});
    const gain=.48*Math.max(0,Math.min(1,(9-d)/5))*(clear?1:.24);
    const {channel}=this.music;
    if(this.music.gain!==gain){
      channel.gain.gain.setTargetAtTime(gain,ctx.currentTime,.10);
      this.music.gain=gain;
    }
    if(this.music.clear!==clear){
      channel.nodes[1].frequency.setTargetAtTime(clear?18000:780,ctx.currentTime,.09);
      this.music.clear=clear;
    }
  }
  stopMusic(){
    if(!this.music)return;
    const {source,channel}=this.music;this.music=null;
    source.stop();source.disconnect();for(const node of channel.nodes)node.disconnect();
  }
  reset(){this.pending=null;this.stopMusic();}
}
