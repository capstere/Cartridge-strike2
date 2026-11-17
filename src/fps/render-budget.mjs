/** Presentation cadence only: never throttles a live, visible match.
 * Menus/paused games need at most ten world redraws per second; browser UI
 * remains event driven. Hidden pages perform no game/render work.
 */
export class RenderBudget {
  constructor(idleInterval = 100) {
    if (!Number.isFinite(idleInterval) || idleInterval <= 0) throw new RangeError('Invalid idle interval');
    this.interval = idleInterval;
    this.lastAt = -Infinity;
    this.mode = null;
    this.stillOwner = null;
    this.stillRevision = null;
    this.stats = {rendered:0, active:0, idle:0, skipped:0, hidden:0};
  }
  invalidate() {
    this.stillOwner = this.stillRevision = null;
    this.lastAt = -Infinity;
  }
  shouldRender(now, hidden = false, idle = false, stillOwner = null, stillRevision = null) {
    if (!Number.isFinite(now)) return false;
    const mode = hidden ? 'hidden' : idle ? 'idle' : 'active';
    const changed = mode !== this.mode;
    this.mode = mode;
    if (hidden || !idle || stillOwner === null) this.stillOwner = this.stillRevision = null;
    if (hidden) { this.stats.hidden++; return false; }
    // Only an explicitly static scene may retain its last pixels. Ordinary
    // menus/pauses and every active match retain their existing cadence.
    if (idle && stillOwner !== null && !changed && this.stillOwner === stillOwner && this.stillRevision === stillRevision) {
      this.stats.skipped++; return false;
    }
    if (idle && !changed && now >= this.lastAt && now - this.lastAt < this.interval - .001) {
      this.stats.skipped++; return false;
    }
    this.lastAt = now;
    this.stillOwner = idle ? stillOwner : null;
    this.stillRevision = idle && stillOwner !== null ? stillRevision : null;
    this.stats.rendered++;
    this.stats[mode]++;
    return true;
  }
}
