/** Adapted from Riposte: Frontline 5.6.1, 07c-controller, 08-player and
 * 09q-tactile. Copyright (c) 2026 BenDBSS, MIT. See licenses/riposte-MIT.txt. */
export const RUSH = Object.freeze({speed:1.55, damping:11, ready:0.3, shoulderTime:0.18, edgeLifetime:0.25});

export function resetRush(actor) {
  Object.assign(actor,{rushing:false,rushWeight:0,rushResumeAt:0,pendingShot:null});
}

export function rushReady(actor) { return (actor.rushWeight || 0) <= RUSH.ready; }

export function stickRush(wasRunning, distance, forward) {
  return wasRunning ? distance > .95 && forward > .35 : distance > 1.15 && forward > .55;
}

export function wantsRush(actor,input,forward,time) {
  if(input.fire || input.aim || actor.pendingShot) actor.rushResumeAt=time+RUSH.shoulderTime;
  return !!input.sprint && forward>.3 && actor.onGround && !actor.crouching && !input.sneak &&
    !input.jump && !actor.action && time >= (actor.rushResumeAt || 0);
}

export function advanceRush(actor,eligible,dt,runSpeed) {
  actor.rushing=!!eligible && actor.onGround && actor.moving>runSpeed*.35;
  const target=actor.rushing ? Math.min(1,actor.moving/(runSpeed*RUSH.speed)) : 0;
  actor.rushWeight=target+((actor.rushWeight||0)-target)*Math.exp(-RUSH.damping*dt);
  if(Math.abs(actor.rushWeight-target)<.001)actor.rushWeight=target;
}

// A single physical edge can wait for Rush recovery. Keep its original aim
// and optional authority data separate from the newest movement/look sample.
export function queueShot(actor,shot,time) {
  if(!actor.pendingShot) actor.pendingShot={...shot,weapon:actor.weapon,until:time+RUSH.edgeLifetime};
}

export function takeReadyShot(actor,time) {
  const shot=actor.pendingShot;
  if(!shot)return null;
  if(!actor.alive || actor.weapon!==shot.weapon || actor.reloadUntil || actor.action || time>shot.until){
    actor.pendingShot=null;
    return null;
  }
  if(!rushReady(actor))return null;
  actor.pendingShot=null;
  return shot;
}
