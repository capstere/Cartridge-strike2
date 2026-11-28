// The registry is independent of presentation, room transports and input bindings.
export const BONUS_VERSION=1;
export const BONUS_HZ=60;
export const BONUSES=Object.freeze([
  Object.freeze({id:'uav',name:'UAV',slot:1,threshold:3,durationTicks:15*BONUS_HZ}),
  Object.freeze({id:'rage',name:'Rage',slot:2,threshold:5,durationTicks:15*BONUS_HZ,moveScale:1.2,reloadScale:.75}),
  Object.freeze({id:'immortal',name:'Immortal',slot:3,threshold:8,durationTicks:8*BONUS_HZ}),
]);
export const bonusTick=time=>Math.round(time*BONUS_HZ);
export const bonusSlot=slot=>Number.isInteger(slot)&&slot>=1&&slot<=BONUSES.length?BONUSES[slot-1]:null;
export function createBonusState(){
  return {version:BONUS_VERSION,revision:1,progress:0,earnedMask:0,charges:{uav:0,rage:0,immortal:0},active:null,lastSerial:0};
}
export function endBonus(state){
  if(!state?.active)return;
  state.active=null;state.revision++;
}
export function resetBonusLife(state){
  if(!state)return;
  state.progress=0;state.earnedMask=0;state.active=null;state.lastSerial=0;state.revision++;
}
export function activeBonus(actor,tick){
  const active=actor?.bonus?.active ?? actor?.bonusEffect;
  return active && tick>=active.startTick && tick<active.endTick ? active.id : null;
}
export function earnBonusKill(state){
  state.progress++;
  for(const item of BONUSES){
    const bit=1<<(item.slot-1);
    if(state.progress>=item.threshold && !(state.earnedMask&bit)){
      state.earnedMask|=bit;state.charges[item.id]=1;
    }
  }
  state.revision++;
}
export function activateBonus(state,slot,tick,serial,activationId){
  const item=bonusSlot(slot);
  if(!state || !item || !Number.isSafeInteger(serial) || serial<=state.lastSerial || !state.charges[item.id])return false;
  if(state.active && state.active.endTick>tick)return false;
  state.lastSerial=serial;state.charges[item.id]=0;
  state.active={id:item.id,startTick:tick,endTick:tick+item.durationTicks,activationId};
  state.revision++;
  return true;
}
// Riposte 08b-killstreaks: one recorded position per pulse, then a wave,
// hold and fade. Contacts never follow actors between samples.
export const UAV_PULSE=Object.freeze({interval:180,speed:60,hold:60,fade:96,maxContacts:9});
export function snapshotUav(actor,enemies,tick,endTick){
  return enemies.slice(0,UAV_PULSE.maxContacts).map(foe=>{
    const showTick=tick+Math.ceil(Math.hypot(foe.x-actor.x,foe.z-actor.z)/UAV_PULSE.speed*BONUS_HZ);
    return {x:foe.x,z:foe.z,showTick,endTick:Math.min(endTick,showTick+UAV_PULSE.hold+UAV_PULSE.fade)};
  });
}
export function visibleUav(samples,tick){
  return (samples || []).filter(p=>p.showTick<=tick && tick<p.endTick).map(p=>({
    x:p.x,z:p.z,alpha:Math.max(0,Math.min(1,1-(tick-p.showTick-UAV_PULSE.hold)/UAV_PULSE.fade)),
  }));
}
export function combatOpponents(a,b,mode){
  return a!==b && ['human','bot'].includes(a?.controllerType) && ['human','bot'].includes(b?.controllerType) &&
    !!a.team && !!b.team && (mode==='ffa' || a.team!==b.team);
}
const combatKinds=new Set(['shot','p9','p12','ar47','cr4','smg','sniper','shotgun','bazooka','knife','he','stomp']);
export const ordinaryCombatDamage=kind=>combatKinds.has(kind);
export function bonusOrigin(game,actor){
  return Object.freeze({actorId:actor.id,matchId:game.state.matchId,lifeId:actor.lifeId||0,controlEpoch:actor.controlEpoch||0,
    enhanced:!!activeBonus(actor,bonusTick(game.state.time))});
}
export function eligibleBonusKill(game,source,target,origin){
  const tick=bonusTick(game.state.time);
  return source?.alive && game.actors.includes(source) && game.actors.includes(target) &&
    combatOpponents(source,target,game.state.mode) && !activeBonus(source,tick) &&
    (!origin || (!origin.enhanced && origin.actorId===source.id && origin.matchId===game.state.matchId &&
      origin.lifeId===(source.lifeId||0) && origin.controlEpoch===(source.controlEpoch||0)));
}

export function clearActorBonus(actor, newLife=false){
  if(newLife)resetBonusLife(actor.bonus);
  else endBonus(actor.bonus);
  actor.bonusRequest=null;
  actor.uavSamples=null;
  actor.uavPulseTick=null;
}

export function requestActorBonus(game,actor,slot,serial){
  const item=bonusSlot(slot),state=actor?.bonus;
  if(!item || !state || actor.controllerType!=='human' || !actor.alive ||
     game.phase!=='active' || game.state.paused || actor.bonusRequest || !state.charges[item.id] ||
     activeBonus(actor,bonusTick(game.state.time)) || !Number.isSafeInteger(serial) || serial<=state.lastSerial)return false;
  actor.bonusRequest={slot,serial,matchId:game.state.matchId,round:game.state.round,lifeId:actor.lifeId,epoch:actor.controlEpoch};
  return true;
}

export function stepActorBonuses(game){
  const tick=bonusTick(game.state.time);
  for(const actor of game.actors){
    const state=actor.bonus;
    if(!state)continue;
    if(state.active && tick>=state.active.endTick){
      endBonus(state);actor.uavSamples=null;actor.uavPulseTick=null;
    }
    const request=actor.bonusRequest;
    actor.bonusRequest=null;
    if(request && actor.alive && actor.controllerType==='human' && request.matchId===game.state.matchId &&
       request.round===game.state.round && request.lifeId===actor.lifeId && request.epoch===actor.controlEpoch){
      const id=[request.matchId,actor.id,request.lifeId,request.epoch||0,request.serial].join('/');
      if(activateBonus(state,request.slot,tick,request.serial,id))game.emit?.('bonus-activated',actor,{bonusId:state.active.id});
    }
    if(state.active?.id==='uav' && (actor.uavPulseTick==null || tick-actor.uavPulseTick>=UAV_PULSE.interval)){
      const enemies=game.actors.filter(other=>other.alive && combatOpponents(actor,other,game.state.mode));
      actor.uavSamples=snapshotUav(actor,enemies,tick,state.active.endTick);
      actor.uavPulseTick=tick;
    }
  }
}
