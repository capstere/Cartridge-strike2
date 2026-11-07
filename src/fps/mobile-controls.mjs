// Dedicated dual-stick touchscreen controls for Cartridge Strike.
// Shares the same Game input contract as keyboard/mouse; never requires Pointer Lock.
export function isTouchDevice() {
  return typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches
    && (navigator.maxTouchPoints > 0 || 'ontouchstart' in window);
}

const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));
const HELD = new Set(['fire', 'jump', 'crouch', 'interact', 'sneak']);

export class MobileControls {
  constructor({ root, onLook, onAction }) {
    this.enabled = isTouchDevice();
    this.root = root;
    this.onLook = onLook;
    this.onAction = onAction;
    this.state = { forward: 0, strafe: 0, fire: false, jump: false, crouch: false, interact: false, sneak: false };
    this.stickId = null;
    this.lookId = null;
    this.buttonPointers = new Map();
    this.visible = false;
    if (!this.enabled || !root) return;

    document.documentElement.classList.add('touch-fps');
    const zone = root.querySelector('[data-mobile-stick-zone]');
    const stick = root.querySelector('[data-mobile-stick]');
    const nub = root.querySelector('[data-mobile-nub]');
    this.stickZone = zone;
    this.stick = stick;
    this.nub = nub;

    const updateStick = e => {
      const radius = Math.max(38, Math.min(60, zone.clientHeight * 0.25));
      const dx = e.clientX - this.stickX, dy = e.clientY - this.stickY;
      const distance = Math.hypot(dx, dy);
      const scale = distance > radius ? radius / distance : 1;
      nub.style.transform = 'translate(' + (dx * scale).toFixed(1) + 'px,' + (dy * scale).toFixed(1) + 'px)';
      this.state.strafe = clamp(dx / radius, -1, 1);
      this.state.forward = clamp(-dy / radius, -1, 1);
    };
    const endStick = e => {
      if (e.pointerId !== this.stickId) return;
      this.stickId = null;
      this.state.strafe = this.state.forward = 0;
      stick.classList.remove('active');
      nub.style.transform = '';
    };
    zone.addEventListener('pointerdown', e => {
      if (!this.visible || this.stickId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.stickId = e.pointerId;
      const rect = zone.getBoundingClientRect();
      const radius = 55;
      this.stickX = clamp(e.clientX, rect.left + radius, rect.right - radius);
      this.stickY = clamp(e.clientY, rect.top + radius, rect.bottom - radius);
      stick.style.left = (this.stickX - rect.left) + 'px';
      stick.style.top = (this.stickY - rect.top) + 'px';
      stick.classList.add('active');
      updateStick(e);
      try { zone.setPointerCapture(e.pointerId); } catch {}
    });
    zone.addEventListener('pointermove', e => {
      if (e.pointerId === this.stickId) { e.preventDefault(); updateStick(e); }
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(type, endStick);

    const look = root.querySelector('[data-mobile-look]');
    const endLook = e => {
      if (e.pointerId === this.lookId) this.lookId = null;
    };
    look.addEventListener('pointerdown', e => {
      if (!this.visible || this.lookId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      this.lookId = e.pointerId;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      try { look.setPointerCapture(e.pointerId); } catch {}
    });
    look.addEventListener('pointermove', e => {
      if (e.pointerId !== this.lookId) return;
      e.preventDefault();
      const dx = e.clientX - this.lookX, dy = e.clientY - this.lookY;
      this.lookX = e.clientX;
      this.lookY = e.clientY;
      this.onLook(dx, dy);
    });
    for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) look.addEventListener(type, endLook);

    for (const button of root.querySelectorAll('[data-mobile-action]')) {
      const action = button.dataset.mobileAction;
      const release = e => {
        const record = this.buttonPointers.get(e.pointerId);
        if (record !== button) return;
        this.buttonPointers.delete(e.pointerId);
        button.classList.remove('pressed');
        if (HELD.has(action)) this.state[action] = false;
      };
      button.addEventListener('pointerdown', e => {
        if (!this.visible || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.buttonPointers.has(e.pointerId)) return;
        this.buttonPointers.set(e.pointerId, button);
        button.classList.add('pressed');
        if (HELD.has(action)) this.state[action] = true;
        else this.onAction(action);
        try { button.setPointerCapture(e.pointerId); } catch {}
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      button.addEventListener('contextmenu', e => e.preventDefault());
    }
    root.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('orientationchange', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }

  /** Riposte default: crosshair auto-trigger, no on-screen trigger button. */
  setAutoFire(enabled) {
    this.autoFire = !!enabled;
    if (!this.enabled || !this.root) return;
    this.root.classList.toggle('mobile-auto-fire', this.autoFire);
    const trigger = this.root.querySelector('[data-mobile-action="fire"]');
    if (trigger) trigger.hidden = this.autoFire;
    if (this.autoFire) this.state.fire = false;
  }

  input() { return { ...this.state }; }

  clear() {
    this.state.forward = this.state.strafe = 0;
    for (const action of HELD) this.state[action] = false;
    this.stickId = this.lookId = null;
    this.buttonPointers.clear();
    if (this.stick) this.stick.classList.remove('active');
    if (this.nub) this.nub.style.transform = '';
    if (this.root) for (const button of this.root.querySelectorAll('.mobile-button')) button.classList.remove('pressed');
  }

  show(show, alive = true) {
    if (!this.enabled || !this.root) return;
    if (this.visible && !show) this.clear();
    this.visible = !!show;
    this.root.hidden = !show;
    this.root.classList.toggle('mobile-dead', !alive);
    if (!alive) {
      this.state.fire = this.state.jump = this.state.interact = this.state.crouch = this.state.sneak = false;
    }
  }

  attemptLandscape() {
    if (!this.enabled) return;
    // Both APIs are best effort. In particular, iOS Safari does not support
    // arbitrary-element fullscreen or programmatic orientation locking.
    try {
      if (!document.fullscreenElement && document.documentElement.requestFullscreen) {
        const result = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        result?.catch?.(() => {});
      }
    } catch {}
    try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch {}
  }
}
