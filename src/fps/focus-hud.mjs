import { WEAPONS } from './config.mjs';

const $ = id => document.getElementById(id);
const SECONDARY = ['buy', 'grenade', 'sneak', 'drop'];
export const normalizeHudMode = value => value === 'full' ? 'full' : 'clean';

export function focusHudSettings(settings) {
  const mode = normalizeHudMode(settings.hudMode);
  return `<label class="setting">Skärmvisning <select data-setting="hudMode" aria-label="Skärmvisning"><option value="clean" ${mode === 'clean' ? 'selected' : ''}>Ren · rekommenderad</option><option value="full" ${mode === 'full' ? 'selected' : ''}>Full · alla paneler</option></select></label><p class="setting-note">Ren visar hälsa, ammunition och uppdrag. Mobilens extraknappar finns under MER. Full återställer den tidigare layouten.</p><p class="focus-session-summary" hidden></p>`;
}

/** Presentation only. Reuses existing controls/listeners and never changes Game. */
export class FocusHud {
  constructor({ settings, mobile, getGame, getModal, onMap, onStats }) {
    Object.assign(this, { settings, mobile, getGame, getModal, onMap, onStats });
    this.settings.hudMode = normalizeHudMode(settings.hudMode);
    this.mode = null; this.expanded = false; this.game = null; this.weapon = null;
    this.inventoryUntil = 0; this.placements = [];
    this.spawnText = $('spawn-protection').textContent;
    this.mapPanel = document.querySelector('#hud .map-panel');
    this.buttons = new Map();
    if (mobile.enabled) this.installDrawer();
    this.applyMode();
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('orientationchange', () => this.reset());
    document.addEventListener('visibilitychange', () => { if (document.hidden) this.reset(); });
  }

