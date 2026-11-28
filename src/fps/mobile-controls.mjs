import {normalizeTouchProfile} from './mobile-profile.mjs';
import {stickRush} from './rush.mjs';
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
  constructor({ root, onLook, onAction, onFirePress, onModeChange, settings={}, scopeTrigger, cancelThrow }) {
    this.settings=normalizeTouchProfile(settings);
    this.autoDetected=isTouchDevice();
    this.enabled=this.settings.touchMode==='on' || (this.settings.touchMode==='auto' && this.autoDetected);
    this.onModeChange=onModeChange;
    this.scopeTrigger=scopeTrigger;
    this.cancelThrow=cancelThrow;
    this.onFirePress=onFirePress;
    this.touchCapable = this.autoDetected || (typeof navigator !== 'undefined' && navigator.maxTouchPoints > 0);
    this.root = root;
    this.onLook = onLook;
    this.onAction = onAction;
    this.state = { forward: 0, strafe: 0, fire: false, jump: false, crouch: false, interact: false, sneak: false, sprint:false };
    this.stickId = null;
    this.lookId = null;
    this.buttonPointers = new Map();
    this.visible = false;
    if (!root) return;
    this.buttonDrags=new Map();
    const doc=root.ownerDocument;
    if (doc) {
      this.runControl=doc.createElement('button');
      this.runControl.type='button';this.runControl.className='mobile-button mobile-run';
      this.runControl.dataset.mobileAction='run';this.runControl.textContent='RUN';
      this.runControl.setAttribute('aria-label','Toggle running while moving forward');
      root.append(this.runControl);
    }

    if (this.enabled) document.documentElement.classList.add('touch-fps');
    // A touchscreen laptop or a newly emulated device may report a fine
    // primary pointer when the page boots. Install once, then let the first
    // real finger activate the controls on the same page.
    document.addEventListener('pointerdown', event => {
      const touch = event.pointerType === 'touch';
      const mouse = event.pointerType === 'mouse' && !isTouchDevice() && !root.contains(event.target);
      if ((!touch && !mouse) || !this.touchCapable || this.settings.touchMode!=='auto') return;
      this.autoDetected=touch;
      this.applyMode();
    }, {capture:true});
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
      const forward=distance ? -dy/distance : 0;
      this.lastStick={radius:distance/radius,forward};
      this.updateRun();
      stick.classList.toggle('rushing',this.state.sprint);
      this.state.strafe = clamp(dx / radius, -1, 1);
      this.state.forward = clamp(-dy / radius, -1, 1);
    };
    const endStick = e => {
      if (e.pointerId !== this.stickId) return;
      this.runControl?.setAttribute('aria-pressed','false');
      this.stickId = null;this.runButton=false;this.lastStick=null;
      this.state.strafe = this.state.forward = 0;
      this.state.sprint=false;
      stick.classList.remove('active','rushing');
      nub.style.transform = '';
    };
    zone.addEventListener('pointerdown', e => {
      if (!this.visible || this.stickId !== null || (e.pointerType === 'mouse' && e.button !== 0)) return;
      e.preventDefault();
      const rect = zone.getBoundingClientRect();
      const radius = 55;
      const fixed=this.settings.touchStick==='fixed';
      const center=this.fixedStickCenter(rect);
      if (fixed && Math.hypot(e.clientX-center.x,e.clientY-center.y)>radius*1.25)return;
      this.stickId=e.pointerId;
      this.stickX = fixed ? center.x : clamp(e.clientX, rect.left+radius, rect.right-radius);
      this.stickY = fixed ? center.y : clamp(e.clientY, rect.top+radius, rect.bottom-radius);
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
        this.buttonDrags.delete(e.pointerId);
        if (action==='fire' && this.scopedFinger===e.pointerId) {
          this.scopedFinger=null;
          const shot=this.scopeTrigger?.(e.type==='pointerup'?'release':'cancel');
          if (shot) { this.firePulse=true; this.onFirePress?.(); }
        } else if (action==='fire' && e.type!=='pointerup' && ![...this.buttonPointers.values()].includes(button)) this.cancelThrow?.();
        if (![...this.buttonPointers.values()].includes(button)) button.classList.remove('pressed');
        if (HELD.has(action)) this.state[action] = [...this.buttonPointers.values()].some(b => b.dataset.mobileAction === action);
      };
      button.addEventListener('pointerdown', e => {
        if (!this.visible || (e.pointerType === 'mouse' && e.button !== 0)) return;
        e.preventDefault();
        e.stopPropagation();
        if (this.buttonPointers.has(e.pointerId) || (action==='fire' && this.scopedFinger!=null)) return;
        this.buttonPointers.set(e.pointerId, button);
        try {button.setPointerCapture(e.pointerId);} catch {}
        button.classList.add('pressed');
        if(action==='crouch' && !this.state.crouch)this.crouchEdge=true;
        if (action==='run') {this.runButton=!this.runButton;this.updateRun();return;}
        if (action==='fire') {
          this.buttonDrags.set(e.pointerId,[e.clientX,e.clientY]);
          if (this.scopeTrigger?.('press')) {
            this.scopedFinger=e.pointerId;
            return;
          }
          if (!this.state.fire) onFirePress?.();
        }
        if (HELD.has(action)) this.state[action] = true;
        else this.onAction(action);
      });
      button.addEventListener('pointermove',e=>{
        const previous=this.buttonDrags.get(e.pointerId);
        if (!previous || this.buttonPointers.get(e.pointerId)!==button) return;
        e.preventDefault();
        this.onLook(e.clientX-previous[0],e.clientY-previous[1]);
        this.buttonDrags.set(e.pointerId,[e.clientX,e.clientY]);
      });
      for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, release);
      button.addEventListener('contextmenu', e => e.preventDefault());
    }
    this.applyProfile();
    window.addEventListener('resize',()=>this.positionFixedStick());
    root.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('blur', () => this.clear());
    window.addEventListener('orientationchange', () => this.clear());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.clear(); });
  }

  applyMode() {
    const enabled=this.settings.touchMode==='on' || (this.settings.touchMode==='auto' && this.autoDetected);
    if (enabled===this.enabled) return;
    this.clear();
    if (!enabled) this.show(false);
    this.enabled=enabled;
    document.documentElement.classList.toggle('touch-fps',enabled);
    if (enabled) this.setAutoFire(this.autoFire);
    this.onModeChange?.(enabled);
  }

  applyProfile() {
    this.applyMode();
    if (this.runControl) this.runControl.hidden=this.settings.touchRun!=='button';
    if (this.stick) this.stick.classList.toggle('fixed',this.settings.touchStick==='fixed');
    this.positionFixedStick();
  }

  fixedStickCenter(rect) {
    const row=this.settings.touchLayout?.stick;
    if (Number.isFinite(row?.x)&&Number.isFinite(row?.y)) {
      const bounds=this.root.getBoundingClientRect(),radius=(row.size||100)/2;
      return {x:clamp(bounds.left+bounds.width*row.x,rect.left+radius,rect.right-radius),
        y:clamp(bounds.top+bounds.height*row.y,rect.top+radius,rect.bottom-radius)};
    }
    return {x:(rect.left+rect.right)/2,y:rect.top+(rect.bottom-rect.top)*.55};
  }

  positionFixedStick() {
    if (this.settings.touchStick==='fixed' && this.stick && this.stickId===null) {
      const zone=this.stickZone.getBoundingClientRect(),center=this.fixedStickCenter(zone);
      this.stick.style.left=(center.x-zone.left)+'px';this.stick.style.top=(center.y-zone.top)+'px';
    } else if (this.stickId===null && this.stick) {
      this.stick.style.left='50%';this.stick.style.top='55%';
    }
  }

  updateRun() {
    const {radius=0,forward=0}=this.lastStick||{};
    const buttonRun=this.runButton && radius>.4 && forward>.55;
    this.state.sprint=!!buttonRun || (this.settings.touchRun==='stick' && stickRush(this.state.sprint,radius,forward));
    this.stick?.classList.toggle('rushing',this.state.sprint);
    this.runControl?.setAttribute('aria-pressed',String(!!this.runButton));
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

  input() { const frame={...this.state,fire:this.state.fire||!!this.firePulse,crouchEdge:!!this.crouchEdge};this.crouchEdge=false;this.firePulse=false;return frame; }

  // Weapon changes release held actions without stealing the thumbs' drag ownership.
  clearActions() {
    this.crouchEdge=false;this.firePulse=false;
    if (this.scopedFinger!=null) this.scopeTrigger?.('cancel');
    this.scopedFinger=null;
    this.buttonDrags?.clear();
    for (const action of HELD) this.state[action] = false;
    this.buttonPointers.clear();
    if (this.root) for (const button of this.root.querySelectorAll('.mobile-button')) button.classList.remove('pressed');
  }

  clear() {
    this.lastStick=null;this.runButton=false;this.clearActions();
    this.runControl?.setAttribute('aria-pressed','false');
    this.state.forward = this.state.strafe = 0;
    this.stickId = this.lookId = null;
    this.state.sprint=false;
    if (this.stick) this.stick.classList.remove('active','rushing');
    if (this.nub) this.nub.style.transform = '';
  }

  show(show, alive = true) {
    if (!this.enabled || !this.root) return;
    const opening=!this.visible && !!show;
    if (this.visible && !show) this.clear();
    this.visible = !!show;
    this.root.hidden = !show;
    if (opening) this.positionFixedStick();
    this.root.classList.toggle('mobile-dead', !alive);
    if (!alive) {
      this.clear();
      this.state.fire = this.state.jump = this.state.interact = this.state.crouch = this.state.sneak = false;
    }
  }

  attemptLandscape() {
    if (!this.enabled) return;
    // Both APIs are best effort. In particular, iOS Safari does not support
    // arbitrary-element fullscreen or programmatic orientation locking.
    try {
      if (!window.__csFlow?.fullscreen && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        const result = document.documentElement.requestFullscreen({ navigationUI: 'hide' });
        result?.catch?.(() => {});
      }
    } catch {}
    try { screen.orientation?.lock?.('landscape')?.catch?.(() => {}); } catch {}
  }
}
