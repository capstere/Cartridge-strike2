/** Last-N frame-duration average; statistics only, never a frame limiter.
 * Fixed storage and a rolling sum avoid Array.shift/reduce every rendered frame.
 */
export class FrameTimeWindow {
  constructor(capacity = 120) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 4096) throw new RangeError('Invalid frame window');
    this.samples = new Float64Array(capacity);
    this.clear();
  }
  clear() { this.count = 0; this.cursor = 0; this.sum = 0; }
  push(milliseconds) {
    if (!Number.isFinite(milliseconds) || milliseconds < 0) return this.fps;
    if (this.count === this.samples.length) this.sum -= this.samples[this.cursor];
    else this.count++;
    this.samples[this.cursor] = milliseconds;
    this.sum += milliseconds;
    this.cursor = (this.cursor + 1) % this.samples.length;
    return this.fps;
  }
  get mean() { return this.count ? this.sum / this.count : 0; }
  get fps() { return this.mean > 0 ? Math.round(1000 / this.mean) : 0; }
}
