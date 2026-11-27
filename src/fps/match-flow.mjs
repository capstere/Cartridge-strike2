import {UI_EN, selectedMapName} from './english-ui.mjs';
import {createFullscreenController} from './fullscreen.mjs';
// CARTRIDGE-STRIKE // lobby theme + lobby → loading → match flow (presentation layer).
// Lifecycle:  lobby-ready (DOM interactive) → engine-ready (app.mjs hides #loading after
// world, renderer and assets resolve) → match-ready (app.mjs start() ran, #hud shown).
// Start match is always clickable. If the engine isn't ready yet, the click is held here and
// the engine launches from its normal match handler once its assets are ready.
const $ = id => document.getElementById(id);
const html = document.documentElement;
const fullscreen = createFullscreenController(document);
const menu = $('menu'), startBtn = $('start'), engineNote = $('loading'), fatalBox = $('fatal');
const MUSIC_KEY = 'cs-lobby-music';
const TIPS = [
  'Buy equipment in your spawn zone during the buy phase.',
  'Hold E to plant, defuse or escort a hostage.',
  'Press M for the tactical map or hold Tab for the scoreboard.',
  'Hold Shift to sneak. Crouch to steady your aim.',
  'Press 4 to cycle cartridge grenades. Press 5 to equip the objective bomb.',
];

/* A single streaming element belongs to the lobby for the lifetime of this page. */
const track = new Audio();
track.preload = 'none';
track.loop = true;
track.volume = .55;
track.src = '../audio/Preparation.mp3';
const music = {
  track,
  wanted: (() => {
    try { return (localStorage.getItem(MUSIC_KEY) ?? sessionStorage.getItem(MUSIC_KEY)) !== 'off'; }
    catch { return true; }
  })(),
  allowed() { return this.wanted && !menu.hidden && !flow.active && !document.hidden; },
  stop() { track.pause(); },
  sync() {
    if (!this.allowed()) return this.stop();
    if (track.paused) track.play().catch(() => {}); // A later user gesture can retry autoplay.
  },
};

let musicBtn;
function syncButton() {
  if (!musicBtn) return;
  musicBtn.setAttribute('aria-pressed', String(music.wanted));
  musicBtn.setAttribute('aria-label', music.wanted ? UI_EN.musicMute : UI_EN.musicUnmute);
  musicBtn.classList.toggle('is-off', !music.wanted);
  musicBtn.querySelector('span').textContent = music.wanted ? UI_EN.musicOn : UI_EN.musicOff;
}
function addMusicButton() {
  const tools = document.querySelector('.lb-tools'); if (!tools) return;
  musicBtn = document.createElement('button');
  musicBtn.type = 'button'; musicBtn.className = 'lb-icon cs-music';
  musicBtn.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 9v6h4l5 4V5L8 9z"/><path class="cs-wave" d="M16 9a4 4 0 0 1 0 6M18.5 6.5a7.5 7.5 0 0 1 0 11"/><path class="cs-x" d="M16 9l5 6M21 9l-5 6"/></svg><span></span>';
  musicBtn.addEventListener('click', () => {
    music.wanted = !music.wanted;
    const preference = music.wanted ? 'on' : 'off';
    try { localStorage.setItem(MUSIC_KEY, preference); } catch {}
    try { sessionStorage.setItem(MUSIC_KEY, preference); } catch {}
    music.sync(); syncButton();
  });
  tools.prepend(musicBtn); syncButton();
}

