/**
 * Player camera recoil adapted from Riposte: Frontline's MIT-licensed
 * src/07ca-recul.js + per-weapon recoil profiles in src/06i-armes.js.
 * Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt and NOTICE.md.
 *
 * The original actor.recoil bloom and the bot AI are left unchanged.
 * This system affects the human player's sightline, so uncontrolled bursts
 * climb off the target; short bursts partly return toward the start point.
 */
export const RECOIL = Object.freeze({
  cat: Object.freeze({
    ar: { mul: 1.55, back: .70 },
    smg: { mul: 1.45, back: .70 },
    pistol: { mul: 1.30, back: .85 },
    sniper: { mul: 1.15, back: .90 },
    shotgun: { mul: 1.15, back: .90 },
  }),
  crouch: .75, move: 1.2, air: 1.5,
  input: { kb: 1, touch: .75 },
  first: .85, peak: 1.25, ramp: 5,
  delay: .10, rate: 7,
});

// Each original gun has its own profile, mapped to the closest Riposte weapon
// class (AR-47/AK-47, CR-4/M4A1, Vector C/MP5, etc).
export const RECOIL_WEAPONS = Object.freeze({
  ar47: { cat: 'ar', pattern: 'climb', v: .0145, h: .0075 },
  cr4: { cat: 'ar', pattern: 'climb', v: .0105, h: .0045 },
  smg: { cat: 'smg', pattern: 'smg', v: .0078, h: .0062 },
  p9: { cat: 'pistol', pattern: 'rand', v: .019, h: .008 },
  p12: { cat: 'pistol', pattern: 'rand', v: .023, h: .009 },
  shotgun: { cat: 'shotgun', pattern: 'rand', v: .046, h: .016 },
  sniper: { cat: 'sniper', pattern: 'rand', v: .045, h: .010 },
  // Special weapons were not in Riposte: heavier kick, same recovery model.
  bazooka: { cat: 'sniper', pattern: 'rand', v: .060, h: .015 },
});

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const lerp = (a, b, t) => a + (b - a) * t;

export class PlayerRecoil {
  constructor() { this.reset(); }

  reset() {
    this.weapon = null;
    this.count = 0;
    this.pending = 0;
    this.lastShotAt = -Infinity;
    this.armed = false;
  }

  /** Called only for the human player's actual successful gunshot event. */
  shot(weapon, actor, time, device = 'kb', random = Math.random) {
    const d = RECOIL_WEAPONS[weapon];
    if (!d) return { pitch: 0, yaw: 0 };
    if (weapon !== this.weapon || time - this.lastShotAt > .22) this.count = 0;
    else this.count++;
    this.weapon = weapon;
    this.lastShotAt = time;
    this.armed = false;
    const k = RECOIL.cat[d.cat];
    let mult = k.mul * lerp(1, .66, clamp(actor.aimAmount || 0, 0, 1)) * (actor.crouching ? RECOIL.crouch : 1) * (RECOIL.input[device] || 1);
    if (actor.moving > 2.5) mult *= RECOIL.move;
    if (!actor.onGround) mult *= RECOIL.air;

    // Riposte's five-shot rising climb / wandering SMG / random single-shot kick.
    const n = this.count;
    let rise = d.v * mult * lerp(.9, 1.1, random());
    let drift;
    if (d.pattern === 'climb') {
      rise *= lerp(RECOIL.first, RECOIL.peak, Math.min(1, n / RECOIL.ramp));
      drift = (Math.sin(n * .55 + .6) * 1.2 + (random() - .5) * .6) * d.h;
    } else if (d.pattern === 'smg') {
      rise *= n ? 1 : RECOIL.first + .1;
      drift = (random() - .5) * 2.6 * d.h;
    } else {
      drift = (random() - .5) * 2 * d.h;
    }
    this.pending = Math.min(1.5, this.pending + rise);
    return { pitch: rise, yaw: drift * mult };
  }

  /** Dragging the sight back down compensates already accumulated climb. */
  counter(manualPitchChange) {
    if (manualPitchChange < 0) this.pending = Math.max(0, this.pending + manualPitchChange);
  }

  /** Returns the upward-aim offset to remove this frame after the trigger rests. */
  recover(dt, time) {
    if (!(this.pending > 0)) { this.pending = 0; return 0; }
    if (time - this.lastShotAt < RECOIL.delay) { this.armed = false; return 0; }
    if (!this.armed) {
      this.armed = true;
      this.pending *= RECOIL.cat[RECOIL_WEAPONS[this.weapon]?.cat]?.back ?? .7;
    }
    const recovered = this.pending * (1 - Math.exp(-RECOIL.rate * Math.max(0, dt)));
    this.pending -= recovered;
    if (this.pending < .0001) this.pending = 0;
    return recovered;
  }
}
