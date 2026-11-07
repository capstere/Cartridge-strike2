// CARTRIDGE-STRIKE // mobile helpers: rotate prompt, Character Studio panel toggle,
// and pinch-to-zoom for the Level Studio (forwarded as wheel events the editor already handles).
const html = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) html.classList.add('cs-touch');
try { if (sessionStorage.getItem('cs-rotate-ok')) html.classList.add('cs-rotate-ok'); } catch {}

function rotatePrompt() {
  const el = document.createElement('div');
  el.className = 'cs-rotate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Vrid skärmen');
  el.innerHTML = '<div class="cs-rotate-phone" aria-hidden="true"></div><small>CARTRIDGE//STRIKE</small><strong>Vrid telefonen</strong><p>Spelet och studiorna är byggda för liggande läge. Vänd skärmen för mest plats.</p><button type="button">Fortsätt ändå</button>';
  el.querySelector('button').addEventListener('click', () => {
    html.classList.add('cs-rotate-ok');
    try { sessionStorage.setItem('cs-rotate-ok', '1'); } catch {}
  });
  document.body.appendChild(el);
}

function charPanelToggle() {
  const stage = document.querySelector('.cs-stage');
  if (!stage || stage.querySelector('.cs-mtoggle')) return !!stage;
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'cs-mtoggle';
  b.setAttribute('aria-pressed', 'false');
  b.setAttribute('aria-label', 'Dölj panelen för större 3D-vy');
  b.textContent = '⤢';
  b.addEventListener('click', () => {
    const off = document.body.classList.toggle('cs-mpanel-off');
    b.setAttribute('aria-pressed', String(off));
    b.setAttribute('aria-label', off ? 'Visa panelen' : 'Dölj panelen för större 3D-vy');
    requestAnimationFrame(() => dispatchEvent(new Event('resize')));
  });
  stage.appendChild(b);
  return true;
}

// Two-finger pinch → wheel zoom on the editor canvases. While two fingers are down,
// single-pointer moves are held back so the scene does not orbit/drag at the same time.
function pinchZoom(target) {
  if (!target || target.dataset.csPinch) return;
  target.dataset.csPinch = '1';
  const pts = new Map();
  let last = 0;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  // The first finger is held back briefly: if a second finger lands, it's a pinch and the
  // editor never sees a tap (no accidental select/move). Otherwise the original press is replayed.
  let held = null, timer = 0, replaying = false, pinching = false;
  const release = () => {
    clearTimeout(timer); const ev = held; held = null; if (!ev) return;
    replaying = true;
    target.dispatchEvent(new PointerEvent('pointerdown', { pointerId: ev.pointerId, pointerType: 'touch', isPrimary: true, button: 0, buttons: 1, clientX: ev.clientX, clientY: ev.clientY, bubbles: true, cancelable: true }));
    replaying = false;
  };
  target.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'touch' || replaying) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    e.stopImmediatePropagation(); e.preventDefault();
    if (pts.size >= 2) { clearTimeout(timer); held = null; pinching = true; last = dist(); return; }
    held = { pointerId: e.pointerId, clientX: e.clientX, clientY: e.clientY };
    timer = setTimeout(release, 120);
  }, true);
  target.addEventListener('pointermove', e => {
    if (e.pointerType !== 'touch' || !pts.has(e.pointerId)) return;
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (held) { e.stopImmediatePropagation(); if (Math.hypot(e.clientX - held.clientX, e.clientY - held.clientY) > 8) release(); return; }
    if (pinching && pts.size < 2) { e.stopImmediatePropagation(); return; }
    if (pts.size < 2) return;
    e.stopImmediatePropagation(); e.preventDefault();
    const d = dist();
    if (Math.abs(d - last) > 14) {
      const m = mid();
      target.dispatchEvent(new WheelEvent('wheel', { deltaY: d > last ? -100 : 100, clientX: m.x, clientY: m.y, bubbles: true, cancelable: true }));
      last = d;
    }
  }, true);
  const end = e => {
    if (e.pointerType !== 'touch') return;
    if (held && held.pointerId === e.pointerId) release(); // quick tap → replay press before release
    else if (pinching) e.stopImmediatePropagation();
    pts.delete(e.pointerId);
    if (!pts.size) pinching = false;
  };
  for (const t of ['pointerup', 'pointercancel']) target.addEventListener(t, end, true);
}

function init() {
  rotatePrompt();
  if (document.body.classList.contains('cs-char')) {
    let n = 0; const t = setInterval(() => { if (charPanelToggle() || ++n > 40) clearInterval(t); }, 250);
  }
  if (document.body.classList.contains('cs-build')) {
    pinchZoom(document.getElementById('plan'));
    pinchZoom(document.getElementById('scene3d'));
  }
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
