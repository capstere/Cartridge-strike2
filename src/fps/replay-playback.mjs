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
    this.respawnDeadline=Number.isFinite(budget)?now+budget+100:Infinity;
    this.lastPresentedAt=now;this.lastClipTime=null;
    this.update(scope,now);return true;
  }
  update(scope,now=performance.now()){
    const p=this.packet;
    if(!p||!authorized(p,scope)){this.skip();return null;}
    const c=p.clip??p.card,rate=p.kind==='final'?finalRate:deathRate;
    const delay=this.cardDuration,elapsed=Math.max(0,now-this.started);
    const card=elapsed<delay,gap=now-this.lastPresentedAt;
    let time=this.offset+Math.max(0,(elapsed-delay)*rate/1000);
    const tail=p.clip?c.samples.at(-1).t:0;
    let duration=delay+(p.clip?(tail-this.offset)*1000/rate+180:0);
    const deathRemaining=Math.min(this.respawnDeadline-now,(scope.respawnRemaining??Infinity)*1000);
    // A cold historical scene may consume most of a victim's remaining life.
    // Keep the real finishing pose for the last available frame. In results,
    // recover that pose if a slow frame crossed its short visual/audio cue.
    const pendingHit=!card&&p.clip&&(this.lastClipTime===null||this.lastClipTime<c.hitTime);
    const lastDeathFrame=p.kind==='death'&&deathRemaining<=gap+100;
    const recoverHit=pendingHit&&gap>100&&elapsed<duration+250&&
      (p.kind!=='death'||deathRemaining>0)&&(time>=c.hitTime||lastDeathFrame);
    if(recoverHit){
      // Advance (or slow) the clip clock only from this frame onward. The next
      // update cannot replay the shot, and the marker fades at its ordinary rate.
      this.offset+=c.hitTime-time;
      duration+=(time-c.hitTime)*1000/rate;
      time=c.hitTime;
    }
    if(elapsed>=duration){this.skip();return null;}
    const pose=card?{}:sampleReplay(c,time);
    // Never drain the shots skipped by a slow frame. The one recovered cue
    // requires a recorded firearm event at the confirmed hit's exact time.
    const continuous=!card&&this.lastClipTime!==null&&gap>=0&&gap<=100;
    let audioShots=continuous?c.shots.filter(s=>s.t>this.lastClipTime&&s.t<=time):[];
    if(recoverHit){
      const terminal=c.shots.findLast(s=>s.t===c.hitTime);
      if(terminal)audioShots=[terminal];
    }
    this.lastClipTime=card?null:time;this.lastPresentedAt=now;
    const hitAge=time-c.hitTime;
    const hitStrength=!card&&hitAge>=0&&hitAge<.14?1-hitAge/.14:0;
    this.frame={audioShots,hitStrength,killerId:c.killer.id,stage:card?'card':'replay',kind:p.kind,serial:c.serial,killer:c.killer.name,victim:c.victim.name,
      victimId:c.victim.id,victimTeam:c.victim.team,victimOutfit:c.victim.outfitId,weapon:c.weapon,distance:c.distance,remaining:(duration-elapsed)/1000,
      time,deathTime:c.samples?.at(-1)?.t,scoped:pose.camera?.weapon==='sniper'&&pose.camera.aim>.92,...pose};
    return this.frame;
  }
}
/** Present only newly crossed historical shots, through ordinary POV audio.
 * There is no game event queue, world ambience, feedback award or live listener here. */
export function presentReplayAudio(audio,frame){
  if(!frame?.audioShots.length)return;
  const shots=frame.audioShots;frame.audioShots=[];
  if(!audio?.volume||audio.context?.state!=='running')return;
  const p=frame.camera;
  audio.updateListener({id:frame.killerId,x:p.x,y:p.y+p.height-.12,z:p.z,yaw:p.yaw,pitch:p.pitch});
  for(const shot of shots){
    audio.handleEvent({type:shot.weapon==='bazooka'?'rocket-launch':'shot',actorId:frame.killerId,
      time:shot.t,weapon:shot.weapon,suppressed:shot.suppressed,x:p.x,y:p.y+p.height-.12,z:p.z},frame.time);
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
      const {samples,shots,hitTime,...card}=clip;
      const detail=!clip.samples||scope.mode==='classic'&&scope.roundPhase==='active'?{card}:{clip};
      this.playback.receive({...scope,kind:'death',...detail},scope);
    }
    if(!this.finalSent&&scope.phase==='results'&&this.lastKill){
      this.finalSent=true;this.playback.receive({...scope,kind:'final',clip:this.lastKill},scope);
    }
  }
  update(now){return this.playback.update(this.scope(),now);}
}
