// Screen history and keyboard focus adapted from Riposte 09e-menus uiGo/uiBack
// and 09ea-liste lmStep. Copyright (c) 2026 BenDBSS. See licenses/riposte-MIT.txt.
import {mountAccountProfile} from './account-profile.mjs';
import {UI_EN, selectedMapName} from './english-ui.mjs';
import {loadSoloManifest, resolveSoloSelection, soloCatalog, soloMapURL} from './solo-maps.mjs';
import {FAMILY_ROOM_PATH} from '../../shared/multiplayer/family-room.mjs';
import {createFullscreenController} from './fullscreen.mjs';

const routes = ['main', 'play', 'friends', 'solo', 'maps', 'classes', 'outfits', 'profile', 'options', 'news'];
const parentRoute = {play:'main', friends:'play', solo:'play', maps:'solo', classes:'main', outfits:'main', profile:'main', options:'main', news:'main'};

export function initialScreen(url) {
  const query = url.searchParams;
  if (['local', 'lan', 'internet'].includes(query.get('network'))) return query.get('screen') === 'options' ? 'options' : 'network';
  if (routes.includes(query.get('screen'))) return query.get('screen');
  if (['level', 'avatar', 'character', 'seed', 'team'].some(key => query.has(key))) return 'solo';
  return 'main';
}

export function parentScreenURL(address, screen) {
  const url = new URL(address);
  url.searchParams.delete('screen');
  const dest = screen === 'options' && initialScreen(url) === 'network' ? 'network' : parentRoute[screen] || 'main';
  if (dest !== 'network') url.searchParams.set('screen', dest);
  return url;
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
  const profile = mountAccountProfile(menu.querySelector('[data-account-profile]'));
  let screen;
  settings.dataset.go = 'options';

  function show(name, focus = true, restore = '') {
    if (screen === 'profile' && name !== screen) profile.reset();
    screen = name;
    if (name === 'profile') profile.open();
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
      const url = parentScreenURL(location.href, screen);
      history.replaceState({csMenu:true}, '', url);
      show(initialScreen(url));
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
  const mode = document.getElementById('game-mode');
  const loading = document.getElementById('loading');
  const mapList = document.getElementById('solo-map-list');
  const listStatus = document.getElementById('map-list-status');
  const notice = document.getElementById('solo-map-notice');
  const random = document.getElementById('random-map');
  let selection, entries = [];

  function decorate(card, entry) {
    card.classList.toggle('map-art', Boolean(entry?.preview));
    if (entry?.preview) card.style.setProperty('--cs-map-art', `url("../${entry.preview}")`);
    else card.style.removeProperty('--cs-map-art');
  }
  function updateMapLabel() {
    if (screen === 'network') return;
    const display = selection?.id === 'preview' ? loading.dataset.mapName || selection.name : selection?.name || loading.dataset.mapName;
    for (const tile of menu.querySelectorAll('[data-map-name]')) tile.textContent = selectedMapName(new URLSearchParams(location.search), display);
    if (selection) {
      const tile = menu.querySelector('.map-tile');
      tile.classList.remove('image-floor');
      decorate(tile, selection);
    }
  }
  function applySelection(value) {
    selection = value;
    const url = new URL(location.href);
    // A corrected deep link is shareable and the explanation remains visible.
    if (value.notice) {
      url.searchParams.set('level',value.id);
      url.searchParams.set('mode',value.mode);
      history.replaceState(history.state,'',url);
    }
    const html = document.documentElement;
    if (value.preview) html.style.setProperty('--cs-load-art', `url("../${value.preview}")`);
    else html.style.removeProperty('--cs-load-art');
    html.toggleAttribute('data-cs-map-art',Boolean(value.preview));
    notice.textContent = value.notice;
    notice.hidden = !value.notice;
    for (const option of mode.options) option.disabled = !value.modes.includes(option.value);
    updateMapLabel();
  }
  menu.addEventListener('cs-solo-selection', event => applySelection(event.detail));
  new MutationObserver(updateMapLabel).observe(loading, {attributes:true, attributeFilter:['data-map-name']});
  updateMapLabel();

  function choose(entry) {
    const nextMode = entry.modes.includes(mode.value) ? mode.value : entry.modes[0];
    if (selection?.id === entry.id && nextMode === mode.value) return previous();
    const next = soloMapURL(location.href,{id:entry.id,mode:nextMode},{
      team:menu.dataset.side,seed:document.getElementById('seed').value,
    });
    location.replace(next);
  }
  async function showMaps() {
    try {
      const manifest = await loadSoloManifest();
      if (screen !== 'maps') return;
      let hasPrivate = false;
      try { hasPrivate = Boolean(localStorage.getItem('cartridge-level-preview')); } catch {}
      entries = soloCatalog(manifest, hasPrivate);
      selection ??= resolveSoloSelection(manifest, new URLSearchParams(location.search), mode.value);
      mapList.replaceChildren();
      for (const entry of entries) {
        const card = document.createElement('button'), title = document.createElement('strong'), detail = document.createElement('span');
        card.type = 'button'; card.className = 'route-card'; card.dataset.mapId = entry.id;
        card.id = entry.id === 'floor5-prepared' ? 'choose-floor5' : 'choose-' + entry.id;
        card.setAttribute('aria-pressed',String(entry.id === selection.id));
        title.textContent = entry.name;
        detail.textContent = entry.id === 'preview' ? 'Saved on this device' : entry.modes.map(id => UI_EN.modes[id].name).join(' · ');
        card.append(title,detail);
        decorate(card,entry);
        card.onclick = () => choose(entry);
        mapList.append(card);
      }
      random.hidden = !entries.some(entry => entry.random && entry.modes.includes(mode.value));
      listStatus.hidden = entries.length > 0;
      listStatus.textContent = 'No Solo maps are available.';
    } catch {
      listStatus.hidden = false;
      listStatus.textContent = 'The map list could not be loaded. Return to Solo and reopen Maps to retry.';
    }
  }
  random.onclick = () => {
    const choices = entries.filter(entry => entry.random && entry.modes.includes(mode.value));
    if (choices.length) choose(choices[Math.floor(Math.random() * choices.length)]);
  };
  menu.addEventListener('cs-menu-screen', event => {
    if (event.detail.screen === 'maps') showMaps();
  });
  mode.addEventListener('change', () => {
    const url = new URL(location.href);
    if (url.searchParams.has('mode')) {
      url.searchParams.set('mode', mode.value);
      history.replaceState(history.state,'',url);
    }
  });

  const local = ['localhost','127.0.0.1','[::1]'].includes(location.hostname) ||
    /^(?:10\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(location.hostname) || location.hostname.endsWith('.local');
  const production = location.hostname === 'cs2.capstere.com' || query.get('network') === 'internet';
  if (production) {
    for (const link of menu.querySelectorAll('[data-family-link]')) link.href = FAMILY_ROOM_PATH;
    menu.querySelector('[data-join-code]').href = '/join';
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
  addEventListener('pagehide',profile.reset);
  addEventListener('pageshow', e => { if (e.persisted && screen === 'profile') profile.open(); });
  show(initialScreen(new URL(location.href)), false);
}
if (typeof document !== 'undefined') mountMenu();
