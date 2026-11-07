/** Shared deterministic grenade mechanics. No renderer, input or random state.
 * Extracted without changing the original Cartridge Strike launch/bounce rules.
 * Riposte's nadeArcUpdate inspired the preview; this version also predicts bounces.
 */
export const GRENADE_TYPES = Object.freeze(['he', 'flash', 'smoke']);
const point = g => ({x:g.x, y:g.y, z:g.z});
const EPS = 1e-8;

export function grenadeLaunch(actor, config, time = 0, type = actor.weapon) {
  const pitch = actor.pitch + .15, cp = Math.cos(pitch);
  return {
    x:actor.x, y:actor.y + actor.height - .12, z:actor.z,
    type, ownerId:actor.id,
    vx:-Math.sin(actor.yaw) * cp * config.grenadeSpeed,
    vy:Math.sin(pitch) * config.grenadeSpeed + 1.8,
    vz:-Math.cos(actor.yaw) * cp * config.grenadeSpeed,
    radius:config.grenadeRadius, deadline:time + config.grenadeFuse, lastBounce:-Infinity,
  };
}

/** Mutates only the supplied projectile; returns whether it hit world geometry.
 * Keep operation order identical to the original updateGrenades integrator.
 */
export function advanceGrenade(g, world, gravity, dt) {
  g.vy -= gravity * dt;
  const displacement = {x:g.vx * dt, y:g.vy * dt, z:g.vz * dt};
  const length = Math.hypot(displacement.x, displacement.y, displacement.z);
  const dir = length ? {x:displacement.x / length, y:displacement.y / length, z:displacement.z / length} : {x:0,y:-1,z:0};
  const hit = world.raycast(g, dir, length + g.radius, {vision:false});
  if (hit) {
    const travel = Math.max(0, hit.distance - g.radius);
    g.x += dir.x * travel; g.y += dir.y * travel; g.z += dir.z * travel;
    const n = hit.normal ?? {x:0,y:1,z:0}, dot = g.vx * n.x + g.vy * n.y + g.vz * n.z;
    g.vx = (g.vx - 1.6 * dot * n.x) * .72;
    g.vy = (g.vy - 1.6 * dot * n.y) * .72;
    g.vz = (g.vz - 1.6 * dot * n.z) * .72;
  } else {g.x += displacement.x; g.y += displacement.y; g.z += displacement.z;}
  if (g.y < g.radius) {g.y = g.radius; g.vy = Math.abs(g.vy) * .35; g.vx *= .82; g.vz *= .82;}
  return !!hit;
}

/** Static snapshot prediction: dynamic doors can move after releasing the throw.
 * Gameplay advances a newly spawned grenade in its creation tick, then through
 * its inclusive fuse deadline. We mirror that timing rather than approximating
 * with a separate ballistic formula. Never alters inventory, world or event RNG.
 */
export function predictGrenade(actor, config, world) {
  const dt = config.fixedStep;
  if (!(dt > 0) || !Number.isFinite(dt) || !(config.grenadeFuse >= 0) || !Number.isFinite(config.grenadeFuse)) return null;
  const steps = Math.ceil((config.grenadeFuse - EPS) / dt) + 1;
  if (steps < 1 || steps > 600) return null;
  const grenade = grenadeLaunch(actor, config);
  if (![grenade.x,grenade.y,grenade.z,grenade.vx,grenade.vy,grenade.vz].every(Number.isFinite)) return null;
  const points = [point(grenade)];
  let last = points[0], bounces = 0;
  for (let i = 0; i < steps; i++) {
    const hit = advanceGrenade(grenade, world, config.gravity, dt);
    if (hit && i * dt - grenade.lastBounce > .12) {bounces++;grenade.lastBounce = i * dt;}
    if (Math.hypot(grenade.x-last.x,grenade.y-last.y,grenade.z-last.z) >= .16 || i === steps-1) {
      last = point(grenade); points.push(last);
    }
  }
  return {points, endpoint:point(grenade), bounces, steps, fuse:config.grenadeFuse};
}

/** Risk at the grenade's CURRENT location, respecting the actual blast/flash
 * cover rules. Not a radar: smoke/solid cover hide the warning, and no enemy
 * positions are revealed. A moving projectile can enter/leave the danger area.
 */
export function grenadeThreat(game, player = game.player) {
  if (!player?.alive || game.phase !== 'active' || game.state.paused || player.flash >= .8) return null;
  const eye = {x:player.x,y:player.y+player.height-.12,z:player.z};
  let best = null;
  for (const g of game.state.grenades) {
    const left = g.deadline - game.state.time;
    if (!(left > 0) || !['he','flash'].includes(g.type)) continue;
    if (g.type === 'he') {
      if (player.spawnProtectedUntil > game.state.time) continue;
      const owner = game.actors.find(a => a.id === g.ownerId);
      if (!game.config.friendlyFire && owner?.team === player.team) continue;
    }
    const origin = {x:g.x,y:g.y+.08,z:g.z};
    const distance = Math.hypot(origin.x-eye.x,origin.y-eye.y,origin.z-eye.z);
    const radius = g.type === 'he' ? game.config.heRadius : Math.min(8,game.config.flashRadius);
    if (!(distance < radius)) continue;
    const target = g.type === 'he' ? {...eye,y:player.y+player.height*.55} : eye;
    if (!game.world.segmentClear(origin,target,{vision:g.type==='flash'})) continue;
    if (game.smokeBlocks(eye,origin)) continue;
    const bearing = player.yaw - Math.atan2(-(g.x-player.x),-(g.z-player.z));
    const angle = Math.atan2(Math.sin(bearing),Math.cos(bearing));
    const candidate = {id:g.id,type:g.type,left,distance,angle};
    // Earliest detonation wins; distance breaks equal-fuse ties.
    if (!best || left < best.left-EPS || Math.abs(left-best.left)<EPS && distance < best.distance) best=candidate;
  }
  return best;
}
