import {GAME_NAME,COMPLEX_NAME,roomDisplayName,missionRoomName} from './player-names.mjs';
import {setupCharacterMenu} from './character-selection.mjs';
import {loadPrivateCharacter,characterHash} from './private-character-store.mjs';
import {loadCharacterLibrary,installPrivateCharacter,setPrivateCharacterActors} from './character-library.mjs?v=6.1.2';
import {GLTFLoader} from '../../vendor/three/addons/loaders/GLTFLoader.js';
import { RenderBudget } from './render-budget.mjs';
import { MinimapCache } from './minimap-cache.mjs';
import { FocusHud, focusHudSettings } from './focus-hud.mjs';
import { GrenadeAssist, grenadeSettingsMarkup } from './grenade-assist.mjs';
import {CombatHUD} from './combat-hud.mjs';
import { createWorld } from './world.mjs?v=5.9.0';
import { Game, TEAMS, WEAPONS, CONFIG, DIFFICULTIES } from './game.mjs';
import { Renderer } from './render.mjs?v=floor5-environment-1';
import { AudioSystem } from './riposte-audio.mjs';
import {RADIO,isEndless} from './action-rules.mjs';
import { MobileControls, isTouchDevice } from './mobile-controls.mjs';
import { PlayerRecoil } from './riposte-recoil.mjs';
import { TacticalControls } from './tactical-controls.mjs';
import {parseProject} from '../../furniture-editor/build/level-project.mjs?v=5.9.0';

