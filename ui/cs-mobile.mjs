// Cartridge-Strike game-only mobile orientation support.
const html = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) html.classList.add('cs-touch');
try { if (sessionStorage.getItem('cs-rotate-ok')) html.classList.add('cs-rotate-ok'); } catch {}

function rotatePrompt() {
  const el = document.createElement('div');
  el.className = 'cs-rotate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Vrid skärmen');
  el.innerHTML = '<div class="cs-rotate-phone" aria-hidden="true"></div><small>CARTRIDGE//STRIKE</small><strong>Vrid telefonen</strong><p>Spelet är anpassat för liggande läge. Vrid telefonen för bästa spelupplevelse.</p><button type="button">Fortsätt ändå</button>';
  el.querySelector('button').addEventListener('click', () => {
    html.classList.add('cs-rotate-ok');
    try { sessionStorage.setItem('cs-rotate-ok', '1'); } catch {}
  });
  document.body.appendChild(el);
}

function init() { rotatePrompt(); }
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
