/** Adapted from Riposte: Frontline 5.6.1, 07c-controller, 08-player and
 * 09q-tactile. Copyright (c) 2026 BenDBSS, MIT. See licenses/riposte-MIT.txt. */
export const RUSH = Object.freeze({speed:1.55, damping:11, ready:0.3, shoulderTime:0.18, edgeLifetime:0.25});

// Reference 07c-controller: preserve resolved travel, steer at up to 2 rad/s,
 // then decay toward the regular crouching pace. Speed limits are in CS units.
export const SLIDE=Object.freeze({duration:.75,cooldown:.26,wallCooldown:.12,buffer:.30,min:3/4.75,floor:6.8/4.75,boost:1.4,maxRush:1.40,turn:2});
export function endSlide(actor,time,blocked=false){
  actor.slideUntil=0;
  actor.slideReadyAt=time+(blocked?SLIDE.wallCooldown:SLIDE.cooldown);
  actor.slideSpeed=0;
}
// Riposte only spends the usable input window when the actor can start a slide.
export function beginBufferedSlide(actor,input,time,dt,runSpeed){
  const forward=input.forward || 0,run=input.sprint && forward>.3;
  // SDK and DOM frames have an explicit edge. Falling back to the held state is
  // for older simulation callers; a quiet server tick must not create a new tap.
  const edge=input.crouchEdge ?? (input.crouch && !actor.crouchHeld);
  actor.crouchHeld=!!input.crouch;
  if(actor.slideUntil && time>=actor.slideUntil)endSlide(actor,time);
  if(input.aim || input.fire || input.fireEdge || input.firePress || input.sneak || input.interact ||
      input.reload || actor.pendingShot || actor.reloadUntil>time || actor.action || actor.cartridge || forward<0){
    actor.slideBuffer=0;
    return false;
  }
  const moving=actor.moving>runSpeed*SLIDE.min;
  const released=!forward && !input.strafe;
  const hasDirection=!!(actor.travelDirX || actor.travelDirZ);
  const chain=actor.slideUntil || (input.sprint && actor.slideReadyAt>time);
  const airborne=!actor.onGround && moving && (run || (released && hasDirection));
  if(edge && (actor.rushing || chain || airborne)){
    actor.slideBuffer=SLIDE.buffer;
  }
  if(!actor.slideBuffer || !actor.onGround || actor.slideUntil || actor.slideReadyAt>time)return false;
  actor.slideBuffer=actor.slideBuffer<=dt+1e-9 ? 0 : actor.slideBuffer-dt;
  // A released stick still has the last resolved velocity. A stopped or
  // sideways-moving player does not get a fresh boost from a queued request.
  if(!(run || released) || !moving || !hasDirection)return false;
  actor.slideBuffer=0;
  actor.slideUntil=time+SLIDE.duration;
  actor.slideSpeed=Math.min(runSpeed*RUSH.speed*SLIDE.maxRush,Math.max(runSpeed*SLIDE.floor,actor.moving*SLIDE.boost));
  return true;
}
export function resetRush(actor) {
  Object.assign(actor,{rushing:false,rushWeight:0,rushResumeAt:0,pendingShot:null,crouchHeld:false,slideBuffer:0,slideUntil:0,slideReadyAt:0,slideSpeed:0,travelDirX:0,travelDirZ:0});
}

export function interruptRush(actor,time){
  const cooldown=Math.max(actor.slideReadyAt || 0,actor.slideUntil>time?time+SLIDE.cooldown:0);
  resetRush(actor);
  actor.slideReadyAt=cooldown;
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
