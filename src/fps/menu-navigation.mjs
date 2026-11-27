// Screen history and keyboard focus adapted from Riposte 09e-menus uiGo/uiBack
// and 09ea-liste lmStep. Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
import {selectedMapName} from './english-ui.mjs';
import {FAMILY_ROOM_PATH} from '../../shared/multiplayer/family-room.mjs';
import {createFullscreenController} from './fullscreen.mjs';

const routes = ['main', 'play', 'friends', 'solo', 'maps', 'classes', 'outfits', 'options', 'news'];
const parentRoute = {play:'main', friends:'play', solo:'play', maps:'solo', classes:'main', outfits:'main', options:'main', news:'main'};

export function initialScreen(url) {
  const query = url.searchParams;
  if (['local', 'lan', 'internet'].includes(query.get('network'))) return query.get('screen') === 'options' ? 'options' : 'network';
  if (routes.includes(query.get('screen'))) return query.get('screen');
  if (['level', 'avatar', 'character', 'seed', 'team'].some(key => query.has(key))) return 'solo';
  return 'main';
}

function mountMenu() {
  const menu = document.getElementById('menu');
  const query = new URLSearchParams(location.search);
  const setup = menu.querySelectorAll('[data-panel="setup"]');
  const panels = menu.querySelectorAll('.route-panel');
  const back = document.getElementById('route-back');
  const drawer = document.getElementById('mm-settings');
  const settings = document.getElementById('mm-open-settings');
  const fullscreen = createFullscreenController(document);
  const fullscreenButton = document.getElementById('menu-fullscreen');
  let screen;
  settings.dataset.go = 'options';

  function show(name, focus = true, restore = '') {
    screen = name;
    menu.dataset.screen = name;
    for (const panel of panels) panel.hidden = panel.dataset.panel !== name;
    for (const panel of setup) panel.hidden = name !== 'solo' && name !== 'network';
    drawer.hidden = name !== 'options';
    drawer.open = !drawer.hidden;
    back.hidden = name === 'main';
    settings.hidden = name === 'options';
    if (name === 'network') document.getElementById('setup-title').textContent = 'Private multiplayer';
    if (focus) {
      const target = document.getElementById(restore) || menu.querySelector('.route-panel:not([hidden]) h1') ||
        (name === 'options' ? drawer.querySelector('summary') : document.getElementById('setup-title'));
      target?.focus({preventScroll:true});
    }
    menu.dispatchEvent(new CustomEvent('cs-menu-screen', {detail:{screen:name}}));
  }

  function go(name, opener, focusId) {
    if (!routes.includes(name) || name === screen) return;
    // A network connection is scoped to its page. Leaving it returns to offline navigation.
    if (screen === 'network' && name !== 'options') {
      const dest = new URL('./', location.href);
      dest.searchParams.set('screen', name);
      location.assign(dest);
      return;
    }
    if (opener) history.replaceState({...history.state, focus:opener.id}, '');
    const url = new URL(location.href);
    url.searchParams.set('screen', name);
    history.pushState({csMenu:true, from:screen}, '', url);
    show(name, true, focusId);
  }

  function previous() {
    if (screen === 'main') return;
    if (history.state?.from && screen !== 'network') history.back();
    else if (screen === 'network') go('friends');
    else {
      const dest = parentRoute[screen] || 'main';
      const url = new URL(location.href);
      url.searchParams.set('screen', dest);
      history.replaceState({csMenu:true}, '', url);
      show(dest);
    }
  }

  for (const [index, control] of [...menu.querySelectorAll('[data-go]')].entries()) {
    if (!control.id) control.id = 'menu-link-' + index;
  }
  menu.addEventListener('click', event => {
    const opener = event.target.closest('[data-go]');
    if (opener && !opener.disabled) go(opener.dataset.go, opener, opener.dataset.focus);
  });
  back.onclick = previous;
  drawer.querySelector('summary').addEventListener('click', event => {
    event.preventDefault();
    if (screen === 'options') previous();
  });
  document.getElementById('choose-floor5').onclick = () => {
    const currentLevel = query.get('level');
    if (!currentLevel || currentLevel === 'floor5-prepared') previous();
    else {
      const url = new URL(location.href);
      url.searchParams.set('level', 'floor5-prepared');
      url.searchParams.set('screen', 'solo');
      location.assign(url);
    }
  };
  for (const element of menu.querySelectorAll('[data-map-name]')) {
    element.textContent = selectedMapName(query);
  }
  function updateMapLabel() {
    const loading = document.getElementById('loading');
    for (const tile of menu.querySelectorAll('[data-map-name]')) {
      tile.textContent = selectedMapName(query, loading.dataset.mapName);
    }
    const map = query.get('level');
    const selected = !map || map === 'floor5-prepared';
    document.getElementById('choose-floor5').setAttribute('aria-pressed', String(selected));
    menu.querySelector('.map-tile').classList.toggle('image-floor', selected || map === 'classic-floor5');
  }
  const loading = document.getElementById('loading');
  new MutationObserver(updateMapLabel).observe(loading, {attributes:true, attributeFilter:['data-map-name']});
  updateMapLabel();

  const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(location.hostname) || location.hostname.endsWith('.local');
  const production = location.hostname === 'cs2.capstere.com' || query.get('network') === 'internet';
  if (production) {
    for (const link of menu.querySelectorAll('[data-family-link]')) link.href = FAMILY_ROOM_PATH;
    menu.querySelector('[data-private-link]').href = '?network=internet';
  }
  menu.querySelector('[data-lan-link]').hidden = !local;
  fullscreenButton.hidden = !fullscreen.supported;
  fullscreenButton.onclick = () => fullscreen.toggle();
  document.addEventListener('fullscreenchange', () => {
    fullscreenButton.textContent = fullscreen.active ? 'Exit fullscreen' : 'Fullscreen';
  });
  addEventListener('popstate', () => {
    if (!menu.hidden) show(initialScreen(new URL(location.href)), true, history.state?.focus);
  });
  addEventListener('keydown', event => {
    if (menu.hidden || menu.inert || event.defaultPrevented) return;
    if (event.key === 'Escape' && screen !== 'main') {
      event.preventDefault(); event.stopImmediatePropagation(); previous();
      return;
    }
    const nav = event.target.closest?.('.home-nav, .route-cards');
    if (!nav || !['ArrowDown','ArrowUp','ArrowLeft','ArrowRight'].includes(event.key)) return;
    const buttons = [...nav.querySelectorAll('button:not(:disabled), a[href]')].filter(el => !el.hidden);
    const i = buttons.indexOf(event.target);
    if (i < 0) return;
    const d = ['ArrowDown','ArrowRight'].includes(event.key) ? 1 : -1;
    event.preventDefault();
    buttons[(i + d + buttons.length) % buttons.length].focus();
  }, true);
  show(initialScreen(new URL(location.href)), false);
}
if (typeof document !== 'undefined') mountMenu();
