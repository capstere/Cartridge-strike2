import {SoloReplays,presentReplayAudio} from './replay-playback.mjs';
import {drawReplay,disposeReplayRender} from './replay-render.mjs';
import {MODE_NAMES,MODE_GUIDES,matchWinnerName,rankPlayers,leadingPlayer,zoneCaption} from './match-presentation.mjs';
import {canOfferInstall} from '../../ui/cs-install.mjs';
import {normalizeTouchProfile,TOUCH_DEFAULTS,touchHelp,touchSettingsMarkup,displaySettingsMarkup,describeGraphics,PresentationPacer,groupControlSettings} from './mobile-profile.mjs';
import {applyTouchLayout,editTouchLayout} from './mobile-layout.mjs';
import {countdownHud, ForegroundCountdownClock} from './deployment-countdown.mjs';
import {MATCH_DEFAULTS} from '../../shared/multiplayer/rules.mjs';
import {loadSoloManifest, resolveSoloSelection} from './solo-maps.mjs';
import {UI_EN} from './english-ui.mjs';
import {roundReasons, purchaseLabel} from './game-english.mjs';
import {GAME_NAME,COMPLEX_NAME,roomDisplayName,missionRoomName} from './player-names.mjs';
import {selectedArsenal,localArsenalProfile,refreshArsenalAccount} from './arsenal-menu.mjs';
import {quoteClass} from './arsenal.mjs';
import {setupCharacterMenu} from './character-selection.mjs';
import {loadPrivateCharacter,characterHash,SavedCharacterError} from './private-character-store.mjs';
import {currentOutfit,clearNetworkOutfits,loadCharacterLibrary,installPrivateCharacter,setPrivateCharacterActors} from './character-library.mjs?v=6.1.2';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { RenderBudget } from './render-budget.mjs';
import { MinimapCache } from './minimap-cache.mjs';
import { FocusHud, focusHudSettings, isLowAmmo } from './focus-hud.mjs';
import {onlinePrimaries} from './action-rules.mjs';
import { GrenadeAssist, grenadeSettingsMarkup } from './grenade-assist.mjs';
import {CombatHUD} from './combat-hud.mjs';
import { createWorld } from './world.mjs?v=5.9.0';
import { Game, TEAMS, WEAPONS, CONFIG, DIFFICULTIES } from './game.mjs';
import { Renderer } from './render.mjs?v=floor5-environment-1';
import { AudioSystem } from './riposte-audio.mjs';
import {RADIO,isEndless} from './action-rules.mjs';
import {BonusHud} from './bonus-hud.mjs';
import {sharedGamepad as gamepad,claimControllerForGame,installLobbyController,pollControllerMenu} from './gamepad-controls.mjs';
import { MobileControls, isTouchDevice } from './mobile-controls.mjs';
import { PlayerRecoil } from './riposte-recoil.mjs';
import { TacticalControls } from './tactical-controls.mjs';
import {englishPublishedFixtures} from '../../furniture-editor/build/environment-art.mjs';
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
import {accessText as accessEnglish} from '../../shared/multiplayer/access-english.mjs';
import {connectionFailure, connectionMessage, MapLoadError} from './network/connection.mjs';
import {roomUi} from './network/room-ui.mjs';
const touchDevice=isTouchDevice();
const renderBudget=new RenderBudget();
const presentationPacer=new PresentationPacer();
const minimapCache=new MinimapCache($('minimap'));
const minimapPanel=$('minimap').closest('.map-panel');
const settings={grenadeGuide:true,grenadeWarning:true,mobileAutoFire:!networkMode,sensitivity:.0022,volume:.55,reducedMotion:false,reducedFlash:true,difficulty:'casual',graphics:'standard',blood:'standard',mode:'classic',firefight:true,combatSounds:true,friendlyFire:true,wanderers:true,radioVoice:true,loadout:'smg'};
let storedSettings={};
try{storedSettings=JSON.parse(localStorage.getItem('cartridge-settings')||'{}')||{};Object.assign(settings,storedSettings);}catch{}
if(typeof settings.mobileAutoFire!=='boolean')settings.mobileAutoFire=!networkMode;
if(touchDevice&&!Object.hasOwn(storedSettings,'graphics'))settings.graphics='low';
normalizeTouchProfile(settings);
for(const key of ['menuMusicVolume','announcementVolume'])settings[key]=Number.isFinite(settings[key])?Math.max(0,Math.min(1,settings[key])):1;
settings.powerSaving=settings.powerSaving===true;settings.ambientOcclusion=settings.ambientOcclusion!==false;settings.dynamicResolution=settings.dynamicResolution!==false;
settings.mobile=settings.touchMode==='on'||(settings.touchMode==='auto'&&touchDevice);
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
 if(!original.ok)throw Error('The operator model could not load. Check your connection and try again.');
 if(await characterHash(await original.arrayBuffer())!==privateCharacterDraft.sourceHash)throw new SavedCharacterError('rig-version');
 await loadCharacterLibrary();
 installPrivateCharacter(await new GLTFLoader().parseAsync(privateCharacterDraft.bytes.slice(0),''));
 if(!rehearsalMode){setPrivateCharacterActors([team+'-0']);characterMenu.loaded(privateCharacterDraft.name);return;}
 const note=document.createElement('p');note.id='private-character-note';note.textContent='Private preview · '+privateCharacterDraft.name+'. You and teammate A-02 use your design. Your first-person hands and sleeves match your character. This preview stays on this device.';
 document.querySelector('.intro').append(note);
 const exit=document.createElement('a');exit.id='original-character-match';exit.href='./?avatar=';exit.textContent='Play with the original characters';document.querySelector('.intro').append(exit);

 document.querySelector('[data-team="counterAnalysts"]').disabled=true;
 }catch(e){if(rehearsalMode)throw e;characterSelectionFailed=true;privateCharacterDraft=null;characterMenu.error(e);}
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
   if(!response.ok)throw new MapLoadError(map.name);
   const body=await response.text();
   if(await sha256(body)!==contract.mapHash)throw Error('Map version mismatch');
   signal.throwIfAborted();
   const {collisionContract}=await import('../../shared/multiplayer/collision-contract.mjs');
   const candidate=createWorld({levelProject:englishPublishedFixtures(parseProject(body)),fresh:true});
   if(await sha256(collisionContract(candidate))!==contract.collisionHash)throw Error('Collision version mismatch');
   signal.throwIfAborted();
   prepareNetworkWorld(candidate);
   releaseWorldPresentation();
   try{
    renderer=new Renderer($('game'),candidate,settings,{roomActors:networkSession?.room?.state.actors,signal});
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
function loadingStage(stage,name) {
 const element=$('loading');
 element.dataset.stage=stage;
 if(name)element.dataset.mapName=name;
 element.textContent=UI_EN.loading[stage];
}
async function selectedLevel(){
 const query=new URLSearchParams(location.search),id=query.get('level');
 // Local previews and the original built-in level keep working offline.
 const manifest=id==='preview'||id==='classic-floor5'?{levels:[]}:await loadSoloManifest();
 const selection=resolveSoloSelection(manifest,query,settings.mode);
 let project=null;
 if(selection.id==='preview'){
   const saved=localStorage.getItem('cartridge-level-preview');
   if(!saved)throw Error('No private level preview is saved in this browser.');
   project=parseProject(saved);
   if(project.name)selection.name=project.name;
 }else if(selection.file){
   const response=await fetch('../'+selection.file);
   if(!response.ok)throw Error('The level file could not be loaded. Reload to try again.');
   project=englishPublishedFixtures(parseProject(await response.text()));
 }
 $('game-mode').value=selection.mode;
 updateMode();
 loadingStage('level',selection.name);
 $('menu').dispatchEvent(new CustomEvent('cs-solo-selection',{detail:selection}));
 return project;
}
function nameWorld(){
 for(const side of ['analysts','counterAnalysts']){
  const p=world.anchors[side]?.[0],label=document.querySelector(`[data-team="${side}"] small`);
  if(label)label.textContent='Spawn in '+roomDisplayName(p&&world.roomAt(p.x,p.z));
 }
 const missions=document.querySelectorAll('.mission-strip span');
 if(missions[0])missions[0].replaceChildren(document.createTextNode(missionRoomName(world)),document.createElement('br'),Object.assign(document.createElement('strong'),{textContent:'Plant / defend'}));
 const h=world.anchors.hostages?.[0];
 if(missions[1])missions[1].replaceChildren(document.createTextNode(roomDisplayName(h&&world.roomAt(h.x,h.z))),document.createElement('br'),Object.assign(document.createElement('strong'),{textContent:'Escort / guard'}));
}
const deployment=countdownHud($('deployment-countdown'), mark=>audio?.deploymentCue(mark));
const foregroundCountdown=new ForegroundCountdownClock();
let countdownSession=null;
const mouseLookButton=$('countdown-look');
function showMouseLook(show){if(mouseLookButton.hidden===show)mouseLookButton.hidden=!show;}
const holdingDeployment=()=>networkSession ? networkSession.room?.state.phase==='countdown' : !!game?.warmupRemaining;
function showDeployment(now){
 const state=networkSession?.room?.state;
 if($('hud').hidden || document.hidden || modal || networkSession?.connectionState==='reconnecting' ||
    state?.phase==='countdown' && now-networkSession.lastPatch>1000){
   deployment.suspend();showMouseLook(false);return;
 }
 const during=holdingDeployment();
 const active=state ? state.phase==='active' : !!game?.player;
 if(!during&&!active){deployment.reset();showMouseLook(false);return;}
 const remaining=during ? (state ? Math.max(.001,state.remainingSeconds) : game.warmupRemaining) : 0;
 deployment.update(state ? state.matchId : game,remaining,active,now);
 $('deployment-countdown').classList.toggle('reduced-motion',settings.reducedMotion);
 const needsTouchAudio=mobile.enabled && during && audio.volume>0 && audio.context?.state!=='running';
 const gestureLabel=needsTouchAudio?'Enable match audio':'Enable mouse look';
 if(mouseLookButton.textContent!==gestureLabel)mouseLookButton.textContent=gestureLabel;
 showMouseLook(needsTouchAudio || !!(during || active && state && !testMode) && !mobile.enabled && !gamepad.active && document.pointerLockElement!==$('game'));
}
let firePress=null,crouchPress=false;
function recordFirePress(){
 if(!modal && !holdingDeployment() && !teamRadioOpen && game?.player?.alive && game.phase==='active'){
   firePress ??= {yaw,pitch,weapon:game.player.weapon,life:game.player.lifeId,epoch:game.player.controlEpoch,round:game.state.round};
 }
}
const bonusHud = new BonusHud($('bonus-controls'),settings,requestBonus);
function requestBonus(slot) {
  if (!modal && !radioOpen && !teamRadioOpen && !holdingDeployment() && game?.player?.alive && game.phase === 'active') {
    game.requestBonus(slot);
  }
}
const mobile=new MobileControls({
  settings,onFirePress:recordFirePress,
  scopeTrigger:phase=>tactical?.scopedTrigger(phase),
  cancelThrow(){if (WEAPONS[game?.player?.weapon]?.slot==='grenade' && !modal && !holdingDeployment()) showPause();},
  onModeChange(touch) { settings.mobile = touch; clearInput(); },
  root:$('mobile-controls'),
  onLook(dx,dy){if(modal||teamRadioOpen||!game?.player?.alive)return;const k=settings.sensitivity*2.15*settings.touchLookSensitivity*(tactical?.lookScale(true,yaw,pitch)??1);const before=pitch;yaw-=dx*k;pitch=Math.max(-1.49,Math.min(1.49,pitch-dy*k*(settings.invertLookY?-1:1)));recoil.counter(pitch-before);},
  onAction(action){
    if(!game||teamRadioOpen)return;
    if(action==='restart'){restartMatch();return;}
    if(action==='pause'){showPause();return;}
    if(holdingDeployment())return;
    if(action==='buy'){showBuy();return;}
    if(!game.player?.alive)return;
    if(action==='reload')game.reload();
    else if(action==='weapon')tactical.cycleWeapon();
    else if(action==='grenade')game.select('4');
    else if(action==='drop')game.drop();
  }
});
mobile.setAutoFire(settings.mobileAutoFire);
tactical=new TacticalControls({settings,mobile,getGame:()=>game,getModal:()=>modal||teamRadioOpen||holdingDeployment(),
  isInteracting:()=>keys.has('KeyE')||mobile.state.interact,onAimChange:resetAutoAim});
const combatHud=new CombatHUD(settings);
focusHud=new FocusHud({
 settings,mobile,getGame:()=>game,getModal:()=>modal||teamRadioOpen||holdingDeployment(),onMap:toggleMap,onStats:showPause,onInspect:()=>renderer?.requestInspect(game),
 onRadio:networkMode?toggleTeamRadio:null,networkMode
});
applyTouchLayout(mobile.root,settings.touchLayout);
function selectTeamRadio(index){
 teamRadioSelection=(index+teamRadioChoices.length)%teamRadioChoices.length;
 const selected=teamRadioButtons.children[teamRadioSelection];
 for(const button of teamRadioButtons.children)button.toggleAttribute('data-current',button===selected);
 selected.scrollIntoView({block:'nearest'});
}
function toggleTeamRadio(){
 if(teamRadioOpen){clearInput();return;}
 if(modal||!networkSession?.canSendTeamComms()){
   if(!modal&&game?.player?.alive)notify('Team radio opens when the match starts.');
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
 else notify('Wait a moment before sending another radio call.');
}
function teamRadioKey(event){
 if(!networkMode||modal||game?.state.mode==='ffa')return false;
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
 const assigned=signal.botAssigned&&signal.senderId===game.player.id?' · A bot received the order':'';
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
const htmlCache=new Map();
const setHtml=(id,value)=>{if(htmlCache.get(id)!==value){$(id).innerHTML=value;htmlCache.set(id,value);}};
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
function updateKillfeed(){const text=feed.map(f=>f.text),key=JSON.stringify(text);if(htmlCache.get('killfeed')===key)return;htmlCache.set('killfeed',key);$('killfeed').replaceChildren(...text.map(textContent=>Object.assign(document.createElement('div'),{textContent})));}
function saveSettings(){focusHud?.applyMode();try{localStorage.setItem('cartridge-settings',JSON.stringify(settings));}catch{}audio?.setVolume(settings.volume);window.dispatchEvent(new CustomEvent('cs-sound-settings',{detail:{volume:settings.volume,menuMusicVolume:settings.menuMusicVolume,announcementVolume:settings.announcementVolume}}));}
function difficultyText(){const active=game?.state.difficulty||settings.difficulty,pending=game?.state.pendingDifficulty;return modal!=='menu'&&game?.phase!=='menu'&&game?.player?`Active · ${DIFFICULTIES[active].name}${pending?` · ${DIFFICULTIES[pending].name} next round`:''}`:DIFFICULTIES[settings.difficulty].description;}
function settingsPanel(target){const select=(key,values)=>`<select aria-label="${key==='difficulty'?'Difficulty':key==='graphics'?'Graphics':'Blood'}" data-setting="${key}">${values.map(([value,label])=>`<option value="${value}" ${settings[key]===value?'selected':''}>${label}</option>`).join('')}</select>`;
$(target).innerHTML=`<label class="setting">Difficulty ${select('difficulty',[['casual','Casual · recommended'],['normal','Normal'],['hard','Hard']])}</label><p class="setting-note" data-difficulty-note>${difficultyText()}</p><label class="setting">Graphics ${select('graphics',[['standard','Standard'],['low','Low · reduced resolution and shadows']])}</label><label class="setting">Blood ${select('blood',[['standard','Full'],['reduced','Reduced'],['off','Off']])}</label><label class="setting">Mouse sensitivity <input aria-label="Mouse sensitivity" data-setting="sensitivity" type="range" min="0.0006" max="0.006" step="0.0001" value="${settings.sensitivity}"></label><label class="setting">Volume <input aria-label="Volume" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label><label class="setting">Control zones in Endless <input aria-label="Control zones in Endless" data-setting="firefight" type="checkbox" ${settings.firefight?'checked':''}></label><p class="setting-note">Fight over a zone that moves every minute. Takes effect next match. Turn off for free-roaming Endless.</p><label class="setting">Hit and elimination sounds <input data-setting="combatSounds" type="checkbox" ${settings.combatSounds?'checked':''}></label><label class="setting">Friendly fire <input data-setting="friendlyFire" type="checkbox" ${settings.friendlyFire?'checked':''}></label><label class="setting">Wandering dwarves <input data-setting="wanderers" type="checkbox" ${settings.wanderers?'checked':''}></label><label class="setting">Radio voices <input data-setting="radioVoice" type="checkbox" ${settings.radioVoice?'checked':''}></label><label class="setting">Reduced motion <input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}></label><label class="setting">Reduced flash and ringing <input data-setting="reducedFlash" type="checkbox" ${settings.reducedFlash?'checked':''}></label>${(mobile.touchCapable || mobile.enabled)?`<label class="setting">Mobile auto-fire <input aria-label="Mobile auto-fire" data-setting="mobileAutoFire" type="checkbox" ${settings.mobileAutoFire?'checked':''}></label><p class="setting-note" data-mobile-fire-note>Fire when the reticle settles on a visible opponent. Turn off to use the Fire button. Grenades and rockets always use manual fire.</p>`:''}`;
bonusHud.settings($(target),settings,saveSettings);
$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup()+grenadeSettingsMarkup(settings)+focusHudSettings(settings));
if(networkMode){for(const input of $(target).querySelectorAll('[data-setting]'))if(!['graphics','blood','sensitivity','volume','combatSounds','reducedMotion','reducedFlash','hudMode','radioVoice','mobileAutoFire','mobileAimAssist'].includes(input.dataset.setting)){input.disabled=true;const label=input.closest('label');if(label)label.hidden=true;}for(const note of $(target).querySelectorAll('.setting-note'))note.hidden=!note.hasAttribute('data-mobile-fire-note');}
$(target).insertAdjacentHTML('beforeend',touchSettingsMarkup(settings)+displaySettingsMarkup(settings));
describeGraphics($(target),renderer,settings);
groupControlSettings($(target));
if(canOfferInstall())
 $(target).insertAdjacentHTML('beforeend','<div><button type="button" data-install-game>Install game</button><p class="setting-note" data-install-note role="status"></p></div>');
$(target).querySelector('[data-layout-edit]').onclick=()=>editTouchLayout(mobile.root,settings,saveSettings,()=>{mobile.applyProfile();mobile.setAutoFire(settings.mobileAutoFire);tactical.syncTrigger();settingsPanel(target);});
$(target).querySelector('[data-look-reset]').onclick=()=>{
 for(const key of ['fieldOfView','zoomSensitivity','touchLookSensitivity','invertLookY'])settings[key]=TOUCH_DEFAULTS[key];
 saveSettings();settingsPanel(target);
};
$(target).querySelectorAll('[data-setting]').forEach(input=>input.oninput=()=>{settings[input.dataset.setting]=input.tagName==='SELECT'?input.value:input.type==='checkbox'?input.checked:Number(input.value);if(input.dataset.setting==='graphics')for(const panel of document.querySelectorAll('#menu-settings,#pause-settings'))describeGraphics(panel,renderer,settings);
if(['menuMusicVolume','announcementVolume'].includes(input.dataset.setting))input.parentElement.querySelector('output').value=Math.round(settings[input.dataset.setting]*100)+'%';
if(Object.hasOwn(TOUCH_DEFAULTS,input.dataset.setting)){
 mobile.clear();mobile.applyProfile();tactical.reset();tactical.syncTrigger();
 const output=input.parentElement.querySelector('output');if(output)output.value=String(settings[input.dataset.setting]);
}
for (const help of document.querySelectorAll('[data-touch-help]')) help.textContent=touchHelp(settings);
if(input.dataset.setting==='difficulty')game?.setDifficulty(settings.difficulty);if(input.dataset.setting==='mobileAutoFire'){mobile.setAutoFire(settings.mobileAutoFire);tactical.syncTrigger();resetAutoAim();}if(game&&!networkMode&&['friendlyFire','wanderers'].includes(input.dataset.setting))game.config[input.dataset.setting]=settings[input.dataset.setting];saveSettings();document.querySelectorAll('[data-difficulty-note]').forEach(n=>n.textContent=difficultyText());
if(input.dataset.setting==='touchMode' && !mobile.touchCapable){
 for(const id of ['menu-settings','pause-settings'])settingsPanel(id);
 $(target).querySelector('[data-setting=touchMode]').focus();
}
});}
settingsPanel('menu-settings');settingsPanel('pause-settings');
function clearInput(){bonusHud.root.hidden=true;keys.clear();gamepad.clear();crouchPress=false;fire=false;firePress=null;mobile.clear();tactical?.reset();grenadeAssist?.reset();focusHud?.reset();resetAutoAim();radioOpen=false;teamRadioOpen=false;teamRadioMenu.hidden=true;if($('radio-menu'))$('radio-menu').hidden=true;if(game?.player){game.player.fireHeld=false;game.player.interactHeld=false;game.player.action=null;}}
function unlockMouse(){
 // Pause and shop can open between paints. Their buttons immediately take
 // ownership of the gesture that can reacquire the mouse.
 showMouseLook(false);
 if(document.pointerLockElement)document.exitPointerLock();
}
function requestMouse(){if(mobile.enabled||gamepad.active)return;try{const result=$('game').requestPointerLock();result?.catch(()=>{showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Mouse capture failed. Open the game in its own browser tab and select Resume.';});}catch{showPause();}}
function notify(text,duration=3){setText('notification',text);notificationUntil=(game?.state.time||0)+duration;}
function syncFullscreenToggle(){const button=$('fullscreen-toggle'),hint=$('fullscreen-hint'),fs=window.__csFlow?.fullscreen;if(!button)return;button.hidden=!fs?.supported;if(fs?.supported)button.textContent=fs.active?'EXIT FULLSCREEN':'ENTER FULLSCREEN';if(hint)hint.hidden=!!fs?.supported;}
function showPause(){foregroundCountdown.suspend();if(networkSession&&!['countdown','active'].includes(networkSession.room?.state.phase))return;if(!game||['menu','match'].includes(game.phase)||modal==='menu')return;modal='pause';mobile.show(false);$('pause').querySelector('p:not(.eyebrow)').textContent=networkSession?`Room ${networkSession.room.roomId} · Friendly fire: ${networkSession.room.state.friendlyFire?'On':'Off'} · Bot difficulty ${DIFFICULTIES[game.state.difficulty].name} · The match continues and you can still take damage.`:'Round timers and bots are paused.';clearInput();game.pause(true);audio.reset();$('pause').hidden=false;$('buy').hidden=true;$('scoreboard').hidden=true;board=false;unlockMouse();settingsPanel('pause-settings');syncFullscreenToggle();}
// LAN fullscreen is an explicit menu action. A simultaneous fullscreen/focus
// transition can interrupt the Resume gesture that enables mouse and audio.
function resume(){if(networkSession&&(networkSession.connectionState==='reconnecting'||!['countdown','active'].includes(networkSession.room?.state.phase)))return;if(!networkMode)window.__csFlow?.fullscreen?.resume();audio.unlock();if(holdingDeployment())lastFrame=0;modal=null;$('pause').hidden=true;$('buy').hidden=true;clearInput();game.pause(false);yaw=game.player.yaw;pitch=game.player.pitch;mobile.show(true,game.player?.alive);requestMouse();}
function shopMessage(outcome, text) {
 const message=$('buy-message');
 if(outcome) {
  if(message.dataset.outcome!==outcome)message.dataset.outcome=outcome;
 } else if(message.hasAttribute('data-outcome'))delete message.dataset.outcome;
 setText('buy-message',text);
}
function shopBalance(player, free) {
 const money=$('buy-money');
 if(money.dataset.credits!==String(player.money))money.dataset.credits=String(player.money);
 if(money.dataset.free!==String(free))money.dataset.free=String(free);
 setText('buy-money', free ? 'FREE LOADOUT' : player.money+' ¤');
}
function showBuy(){if(holdingDeployment())return;if(!game.player?.alive||(game.phase!=='buy'&&!isEndless(game))){notify('The shop opens in the next buy phase.');return;}modal='buy';mobile.show(false);shopMessage(null,'');if(networkSession)networkSession.purchase=null;clearInput();game.pause(true);audio.reset();$('buy').hidden=false;unlockMouse();refreshShop();}
function closeBuy(){if(networkSession){resume();return;}window.__csFlow?.fullscreen?.resume();modal=null;$('buy').hidden=true;clearInput();game.pause(false);audio.unlock();mobile.show(true,game.player?.alive);requestMouse();}
function showClassOffer(){
 const shop=$('shop'),player=game.player;
 let button=shop.querySelector('[data-item=class]');
 if(game.state.mode!=='classic'||!player?.arsenalClass){button?.remove();return;}
 if(!button){
   button=document.createElement('button');button.type='button';button.dataset.item='class';shop.prepend(button);
   button.onclick=()=>{
     const result=game.buy('class');
     if(!networkSession){const outcome=result.ok?'accepted':'denied';shopMessage(outcome,purchaseLabel(outcome,'Equipped class',result.reasonId));}
     refreshShop();
   };
 }
 const quote=quoteClass(player);
 button.textContent=player.arsenalClass.name+' class · '+(quote.items.length?quote.cost+' ¤':'Equipped');
 button.disabled=!quote.items.length||quote.cost>player.money||game.phase!=='buy';
}
function carriedGrenades(inventory){
 const result=[];
 for(const id of ['he','smoke','flash'])if(inventory[id]>0)result.push(inventory[id]+' '+WEAPONS[id].name);
 return result.join(' · ')||'No grenades';
}
function refreshShop(){
 shopBalance(game.player,isEndless(game));
 if(networkSession&&game.state.mode==='classic'){
   const p=game.player;
   $('buy').dataset.team=p.team;
   setText('buy-note','Buy time · '+Math.max(0,Math.ceil(game.state.buyDeadline-game.state.time))+' s · '+[p.inventory.primary?.id,p.inventory.pistol.id,'knife'].filter(Boolean).map(id=>WEAPONS[id].name).join(' · ')+' · '+p.armor+' armor · '+carriedGrenades(p.inventory));
   const receipt=networkSession.currentPurchase();
   if(receipt)shopMessage(receipt.outcome,purchaseLabel(receipt.outcome,receipt.item==='class'?'Equipped class':WEAPONS[receipt.item]?.name,receipt.reasonId));
   else shopMessage(null,game.phase!=='buy'?'The buy phase is over.':networkSession.notice||'');
   if($('shop').dataset.kit!==p.team){
     $('shop').dataset.kit=p.team;
     $('shop').replaceChildren(...[...onlinePrimaries(p.team),'armor','he'].map(id=>{
       const button=document.createElement('button');button.dataset.item=id;
       button.textContent=WEAPONS[id].name+' · '+WEAPONS[id].cost+' ¤';
       button.onclick=()=>game.buy(id);return button;
     }));
   }
   showClassOffer();return;
 }
 delete $('shop').dataset.kit;
 if(networkSession){
   const p=game.player;
   $('buy').dataset.team=p.team;
   setText('buy-note','Changes apply at your next respawn. Equipped · '+[p.inventory.primary?.id,p.inventory.pistol?.id,'knife'].filter(Boolean).map(id=>WEAPONS[id].name).join(' · ')+' · '+carriedGrenades(p.inventory)+'.');
   $('shop').replaceChildren(...onlinePrimaries(game.team).map(id=>{
     const button=document.createElement('button');button.dataset.item=id;
     button.textContent=WEAPONS[id].name+(p.loadout===id?' · SELECTED':'');
     button.onclick=()=>networkSession.matchCommand('loadout',{primary:id});
     return button;
   }));
   return;
 }
 const free=isEndless(game);
 setText('buy-note',free?'Choose your loadout for free. Your primary carries over after respawn.':`Buy phase · timer paused while the shop is open · ${TEAMS[game.team]}`);
 $('shop').replaceChildren(...Object.values(WEAPONS).filter(w=>w.cost>0).map(w=>{
   const button=document.createElement('button');
   button.dataset.item=w.id;
   const detail=w.slot==='grenade'?`Cartridge · max ${w.limit}`:w.slot==='armor'?'100 armor':`${w.magazine} / ${w.reserve} · ${w.team?TEAMS[w.team]:'Both teams'}`;
   button.innerHTML=`<strong>${w.name}</strong><em>${free?'FREE':w.cost+' ¤'}</em><small>${detail}</small>`;
   button.onclick=()=>{
     const result=game.buy(w.id),outcome=result.ok?'accepted':'denied';
     shopMessage(outcome,purchaseLabel(outcome,w.name,result.reasonId));
     refreshShop();
   };
   return button;
 }));
 showClassOffer();
}

let soloReplays=null,replayFrame=null,replayRenderer=null;
function presentReplay(next){
 const old=replayFrame;
 replayFrame=next;
 if(!next){
   if(old){
     if(replayRenderer)disposeReplayRender(replayRenderer);
     replayRenderer=null;
     $('replay-view').hidden=true;document.documentElement.classList.remove('cs-replaying');
     if(document.activeElement===$('replay-skip'))$('replay-skip').blur();
     const room=$('online-room');
     if(old.kind==='final'&&room?.dataset.phase==='results')room.scrollTop=0;
   }
   return;
 }
 if(!old){
   clearInput();audio.reset();
   if(next.kind==='final')unlockMouse();
   $('replay-view').hidden=false;
   document.documentElement.classList.add('cs-replaying');$('replay-skip').focus({preventScroll:true});
 }
 replayRenderer=renderer;
 $('replay-view').dataset.stage=next.stage;
 $('replay-view').querySelector('.replay-optic').hidden=!next.scoped||next.stage!=='replay';
 setText('replay-stage',next.kind==='final'?'FINAL ELIMINATION':next.stage==='card'?'ELIMINATED BY':'ELIMINATION REPLAY');
 setText('replay-killer',next.killer);
 const weapon=WEAPONS[next.weapon]?.name||'Elimination';
 setText('replay-detail',weapon+' · '+Math.round(next.distance)+' m · '+Math.ceil(next.remaining)+' s');
}
function skipReplay(){
 (networkSession?.replay||soloReplays?.playback)?.skip();
 presentReplay(null);
}
$('replay-skip').addEventListener('click',skipReplay);
function start(selected=team,overrides={},autoplay=false){foregroundCountdown.suspend();deployment.reset();team=rehearsalMode?'analysts':selected;setPrivateCharacterActors(rehearsalMode?['analysts-0','analysts-1']:[team+'-0']);clearInput();audio.reset();renderer.resetTransient();combatHud.reset();recoil.reset();resetAutoAim();game=new Game(world,{team,seed:Number($('seed').value)||42,config:{mobile:settings.mobile,mode:settings.mode,firefight:settings.firefight,friendlyFire:settings.friendlyFire,hostageDamage:true,wanderers:settings.wanderers,loadout:settings.loadout,...(settings.useArsenal!==false?{arsenalClass:selectedArsenal(team)}:{}),...overrides},autoplay,difficulty:overrides.difficulty||settings.difficulty});presentReplay(null);soloReplays=new SoloReplays(game);game.start(team);if(game.warmupRemaining){game.drainEvents();lastFrame=0;}for(const actor of game.actors)renderer.actorModel(actor);modal=null;lastRound=game.warmupRemaining?game.state.round:0;lastPhase=game.phase;spectateIndex=0;feed=[];yaw=game.player.yaw;pitch=game.player.pitch;for(const id of ['menu','pause','buy','match-end','scoreboard'])$(id).hidden=true;$('hud').hidden=false;setText('notification','');mobile.show(true,game.player?.alive);updateHud();return game;}
async function joinNetwork(options){
 if(!networkMode)throw Error('Open the local multiplayer lobby first.');
 presentReplay(null);soloReplays=null;
 const generation=++networkJoinGeneration;
 await networkSession?.dispose();networkSession=null;clearInput();audio.reset();renderer?.resetTransient();combatHud.reset();recoil.reset();
 const {NetworkSession}=await import('./network/session.mjs');
 if(generation!==networkJoinGeneration)throw Error('Join cancelled.');
 const session=new NetworkSession(null,{outfitId:currentOutfit().id,loadWorld:loadRoomWorld,onCombatAudio(event,serverTime){
  if(networkSession!==session || game!==session.view)return false;
  if(replayFrame||session.replay?.frame)return true;
  const view=viewActor();
  if(view && !document.hidden){
   audio.game=game;
   audio.updateListener({...view,y:view.y+view.height-.12});
   audio.handleEvent(event,serverTime);
  }
  return true;
 },onLoading:id=>{
  if(networkSession!==session)return;
  networkUi?.status(accessEnglish.loadingMap(networkMap(id).name));if(game===session.view)onlineRoomUi?.update(session);
 },onMatch:()=>{if(networkSession===session&&game===session.view)networkPhase();},onConnection:status=>{if(networkSession!==session)return;countdownSession=null;deployment.suspend();clearInput();audio.reset();renderer?.resetTransient();recoil.reset();if(status==='reconnecting')showPause();$('pause').querySelector('p:not(.eyebrow)').textContent=status==='reconnecting'?accessEnglish.reconnectingHelp:accessEnglish.reconnected;},onDisconnect:message=>{if(networkSession!==session)return;newMatch();networkUi?.status(connectionMessage(message),connectionFailure(message));}});
 networkSession=session;
 try{
  await session.connect({...options,arsenalProfile:localArsenalProfile()});
  if(session.room.state.mode==='classic')await renderer.prepareClassic();
  // The live frame can initialize these materials if the optional GPU preparation fails.
  try{await renderer.prepareSpawnFrame(session.view,session.mapAbort?.signal);}
  catch(error){console.warn('Skipped optional spawn rendering preparation.',error);}
  if(generation!==networkJoinGeneration)throw Error('Join cancelled.');
  // A host can replace the map while a guest prepares the old seat. Wait for the
  // current revision and its own actor before copying the spawn camera or showing the HUD.
  await session.waitForSpawn();
  if(generation!==networkJoinGeneration)throw Error('Join cancelled.');
 }
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
 world.networkMode=game.state.mode;world.networkClassic=game.state.mode==='classic';minimapCache.invalidate();setMapExpanded(false);
 const soloOpponents=game.state.mode==='ffa',zones=game.state.mode==='dom';
 const keyHints=document.querySelector('.key-hints');
 if(keyHints)keyHints.textContent=soloOpponents?accessEnglish.bindings.replace(' · Z radio',''):accessEnglish.bindings;
 setText('online-map-hint',soloOpponents?'M map':'M map · Z radio');
 setText('map-legend',soloOpponents?'Arrow · You':zones?'Arrow · You    Dot · Team    A/B/C · Control zones':world.networkClassic?'Arrow · You    Dot · Team    B · Bomb site    H · Hostages    R · Rescue zone':'Arrow · You    Dot · Team');
 $('minimap').setAttribute('aria-label',soloOpponents?'Tactical map showing your heading':zones?'Tactical map showing teammates and control zones':world.networkClassic?'Tactical map showing your heading, teammates, spawns and objectives':'Tactical map showing your heading, teammates and spawns');
 document.documentElement.classList.toggle('online-classic',world.networkClassic);
 const equipment=document.querySelector('[data-mobile-action=buy]');
 equipment.textContent=world.networkClassic?'BUY':'KIT';
 equipment.setAttribute('aria-label',world.networkClassic?'Open buy menu':'Select equipment');
 $('buy').querySelector('h2').textContent=world.networkClassic?'Buy equipment':'Select equipment';
}
function networkPhase(){
 if(!networkSession?.room||!game?.player)return;
 if(world.networkMode!==game.state.mode){
  applyNetworkMode();
  if(world.networkClassic){
   const session=networkSession;
   renderer.prepareClassic().catch(()=>{if(networkSession===session)session.notice='The hostage model could not load.';});
  }
 }
 const phase=networkSession.room.state.phase,active=phase==='active',warmup=phase==='countdown';
 $('hud').dataset.matchPhase=phase;
 const sameCountdown=countdownSession===networkSession && deployment.key===networkSession.room.state.matchId;
 const paused=modal==='pause';
 clearInput();audio.reset();renderer.resetTransient();combatHud.reset();recoil.reset();feed=[];
 if(!sameCountdown){yaw=game.player.yaw;pitch=game.player.pitch;}
 if(familyRoomLink||networkSession.familyAlias)document.documentElement.classList.toggle('cs-family-lobby',!active&&!warmup);
 if(warmup||active){
  onlineRoomUi?.update(networkSession);
  if(!paused){modal=null;$('pause').hidden=true;}
  if(active&&!testMode&&(!sameCountdown || paused))showPause();
  else if(!paused){game.pause(false);mobile.show(true,game.player.alive);}
  countdownSession=warmup?networkSession:null;
 }else{
  countdownSession=null;deployment.reset();game.pause(true);modal='online';mobile.show(false);unlockMouse();$('pause').hidden=true;$('buy').hidden=true;$('match-end').hidden=true;
  onlineRoomUi?.update(networkSession);
 }
}
function restartMatch(){if(networkMode){newMatch();return;}window.__csFlow?.fullscreen?.start();audio.unlock();start(team,{deploymentSeconds:testMode?0:MATCH_DEFAULTS.countdownSeconds});requestMouse();}
function newMatch(){presentReplay(null);soloReplays=null;clearNetworkOutfits();foregroundCountdown.suspend();deployment.reset();countdownSession=null;$('countdown-look').hidden=true;if(networkMode){networkJoinGeneration++;setMapExpanded(false);document.documentElement.classList.toggle('cs-family-lobby',familyRoomLink);}onlineRoomUi?.hide();if(networkSession){networkSession.dispose();networkSession=null;game=new Game(world);game.network=true;lastRound=game.state.round;lastPhase=game.phase;} window.__csFlow?.fullscreen?.exit();clearInput();recoil.reset();game.pause(true);audio.reset();renderer?.resetTransient();modal='menu';mobile.show(false);unlockMouse();for(const id of ['pause','buy','match-end','scoreboard','hud'])$(id).hidden=true;$('menu').hidden=false;settingsPanel('menu-settings');}
function viewActor(){if(game.state.mode==='ffa'||game.player?.alive||renderer?.actionVisuals?.finishingFlightFor(game.player))return game.player;const alive=game.actors.filter(a=>a.alive&&a.team===game.team);return alive[spectateIndex%Math.max(1,alive.length)]||game.player;}
function timer(value){const sec=Math.max(0,Math.ceil(value));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function scoreboard(){
 const mode=game.state.mode,individual=mode==='ffa',rankedMode=individual||mode==='dom';
 setText('board-round',rankedMode?MODE_NAMES[mode].toUpperCase():networkSession?(isEndless(game)?'TEAM DEATHMATCH · 5v5':'CLASSIC · ROUND '+game.state.round):isEndless(game)?'ENDLESS · ELIMINATIONS':'ROUND '+game.state.round);
 setText('board-help',individual?'Hold Tab · Ranked by eliminations, fewest deaths, then points':mode==='dom'?'Hold Tab · Capture and hold zones to score for your team':'Hold Tab · Hostages are listed separately from the teams');
 const key=JSON.stringify([mode,!!networkSession,game.state.score,game.actors.map(a=>[a.id,a.name,a.team,a.isPlayer,a.controllerType,a.alive,a.connected,a.kills,a.deaths,a.combat?.points??a.points,a.money])]);
 if(htmlCache.get('score-tables')===key)return;htmlCache.set('score-tables',key);
 const root=$('score-tables');root.replaceChildren();
 for(const [id,name] of (individual?[[null,'Individual standings']]:Object.entries(TEAMS))){
  const title=document.createElement('h3');title.className=id==='counterAnalysts'?'counter':'';title.textContent=name;const score=document.createElement('span');score.style.float='right';score.textContent=id?game.state.score[id]:'';title.append(score);root.append(title);
  const table=document.createElement('table');table.innerHTML=`<thead><tr><th>PLAYER</th><th>K</th><th>D</th>${rankedMode?'<th>POINTS</th>':''}${rankedMode||networkSession&&isEndless(game)?'':'<th>CREDITS</th>'}<th>STATUS</th></tr></thead>`;const body=document.createElement('tbody');
  for(const a of rankPlayers(individual?game.actors:game.actors.filter(a=>a.team===id))){const row=document.createElement('tr');row.className=(a.isPlayer?'me ':'')+(!a.alive?'dead':'');for(const value of [a.name+(a.isPlayer?(a.name==='You'?'':' · you'):a.controllerType==='human'?'':' · bot'),a.kills,a.deaths,...(rankedMode?[a.combat?.points??a.points??0]:[]),...(rankedMode||networkSession&&isEndless(game)?[]:[a.money]),networkSession&&a.connected===false?'Reconnecting':a.alive?'In play':'Eliminated']){const td=document.createElement('td');td.textContent=String(value);row.append(td);}body.append(row);}table.append(body);root.append(table);
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
   const directive=counter?'Defend the bomb':'Defuse the bomb';
   return directive+' · '+timer(bomb.deadline-state.time);
 }
 if(state.hostages.some(h=>h.alive&&!h.rescued&&h.escortId===player.id))return 'Escort to the rescue zone';
 if(bomb.carrierId===player.id)return 'You have the bomb · '+missionRoomName(world);
 if(counter&&bomb.status==='dropped')return 'Recover the bomb or rescue the hostages';
 return counter?'Plant the bomb or rescue the hostages':'Prevent the plant and the rescue';
}

function presentViewEffects() {
  const player = viewActor(), time = game.state.time;
  $('flash-overlay').style.opacity = String((player?.flash || 0) * (settings.reducedFlash ? .45 : .94));
  const hurt = Math.max(0, Math.min(1, (renderer.damageUntil - time) / .55));
  $('damage-overlay').style.opacity = String(hurt * .35);
  $('damage-direction').style.opacity = String(hurt);
  if (renderer.damageDirection) {
    const direction = renderer.damageDirection;
    const angle = (player?.yaw || 0) - Math.atan2(direction.x, direction.z);
    $('damage-direction').style.transform = `translate(-50%,-50%) rotate(${angle}rad)`;
  }
  $('smoke-overlay').style.opacity = String(player ? renderer.smokeOpacity(player, game.state.smokes) : 0);
  $('hitmarker').style.opacity = time < renderer.hitUntil ? '1' : '0';
}

function updateHud(){bonusHud.update(game, !!modal || radioOpen || teamRadioOpen || holdingDeployment() || !game?.player);if(!game?.player)return;combatHud.update(game);const s=game.state,p=game.player,view=viewActor(),wp=WEAPONS[view.weapon],item=game.item(view),time=s.phase==='buy'?s.buyDeadline-s.time:s.phase==='result'?s.resultDeadline-s.time:s.bomb.status==='planted'?s.bomb.deadline-s.time:s.deadline-s.time;setText('timer',isEndless(game)?timer(s.time):timer(time));setText('round-label',isEndless(game)?'ENDLESS ACTION ∞':`ROUND ${s.round}`);setText('difficulty-label',DIFFICULTIES[s.difficulty].name.toUpperCase());setText('phase',s.phase==='buy'?'BUY PHASE':s.bomb.status==='planted'?'BOMB PLANTED':s.phase==='result'?'ROUND OVER':isEndless(game)?'AUTO-RESPAWN':'HYBRID');for(const [side,id]of [['analysts','a'],['counterAnalysts','ca']]){setText('score-'+id,s.score[side]);setText('alive-'+id,game.actors.filter(a=>a.team===side&&a.alive).length+' alive');}setText('health',Math.max(0,Math.ceil(view.hp)));setText('armor',view.armor?`${Math.ceil(view.armor)} armor`:'');setText('money',isEndless(game)?'B · LOADOUT':`${p.money} ¤`);setText('weapon-name',wp?.name||'EQUIPMENT');const ammo=wp?.slot==='grenade'?`${view.inventory[view.weapon]} <span>cartridge</span>`:wp?.slot==='bomb'?'BOMB':wp?.slot==='knife'?'KNIFE':`${item?.ammo??0} <span>/ ${item?.reserve??0}</span>`;if($('ammo').innerHTML!==ammo)$('ammo').innerHTML=ammo;const lowAmmoHint=isLowAmmo(wp,item) ? (item.reserve>0 ? (mobile.enabled?'RELOAD':'R · RELOAD') : 'NO RESERVE') : '';
 setText('reload-text',view.reloadUntil>s.time?`Reloading · ${(view.reloadUntil-s.time).toFixed(1)} s`:s.phase==='buy'?'B · OPEN SHOP':lowAmmoHint);setText('location',roomDisplayName(world.roomAt?.(view.x,view.z)));
 const onlineClassic=!!networkSession&&s.mode==='classic';
 const b=s.bomb,rescued=s.hostages.filter(h=>h.rescued).length;
 $('bomb-status').classList.toggle('hot',b.status==='planted');
 if(onlineClassic){
   $('objectives').hidden=!p.alive||!['buy','active'].includes(s.phase);
   setText('bomb-status',classicObjective(s,p));
   setText('hostage-status','Hostages '+rescued+'/'+s.hostages.length);
 }else{
   const bombStatus=b.status==='planted'?`BOMB · ${timer(b.deadline-s.time)}`:b.carrierId===p.id?'YOU HAVE THE BOMB · 5':b.status==='dropped'?'BOMB DROPPED':`BOMB · ${game.actors.find(a=>a.id===b.carrierId)?.name||'—'}`;
   setText('bomb-status',isEndless(game)?`FRIENDLY FIRE ${game.config.friendlyFire?'ON':'OFF'} · Z RADIO`:bombStatus);
   setText('hostage-status',isEndless(game)?'Free play · leave at any time':`HOSTAGES ${rescued}/2 · ${s.hostages.filter(h=>h.alive===false).length} dead`);
 }
 const prompt=p.alive&&s.phase==='active'?game.prompt(p):'';$('prompt').hidden=!prompt;setText('prompt-text',prompt);const action=p.action;const progress=action?Math.max(0,Math.min(1,(s.time-action.start)/(action.duration||1))):0;$('action-progress').style.width=`${progress*100}%`;$('prompt').querySelector('.progress').hidden=!action;
 mobile.show(!modal&&game.phase!=='menu'&&game.phase!=='match',p.alive);$('crosshair').classList.toggle('auto-target',!!autoFireTarget&&mobile.enabled&&settings.mobileAutoFire);
 const inventory=p.inventory;const slots=[['1',inventory.primary?.id],['2',inventory.pistol?.id],['3','knife'],['4',['smoke','flash','he'].filter(k=>inventory[k]>0).join('/')],['5',b.carrierId===p.id?'bomb':null]];setHtml('weapon-slots',slots.map(([num,id])=>`<span class="${id===p.weapon||(num==='4'&&['smoke','flash','he'].includes(p.weapon))?'selected':''}"><b>${num}</b>${id?(WEAPONS[id]?.name?.replace(' Analyst','').replace(' Counter','')||'Grenades'):'—'}</span>`).join(''));
 $('spawn-protection').hidden=!p.alive||!(p.spawnProtectedUntil>s.time);if(networkSession)updateTeamRadio();else if(s.time>radioUntil)$('radio-caption').textContent='';$('spectate').hidden=p.alive;$('death-restart').hidden=!!networkSession||isEndless(game);setText('respawn-status',isEndless(game)?`RESPAWN IN ${Math.max(0,(p.respawnAt||s.time)-s.time).toFixed(1)} s · Esc to pause`:'← → Switch teammate · The next round starts automatically');if(!p.alive){$('spectate').querySelector('span').textContent=`SPECTATING ${view.name}`;const c=p.deathCause;setText('death-cause',c?`${c.sourceName||'Explosion'} · ${WEAPONS[c.weapon]?.name||c.weapon||'Damage'}`:'You were eliminated.');}$('round-result').hidden=s.phase!=='result';if(s.phase==='result'){$('result-title').dataset.winner=s.result.winner||'';setText('result-title',s.result.winner?`${TEAMS[s.result.winner]} win`:'Round draw');setText('result-reason',roundReasons[s.result.reason]||s.result.reason);}
 if(!networkSession&&s.phase==='match'&&modal!=='match'&&modal!=='menu'){modal='match';clearInput();unlockMouse();$('match-end').hidden=false;const winner=s.result?.winner||(s.score.analysts===s.score.counterAnalysts?null:s.score.analysts>s.score.counterAnalysts?'analysts':'counterAnalysts');
 $('match-winner').dataset.winner=winner||'';const victor=matchWinnerName(winner,game.actors,TEAMS);setText('match-winner',victor?victor+(s.mode==='ffa'?' wins':' win'):'Match draw');setText('match-score',s.mode==='ffa'?rankPlayers(game.actors)[0]?.kills+' eliminations':s.mode==='dom'?s.score.analysts+' – '+s.score.counterAnalysts+' points':s.score.analysts+' – '+s.score.counterAnalysts+' · '+s.round+' rounds');}
 if(onlineClassic){
   onlineRoomUi?.update(networkSession);setText('round-label','CLASSIC · ROUND '+s.round+' · '+s.score.analysts+'–'+s.score.counterAnalysts);
   if(p.pending)setText('respawn-status','Connected · you will play next round');
   if(modal==='buy')refreshShop();
 }
 if(notificationUntil<s.time)setText('notification','');feed=feed.filter(f=>f.until>s.time);updateKillfeed(); if(networkSession&&game.state.mode!=='classic'){if(modal==='buy'&&$('shop').dataset.selected!==p.loadout){$('shop').dataset.selected=p.loadout;refreshShop();}onlineRoomUi?.update(networkSession);setText('timer',timer(holdingDeployment()?networkSession.room.state.durationSeconds:networkSession.room.state.remainingSeconds));setText('round-label','TEAM DEATHMATCH · '+networkSession.room.state.scoreTarget+' KILLS');setText('phase',networkSession.status||'CONNECTING');setText('money','B · EQUIPMENT');setText('bomb-status',p.inventory.he||p.inventory.smoke||p.inventory.flash?'4 · '+carriedGrenades(p.inventory)+' · Fire to throw':'No grenades');setText('hostage-status','The match continues in menus · Esc or Pause to leave');setText('respawn-status',`RESPAWN ${Math.max(0,(p.respawnAt||s.time)-s.time).toFixed(1)} s`);}
 const individual=s.mode==='ffa',domination=s.mode==='dom';
 document.documentElement.classList.toggle('cs-ffa',individual);
 setText('score-name-a',individual?'YOU':'ANALYSTS');setText('score-name-ca',individual?'LEADER':'COUNTER ANALYSTS');
 const zones=$('zone-control');zones.hidden=!domination||!!modal||s.phase!=='active'||!p.alive;
 if(!zones.hidden){
   $('objectives').hidden=true;
   const labels=(s.zones||[]).map(z=>[z.id,zoneCaption(z,p.team),Math.min(100,Math.round(Math.abs(z.progress)*100))]);
   const key=JSON.stringify(labels);
   if(zones.dataset.state!==key){
     zones.dataset.state=key;
     zones.replaceChildren(...labels.map(([id,status,percent])=>{
       const tile=document.createElement('span'),name=document.createElement('b');
       tile.dataset.status=status;name.textContent=id;
       tile.append(name,document.createTextNode(status==='Capturing'?status+' '+percent+'%':status));return tile;
     }));
   }
 }
 if(individual||domination){
   const target=networkSession?.room?.state.scoreTarget||s.scoreTarget;
   setText('round-label',MODE_NAMES[s.mode].toUpperCase()+(target?' · '+target+(individual?' KILLS':' POINTS'):''));
   if(!networkSession)setText('timer',timer(s.deadline-s.time));
   setText('bomb-status',individual?'Every other operator is an opponent':'Capture and hold A, B and C');
   setText('hostage-status','');
   if(individual){
     const leader=leadingPlayer(game.actors);
     setText('score-a',p.kills);setText('score-ca',leader?.kills||0);
     setText('alive-a',p.name);setText('alive-ca',leader?.name||'');
     if(!p.alive)$('spectate').querySelector('span').textContent='Awaiting respawn';
   }
 }
 if(holdingDeployment()){setText('phase','DEPLOYING');setText('reload-text','');$('prompt').hidden=true;$('spawn-protection').hidden=true;}
 if(board)scoreboard();minimap();setText('perf',`${renderer.stats.fps} FPS`);focusHud.update();
}
function input(dt=1/60){
 if(replayFrame)return {};
 if(modal||teamRadioOpen||!game.player?.alive){if(!modal)gamepad.clear();firePress=null;crouchPress=false;resetAutoAim();return {};}
 yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*1.7*dt;
 const touch=mobile.enabled?mobile.input():null,pad=gamepad.read();
 if(pad?.pause){showPause();return {};}
 const holding=holdingDeployment();
 tactical.padAim=!holding && !!pad?.aim;
 if(pad){
   const scale=3.4*dt*(holding?1:tactical.lookScale(false,yaw,pitch)),before=pitch;
   yaw-=pad.lookX*scale;pitch=Math.max(-1.49,Math.min(1.49,pitch-pad.lookY*scale*(settings.invertLookY?-1:1)));recoil.counter(pitch-before);
 }
 if(holding){firePress=null;crouchPress=false;return {yaw,pitch};}
 if(pad){
   const bonusIndex = bonusHud.pad.findIndex(button => pad.pressedEdges & (1 << button));
   if (bonusIndex >= 0) requestBonus(bonusIndex+1);
   if(pad.reload)game.reload();
   if(pad.swap)tactical.cycleWeapon();
   if(pad.cartridge)game.select('4');
   if(pad.inspect)renderer.requestInspect(game);
   if(pad.firePress)recordFirePress();
 }

 const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 const x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
 let autoFire=false;autoFireTarget=null;
 if(mobile.enabled&&settings.mobileAutoFire&&!(settings.touchQuickShot&&game.player.weapon==='sniper')&&!focusHud?.expanded&&!fire&&!touch?.fire&&!pad?.fire&&game.phase==='active'){
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
function consumeEvents(){audio.game=game;const events=game.drainEvents();
 if(!networkSession)soloReplays?.capture(events);
 const active=networkSession?networkSession.replay.update(networkSession.replayScope()):soloReplays?.update();
 presentReplay(active||null);
 presentReplayAudio(audio,active);
 if(!replayFrame)combatHud.events(events,game);
 for(const event of events)if(event.type==='reward'&&!replayFrame){
   const label={assist:'Assist',headshot:'Headshot',kill:'Elimination'}[event.kind];
   if(label)notify(label+' · +'+event.xp+' XP',2);
 }
 for(const event of events) {
   if (event.type === 'immune' && [event.actorId,event.sourceId].includes(game.player?.id)) {
     notify(event.actorId === game.player.id ? 'Immortal · hit blocked' : 'Opponent is Immortal',1);
   }
 }
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
if(game.phase!==lastPhase){if(['result','match'].includes(game.phase)){audio.reset();}lastPhase=game.phase;}if(game.state.round!==lastRound){lastRound=game.state.round;audio.reset();renderer.resetTransient();recoil.reset();yaw=game.player.yaw;pitch=game.player.pitch;clearInput();}for(const event of events){if(event.type==='respawn'&&event.actorId===game.player.id){clearInput();recoil.reset();yaw=game.player.yaw;pitch=0;renderer.lastWeapon='';}if(event.type==='radio'&&!event.teamPrivate){setText('radio-caption',`RADIO · ${event.text}`);radioUntil=game.state.time+3.4;radioOpen=false;$('radio-menu').hidden=true;}if(event.type==='kill'){if(event.actorId===game.player.id){fire=false;radioOpen=false;$('radio-menu').hidden=true;if(game.state.mode==='classic')unlockMouse();}const killer=game.actors.find(a=>a.id===event.sourceId),victim=game.actors.find(a=>a.id===event.actorId);feed.push({text:`${killer?.name||event.sourceName||'—'}  ▸  ${victim?.name||event.targetName||'—'}`,until:game.state.time+5});}if(event.type==='planted')notify('Bomb planted in '+missionRoomName(world)+'.',4);if(event.type==='rescued')notify('A hostage reached the rescue zone.',3);}const effectEvents=['result','match'].includes(game.phase)?events.filter(e=>['result','match','kill','rocket-launch','rocket-explosion'].includes(e.type)):events;renderer.events(events,game);const view=viewActor();if(view&&!replayFrame)audio.handle(networkSession?effectEvents.filter(e=>!e.audioPresented):effectEvents,{...view,y:view.y+view.height-.12,ambient:['buy','active'].includes(game.phase)&&!game.state.paused,floorAudioReady:!modal&&$('cs-loading').hidden},game.state.time);return events;}
window.addEventListener('pointerdown',()=>{gamepad.active=false;},{capture:true});
window.addEventListener('keydown',e=>{if(e.isTrusted)gamepad.active=false;},{capture:true});
function pollMenuController(){
 if(replayFrame){pollControllerMenu('replay-view',skipReplay);return;}
 if(!modal)return;
 const panel=({pause:'pause',buy:'buy',online:'online-room',match:'match-end'})[modal]||'menu';
 pollControllerMenu(panel,modal==='menu'?undefined:()=>{
   if(modal==='pause')resume();
   if(modal==='buy')closeBuy();
 });
}
function loadingControllerFrame(){
 pollMenuController();
 raf=requestAnimationFrame(loadingControllerFrame);
}
function frame(now){try{
 pollMenuController();
 if(networkMode&&(!renderer||!grenadeAssist||networkSession&&(!networkSession.view.player||networkSession.worldRevision!==networkSession.room?.state.worldRevision||game!==networkSession.view))){
  presentReplay(null);lastFrame=now;raf=requestAnimationFrame(frame);return;
 }
 // The empty lobby has a fixed camera and simulation time. Retain its
 // pixels until a new lobby, viewport or graphics setting needs a redraw.
 const stillLobby=modal==='menu'&&game.phase==='menu';
 const stillRevision=stillLobby?`${innerWidth}:${innerHeight}:${devicePixelRatio}:${settings.graphics}`:null;
 if(!renderBudget.shouldRender(now,document.hidden,(!replayFrame&&!networkSession?.replay?.frame)&&(!!modal||game.state.paused),stillLobby?game:null,stillRevision)){lastFrame=now;raf=requestAnimationFrame(frame);return;}const dt=lastFrame?Math.max(0,Math.min(.05,(now-lastFrame)/1000)):1/60;lastFrame=now;
 tactical.update(dt);
 if(!modal&&game.player?.alive&&game.phase==='active'&&!game.state.paused){
   if(recoil.weapon&&recoil.weapon!==game.player.weapon)recoil.reset();
   pitch=Math.max(-1.49,Math.min(1.49,pitch-recoil.recover(dt,game.state.time)));
 }
 if(networkSession)networkSession.advanceFrame(now,(testMode&&globalThis.__fps?.liveControls)||input(dt));
 else if(!testMode||new URLSearchParams(location.search).has('realtime')){
  const holding=holdingDeployment();
  game.update(holding?foregroundCountdown.advance(now):dt,(testMode&&globalThis.__fps?.liveControls)||input(dt));
  if(holding&&!holdingDeployment())clearInput();
 }
 consumeEvents();
 const renderDt=presentationPacer.sample(now,settings.powerSaving&&!modal,dt);
 if(renderDt!==null){
   renderer.adaptiveResolution.enabled=settings.dynamicResolution;
   renderer.adaptiveResolution.targetMs=settings.powerSaving?1000/30:1000/60;
   if(renderer.visualDepth)renderer.visualDepth.enabled=settings.ambientOcclusion;
   if(replayFrame?.stage==='replay')drawReplay(renderer,replayFrame);
   else if(!replayFrame){
     tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),renderDt);presentViewEffects();
   }
 }
 if(now-hudAt>100){updateHud();hudAt=now;}
 // Present the cue only after the first-person scene has actually been drawn.
 // On a cold GPU the first shader compilation can block for several seconds.
 const presentedAt=performance.now();
 if(renderDt!==null && !networkSession && !modal && !document.hidden && holdingDeployment())foregroundCountdown.presented(presentedAt);
 showDeployment(presentedAt);
 raf=requestAnimationFrame(frame);}catch(e){fatal(e);}}
function fatal(error){claimControllerForGame();cancelAnimationFrame(raf);raf=requestAnimationFrame(loadingControllerFrame);grenadeAssist?.reset();$('fatal').hidden=false;$('fatal').querySelector('pre').textContent=error.stack||String(error);$('loading').hidden=true;console.error(error);}
team = document.querySelector('.team-option.selected').dataset.team;
for (const option of document.querySelectorAll('[data-team]')) option.addEventListener('click', () => { team = option.dataset.team; });
function launchMatch(event){
 if(networkMode || modal!=='menu' || !audio || !$('loading').hidden || characterSelectionFailed || !$('fatal').hidden)return;
 mobile.attemptLandscape();
 start(document.querySelector('.team-option.selected').dataset.team,{deploymentSeconds:testMode?0:MATCH_DEFAULTS.countdownSeconds});
 if(!mobile.enabled && !gamepad.active && navigator.userActivation && !navigator.userActivation.isActive && !event?.detail?.fullscreenRequested){
   showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Match ready. Select Resume to begin.';
   $('resume').focus();return;
 }
 audio.unlock();requestMouse();
}
$('start').addEventListener('cs-start-match',launchMatch);
$('start').addEventListener('cs-deploy-gesture',()=>audio?.unlock());
$('mobile-controls').addEventListener('pointerdown',()=>{
 if(holdingDeployment() && audio?.volume>0 && audio.context?.state!=='running')audio.unlock();
},{capture:true});
document.addEventListener('webglcontextrestored',()=>renderBudget.invalidate(),true);
$('countdown-look').onclick=()=>{if(modal)return;audio.unlock();requestMouse();};
$('death-restart').onclick=restartMatch;$('resume').onclick=resume;$('restart').onclick=newMatch;$('new-match').onclick=newMatch;$('close-buy').onclick=closeBuy;$('return-buy').onclick=closeBuy;
$('fullscreen-toggle').onclick=()=>{window.__csFlow?.fullscreen?.toggle();syncFullscreenToggle();};
document.addEventListener('fullscreenchange',()=>{syncFullscreenToggle();if(mobile.enabled&&document.fullscreenElement)mobile.attemptLandscape();window.dispatchEvent(new Event('resize'));});syncFullscreenToggle();
window.addEventListener('keydown',e=>{
 if(replayFrame){
   if(['Escape','Space','Enter'].includes(e.code)&&!e.repeat)skipReplay();
   if(e.code!=='Tab')e.preventDefault();
   return;
 }
 if(!holdingDeployment()&&teamRadioKey(e))return;if(!modal&&['Tab','Space','Escape','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(radioOpen){radioOpen=false;$('radio-menu').hidden=true;return;}if(modal==='buy')closeBuy();else if(!modal)showPause();return;}if(modal)return;if(holdingDeployment()){if(['ArrowLeft','ArrowRight'].includes(e.code)){e.preventDefault();keys.add(e.code);if((e.code==='ControlLeft'||e.code==='ControlRight')&&game.player?.alive)crouchPress=true;}return;}if(!networkMode&&game.state.mode!=='ffa'&&e.code==='KeyZ'&&game.player?.alive){radioOpen=!radioOpen;$('radio-menu').hidden=!radioOpen;return;}if(radioOpen&&/^Digit[1-6]$/.test(e.code)){const result=game.radio(RADIO[Number(e.code.slice(-1))-1]?.id);if(!result)notify('Radio busy. Try again shortly.');return;}if(!networkMode&&e.code==='Enter'&&!game.player?.alive&&!isEndless(game)){restartMatch();return;}if(e.code==='Tab'){board=true;$('scoreboard').hidden=false;scoreboard();return;}if(e.repeat)return;const bonusIndex=bonusHud.keys.indexOf(e.code);if(bonusIndex>=0){requestBonus(bonusIndex+1);return;}keys.add(e.code);if((e.code==='ControlLeft'||e.code==='ControlRight')&&game.player?.alive)crouchPress=true;if(e.code==='KeyB'){showBuy();return;}if(e.code==='KeyR')game.reload();if(e.code==='KeyQ')game.select('last');if(e.code==='KeyG')game.drop();if(/^Digit[1-5]$/.test(e.code))game.select(e.code.slice(-1));if(e.code==='KeyM'){toggleMap();return;}if(!game.player.alive&&['ArrowLeft','ArrowRight'].includes(e.code)){const count=game.actors.filter(a=>a.alive&&a.team===game.team).length;spectateIndex=(spectateIndex+(e.code==='ArrowLeft'?-1:1)+count)%Math.max(1,count);}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'){board=false;$('scoreboard').hidden=true;}});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game')||modal||teamRadioOpen||!game.player?.alive)return;const k=settings.sensitivity*tactical.lookScale(false,yaw,pitch);yaw-=e.movementX*k;const before=pitch;pitch=Math.max(-1.49,Math.min(1.49,pitch-e.movementY*k*(settings.invertLookY?-1:1)));recoil.counter(pitch-before);});
document.addEventListener('mousedown',e=>{if(replayFrame&&e.button===0&&document.pointerLockElement===$('game')){skipReplay();e.preventDefault();return;}if(e.target!==$('game')||e.button!==0||modal||teamRadioOpen)return;if(document.pointerLockElement!==$('game')){resume();return;}if(holdingDeployment())return;if(!fire)recordFirePress();fire=true;});window.addEventListener('mouseup',e=>{if(e.button===0)fire=false;});window.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockerror',()=>{if(!mobile.enabled&&!modal){showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Mouse capture failed. Open the game in its own tab and select Resume again.';}});
window.addEventListener('offline',()=>networkSession?.interruptConnection());
document.addEventListener('pointerlockchange',()=>{if(mobile.enabled)return;if(document.pointerLockElement=== $('game')&&modal){unlockMouse();return;}if(document.pointerLockElement!==$('game')){clearInput();if(!modal&&game.player?.alive)showPause();}});window.addEventListener('blur',()=>{deployment.suspend();clearInput();if(!modal)showPause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){deployment.suspend();clearInput();if(!modal)showPause();}});

function updateMode(){
 settings.mode=$('game-mode').value;
 $('loadout-row').hidden=settings.mode==='classic';
 $('mode-description').textContent=MODE_GUIDES[settings.mode]||MODE_GUIDES.classic;
 saveSettings();
}
// A viewport rotation can cover the game with the portrait prompt without blur.
// Freeze combat/audio and require an explicit resume after either orientation change.
function interruptOrientation(){
 if (!mobile.enabled)return;
 if (game && !modal)showPause();
 else mobile.clear();
}
window.addEventListener('orientationchange',interruptOrientation);
screen.orientation?.addEventListener?.('change',interruptOrientation);
matchMedia('(orientation: portrait)').addEventListener('change',interruptOrientation);
function syncClassLoadout(){
 const select=$('loadout'),kit=selectedArsenal(team);
 let option=select.querySelector('option[value="class"]');
 if(!kit){option?.remove();select.value=settings.loadout||'smg';return;}
 if(!option){option=new Option('','class');select.add(option);}
 option.textContent='Class · '+kit.name;option.dataset.primary=kit.primary.id;
 select.value=settings.useArsenal!==false?'class':settings.loadout;
}
$('game-mode').value=['classic','endless','ffa','dom'].includes(settings.mode)?settings.mode:'classic';
$('game-mode').onchange=updateMode;syncClassLoadout();
$('loadout').onchange=()=>{
 settings.useArsenal=$('loadout').value==='class';
 if(!settings.useArsenal)settings.loadout=$('loadout').value;
 saveSettings();
};
$('menu').addEventListener('cs-class-equipped',()=>{settings.useArsenal=true;syncClassLoadout();saveSettings();});
$('menu').addEventListener('cs-team-selected',syncClassLoadout);
$('menu').addEventListener('cs-class-identity',syncClassLoadout);
const arsenalAccountReady=refreshArsenalAccount().then(syncClassLoadout);
$('radio-options').innerHTML=RADIO.map((r,i)=>`<div><kbd>${i+1}</kbd><span>${r.text}<small>${r.label}</small></span></div>`).join('');updateMode();

const characterQuery=new URLSearchParams(location.search);
if(!window.__csFlow && !rehearsalMode && characterQuery.get('team')==='counterAnalysts')team='counterAnalysts';
if(characterQuery.has('seed'))$('seed').value=String(Math.min(999999,Math.max(1,Number(characterQuery.get('seed'))||42)));
installLobbyController();
try{
 loadingStage('level');
 audio=new AudioSystem(null,settings);
 await preparePrivateCharacter();
 if(networkMode){
  game=new Game(null);game.network=true;
  const {networkMenu}=await import('./network/menu.mjs');
  networkUi=networkMenu(joinNetwork,()=>audio.unlock(),internetMode,newMatch);
 }else{
  const levelProject=await selectedLevel();loadingStage('renderer');world=createWorld({levelProject});nameWorld();
  if(levelProject){
   document.title=GAME_NAME+' · '+$('loading').dataset.mapName;
   document.querySelector('.intro .eyebrow').textContent=(new URLSearchParams(location.search).get('level')==='preview'?'PRIVATE PREVIEW / ':'PUBLISHED MAP / ')+$('loading').dataset.mapName;
   document.querySelector('.intro .lead').textContent='Five-a-side match on this map.';
  }
  game=new Game(world);renderer=new Renderer($('game'),world,settings);audio.world=world;
  loadingStage('assets');
  await Promise.all([renderer.assetsReady,audio.prepareFloorAudio()]);grenadeAssist=new GrenadeAssist(renderer,settings);
 }
 await arsenalAccountReady;
 loadingStage('ready');$('loading').hidden=true;$('start').disabled=characterSelectionFailed||networkMode;
 claimControllerForGame();raf=requestAnimationFrame(frame);if(testMode){globalThis.__fps={stopFrameLoop(){cancelAnimationFrame(raf);raf=0;},get game(){return game;},get network(){return networkSession;},joinNetwork,get world(){return world;},get renderer(){return renderer;},audio,settings,start(selected,config={},autoplay=false){start(selected,config,autoplay);return this.snapshot();},step(controls=null,dt=1/60){tactical.update(dt);game.update(dt,controls??input(dt));yaw=game.player.yaw;pitch=game.player.pitch;consumeEvents();tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),dt);presentViewEffects();updateHud();return this.snapshot();},snapshot(){return JSON.parse(JSON.stringify({...game.state,player:game.player,actors:game.actors.map(({bot,...rest})=>rest),hostages:game.hostages},(k,v)=>k==='bot'?undefined:v));},render(){tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),1/60);updateHud();},pause(value){game.pause(value);},input,showBuy,newMatch,get modal(){return modal;},mobile,recoil,tactical,get grenadeAssist(){return grenadeAssist;},focusHud,renderBudget,minimapCache};}}
catch(error){fatal(error);}

window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(raf);networkJoinGeneration++;networkSession?.dispose();grenadeAssist?.dispose();audio?.dispose();renderer?.dispose();}});
