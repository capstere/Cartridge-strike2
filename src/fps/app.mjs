import {GAME_NAME,COMPLEX_NAME,roomDisplayName,missionRoomName} from './player-names.mjs';
import {setupCharacterMenu} from './character-selection.mjs';
import {loadPrivateCharacter,characterHash} from './private-character-store.mjs';
import {loadCharacterLibrary,installPrivateCharacter,setPrivateCharacterActors} from './character-library.mjs?v=6.1.2';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { RenderBudget } from './render-budget.mjs';
import { MinimapCache } from './minimap-cache.mjs';
import { FocusHud, focusHudSettings } from './focus-hud.mjs';
import {onlinePrimaries} from './action-rules.mjs';
import { GrenadeAssist, grenadeSettingsMarkup } from './grenade-assist.mjs';
import {CombatHUD} from './combat-hud.mjs';
import { createWorld } from './world.mjs?v=5.9.0';
import { Game, TEAMS, WEAPONS, CONFIG, DIFFICULTIES } from './game.mjs';
import { Renderer } from './render.mjs?v=floor5-environment-1';
import { AudioSystem } from './riposte-audio.mjs';
import {RADIO,isEndless} from './action-rules.mjs';
import {GamepadControls} from './gamepad-controls.mjs';
import { MobileControls, isTouchDevice } from './mobile-controls.mjs';
import { PlayerRecoil } from './riposte-recoil.mjs';
import { TacticalControls } from './tactical-controls.mjs';
import {parseProject} from '../../furniture-editor/build/level-project.mjs?v=5.9.0';
import {isFamilyRoomLink} from '../../shared/multiplayer/family-room.mjs';

const $=id=>document.getElementById(id),testMode=new URLSearchParams(location.search).has('test');
const networkTransport=new URLSearchParams(location.search).get('network');
const internetMode=networkTransport==='internet';
const networkMode=internetMode||['local','lan'].includes(networkTransport);
const familyRoomLink=isFamilyRoomLink(location.search);
import {networkMap} from '../../shared/multiplayer/maps.mjs';
import {sha256} from '../../shared/sha256.mjs';
let networkSession=null,networkUi=null,onlineRoomUi=null,networkJoinGeneration=0;
import {connectionMessage} from './network/connection.mjs';
import {roomUi} from './network/room-ui.mjs';
const touchDevice=isTouchDevice();
const renderBudget=new RenderBudget();
const minimapCache=new MinimapCache($('minimap'));
const minimapPanel=$('minimap').closest('.map-panel');
const settings={grenadeGuide:true,grenadeWarning:true,mobileAutoFire:!networkMode,sensitivity:.0022,volume:.55,reducedMotion:false,reducedFlash:true,difficulty:'casual',graphics:'standard',blood:'standard',mode:'classic',firefight:true,combatSounds:true,friendlyFire:true,wanderers:true,radioVoice:true,loadout:'smg'};
let storedSettings={};
try{storedSettings=JSON.parse(localStorage.getItem('cartridge-settings')||'{}')||{};Object.assign(settings,storedSettings);}catch{}
if(typeof settings.mobileAutoFire!=='boolean')settings.mobileAutoFire=!networkMode;
if(touchDevice&&!Object.hasOwn(storedSettings,'graphics'))settings.graphics='low';
settings.mobile=touchDevice;
for(const [key,allowed] of Object.entries({difficulty:['casual','normal','hard'],graphics:['standard','low'],blood:['off','reduced','standard']}))if(!allowed.includes(settings[key]))settings[key]=allowed[key].includes('casual')?'casual':'standard';
let world,game,renderer,audio,team='analysts',yaw=0,pitch=0,modal='menu',keys=new Set(),fire=false,board=false,mapExpanded=false,spectateIndex=0,notificationUntil=0,feed=[],lastRound=0,lastPhase='menu',lastFrame=0,hudAt=0,raf=0;
let radioOpen=false,radioUntil=0;
let teamRadioOpen=false,teamRadioSelection=0,teamRadioChoices=[];
const teamRadioMenu=$('team-radio-menu'),teamRadioButtons=$('team-radio-choices');
const teamRadioCommands=RADIO.filter(phrase=>['together','backup'].includes(phrase.id));
const recoil=new PlayerRecoil();
let autoTargetId=null,autoTargetSince=0,autoFireTarget=null;
const resetAutoAim=()=>{autoTargetId=null;autoTargetSince=0;autoFireTarget=null;};
let tactical=null,grenadeAssist=null,focusHud=null;
let privateCharacterDraft=null,characterMenu=null,characterSelectionFailed=false;
const rehearsalMode=new URLSearchParams(location.search).has('character');
async function preparePrivateCharacter(){
 if(networkMode){setPrivateCharacterActors([]);return;}
 const query=new URLSearchParams(location.search);
 let id=query.get('character');
 if(rehearsalMode)document.getElementById('character-picker').hidden=true;
 else{characterMenu=await setupCharacterMenu({getTeam:()=>team,getSeed:()=>$('seed').value});id=characterMenu.id;if(!id){characterMenu.loaded();return;}}
 try{
 privateCharacterDraft=await loadPrivateCharacter(id);
 const original=await fetch(new URL('../../assets/fps/models/quaternius-operator-male.glb',import.meta.url));
 if(!original.ok||await characterHash(await original.arrayBuffer())!==privateCharacterDraft.sourceHash)throw Error('Den sparade karaktären behöver uppdateras. Välj Originalkaraktär eller en kompatibel spelkopia.');
 await loadCharacterLibrary();
 installPrivateCharacter(await new GLTFLoader().parseAsync(privateCharacterDraft.bytes.slice(0),''));
 if(!rehearsalMode){setPrivateCharacterActors([team+'-0']);characterMenu.loaded(privateCharacterDraft.name);return;}
 const note=document.createElement('p');note.id='private-character-note';note.textContent='Privat provmatch: '+privateCharacterDraft.name+'. Du och lagkamrat A-02 använder din design. Händer och korta ärmar i förstaperson matchar din karaktär. Inget laddas upp.';
 document.querySelector('.intro').append(note);
 const exit=document.createElement('a');exit.id='original-character-match';exit.href='./?avatar=';exit.textContent='Spela med originalkaraktärerna';document.querySelector('.intro').append(exit);

 document.querySelector('[data-team="counterAnalysts"]').disabled=true;
 }catch(e){if(rehearsalMode)throw e;characterSelectionFailed=true;privateCharacterDraft=null;characterMenu.error(e.message);}
}
// Character and weapon caches are shared within a renderer. Finish tearing down
// the previous world before preparing another one on this page.
let presentationQueue=Promise.resolve(),displayMapId=null;
function releaseWorldPresentation(){
 grenadeAssist?.dispose();grenadeAssist=null;
 if(renderer){
  const canvas=$('game'),replacement=canvas.cloneNode(false);
  renderer.renderer.forceContextLoss();renderer.dispose({keepCharacterLibrary:true});renderer=null;
  canvas.replaceWith(replacement);
 }
 renderBudget.invalidate();minimapCache.invalidate();minimapCache.world=null;
 audio.reset();audio.world=null;audio.game=null;
 world=null;displayMapId=null;
}
function loadRoomWorld(contract,mode,signal){
 async function load(){
  signal.throwIfAborted();
  const {prepareNetworkWorld}=await import('../../shared/multiplayer/world.mjs');
  if(displayMapId!==contract.mapId){
   const map=networkMap(contract.mapId);
   const response=await fetch('../'+map.file,{signal,cache:'no-store'});
   if(!response.ok)throw Error('Kunde inte ladda '+map.name+'. Anslut igen för att försöka på nytt.');
   const body=await response.text();
   if(await sha256(body)!==contract.mapHash)throw Error('Map version mismatch');
   signal.throwIfAborted();
   const {collisionContract}=await import('../../shared/multiplayer/collision-contract.mjs');
   const candidate=createWorld({levelProject:parseProject(body),fresh:true});
   if(await sha256(collisionContract(candidate))!==contract.collisionHash)throw Error('Collision version mismatch');
   signal.throwIfAborted();
   prepareNetworkWorld(candidate);
   releaseWorldPresentation();
   try{
    renderer=new Renderer($('game'),candidate,settings);
    await renderer.assetsReady;
    signal.throwIfAborted();
    grenadeAssist=new GrenadeAssist(renderer,settings);
    world=audio.world=candidate;displayMapId=map.id;
   }catch(error){releaseWorldPresentation();throw error;}
  }else{
   prepareNetworkWorld(world);
  }
  if(mode==='classic')await renderer.prepareClassic();
  signal.throwIfAborted();
  return world;
 }
 const pending=presentationQueue.then(load);
 presentationQueue=pending.catch(()=>{});
 return pending;
}
async function selectedLevel(){
 let id=new URLSearchParams(location.search).get('level');if(id==='classic-floor5')return null;
 if(id==='preview'){
  const saved=localStorage.getItem('cartridge-level-preview');if(!saved)throw Error('Ingen privat förhandsvisning finns i den här webbläsaren.');
  return parseProject(saved);
 }
 const listing=await fetch('../levels/manifest.json',{cache:'no-store'});
 if(!listing.ok)throw Error('Banlistan kunde inte laddas. Kontrollera anslutningen och försök igen.');
 const manifest=await listing.json();
 id??=manifest.defaultLevel;
 if(!/^[a-z0-9-]{1,48}$/.test(id||''))throw Error('Ogiltigt nivå-ID.');
 const entry=manifest.levels?.find(row=>row.id===id);
 if(!entry||entry.file!==`levels/${id}.json`)throw Error('Nivån finns inte i det publicerade manifestet.');
 if(entry.multiplayerOnly)throw Error('Den här banan spelas i multiplayer. Öppna ett privat rum och välj kartan i väntrummet.');
 const response=await fetch('../'+entry.file);if(!response.ok)throw Error('Nivåfilen saknas.');
 const body=await response.text();
 return parseProject(body);
}
function nameWorld(){
 for(const side of ['analysts','counterAnalysts']){
  const p=world.anchors[side]?.[0],label=document.querySelector(`[data-team="${side}"] small`);
  if(label)label.textContent='Start i '+roomDisplayName(p&&world.roomAt(p.x,p.z));
 }
 const missions=document.querySelectorAll('.mission-strip span');
 if(missions[0])missions[0].replaceChildren(document.createTextNode(missionRoomName(world)),document.createElement('br'),Object.assign(document.createElement('strong'),{textContent:'Plantera / försvara'}));
 const h=world.anchors.hostages?.[0];
 if(missions[1])missions[1].replaceChildren(document.createTextNode(roomDisplayName(h&&world.roomAt(h.x,h.z))),document.createElement('br'),Object.assign(document.createElement('strong'),{textContent:'Eskortera / bevaka'}));
}
let firePress=null,crouchPress=false;
function recordFirePress(){
 if(!modal && !teamRadioOpen && game?.player?.alive && game.phase==='active'){
   firePress ??= {yaw,pitch,weapon:game.player.weapon,life:game.player.lifeId,epoch:game.player.controlEpoch,round:game.state.round};
 }
}
const gamepad=new GamepadControls();
const mobile=new MobileControls({
  onFirePress:recordFirePress,
  root:$('mobile-controls'),
  onLook(dx,dy){if(modal||teamRadioOpen||!game?.player?.alive)return;const k=settings.sensitivity*2.15*(tactical?.lookScale(true,yaw,pitch)??1);const before=pitch;yaw-=dx*k;pitch=Math.max(-1.49,Math.min(1.49,pitch-dy*k));recoil.counter(pitch-before);},
  onAction(action){
    if(!game||teamRadioOpen)return;
    if(action==='restart'){restartMatch();return;}
    if(action==='pause'){showPause();return;}
    if(action==='buy'){showBuy();return;}
    if(!game.player?.alive)return;
    if(action==='reload')game.reload();
    else if(action==='weapon')tactical.cycleWeapon();
    else if(action==='grenade')game.select('4');
    else if(action==='drop')game.drop();
  }
});
mobile.setAutoFire(settings.mobileAutoFire);
tactical=new TacticalControls({settings,mobile,getGame:()=>game,getModal:()=>modal||teamRadioOpen,
  isInteracting:()=>keys.has('KeyE')||mobile.state.interact,onAimChange:resetAutoAim});
