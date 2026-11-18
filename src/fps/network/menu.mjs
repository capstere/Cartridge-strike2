import {connectionMessage} from './connection.mjs';
export function networkMenu(join,activate=()=>{},internet=false){
  const menu=document.getElementById('menu');
  menu.classList.add('network-menu');document.documentElement.classList.add('network-session-ui');
  document.querySelector('#pause .eyebrow').textContent='MATCHEN FORTSÄTTER';document.querySelector('#pause h2').textContent='MENY';
  document.querySelector('#scoreboard .small').textContent='Håll Tab · Upp till tio mänskliga spelare';
  document.querySelector('.key-hints').textContent='WASD rörelse · mus sikte · SHIFT smyg · CTRL huka · SPACE hopp · R ladda om · ESC meny';
  for(const el of menu.querySelectorAll('.lb-left > .lb-block,.lb-launch,#character-picker,.mission-strip'))el.hidden=true;
  menu.querySelector('.eyebrow').textContent=internet?'INTERNET MULTIPLAYER · 5v5':'LAN MULTIPLAYER · 5v5 · 10 PLAYERS';
  menu.querySelector('.lead').textContent='Privat rum · Pulse SMG · automatisk respawn. Dörrar öppnas när du närmar dig. Glas är fast. Matchen fortsätter i menyer.';
  const brief=menu.querySelectorAll('.lb-brief dd');brief[0].textContent='Floor 5 Laboratory';brief[1].textContent='5 mot 5 · privat rum';brief[2].textContent='Pulse SMG · automatisk respawn · inga uppdrag';
  menu.querySelector('.local-network-link').hidden=true;
  const form=document.createElement('form');form.className='network-form';
  form.innerHTML='<label>Namn<input id="network-name" maxlength="24" autocomplete="nickname" value="Player" required></label><label>Lag<select id="network-team"><option value="auto">Automatisk lagfördelning</option><option value="analysts">Analysts</option><option value="counterAnalysts">Counter Analysts</option></select></label><label>Serveradress<input id="network-endpoint" type="url" readonly required></label><label>Privat kod<input id="network-code" type="password" autocapitalize="off" spellcheck="false" minlength="6" maxlength="64" autocomplete="off" required></label><label>Rums-ID (anslut)<input id="network-room" autocapitalize="off" spellcheck="false" maxlength="32" autocomplete="off"></label><div><button type="submit" data-create="true">Skapa rum</button><button type="submit" data-create="false">Anslut</button></div><p id="network-status" role="status">Öppna denna serveradress på spelarnas enheter. Skapa rum och dela rums-ID och privat kod. Efter anslutning: tryck Fortsätt för ljud och kontroller.</p><a href="./">Till singleplayer</a>';
  const $=id=>form.querySelector('#'+id);
  $('network-endpoint').value=location.origin;
  if(internet){
    $('network-status').textContent='Båda spelarna öppnar samma HTTPS-adress med serverns inbjudningskod. Skapa ett rum med en egen privat kod. Dela rums-ID och privat kod med din vän.';
  }
  form.onsubmit=async e=>{
    e.preventDefault();const create=e.submitter?.dataset.create==='true';
    if(!create&&!$('network-room').value.trim()){$('network-status').textContent='Ange exakt rums-ID för att ansluta.';return;}
    activate();
    for(const b of form.querySelectorAll('button'))b.disabled=true;
    $('network-status').textContent='Ansluter och väntar på säker spawn…';
    try{
      const session=await join({create,endpoint:$('network-endpoint').value,roomId:$('network-room').value.trim(),code:$('network-code').value,name:$('network-name').value,team:$('network-team').value});
      $('network-room').value=session.room.roomId;$('network-status').textContent='Rums-ID: '+session.room.roomId;
    }catch(e){$('network-status').textContent=connectionMessage(e);}
    finally{for(const b of form.querySelectorAll('button'))b.disabled=false;}
  };
  menu.querySelector('.lb-left').append(form);
  return {status:message=>{$('network-status').textContent=message;}};
}
