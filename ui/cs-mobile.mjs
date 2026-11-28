import {installAppControls} from './cs-install.mjs';
// Cartridge-Strike game-only mobile orientation support.
import {isFamilyRoomLink} from '../shared/multiplayer/family-room.mjs';

const html = document.documentElement;
const coarse = matchMedia('(pointer: coarse)').matches;
if (coarse) html.classList.add('cs-touch');
if (isFamilyRoomLink(location.search)) html.classList.add('cs-family-lobby');
try { if (sessionStorage.getItem('cs-rotate-ok')) html.classList.add('cs-rotate-ok'); } catch {}

function rotatePrompt() {
  const el = document.createElement('div');
  el.className = 'cs-rotate';
  el.setAttribute('role', 'dialog');
  el.setAttribute('aria-label', 'Rotate your screen');
  el.innerHTML = '<div class="cs-rotate-phone" aria-hidden="true"></div><small>CARTRIDGE//STRIKE</small><strong>Rotate your phone</strong><p>Landscape gives you more room to move and aim.</p><button type="button">Continue in portrait</button>';
  el.querySelector('button').addEventListener('click', () => {
    html.classList.add('cs-rotate-ok');
    try { sessionStorage.setItem('cs-rotate-ok', '1'); } catch {}
  });
  document.body.appendChild(el);
}

function init() {
  rotatePrompt();
  installAppControls();
  const menu = document.getElementById('menu');
  const sync = () => html.classList.toggle('cs-in-match', menu.hidden);
  new MutationObserver(sync).observe(menu, {attributes:true, attributeFilter:['hidden']});
  sync();
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
