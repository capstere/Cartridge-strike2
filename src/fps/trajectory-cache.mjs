import { predictGrenade } from './grenade-physics.mjs';

const ACTOR_KEYS = ['x', 'y', 'z', 'height', 'yaw', 'pitch'];
const CONFIG_KEYS = ['fixedStep', 'grenadeFuse', 'grenadeSpeed', 'grenadeRadius', 'gravity'];
const BOX_KEYS = ['x', 'y', 'z', 'w', 'h', 'd', 'angle', 'cos', 'sin'];
const MAX_LEAVES = 256;

/** One exact-input result for the current immutable floor + moving door boxes.
 * No rounding, approximate aim buckets, collision edits or gameplay RNG.
 * Unknown worlds fall back to normal prediction. A caller that edits the static
 * layout in place must clear() this cache; glass break/reset revisions are tracked.
 */
export class TrajectoryCache {
  constructor(predict = predictGrenade) {
    this.predict = predict;
    this.pose = new Float64Array(ACTOR_KEYS.length + CONFIG_KEYS.length);
    this.boxes = new Float64Array(0);
    this.stats = {predictions:0, reuses:0, fallbacks:0};
    this.clear();
  }
  clear() {
    this.result = null; this.world = null; this.staticBoxes = null;
    this.staticCount = 0; this.raycast = null; this.leaves = null;
    this.weapon = null; this.leafCount = 0; this.glassRevision = -1;
  }
  read(actor, config, world) {
    const leaves = world?.doors?.boxes;
    // Explicitly bounded to this game's collision contract. Do not cache a
    // foreign/custom world whose moving collision sources are unknown.
    let known = Array.isArray(leaves) && leaves.length <= MAX_LEAVES && Array.isArray(world.staticBoxes);
    let same = !!this.result && known && this.world === world && this.raycast === world.raycast &&
      this.staticBoxes === world.staticBoxes && this.staticCount === world.staticBoxes.length &&
      this.leaves === leaves && this.leafCount === leaves.length && this.weapon === actor.weapon &&
      this.glassRevision === (world.glass?.revision ?? 0);
    let i = 0;
    for (const key of ACTOR_KEYS) {
      const value = actor[key];
      if (!Number.isFinite(value)) known = false;
      if (this.pose[i++] !== value) same = false;
    }
    for (const key of CONFIG_KEYS) {
      const value = config[key];
      if (!Number.isFinite(value)) known = false;
      if (this.pose[i++] !== value) same = false;
    }
    if (known) {
      i = 0;
      for (const box of leaves) for (const key of BOX_KEYS) {
        const value = box?.[key];
        if (!Number.isFinite(value)) known = false;
        if (this.boxes[i++] !== value) same = false;
      }
    }
    if (known && same) { this.stats.reuses++; return this.result; }

    this.stats.predictions++;
    const result = this.predict(actor, config, world);
    if (!known || !result) {
      this.stats.fallbacks++; this.clear(); return result;
    }
    this.world = world; this.raycast = world.raycast; this.staticBoxes = world.staticBoxes;
    this.staticCount = world.staticBoxes.length; this.leaves = leaves;
    this.leafCount = leaves.length; this.weapon = actor.weapon; this.glassRevision = world.glass?.revision ?? 0;
    i = 0;
    for (const key of ACTOR_KEYS) this.pose[i++] = actor[key];
    for (const key of CONFIG_KEYS) this.pose[i++] = config[key];
    const size = leaves.length * BOX_KEYS.length;
    if (this.boxes.length !== size) this.boxes = new Float64Array(size);
    i = 0;
    for (const box of leaves) for (const key of BOX_KEYS) this.boxes[i++] = box[key];
    this.result = result;
    return result;
  }
}
