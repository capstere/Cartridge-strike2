// CARTRIDGE-STRIKE // lobby theme + lobby → loading → match flow (presentation layer).
// Lifecycle:  lobby-ready (DOM interactive) → engine-ready (app.mjs hides #loading after
// world, renderer and assets resolve) → match-ready (app.mjs start() ran, #hud shown).
// STARTA MATCH is always clickable. If the engine isn't ready yet, the click is held here and
// the original #start handler (app.mjs) is triggered once it is, so match setup is unchanged.
const $ = id => document.getElementById(id);
const html = document.documentElement;
const menu = $('menu'), startBtn = $('start'), engineNote = $('loading'), fatalBox = $('fatal');
const MUSIC_KEY = 'cs-lobby-music';
const TIPS = [
  'Köp under köpfasen i er startzon — timern väntar medan köpmenyn är öppen.',
  'Håll E för att plantera, desarmera eller leda gisslan.',
  'Tryck M för taktisk karta och Tab för resultattavlan.',
  'Smyg med Shift för att höras mindre. Huka för stadigare sikte.',
  'Cartridge-granater cyklas med 4. Uppdragsbomben ligger på 5.',
];

/* ---------------- Lobby theme (Web Audio: gapless loop, own gain, independent of game SFX) ---------------- */
const music = {
  ctx: null, gain: null, src: null, buffer: null, bufferP: null,
  wanted: (() => { try { return sessionStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; } })(),
  url: null,
  async load() {
    if (this.bufferP) return this.bufferP;
    this.bufferP = (async () => {
      // Lovable hosting serves the track from its asset CDN (pointer file); a plain static host
      // (e.g. GitHub Pages) uses the original file at public/audio/Preparation.mp3 instead.
      const sources = [];
      try { const r = await fetch('../audio/lobby-theme.mp3.asset.json', { cache: 'force-cache' }); if (r.ok) sources.push((await r.json()).url); } catch {}
      sources.push('../audio/Preparation.mp3');
      let data = null;
      for (const url of sources) {
        try { const r = await fetch(url, { cache: 'force-cache' }); if (r.ok && /audio|octet/.test(r.headers.get('content-type') || 'audio')) { data = await r.arrayBuffer(); this.url = url; break; } } catch {}
      }
      if (!data) throw new Error('track not found');
      this.ensureCtx();
      this.buffer = await this.ctx.decodeAudioData(data);
      return this.buffer;
    })().catch(e => { console.warn('Lobby theme unavailable:', e.message); this.bufferP = null; return null; });
    return this.bufferP;
  },
  ensureCtx() {
    if (this.ctx) return;
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    this.ctx = new AC(); this.gain = this.ctx.createGain(); this.gain.gain.value = 0; this.gain.connect(this.ctx.destination);
  },
  allowed() { return this.wanted && !menu.hidden && !flow.active && !document.hidden; },
  async play() {
    if (!this.allowed() || this.src) return;
    this.ensureCtx(); if (!this.ctx) return;
    if (this.ctx.state === 'suspended') { try { await this.ctx.resume(); } catch {} }
    if (this.ctx.state !== 'running') return; // still blocked by autoplay policy — wait for a gesture
    const buf = await this.load(); if (!buf || !this.allowed() || this.src) return;
    const s = this.ctx.createBufferSource(); s.buffer = buf; s.loop = true; s.connect(this.gain); s.start();
    this.src = s;
    const g = this.gain.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(.55, t + 1.2);
    syncButton();
  },
  stop(fade = .6) {
    const s = this.src; if (!s) return; this.src = null;
    const g = this.gain.gain, t = this.ctx.currentTime; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0, t + fade);
    try { s.stop(t + fade + .02); } catch {}
    setTimeout(() => { try { s.disconnect(); } catch {} if (!this.src && this.ctx?.state === 'running' && menu.hidden) this.ctx.suspend().catch(() => {}); }, (fade + .1) * 1000);
    syncButton();
  },
  sync() { if (this.allowed()) this.play(); else this.stop(); },
};

let musicBtn;
function syncButton() {
  if (!musicBtn) return;
  musicBtn.setAttribute('aria-pressed', String(music.wanted));
  musicBtn.setAttribute('aria-label', music.wanted ? 'Stäng av lobbymusiken' : 'Slå på lobbymusiken');
  musicBtn.classList.toggle('is-off', !music.wanted);
  musicBtn.querySelector('span').textContent = music.wanted ? 'Musik på' : 'Musik av';
}
function addMusicButton() {
  const tools = document.querySelector('.lb-tools'); if (!tools) return;
  musicBtn = document.createElement('button');
  musicBtn.type = 'button'; musicBtn.className = 'lb-icon cs-music';
  musicBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="cs-wave" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/><path class="cs-x" d="M16 9l5 6M21 9l-5 6"/></svg><span></span>';
  musicBtn.addEventListener('click', () => {
    music.wanted = !music.wanted;
    try { sessionStorage.setItem(MUSIC_KEY, music.wanted ? 'on' : 'off'); } catch {}
    music.sync(); syncButton();
  });
  tools.prepend(musicBtn); syncButton();
}

