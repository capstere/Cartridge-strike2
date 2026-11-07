import { WEAPONS } from './config.mjs';
import { canAim, aimFov, aimFriction, EmptyMagazineReload, nextWeapon, clamp01 } from './tactical-rules.mjs';

/** Input/presentation adapter; Game still owns ammo, shots, damage and reloads. */
export class TacticalControls {
  constructor({ settings, mobile, getGame, getModal, isInteracting, onAimChange }) {
    Object.assign(this, { settings, mobile, getGame, getModal, isInteracting, onAimChange });
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
    if (mobile.enabled && mobile.root) {
      this.button = document.createElement('button');
      this.button.type = 'button'; this.button.className = 'mobile-button mobile-aim';
      this.button.dataset.tacticalAim = ''; this.button.textContent = 'SIKTA';
      this.button.setAttribute('aria-label', 'Växla siktesläge');
      this.button.setAttribute('aria-pressed', 'false');
      mobile.root.append(this.button);
      this.button.addEventListener('pointerdown', e => {
        e.preventDefault(); e.stopPropagation();
        if (e.pointerType !== 'mouse' || e.button === 0) this.toggle();
      });
      this.installDoubleTap(mobile.root.querySelector('[data-mobile-look]'));
    }
    const canvas = document.getElementById('game');
    canvas.addEventListener('mousedown', e => {
      if (!mobile.enabled && e.button === 2 && document.pointerLockElement === canvas) {
        e.preventDefault(); this.setAim(true);
      }
    });
    window.addEventListener('mouseup', e => { if (!mobile.enabled && e.button === 2) this.setAim(false); });
    window.addEventListener('keydown', e => {
      if (!mobile.enabled && e.code === 'KeyF' && !e.repeat && document.pointerLockElement === canvas) {
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
      if (this.tap || !this.playing()) return;
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

  reset() {
    this.wanted = false; this.amount = 0; this.tap = this.previousTap = null;
    this.reload.reset();
    const p = this.getGame()?.player;
    if (p) { p.aiming = false; p.aimAmount = 0; }
    this.scope.hidden = true; document.body.classList.remove('fps-aiming', 'fps-scoped');
    this.onAimChange?.(); this.updateButton();
  }

  update(dt) {
    const g = this.getGame(), p = g?.player;
    if (!p || !this.playing()) { this.reset(); return; }
    if (g !== this.game || p.weapon !== this.weapon || g.state.round !== this.round) {
      this.reset(); this.game = g; this.weapon = p.weapon; this.round = g.state.round;
      this.mobile.clear();
    }
    if (!canAim(p.weapon) || p.reloadUntil || p.action) this.wanted = false;
    this.reload.tick(g, this.settings.autoReload, this.isInteracting());
    const target = this.wanted && !p.reloadUntil ? 1 : 0;
    this.amount = this.settings.reducedMotion ? target : this.amount + (target - this.amount) * (1 - Math.exp(-14 * Math.max(0, Math.min(.1, dt))));
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
      this.button.textContent = this.wanted ? 'SLÄPP' : 'SIKTA';
    }
  }

  syncTrigger() {
    if (!this.mobile.enabled) return;
    const p = this.getGame()?.player, w = WEAPONS[p?.weapon];
    const trigger = this.mobile.root?.querySelector('[data-mobile-action="fire"]');
    if (!trigger) return;
    const manual = w?.slot === 'grenade' || !!w?.projectile;
    // Auto-fire must not make grenades/rocket launchers impossible to use.
    trigger.hidden = !!this.settings.mobileAutoFire && !manual;
    const label = w?.slot === 'grenade' ? 'KASTA' : w?.projectile ? 'AVFYRA' : 'ELD';
    if (trigger.textContent !== label) trigger.textContent = label;
    trigger.setAttribute('aria-label', label === 'KASTA' ? 'Kasta vald granat' : 'Skjut');
  }

  lookScale(touch, yaw, pitch) {
    const p = this.getGame()?.player;
    const fov = 76 + (aimFov(p?.weapon) - 76) * this.amount;
    const zoomScale = .35 + .65 * fov / 76;
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
    const fov = 76 + (aimFov(p?.weapon) - 76) * amount;
    if (Math.abs(renderer.camera.fov - fov) > .005) {
      renderer.camera.fov = fov; renderer.camera.updateProjectionMatrix();
    }
    const scoped = p?.weapon === 'sniper' && amount > .92;
    this.scope.hidden = !scoped;
    document.body.classList.toggle('fps-scoped', scoped);
    document.body.classList.toggle('fps-aiming', amount > .1);
    document.documentElement.style.setProperty('--aim-amount', amount.toFixed(3));
  }

  settingsMarkup() {
    return `<label class="setting">Automatisk omladdning <input type="checkbox" data-setting="autoReload" aria-label="Automatisk omladdning" ${this.settings.autoReload ? 'checked' : ''}></label>` +
      (this.mobile.enabled ? `<label class="setting">Mild sikteshjälp <input type="checkbox" data-setting="mobileAimAssist" aria-label="Mild sikteshjälp" ${this.settings.mobileAimAssist ? 'checked' : ''}></label><p class="setting-note">Saktar ned fingrets sikte nära synliga fiender. Flyttar aldrig siktet åt dig. Dubbeltryck till höger eller tryck SIKTA för zoom.</p>` :
        '<p class="setting-note">Håll höger musknapp för siktesläge. F växlar läget. Sniper får kikarsikte.</p>');
  }
}