/* ---------------- Loading screen ---------------- */
const ui = {};
function buildOverlay() {
  const el = document.createElement('section');
  el.id = 'cs-loading'; el.hidden = true; el.tabIndex = -1; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'csl-map');
  el.innerHTML = `
    <div class="csl-grade" aria-hidden="true"></div>
    <header class="csl-top"><span class="csl-brand"><i class="csl-mk"><b></b></i>CARTRIDGE<b>//STRIKE</b></span><span class="csl-mode" id="csl-mode"></span></header>
    <div class="csl-main">
      <p class="csl-k">MAP</p>
      <h1 id="csl-map"></h1>
      <p class="csl-team"><span class="csl-shield" id="csl-shield"></span><span><small>TEAM</small><strong id="csl-team"></strong></span></p>
      <p class="csl-brief" id="csl-brief"></p>
    </div>
    <footer class="csl-foot">
      <p class="csl-tip"><b>TIPS</b><span id="csl-tip"></span></p>
      <div class="csl-status" aria-live="polite"><span id="csl-status">Preparing</span><i class="csl-bar" aria-hidden="true"><i></i></i></div>
      <div class="csl-error" id="csl-error" hidden>
        <strong id="csl-err-title">Match loading failed</strong><p id="csl-err-text"></p>
        <div class="csl-actions"><button type="button" class="csl-retry" id="csl-retry">Retry</button><button type="button" class="csl-back" id="csl-back">Return to lobby</button></div>
      </div>
      <button type="button" class="csl-cancel" id="csl-cancel">Cancel · return to lobby</button>
    </footer>`;
  document.body.append(el);
  for (const id of ['map', 'mode', 'team', 'shield', 'brief', 'tip', 'status', 'error', 'err-title', 'err-text', 'retry', 'back', 'cancel']) ui[id.replace(/-(\w)/, (_, c) => c.toUpperCase())] = $('csl-' + id);
  ui.root = el;
  ui.retry.onclick = () => flow.retry();
  ui.back.onclick = ui.cancel.onclick = () => flow.toLobby();
}

const engineReady = () => engineNote.hidden;
const engineFailed = () => !fatalBox.hidden;

const flow = {
  active: false, failed: false, attempt: 0, slowTimer: 0, hardTimer: 0, exitTimer: 0,
  snapshot() {
    const team = document.querySelector('.team-option.selected')?.dataset.team || menu.dataset.side || 'analysts';
    const modeSel = $('game-mode');
    return {
      team, teamName: team === 'counterAnalysts' ? 'Counter Analysts' : 'Analysts',
      mode: UI_EN.modes[modeSel.value]?.name || UI_EN.modes.classic.name,
      map: selectedMapName(new URLSearchParams(location.search), engineNote.dataset.mapName),
      brief: document.querySelector('.team-option.selected em')?.textContent || '',
    };
  },
  begin(fullscreenRequested = false) {
    if (this.active) return;                    // duplicate clicks / Enter presses
    clearTimeout(this.exitTimer);
    this.active = true; this.failed = false; this.attempt++;
    const s = this.snapshot();
    html.dataset.csLoadTeam = s.team;
    ui.root.classList.toggle('csl-floor5', ['floor5-prepared','classic-floor5',null].includes(new URLSearchParams(location.search).get('level')));
    ui.map.textContent = s.map; ui.mode.textContent = s.mode.toUpperCase();
    ui.team.textContent = s.teamName; ui.shield.textContent = s.team === 'counterAnalysts' ? 'CA' : 'A';
    ui.brief.textContent = s.brief; ui.tip.textContent = TIPS[(this.attempt + Math.floor(Math.random() * TIPS.length)) % TIPS.length];
    ui.error.hidden = true; ui.cancel.hidden = false; ui.root.classList.remove('is-error', 'is-out');
    ui.root.hidden = false; html.classList.add('cs-loading-open');
    menu.inert = true;
    ui.root.focus();
    music.stop();
    clearTimeout(this.slowTimer);
    const limit = Number(new URLSearchParams(location.search).get('loadTimeout')) || 120;
    this.slowTimer = setTimeout(() => { if (this.active && !engineReady()) setStatus(`${engineText()} · taking longer than usual`); }, Math.min(20, limit / 2) * 1000);
    clearTimeout(this.hardTimer);
    this.hardTimer = setTimeout(() => { if (this.active && !this.failed && !engineReady()) this.fail('The map is taking too long to load. Check your connection and retry.'); }, limit * 1000);
    this.status(fullscreenRequested);
  },
  status(fullscreenRequested = false) {
    if (!this.active || this.failed) return;
    if (engineFailed()) return this.fail();
    if (!engineReady()) {
      ui.map.textContent = this.snapshot().map;
      setStatus(engineText());
      return;
    }
    if (document.hidden) { setStatus(UI_EN.loading.waiting); return; }
    if (startBtn.disabled) return this.fail($('character-status').textContent);
    // A warm launch keeps the original click's user activation for mouse lock and audio.
    startBtn.dispatchEvent(new CustomEvent('cs-start-match', { detail: { fullscreenRequested } }));
    if (menu.hidden && !$('hud').hidden) this.done();
    else this.fail('The match could not start. Try again.');
  },
  done() {
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer);
    ui.root.classList.add('is-out');
    this.exitTimer = setTimeout(() => { ui.root.hidden = true; ui.root.classList.remove('is-out'); html.classList.remove('cs-loading-open'); }, 420);
    menu.inert = false;
    this.active = false;
  },
  fail(msg) {
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer); this.failed = true;
    const detail = msg || (fatalBox.querySelector('pre')?.textContent || '').split('\n')[0] || 'A game asset could not be loaded.';
    ui.errText.textContent = /WebGL context/i.test(detail)
      ? 'WebGL 2 could not start. Turn on hardware acceleration or try another browser.'
      : detail.slice(0, 220);
    ui.error.hidden = false; ui.cancel.hidden = true; ui.root.classList.add('is-error');
    setStatus('Loading stopped');
    ui.retry.focus();
  },
  retry() {
    if (engineFailed() || !engineReady()) {
      const url = new URL(location.href);
      url.searchParams.set('team', this.snapshot().team);
      url.searchParams.set('seed', $('seed').value || '42');
      history.replaceState(null, '', url);
      try { sessionStorage.setItem('cs-autostart', '1'); } catch {}
      location.reload();
      return;
    }
    const fullscreenRequested = fullscreen.resume(); // Retry is another direct user gesture.
    this.active = false; this.begin(fullscreenRequested);
  },
  toLobby() {
    fullscreen.exit();
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer);
    this.active = false; this.failed = false;
    ui.root.hidden = true; html.classList.remove('cs-loading-open');
    menu.inert = false;
    music.sync(); (startBtn.disabled ? $('player-character') : startBtn).focus();
  },
};
const engineText = () => UI_EN.loading[engineNote.dataset.stage] || UI_EN.loading.level;
const setStatus = t => { if (ui.status) ui.status.textContent = t; };

