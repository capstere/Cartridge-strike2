import {RUSH,SLIDE,endSlide,beginBufferedSlide,wantsRush,advanceRush} from './rush.mjs';
import {zombiePosition} from './zombie-poses.mjs';

/** Shared capsule movement. Uses the existing world physics and body sweep.
 * Prediction may pass effects=false; it must supply its own restored actor/world
 * view and must never replay Game.step (combat/objective side effects).
 */
const point = a => ({ x: a.x, y: a.y ?? 0, z: a.z });
const distance = (a, b) => Math.hypot(a.x - b.x, a.z - b.z);
const clamp = (x, min, max) => Math.max(min, Math.min(max, x));

export function moveActor(game, actor, input, dt, effects = true) {
  if (Number.isFinite(input.yaw)) actor.yaw = input.yaw;
  if (Number.isFinite(input.pitch)) actor.pitch = clamp(input.pitch, -1.49, 1.49);
  const time=game.state.time,runSpeed=game.config.runSpeed;
  const started=beginBufferedSlide(actor,input,time,dt,runSpeed);
  if(started && effects)game.emit('slide',actor,{surface:game.world.materialAt(actor.x,actor.z)});
  const sliding=actor.slideUntil>time;
  const slideJump=sliding && input.jump && !actor.jumpHeld && actor.onGround &&
    (!game.world.canStand || game.world.canStand(actor,game.config.standingHeight));
  const queuedRush=actor.slideBuffer>0 && input.sprint && input.forward>.3;
  const crouching = !slideJump && (sliding || (!!input.crouch && !queuedRush));
  if (crouching) actor.height = game.config.crouchingHeight;
  else if (!game.world.canStand || game.world.canStand(actor, game.config.standingHeight)) actor.height = game.config.standingHeight;
  actor.crouching = actor.height < game.config.standingHeight;
  let forward = clamp(input.forward || 0, -1, 1), strafe = clamp(input.strafe || 0, -1, 1);
  const magnitude = Math.hypot(forward, strafe);
  if (magnitude > 1) { forward /= magnitude; strafe /= magnitude; }
  const rush = wantsRush(actor,input,forward,time) && !sliding;
  const mode = rush ? 'rush' : actor.crouching ? 'crouch' : input.sneak ? 'sneak' : 'run';
  const speed = rush ? game.config.runSpeed*RUSH.speed : actor.crouching ? game.config.crouchSpeed : input.sneak ? game.config.sneakSpeed : actor.bot ? game.config.botSpeed : game.config.runSpeed;
  let dx = (-Math.sin(actor.yaw) * forward + Math.cos(actor.yaw) * strafe) * speed * dt;
  let dz = (-Math.cos(actor.yaw) * forward - Math.sin(actor.yaw) * strafe) * speed * dt;
  if(actor.slideBuffer>0 && !actor.onGround && !magnitude){
    // The donor retains horizontal velocity in the air (2.2/s damping).
    // This lets a real late stick release reach the floor with its momentum.
    const carried=actor.moving*Math.exp(-2.2*dt)*dt;
    dx=actor.travelDirX*carried;dz=actor.travelDirZ*carried;
  }
  if(sliding){
    if(magnitude>.15){
      const turn=Math.atan2(actor.travelDirX*dz-actor.travelDirZ*dx,actor.travelDirX*dx+actor.travelDirZ*dz);
      if(Math.abs(turn)<2.6){
        const angle=clamp(turn*6,-SLIDE.turn,SLIDE.turn)*dt,c=Math.cos(angle),s=Math.sin(angle),oldX=actor.travelDirX;
        actor.travelDirX=oldX*c-actor.travelDirZ*s;actor.travelDirZ=oldX*s+actor.travelDirZ*c;
      }
    }
    const end=game.config.crouchSpeed,remaining=(actor.slideUntil-time)/SLIDE.duration;
    const distance=(end+(actor.slideSpeed-end)*remaining**1.35)*dt;
    dx=distance*actor.travelDirX;dz=distance*actor.travelDirZ;
  }
  if (input.moveWorld) { dx = input.moveWorld.x; dz = input.moveWorld.z; }
  if (input.jump && !actor.jumpHeld && actor.onGround && !actor.crouching) { actor.vy = game.config.jumpSpeed; actor.onGround = false; effects && game.emit('jump', actor); }
  actor.jumpHeld = !!input.jump;
  actor.vy -= game.config.gravity * dt;
  const before = point(actor), wasGrounded = actor.onGround;
  const result = moveBody(game, actor, dx, actor.vy * dt, dz);
  if (result.onGround !== undefined) actor.onGround = result.onGround;
  if (!game.world.layeredTerrain && actor.y <= .001) { actor.y = Math.max(0, actor.y); actor.onGround = true; }
  if (actor.onGround && actor.vy < 0) actor.vy = 0;
  if (result.ceiling && actor.vy > 0) actor.vy = 0;
  if (effects && !wasGrounded && actor.onGround) game.emit('land', actor, { surface: game.world.materialAt(actor.x, actor.z, actor.y) });
  const moved = distance(actor, before); actor.moving = moved / dt; actor.distanceWalked += moved;
  advanceRush(actor,rush,dt,game.config.runSpeed);
  if((actor.rushing || (actor.slideBuffer>0 && !sliding)) && moved>.001){
    actor.travelDirX=(actor.x-before.x)/moved;actor.travelDirZ=(actor.z-before.z)/moved;
  }
  if(sliding){
    const blocked=moved<.35*Math.hypot(dx,dz);
    if(blocked || !actor.onGround || slideJump)endSlide(actor,time,blocked);
  }
  if (!sliding && moved > .001 && actor.onGround && game.state.time - actor.lastStep > (mode === 'rush' ? .29 : mode === 'run' ? .36 : mode === 'sneak' ? .66 : .75)) {
    actor.lastStep = game.state.time;
    if (effects) game.emit('step', actor, { mode, surface: game.world.materialAt(actor.x, actor.z, actor.y) });
    if (effects && !actor.isPlayer && actor.controllerType !== 'human' && game.random() < .33) game.emit('rustle', actor, { mode });
  }
}
export function moveBody(game, actor, dx, dy, dz) {
  const before = point(actor), projectedY = game.world.layeredTerrain ? actor.y + dy : Math.max(0, actor.y + dy);
  const residents = game.state.zombies.filter(z=>z.alive&&z!==actor);
  const residentBodies = game.config.networkSlice ? residents.map(z=>z.seat?{...z,...zombiePosition(z,game.state.time)}:z) : residents;
  const bodies = [...game.actors.filter(a => a.alive), ...game.hostages.filter(h => h.alive!==false && !h.rescued), ...residentBodies].filter(other => other !== actor &&
    projectedY < other.y + other.height - .02 && projectedY + actor.height > other.y + .02);
  let x = actor.x, z = actor.z, remainingX = dx, remainingZ = dz;
  actor.blockedBy = null;
  // Sweep the horizontal capsules to their first contact, then retain only
  // tangential motion. The same radius and rule apply to the human, bots and
  // hostages. Static collision still owns every resulting displacement.
  for (let pass = 0; pass < 3; pass++) {
    const length2 = remainingX * remainingX + remainingZ * remainingZ;
    if (length2 < 1e-12) break;
    let first = 1, blocker = null;
    for (const other of bodies) {
      const radius = actor.radius + other.radius + .002;
      const mx = x - other.x, mz = z - other.z, c = mx * mx + mz * mz - radius * radius;
      const dot = mx * remainingX + mz * remainingZ;
      if (c < -1e-7) {
        // Existing overlap can arise from a test fixture or a vertical landing;
        // permit separating movement, never deeper penetration.
        if (dot < 0) { first = 0; blocker = other; }
        continue;
      }
      if (dot >= 0) continue;
      const discriminant = dot * dot - length2 * c;
      if (discriminant < 0) continue;
      const t = (-dot - Math.sqrt(discriminant)) / length2;
      if (t >= -1e-7 && t < first) { first = Math.max(0, t); blocker = other; }
    }
    x += remainingX * first; z += remainingZ * first;
    if (!blocker) break;
    actor.blockedBy = blocker.id;
    const normalLength = Math.hypot(x - blocker.x, z - blocker.z) || 1;
    const nx = (x - blocker.x) / normalLength, nz = (z - blocker.z) / normalLength;
    remainingX *= 1 - first; remainingZ *= 1 - first;
    const inward = remainingX * nx + remainingZ * nz;
    if (inward < 0) { remainingX -= inward * nx; remainingZ -= inward * nz; }
    // Keep a tiny contact margin; it prevents floating point error from making
    // a body appear inside its neighbour on the next fixed step.
    x += nx * .00001; z += nz * .00001;
  }
  const result = game.world.move(actor, x - before.x, dy, z - before.z) ?? {};
  // A static wall correction may push sideways into a neighbour. Reject that
  // tentative horizontal displacement instead of pushing either body through
  // geometry; this is collision rollback, never a navigation escape.
  for (const other of bodies) {
    const radius = actor.radius + other.radius;
    if (distance(actor, other) < radius - .0001 && distance(actor, other) < distance(before, other) - .0001) {
      actor.x = before.x; actor.z = before.z; actor.blockedBy = other.id; result.collision = true; break;
    }
  }
  return result;
}