const combatHud=new CombatHUD(settings);
focusHud=new FocusHud({
 settings,mobile,getGame:()=>game,getModal:()=>modal||teamRadioOpen,onMap:toggleMap,onStats:showPause,onInspect:()=>renderer?.requestInspect(game),
 onRadio:networkMode?toggleTeamRadio:null,networkMode
});
function selectTeamRadio(index){
 teamRadioSelection=(index+teamRadioChoices.length)%teamRadioChoices.length;
 const selected=teamRadioButtons.children[teamRadioSelection];
 for(const button of teamRadioButtons.children)button.toggleAttribute('data-current',button===selected);
 selected.scrollIntoView({block:'nearest'});
}
function toggleTeamRadio(){
 if(teamRadioOpen){clearInput();return;}
 if(modal||!networkSession?.canSendTeamComms()){
   if(!modal&&game?.player?.alive)notify('Lagradion öppnar när striden börjar.');
   return;
 }
 if(game.player.action||keys.has('KeyE')||mobile.state.interact)return;
 clearInput();
 teamRadioChoices=[
   ...teamRadioCommands.map(({id,label})=>({kind:id,label})),
   ...Array.from(networkSession.teamAnchors.values(),anchor=>({kind:'ping',anchorId:anchor.id,label:anchor.label}))
 ];
 teamRadioButtons.replaceChildren(...teamRadioChoices.map(({kind,anchorId,label},index)=>{
   const button=document.createElement('button');
   button.type='button';
   button.dataset.teamRadio=kind;
   if(anchorId)button.dataset.anchor=anchorId;
   button.textContent=anchorId?'Ping · '+label:(mobile.enabled?'':index+1+' · ')+label;
   button.onclick=()=>chooseTeamRadio(index);
   return button;
 }));
 teamRadioOpen=true;
 teamRadioMenu.hidden=false;
 selectTeamRadio(0);
}
function chooseTeamRadio(index){
 const choice=teamRadioChoices[index];
 if(!teamRadioOpen||!choice)return;
 if(networkSession?.sendTeamComms(choice.kind,choice.anchorId))clearInput();
 else notify('Vänta före nästa radiosignal.');
}
function teamRadioKey(event){
 if(!networkMode||modal)return false;
 if(event.code==='KeyZ'){
   event.preventDefault();
   if(!event.repeat)toggleTeamRadio();
   return true;
 }
 if(!teamRadioOpen)return false;
 event.preventDefault();
 if(event.code==='Escape'){clearInput();return true;}
 if(event.code==='ArrowDown'||event.code==='ArrowUp')selectTeamRadio(teamRadioSelection+(event.code==='ArrowDown'?1:-1));
 else if(!event.repeat){
   if(event.code==='Enter')chooseTeamRadio(teamRadioSelection);
   else if(event.code==='Digit1'||event.code==='Digit2')chooseTeamRadio(Number(event.code.at(-1))-1);
 }
 return true;
}
function updateTeamRadio(){
 if(teamRadioOpen&&!networkSession?.canSendTeamComms())clearInput();
 const signal=networkSession?.teamSignal;
 if(!signal){setText('radio-caption','');return;}
 const label=signal.anchor?'Ping · '+signal.anchor.label:teamRadioCommands.find(phrase=>phrase.id===signal.kind)?.label;
 const assigned=signal.botAssigned&&signal.senderId===game.player.id?' · En bot fick ordern':'';
 setText('radio-caption',signal.senderName+' · '+label+assigned);
}
$('team-radio-close').onclick=()=>clearInput();
function toggleMap(){setMapExpanded(!mapExpanded);}
function setMapExpanded(expanded){
 if(mapExpanded===expanded)return;
 mapExpanded=expanded;
 document.documentElement.classList.toggle('hud-map-open',expanded);
 $('map-legend').hidden=!networkMode||!expanded;
 $('minimap').width=expanded?448:224;$('minimap').height=expanded?316:158;
 if(game?.player)minimap();
}
const reasonNames={detonation:'Uppdragsbomben detonerade.',defuse:'Bomben har desarmerats.',rescue:'Båda gisslan har nått räddningszonen.',elimination:'Motståndarlaget är utslaget.',timeout:'Tiden tog slut. Analysts höll uppdragen.',draw:'Båda lagen slogs ut samtidigt.'};
const htmlCache=new Map();
const setHtml=(id,value)=>{if(htmlCache.get(id)!==value){$(id).innerHTML=value;htmlCache.set(id,value);}};
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
function updateKillfeed(){const text=feed.map(f=>f.text),key=JSON.stringify(text);if(htmlCache.get('killfeed')===key)return;htmlCache.set('killfeed',key);$('killfeed').replaceChildren(...text.map(textContent=>Object.assign(document.createElement('div'),{textContent})));}
function saveSettings(){focusHud?.applyMode();try{localStorage.setItem('cartridge-settings',JSON.stringify(settings));}catch{}audio?.setVolume(settings.volume);}
function difficultyText(){const active=game?.state.difficulty||settings.difficulty,pending=game?.state.pendingDifficulty;return modal!=='menu'&&game?.phase!=='menu'&&game?.player?`Aktivt: ${DIFFICULTIES[active].name}${pending?` · ${DIFFICULTIES[pending].name} från nästa runda`:''}`:DIFFICULTIES[settings.difficulty].description;}
function settingsPanel(target){const select=(key,values)=>`<select aria-label="${key==='difficulty'?'Svårighetsgrad':key==='graphics'?'Grafik':'Blod'}" data-setting="${key}">${values.map(([value,label])=>`<option value="${value}" ${settings[key]===value?'selected':''}>${label}</option>`).join('')}</select>`;
$(target).innerHTML=`<label class="setting">Svårighetsgrad ${select('difficulty',[['casual','Casual · rekommenderat'],['normal','Normal'],['hard','Hard']])}</label><p class="setting-note" data-difficulty-note>${difficultyText()}</p><label class="setting">Grafik ${select('graphics',[['standard','Standard'],['low','Låg · upplösning och skuggor']])}</label><label class="setting">Blod ${select('blood',[['standard','Mer blod'],['reduced','Reducerat'],['off','Av']])}</label><label class="setting">Muskänslighet <input aria-label="Muskänslighet" data-setting="sensitivity" type="range" min="0.0006" max="0.006" step="0.0001" value="${settings.sensitivity}"></label><label class="setting">Ljudvolym <input aria-label="Ljudvolym" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label><label class="setting">Kontrollområden i Endless <input aria-label="Kontrollområden i Endless" data-setting="firefight" type="checkbox" ${settings.firefight?'checked':''}></label><p class="setting-note">Samlar striden runt ett område som flyttar varje minut. Gäller nästa match. Av = fri Endless.</p><label class="setting">Träff- och killbekräftelse <input data-setting="combatSounds" type="checkbox" ${settings.combatSounds?'checked':''}></label><label class="setting">Friendly fire <input data-setting="friendlyFire" type="checkbox" ${settings.friendlyFire?'checked':''}></label><label class="setting">Kringvandrande fantasidvärgar <input data-setting="wanderers" type="checkbox" ${settings.wanderers?'checked':''}></label><label class="setting">Radiorepliker <input data-setting="radioVoice" type="checkbox" ${settings.radioVoice?'checked':''}></label><label class="setting">Reducerad gånggung <input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}></label><label class="setting">Mjukare flash <input data-setting="reducedFlash" type="checkbox" ${settings.reducedFlash?'checked':''}></label>${mobile.enabled?`<label class="setting">Automatisk eld på mobil <input aria-label="Automatisk eld på mobil" data-setting="mobileAutoFire" type="checkbox" ${settings.mobileAutoFire?'checked':''}></label><p class="setting-note" data-mobile-fire-note>Skjuter när siktet ligger på en synlig fiende. Av = manuell ELD-knapp. Granater och raketer avfyras alltid manuellt.</p>`:''}`;
$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup()+grenadeSettingsMarkup(settings)+focusHudSettings(settings));
if(networkMode){for(const input of $(target).querySelectorAll('[data-setting]'))if(!['graphics','blood','sensitivity','volume','combatSounds','reducedMotion','reducedFlash','hudMode','radioVoice','mobileAutoFire'].includes(input.dataset.setting)){input.disabled=true;const label=input.closest('label');if(label)label.hidden=true;}for(const note of $(target).querySelectorAll('.setting-note'))note.hidden=!note.hasAttribute('data-mobile-fire-note');}
$(target).querySelectorAll('[data-setting]').forEach(input=>input.oninput=()=>{settings[input.dataset.setting]=input.tagName==='SELECT'?input.value:input.type==='checkbox'?input.checked:Number(input.value);if(input.dataset.setting==='difficulty')game?.setDifficulty(settings.difficulty);if(input.dataset.setting==='mobileAutoFire'){mobile.setAutoFire(settings.mobileAutoFire);tactical.syncTrigger();resetAutoAim();}if(game&&!networkMode&&['friendlyFire','wanderers'].includes(input.dataset.setting))game.config[input.dataset.setting]=settings[input.dataset.setting];saveSettings();document.querySelectorAll('[data-difficulty-note]').forEach(n=>n.textContent=difficultyText());});}
settingsPanel('menu-settings');settingsPanel('pause-settings');
function clearInput(){keys.clear();gamepad.clear();crouchPress=false;fire=false;firePress=null;mobile.clear();tactical?.reset();grenadeAssist?.reset();focusHud?.reset();resetAutoAim();radioOpen=false;teamRadioOpen=false;teamRadioMenu.hidden=true;if($('radio-menu'))$('radio-menu').hidden=true;if(game?.player){game.player.fireHeld=false;game.player.interactHeld=false;game.player.action=null;}}
function unlockMouse(){if(document.pointerLockElement)document.exitPointerLock();}
function requestMouse(){if(mobile.enabled)return;try{const result=$('game').requestPointerLock();result?.catch(()=>{showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Muslås kunde inte aktiveras. Öppna spelet i en separat webbläsarflik på datorn.';});}catch{showPause();}}
function notify(text,duration=3){setText('notification',text);notificationUntil=(game?.state.time||0)+duration;}
function syncFullscreenToggle(){const button=$('fullscreen-toggle'),hint=$('fullscreen-hint'),fs=window.__csFlow?.fullscreen;if(!button)return;button.hidden=!fs?.supported;if(fs?.supported)button.textContent=fs.active?'AVSLUTA HELSKÄRM':'AKTIVERA HELSKÄRM';if(hint)hint.hidden=!!fs?.supported;}
function showPause(){if(networkSession?.room?.state.phase!=='active'&&networkSession)return;if(!game||['menu','match'].includes(game.phase)||modal==='menu')return;modal='pause';mobile.show(false);$('pause').querySelector('p:not(.eyebrow)').textContent=networkSession?`Rum ${networkSession.room.roomId} · Friendly fire: ${networkSession.room.state.friendlyFire?'På':'Av'} · Botsvårighet ${DIFFICULTIES[game.state.difficulty].name} · Matchen fortsätter. Du är fortfarande sårbar.`:'Alla rundtimers och botar väntar.';clearInput();game.pause(true);audio.reset();$('pause').hidden=false;$('buy').hidden=true;$('scoreboard').hidden=true;board=false;unlockMouse();settingsPanel('pause-settings');syncFullscreenToggle();}
// LAN fullscreen is an explicit menu action. A simultaneous fullscreen/focus
// transition can interrupt the Resume gesture that enables mouse and audio.
function resume(){if(networkSession&&(networkSession.connectionState==='reconnecting'||networkSession.room?.state.phase!=='active'))return;if(!networkMode)window.__csFlow?.fullscreen?.resume();audio.unlock();modal=null;$('pause').hidden=true;$('buy').hidden=true;clearInput();game.pause(false);yaw=game.player.yaw;pitch=game.player.pitch;mobile.show(true,game.player?.alive);requestMouse();}
function showBuy(){if(!game.player?.alive||(game.phase!=='buy'&&!isEndless(game))){notify('Köp öppnar under nästa köpfas.');return;}modal='buy';mobile.show(false);setText('buy-message','');clearInput();game.pause(true);audio.reset();$('buy').hidden=false;unlockMouse();refreshShop();}
function closeBuy(){if(networkSession){resume();return;}window.__csFlow?.fullscreen?.resume();modal=null;$('buy').hidden=true;clearInput();game.pause(false);audio.unlock();mobile.show(true,game.player?.alive);requestMouse();}
function refreshShop(){
 if(networkSession&&game.state.mode==='classic'){
   const p=game.player;
   $('buy').dataset.team=p.team;
   setText('buy-money',p.money+' ¤');
   setText('buy-note','Köp · '+Math.max(0,Math.ceil(game.state.buyDeadline-game.state.time))+' s · '+[p.inventory.primary?.id,p.inventory.pistol.id,'knife'].filter(Boolean).map(id=>WEAPONS[id].name).join(' · ')+' · '+p.armor+' rustning · '+p.inventory.he+' HE');
   setText('buy-message',game.phase!=='buy'?'Köptiden är slut.':networkSession.notice||'');
   if($('shop').dataset.kit!==p.team){
     $('shop').dataset.kit=p.team;
     $('shop').replaceChildren(...[...onlinePrimaries(p.team),'armor','he'].map(id=>{
       const button=document.createElement('button');button.dataset.item=id;
       button.textContent=WEAPONS[id].name+' · '+WEAPONS[id].cost+' ¤';
       button.onclick=()=>game.buy(id);return button;
     }));
   }
   return;
 }
 delete $('shop').dataset.kit;
 if(networkSession){
   const p=game.player;
   $('buy').dataset.team=p.team;
   setText('buy-money','FRITT VAPENVAL');
   setText('buy-note','Ändringar gäller vid nästa respawn. Du bär '+WEAPONS[p.inventory.primary.id].name+' och '+WEAPONS[p.inventory.pistol.id].name+' · kniv · '+p.inventory.he+' HE.');
   $('shop').replaceChildren(...onlinePrimaries(game.team).map(id=>{
     const button=document.createElement('button');button.dataset.item=id;
     button.textContent=WEAPONS[id].name+(p.loadout===id?' · VALT':'');
     button.onclick=()=>networkSession.matchCommand('loadout',{primary:id});
     return button;
   }));
   return;
 }
 setText('buy-money',isEndless(game)?'FRITT VAPENVAL':`${game.player.money} ¤`);setText('buy-note',isEndless(game)?'Välj gratis utrustning. Samma huvudvapen återkommer vid respawn.':`Köpfas · timern väntar medan menyn är öppen · ${TEAMS[game.team]}`);$('shop').replaceChildren();for(const w of Object.values(WEAPONS).filter(w=>w.cost>0)){const button=document.createElement('button');button.dataset.item=w.id;const detail=w.slot==='grenade'?`Cartridge · max ${w.limit}`:w.slot==='armor'?'100 rustning':`${w.magazine} / ${w.reserve} · ${w.team?TEAMS[w.team]:'Båda lagen'}`;button.innerHTML=`<strong>${w.name}</strong><em>${isEndless(game)?'GRATIS':w.cost+' ¤'}</em><small>${detail}</small>`;button.onclick=()=>{const r=game.buy(w.id);setText('buy-message',r.ok?`${w.name} köpt.`:r.reason);refreshShop();};$('shop').append(button);}}
function start(selected=team,overrides={},autoplay=false){team=rehearsalMode?'analysts':selected;setPrivateCharacterActors(rehearsalMode?['analysts-0','analysts-1']:[team+'-0']);clearInput();audio.reset();renderer.resetTransient();combatHud.reset();recoil.reset();resetAutoAim();game=new Game(world,{team,seed:Number($('seed').value)||42,config:{mobile:settings.mobile,mode:settings.mode,firefight:settings.firefight,friendlyFire:settings.friendlyFire,hostageDamage:true,wanderers:settings.wanderers,loadout:settings.loadout,...overrides},autoplay,difficulty:overrides.difficulty||settings.difficulty});game.start(team);for(const actor of game.actors)renderer.actorModel(actor);modal=null;lastRound=0;lastPhase='buy';spectateIndex=0;feed=[];yaw=game.player.yaw;pitch=game.player.pitch;for(const id of ['menu','pause','buy','match-end','scoreboard'])$(id).hidden=true;$('hud').hidden=false;setText('notification','');mobile.show(true,game.player?.alive);updateHud();return game;}
async function joinNetwork(options){
 if(!networkMode)throw Error('Open the local multiplayer lobby first.');
 const generation=++networkJoinGeneration;
 await networkSession?.dispose();networkSession=null;clearInput();audio.reset();renderer?.resetTransient();combatHud.reset();recoil.reset();
 const {NetworkSession}=await import('./network/session.mjs');
 if(generation!==networkJoinGeneration)throw Error('Join cancelled.');
 const session=new NetworkSession(null,{loadWorld:loadRoomWorld,onLoading:id=>{
  if(networkSession!==session)return;
  networkUi?.status('Laddar '+networkMap(id).name+'…');if(game===session.view)onlineRoomUi?.update(session);
 },onMatch:()=>{if(networkSession===session&&game===session.view)networkPhase();},onConnection:status=>{if(networkSession!==session)return;clearInput();audio.reset();renderer?.resetTransient();recoil.reset();if(status==='reconnecting')showPause();$('pause').querySelector('p:not(.eyebrow)').textContent=status==='reconnecting'?'Återansluter… Platsen reserveras i 15 sekunder. Matchen fortsätter.':'Ansluten igen. Tryck Fortsätt för kontroller och ljud.';},onDisconnect:message=>{if(networkSession!==session)return;newMatch();networkUi?.status(connectionMessage(message));}});
 networkSession=session;
 try{await session.connect(options);if(session.room.state.mode==='classic')await renderer.prepareClassic();if(generation!==networkJoinGeneration){await session.dispose();throw Error('Join cancelled.');}}
 catch(e){await session.dispose();if(networkSession===session)networkSession=null;throw e;}
 game=session.view;applyNetworkMode();
 team=game.team;setPrivateCharacterActors([]);modal=null;lastRound=game.state.round;lastPhase='active';spectateIndex=0;feed=[];
 yaw=game.player.yaw;pitch=game.player.pitch;for(const id of ['menu','pause','buy','match-end','scoreboard'])$(id).hidden=true;
 $('hud').hidden=false;mobile.show(true,true);audio.unlock();updateHud();
 // Connection setup is asynchronous: require a user gesture for pointer lock.
 onlineRoomUi??=roomUi({leave:newMatch,resume,activate:()=>audio.unlock()});
 networkPhase();
 return session;
}
function applyNetworkMode(){
 world.networkClassic=game.state.mode==='classic';minimapCache.invalidate();setMapExpanded(false);
 setText('map-legend',world.networkClassic?'Pil · Du    Punkt · Laget    B · Bombplats    G · Gisslanstart    R · Räddningszon':'Pil · Du    Punkt · Laget');
 $('minimap').setAttribute('aria-label',world.networkClassic?'Taktisk karta med din riktning, lagkamrater, startområden och uppdragsplatser':'Taktisk karta med din riktning, lagkamrater och startområden');
 document.documentElement.classList.toggle('online-classic',world.networkClassic);
 const equipment=document.querySelector('[data-mobile-action=buy]');
 equipment.textContent=world.networkClassic?'KÖP':'UTR.';
 equipment.setAttribute('aria-label',world.networkClassic?'Öppna köpmenyn':'Välj utrustning');
 $('buy').querySelector('h2').textContent=world.networkClassic?'Köp utrustning':'Välj utrustning';
}
function networkPhase(){
 if(!networkSession?.room||!game?.player)return;
 if(world.networkClassic!==(game.state.mode==='classic')){
  applyNetworkMode();
  if(world.networkClassic){
   const session=networkSession;
   renderer.prepareClassic().catch(()=>{if(networkSession===session)session.notice='Gisslanmodellen kunde inte laddas.';});
  }
 }
 clearInput();audio.reset();renderer.resetTransient();combatHud.reset();recoil.reset();feed=[];
 yaw=game.player.yaw;pitch=game.player.pitch;
 const active=networkSession.room.state.phase==='active';
 if(familyRoomLink||networkSession.familyAlias)document.documentElement.classList.toggle('cs-family-lobby',!active);
 if(active){
  onlineRoomUi?.update(networkSession);modal=null;
  if(!testMode)showPause();else game.pause(false);
 }else{
  game.pause(true);modal='online';mobile.show(false);unlockMouse();$('pause').hidden=true;$('buy').hidden=true;$('match-end').hidden=true;
  onlineRoomUi?.update(networkSession);
 }
}
function restartMatch(){if(networkMode){newMatch();return;}window.__csFlow?.fullscreen?.start();audio.unlock();start(team);requestMouse();}
function newMatch(){if(networkMode){networkJoinGeneration++;setMapExpanded(false);document.documentElement.classList.toggle('cs-family-lobby',familyRoomLink);}onlineRoomUi?.hide();if(networkSession){networkSession.dispose();networkSession=null;game=new Game(world);game.network=true;lastRound=game.state.round;lastPhase=game.phase;} window.__csFlow?.fullscreen?.exit();clearInput();recoil.reset();game.pause(true);audio.reset();renderer?.resetTransient();modal='menu';mobile.show(false);unlockMouse();for(const id of ['pause','buy','match-end','scoreboard','hud'])$(id).hidden=true;$('menu').hidden=false;settingsPanel('menu-settings');}
function viewActor(){if(game.player?.alive)return game.player;const alive=game.actors.filter(a=>a.alive&&a.team===game.team);return alive[spectateIndex%Math.max(1,alive.length)]||game.player;}
function timer(value){const sec=Math.max(0,Math.ceil(value));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function scoreboard(){
 setText('board-round',networkSession?(isEndless(game)?'TEAM DEATHMATCH · 5v5':'CLASSIC · RUNDA '+game.state.round):isEndless(game)?'ENDLESS · FIENDEKILLS':`RUNDA ${game.state.round}`);
 const key=JSON.stringify([!!networkSession,game.state.score,game.actors.map(a=>[a.id,a.name,a.team,a.isPlayer,a.controllerType,a.alive,a.connected,a.kills,a.deaths,a.money])]);
 if(htmlCache.get('score-tables')===key)return;htmlCache.set('score-tables',key);
 const root=$('score-tables');root.replaceChildren();
 for(const [id,name] of Object.entries(TEAMS)){
  const title=document.createElement('h3');title.className=id==='counterAnalysts'?'counter':'';title.textContent=name;const score=document.createElement('span');score.style.float='right';score.textContent=game.state.score[id];title.append(score);root.append(title);
  const table=document.createElement('table');table.innerHTML=`<thead><tr><th>SPELARE</th><th>K</th><th>D</th>${networkSession&&isEndless(game)?'':'<th>KREDITER</th>'}<th>STATUS</th></tr></thead>`;const body=document.createElement('tbody');
  for(const a of game.actors.filter(a=>a.team===id)){const row=document.createElement('tr');row.className=(a.isPlayer?'me ':'')+(!a.alive?'dead':'');for(const value of [a.name+(a.isPlayer?' · du':a.controllerType==='human'?'':' · bot'),a.kills,a.deaths,...(networkSession&&isEndless(game)?[]:[a.money]),networkSession&&a.connected===false?'Återansluter':a.alive?'I spel':'Utslagen']){const td=document.createElement('td');td.textContent=String(value);row.append(td);}body.append(row);}table.append(body);root.append(table);
 }
}
function minimap(){
 const visible=!document.hidden&&!$('hud').hidden&&(!networkMode||!modal)
   &&!!minimapPanel.getClientRects().length;
 minimapCache.draw(world,game,mapExpanded,visible);
}
function classicObjective(state,player){
 const counter=player.team==='counterAnalysts';
 const bomb=state.bomb;
 if(bomb.status==='planted'){
   const directive=counter?'Försvara bomben':'Desarmera bomben';
   return directive+' · '+timer(bomb.deadline-state.time);
 }
 if(state.hostages.some(h=>h.alive&&!h.rescued&&h.escortId===player.id))return 'Eskortera till räddningszonen';
 if(bomb.carrierId===player.id)return 'Du bär bomben · '+missionRoomName(world);
 if(counter&&bomb.status==='dropped')return 'Ta upp bomben eller rädda gisslan';
 return counter?'Plantera eller rädda gisslan':'Stoppa plantering och räddning';
}

function updateHud(){if(!game?.player)return;combatHud.update(game);const s=game.state,p=game.player,view=viewActor(),wp=WEAPONS[view.weapon],item=game.item(view),time=s.phase==='buy'?s.buyDeadline-s.time:s.phase==='result'?s.resultDeadline-s.time:s.bomb.status==='planted'?s.bomb.deadline-s.time:s.deadline-s.time;setText('timer',isEndless(game)?timer(s.time):timer(time));setText('round-label',isEndless(game)?'ENDLESS ACTION ∞':`RUNDA ${s.round}`);setText('difficulty-label',DIFFICULTIES[s.difficulty].name.toUpperCase());setText('phase',s.phase==='buy'?'KÖPFAS':s.bomb.status==='planted'?'BOMB PLANTERAD':s.phase==='result'?'RUNDA SLUT':isEndless(game)?'AUTO-RESPAWN':'HYBRID');for(const [side,id]of [['analysts','a'],['counterAnalysts','ca']]){setText('score-'+id,s.score[side]);setText('alive-'+id,game.actors.filter(a=>a.team===side&&a.alive).length+' kvar');}setText('health',Math.max(0,Math.ceil(view.hp)));setText('armor',view.armor?`${Math.ceil(view.armor)} rustning`:'');setText('money',isEndless(game)?'B · VÄLJ VAPEN':`${p.money} ¤`);setText('weapon-name',wp?.name||'UTRUSTNING');const ammo=wp?.slot==='grenade'?`${view.inventory[view.weapon]} <span>cartridge</span>`:wp?.slot==='bomb'?'BOMB':wp?.slot==='knife'?'KNIV':`${item?.ammo??0} <span>/ ${item?.reserve??0}</span>`;if($('ammo').innerHTML!==ammo)$('ammo').innerHTML=ammo;setText('reload-text',view.reloadUntil>s.time?`Laddar om · ${(view.reloadUntil-s.time).toFixed(1)} s`:s.phase==='buy'?'B · ÖPPNA KÖPMENYN':'');setText('location',roomDisplayName(world.roomAt?.(view.x,view.z)));
 const onlineClassic=!!networkSession&&s.mode==='classic';
 const b=s.bomb,rescued=s.hostages.filter(h=>h.rescued).length;
 $('bomb-status').classList.toggle('hot',b.status==='planted');
 if(onlineClassic){
   $('objectives').hidden=!p.alive||!['buy','active'].includes(s.phase);
   setText('bomb-status',classicObjective(s,p));
   setText('hostage-status','Gisslan '+rescued+'/'+s.hostages.length);
 }else{
   const bombStatus=b.status==='planted'?`BOMB · ${timer(b.deadline-s.time)}`:b.carrierId===p.id?'DU BÄR BOMBEN · 5':b.status==='dropped'?'BOMB SLÄPPT':`BOMB · ${game.actors.find(a=>a.id===b.carrierId)?.name||'—'}`;
   setText('bomb-status',isEndless(game)?`FRIENDLY FIRE ${game.config.friendlyFire?'PÅ':'AV'} · Z RADIO`:bombStatus);
   setText('hostage-status',isEndless(game)?'Inga uppdrag · fortsätter tills du lämnar':`GISSLAN ${rescued}/2 · ${s.hostages.filter(h=>h.alive===false).length} döda`);
 }
 const prompt=p.alive&&s.phase==='active'?game.prompt(p):'';$('prompt').hidden=!prompt;setText('prompt-text',prompt);const action=p.action;const progress=action?Math.max(0,Math.min(1,(s.time-action.start)/(action.duration||1))):0;$('action-progress').style.width=`${progress*100}%`;$('prompt').querySelector('.progress').hidden=!action;
 mobile.show(!modal&&game.phase!=='menu'&&game.phase!=='match',p.alive);$('crosshair').classList.toggle('auto-target',!!autoFireTarget&&mobile.enabled&&settings.mobileAutoFire);
 const inventory=p.inventory;const slots=[['1',inventory.primary?.id],['2',inventory.pistol?.id],['3','knife'],['4',['smoke','flash','he'].filter(k=>inventory[k]>0).join('/')],['5',b.carrierId===p.id?'bomb':null]];setHtml('weapon-slots',slots.map(([num,id])=>`<span class="${id===p.weapon||(num==='4'&&['smoke','flash','he'].includes(p.weapon))?'selected':''}"><b>${num}</b>${id?(WEAPONS[id]?.name?.replace(' Analyst','').replace(' Counter','')||'Granater'):'—'}</span>`).join(''));
 $('spawn-protection').hidden=!p.alive||!(p.spawnProtectedUntil>s.time);if(networkSession)updateTeamRadio();else if(s.time>radioUntil)$('radio-caption').textContent='';$('spectate').hidden=p.alive;$('death-restart').hidden=!!networkSession||isEndless(game);setText('respawn-status',isEndless(game)?`ÅTERUPPSTÅR OM ${Math.max(0,(p.respawnAt||s.time)-s.time).toFixed(1)} s · Esc pausar`:'← → Byt lagkamrat · Nästa runda startar automatiskt');if(!p.alive){$('spectate').querySelector('span').textContent=`FÖLJER ${view.name}`;const c=p.deathCause;setText('death-cause',c?`${c.sourceName||'Explosion'} · ${WEAPONS[c.weapon]?.name||c.weapon||'Skada'}`:'Du är utslagen.');}$('round-result').hidden=s.phase!=='result';if(s.phase==='result'){setText('result-title',s.result.winner?`${TEAMS[s.result.winner]} vinner`:'Oavgjord runda');setText('result-reason',reasonNames[s.result.reason]||s.result.reason);}
 if(!networkSession&&s.phase==='match'&&modal!=='match'&&modal!=='menu'){modal='match';clearInput();unlockMouse();$('match-end').hidden=false;setText('match-winner',`${TEAMS[s.result?.winner]||TEAMS[Object.keys(s.score).sort((a,b)=>s.score[b]-s.score[a])[0]]} vinner`);setText('match-score',`${s.score.analysts} – ${s.score.counterAnalysts} · ${s.round} rundor`);}
 if(onlineClassic){
   onlineRoomUi?.update(networkSession);setText('round-label','CLASSIC · RUNDA '+s.round+' · '+s.score.analysts+'–'+s.score.counterAnalysts);
   if(p.pending)setText('respawn-status','Ansluten · du spelar från nästa runda');
   if(modal==='buy')refreshShop();
 }
 if(notificationUntil<s.time)setText('notification','');feed=feed.filter(f=>f.until>s.time);updateKillfeed(); if(networkSession&&game.state.mode!=='classic'){if(modal==='buy'&&$('shop').dataset.selected!==p.loadout){$('shop').dataset.selected=p.loadout;refreshShop();}onlineRoomUi?.update(networkSession);setText('timer',timer(networkSession.room.state.remainingSeconds));setText('round-label','TEAM DEATHMATCH · '+networkSession.room.state.scoreTarget+' KILLS');setText('phase',networkSession.status||'CONNECTING');setText('money','B · UTRUSTNING');setText('bomb-status','4 · HE · ELD FÖR ATT KASTA');setText('hostage-status','Matchen fortsätter i menyer · Esc / paus för att lämna');setText('respawn-status',`RESPAWN ${Math.max(0,(p.respawnAt||s.time)-s.time).toFixed(1)} s`);}
 if(board)scoreboard();minimap();setText('perf',`${renderer.stats.fps} FPS`);focusHud.update();
}
function input(dt=1/60){
 if(modal||teamRadioOpen||!game.player?.alive){gamepad.clear();firePress=null;crouchPress=false;resetAutoAim();return {};}
 yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*1.7*dt;
 const touch=mobile.enabled?mobile.input():null,pad=gamepad.read();
 tactical.padAim=!!pad?.aim;
 if(pad){
   const scale=3.4*dt*tactical.lookScale(false,yaw,pitch),before=pitch;
   yaw-=pad.lookX*scale;pitch=Math.max(-1.49,Math.min(1.49,pitch-pad.lookY*scale));recoil.counter(pitch-before);
   if(pad.reload)game.reload();
   if(pad.swap)tactical.cycleWeapon();
   if(pad.cartridge)game.select('4');
   if(pad.inspect)renderer.requestInspect(game);
   if(pad.firePress)recordFirePress();
 }

 const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 const x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
 let autoFire=false;autoFireTarget=null;
 if(mobile.enabled&&settings.mobileAutoFire&&!focusHud?.expanded&&!fire&&!touch?.fire&&!pad?.fire&&game.phase==='active'){
   const target=game.reticleTarget(game.player,yaw,pitch);
   if(target){
     autoFireTarget=target.id;
     const current=target.id+':'+game.player.weapon;
     if(autoTargetId!==current){autoTargetId=current;autoTargetSince=game.state.time;}
     // Like Riposte's sniper trigger: deliberate dwell, instead of instant
     // repeated shots as the crosshair just passes a distant opponent.
     autoFire=game.player.weapon!=='sniper'||(game.player.aimAmount>.9&&game.state.time-autoTargetSince>=.26);
   }else resetAutoAim();
 }else resetAutoAim();
 const p=game.player,press=firePress,crouchEdge=crouchPress||!!touch?.crouchEdge||!!pad?.crouchEdge;
 crouchPress=false;
 firePress=null;
 return {
   firePress:press?.weapon===p.weapon && press.life===p.lifeId && press.epoch===p.controlEpoch && press.round===game.state.round ? press : null,
   sprint:keys.has('KeyX')||!!touch?.sprint||!!pad?.sprint,
   forward:Math.max(-1,Math.min(1,f+(touch?.forward||0)+(pad?.forward||0))),
   strafe:Math.max(-1,Math.min(1,x+(touch?.strafe||0)+(pad?.strafe||0))),
   jump:keys.has('Space')||!!touch?.jump||!!pad?.jump,
   crouchEdge,crouch:keys.has('ControlLeft')||keys.has('ControlRight')||!!touch?.crouch||!!pad?.crouch,
   sneak:keys.has('ShiftLeft')||keys.has('ShiftRight')||!!touch?.sneak,
   fire:fire||!!touch?.fire||!!pad?.fire||autoFire,
   aim:tactical.wanted||tactical.padAim,autoFire,
   interact:keys.has('KeyE')||!!touch?.interact||!!pad?.interact,
   yaw,pitch
 };
}
function consumeEvents(){audio.game=game;const events=game.drainEvents();combatHud.events(events,game);
 for(const event of events)if(event.type==='shot'&&event.actorId===game.player?.id){
   const kick=recoil.shot(event.weapon,game.player,event.time,mobile.enabled?'touch':'kb',game.random);
   if(kick.pitch||kick.yaw){
     const previous=pitch;
     pitch=Math.max(-1.49,Math.min(1.49,pitch+kick.pitch));
     yaw+=kick.yaw;
     recoil.pending=Math.max(0,recoil.pending-Math.max(0,kick.pitch-(pitch-previous)));
     game.player.pitch=pitch;game.player.yaw=yaw;
   }
 }
if(game.phase!==lastPhase){if(['result','match'].includes(game.phase)){audio.reset();}lastPhase=game.phase;}if(game.state.round!==lastRound){lastRound=game.state.round;audio.reset();renderer.resetTransient();recoil.reset();yaw=game.player.yaw;pitch=game.player.pitch;clearInput();}for(const event of events){if(event.type==='respawn'&&event.actorId===game.player.id){clearInput();recoil.reset();yaw=game.player.yaw;pitch=0;renderer.lastWeapon='';}if(event.type==='radio'&&!event.teamPrivate){setText('radio-caption',`RADIO · ${event.text}`);radioUntil=game.state.time+3.4;radioOpen=false;$('radio-menu').hidden=true;}if(event.type==='kill'){if(event.actorId===game.player.id){fire=false;radioOpen=false;$('radio-menu').hidden=true;if(!isEndless(game))unlockMouse();}const killer=game.actors.find(a=>a.id===event.sourceId),victim=game.actors.find(a=>a.id===event.actorId);feed.push({text:`${killer?.name||event.sourceName||'—'}  ▸  ${victim?.name||event.targetName||'—'}`,until:game.state.time+5});}if(event.type==='planted')notify('Bomben är planterad i '+missionRoomName(world)+'.',4);if(event.type==='rescued')notify('Gisslan har nått räddningszonen.',3);}const effectEvents=['result','match'].includes(game.phase)?events.filter(e=>['result','match','kill','rocket-launch','rocket-explosion'].includes(e.type)):events;renderer.events(events,game);const view=viewActor();if(view)audio.handle(effectEvents,{...view,y:view.y+view.height-.12,ambient:['buy','active'].includes(game.phase)&&!game.state.paused,floorAudioReady:!modal&&$('cs-loading').hidden},game.state.time);return events;}
function frame(now){try{
 if(networkMode&&(!renderer||!grenadeAssist||networkSession&&(!networkSession.view.player||networkSession.worldRevision!==networkSession.room?.state.worldRevision||game!==networkSession.view))){
  lastFrame=now;raf=requestAnimationFrame(frame);return;
 }
 // The empty network lobby has a fixed camera and simulation time. Retain its
 // pixels until a new lobby, viewport or graphics setting needs a redraw.
 const stillLobby=networkMode&&modal==='menu'&&game.phase==='menu';
 const stillRevision=stillLobby?`${innerWidth}:${innerHeight}:${devicePixelRatio}:${settings.graphics}`:null;
 if(!renderBudget.shouldRender(now,document.hidden,!!modal||game.state.paused,stillLobby?game:null,stillRevision)){lastFrame=now;raf=requestAnimationFrame(frame);return;}const dt=lastFrame?Math.min(.05,(now-lastFrame)/1000):1/60;lastFrame=now;
 tactical.update(dt);
 if(!modal&&game.player?.alive&&game.phase==='active'&&!game.state.paused){
   if(recoil.weapon&&recoil.weapon!==game.player.weapon)recoil.reset();
   pitch=Math.max(-1.49,Math.min(1.49,pitch-recoil.recover(dt,game.state.time)));
 }
 if(networkSession)networkSession.advanceFrame(now,(testMode&&globalThis.__fps?.liveControls)||input(dt));else if(!testMode||new URLSearchParams(location.search).has('realtime'))game.update(dt,(testMode&&globalThis.__fps?.liveControls)||input(dt));consumeEvents();tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),dt);const p=viewActor();$('flash-overlay').style.opacity=String((p?.flash||0)*(settings.reducedFlash?.45:.94));const hurt=Math.max(0,Math.min(1,(renderer.damageUntil-game.state.time)/.55));$('damage-overlay').style.opacity=String(hurt*.35);$('damage-direction').style.opacity=String(hurt);if(renderer.damageDirection){const d=renderer.damageDirection;$('damage-direction').style.transform=`translate(-50%,-50%) rotate(${(p?.yaw||0)-Math.atan2(d.x,d.z)}rad)`;}$('smoke-overlay').style.opacity=String(p?renderer.smokeOpacity(p,game.state.smokes):0);$('hitmarker').style.opacity=game.state.time<renderer.hitUntil?'1':'0';if(now-hudAt>100){updateHud();hudAt=now;}raf=requestAnimationFrame(frame);}catch(e){fatal(e);}}
function fatal(error){cancelAnimationFrame(raf);grenadeAssist?.reset();$('fatal').hidden=false;$('fatal').querySelector('pre').textContent=error.stack||String(error);$('loading').hidden=true;console.error(error);}
team = document.querySelector('.team-option.selected').dataset.team;
for (const option of document.querySelectorAll('[data-team]')) option.addEventListener('click', () => { team = option.dataset.team; });
function launchMatch(event){
 if(networkMode || modal!=='menu' || !audio || !$('loading').hidden || characterSelectionFailed || !$('fatal').hidden)return;
 mobile.attemptLandscape();
 start(document.querySelector('.team-option.selected').dataset.team);
 if(!mobile.enabled && navigator.userActivation && !navigator.userActivation.isActive && !event?.detail?.fullscreenRequested){
   showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Matchen är redo. Klicka på Fortsätt för att börja.';
   $('resume').focus();return;
 }
 audio.unlock();requestMouse();
}
$('start').addEventListener('cs-start-match',launchMatch);
if(networkMode)document.addEventListener('webglcontextrestored',()=>renderBudget.invalidate(),true);
$('death-restart').onclick=restartMatch;$('resume').onclick=resume;$('restart').onclick=newMatch;$('new-match').onclick=newMatch;$('close-buy').onclick=closeBuy;$('return-buy').onclick=closeBuy;
$('fullscreen-toggle').onclick=()=>{window.__csFlow?.fullscreen?.toggle();syncFullscreenToggle();};
document.addEventListener('fullscreenchange',()=>{syncFullscreenToggle();if(mobile.enabled&&document.fullscreenElement)mobile.attemptLandscape();window.dispatchEvent(new Event('resize'));});syncFullscreenToggle();
window.addEventListener('keydown',e=>{if(teamRadioKey(e))return;if(!modal&&['Tab','Space','Escape','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(radioOpen){radioOpen=false;$('radio-menu').hidden=true;return;}if(modal==='buy')closeBuy();else if(!modal)showPause();return;}if(modal)return;if(!networkMode&&e.code==='KeyZ'&&game.player?.alive){radioOpen=!radioOpen;$('radio-menu').hidden=!radioOpen;return;}if(radioOpen&&/^Digit[1-6]$/.test(e.code)){const result=game.radio(RADIO[Number(e.code.slice(-1))-1]?.id);if(!result)notify('Radion är upptagen. Försök strax igen.');return;}if(!networkMode&&e.code==='Enter'&&!game.player?.alive&&!isEndless(game)){restartMatch();return;}if(e.code==='Tab'){board=true;$('scoreboard').hidden=false;scoreboard();return;}if(e.repeat)return;keys.add(e.code);if((e.code==='ControlLeft'||e.code==='ControlRight')&&game.player?.alive)crouchPress=true;if(e.code==='KeyB'){showBuy();return;}if(e.code==='KeyR')game.reload();if(e.code==='KeyQ')game.select('last');if(e.code==='KeyG')game.drop();if(/^Digit[1-5]$/.test(e.code))game.select(e.code.slice(-1));if(e.code==='KeyM'){toggleMap();return;}if(!game.player.alive&&['ArrowLeft','ArrowRight'].includes(e.code)){const count=game.actors.filter(a=>a.alive&&a.team===game.team).length;spectateIndex=(spectateIndex+(e.code==='ArrowLeft'?-1:1)+count)%Math.max(1,count);}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'){board=false;$('scoreboard').hidden=true;}});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game')||modal||teamRadioOpen||!game.player?.alive)return;const k=settings.sensitivity*tactical.lookScale(false,yaw,pitch);yaw-=e.movementX*k;const before=pitch;pitch=Math.max(-1.49,Math.min(1.49,pitch-e.movementY*k));recoil.counter(pitch-before);});
document.addEventListener('mousedown',e=>{if(e.target!==$('game')||e.button!==0||modal||teamRadioOpen)return;if(document.pointerLockElement!==$('game')){resume();return;}if(!fire)recordFirePress();fire=true;});window.addEventListener('mouseup',e=>{if(e.button===0)fire=false;});window.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockerror',()=>{if(!mobile.enabled&&!modal){showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Muslås kunde inte aktiveras. Tryck Fortsätt igen i en separat webbläsarflik.';}});
window.addEventListener('offline',()=>networkSession?.interruptConnection());
document.addEventListener('pointerlockchange',()=>{if(mobile.enabled)return;if(document.pointerLockElement=== $('game')&&modal){unlockMouse();return;}if(document.pointerLockElement!==$('game')){clearInput();if(!modal&&game.player?.alive)showPause();}});window.addEventListener('blur',()=>{clearInput();if(!modal)showPause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(!modal)showPause();}});

