import {accountRequest} from '../account-profile.mjs';

const reasonLabels = {
  harassment:'Harassment', cheating:'Cheating', 'inappropriate-name':'Inappropriate name', other:'Other'
};
function node(tag,text) {
  const el=document.createElement(tag);
  if (text !== undefined) el.textContent=text;
  return el;
}
function action(text,run) {
  const el=node('button',text);
  el.type='button'; el.addEventListener('click',run);
  return el;
}
export function roomModeration(roomRoot) {
  const lobbyButton=roomRoot.querySelector('#room-public-tools');
  const pauseButton=node('button','Players and reporting');
  pauseButton.type='button'; pauseButton.hidden=true; pauseButton.className='secondary';
  document.querySelector('#pause .pause-card')?.insertBefore(pauseButton,document.querySelector('#pause .controls-list'));
  const dialog=node('dialog'); dialog.className='room-public-dialog account-box';
  const title=node('h2','Public match controls'); title.id='room-public-title'; dialog.setAttribute('aria-labelledby',title.id);
  const content=node('div'),status=node('p'); status.setAttribute('role','status');
  const close=action('Close',()=>dialog.close());
  dialog.append(title,content,status,close); document.body.append(dialog);
  let room='', owner=false, publication='private', generation=0, lookup=0;
  dialog.addEventListener('close',()=>{ generation++; content.replaceChildren();status.textContent=''; });
  dialog.addEventListener('keydown',e=>{ if (e.key==='Escape') e.stopPropagation(); });
  function row(...items) {
    const el=node('div'); el.className='account-actions'; el.append(...items); return el;
  }
  async function load() {
    const current=++generation;
    const active=()=>current===generation && dialog.open;
    content.replaceChildren();status.textContent='Loading players…';
    try {
      const state=await accountRequest('/api/room/moderation?room='+encodeURIComponent(room));
      if (!active()) return;
      publication=state.published?'public':'private';
      status.textContent='';
      async function change(path,body) {
        if (!active()) return;
        const controls=[...content.querySelectorAll('button')];
        for (const control of controls) control.disabled=true;
        try {
          await accountRequest('/api/room/'+path,{room,...body});
          if (active()) {
            if (path==='publish') publication=body.enabled?'public':'private';
            await load();
          }
        } catch(e) {
          if (active()) {
            status.textContent=e.message;
            for (const control of controls) control.disabled=false;
          }
        }
      }
      if (state.host) {
        const publish=action(state.published?'Make room private':'List this room publicly',()=>change('publish',{enabled:!state.published}));
        content.append(node('p',state.published?'Signed-in players can join this room. Making it private removes publicly admitted players.':
          'Only list an empty waiting room you want other signed-in players to join.'),publish);
      }
      if (!state.published) return;
      content.append(node('h3','Players'));
      if (!state.players.length) content.append(node('p','No other players are in the room.'));
      for (const player of state.players) {
        const section=node('details'); section.append(node('summary',player.name));
        const label=node('label','Report reason'),reasons=node('select');
        for (const [value,text] of Object.entries(reasonLabels)) reasons.add(new Option(text,value));
        label.append(reasons);
        const controls=row(action('Report player',()=>change('report',{player:player.id,reason:reasons.value})),
          action('Block player',()=>change('block',{player:player.id})));
        if (state.host) controls.append(action('Remove from room',()=>change('remove',{player:player.id})));
        section.append(label,controls);content.append(section);
      }
      if (state.host && state.reports?.length) {
        content.append(node('h3','Player reports'));
        const list=node('ul');
        for (const report of state.reports) {
          const player=state.players.find(p=>p.id===report.player);
          list.append(node('li',(player?.name || 'You')+' · '+(reasonLabels[report.reason]||'Other')+' · '+report.count));
        }
        content.append(list);
      }
    } catch(e) { if (active()) status.textContent=e.message; }
  }
  function open() { if (room && !dialog.open) { dialog.showModal();load(); } }
  lobbyButton.onclick=open; pauseButton.onclick=open;
  return {
    allowsPrivateInvites:()=>publication==='private',
    isPublished:()=>publication==='public',
    update(s) {
      const ready=s?.room?.state.actors.get(s.localPlayerId)?.ready;
      const available=ready && document.documentElement.hasAttribute('data-public-rooms') && !s.familyAlias && s.connectionState==='connected';
      const next=available?s.room.roomId:'';
      const host=!!next && s.room.state.ownerId===s.room.sessionId;
      if (room===next && owner===host) return;
      if (dialog.open) dialog.close();
      room=next; owner=host;
      const current=++lookup;
      publication=room?'loading':'private';
      lobbyButton.hidden=pauseButton.hidden=true;
      if (!room) return;
      // An authenticated member can see these controls in a public room. The
      // owner may also advertise an eligible private room from the same panel.
      accountRequest('/api/room/moderation?room='+encodeURIComponent(room)).then(state=>{
        if (current!==lookup) return;
        publication=state.published?'public':'private';
        lobbyButton.hidden=pauseButton.hidden=!state.host && !state.published;
      }).catch(()=>{
        if (current!==lookup) return;
        // The server still checks the publication state on every private action.
        publication='private';
        lobbyButton.hidden=pauseButton.hidden=!owner;
      });
    }
  };
}
