import {HostageState,ActorState} from './network-schema.mjs';

// Game.beginRound owns inventory carry-over, buying, objective placement and
// round resolution. Session reservations take effect before it seats new lives.
export function prepareClassicRound(room,advanceEpoch=true){
  const game=room.sim.game;
  for(const [sid,seat] of room.seats){
    if(!seat.pending)continue;
    // A still-loading client keeps its bot during live rounds. At rematch
    // the lobby can transfer even a reservation without a simulation actor.
    if(!seat.ready&&room.state.phase!=='waiting')continue;
    room.removeBot(seat.id);
    room.state.actors.delete(seat.waitId);
    seat.waitId=seat.id;
    seat.pending=false;
    if(!seat.ready){
      room.state.actors.set(seat.id,new ActorState({id:seat.id,sessionId:sid,name:seat.name,
        team:seat.id.split('-')[0],connected:seat.connected,controlEpoch:seat.epoch}));
      continue;
    }
    seat.actor.id=seat.id;
    seat.actor.lifeId=Math.max(seat.actor.lifeId,room.lives.get(seat.id)||0);
    game.actors.push(seat.actor);
    room.accountMatch?.admit(seat);
    if(seat.connected)room.sim.controllers.bind(sid,seat.id);
  }
  room.fillVacancies(true);
  room.state.brokenGlass.clear();
  room.lag.tickTimes.clear();room.lag.shots.clear();
  game.events=[];
  for(const seat of room.participants()){
    if(!seat.ready||seat.pending)continue;
    const a=seat.actor,sid=seat.client?.sessionId;
    if(advanceEpoch)seat.epoch++;
    a.controlEpoch=seat.epoch;a.lifeId++;
    seat.lastSelect=seat.lastFire=seat.lastReload=seat.lastSampleTick=seat.lastShotStamp=0;
    seat.holdThrow=seat.trigger=seat.aim=seat.releaseInteract=false;seat.interactUntil=0;
    a.aimAmount=0;a.aiming=false;
    if(sid)room.inputs.get(sid).clear();
    seat.lifeStartedAt=room.clock.elapsedTime;seat.diedAtMs=0;
    room.state.actors.set(a.id,new ActorState({id:a.id,sessionId:sid||'',name:a.name,team:a.team}));
  }
}
export function projectClassic(room){
  const g=room.sim.game,s=g.state,b=s.bomb,out=room.state;
  Object.assign(out,{round:s.round,roundPhase:s.phase,deadline:s.deadline,buyDeadline:s.buyDeadline,
    resultDeadline:s.resultDeadline||0,roundReason:s.result?.reason||'',roundWinner:s.result?.winner||'',bombStatus:b.status,carrierId:b.carrierId||'',
    bombX:b.x,bombY:b.y,bombZ:b.z,bombDeadline:Number.isFinite(b.deadline)?b.deadline:0});
  if(out.phase==='active'){
    const deadline=s.phase==='buy'?s.buyDeadline:s.phase==='result'?s.resultDeadline:b.status==='planted'?b.deadline:s.deadline;
    out.remainingSeconds=Math.max(0,deadline-s.time);
  }
  for(const h of g.hostages){
    if(!out.hostages.has(h.id))out.hostages.set(h.id,new HostageState({id:h.id,name:h.name}));
    Object.assign(out.hostages.get(h.id),{x:h.x,y:h.y,z:h.z,yaw:h.yaw||0,alive:h.alive,rescued:h.rescued,
      escortId:h.escortId||'',distanceWalked:h.distanceWalked});
  }
}
