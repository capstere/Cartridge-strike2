// CARTRIDGE-STRIKE // lobby theme + lobby → loading → match flow (presentation layer).
// Lifecycle:  lobby-ready (DOM interactive) → engine-ready (app.mjs hides #loading after
// world, renderer and assets resolve) → match-ready (app.mjs start() ran, #hud shown).
// STARTA MATCH is always clickable. If the engine isn't ready yet, the click is held here and
// the engine launches from its normal match handler once its assets are ready.
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

/* A single streaming element belongs to the lobby for the lifetime of this page. */
const track = new Audio();
track.preload = 'none';
track.loop = true;
track.volume = .55;
track.src = '../audio/Preparation.mp3';
const music = {
  track,
  wanted: (() => { try { return sessionStorage.getItem(MUSIC_KEY) !== 'off'; } catch { return true; } })(),
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
  el.id = 'cs-loading'; el.hidden = true; el.tabIndex = -1; el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'csl-map');
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

const engineReady = () => engineNote.hidden;
const engineFailed = () => !fatalBox.hidden;

const flow = {
  active: false, failed: false, attempt: 0, slowTimer: 0, hardTimer: 0, exitTimer: 0,
  snapshot() {
    const team = document.querySelector('.team-option.selected')?.dataset.team || menu.dataset.side || 'analysts';
    const modeSel = $('game-mode');
    return {
      team, teamName: team === 'counterAnalysts' ? 'Counter Analysts' : 'Analysts',
      mode: modeSel?.options[modeSel.selectedIndex]?.text || 'Klassiska rundor',
      map: (document.title.split('·')[1] || document.querySelector('.lb-brief dd')?.textContent || 'Unit 05').trim(),
      brief: document.querySelector('.team-option.selected em')?.textContent || '',
    };
  },
  begin() {
    if (this.active) return;                    // duplicate clicks / Enter presses
    clearTimeout(this.exitTimer);
    this.active = true; this.failed = false; this.attempt++;
    const s = this.snapshot();
    html.dataset.csLoadTeam = s.team;
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
    this.slowTimer = setTimeout(() => { if (this.active && !engineReady()) setStatus(`${engineText()} · det tar längre tid än vanligt`); }, Math.min(20, limit / 2) * 1000);
    clearTimeout(this.hardTimer);
    this.hardTimer = setTimeout(() => { if (this.active && !this.failed && !engineReady()) this.fail('Banan svarar inte. Kontrollera anslutningen och försök igen.'); }, limit * 1000);
    this.status();
  },
  status() {
    if (!this.active || this.failed) return;
    if (engineFailed()) return this.fail();
    if (!engineReady()) { setStatus(engineText()); return; }
    if (document.hidden) { setStatus('Väntar på att fliken blir aktiv'); return; }
    if (startBtn.disabled) return this.fail($('character-status').textContent);
    // A warm launch keeps the original click's user activation for mouse lock and audio.
    startBtn.dispatchEvent(new Event('cs-start-match'));
    if (menu.hidden && !$('hud').hidden) this.done();
    else this.fail('Matchen startade inte. Försök igen.');
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
    const detail = msg || (fatalBox.querySelector('pre')?.textContent || '').split('\n')[0] || 'Ett spelobjekt kunde inte laddas.';
    ui.errText.textContent = /WebGL context/i.test(detail)
      ? 'WebGL 2 kunde inte starta. Aktivera grafikacceleration i webbläsaren eller prova en annan webbläsare.'
      : detail.slice(0, 220);
    ui.error.hidden = false; ui.cancel.hidden = true; ui.root.classList.add('is-error');
    setStatus('Laddningen avbröts');
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
    this.active = false; this.begin();
  },
  toLobby() {
    clearTimeout(this.slowTimer); clearTimeout(this.hardTimer);
    this.active = false; this.failed = false;
    ui.root.hidden = true; html.classList.remove('cs-loading-open');
    menu.inert = false;
    music.sync(); (startBtn.disabled ? $('player-character') : startBtn).focus();
  },
};
const engineText = () => {
  const t = (engineNote.textContent || '').trim();
  if (/Bygger|Laddar/i.test(t)) return 'Laddar karta · ' + t.replace(/^Bygger\s*/i, '').replace(/…$/, '');
  return 'Förbereder karaktärer';
};
const setStatus = t => { if (ui.status) ui.status.textContent = t; };

/* ---------------- Wiring ---------------- */
function intercept(e) {
  if (!e.target.closest || !e.target.closest('#start')) return;
  e.preventDefault(); e.stopImmediatePropagation();
  flow.begin();
}
function init() {
  const options = [...menu.querySelectorAll('.team-option')];
  const selectTeam = option => {
    for (const item of options) {
      item.classList.toggle('selected', item === option);
      item.setAttribute('aria-pressed', String(item === option));
    }
    menu.dataset.side = option.dataset.team;
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
  updates.observe(engineNote, { attributes: true, attributeFilter: ['hidden'], childList: true, subtree: true });
  updates.observe(fatalBox, { attributes: true, attributeFilter: ['hidden'] });
  let launchRequested = startBtn.dataset.launchRequested === '1';
  delete startBtn.dataset.launchRequested;
  try {
    if (sessionStorage.getItem('cs-autostart')) launchRequested = true;
    sessionStorage.removeItem('cs-autostart');
  } catch {}
  window.__csFlow = { flow, music }; // test hook (read-only use)
  if (launchRequested && !menu.hidden) flow.begin();
}
// Loaded after the lobby markup, independently of the engine module graph.
init();