/* ---------------- Wiring ---------------- */
function intercept(e) {
  if (!e.target.closest || !e.target.closest('#start')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  const fullscreenRequested = !startBtn.disabled && !flow.active && fullscreen.start();
  flow.begin(fullscreenRequested);
}
function init() {
  const options = [...menu.querySelectorAll('.team-option')];
  const selectTeam = option => {
    for (const item of options) {
      item.classList.toggle('selected', item === option);
      item.setAttribute('aria-pressed', String(item === option));
    }
    menu.dataset.side = option.dataset.team;
    menu.dispatchEvent(new CustomEvent('cs-team-selected', {detail:{team:option.dataset.team}}));
  };
  for (const option of options) option.addEventListener('click', () => selectTeam(option));
  const query = new URLSearchParams(location.search);
  if (!query.has('character') && query.get('team') === 'counterAnalysts') selectTeam(options.find(b => b.dataset.team === 'counterAnalysts'));
  buildOverlay(); addMusicButton();
  html.classList.add('cs-flow-ready');
  document.addEventListener('click', intercept, true);
  const kick = e => {
    if (!e.target.closest?.('#start, .cs-music') && music.allowed()) music.sync();
  };
  for (const t of ['pointerdown', 'keydown', 'touchend']) addEventListener(t, kick, { capture: true, passive: true });
  new MutationObserver(() => music.sync()).observe(menu, { attributes: true, attributeFilter: ['hidden'] });
  document.addEventListener('visibilitychange', () => { music.sync(); flow.status(); });
  addEventListener('pagehide', () => music.stop());
  addEventListener('pageshow', e => { if (e.persisted) music.sync(); });
  addEventListener('keydown', e => { if (flow.active && e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); flow.toLobby(); } }, true);
  const updates = new MutationObserver(() => flow.status());
  updates.observe(engineNote, { attributes: true, attributeFilter: ['hidden','data-stage','data-map-name'], childList: true, subtree: true });
  updates.observe(fatalBox, { attributes: true, attributeFilter: ['hidden'] });
  let launchRequested = startBtn.dataset.launchRequested === '1';
  delete startBtn.dataset.launchRequested;
  try {
    if (sessionStorage.getItem('cs-autostart')) launchRequested = true;
    sessionStorage.removeItem('cs-autostart');
  } catch {}
  window.__csFlow = { flow, music, fullscreen }; // test hook (read-only use)
  if (launchRequested && !menu.hidden) flow.begin();
}
// Loaded after the lobby markup, independently of the engine module graph.
init();