/* ---------------- Loading screen ---------------- */
const ui = {};
function buildOverlay() {
  const el = document.createElement('section');
  el.id = 'cs-loading'; el.hidden = true; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'csl-map');
  el.innerHTML = `
    <div class="csl-grade" aria-hidden="true"></div>
    <header class="csl-top"><span class="csl-brand"><i class="csl-mk"><b></b></i>CARTRIDGE<b>//STRIKE</b></span><span class="csl-mode" id="csl-mode"></span></header>
    <div class="csl-main">
      <p class="csl-k">BANA</p>
      <h1 id="csl-map"></h1>
      <p class="csl-team"><span class="csl-shield" id="csl-shield"></span><span><small>FRAKTION</small><strong id="csl-team"></strong></span></p>
      <p class="csl-brief" id="csl-brief"></p>
    </div>
    <footer class="csl-foot">
      <p class="csl-tip"><b>TIPS</b><span id="csl-tip"></span></p>
      <div class="csl-status" aria-live="polite"><span id="csl-status">Förbereder</span><i class="csl-bar" aria-hidden="true"><i></i></i></div>
      <div class="csl-error" id="csl-error" hidden>
        <strong id="csl-err-title">Matchen kunde inte laddas</strong><p id="csl-err-text"></p>
        <div class="csl-actions"><button type="button" class="csl-retry" id="csl-retry">Försök igen</button><button type="button" class="csl-back" id="csl-back">Till lobbyn</button></div>
      </div>
      <button type="button" class="csl-cancel" id="csl-cancel">Avbryt · till lobbyn</button>
    </footer>`;
  document.body.append(el);
  for (const id of ['map', 'mode', 'team', 'shield', 'brief', 'tip', 'status', 'error', 'err-title', 'err-text', 'retry', 'back', 'cancel']) ui[id.replace(/-(\w)/, (_, c) => c.toUpperCase())] = $('csl-' + id);
  ui.root = el;
  ui.retry.onclick = () => flow.retry();
  ui.back.onclick = ui.cancel.onclick = () => flow.toLobby();
}

const engineReady = () => engineNote.hidden || getComputedStyle(engineNote).display === 'none';
const engineFailed = () => !fatalBox.hidden;

