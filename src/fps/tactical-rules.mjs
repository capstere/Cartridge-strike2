/**
 * Precision controls adapted to Cartridge Strike from Riposte: Frontline 5.6.0.
 * References: 09qd-visee.js (touch friction), 07c-controller.js (ADS spread and
 * delayed auto-reload), 07ca-recul.js (ADS multiplier). Copyright 2026 BenDBSS.
 * MIT attribution retained in licenses/riposte-MIT.txt and riposte-NOTICE.md.
 * No aim snapping/tracking, imported animations or restricted assets.
 */
import { WEAPONS } from './config.mjs';

export const clamp01 = value => Math.max(0, Math.min(1, Number(value) || 0));
export const canAim = weapon => {
  const w = WEAPONS[weapon];
  return !!w && !w.projectile && ['primary', 'pistol'].includes(w.slot);
};
export const aimFov = weapon => weapon === 'sniper' ? 24 : weapon === 'shotgun' ? 60 : 52;
export const isManualOnly = weapon => {
  const w = WEAPONS[weapon];
  return !w || !!w.projectile || ['grenade', 'bomb', 'armor'].includes(w.slot);
};

/** Preserve old bot/hip-fire balance; precision reduces the human's cone only. */
export function shotSpread(actor, weapon) {
  const w = typeof weapon === 'string' ? WEAPONS[weapon] : weapon;
  if (!w) return 0;
  const old = (actor.moving > .3 ? w.movingSpread : w.spread) + (actor.recoil || 0) * .18 + (actor.flash || 0) * .12;
  if (!actor.isPlayer || actor.bot || !canAim(w.id)) return old;
  const aim = clamp01(actor.aimAmount);
  // Same direction as Riposte: precision reduces movement/bloom, not damage.
  return old * (1 - .65 * aim * aim);
}

/** Friction slows a finger near a VISIBLE enemy. It never changes the aim itself. */
export function aimFriction(game, yaw, pitch) {
  const p = game?.player;
  if (!p?.alive || game.phase !== 'active' || game.state.paused || p.flash >= .3 ||
      p.action || !canAim(p.weapon) || !Number.isFinite(yaw) || !Number.isFinite(pitch)) return 1;
  const w = WEAPONS[p.weapon], from = { x: p.x, y: p.y + p.height - .12, z: p.z };
  const cp = Math.cos(pitch), forward = { x: -Math.sin(yaw) * cp, y: Math.sin(pitch), z: -Math.cos(yaw) * cp };
  let friction = 1;
  for (const other of game.actors) {
    if (!other.alive || other === p || !other.team || other.team === p.team) continue;
    // Closest height on the body to the sightline avoids only helping at chest height.
    const flat = Math.hypot(other.x - from.x, other.z - from.z);
    const to = { x: other.x, y: Math.max(other.y + .12, Math.min(other.y + other.height - .08,
      from.y + Math.tan(pitch) * flat)), z: other.z };
    const dx = to.x - from.x, dy = to.y - from.y, dz = to.z - from.z;
    const distance = Math.hypot(dx, dy, dz);
    if (distance < .5 || distance > Math.min(w.range, 60)) continue;
    const angle = Math.acos(Math.max(-1, Math.min(1, (dx * forward.x + dy * forward.y + dz * forward.z) / distance)));
    const radius = Math.atan2(other.radius || .2, distance), cone = radius + .065;
    if (angle > cone) continue;
    if (!game.world.segmentClear(from, to, { vision: false }) || game.smokeBlocks(from, to)) continue;
    friction = Math.min(friction, 1 - .4 * clamp01((cone - angle) / Math.max(.001, cone)));
  }
  return friction;
}

/** Stable empty magazine for 280 ms triggers the existing reload action once. */
export class EmptyMagazineReload {
  constructor() { this.reset(); }
  reset() { this.item = null; this.actor = null; this.since = null; this.weapon = null; }
  tick(game, enabled = true, interacting = false) {
    const p = game?.player, w = WEAPONS[p?.weapon];
    const allowed = enabled && p?.alive && game.phase === 'active' && !game.state.paused &&
      !p.action && !interacting && !p.reloadUntil && w?.reload && ['primary', 'pistol'].includes(w.slot);
    if (!allowed) { this.reset(); return false; }
    const item = game.item(p);
    if (!item || item.ammo > 0 || !(item.reserve > 0)) { this.reset(); return false; }
    if (item !== this.item || p !== this.actor || p.weapon !== this.weapon || this.since === null) {
      this.item = item; this.actor = p; this.weapon = p.weapon; this.since = game.state.time;
      return false;
    }
    if (game.state.time - this.since < .28 - 1e-8) return false;
    this.reset();
    return game.reload(p);
  }
}

/** Reach every usable firearm/knife with one touch; never select an explosive. */
export function nextWeapon(actor) {
  const ids = [actor?.inventory?.primary?.id, actor?.inventory?.pistol?.id,
    actor?.inventory?.knife?.id].filter(Boolean);
  if (!ids.length) return null;
  return ids[(ids.indexOf(actor.weapon) + 1) % ids.length];
}
