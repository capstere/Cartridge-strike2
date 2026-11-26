import {NETWORK_MAPS,DEFAULT_MAP_ID,networkMap} from '../../../shared/multiplayer/maps.mjs';
import {connectionMessage} from './connection.mjs';
import {FAMILY_ROOM_ALIAS,FAMILY_ROOM_PATH,isFamilyRoomLink} from '../../../shared/multiplayer/family-room.mjs';
export function networkMenu(join,activate=()=>{},internet=false,cancel=()=>{}){
  const menu=document.getElementById('menu');
  const query=new URLSearchParams(location.search),family=internet&&isFamilyRoomLink(location.search);
  menu.classList.add('network-menu');document.documentElement.classList.add('network-session-ui');
  document.querySelector('#pause .eyebrow').textContent='MATCHEN FORTSÄTTER';document.querySelector('#pause h2').textContent='MENY';
  document.querySelector('#scoreboard .small').textContent='Håll Tab · Upp till tio deltagare';
  document.querySelector('.key-hints').textContent='WASD rörelse · höger musknapp sikte · 1–5 byt utrustning · B vapenval/köp · E uppdrag · M karta · Z radio · SHIFT smyg · CTRL huka · SPACE hopp · R ladda om · ESC meny';
  for(const el of menu.querySelectorAll('.lb-left > .lb-block,.lb-launch,#character-picker,.mission-strip'))el.hidden=true;
  menu.querySelector('.eyebrow').textContent=internet?'INTERNET MULTIPLAYER · 5v5':'LAN MULTIPLAYER · 5v5 · 10 PLAYERS';
  menu.querySelector('.lead').textContent='Välj karta när du skapar rummet eller i väntrummet. Värden startar när lagen är redo.';
  const brief=menu.querySelectorAll('.lb-brief dd');brief[0].textContent='Floor 5 Laboratory';brief[1].textContent='5 mot 5 · privat rum';brief[2].textContent='Team Deathmatch eller Classic';
  menu.querySelector('.local-network-link').hidden=true;
  const equipment=document.querySelector('[data-mobile-action="buy"]');
  equipment.textContent='UTR.';equipment.setAttribute('aria-label','Välj utrustning');
  const form=document.createElement('form');form.className='network-form';
  form.method='post';
  if(family){
    menu.classList.add('network-family-menu');
    menu.querySelector('.eyebrow').textContent=FAMILY_ROOM_ALIAS;
    menu.querySelector('.lead').textContent='Ange ditt namn och lösenordet för att gå till väntrummet.';
    form.innerHTML='<label>Namn<input id="network-name" name="name" maxlength="24" autocomplete="nickname" required></label><label>Familjerummets lösenord<input id="network-code" name="code" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="64" autocomplete="current-password" required></label><label class="network-show-code"><input type="checkbox" id="network-show-code">Visa lösenord</label><div><button type="submit" data-create="false">Anslut till familjerummet</button></div><p id="network-status" role="status"></p><a href="/">Till vanliga multiplayer-rum</a>';
  }else{
    form.innerHTML='<label>Namn<input id="network-name" maxlength="24" autocomplete="nickname" value="Player" required></label><label>Lag<select id="network-team"><option value="auto">Automatisk lagfördelning</option><option value="analysts">Analysts</option><option value="counterAnalysts">Counter Analysts</option></select></label><label>Serveradress<input id="network-endpoint" type="url" readonly required></label><label>Privat kod<input id="network-code" type="password" autocapitalize="off" spellcheck="false" minlength="6" maxlength="64" autocomplete="off" required></label><label>Rums-ID (anslut)<input id="network-room" autocapitalize="off" spellcheck="false" maxlength="32" autocomplete="off"></label><label>Karta för nytt rum<select id="network-map"></select></label><label>Spelläge för nytt rum<select id="network-mode"><option value="tdm">Team Deathmatch</option><option value="classic">Classic</option></select></label><label><input type="checkbox" id="network-fill-bots" checked>Fyll lediga platser med botar</label><div><button type="submit" data-create="true">Skapa rum</button><button type="submit" data-create="false">Anslut</button></div><p id="network-status" role="status">Öppna denna serveradress på spelarnas enheter. Skapa rum och dela rums-ID och privat kod. Efter anslutning: tryck Fortsätt för ljud och kontroller.</p><a href="./">Till singleplayer</a>';
  }
  const $=id=>form.querySelector('#'+id);
  const code=$('network-code'),show=$('network-show-code');
  if(family){
    show.onchange=()=>{code.type=show.checked?'text':'password';};
  }else{
    $('network-map').replaceChildren(...NETWORK_MAPS.map(map=>new Option(map.name,map.id)));
    $('network-map').value=DEFAULT_MAP_ID;
    const selectMap=()=>{
      const map=networkMap($('network-map').value),current=$('network-mode').value;
      const labels={tdm:'Team Deathmatch',classic:'Classic'};
      $('network-mode').replaceChildren(...map.modes.map(id=>new Option(labels[id],id)));
      $('network-mode').value=map.modes.includes(current)?current:map.modes[0];
      brief[0].textContent=map.name;brief[2].textContent=map.modes.map(id=>labels[id]).join(' eller ');
    };
    $('network-map').onchange=selectMap;selectMap();
    $('network-endpoint').value=location.origin;
    const sharedRoom=query.get('room');
    if(sharedRoom&&/^[A-Za-z0-9_-]{1,32}$/.test(sharedRoom))$('network-room').value=sharedRoom;
    if(internet)$('network-status').textContent='Båda spelarna öppnar samma HTTPS-adress med serverns inbjudningskod. Skapa ett rum med en egen privat kod. Dela rums-ID och privat kod med din vän.';
  }
  const cancelJoin=document.createElement('button');
  cancelJoin.type='button';cancelJoin.hidden=true;cancelJoin.textContent='Avbryt';
  form.querySelector('button[type=submit]').parentElement.append(cancelJoin);
  cancelJoin.onclick=()=>{cancelJoin.disabled=true;cancel();};
  form.onsubmit=async e=>{
    e.preventDefault();const create=e.submitter?.dataset.create==='true';
    const roomId=$('network-room')?.value.trim();
    if(!family&&!create&&!roomId){status('Ange exakt rums-ID för att ansluta.');return;}
    activate();
    for(const b of form.querySelectorAll('button'))b.disabled=true;
    cancelJoin.hidden=false;cancelJoin.disabled=false;
    status('Ansluter till väntrummet…');
    try{
      const common={endpoint:location.origin,name:$('network-name').value,code:family?code.value.trim():code.value};
      if(family){
        await join({...common,family:FAMILY_ROOM_ALIAS});
        code.value='';show.checked=false;code.type='password';status('');
      }else{
        const session=await join({...common,create,roomId,mapId:$('network-map').value,mode:$('network-mode').value,fillBots:$('network-fill-bots').checked,team:$('network-team').value});
        $('network-room').value=session.room.roomId;status('Rums-ID: '+session.room.roomId);
      }
    }catch(e){status(connectionMessage(e));}
    finally{cancelJoin.hidden=true;for(const b of form.querySelectorAll('button'))b.disabled=false;}
  };
  menu.querySelector('.lb-left').append(form);
  const login=document.createElement('a');login.textContent='Logga in igen';login.href=family?FAMILY_ROOM_PATH:location.href;login.hidden=true;form.append(login);
  const status=message=>{$('network-status').textContent=message;login.hidden=!/inbjudan|inbjudningskod|401/.test(message);};
  return {status};
}
