// CARTRIDGE-STRIKE // in-game presentation helper (no gameplay logic).
// - Groups the existing #shop buttons (rendered by app.mjs refreshShop) into categories,
//   marks affordability/other-team items and shows a detail panel. Clicking still calls the
//   original button.onclick → game.buy(); prices/stats come from the same WEAPONS table.
// - Mirrors the round timer into the buy header, and tags round/match winners for team accents.
import { WEAPONS } from './config.mjs';

const $ = id => document.getElementById(id);
const html = document.documentElement;
const TEAM_NAME = { analysts: 'Analysts', counterAnalysts: 'Counter Analysts' };

const P = {
  rifle: 'M2 11h4l1-2h12l1-2h3v2h3v2h-3l-1 1h-3l-1 3h-3l1-3H9l-2 5H4l1-5H2z',
  smg: 'M3 10h14l1-2h3v3h-4l-1 2h-2l-1 5H10l1-5H7l-1 2H4l1-3H3z',
  shotgun: 'M1 10h22v2H11l-1 1H7l-2 4H2l2-5H1z',
  sniper: 'M1 11h7l1-2h4V8h4v1h6v1h-6v2H11l-2 5H6l1-5H1z',
  rocket: 'M1 9h18l3 1.5L19 12H1zM7 12h3l-1 5H6z',
  grenade: 'M10 4h4v2h1.5A4.5 4.5 0 0 1 20 10.5v4A5.5 5.5 0 0 1 14.5 20h-5A5.5 5.5 0 0 1 4 14.5v-4A4.5 4.5 0 0 1 8.5 6H10z',
  armor: 'M7 3h3l2 2 2-2h3l3 3v6c0 4-3 7-8 9-5-2-8-5-8-9V6z',
};
const iconFor = w => w.slot === 'armor' ? 'armor' : w.slot === 'grenade' ? 'grenade' : ({ smg: 'smg', shotgun: 'shotgun', sniper: 'sniper', bazooka: 'rocket' })[w.id] || 'rifle';
const svg = (k, view = '0 0 24 24') => `<svg viewBox="${view}" aria-hidden="true"><path d="${P[k]}"/></svg>`;
const CATS = [
  { key: 'primary', label: 'Primary weapons', test: w => w.slot !== 'grenade' && w.slot !== 'armor' },
  { key: 'grenade', label: 'Grenades', test: w => w.slot === 'grenade' },
  { key: 'armor', label: 'Equipment', test: w => w.slot === 'armor' },
];

const team = () => $('menu')?.dataset.side || 'analysts';
function money() {
  const {free,credits} = $('buy-money').dataset;
  if (free === 'true') return Infinity;
  return credits === undefined ? null : Number(credits);
}

let detail, grouping = false;
function ensureDetail() {
  if (detail) return detail;
  detail = document.createElement('aside');
  detail.className = 'cs-buy-detail';
  detail.setAttribute('aria-live', 'polite');
  $('shop').after(detail);
  return detail;
}
function showDetail(w) {
  const d = ensureDetail();
  if (!w) { d.innerHTML = '<small>SELECTED EQUIPMENT</small><p>'+(html.classList.contains('network-session-ui')?'Select a weapon for your next spawn.':'Select an item to view its details and equip it.')+'</p>'; return; }
  const bar = (label, v, max, txt) => `<div>${label}<i style="--v:${Math.min(100, Math.round(v / max * 100))}%"></i><b>${txt}</b></div>`;
  let stats = '';
  if (w.slot === 'grenade') stats = `<div>MAX<i style="--v:${w.limit * 50}%"></i><b>${w.limit}</b></div>`;
  else if (w.slot === 'armor') stats = bar('ARMOR', 100, 100, '100');
  else stats = bar('DAMAGE', (w.damage || 0) * (w.pellets || 1), 150, `${w.damage}${w.pellets > 1 ? '×' + w.pellets : ''}`)
    + bar('FIRE RATE', 1 / (w.interval || 1), 14, `${(1 / (w.interval || 1)).toFixed(1)}/s`)
    + bar('MAGAZINE', w.magazine || 0, 30, `${w.magazine}/${w.reserve}`)
    + (w.reload ? bar('RELOAD', 3.2 - w.reload, 2, `${w.reload}s`) : '');
  const free = money() === Infinity;
  d.innerHTML = `<small>${(CATS.find(c => c.test(w))?.label || '').toUpperCase()}${w.team ? ' · ' + TEAM_NAME[w.team].toUpperCase() : ''}</small><h4>${w.name}</h4><div class="cs-big">${svg(iconFor(w))}</div><dl>${stats}</dl><small>${free ? 'FREE' : w.cost + ' ¤'}</small>`;
}

