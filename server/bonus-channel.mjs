import {ClientState} from '@colyseus/core';

const REQUEST_KEYS=new Set(['actorId','slot','serial','matchId','round','worldRevision','lifeId','controlEpoch']);
// Send after each schema patch, directly to the original connected seat.
// Public actors only replicate visible effects. Existing actor positions are
// already shared for interpolation, independent of the private radar samples.
export function receiveBonus(room,client,message){
  const seat=room.seats.get(client.sessionId);
  if(!seat?.ready || !seat.enabled || !seat.connected || seat.revoked || seat.pending ||
     seat.client!==client || client.state!==ClientState.JOINED || !message || Object.getPrototypeOf(message)!==Object.prototype ||
     !Number.isSafeInteger(message.serial) || message.serial<=0 || message.serial>0xffffffff ||
     Object.keys(message).some(key=>!REQUEST_KEYS.has(key)) || seat.actor.id!==message.actorId ||
     room.state.phase!=='active' || message.matchId!==room.state.matchId ||
     message.round!==room.state.round || message.worldRevision!==room.state.worldRevision ||
     message.lifeId!==seat.actor.lifeId || message.controlEpoch!==seat.epoch)return;
  room.sim.game.requestBonus(message.slot,seat.actor,message.serial);
}

export function flushBonuses(room){
  for(const [sessionId,seat] of room.seats){
    const actor=seat.actor,client=seat.client;
    if(!seat.ready || !seat.connected || seat.pending || seat.revoked || !actor?.bonus ||
       client?.state!==ClientState.JOINED || client.sessionId!==sessionId || actor.controlEpoch!==seat.epoch ||
       room.state.actors.get(actor.id)?.sessionId!==sessionId)continue;
    const {matchId,round,worldRevision}=room.state,previous=seat.sentBonus;
    const {lifeId}=actor,controlEpoch=seat.epoch,pulse=actor.uavPulseTick,revision=actor.bonus.revision;
    if(previous && previous.actor===actor && previous.matchId===matchId && previous.round===round &&
       previous.worldRevision===worldRevision && previous.lifeId===lifeId && previous.controlEpoch===controlEpoch &&
       previous.pulse===pulse && previous.revision===revision)continue;
    seat.sentBonus={actor,matchId,round,worldRevision,lifeId,controlEpoch,pulse,revision};
    client.send('bonusState',{actorId:actor.id,matchId,round,worldRevision,lifeId,controlEpoch,
      bonus:actor.bonus,samples:actor.alive && actor.bonus.active?.id==='uav' ? actor.uavSamples||[] : []});
  }
}
