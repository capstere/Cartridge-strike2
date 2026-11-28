import {ReplayHistory,sameReplaySeat,sameReplayWorld,sampleReplay,validReplayCard,validReplayClip} from '../../shared/multiplayer/replay.mjs';

const cardMs=800,deathRate=1,finalRate=.75;
function authorized(packet,scope){
  if(!scope||!sameReplaySeat(packet,scope)||!scope.connected)return false;
  if(packet.kind==='final')return scope.phase==='results';
  return packet.kind==='death'&&scope.phase==='active'&&!scope.alive&&
    (!packet.clip||scope.mode!=='classic'||scope.roundPhase!=='active');
}
export class ReplayPlayback{
  constructor(){this.frame=null;this.packet=null;this.last=null;}
  reset(){this.skip();this.last=null;}
  skip(){this.frame=null;this.packet=null;}
  receive(packet,scope,now=performance.now()){
    if(!authorized(packet,scope))return false;
    const c=packet.clip??packet.card;
    if(!sameReplayWorld(c,scope)||!validReplayCard(c)||
      (packet.clip&&!validReplayClip(c))||(packet.kind==='final'&&!packet.clip))return false;
    if(packet.kind==='death'&&(c.victim.id!==scope.actorId||c.victim.lifeId!==scope.lifeId||c.victim.controlEpoch!==scope.controlEpoch))return false;
    if(this.last&&sameReplayWorld(this.last,packet)&&
      (this.last.serial>c.serial||this.last.serial===c.serial&&(this.last.kind==='final'||this.last.kind===packet.kind)))return false;
    this.last={...scope,kind:packet.kind,serial:c.serial};this.packet=packet;this.started=now;
    // Show the finishing shot before the authority starts the next life, even
    // when the transport delivers a clip late. The simulation owns the deadline.
    const budget=packet.kind==='death'&&Number.isFinite(scope.respawnRemaining)?Math.max(0,scope.respawnRemaining*1000-100):Infinity;
    this.cardDuration=packet.kind==='death'?Math.min(cardMs,budget*.4):0;
    this.offset=packet.clip?Math.max(0,c.samples.at(-1).t-Math.max(0,budget-this.cardDuration-180)/1000):0;
    this.update(scope,now);return true;
  }
  update(scope,now=performance.now()){
    const p=this.packet;
    if(!p||!authorized(p,scope)){this.skip();return null;}
    const c=p.clip??p.card,rate=p.kind==='final'?finalRate:deathRate;
    const delay=this.cardDuration,elapsed=Math.max(0,now-this.started);
    const duration=delay+(p.clip?(c.samples.at(-1).t-this.offset)*1000/rate+180:0);
    if(elapsed>=duration){this.skip();return null;}
    const card=elapsed<delay,time=this.offset+Math.max(0,(elapsed-delay)*rate/1000);
    const pose=card?{}:sampleReplay(c,time);
    this.frame={stage:card?'card':'replay',kind:p.kind,serial:c.serial,killer:c.killer.name,victim:c.victim.name,
      victimId:c.victim.id,victimTeam:c.victim.team,victimOutfit:c.victim.outfitId,weapon:c.weapon,distance:c.distance,remaining:(duration-elapsed)/1000,
      time,scoped:pose.camera?.weapon==='sniper'&&pose.camera.aim>.7,...pose};
    return this.frame;
  }
}
export class SoloReplays{
  constructor(game){this.game=game;this.history=new ReplayHistory();this.playback=new ReplayPlayback();this.lastKill=null;this.finalSent=false;}
  scope(){
    const {state:s,player:p,world}=this.game;
    return {matchId:s.matchId??0,round:s.round,worldRevision:1,mapId:world.referenceId||world.id||'solo',
      actorId:p?.id,lifeId:p?.lifeId??0,controlEpoch:p?.controlEpoch??0,alive:!!p?.alive,connected:!!p,
      respawnRemaining:p?.respawnAt>0?p.respawnAt-s.time:undefined,mode:s.mode,roundPhase:s.phase,phase:s.phase==='match'?'results':['buy','active','result'].includes(s.phase)?'active':s.phase};
  }
  capture(events){
    const scope=this.scope(),{matchId,round,worldRevision,mapId}=scope;
    if(!sameReplayWorld(this.history.scope,scope)){this.lastKill=null;this.finalSent=false;this.playback.reset();}
    const clips=this.history.record({matchId,round,worldRevision,mapId},this.game.state.time,this.game.actors,events);
    for(const clip of clips){
      this.lastKill=clip.samples?clip:null;
      if(scope.phase!=='active'||scope.actorId!==clip.victim.id)continue;
      const {samples,shots,...card}=clip;
      const detail=!clip.samples||scope.mode==='classic'&&scope.roundPhase==='active'?{card}:{clip};
      this.playback.receive({...scope,kind:'death',...detail},scope);
    }
    if(!this.finalSent&&scope.phase==='results'&&this.lastKill){
      this.finalSent=true;this.playback.receive({...scope,kind:'final',clip:this.lastKill},scope);
    }
  }
  update(now){return this.playback.update(this.scope(),now);}
}