const $=id=>document.getElementById(id),testMode=new URLSearchParams(location.search).has('test');
const touchDevice=isTouchDevice();
const renderBudget=new RenderBudget();
const minimapCache=new MinimapCache($('minimap'));
const minimapPanel=$('minimap').closest('.map-panel');
const settings={grenadeGuide:true,grenadeWarning:true,mobileAutoFire:true,sensitivity:.0022,volume:.55,reducedMotion:false,reducedFlash:true,difficulty:'casual',graphics:'standard',blood:'standard',mode:'classic',firefight:true,combatSounds:true,friendlyFire:true,wanderers:true,radioVoice:true,loadout:'smg'};
let storedSettings={};
try{storedSettings=JSON.parse(localStorage.getItem('cartridge-settings')||'{}')||{};Object.assign(settings,storedSettings);}catch{}
if(touchDevice&&!Object.hasOwn(storedSettings,'graphics'))settings.graphics='low';
settings.mobile=touchDevice;
for(const [key,allowed] of Object.entries({difficulty:['casual','normal','hard'],graphics:['standard','low'],blood:['off','reduced','standard']}))if(!allowed.includes(settings[key]))settings[key]=allowed[key].includes('casual')?'casual':'standard';
let world,game,renderer,audio,team='analysts',yaw=0,pitch=0,modal='menu',keys=new Set(),fire=false,board=false,mapExpanded=false,spectateIndex=0,notificationUntil=0,feed=[],lastRound=0,lastPhase='menu',lastFrame=0,hudAt=0,raf=0;
let radioOpen=false,radioUntil=0;
const recoil=new PlayerRecoil();
let autoTargetId=null,autoTargetSince=0,autoFireTarget=null;
const resetAutoAim=()=>{autoTargetId=null;autoTargetSince=0;autoFireTarget=null;};
let tactical=null,grenadeAssist=null,focusHud=null;
let privateCharacterDraft=null,characterMenu=null,characterSelectionFailed=false;
const rehearsalMode=new URLSearchParams(location.search).has('character');
async function preparePrivateCharacter(){
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
 const response=await fetch('../'+entry.file);if(!response.ok)throw Error('Nivåfilen saknas.');
 const body=await response.text();return parseProject(body);
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
const mobile=new MobileControls({
  root:$('mobile-controls'),
  onLook(dx,dy){if(modal||!game?.player?.alive)return;const k=settings.sensitivity*2.15*(tactical?.lookScale(true,yaw,pitch)??1);const before=pitch;yaw-=dx*k;pitch=Math.max(-1.49,Math.min(1.49,pitch-dy*k));recoil.counter(pitch-before);},
  onAction(action){
    if(!game)return;
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
tactical=new TacticalControls({settings,mobile,getGame:()=>game,getModal:()=>modal,
  isInteracting:()=>keys.has('KeyE')||mobile.state.interact,onAimChange:resetAutoAim});
const combatHud=new CombatHUD(settings);
focusHud=new FocusHud({settings,mobile,getGame:()=>game,getModal:()=>modal,onMap:toggleMap,onStats:showPause});
function toggleMap(){
 mapExpanded=!mapExpanded;
 document.documentElement.classList.toggle('hud-map-open',mapExpanded);
 $('minimap').width=mapExpanded?448:224;$('minimap').height=mapExpanded?316:158;
 if(game?.player)minimap();
}
const reasonNames={detonation:'Uppdragsbomben detonerade.',defuse:'Bomben har desarmerats.',rescue:'Båda gisslan har nått räddningszonen.',elimination:'Motståndarlaget är utslaget.',timeout:'Tiden tog slut. Analysts höll uppdragen.',draw:'Båda lagen slogs ut samtidigt.'};
const htmlCache=new Map();
const setHtml=(id,value)=>{if(htmlCache.get(id)!==value){$(id).innerHTML=value;htmlCache.set(id,value);}};
const setText=(id,value)=>{if($(id).textContent!==String(value))$(id).textContent=value;};
function saveSettings(){focusHud?.applyMode();try{localStorage.setItem('cartridge-settings',JSON.stringify(settings));}catch{}audio?.setVolume(settings.volume);}
function difficultyText(){const active=game?.state.difficulty||settings.difficulty,pending=game?.state.pendingDifficulty;return modal!=='menu'&&game?.phase!=='menu'&&game?.player?`Aktivt: ${DIFFICULTIES[active].name}${pending?` · ${DIFFICULTIES[pending].name} från nästa runda`:''}`:DIFFICULTIES[settings.difficulty].description;}
function settingsPanel(target){const select=(key,values)=>`<select aria-label="${key==='difficulty'?'Svårighetsgrad':key==='graphics'?'Grafik':'Blod'}" data-setting="${key}">${values.map(([value,label])=>`<option value="${value}" ${settings[key]===value?'selected':''}>${label}</option>`).join('')}</select>`;
$(target).innerHTML=`<label class="setting">Svårighetsgrad ${select('difficulty',[['casual','Casual · rekommenderat'],['normal','Normal'],['hard','Hard']])}</label><p class="setting-note" data-difficulty-note>${difficultyText()}</p><label class="setting">Grafik ${select('graphics',[['standard','Standard'],['low','Låg · upplösning och skuggor']])}</label><label class="setting">Blod ${select('blood',[['standard','Mer blod'],['reduced','Reducerat'],['off','Av']])}</label><label class="setting">Muskänslighet <input aria-label="Muskänslighet" data-setting="sensitivity" type="range" min="0.0006" max="0.006" step="0.0001" value="${settings.sensitivity}"></label><label class="setting">Ljudvolym <input aria-label="Ljudvolym" data-setting="volume" type="range" min="0" max="1" step="0.05" value="${settings.volume}"></label><label class="setting">Kontrollområden i Endless <input aria-label="Kontrollområden i Endless" data-setting="firefight" type="checkbox" ${settings.firefight?'checked':''}></label><p class="setting-note">Samlar striden runt ett område som flyttar varje minut. Gäller nästa match. Av = fri Endless.</p><label class="setting">Träff- och killbekräftelse <input data-setting="combatSounds" type="checkbox" ${settings.combatSounds?'checked':''}></label><label class="setting">Friendly fire <input data-setting="friendlyFire" type="checkbox" ${settings.friendlyFire?'checked':''}></label><label class="setting">Kringvandrande fantasidvärgar <input data-setting="wanderers" type="checkbox" ${settings.wanderers?'checked':''}></label><label class="setting">Radiorepliker <input data-setting="radioVoice" type="checkbox" ${settings.radioVoice?'checked':''}></label><label class="setting">Reducerad gånggung <input data-setting="reducedMotion" type="checkbox" ${settings.reducedMotion?'checked':''}></label><label class="setting">Mjukare flash <input data-setting="reducedFlash" type="checkbox" ${settings.reducedFlash?'checked':''}></label>${mobile.enabled?`<label class="setting">Automatisk eld på mobil <input aria-label="Automatisk eld på mobil" data-setting="mobileAutoFire" type="checkbox" ${settings.mobileAutoFire?'checked':''}></label><p class="setting-note">Skjuter när siktet ligger på en synlig fiende. Av = manuell ELD-knapp.</p>`:''}`;
$(target).insertAdjacentHTML('beforeend',tactical.settingsMarkup()+grenadeSettingsMarkup(settings)+focusHudSettings(settings));
$(target).querySelectorAll('[data-setting]').forEach(input=>input.oninput=()=>{settings[input.dataset.setting]=input.tagName==='SELECT'?input.value:input.type==='checkbox'?input.checked:Number(input.value);if(input.dataset.setting==='difficulty')game?.setDifficulty(settings.difficulty);if(input.dataset.setting==='mobileAutoFire'){mobile.setAutoFire(settings.mobileAutoFire);resetAutoAim();}if(game&&['friendlyFire','wanderers'].includes(input.dataset.setting))game.config[input.dataset.setting]=settings[input.dataset.setting];saveSettings();document.querySelectorAll('[data-difficulty-note]').forEach(n=>n.textContent=difficultyText());});}
settingsPanel('menu-settings');settingsPanel('pause-settings');
function clearInput(){keys.clear();fire=false;mobile.clear();tactical?.reset();grenadeAssist?.reset();focusHud?.reset();resetAutoAim();radioOpen=false;if($('radio-menu'))$('radio-menu').hidden=true;if(game?.player){game.player.fireHeld=false;game.player.interactHeld=false;game.player.action=null;}}
function unlockMouse(){if(document.pointerLockElement)document.exitPointerLock();}
function requestMouse(){if(mobile.enabled)return;try{const result=$('game').requestPointerLock();result?.catch(()=>{showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Muslås kunde inte aktiveras. Öppna spelet i en separat webbläsarflik på datorn.';});}catch{showPause();}}
function notify(text,duration=3){setText('notification',text);notificationUntil=(game?.state.time||0)+duration;}
function showPause(){if(!game||['menu','match'].includes(game.phase)||modal==='menu')return;modal='pause';mobile.show(false);$('pause').querySelector('p:not(.eyebrow)').textContent='Alla rundtimers och botar väntar.';clearInput();game.pause(true);audio.reset();$('pause').hidden=false;$('buy').hidden=true;$('scoreboard').hidden=true;board=false;unlockMouse();settingsPanel('pause-settings');}
function resume(){audio.unlock();modal=null;$('pause').hidden=true;$('buy').hidden=true;clearInput();game.pause(false);yaw=game.player.yaw;pitch=game.player.pitch;mobile.show(true,game.player?.alive);requestMouse();}
function showBuy(){if(!game.player?.alive||(game.phase!=='buy'&&!isEndless(game))){notify('Köp öppnar under nästa köpfas.');return;}modal='buy';mobile.show(false);setText('buy-message','');clearInput();game.pause(true);audio.reset();$('buy').hidden=false;unlockMouse();refreshShop();}
function closeBuy(){modal=null;$('buy').hidden=true;clearInput();game.pause(false);audio.unlock();mobile.show(true,game.player?.alive);requestMouse();}
function refreshShop(){setText('buy-money',isEndless(game)?'FRITT VAPENVAL':`${game.player.money} ¤`);setText('buy-note',isEndless(game)?'Välj gratis utrustning. Samma huvudvapen återkommer vid respawn.':`Köpfas · timern väntar medan menyn är öppen · ${TEAMS[game.team]}`);$('shop').replaceChildren();for(const w of Object.values(WEAPONS).filter(w=>w.cost>0)){const button=document.createElement('button');button.dataset.item=w.id;const detail=w.slot==='grenade'?`Cartridge · max ${w.limit}`:w.slot==='armor'?'100 rustning':`${w.magazine} / ${w.reserve} · ${w.team?TEAMS[w.team]:'Båda lagen'}`;button.innerHTML=`<strong>${w.name}</strong><em>${isEndless(game)?'GRATIS':w.cost+' ¤'}</em><small>${detail}</small>`;button.onclick=()=>{const r=game.buy(w.id);setText('buy-message',r.ok?`${w.name} köpt.`:r.reason);refreshShop();};$('shop').append(button);}}
function start(selected=team,overrides={},autoplay=false){team=rehearsalMode?'analysts':selected;setPrivateCharacterActors(rehearsalMode?['analysts-0','analysts-1']:[team+'-0']);clearInput();audio.reset();renderer.resetTransient();combatHud.reset();recoil.reset();resetAutoAim();game=new Game(world,{team,seed:Number($('seed').value)||42,config:{mode:settings.mode,firefight:settings.firefight,friendlyFire:settings.friendlyFire,hostageDamage:true,wanderers:settings.wanderers,loadout:settings.loadout,...overrides},autoplay,difficulty:overrides.difficulty||settings.difficulty});game.start(team);for(const actor of game.actors)renderer.actorModel(actor);modal=null;lastRound=0;lastPhase='buy';spectateIndex=0;feed=[];yaw=game.player.yaw;pitch=game.player.pitch;for(const id of ['menu','pause','buy','match-end','scoreboard'])$(id).hidden=true;$('hud').hidden=false;setText('notification','');mobile.show(true,game.player?.alive);updateHud();return game;}
function restartMatch(){audio.unlock();start(team);requestMouse();}
function newMatch(){clearInput();recoil.reset();game.pause(true);audio.reset();renderer.resetTransient();modal='menu';mobile.show(false);unlockMouse();for(const id of ['pause','buy','match-end','scoreboard','hud'])$(id).hidden=true;$('menu').hidden=false;settingsPanel('menu-settings');}
function viewActor(){if(game.player?.alive)return game.player;const alive=game.actors.filter(a=>a.alive&&a.team===game.team);return alive[spectateIndex%Math.max(1,alive.length)]||game.player;}
function timer(value){const sec=Math.max(0,Math.ceil(value));return `${Math.floor(sec/60)}:${String(sec%60).padStart(2,'0')}`;}
function scoreboard(){setText('board-round',isEndless(game)?'ENDLESS · FIENDEKILLS':`RUNDA ${game.state.round}`);setHtml('score-tables',Object.entries(TEAMS).map(([id,name])=>`<h3 class="${id==='counterAnalysts'?'counter':''}">${name} <span style="float:right">${game.state.score[id]}</span></h3><table><thead><tr><th>SPELARE</th><th>K</th><th>D</th><th>KREDITER</th><th>STATUS</th></tr></thead><tbody>${game.actors.filter(a=>a.team===id).map(a=>`<tr class="${a.isPlayer?'me ':''}${!a.alive?'dead':''}"><td>${a.name}${a.isPlayer?' · du':' · bot'}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.money}</td><td>${a.alive?'I spel':'Utslagen'}</td></tr>`).join('')}</tbody></table>`).join(''));}
function minimap(){
 const visible=!document.hidden&&!$('hud').hidden&&!!minimapPanel.getClientRects().length;
 minimapCache.draw(world,game,mapExpanded,visible);
}

function updateHud(){if(!game?.player)return;combatHud.update(game);const s=game.state,p=game.player,view=viewActor(),wp=WEAPONS[view.weapon],item=game.item(view),time=s.phase==='buy'?s.buyDeadline-s.time:s.phase==='result'?s.resultDeadline-s.time:s.bomb.status==='planted'?s.bomb.deadline-s.time:s.deadline-s.time;setText('timer',isEndless(game)?timer(s.time):timer(time));setText('round-label',isEndless(game)?'ENDLESS ACTION ∞':`RUNDA ${s.round}`);setText('difficulty-label',DIFFICULTIES[s.difficulty].name.toUpperCase());setText('phase',s.phase==='buy'?'KÖPFAS':s.bomb.status==='planted'?'BOMB PLANTERAD':s.phase==='result'?'RUNDA SLUT':isEndless(game)?'AUTO-RESPAWN':'HYBRID');for(const [side,id]of [['analysts','a'],['counterAnalysts','ca']]){setText('score-'+id,s.score[side]);setText('alive-'+id,game.actors.filter(a=>a.team===side&&a.alive).length+' kvar');}setText('health',Math.max(0,Math.ceil(view.hp)));setText('armor',view.armor?`${Math.ceil(view.armor)} rustning`:'');setText('money',isEndless(game)?'B · VÄLJ VAPEN':`${p.money} ¤`);setText('weapon-name',wp?.name||'UTRUSTNING');const ammo=wp?.slot==='grenade'?`${view.inventory[view.weapon]} <span>cartridge</span>`:wp?.slot==='bomb'?'BOMB':wp?.slot==='knife'?'KNIV':`${item?.ammo??0} <span>/ ${item?.reserve??0}</span>`;if($('ammo').innerHTML!==ammo)$('ammo').innerHTML=ammo;setText('reload-text',view.reloadUntil>s.time?`Laddar om · ${(view.reloadUntil-s.time).toFixed(1)} s`:s.phase==='buy'?'B · ÖPPNA KÖPMENYN':'');setText('location',roomDisplayName(world.roomAt?.(view.x,view.z)));
 const b=s.bomb;setText('bomb-status',b.status==='planted'?`BOMB · ${timer(b.deadline-s.time)}`:b.carrierId===p.id?'DU BÄR BOMBEN · 5':b.status==='dropped'?'BOMB SLÄPPT':`BOMB · ${game.actors.find(a=>a.id===b.carrierId)?.name||'—'}`);$('bomb-status').classList.toggle('hot',b.status==='planted');setText('hostage-status',isEndless(game)?'Inga uppdrag · fortsätter tills du lämnar':`GISSLAN ${s.hostages.filter(h=>h.rescued).length}/2 · ${s.hostages.filter(h=>h.alive===false).length} döda`);if(isEndless(game))setText('bomb-status',`FRIENDLY FIRE ${game.config.friendlyFire?'PÅ':'AV'} · Z RADIO`);
 const prompt=p.alive&&s.phase==='active'?game.prompt(p):'';$('prompt').hidden=!prompt;setText('prompt-text',prompt);const action=p.action;const progress=action?Math.max(0,Math.min(1,(s.time-action.start)/(action.duration||1))):0;$('action-progress').style.width=`${progress*100}%`;$('prompt').querySelector('.progress').hidden=!action;
 mobile.show(!modal&&game.phase!=='menu'&&game.phase!=='match',p.alive);$('crosshair').classList.toggle('auto-target',!!autoFireTarget&&mobile.enabled&&settings.mobileAutoFire);
 const inventory=p.inventory;const slots=[['1',inventory.primary?.id],['2',inventory.pistol?.id],['3','knife'],['4',['smoke','flash','he'].filter(k=>inventory[k]>0).join('/')],['5',b.carrierId===p.id?'bomb':null]];setHtml('weapon-slots',slots.map(([num,id])=>`<span class="${id===p.weapon||(num==='4'&&['smoke','flash','he'].includes(p.weapon))?'selected':''}"><b>${num}</b>${id?(WEAPONS[id]?.name?.replace(' Analyst','').replace(' Counter','')||'Granater'):'—'}</span>`).join(''));
 $('spawn-protection').hidden=!p.alive||!(p.spawnProtectedUntil>s.time);if(s.time>radioUntil)$('radio-caption').textContent='';$('spectate').hidden=p.alive;$('death-restart').hidden=isEndless(game);setText('respawn-status',isEndless(game)?`ÅTERUPPSTÅR OM ${Math.max(0,(p.respawnAt||s.time)-s.time).toFixed(1)} s · Esc pausar`:'← → Byt lagkamrat · Nästa runda startar automatiskt');if(!p.alive){$('spectate').querySelector('span').textContent=`FÖLJER ${view.name}`;const c=p.deathCause;setText('death-cause',c?`${c.sourceName||'Explosion'} · ${WEAPONS[c.weapon]?.name||c.weapon||'Skada'}`:'Du är utslagen.');}$('round-result').hidden=s.phase!=='result';if(s.phase==='result'){setText('result-title',s.result.winner?`${TEAMS[s.result.winner]} vinner`:'Oavgjord runda');setText('result-reason',reasonNames[s.result.reason]||s.result.reason);}
 if(s.phase==='match'&&modal!=='match'&&modal!=='menu'){modal='match';clearInput();unlockMouse();$('match-end').hidden=false;setText('match-winner',`${TEAMS[s.result?.winner]||TEAMS[Object.keys(s.score).sort((a,b)=>s.score[b]-s.score[a])[0]]} vinner`);setText('match-score',`${s.score.analysts} – ${s.score.counterAnalysts} · ${s.round} rundor`);}
 if(notificationUntil<s.time)setText('notification','');feed=feed.filter(f=>f.until>s.time);setHtml('killfeed',feed.map(f=>`<div>${f.text}</div>`).join(''));if(board)scoreboard();minimap();setText('perf',`${renderer.stats.fps} FPS`);focusHud.update();
}
function input(dt=1/60){
 if(modal||!game.player?.alive)return {};
 yaw+=((keys.has('ArrowLeft')?1:0)-(keys.has('ArrowRight')?1:0))*1.7*dt;
 const touch=mobile.enabled?mobile.input():null;
 const f=(keys.has('KeyW')||keys.has('ArrowUp')?1:0)-(keys.has('KeyS')||keys.has('ArrowDown')?1:0);
 const x=(keys.has('KeyD')?1:0)-(keys.has('KeyA')?1:0);
 let autoFire=false;autoFireTarget=null;
 if(mobile.enabled&&settings.mobileAutoFire&&!focusHud?.expanded&&!touch?.fire&&game.phase==='active'){
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
 return {
   forward:Math.max(-1,Math.min(1,f+(touch?.forward||0))),
   strafe:Math.max(-1,Math.min(1,x+(touch?.strafe||0))),
   jump:keys.has('Space')||!!touch?.jump,
   crouch:keys.has('ControlLeft')||keys.has('ControlRight')||!!touch?.crouch,
   sneak:keys.has('ShiftLeft')||keys.has('ShiftRight')||!!touch?.sneak,
   fire:fire||!!touch?.fire||autoFire,
   autoFire,
   interact:keys.has('KeyE')||!!touch?.interact,
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
if(game.phase!==lastPhase){if(['result','match'].includes(game.phase)){audio.reset();}lastPhase=game.phase;}if(game.state.round!==lastRound){lastRound=game.state.round;audio.reset();renderer.resetTransient();recoil.reset();yaw=game.player.yaw;pitch=game.player.pitch;clearInput();}for(const event of events){if(event.type==='respawn'&&event.actorId===game.player.id){clearInput();recoil.reset();yaw=game.player.yaw;pitch=0;renderer.lastWeapon='';}if(event.type==='radio'){setText('radio-caption',`RADIO · ${event.text}`);radioUntil=game.state.time+3.4;radioOpen=false;$('radio-menu').hidden=true;}if(event.type==='kill'){if(event.actorId===game.player.id){fire=false;radioOpen=false;$('radio-menu').hidden=true;if(!isEndless(game))unlockMouse();}const killer=game.actors.find(a=>a.id===event.sourceId),victim=game.actors.find(a=>a.id===event.actorId);feed.push({text:`${killer?.name||event.sourceName||'—'}  ▸  ${victim?.name||event.targetName||'—'}`,until:game.state.time+5});}if(event.type==='planted')notify('Bomben är planterad i '+missionRoomName(world)+'.',4);if(event.type==='rescued')notify('Gisslan har nått räddningszonen.',3);}const effectEvents=['result','match'].includes(game.phase)?events.filter(e=>['result','match','kill','rocket-explosion'].includes(e.type)):events;renderer.events(events,game);const view=viewActor();if(view)audio.handle(effectEvents,{...view,y:view.y+view.height-.12,ambient:['buy','active'].includes(game.phase)&&!game.state.paused},game.state.time);return events;}
function frame(now){try{if(!renderBudget.shouldRender(now,document.hidden,!!modal||game.state.paused)){lastFrame=now;raf=requestAnimationFrame(frame);return;}const dt=lastFrame?Math.min(.1,(now-lastFrame)/1000):1/60;lastFrame=now;
 tactical.update(dt);
 if(!modal&&game.player?.alive&&game.phase==='active'&&!game.state.paused){
   if(recoil.weapon&&recoil.weapon!==game.player.weapon)recoil.reset();
   pitch=Math.max(-1.49,Math.min(1.49,pitch-recoil.recover(dt,game.state.time)));
 }
 if(!testMode||new URLSearchParams(location.search).has('realtime'))game.update(dt,(testMode&&globalThis.__fps?.liveControls)||input(dt));consumeEvents();tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),dt);const p=viewActor();$('flash-overlay').style.opacity=String((p?.flash||0)*(settings.reducedFlash?.45:.94));const hurt=Math.max(0,Math.min(1,(renderer.damageUntil-game.state.time)/.55));$('damage-overlay').style.opacity=String(hurt*.35);$('damage-direction').style.opacity=String(hurt);if(renderer.damageDirection){const d=renderer.damageDirection;$('damage-direction').style.transform=`translate(-50%,-50%) rotate(${(p?.yaw||0)-Math.atan2(d.x,d.z)}rad)`;}$('smoke-overlay').style.opacity=String(p?renderer.smokeOpacity(p,game.state.smokes):0);$('hitmarker').style.opacity=game.state.time<renderer.hitUntil?'1':'0';if(now-hudAt>100){updateHud();hudAt=now;}raf=requestAnimationFrame(frame);}catch(e){fatal(e);}}
function fatal(error){cancelAnimationFrame(raf);grenadeAssist?.reset();$('fatal').hidden=false;$('fatal').querySelector('pre').textContent=error.stack||String(error);$('loading').hidden=true;console.error(error);}
team = document.querySelector('.team-option.selected').dataset.team;
for (const option of document.querySelectorAll('[data-team]')) option.addEventListener('click', () => { team = option.dataset.team; });
function launchMatch(){
 if(modal!=='menu' || !audio || !$('loading').hidden || characterSelectionFailed || !$('fatal').hidden)return;
 mobile.attemptLandscape();
 start(document.querySelector('.team-option.selected').dataset.team);
 if(!mobile.enabled && navigator.userActivation && !navigator.userActivation.isActive){
   showPause();$('pause').querySelector('p:not(.eyebrow)').textContent='Matchen är redo. Klicka på Fortsätt för att börja.';
   $('resume').focus();return;
 }
 audio.unlock();requestMouse();
}
$('start').addEventListener('cs-start-match',launchMatch);
$('death-restart').onclick=restartMatch;$('resume').onclick=resume;$('restart').onclick=newMatch;$('new-match').onclick=newMatch;$('close-buy').onclick=closeBuy;$('return-buy').onclick=closeBuy;
window.addEventListener('keydown',e=>{if(!modal&&['Tab','Space','Escape','ControlLeft','ControlRight'].includes(e.code))e.preventDefault();if(e.code==='Escape'){if(radioOpen){radioOpen=false;$('radio-menu').hidden=true;return;}if(modal==='buy')closeBuy();else if(!modal)showPause();return;}if(modal)return;if(e.code==='KeyZ'&&game.player?.alive){radioOpen=!radioOpen;$('radio-menu').hidden=!radioOpen;return;}if(radioOpen&&/^Digit[1-6]$/.test(e.code)){const result=game.radio(RADIO[Number(e.code.slice(-1))-1]?.id);if(!result)notify('Radion är upptagen. Försök strax igen.');return;}if(e.code==='Enter'&&!game.player?.alive&&!isEndless(game)){restartMatch();return;}if(e.code==='Tab'){board=true;$('scoreboard').hidden=false;scoreboard();return;}if(e.repeat)return;keys.add(e.code);if(e.code==='KeyB'){showBuy();return;}if(e.code==='KeyR')game.reload();if(e.code==='KeyQ')game.select('last');if(e.code==='KeyG')game.drop();if(/^Digit[1-5]$/.test(e.code))game.select(e.code.slice(-1));if(e.code==='KeyM')toggleMap();if(!game.player.alive&&['ArrowLeft','ArrowRight'].includes(e.code)){const count=game.actors.filter(a=>a.alive&&a.team===game.team).length;spectateIndex=(spectateIndex+(e.code==='ArrowLeft'?-1:1)+count)%Math.max(1,count);}});
window.addEventListener('keyup',e=>{keys.delete(e.code);if(e.code==='Tab'){board=false;$('scoreboard').hidden=true;}});
window.addEventListener('mousemove',e=>{if(document.pointerLockElement!==$('game')||modal||!game.player?.alive)return;const k=settings.sensitivity*tactical.lookScale(false,yaw,pitch);yaw-=e.movementX*k;const before=pitch;pitch=Math.max(-1.49,Math.min(1.49,pitch-e.movementY*k));recoil.counter(pitch-before);});
$('game').addEventListener('mousedown',e=>{if(e.button!==0||modal)return;if(document.pointerLockElement!==$('game')){resume();return;}fire=true;});window.addEventListener('mouseup',()=>{fire=false;});window.addEventListener('contextmenu',e=>e.preventDefault());
document.addEventListener('pointerlockchange',()=>{if(mobile.enabled)return;if(document.pointerLockElement=== $('game')&&modal){unlockMouse();return;}if(document.pointerLockElement!==$('game')){clearInput();if(!modal&&game.player?.alive)showPause();}});window.addEventListener('blur',()=>{clearInput();if(!modal)showPause();});document.addEventListener('visibilitychange',()=>{if(document.hidden){clearInput();if(!modal)showPause();}});

function updateMode(){settings.mode=$('game-mode').value;$('loadout-row').hidden=settings.mode!=='endless';$('mode-description').textContent=settings.mode==='endless'?'Återuppstå efter 3 sekunder. Fritt vapenval med B. Valbara kontrollområden samlar striden. Ingen sluttid.':'Bomb + gisslan. Först till fem rundor. Ingen respawn under rundan.';saveSettings();}
$('game-mode').value=['classic','endless'].includes(settings.mode)?settings.mode:'classic';$('loadout').value=settings.loadout||'smg';$('game-mode').onchange=updateMode;$('loadout').onchange=()=>{settings.loadout=$('loadout').value;saveSettings();};
$('radio-options').innerHTML=RADIO.map((r,i)=>`<div><kbd>${i+1}</kbd><span>${r.text}<small>${r.label}</small></span></div>`).join('');updateMode();

const characterQuery=new URLSearchParams(location.search);
if(!window.__csFlow && !rehearsalMode && characterQuery.get('team')==='counterAnalysts')team='counterAnalysts';
if(characterQuery.has('seed'))$('seed').value=String(Math.min(999999,Math.max(1,Number(characterQuery.get('seed'))||42)));
try{await new Promise(r=>setTimeout(r,10));await preparePrivateCharacter();const levelProject=await selectedLevel();world=createWorld({levelProject});nameWorld();if(levelProject){$('loading').textContent='Bygger '+COMPLEX_NAME+'…';document.title=GAME_NAME+' · '+COMPLEX_NAME;document.querySelector('.intro .eyebrow').textContent=(new URLSearchParams(location.search).get('level')==='preview'?'PRIVAT PROVSPELNING / ':'PUBLICERAD BANA / ')+COMPLEX_NAME;document.querySelector('.intro .lead').textContent='Egen bana · fem mot fem med befintlig spelmekanik.';}game=new Game(world);renderer=new Renderer($('game'),world,settings);audio=new AudioSystem(world,settings);await renderer.assetsReady;grenadeAssist=new GrenadeAssist(renderer,settings);$('loading').hidden=true;$('start').disabled=characterSelectionFailed;raf=requestAnimationFrame(frame);if(testMode){globalThis.__fps={stopFrameLoop(){cancelAnimationFrame(raf);raf=0;},get game(){return game;},world,renderer,audio,settings,start(selected,config={},autoplay=false){start(selected,config,autoplay);return this.snapshot();},step(controls=null,dt=1/60){tactical.update(dt);game.update(dt,controls??input(dt));yaw=game.player.yaw;pitch=game.player.pitch;consumeEvents();tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),dt);updateHud();return this.snapshot();},snapshot(){return JSON.parse(JSON.stringify({...game.state,player:game.player,actors:game.actors.map(({bot,...rest})=>rest),hostages:game.hostages},(k,v)=>k==='bot'?undefined:v));},render(){tactical.render(renderer);grenadeAssist.update(game,viewActor(),modal);renderer.render(game,viewActor(),1/60);updateHud();},pause(value){game.pause(value);},input,showBuy,newMatch,get modal(){return modal;},mobile,recoil,tactical,grenadeAssist,focusHud,renderBudget,minimapCache};}}
catch(error){fatal(error);}

window.addEventListener('pagehide',event=>{if(!event.persisted){cancelAnimationFrame(raf);renderer?.dispose();}});