function updateMode(){settings.mode=$('game-mode').value;$('loadout-row').hidden=settings.mode!=='endless';$('mode-description').textContent=settings.mode==='endless'?'Återuppstå efter 3 sekunder. Fritt vapenval med B. Valbara kontrollområden samlar striden. Ingen sluttid.':'Bomb + gisslan. Först till fem rundor. Ingen respawn under rundan.';saveSettings();}
// A viewport rotation can cover the game with the portrait prompt without blur.
// Freeze combat/audio and require an explicit resume after either orientation change.
if(mobile.enabled)matchMedia('(orientation: portrait)').addEventListener('change',()=>{clearInput();if(!modal)showPause();});
$('game-mode').value=['classic','endless'].includes(settings.mode)?settings.mode:'classic';$('loadout').value=settings.loadout||'smg';$('game-mode').onchange=updateMode;$('loadout').onchange=()=>{settings.loadout=$('loadout').value;saveSettings();};
$('radio-options').innerHTML=RADIO.map((r,i)=>`<div><kbd>${i+1}</kbd><span>${r.text}<small>${r.label}</small></span></div>`).join('');updateMode();

const characterQuery=new URLSearchParams(location.search);
if(!window.__csFlow && !rehearsalMode && characterQuery.get('team')==='counterAnalysts')team='counterAnalysts';
if(characterQuery.has('seed'))$('seed').value=String(Math.min(999999,Math.max(1,Number(characterQuery.get('seed'))||42)));
try{
 await preparePrivateCharacter();
 if(networkMode){
  game=new Game(null);game.network=true;
  audio=new AudioSystem(null,settings);
  const {networkMenu}=await import('./network/menu.mjs');
  networkUi=networkMenu(joinNetwork,()=>audio.unlock(),internetMode,newMatch);
 }else{
  const levelProject=await selectedLevel();world=createWorld({levelProject});nameWorld();
  if(levelProject){
   $('loading').textContent='Bygger '+COMPLEX_NAME+'…';document.title=GAME_NAME+' · '+COMPLEX_NAME;
   document.querySelector('.intro .eyebrow').textContent=(new URLSearchParams(location.search).get('level')==='preview'?'PRIVAT PROVSPELNING / ':'PUBLICERAD BANA / ')+COMPLEX_NAME;
   document.querySelector('.intro .lead').textContent='Egen bana · fem mot fem med befintlig spelmekanik.';
  }
  game=new Game(world);renderer=new Renderer($('game'),world,settings);audio=new AudioSystem(world,settings);
  await Promise.all([renderer.assetsReady,audio.prepareFloorAudio()]);grenadeAssist=new GrenadeAssist(renderer,settings);
 }
 $('loading').hidden=true;$('start').disabled=characterSelectionFailed||networkMode;
 raf=requestAnimationFrame(frame);if(testMode){globalThis.__fps={stopFrameLoop(){cancelAnimationFrame(raf);raf=0;},get game(){return game;},get network(){return networkSession;},joinNetwork,get world(){return world;},get renderer(){return renderer;},audio,settings,start(selected,config={},autoplay=false){start(selected,config,autoplay);return this.snapshot();},step(controls=null,dt=1/60){tactical.update(dt);game.update(dt,controls??input(dt));yaw=game.player.yaw;pitch=game.player.pitch;consumeEvents();tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),dt);updateHud();return this.snapshot();},snapshot(){return JSON.parse(JSON.stringify({...game.state,player:game.player,actors:game.actors.map(({bot,...rest})=>rest),hostages:game.hostages},(k,v)=>k==='bot'?undefined:v));},render(){tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),1/60);updateHud();},pause(value){game.pause(value);},input,showBuy,newMatch,get modal(){return modal;},mobile,recoil,tactical,get grenadeAssist(){return grenadeAssist;},focusHud,renderBudget,minimapCache};}}
catch(error){fatal(error);}

window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(raf);networkJoinGeneration++;networkSession?.dispose();grenadeAssist?.dispose();audio?.dispose();renderer?.dispose();}});
