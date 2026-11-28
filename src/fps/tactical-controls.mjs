import {normalizeTouchProfile} from './mobile-profile.mjs';
import {rushReady} from './rush.mjs';
import { WEAPONS } from './config.mjs';
import { advanceAim, canAim, aimFov, aimFriction, EmptyMagazineReload, nextWeapon, clamp01 } from './tactical-rules.mjs';

/** Input/presentation adapter; Game still owns ammo, shots, damage and reloads. */
export class TacticalControls {
  constructor({ settings, mobile, getGame, getModal, isInteracting, onAimChange }) {
    Object.assign(this, { settings, mobile, getGame, getModal, isInteracting, onAimChange });
    normalizeTouchProfile(settings);
    settings.autoReload = settings.autoReload !== false;
    settings.mobileAimAssist = settings.mobileAimAssist !== false;
    this.reload = new EmptyMagazineReload();
    this.wanted = false; this.amount = 0; this.game = null; this.weapon = null;
    this.round = 0; this.tap = null; this.previousTap = null;
    this.scope = document.createElement('div');
    this.scope.id = 'precision-scope'; this.scope.hidden = true;
    this.scope.setAttribute('aria-hidden', 'true');
    this.scope.innerHTML = '<div class="precision-lens"><i></i><b></b><span>PRECISION</span></div>';
    document.body.append(this.scope);
    if (mobile.root) {
      this.button = document.createElement('button');
      this.button.type = 'button'; this.button.className = 'mobile-button mobile-aim';
      this.button.dataset.tacticalAim = ''; this.button.textContent = 'AIM';
      this.button.setAttribute('aria-label', 'Toggle aim or hold to aim');
      this.button.setAttribute('aria-pressed', 'false');
      mobile.root.append(this.button);
      this.button.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if ((e.pointerType==='mouse' && e.button!==0) || this.aimFinger || !this.playing()) return;
        this.aimFinger={id:e.pointerId,at:e.timeStamp,previous:this.wanted,x:e.clientX,y:e.clientY};
        this.setAim(true);
        try {this.button.setPointerCapture(e.pointerId);} catch {}
      });
      this.button.addEventListener('pointermove',e=>{
        const finger=this.aimFinger;
        if (finger?.id!==e.pointerId) return;
        e.preventDefault();
        mobile.onLook(e.clientX-finger.x,e.clientY-finger.y);
        finger.x=e.clientX;finger.y=e.clientY;
      });
      const endAim=e=>{
        const finger=this.aimFinger;
        if (finger?.id!==e.pointerId) return;
        this.aimFinger=null;
        this.setAim(e.type==='pointerup' && e.timeStamp-finger.at<=350 && !finger.previous);
      };
      for (const type of ['pointerup','pointercancel','lostpointercapture']) this.button.addEventListener(type,endAim);
      this.button.addEventListener('click',e=>{
        if (e.detail===0) this.toggle();
      });
      this.installDoubleTap(mobile.root.querySelector('[data-mobile-look]'));
    }
    document.addEventListener('mousedown', e => {
      const canvas = document.getElementById('game');
      if (!mobile.enabled && e.button === 2 && e.target === canvas && document.pointerLockElement === canvas) {
        e.preventDefault(); this.setAim(true);
      }
    });
    window.addEventListener('mouseup', e => { if (!mobile.enabled && e.button === 2) this.setAim(false); });
    window.addEventListener('keydown', e => {
      if (!mobile.enabled && e.code === 'KeyF' && !e.repeat && document.pointerLockElement?.id === 'game') {
        e.preventDefault(); this.toggle();
      }
    });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('orientationchange', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  playing() {
    const g = this.getGame();
    return !!g?.player?.alive && !this.getModal() && !g.state.paused && ['buy', 'active'].includes(g.phase);
  }

  setAim(value) {
    const g = this.getGame();
    const wanted = !!value && this.playing() && canAim(g.player.weapon) && !g.player.reloadUntil;
    if (wanted !== this.wanted) { this.wanted = wanted; this.onAimChange?.(); }
    this.updateButton();
    return this.wanted;
  }
  toggle() { return this.setAim(!this.wanted); }

  installDoubleTap(zone) {
    if (!zone) return;
    zone.addEventListener('pointerdown', e => {
      if (!this.settings.touchDoubleAim || this.tap || !this.playing()) return;
      this.tap = { id: e.pointerId, x: e.clientX, y: e.clientY, at: e.timeStamp, moved: false };
    });
    zone.addEventListener('pointermove', e => {
      const t = this.tap;
      if (t && t.id === e.pointerId && Math.hypot(e.clientX - t.x, e.clientY - t.y) > 12) t.moved = true;
    });
    const end = e => {
      const t = this.tap;
      if (!t || t.id !== e.pointerId) return;
      this.tap = null;
      if (e.type !== 'pointerup' || t.moved || e.timeStamp - t.at > 220) { this.previousTap = null; return; }
      const prev = this.previousTap;
      if (prev && e.timeStamp - prev.at < 300 && Math.hypot(t.x - prev.x, t.y - prev.y) < 32) {
        this.previousTap = null; this.toggle();
      } else this.previousTap = { x: t.x, y: t.y, at: e.timeStamp };
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture']) zone.addEventListener(name, end);
  }

  scopedTrigger(phase) {
    if (phase==='press') {
      if (!this.settings.touchQuickShot || !this.playing() || this.getGame().player.weapon!=='sniper') return false;
      this.scopeHold={previous:this.wanted};
      this.setAim(true);
      return true;
    }
    const held=this.scopeHold;
    this.scopeHold=null;
    if (!held) return false;
    this.setAim(held.previous);
    return phase==='release' && this.playing() && this.getGame().player.weapon==='sniper';
  }

  reset() {
    this.aimFinger=null;this.scopeHold=null;
    this.wanted = false; this.padAim=false; this.amount = 0; this.tap = this.previousTap = null;
    this.reload.reset();
    const p = this.getGame()?.player;
    if (p) { p.aiming = false; p.aimAmount = 0; }
    this.scope.hidden = true; document.body.classList.remove('fps-aiming', 'fps-scoped');
    this.onAimChange?.(); this.updateButton();
  }

  update(dt) {
    const g = this.getGame(), p = g?.player;
    if (!p || !this.playing()) { this.reset(); return; }
    if (g !== this.game || p.weapon !== this.weapon || g.state.round !== this.round || p.lifeId !== this.lifeId || p.controlEpoch !== this.epoch) {
      const newRound = g !== this.game || g.state.round !== this.round;
      this.reset(); this.game = g; this.weapon = p.weapon; this.round = g.state.round;this.lifeId=p.lifeId;this.epoch=p.controlEpoch;
      if (newRound) this.mobile.clear();
      else this.mobile.clearActions();
    }
    if (!canAim(p.weapon) || p.reloadUntil || p.action) this.wanted = false;
    this.reload.tick(g, this.settings.autoReload, this.isInteracting());
    const target = (this.wanted || (this.padAim && canAim(p.weapon) && !p.action)) && !p.reloadUntil && rushReady(p) ? 1 : 0;
    this.amount = this.settings.reducedMotion ? target : advanceAim(this.amount,target,dt);
    p.aimAmount = clamp01(this.amount); p.aiming = target === 1;
    this.updateButton();
    this.syncTrigger();
  }

  updateButton() {
    const p = this.getGame()?.player;
    if (this.button) {
      this.button.hidden = !p || !p.alive || !canAim(p.weapon);
      this.button.classList.toggle('pressed', this.wanted);
      this.button.setAttribute('aria-pressed', String(this.wanted));
      this.button.textContent = this.wanted ? 'RELEASE' : 'AIM';
    }
  }

  syncTrigger() {
    if (!this.mobile.enabled) return;
    const p = this.getGame()?.player, w = WEAPONS[p?.weapon];
    const trigger = this.mobile.root?.querySelector('[data-mobile-action="fire"]');
    if (!trigger) return;
    const manual = w?.slot === 'grenade' || !!w?.projectile || (p?.weapon==='sniper' && this.settings.touchQuickShot);
    // Auto-fire must not make grenades/rocket launchers impossible to use.
    trigger.hidden = !!this.settings.mobileAutoFire && !manual;
    this.mobile.root.classList.toggle('manual-trigger-visible',!trigger.hidden);
    const label = w?.slot === 'grenade' ? 'THROW' : w?.projectile ? 'LAUNCH' : 'FIRE';
    if (trigger.textContent !== label) trigger.textContent = label;
    trigger.setAttribute('aria-label', label === 'THROW' ? 'Throw selected grenade' : 'Fire');
  }

  lookScale(touch, yaw, pitch) {
    const p = this.getGame()?.player;
    const base=this.settings.fieldOfView;
    const fov=base+(aimFov(p?.weapon)-base)*this.amount;
    const zoomScale=(.35+.65*fov/base)*(1+(this.settings.zoomSensitivity-1)*this.amount);
    return zoomScale * (touch && this.settings.mobileAimAssist && this.playing() ? aimFriction(this.getGame(), yaw, pitch) : 1);
  }

  cycleWeapon() {
    const g = this.getGame();
    if (!this.playing()) return false;
    const next = nextWeapon(g.player);
    if (!next) return false;
    this.reset();
    return g.select(next);
  }

  render(renderer) {
    const p = this.getGame()?.player;
    const amount = this.playing() && canAim(p?.weapon) ? this.amount : 0;
    const base=this.settings.fieldOfView;
    const fov=base+(aimFov(p?.weapon)-base)*amount;
    if (Math.abs(renderer.camera.fov - fov) > .005) {
      renderer.camera.fov = fov; renderer.camera.updateProjectionMatrix();
    }
    const scoped = p?.weapon === 'sniper' && amount > .92;
    this.scope.hidden = !scoped;
    const crosshair=document.getElementById('crosshair');
    const opacity=Math.max(0,1-(p?.rushWeight||0)*2).toFixed(2);
    if(crosshair && crosshair.style.opacity!==opacity)crosshair.style.opacity=opacity;
    document.body.classList.toggle('fps-scoped', scoped);
    document.body.classList.toggle('fps-aiming', amount > .1);
    document.documentElement.style.setProperty('--aim-amount', amount.toFixed(3));
  }

  settingsMarkup() {
    return `<label class="setting">Auto-reload <input type="checkbox" data-setting="autoReload" aria-label="Auto-reload" ${this.settings.autoReload ? 'checked' : ''}></label>` +
      `<label class="setting">Light aim assist <input type="checkbox" data-setting="mobileAimAssist" aria-label="Light aim assist" ${this.settings.mobileAimAssist ? 'checked' : ''}></label><p class="setting-note">Touch aim slows near visible opponents. Right mouse aims on desktop. F toggles aim.</p>`;
  }
}
