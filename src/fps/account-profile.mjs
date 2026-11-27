// The optional account/profile routes adapt Riposte's 09j-compte account flow.
// Account and room credentials travel in separate server-managed cookies.
const portal = 'https://cs2.capstere.com/profile';
const fields = {
  username: ['Username', 'text', 'username'],
  displayName: ['Display name', 'text', 'nickname'],
  password: ['Password', 'password', 'current-password'],
  newPassword: ['New password', 'password', 'new-password'],
  recoveryCode: ['Recovery code', 'password', 'off'],
};
const forms = {
  login: ['Sign in', ['username', 'password']],
  register: ['Create account', ['username', 'displayName', 'password']],
  recover: ['Recover account', ['username', 'recoveryCode', 'newPassword']],
  profile: ['Save display name', ['displayName']],
  password: ['Change password', ['password', 'newPassword']],
  'recovery-code': ['Replace recovery code', ['password']],
  delete: ['Delete account permanently', ['password']],
};
const labels = {matches:'Matches', wins:'Wins', kills:'Kills', deaths:'Deaths', xp:'XP'};
const modes = {classic:'Classic', tdm:'Team Deathmatch', endless:'Endless'};
const knownMaps = {'floor5-prepared':'Floor 5 Laboratory', 'compact-arena':'Compact Arena', meltem:'Meltem', embruns:'Kervénec', tephra:'Tephra'};
function element(tag, text, className) {
  const el = document.createElement(tag);
  if (text !== undefined) el.textContent = text;
  if (className) el.className = className;
  return el;
}
function button(label, action, primary = false) {
  const el = element('button', label, primary ? 'account-primary' : '');
  el.type = 'button'; el.addEventListener('click', action);
  return el;
}
function link(label, href) {
  const el = element('a', label, 'account-link');
  el.href = href;
  return el;
}
export async function accountRequest(path, body) {
  const options = {credentials:'same-origin', cache:'no-store', headers:{Accept:'application/json'}};
  if (body !== undefined) {
    Object.assign(options, {method:'POST', body:JSON.stringify(body)});
    options.headers['Content-Type'] = 'application/json';
  }
  const response = await fetch(path, options);
  if (!response.headers.get('Content-Type')?.includes('application/json')) {
    throw Error('Online accounts are unavailable on this server.');
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || 'The request failed. Try again.');
  return result;
}
export function mountAccountProfile(root) {
  let generation = 0;
  const reset = () => { generation++; root.replaceChildren(); };
  function open() {
    reset();
    const current = generation, valid = () => current === generation;
    const box = element('div', undefined, 'account-box');
    const view = element('div'), notice = element('p');
    notice.setAttribute('role','status');
    box.append(view, notice); root.append(box);
    let data, busy = false;
    const actions = (...controls) => {
      const row = element('div', undefined, 'account-actions'); row.append(...controls); return row;
    };
    const message = text => { if (valid()) notice.textContent = text; };
    function unavailable(reason) {
      view.replaceChildren(element('h2','Local guest'), element('p','Your controls and saved characters stay in this browser.'));
      if (location.origin !== new URL(portal).origin) view.append(link('Open online profile',portal));
      if (reason) { view.append(button('Retry',open)); message(reason); }
    }
    async function mutate(path, payload, form) {
      if (busy) return;
      busy = true;
      const submitted = form?.querySelector('[type=submit]');
      if (submitted) submitted.disabled = true;
      message('Saving…');
      try {
        const result = await accountRequest(path,payload);
        if (!valid()) return;
        data = result;
        render();
        if (result.recoveryCode) {
          const code = result.recoveryCode;
          delete result.recoveryCode;
          showCode(code);
        } else message(path.endsWith('/logout') ? 'Signed out on this device.' : 'Saved.');
      } catch (error) { message(error.message || 'Connection unavailable. Try again.'); }
      finally { busy = false; if (submitted) submitted.disabled = false; }
    }
    function makeForm(action) {
      const [title, keys] = forms[action], form = element('form');
      form.method = 'post';
      for (const key of keys) {
        const [labelText, type, complete] = fields[key];
        const label = element('label', labelText), input = element('input');
        Object.assign(input,{type, name:key, required:true, autocomplete:complete});
        if (key === 'username') Object.assign(input,{minLength:3, maxLength:24, pattern:'[A-Za-z0-9_]{3,24}', title:'Use 3 to 24 letters, numbers or underscores.'});
        if (key === 'displayName') { input.maxLength = 24; input.value = data?.user?.displayName || ''; }
        if (key === 'newPassword' || (key === 'password' && action === 'register')) {
          input.autocomplete = 'new-password'; input.minLength = 12;
          label.append(element('small','Use at least 12 characters.'));
        }
        if (['username','recoveryCode'].includes(key)) { input.spellcheck = false; input.autocapitalize = 'none'; }
        label.append(input); form.append(label);
      }
      if (action === 'delete') form.append(element('p','This permanently deletes your account and recorded match history.'));
      const submit = element('button',title,'account-primary'); submit.type = 'submit'; form.append(submit);
      form.addEventListener('submit',e => {
        e.preventDefault();
        mutate('/api/account/'+action,Object.fromEntries(new FormData(form)),form);
      });
      return form;
    }
    function showCode(code) {
      const input = element('input'), label = element('label','Your recovery code');
      input.readOnly = true; input.value = code;
      label.append(input);
      view.replaceChildren(element('h2','Save your recovery code'),element('p','Keep it somewhere private. If you lose both your password and this code, you cannot recover your account.'),label,
        actions(button('Copy code',async () => {
          try { await navigator.clipboard.writeText(code); message('Recovery code copied.'); }
          catch { input.focus(); input.select(); message('Select and copy your recovery code.'); }
        }),button('I saved my code',() => { render(); message(''); },true)));
      message(''); input.focus();
    }
    function remembered() {
      if (!data.rooms?.length) return;
      view.append(element('h3','Remembered rooms on this device'));
      for (const room of data.rooms) {
        const family = room === 'JESPERS-ROOM';
        const entry = link(room, '/fps/?network=internet&'+(family?'family=':'room=')+encodeURIComponent(room));
        const forget = button('Forget', async () => {
          if (busy) return;
          busy = true;
          try {
            const result = await accountRequest('/api/room/forget',{room});
            if (!valid()) return;
            data.rooms = result.rooms; render(); message('Room forgotten on this device.');
          } catch (e) { message(e.message); } finally { busy = false; }
        });
        forget.setAttribute('aria-label','Forget '+room+' on this device');
        view.append(actions(entry,forget));
      }
    }
    function publicMatches() {
      view.replaceChildren(element('h2','Public matches'),element('p','Join an available room hosted by another signed-in player.'));
      const list = element('div'), back = button('Back to profile',render);
      view.append(list,actions(button('Refresh rooms',publicMatches),back));
      message('Loading available rooms…');
      accountRequest('/api/rooms/public').then(result => {
        if (!valid() || !list.isConnected) return;
        message('');
        if (!result.rooms.length) list.append(element('p','No public rooms are accepting players.'));
        for (const item of result.rooms) {
          const summary = element('span',(knownMaps[item.map] || item.map)+' · '+(modes[item.mode] || item.mode)+' · '+item.players+'/'+item.capacity+' players');
          const enter = button('Join match',async () => {
            enter.disabled = true;
            try {
              const seat = await accountRequest('/api/room/public-join',{room:item.id});
              if (valid() && list.isConnected) location.assign(seat.destination);
            } catch (e) { message(e.message); enter.disabled = false; }
          },true);
          list.append(actions(summary,enter));
        }
      }).catch(e => { if (list.isConnected) message(e.message); });
    }
    function blockedPlayers() {
      view.replaceChildren(element('h2','Blocked players'));
      const list=element('div');
      view.append(list,actions(button('Back to profile',render)));
      accountRequest('/api/account/blocks').then(result => {
        if (!valid() || !list.isConnected) return;
        if (!result.blocks.length) list.append(element('p','You have no blocked players.'));
        for (const person of result.blocks) {
          const unblock = button('Unblock', async () => {
            unblock.disabled = true;
            try {
              await accountRequest('/api/account/unblock',{id:person.id});
              if (list.isConnected) blockedPlayers();
            } catch(e) { message(e.message); unblock.disabled=false; }
          });
          list.append(actions(element('span',person.name),unblock));
        }
      }).catch(e=>{ if (list.isConnected) message(e.message); });
    }
    function render() {
      view.replaceChildren(); message('');
      if (!data.user) {
        view.append(element('h2','Local guest'),element('p','Sign in to save multiplayer results across devices. You can also play as a guest.'));
        const pane = element('div');
        const select = (action,focus) => {
          const form = makeForm(action); pane.replaceChildren(form);
          for (const control of tabs.children) control.setAttribute('aria-pressed',String(control.dataset.action===action));
          if (focus) form.querySelector('input').focus();
        };
        const tabs = actions(...['login','register','recover'].map(action => {
          const b = button(forms[action][0],() => select(action,true)); b.dataset.action = action; return b;
        }));
        select('login',false); view.append(tabs,pane); remembered(); return;
      }
      view.append(element('h2',data.user.displayName),element('p','Signed in as '+data.user.username));
      const stats = element('dl',undefined,'account-stats');
      for (const [key,title] of Object.entries(labels)) {
        const cell = element('div'); cell.append(element('dt',title),element('dd',String(data.stats[key] || 0))); stats.append(cell);
      }
      view.append(stats);
      if (data.features?.publicMatches) view.append(actions(button('Find a public match',publicMatches,true),button('Blocked players',blockedPlayers)));
      view.append(element('h3','Recent matches'));
      if (data.recent.length) {
        const ul = element('ul');
        for (const match of data.recent) {
          const map = knownMaps[match.map] || match.map;
          const when = new Date(match.played).toLocaleDateString('en',{month:'short',day:'numeric',year:'numeric'});
          ul.append(element('li',[when,modes[match.mode] || match.mode,map,match.win?'Won':'Played',match.kills+' kills / '+match.deaths+' deaths'].join(' · ')));
        }
        view.append(ul);
      } else view.append(element('p','Complete a multiplayer match to record your first result.'));
      remembered();
      view.append(element('h3','Manage account'));
      for (const [action,title] of [['profile','Display name'],['password','Password'],['recovery-code','Recovery code'],['delete','Delete account']]) {
        const details = element('details'); details.append(element('summary',title),makeForm(action)); view.append(details);
      }
      view.append(actions(link('Download account data','/api/account/export'),button('Sign out',() => mutate('/api/account/logout',{}))));
    }
    if (location.hostname.endsWith('.github.io')) { unavailable(); return; }
    message('Loading profile…');
    accountRequest('/api/account').then(value => {
      if (!valid()) return;
      if (!Array.isArray(value.rooms)) { unavailable('Online accounts are unavailable on this server.'); return; }
      data = value; render();
      if (value.user && value.features?.publicMatches && location.hash === '#public-matches') publicMatches();
    }).catch(error => { if (valid()) unavailable(error.message); });
  }
  return {open,reset};
}
if (typeof document !== 'undefined') {
  const root = document.querySelector('[data-account-profile][data-standalone]');
  if (root) {
    const profile = mountAccountProfile(root);
    profile.open();
    addEventListener('pagehide', profile.reset);
    addEventListener('pageshow', e => { if (e.persisted) profile.open(); });
  }
}
