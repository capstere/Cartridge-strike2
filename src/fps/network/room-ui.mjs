import {onlinePrimaries} from '../action-rules.mjs';
import {DIFFICULTIES,WEAPONS} from '../config.mjs';
const labels={analysts:'Analysts',counterAnalysts:'Counter Analysts',draw:'Oavgjort'};
export function roomUi({leave,resume,activate}){
  const style=document.createElement('style');style.textContent=`
  #online-room{position:fixed;inset:0;z-index:75;background:#101919ed;overflow:auto;padding:max(16px,env(safe-area-inset-top)) max(16px,env(safe-area-inset-right)) max(16px,env(safe-area-inset-bottom));color:#edf2e8;font:16px system-ui}
  #online-room[hidden]{display:none}#online-room .room-card{max-width:850px;margin:auto;padding:20px;border:1px solid #52716d;background:#182625}
  #online-room h2{font-size:clamp(24px,5vw,38px);margin:8px 0}#online-room .room-actions{display:flex;gap:10px;flex-wrap:wrap;margin:16px 0}
  #online-room button,#online-room select,#online-room input{font:inherit;padding:12px;min-height:44px;color:inherit;background:#263c38;border:1px solid #738780;border-radius:3px}
  #online-room .room-residents select{margin:.3rem .6rem .3rem 0}#online-room button.primary{background:#efbf64;color:#14201d;font-weight:700}#online-room button:disabled{opacity:.45}
  #online-room table{width:100%;border-collapse:collapse}#online-room td,#online-room th{text-align:left;padding:9px 5px;border-bottom:1px solid #39504b;font-size:14px}
  #online-room .room-roster{overflow-x:auto}#online-room input{width:100%;box-sizing:border-box}#online-room .muted{color:#b2c4bc}
  #online-room .notice{color:#ffce8c;min-height:1.3em}#online-room .room-eyebrow{letter-spacing:.15em;color:#efbf64;font-size:12px}
  `;document.head.append(style);
  const root=document.createElement('section');root.id='online-room';root.hidden=true;
  root.innerHTML=`<div class="room-card"><div class="room-eyebrow">FLOOR 5 · PRIVAT RUM</div><h2 id="room-title">Väntrum</h2><p id="room-rules"></p><p id="room-identity" class="muted"></p><p id="room-residents-status"></p><label id="room-friendly-fire-label" hidden>Friendly fire <select id="room-friendly-fire"><option value="off">Av</option><option value="on">På</option></select></label><p id="room-friendly-fire-status"></p><label id="room-bot-difficulty-label" hidden>Botsvårighet <select id="room-bot-difficulty"></select></label><p id="room-bot-difficulty-status"></p><div class="room-residents" id="room-residents" hidden><label>Zombies <select id="room-zombies"><option value="off">Av</option><option value="on">På</option></select></label><label>Dansmannen <select id="room-danceman"><option value="off">Av</option><option value="on">På</option></select></label></div><div class="room-actions"><button id="room-share">Dela rumslänk</button><button id="room-leave">Lämna rummet</button></div><input id="room-link" readonly aria-label="Rumslänk" hidden><p class="muted">Vännen behöver serverns inbjudningskod och din separata privata rumskod. Koder ingår aldrig i länken.</p><div class="room-roster"><table><thead><tr><th>Spelare</th><th>Lag</th><th>Status</th><th>K</th><th>D</th></tr></thead><tbody id="room-roster"></tbody></table></div><div class="room-actions"><label id="room-equipment-label">Utrustning <select id="room-primary"></select><small id="room-kit"></small></label><label id="room-team-label">Ditt lag <select id="room-team"><option value="analysts">Analysts</option><option value="counterAnalysts">Counter Analysts</option></select></label><button id="room-ready" class="primary">Redo</button><button id="room-start" class="primary">Starta match</button><button id="room-rematch" class="primary">Spela igen</button><button id="room-resume" class="primary">Fortsätt</button></div><p id="room-help"></p><p id="room-notice" class="notice" role="status"></p></div>`;
  document.body.append(root);const $=id=>root.querySelector('#'+id);let session,key='';
  $('room-leave').onclick=()=>{root.hidden=true;session=null;leave();};
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
  $('room-resume').onclick=()=>{root.hidden=true;resume();};
  const setResidents=()=>session.matchCommand('residents',{zombies:$('room-zombies').value==='on',danceman:$('room-danceman').value==='on'});
  $('room-zombies').onchange=$('room-danceman').onchange=setResidents;
  $('room-share').onclick=async()=>{
    const current=session;if(!current?.room)return;
    const link=new URL(location.href);link.search='';link.searchParams.set('network',new URL(location.href).searchParams.get('network')||'internet');link.searchParams.set('room',current.room.roomId);link.hash='';
    try{if(navigator.share){await navigator.share({title:'Cartridge-Strike 2',url:link.href});return;}
      await navigator.clipboard.writeText(link.href);if(session===current&&!current.closed)current.notice='Rumslänken är kopierad. Dela koderna separat.';
    }catch{if(session!==current||current.closed)return;$('room-link').hidden=false;$('room-link').value=link.href;$('room-link').focus();$('room-link').select();current.notice='Kopiera den markerade rumslänken.';}
  };
  return {hide(){root.hidden=true;session=null;rematchPointer=null;key='';},update(s){
    if(!s?.room)return;session=s;const state=s.room.state,self=state.actors.get(s.localPlayerId),waiting=state.phase==='waiting',result=state.phase==='results';
    if(!result)rematchPointer=null;
    root.hidden=state.phase==='active';if(root.hidden)return;
    $('room-title').textContent=result?(state.winner==='draw'?'Oavgjort':labels[state.winner]+' vinner'):state.phase==='countdown'?'Start om '+Math.ceil(state.remainingSeconds)+'…':'Väntrum';
    $('room-rules').textContent=state.mode==='classic'?'Classic · först till '+state.scoreTarget+' rundor. Counter Analysts planterar eller räddar gisslan. Analysts försvarar och desarmerar. Båda lagen kan vinna på eliminering.':`Team Deathmatch · ${state.durationSeconds/60} minuter · först till ${state.scoreTarget} fiendekills · högst 5 per lag`;
    $('room-identity').textContent='Rum '+s.room.roomId+' · Match '+state.matchId;
    $('room-friendly-fire-label').hidden=!waiting||state.ownerId!==s.room.sessionId;
    $('room-friendly-fire').value=state.friendlyFire?'on':'off';
    $('room-friendly-fire-status').textContent='Friendly fire: '+(state.friendlyFire?'På':'Av');
    const canSetDifficulty=waiting&&state.ownerId===s.room.sessionId&&s.connectionState==='connected';
    $('room-bot-difficulty-label').hidden=!canSetDifficulty;
    $('room-bot-difficulty').value=state.botDifficulty;
    $('room-bot-difficulty-status').hidden=canSetDifficulty;
    $('room-bot-difficulty-status').textContent='Botsvårighet · '+DIFFICULTIES[state.botDifficulty].name;
    $('room-residents').hidden=!waiting||state.ownerId!==s.room.sessionId;
    for(const [name,enabled] of [['zombies',state.zombiesEnabled],['danceman',state.dancemanEnabled]]){
      const select=$('room-'+name);
      if(document.activeElement!==select)select.value=enabled?'on':'off';
    }
    $('room-residents-status').textContent='Zombies '+(state.zombiesEnabled?'på':'av')+' · Dansmannen '+(state.dancemanEnabled?'på':'av');
    $('room-equipment-label').hidden=!waiting||state.mode==='classic';
    if(self?.ready&&waiting){
      if($('room-primary').dataset.team!==self.team){
        $('room-primary').dataset.team=self.team;
        $('room-primary').replaceChildren(...onlinePrimaries(self.team).map(id=>new Option(WEAPONS[id].name,id)));
      }
      $('room-primary').value=self.loadout;
      $('room-kit').textContent=' + '+WEAPONS[self.pistol].name+' · kniv · 1 HE';
    }
    $('room-team-label').hidden=!waiting;$('room-team').value=self?.team||'analysts';
    $('room-ready').hidden=!waiting;$('room-ready').textContent=self?.playerReady?'Inte redo':'Redo';
    const connected=[...state.actors.values()].filter(a=>a.connected);
    const canStart=connected.every(a=>a.ready&&a.playerReady)&&['analysts','counterAnalysts'].every(t=>connected.some(a=>a.team===t));
    $('room-start').hidden=!waiting||state.ownerId!==s.room.sessionId;$('room-start').disabled=!canStart;
    $('room-ready').disabled=s.connectionState!=='connected';$('room-rematch').hidden=!result;$('room-resume').hidden=true;
    $('room-help').textContent=result?`${state.analysts} – ${state.counterAnalysts} · ${state.reason==='rounds'?'Fem vunna rundor':state.reason==='score'?'Poänggränsen nådd':state.reason==='forfeit'?'Ett lag lämnade matchen':'Tiden är slut'}. Spela igen återgår till samma väntrum.`:waiting?'Välj lag och tryck Redo. Rumsägaren startar när båda lagen är redo.':'Matchen börjar snart. Därefter: Fortsätt för kontroller och ljud.';
    $('room-notice').textContent=s.notice|| (s.connectionState==='reconnecting'?'Återansluter… din plats reserveras i 15 sekunder.':'');
    let rows=[...state.actors.values()];if(result)try{rows=JSON.parse(state.results).players;}catch{}
    const next=JSON.stringify([state.ownerId,rows.map(a=>[a.id,a.name,a.team,a.ready,a.playerReady,a.connected,a.kills,a.deaths])]);
    if(next===key)return;key=next;$('room-roster').replaceChildren();
    for(const a of rows){const tr=document.createElement('tr');for(const value of [a.name+(a.id===s.localPlayerId?' · du':'')+(a.sessionId===state.ownerId?' · värd':''),labels[a.team],result?'Slutresultat':!a.connected?'Återansluter':!a.ready?'Laddar':a.playerReady?'Redo':'Väntar',a.kills||0,a.deaths||0]){const td=document.createElement('td');td.textContent=String(value);tr.append(td);}$('room-roster').append(tr);}
  }};
}