function refreshPrices() {
  const cash = money();
  for (const button of $('shop').querySelectorAll('button[data-item]')) {
    const weapon = WEAPONS[button.dataset.item];
    if (weapon) button.classList.toggle('cs-cant', Number.isFinite(cash) && weapon.cost > cash);
  }
}

function group() {
  const shop = $('shop'); if (!shop || grouping) return;
  const buttons = [...shop.children].filter(el => el.tagName === 'BUTTON');
  if (!buttons.length) return;
  grouping = true;
  const side = $('buy').dataset.team || team();
  const cols = CATS.map((c, i) => { const col = document.createElement('section'); col.className = 'cs-buy-col'; col.innerHTML = `<h3><b>${i + 1}</b>${c.label}</h3>`; return { c, col }; });
  for (const b of buttons) {
    const w = WEAPONS[b.dataset.item]; if (!w) continue;
    if (!b.querySelector('.cs-ico')) b.insertAdjacentHTML('afterbegin', `<span class="cs-ico">${svg(iconFor(w))}</span>`);
    b.classList.toggle('cs-other', !!w.team && w.team !== side);
    b.onmouseenter = b.onfocus = () => showDetail(w);
    b.addEventListener('pointerdown', () => showDetail(w), { passive: true });
    (cols.find(x => x.c.test(w)) || cols[0]).col.append(b);
  }
  shop.replaceChildren(...cols.filter(x => x.col.children.length > 1).map(x => x.col));
  refreshPrices();
  if (!detail) showDetail(null);
  grouping = false;
}

function initBuy() {
  const shop = $('shop'); if (!shop) return;
  new MutationObserver(refreshPrices).observe($('buy-money'), { attributes:true, attributeFilter:['data-credits','data-free'] });
  new MutationObserver(group).observe(shop, { childList: true });
  const top = document.querySelector('#buy .card-top');
  const clock = document.createElement('span'); clock.className = 'cs-buy-clock';
  top?.insertBefore(clock, $('close-buy'));
  const msg = $('buy-message');
  new MutationObserver(() => msg.classList.toggle('cs-err', msg.dataset.outcome === 'denied')).observe(msg, { attributes:true, attributeFilter:['data-outcome'] });
  const syncClock = () => {
    if ($('buy').hidden) return;
    clock.innerHTML = `${($('phase')?.textContent || '').toUpperCase()}<b>${$('timer')?.textContent || ''}</b>`;
  };
  const clockChanges = new MutationObserver(syncClock);
  new MutationObserver(() => {
    if ($('buy').hidden) showDetail(null);
    else syncClock();
  }).observe($('buy'), { attributes: true, attributeFilter: ['hidden'] });
  for (const id of ['phase', 'timer']) clockChanges.observe($(id), { childList: true });
}

function watchWinner(id, attribute) {
  const element = $(id);
  const update = () => {
    const winner = element.dataset.winner;
    if (Object.hasOwn(TEAM_NAME, winner)) html.dataset[attribute] = winner;
    else delete html.dataset[attribute];
  };
  new MutationObserver(update).observe(element, {attributes:true, attributeFilter:['data-winner']});
  update();
}

function init() {
  initBuy();
  watchWinner('result-title', 'csRound');
  watchWinner('match-winner', 'csMatch');
  const card = document.querySelector('#match-end .pause-card');
  if (card && !card.querySelector('.cs-strip')) card.insertAdjacentHTML('afterbegin', '<i class="cs-strip" aria-hidden="true"></i>');
  const sync = () => { const t = team(); if (html.dataset.csTeam !== t) html.dataset.csTeam = t; };
  sync();
  new MutationObserver(sync).observe($('menu'), { attributes: true, attributeFilter: ['data-side'] });
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