  installDrawer() {
    const root = this.mobile.root;
    for (const b of root.querySelectorAll('[data-mobile-action]')) this.buttons.set(b.dataset.mobileAction, b);
    this.more = document.createElement('button');
    this.more.type = 'button'; this.more.id = 'mobile-more'; this.more.className = 'mobile-button mobile-more';
    this.more.textContent = 'MER'; this.more.setAttribute('aria-label', 'Visa fler spelkontroller');
    this.more.setAttribute('aria-expanded', 'false'); this.more.setAttribute('aria-controls', 'mobile-utilities');
    this.drawer = document.createElement('div');
    this.drawer.id = 'mobile-utilities'; this.drawer.hidden = true;
    this.drawer.setAttribute('role', 'group'); this.drawer.setAttribute('aria-label', 'Extra spelkontroller');
    root.append(this.more, this.drawer);
    this.more.addEventListener('pointerdown', e => {
      if (e.pointerType === 'mouse' && e.button !== 0) return;
      e.preventDefault(); e.stopPropagation(); this.setExpanded(!this.expanded);
    });
    // Keyboard/switch-control activation is separate from pointer activation.
    this.more.addEventListener('click', e => { if (e.detail === 0) this.setExpanded(!this.expanded); });
    for (const action of SECONDARY) {
      const button = this.buttons.get(action);
      if (!button) continue;
      const marker = document.createComment('original ' + action + ' placement');
      button.before(marker); this.placements.push({ button, marker });
      if (action !== 'sneak') button.addEventListener('pointerup', () => this.setExpanded(false));
    }
    for (const [label, name, action] of [
      ['KARTA', 'Visa eller dölj taktisk karta', on => this.onMap()],
      ['RESULTAT', 'Pausa och visa sessionsresultat', on => this.onStats()],
    ]) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'mobile-button utility-extra';
      button.textContent = label; button.setAttribute('aria-label', name);
      button.dataset.utility = label.toLowerCase();
      const run = () => { this.setExpanded(false); action(); };
      button.addEventListener('pointerdown', e => {
        if (e.pointerType === 'mouse' && e.button !== 0) return;
        e.preventDefault(); e.stopPropagation(); run();
      });
      button.addEventListener('click', e => { if (e.detail === 0) run(); });
      this.drawer.append(button);
    }
  }

  applyMode() {
    const mode = normalizeHudMode(this.settings.hudMode);
    this.settings.hudMode = mode;
    if (mode === this.mode) return;
    this.reset(); this.mode = mode;
    document.documentElement.dataset.hud = mode;
    if (this.more) {
      this.more.hidden = mode !== 'clean';
      // Move actual controls, not clones, preserving multi-pointer capture and
      // existing buy/throw/hold listeners. Full mode restores exact DOM positions.
      for (const { button, marker } of this.placements) {
        if (mode === 'clean') this.drawer.insertBefore(button, this.drawer.querySelector('.utility-extra'));
        else marker.after(button);
      }
      for (const b of this.buttons.values()) b.removeAttribute('data-focus-hidden');
    }
    const spawn = $('spawn-protection');
    spawn.textContent = mode === 'clean' ? 'SPAWNSKYDD' : this.spawnText;
    spawn.title = this.spawnText;
  }

  setExpanded(value) {
    const g = this.getGame();
    const next = !!value && this.mode === 'clean' && !!g?.player?.alive && !this.getModal();
    if (!this.drawer) return;
    if (this.expanded !== next) this.mobile.clear();
    this.expanded = next; this.drawer.hidden = !next;
    this.more.setAttribute('aria-expanded', String(next));
    this.more.setAttribute('aria-label', next ? 'Stäng extra spelkontroller' : 'Visa fler spelkontroller');
    this.more.textContent = next ? 'STÄNG' : 'MER';
  }

  reset() { this.setExpanded(false); }

  contextButton(action, visible) {
    const button = this.buttons.get(action);
    if (!button) return;
    // Never remove a held control while the finger is down: pointerup/cancel
    // must still arrive at the original listener to release its action.
    const held = [...this.mobile.buttonPointers.values()].includes(button);
    button.toggleAttribute('data-focus-hidden', this.mode === 'clean' && !visible && !held);
  }

  update() {
    this.applyMode();
    const g = this.getGame(), p = g?.player;
    if (!p) { this.reset(); return; }
    const root = document.documentElement;
    const live = p.alive && !this.getModal() && !g.state.paused;
    if (!live) this.reset();
    root.classList.toggle('hud-playing', !!live);
    root.classList.toggle('hud-freeplay', g.config.mode === 'endless' && $('control-card').hidden);
    root.classList.toggle('hud-low-health', p.alive && p.hp <= 30);
    const w = WEAPONS[p.weapon], item = g.item(p);
    root.classList.toggle('hud-low-ammo', !!w?.magazine && item?.ammo <= Math.max(2, Math.floor(w.magazine * .2)));
    if (g !== this.game || p.weapon !== this.weapon) {
      this.game = g; this.weapon = p.weapon; this.inventoryUntil = g.state.time + 2;
    }
    root.classList.toggle('hud-inventory-peek', g.state.time < this.inventoryUntil);
    const summaries = document.querySelectorAll('.focus-session-summary');
    for (const el of summaries) {
      el.hidden = this.getModal() !== 'pause';
      if (!el.hidden) {
        const c = p.combat;
        const text = `SESSION · ${p.kills} kills · ${c?.assists || 0} assist · ${p.deaths} dödsfall · ${c?.points || 0} poäng · bästa serie ${c?.bestStreak || 0}`;
        if (el.textContent !== text) el.textContent = text;
      }
    }
    if (!this.mobile.enabled) return;
    this.more.hidden = this.mode !== 'clean' || !p.alive;
    const firearm = ['primary', 'pistol'].includes(w?.slot);
    this.contextButton('reload', firearm && (p.reloadUntil || (item && item.ammo < w.magazine)));
    let interact = !!p.action || this.mobile.state.interact;
    if (p.alive && g.phase === 'active') interact ||= !!g.interaction(p) || !!g.world.doors?.nearest(p);
    this.contextButton('interact', interact);
    this.mobile.root.classList.toggle('hud-manual-trigger', !this.buttons.get('fire')?.hidden);
  }
}
