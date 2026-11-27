import {accessText as en} from '../../../shared/multiplayer/access-english.mjs';
import {NETWORK_MAPS,DEFAULT_MAP_ID,networkMap} from '../../../shared/multiplayer/maps.mjs';
import {connectionFailure} from './connection.mjs';
import {FAMILY_ROOM_ALIAS,FAMILY_ROOM_PATH,isFamilyRoomLink} from '../../../shared/multiplayer/family-room.mjs';
export function networkMenu(join,activate=()=>{},internet=false,cancel=()=>{}){
  const menu=document.getElementById('menu');
  const query=new URLSearchParams(location.search),family=internet&&isFamilyRoomLink(location.search);
  menu.classList.add('network-menu');document.documentElement.classList.add('network-session-ui');
  document.querySelector('#pause .eyebrow').textContent=en.matchContinues;document.querySelector('#pause h2').textContent=en.menu;
  document.querySelector('#scoreboard .small').textContent=en.scoreboardHint;
  document.querySelector('.key-hints').textContent=en.bindings;
  for(const el of menu.querySelectorAll('.lb-left > .lb-block,.lb-launch,#character-picker,.mission-strip'))el.hidden=true;
  menu.querySelector('.eyebrow').textContent=internet?en.internetTitle:en.lanTitle;
  menu.querySelector('.lead').textContent=en.createHint;
  const headings=menu.querySelectorAll('.lb-brief dt');
  headings[0].textContent=en.map;
  headings[2].textContent=en.availableModes;
  const brief=menu.querySelectorAll('.lb-brief dd');
  brief[0].textContent=networkMap(DEFAULT_MAP_ID).name;
  brief[1].textContent=en.privateTeams;
  brief[2].textContent=en.bothModes;
  menu.querySelector('.local-network-link').hidden=true;
  const equipment=document.querySelector('[data-mobile-action="buy"]');
  equipment.textContent=en.loadoutShort;equipment.setAttribute('aria-label',en.chooseLoadout);
  const form=document.createElement('form');form.className='network-form';
  form.method='post';
  if(family){
    menu.classList.add('network-family-menu');
    menu.querySelector('.eyebrow').textContent=FAMILY_ROOM_ALIAS;
    menu.querySelector('.lead').textContent=en.familyIntro;
    form.innerHTML=`<label>${en.name}<input id="network-name" name="name" maxlength="24" autocomplete="nickname" required></label><label>${en.familyPassword}<input id="network-code" name="code" type="password" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="64" autocomplete="current-password" required></label><label class="network-show-code"><input type="checkbox" id="network-show-code">${en.showPassword}</label><div><button type="submit" data-create="false">${en.joinFamily}</button></div><p id="network-status" role="status"></p><a href="/">${en.otherRooms}</a>`;
  }else{
    form.innerHTML=`<label>${en.name}<input id="network-name" maxlength="24" autocomplete="nickname" value="Player" required></label><label>${en.team}<select id="network-team"><option value="auto">${en.automaticTeam}</option><option value="analysts">Analysts</option><option value="counterAnalysts">Counter Analysts</option></select></label><label>${en.serverAddress}<input id="network-endpoint" type="url" readonly required></label><label>${en.privateCode}<input id="network-code" type="password" autocapitalize="off" spellcheck="false" minlength="6" maxlength="64" autocomplete="off" required></label><label>${en.roomIdHint}<input id="network-room" autocapitalize="off" spellcheck="false" maxlength="32" autocomplete="off"></label><label>${en.createMap}<select id="network-map"></select></label><label>${en.createMode}<select id="network-mode"><option value="tdm">Team Deathmatch</option><option value="classic">Classic</option></select></label><label><input type="checkbox" id="network-fill-bots" checked>${en.fillBots}</label><div><button type="submit" data-create="true">${en.createRoom}</button><button type="submit" data-create="false">${en.join}</button></div><p id="network-status" role="status">${en.shareLan}</p><a href="./">${en.backSolo}</a>`;
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
      brief[0].textContent=map.name;brief[2].textContent=map.modes.map(id=>labels[id]).join(en.otherMode);
    };
    $('network-map').onchange=selectMap;selectMap();
    $('network-endpoint').value=location.origin;
    const sharedRoom=query.get('room');
    if(sharedRoom&&/^[A-Za-z0-9_-]{1,32}$/.test(sharedRoom))$('network-room').value=sharedRoom;
    if(internet)$('network-status').textContent=en.shareInternet;
  }
  const cancelJoin=document.createElement('button');
  cancelJoin.type='button';cancelJoin.hidden=true;cancelJoin.textContent=en.cancel;
  form.querySelector('button[type=submit]').parentElement.append(cancelJoin);
  cancelJoin.onclick=()=>{cancelJoin.disabled=true;cancel();};
  form.onsubmit=async e=>{
    e.preventDefault();const create=e.submitter?.dataset.create==='true';
    const roomId=$('network-room')?.value.trim();
    if(!family&&!create&&!roomId){status(en.requireRoom);return;}
    activate();
    for(const b of form.querySelectorAll('button'))b.disabled=true;
    cancelJoin.hidden=false;cancelJoin.disabled=false;
    status(en.joining);
    try{
      const common={endpoint:location.origin,name:$('network-name').value,code:family?code.value.trim():code.value};
      if(family){
        await join({...common,family:FAMILY_ROOM_ALIAS});
        code.value='';show.checked=false;code.type='password';status('');
      }else{
        const session=await join({...common,create,roomId,mapId:$('network-map').value,mode:$('network-mode').value,fillBots:$('network-fill-bots').checked,team:$('network-team').value});
        $('network-room').value=session.room.roomId;status(en.roomId(session.room.roomId));
      }
    }catch(error){
      const failure=connectionFailure(error);
      status(failure.message, failure);
    }
    finally{cancelJoin.hidden=true;for(const b of form.querySelectorAll('button'))b.disabled=false;}
  };
  menu.querySelector('.lb-left').append(form);
  const login=document.createElement('a');login.textContent=en.signInAgain;login.href=family?FAMILY_ROOM_PATH:location.href;login.hidden=true;form.append(login);
  const status=(message, failure)=>{
    const output=$('network-status');
    output.textContent=message;
    if(failure) output.dataset.errorId=failure.id;
    else delete output.dataset.errorId;
    login.hidden=failure?.recovery!=='signIn';
  };
  return {status};
}
