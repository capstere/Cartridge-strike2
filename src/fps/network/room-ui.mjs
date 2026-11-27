import {roomModeration} from './room-moderation.mjs';
import {roomInvitation} from './room-invitation.mjs';
import {accessText as en} from '../../../shared/multiplayer/access-english.mjs';
import {NETWORK_MAPS,networkMap} from '../../../shared/multiplayer/maps.mjs';
import {onlinePrimaries} from '../action-rules.mjs';
import {DIFFICULTIES,WEAPONS} from '../config.mjs';
import {FAMILY_ROOM_PATH} from '../../../shared/multiplayer/family-room.mjs';
import {BOT_COUNTS,CLASSIC_WINS,TDM_KILLS,TDM_MINUTES} from '../../../shared/multiplayer/rules.mjs';
const labels={analysts:'Analysts',counterAnalysts:'Counter Analysts',draw:en.draw};
const matchFields=[
  ['room-tdm-minutes','tdmMinutes',TDM_MINUTES],
  ['room-tdm-kills','tdmKills',TDM_KILLS],
  ['room-classic-wins','classicWins',CLASSIC_WINS],
  ['room-analysts-bots','analystsBots',BOT_COUNTS],
  ['room-counter-analysts-bots','counterAnalystsBots',BOT_COUNTS],
];
const residentFields=[['zombies','zombiesEnabled'],['danceman','dancemanEnabled']];
export function roomUi({leave,resume,activate}){
  const style=document.createElement('style');style.textContent=`
  #online-room{position:fixed;inset:0;z-index:75;background:#101919ed;overflow:auto;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom));color:#edf2e8;font:16px system-ui}
  #online-room[hidden]{display:none}#online-room .room-card{max-width:850px;margin:auto;padding:20px;border:1px solid #52716d;background:#182625}
  #online-room [hidden]{display:none!important}
  #online-room h2{font-size:clamp(24px,5vw,38px);margin:8px 0}#online-room .room-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  #online-room .room-header{display:flex;flex-wrap:wrap;justify-content:space-between;align-items:center;gap:0 12px}
  #online-room .room-header .room-actions{margin:6px 0}
  #online-room #room-identity{margin:0;font-size:14px}
  #online-room .room-map-card > div{min-width:0}
  #online-room #room-map-label{display:grid;gap:4px;font-size:14px}
  #online-room #room-map{box-sizing:border-box;width:100%;min-width:0}
  #online-room button,#online-room select,#online-room input{font:inherit;padding:12px;min-height:44px;color:inherit;background:#263c38;border:1px solid #738780;border-radius:3px}
  #online-room button.primary{background:#efbf64;color:#14201d;font-weight:700}#online-room button:disabled{opacity:.45}
  #online-room table{width:100%;border-collapse:collapse}#online-room td,#online-room th{text-align:left;padding:9px 5px;border-bottom:1px solid #39504b;font-size:14px}
  #online-room .room-roster{overflow-x:auto}#online-room input{width:100%;box-sizing:border-box}#online-room .muted{color:#b2c4bc}
  #online-room .room-settings{display:grid;grid-template-columns:1fr 1fr;gap:12px;margin:14px 0}
  #online-room .room-settings fieldset{margin:0;padding:10px 12px 12px;min-width:0;border:1px solid #52716d}
  #online-room .room-settings legend{padding:0 5px;font-size:13px;font-weight:700;letter-spacing:.06em;color:#efbf64}
  #online-room .room-controls{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px 12px}
  #online-room .room-controls label{display:flex;min-width:0;flex-direction:column;align-items:stretch;justify-content:end;gap:4px;font-size:13px}
  #online-room .room-controls select{box-sizing:border-box;width:100%;min-width:0;padding:8px;font-size:16px}
  #online-room .room-controls select:disabled{opacity:1;color:#edf2e8;background:#182625;border-color:#52716d}
  #online-room .room-controls .room-wide{grid-column:1/-1}
  #online-room .room-settings p{margin:8px 0 0;font-size:13px;line-height:1.35}
  #online-room .room-options{display:flex;align-items:center;flex-wrap:wrap;gap:8px 16px;margin:12px 0;font-size:14px}
  #online-room .room-options p{margin:0;color:#b2c4bc}
  #online-room .room-residents{display:flex;flex-wrap:wrap;gap:8px 16px}
  @media(max-width:680px){
    #online-room .room-card{padding:12px}
    #online-room .room-settings{grid-template-columns:1fr}
  }
  #online-room .notice{color:#ffce8c;min-height:1.3em}#online-room .room-eyebrow{letter-spacing:.15em;color:#efbf64;font-size:12px}
  `;document.head.append(style);
  const root=document.createElement('section');root.id='online-room';root.hidden=true;
  root.innerHTML=`<div class="room-card">
    <div class="room-eyebrow">${en.privateRoom}</div>
    <header class="room-header">
      <h2 id="room-title">${en.lobby}</h2>
      <div class="room-actions"><button type="button" id="room-public-tools" hidden>Public match controls</button><button type="button" id="room-invite" hidden aria-expanded="false" aria-controls="room-invitation">Invite a friend</button><button id="room-share">${en.shareLink}</button><button id="room-leave">${en.leave}</button></div>
    </header>
    <section class="room-invitation" id="room-invitation" hidden aria-label="Private invitation">
      <h3>Invite a friend</h3><p>Create one invitation for each player. A new invitation replaces the previous unused one.</p>
      <button type="button" data-invite-create>Create invitation</button>
      <div data-invite-output hidden><p>Invitation code <strong></strong> · Expires at <time></time></p>
        <label>Invitation link <input type="text" readonly autocomplete="off"></label>
        <button type="button" data-invite-share>Share or copy link</button></div>
      <p role="status"></p><button type="button" data-invite-revoke>Revoke shared access</button>
      <div data-invite-confirm hidden><p>Disconnect invited players and remove remembered invitation access for this room?</p>
        <button type="button" data-cancel>Keep access</button><button type="button" data-confirm>Revoke access</button></div>
    </section>
    <input id="room-link" readonly aria-label="${en.roomLink}" hidden>
    <p id="room-share-help" class="muted" hidden>${en.shareHelp}</p>
    <p id="room-identity" class="muted"></p>
    <p id="room-result-summary" hidden></p>
    <p id="room-rules"></p>
    <div class="room-options">
      <label id="room-friendly-fire-label" hidden>Friendly fire <select id="room-friendly-fire"><option value="off">${en.off}</option><option value="on">${en.on}</option></select></label>
      <p id="room-friendly-fire-status"></p>
      <label id="room-bot-difficulty-label" hidden>${en.botDifficulty} <select id="room-bot-difficulty"></select></label>
      <p id="room-bot-difficulty-status"></p>
      <div class="room-residents" id="room-residents" hidden>
        <label>Zombies <select id="room-zombies"><option value="off">${en.off}</option><option value="on">${en.on}</option></select></label>
        <label>${en.danceman} <select id="room-danceman"><option value="off">${en.off}</option><option value="on">${en.on}</option></select></label>
      </div>
      <p id="room-residents-status"></p>
    </div>
    <div class="room-actions">
      <label id="room-equipment-label">${en.equipment} <select id="room-primary"></select><small id="room-kit"></small></label>
      <label id="room-team-label">${en.yourTeam} <select id="room-team"><option value="analysts">Analysts</option><option value="counterAnalysts">Counter Analysts</option></select></label>
      <button id="room-ready" class="primary">${en.ready}</button><button id="room-start" class="primary">${en.startMatch}</button>
      <button id="room-rematch" class="primary">${en.rematch}</button><button id="room-resume" class="primary">${en.resume}</button>
    </div>
    <p id="room-help"></p><p id="room-notice" class="notice" role="status"></p>
    <div class="room-roster">
      <table><thead><tr><th>${en.player}</th><th>${en.team}</th><th>Status</th><th>K</th><th>D</th></tr></thead><tbody id="room-roster"></tbody></table>
    </div>
  </div>`;
  document.body.append(root);const $=id=>root.querySelector('#'+id);let session,key='';
  $('room-rules').insertAdjacentHTML('afterend',`<div class="room-settings">
    <fieldset><legend>${en.matchRules}</legend>
      <div class="room-controls">
        <label class="room-wide" hidden>${en.mode}<select id="room-mode"></select></label>
        <label>${en.matchLength}<select id="room-tdm-minutes"></select></label>
        <label>${en.targetKills}<select id="room-tdm-kills"></select></label>
        <label>${en.targetRounds}<select id="room-classic-wins"></select></label>
      </div>
    </fieldset>
    <fieldset><legend>${en.teamBots}</legend>
      <div class="room-controls">
        <label>Analysts<select id="room-analysts-bots"></select></label>
        <label>Counter Analysts<select id="room-counter-analysts-bots"></select></label>
      </div>
      <p class="muted">${en.botHelp}</p>
    </fieldset>
  </div>`);
  $('room-rules').insertAdjacentHTML('beforebegin',`<section class="room-map-card" aria-label="${en.matchMap}">
    <img id="room-map-preview" alt="" width="256" height="128">
    <div><h3 id="room-map-name"></h3><p id="room-map-modes"></p>
    <label id="room-map-label" hidden>${en.map} <select id="room-map"></select></label></div>
  </section>`);
  $('room-map').replaceChildren(...NETWORK_MAPS.map(map=>new Option(map.name,map.id)));
  $('room-map').onchange=()=>session.matchCommand('settings',{mapId:$('room-map').value});
  const modeLabels={tdm:'Team Deathmatch',classic:'Classic'};
  const shareHelp=$('room-share-help'),normalShareHelp=shareHelp.textContent;
  const invitation=roomInvitation(root),moderation=roomModeration(root);
  const privateAccess=new URLSearchParams(location.search).get('network')==='internet';
  $('room-leave').onclick=()=>{moderation.update(null);invitation.update('');root.hidden=true;session=null;leave();};
  $('room-ready').onclick=()=>{activate();const a=session.room.state.actors.get(session.localPlayerId);session.matchCommand('ready',{ready:!a.playerReady});};
  $('room-start').onclick=()=>{activate();session.matchCommand('start');};
  const rematch=$('room-rematch');
  let rematchPointer=null;
  rematch.addEventListener('pointerdown',event=>{
    if(event.button===0)rematchPointer=event.pointerId;
  });
  rematch.addEventListener('pointercancel',()=>{rematchPointer=null;});
  rematch.onclick=event=>{
    // A held gameplay touch can end after the result panel has appeared.
    // A pointer activation must have begun on this button.
    const pressed=rematchPointer!==null&&(!('pointerId' in event)||event.pointerId===rematchPointer);
    rematchPointer=null;
    if((event.detail!==0||event.pointerType)&&!pressed)return;
    if(session?.room?.state.phase!=='results')return;
    activate();
    session.matchCommand('rematch');
  };
  $('room-primary').onchange=()=>session.matchCommand('loadout',{primary:$('room-primary').value});
  $('room-friendly-fire').onchange=()=>session.matchCommand('friendlyFire',{friendlyFire:$('room-friendly-fire').value==='on'});
  $('room-bot-difficulty').replaceChildren(...Object.values(DIFFICULTIES).map(({id,name})=>new Option(name,id)));
  $('room-bot-difficulty').onchange=()=>session.setBotDifficulty($('room-bot-difficulty').value);
  $('room-team').onchange=()=>session.matchCommand('team',{team:$('room-team').value});
  $('room-mode').onchange=()=>session.matchCommand('settings',{mode:$('room-mode').value});
  $('room-resume').onclick=()=>{root.hidden=true;resume();};
  for(const [id,field,choices] of matchFields){
    const select=$(id);
    select.replaceChildren(...choices.map(value=>new Option(String(value),String(value))));
    select.onchange=()=>{
      const value=Number(select.value);
      select.value=String(session.room.state[field]);
      session.matchCommand('settings',{[field]:value});
    };
  }
  for(const [name,field] of residentFields){
    const select=$('room-'+name);
    select.onchange=()=>{
      const value=select.value==='on';
      select.value=session.room.state[field]?'on':'off';
      session.matchCommand('residents',{[name]:value});
    };
  }
  $('room-share').onclick=async()=>{
    const current=session;if(!current?.room)return;
    shareHelp.hidden=false;
    const link=current.familyAlias?new URL(FAMILY_ROOM_PATH,location.origin):new URL(location.pathname,location.origin);
    if(!current.familyAlias){
      link.searchParams.set('network',new URLSearchParams(location.search).get('network')||'internet');
      link.searchParams.set('room',current.room.roomId);
    }
    try{if(navigator.share){await navigator.share({title:en.gameTitle,url:link.href});return;}
      await navigator.clipboard.writeText(link.href);if(session===current&&!current.closed)current.notice=en.linkCopied;
    }catch{if(session!==current||current.closed)return;$('room-link').hidden=false;$('room-link').value=link.href;$('room-link').focus();$('room-link').select();current.notice=en.copySelection;}
  };
  return {hide(){moderation.update(null);invitation.update('');root.hidden=true;session=null;rematchPointer=null;key='';$('room-link').hidden=true;shareHelp.hidden=true;},update(s){
    if(!s?.room)return;moderation.update(s);session=s;const state=s.room.state,self=state.actors.get(s.localPlayerId),waiting=state.phase==='waiting',result=state.phase==='results';
    if(!result)rematchPointer=null;
    root.hidden=state.phase==='active'||state.phase==='countdown';if(root.hidden){invitation.update('');return;}
    $('room-title').textContent=result?(state.winner==='draw'?en.draw:en.winner(labels[state.winner])):en.lobby;
    const classic=state.mode==='classic';
    $('room-rules').textContent=classic?en.classicRules:en.tdmRules;
    const map=networkMap(state.mapId);
    if(!map)return;
    const loading=s.worldRevision!==state.worldRevision||!self?.ready;
    const host=state.ownerId===s.room.sessionId,canEdit=waiting&&host&&!loading&&s.connectionState==='connected';
    invitation.update(privateAccess&&canEdit&&moderation.allowsPrivateInvites()?s.room.roomId:'');
    if($('room-map-preview').dataset.map!==map.id){
      $('room-map-preview').dataset.map=map.id;
      $('room-map-preview').src='../'+map.preview;
      $('room-map-preview').alt=en.preview(map.name);
      $('room-map-name').textContent=map.name;
      $('room-map-modes').textContent=map.modes.map(id=>modeLabels[id]).join(' · ');
      $('room-mode').replaceChildren(...map.modes.map(id=>new Option(modeLabels[id],id)));
    }
    $('room-map').value=map.id;$('room-map-label').hidden=!canEdit;
    $('room-mode').parentElement.hidden=!canEdit||map.modes.length<2;
    $('room-map').disabled=$('room-mode').disabled=!canEdit;
    root.querySelector('.room-eyebrow').textContent=s.familyAlias?en.familyRoom:en.privateRoom;
    $('room-identity').textContent=s.familyAlias||en.roomIdentity(s.room.roomId,state.matchId);
    shareHelp.textContent=s.familyAlias?en.familyShareHelp:normalShareHelp;
    if($('room-mode').value!==state.mode)$('room-mode').value=state.mode;
    $('room-tdm-minutes').parentElement.hidden=classic;
    $('room-tdm-kills').parentElement.hidden=classic;
    $('room-classic-wins').parentElement.hidden=!classic;
    for(const [id,field] of matchFields){
      const select=$(id),confirmed=String(state[field]);
      if(select.value!==confirmed)select.value=confirmed;
      select.disabled=!canEdit;
    }
    $('room-friendly-fire-label').hidden=!canEdit;
    $('room-friendly-fire').disabled=!canEdit;
    $('room-friendly-fire').value=state.friendlyFire?'on':'off';
    $('room-friendly-fire-status').hidden=canEdit;
    $('room-friendly-fire-status').textContent=en.friendlyFire+' · '+(state.friendlyFire?en.on:en.off);
    const canSetDifficulty=canEdit;
    $('room-bot-difficulty-label').hidden=!canSetDifficulty;
    $('room-bot-difficulty').value=state.botDifficulty;
    $('room-bot-difficulty-status').hidden=canSetDifficulty;
    $('room-bot-difficulty-status').textContent=en.botDifficulty+' · '+DIFFICULTIES[state.botDifficulty].name;
    $('room-residents').hidden=!map.residents||!canEdit;
    $('room-residents-status').hidden=!map.residents||canEdit;
    for(const [name,field] of residentFields){
      const select=$('room-'+name);
      const confirmed=state[field]?'on':'off';
      if(select.value!==confirmed)select.value=confirmed;
      select.disabled=!canEdit||!map.residents;
    }
    $('room-residents-status').textContent=`Zombies ${state.zombiesEnabled?en.on:en.off} · ${en.danceman} ${state.dancemanEnabled?en.on:en.off}`;
    $('room-equipment-label').hidden=!waiting||state.mode==='classic';
    if(self?.ready&&waiting){
      if($('room-primary').dataset.team!==self.team){
        $('room-primary').dataset.team=self.team;
        $('room-primary').replaceChildren(...onlinePrimaries(self.team).map(id=>new Option(WEAPONS[id].name,id)));
      }
      $('room-primary').value=self.loadout;
      $('room-kit').textContent=en.secondary(WEAPONS[self.pistol].name);
    }
    $('room-team-label').hidden=!waiting;$('room-team').value=self?.team||'analysts';
    $('room-ready').hidden=!waiting;$('room-ready').textContent=self?.playerReady?en.notReady:en.ready;
    const connected=[...state.actors.values()].filter(a=>a.connected);
    const canStart=connected.every(a=>a.ready&&a.playerReady)&&['analysts','counterAnalysts'].every(t=>connected.some(a=>a.team===t));
    $('room-start').hidden=!waiting||!host;$('room-start').disabled=!canEdit||!canStart;
    $('room-ready').disabled=loading||s.connectionState!=='connected';$('room-rematch').hidden=!result;$('room-resume').hidden=true;
    $('room-result-summary').hidden=!result;
    if(result){
      const reasons={rounds:en.roundsWon(state.scoreTarget),score:en.scoreLimit,forfeit:en.forfeit,time:en.timeLimit};
      $('room-result-summary').textContent=`${state.analysts} – ${state.counterAnalysts} · ${reasons[state.reason]||''}`;
    }
    $('room-help').textContent=result?en.rematchHelp:waiting?en.readyHelp:en.startHelp;
    $('room-notice').textContent=loading?en.loadingMap(map.name):s.notice|| (s.connectionState==='reconnecting'?en.reconnectingHelp:'');
    let rows=[...state.actors.values()];if(result)try{rows=JSON.parse(state.results).players;}catch{}
    const next=JSON.stringify([state.ownerId,rows.map(a=>[a.id,a.name,a.team,a.ready,a.playerReady,a.connected,a.kills,a.deaths])]);
    if(next===key)return;key=next;$('room-roster').replaceChildren();
    for(const a of rows){const tr=document.createElement('tr');for(const value of [a.name+(a.id===s.localPlayerId?en.you:'')+(a.sessionId===state.ownerId?en.host:''),labels[a.team],result?en.result:!a.connected?en.reconnecting:!a.ready?en.loading:a.playerReady?en.ready:en.waiting,a.kills||0,a.deaths||0]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}$('room-roster').append(tr);}
  }};
}