const flow = {
  active: false, releasing: false, attempt: 0, slowTimer: 0, poll: 0,
  snapshot() {
    const team = menu.dataset.side || document.querySelector('.team-option.selected')?.dataset.team || 'analysts';
    const modeSel = $('game-mode');
    return {
      team, teamName: team === 'counterAnalysts' ? 'Counter Analysts' : 'Analysts',
      mode: modeSel?.options[modeSel.selectedIndex]?.text || 'Klassiska rundor',
      map: (document.title.split('·')[1] || document.querySelector('.lb-brief dd')?.textContent || 'Unit 05').trim(),
      brief: $('lb-objective')?.textContent || '',
    };
  },
  begin() {
    if (this.active) return;                    // duplicate clicks / Enter presses
    this.active = true; this.attempt++;
    const s = this.snapshot();
    html.dataset.csLoadTeam = s.team;
    ui.map.textContent = s.map; ui.mode.textContent = s.mode.toUpperCase();
    ui.team.textContent = s.teamName; ui.shield.textContent = s.team === 'counterAnalysts' ? 'CA' : 'A';
    ui.brief.textContent = s.brief; ui.tip.textContent = TIPS[(this.attempt + Math.floor(Math.random() * TIPS.length)) % TIPS.length];
    ui.error.hidden = true; ui.cancel.hidden = false; ui.root.classList.remove('is-error', 'is-out');
    ui.root.hidden = false; html.classList.add('cs-loading-open');
    music.stop(.6);
    this.status();
    clearTimeout(this.slowTimer);
    const limit = Number(new URLSearchParams(location.search).get('loadTimeout')) || 120;
    this.slowTimer = setTimeout(() => { if (this.active && !engineReady()) setStatus(`${engineText()} · det tar längre tid än vanligt`); }, Math.min(20, limit / 2) * 1000);
    clearTimeout(this.hardTimer);
    this.hardTimer = setTimeout(() => { if (this.active && !this.releasing && !engineReady()) this.fail('Banan svarar inte. Kontrollera anslutningen och försök igen.'); }, limit * 1000);
    this.watch();
  },
  status() {
    if (engineFailed()) return this.fail();
    if (!engineReady()) { setStatus(engineText()); return; }
    if (document.hidden) { setStatus('Väntar på att fliken blir aktiv'); return; }
    this.enter();
  },
  watch() {
    clearTimeout(this.poll);
    this.failed = false;
    const tick = () => { if (!this.active || this.releasing || this.failed) return; this.status(); if (this.active && !this.releasing) this.poll = setTimeout(tick, 120); };
    tick();
  },
  enter() {
    if (this.releasing) return;
    this.releasing = true; setStatus('Startar match');
    // Two frames so the status paints, then hand over to the untouched app.mjs start handler.
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (!this.active) { this.releasing = false; return; }
      startBtn.disabled = false;
      bypass = true; try { startBtn.click(); } finally { bypass = false; }
      const hudUp = () => !$('hud').hidden && menu.hidden;
      let n = 0;
      const wait = () => {
        if (!this.active) return;
        if (engineFailed()) { this.releasing = false; return this.fail(); }
        if (hudUp()) return this.done();
        if (++n > 150) { this.releasing = false; return this.fail('Matchen startade inte. Försök igen.'); }
        setTimeout(wait, 40);
      };
      wait();
    }));
  },
  explainMouseLock() {
    // A delayed auto-start has no click to lock the mouse with, so app.mjs opens pause with a
    // "mouse lock failed" note. Say what the player needs to do instead.
    let n = 0;
    const check = () => {
      const pause = $('pause'), p = pause?.querySelector('p:not(.eyebrow)');
      if (pause && !pause.hidden && p && /Muslås/.test(p.textContent)) { p.textContent = 'Matchen är redo. Klicka på Fortsätt för att börja.'; $('resume')?.focus(); return; }
      if (++n < 20) setTimeout(check, 50);
    };
    check();
  },
  done() {
    if (!navigator.userActivation?.isActive) this.explainMouseLock();
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer);
    ui.root.classList.add('is-out');
    setTimeout(() => { ui.root.hidden = true; ui.root.classList.remove('is-out'); html.classList.remove('cs-loading-open'); }, 420);
    this.active = false; this.releasing = false;
  },
  fail(msg) {
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer); this.failed = true;
    const detail = msg || (fatalBox.querySelector('pre')?.textContent || '').split('\n')[0] || 'Ett spelobjekt kunde inte laddas.';
    ui.errText.textContent = detail.slice(0, 220);
    ui.error.hidden = false; ui.cancel.hidden = true; ui.root.classList.add('is-error');
    setStatus('Laddningen avbröts');
    ui.retry.focus();
  },
  retry() {
    // Engine boot failed inside app.mjs; a reload re-runs it (browser cache keeps assets) and
    // relaunches straight into loading with the same selections (stored by the lobby itself).
    if (engineFailed() || !engineReady()) { try { sessionStorage.setItem('cs-autostart', '1'); } catch {} location.reload(); return; }
    this.active = false; this.releasing = false; this.begin();
  },
  toLobby() {
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer); this.active = false; this.releasing = false;
    ui.root.hidden = true; html.classList.remove('cs-loading-open');
    if (engineFailed()) fatalBox.hidden = false;
    music.sync(); startBtn.focus();
  },
};
const engineText = () => {
  const t = (engineNote.textContent || '').trim();
  if (/Bygger|Laddar/i.test(t)) return 'Laddar karta · ' + t.replace(/^Bygger\s*/i, '').replace(/…$/, '');
  return 'Förbereder karaktärer';
};
const setStatus = t => { if (ui.status) ui.status.textContent = t; };

/* ---------------- Wiring ---------------- */
let bypass = false;
function intercept(e) {
  if (bypass) return;
  if (!e.target.closest || !e.target.closest('#start')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  // Gesture: unlock audio contexts now (game SFX unlock happens in app.mjs on the real click).
  flow.begin();
}
function init() {
  buildOverlay(); addMusicButton();
  startBtn.disabled = false; startBtn.removeAttribute('disabled');
  // app.mjs re-applies disabled=characterSelectionFailed when ready; keep it enabled otherwise.
  new MutationObserver(() => { if (startBtn.disabled && !engineReady()) startBtn.disabled = false; })
    .observe(startBtn, { attributes: true, attributeFilter: ['disabled'] });
  document.addEventListener('click', intercept, true);
  // First permitted interaction starts the theme (autoplay policy).
  const kick = () => { music.ensureCtx(); music.sync(); };
  for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, kick, { capture: true, passive: true });
  music.load();
  new MutationObserver(() => music.sync()).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { music.sync(); if (flow.active && !document.hidden) flow.status(); });
  addEventListener('orientationchange', () => { if (flow.active) setTimeout(() => flow.status(), 300); });
  addEventListener('keydown', e => { if (flow.active && e.key === 'Escape' && ui.error.hidden) { e.stopImmediatePropagation(); flow.toLobby(); } }, true);
  new MutationObserver(() => { if (flow.active && engineFailed()) flow.fail(); }).observe(fatalBox, { attributes: true, attributeFilter: ['hidden'] });
  try { if (sessionStorage.getItem('cs-autostart')) { sessionStorage.removeItem('cs-autostart'); flow.begin(); } } catch {}
  window.__csFlow = { flow, music }; // test hook (read-only use)
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
