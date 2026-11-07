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
    this.stats = {rendered:0, active:0, idle:0, skipped:0, hidden:0};
  }
  shouldRender(now, hidden = false, idle = false) {
    if (!Number.isFinite(now)) return false;
    const mode = hidden ? 'hidden' : idle ? 'idle' : 'active';
    const changed = mode !== this.mode;
    this.mode = mode;
    if (hidden) { this.stats.hidden++; return false; }
    if (idle && !changed && now >= this.lastAt && now - this.lastAt < this.interval - .001) {
      this.stats.skipped++; return false;
    }
    this.lastAt = now;
    this.stats.rendered++;
    this.stats[mode]++;
    return true;
  }
}
