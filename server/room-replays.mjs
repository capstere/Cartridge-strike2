import {ReplayHistory,sameReplayWorld,sameReplaySeat} from '../shared/multiplayer/replay.mjs';

function world(state){return {matchId:state.matchId,round:state.round,worldRevision:state.worldRevision,mapId:state.mapId};}
function recipient(state,seat){
  if(!seat.ready||!seat.connected||seat.revoked||seat.pending||!seat.actor)return null;
  return {...world(state),actorId:seat.actor.id,lifeId:seat.actor.lifeId,controlEpoch:seat.epoch};
}
export class RoomReplays{
  constructor(room){this.room=room;this.history=new ReplayHistory();this.reset();}
  reset(){this.history.reset();this.lastKill=null;this.finalSent=false;this.pending=new Map();}
  capture(events=[]){
    const {state,sim,seats}=this.room;
    if(state.phase!=='active'&&state.phase!=='results'){
      if(this.history.scope)this.reset();
      return;
    }
    const scope=world(state);
    if(!sameReplayWorld(this.history.scope,scope))this.reset();
    const clips=this.history.record(scope,sim.game.state.time,sim.game.actors,events);
    for(const clip of clips){
      // Projected costume IDs have already passed the account's outfit rights check.
      for(const participant of [clip.killer,clip.victim]){
        participant.outfitId=state.actors?.get(participant.id)?.handling?.outfitId??participant.outfitId;
      }
      this.lastKill=clip.samples?clip:null;
      if(state.phase!=='active')continue;
      for(const seat of seats.values()){
        const target=recipient(state,seat);
        if(target?.actorId!==clip.victim.id||target.lifeId!==clip.victim.lifeId||
          target.controlEpoch!==clip.victim.controlEpoch||seat.actor.alive)continue;
        // A live Classic round permits a card only. No killer trajectory crosses the socket.
        const {samples,shots,hitTime,...card}=clip;
        const payload=!clip.samples||state.mode==='classic'&&state.roundPhase==='active'?{card}:{clip};
        this.pending.set(seat,{client:seat.client,target,message:{kind:'death',...target,...payload}});
      }
    }
    if(state.phase==='results'&&!this.finalSent&&this.lastKill){
      this.finalSent=true;
      for(const seat of seats.values()){
        const target=recipient(state,seat);
        if(target)this.pending.set(seat,{client:seat.client,target,message:{kind:'final',...target,clip:this.lastKill}});
      }
    }
  }
  flush(){
    const {state,seats}=this.room;
    for(const [seat,{client,target,message}] of this.pending){
      if(seats.get(client.sessionId)!==seat||seat.client!==client||!sameReplaySeat(target,recipient(state,seat)))continue;
      if(message.kind==='final'?state.phase!=='results':state.phase!=='active'||seat.actor.alive)continue;
      if(message.kind==='death'&&message.clip&&state.mode==='classic'&&state.roundPhase==='active')continue;
      client.send('replay',message);
    }
    this.pending.clear();
  }
}
