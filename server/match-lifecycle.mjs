import {resetRush} from '../src/fps/rush.mjs';
import {BOT_DIFFICULTY_IDS,CLASSIC_NETWORK_CONFIG,MATCH_DEFAULTS,NETWORK_CONFIG,RECONNECT_SECONDS} from '../shared/multiplayer/rules.mjs';
import {prepareNetworkWorld} from '../shared/multiplayer/world.mjs';
import {onlinePrimaries,respawnActor} from '../src/fps/action-rules.mjs';
import {populateZombies} from '../src/fps/zombies.mjs';
import {networkMap} from '../shared/multiplayer/maps.mjs';
import {changeRoomMap} from './room-world.mjs';
import {ActorState} from './network-schema.mjs';
import {matchPreferenceKeys,matchPreferences} from './match-preferences.mjs';

const teams=['analysts','counterAnalysts'];
const lobbySettingKeys=['mapId','mode','fillBots',...matchPreferenceKeys];
/** Match rules around the existing simulation. No second game or client authority. */
export class MatchLifecycle {
  constructor(room, fixture={}) {
    this.room=room;this.settings={countdownSeconds:MATCH_DEFAULTS.countdownSeconds,...fixture};
    for(const [key,max] of [['durationSeconds',3600],['scoreTarget',60000],['countdownSeconds',10]])
      if(Object.hasOwn(this.settings,key)&&(!Number.isFinite(this.settings[key])||this.settings[key]<0||this.settings[key]>max))throw Error('Invalid server match settings');
    // Old collision/combat fixtures can isolate continuous simulation. This is
    // only a factory argument in tests, never an env var or a client option.
    this.continuous=fixture.continuous===true;this.absent=new Map();
    Object.assign(room.state,{phase:this.continuous?'active':'waiting',matchId:1,ownerId:'',winner:'',reason:'',results:''});
    this.setModeLimits();
    room.state.remainingSeconds=this.lobbySeconds;
    room.sim.game.state.paused=!this.continuous;
  }
  get state(){return this.room.state;}
  get now(){return this.room.clock.elapsedTime;}
  get tdmDuration(){return this.settings.durationSeconds??this.state.tdmMinutes*60;}
  get tdmScoreTarget(){return this.settings.scoreTarget??this.state.tdmKills;}
  get lobbySeconds(){return this.state.durationSeconds;}
  setModeLimits(){
    const r=this.room;
    if(r.classic)r.sim.game.config.matchWins=this.state.classicWins;
    this.state.durationSeconds=r.classic?r.sim.game.config.roundTime:this.tdmDuration;
    this.state.scoreTarget=r.classic?this.state.classicWins:this.tdmScoreTarget;
  }
  eligible(){
    const connected=[...this.room.seats.values()].filter(s=>s.connected);
    return connected.length>0&&connected.every(s=>s.ready&&s.playerReady)&&teams.every(team=>connected.some(s=>s.actor?.team===team)||[...this.room.bots.values()].some(s=>s.actor.team===team));
  }
  ownership(){
    const r=this.room;
    if(r.seats.has(this.state.ownerId))return;
    if(r.familyRoom){
      this.state.ownerId=[...r.seats].find(([,s])=>s.connected&&s.ready&&!s.revoked)?.[0]||'';
      return;
    }
    this.state.ownerId=[...r.seats].find(([,s])=>s.connected)?.[0]||r.seats.keys().next().value||'';
  }
  saveFamilySettings(changes){
    const family=this.room.familyRoom;
    if(!family)return;
    const current=family.settings;
    if(Object.entries(changes).some(([key,value])=>current[key]!==value))family.saveSettings({...current,...changes});
  }
  configureLobby(mode,preferences){
    const r=this.room,g=r.sim.game,state=this.state;
    const botsChanged=state.analystsBots!==preferences.analystsBots||state.counterAnalystsBots!==preferences.counterAnalystsBots;
    Object.assign(state,preferences);
    if(botsChanged)r.fillVacancies();
    if(mode===state.mode){
      this.setModeLimits();state.remainingSeconds=this.lobbySeconds;
      return;
    }

    // The same paused game, map and sessions continue into the selected ruleset.
    r.classic=mode==='classic';state.mode=mode;
    Object.assign(g.config,r.classic?CLASSIC_NETWORK_CONFIG:NETWORK_CONFIG,{difficulty:state.botDifficulty,
      zombies:state.zombiesEnabled,danceman:state.dancemanEnabled,friendlyFire:state.friendlyFire});
    prepareNetworkWorld(g.world);
    g.state.resultDeadline=0;
    this.resetRound();
    if(!r.classic){
      state.hostages.clear();
      Object.assign(state,{round:0,roundPhase:'',deadline:0,buyDeadline:0,resultDeadline:0,roundWinner:'',roundReason:'',
        bombStatus:'',carrierId:'',bombX:0,bombY:0,bombZ:0,bombDeadline:0});
    }
    r.teamComms.refreshAnchors();
    this.setModeLimits();state.remainingSeconds=state.durationSeconds;
    for(const seat of r.seats.values())seat.playerReady=false;
  }
  command(client,m){
    const r=this.room,s=r.seats.get(client.sessionId),state=this.state;
    const keys=m?.kind==='botDifficulty'?['kind','matchId','controlEpoch','botDifficulty','serial']:
      m?.kind==='settings'?['kind','matchId','controlEpoch',...lobbySettingKeys]:
      m?.kind==='residents'?['kind','matchId','controlEpoch','zombies','danceman']:
      ['kind','matchId','controlEpoch','ready','team','primary','zombies','danceman','friendlyFire'];
    if(r.changingMap||!s?.ready||!s.connected||s.client!==client||(r.familyRoom&&s.revoked)||!m||m.matchId!==state.matchId||m.controlEpoch!==s.epoch||
      Object.keys(m).some(k=>!keys.includes(k)))return;
    const lobbyHost=state.phase==='waiting'&&state.ownerId===client.sessionId;
    if(!r.classic&&m.kind==='loadout'&&['waiting','active'].includes(state.phase)&&onlinePrimaries(s.actor.team).includes(m.primary))s.actor.loadout=m.primary;
    else if(m.kind==='ready'&&state.phase==='waiting'&&typeof m.ready==='boolean')s.playerReady=m.ready;
    else if(m.kind==='team'&&state.phase==='waiting')r.changeTeam(client,m.team);
    else if(m.kind==='settings'){
      if(!lobbyHost||!lobbySettingKeys.some(key=>Object.hasOwn(m,key)))return;
      const map=networkMap(Object.hasOwn(m,'mapId')?m.mapId:state.mapId);
      const preferences=matchPreferences(m,state);
      if(!preferences||!map||Object.hasOwn(m,'mode')&&!map.modes.includes(m.mode))return;
      const mode=m.mode??(map.modes.includes(state.mode)?state.mode:map.modes[0]);
      if(map.id!==state.mapId){
        return changeRoomMap(r,client,{mapId:map.id,mode,...preferences,
          zombiesEnabled:map.residents&&state.zombiesEnabled,dancemanEnabled:map.residents&&state.dancemanEnabled,
          friendlyFire:state.friendlyFire,botDifficulty:state.botDifficulty});
      }
      this.saveFamilySettings({mode,...preferences});
      this.configureLobby(mode,preferences);
    }else if(m.kind==='residents'){
      const fields=['zombies','danceman'].filter(key=>Object.hasOwn(m,key));
      if(!lobbyHost||!networkMap(state.mapId).residents||!fields.length||fields.some(key=>typeof m[key]!=='boolean'))return;
      const changes=Object.fromEntries(fields.map(key=>[key+'Enabled',m[key]]));
      this.saveFamilySettings(changes);
      Object.assign(state,changes);
      for(const key of fields)r.sim.game.config[key]=m[key];
    }else if(m.kind==='friendlyFire'&&lobbyHost&&typeof m.friendlyFire==='boolean'){
      this.saveFamilySettings({friendlyFire:m.friendlyFire});
      state.friendlyFire=m.friendlyFire;
      r.sim.game.config.friendlyFire=m.friendlyFire;
    }else if(m.kind==='botDifficulty'){
      if(!lobbyHost||!r.sim.game.state.paused||!BOT_DIFFICULTY_IDS.includes(m.botDifficulty)||
        !Number.isSafeInteger(m.serial)||m.serial<1||(s.botDifficultyEpoch===s.epoch&&m.serial<=s.lastBotDifficultySerial))return;
      this.saveFamilySettings({botDifficulty:m.botDifficulty});
      if(!r.sim.game.setNetworkBotDifficulty(m.botDifficulty))return;
      s.botDifficultyEpoch=s.epoch;
      s.lastBotDifficultySerial=m.serial;
      state.botDifficulty=m.botDifficulty;
    }else if(m.kind==='start'&&state.phase==='waiting'){
      if(state.ownerId!==client.sessionId)throw Error('Only the room host can start the match.');
      if(!this.eligible())throw Error('Both teams need a player, and all connected players must be ready.');
      this.resetActors();
      this.startingSeats=[...r.seats.values()].filter(seat=>seat.connected);
      state.phase='countdown';state.remainingSeconds=this.settings.countdownSeconds;this.deadline=this.now+this.settings.countdownSeconds*1000;
    }else if(m.kind==='rematch'&&state.phase==='results'){
      state.matchId++;state.phase='waiting';state.winner=state.reason=state.results='';state.resultsAtMs=0;
      this.resetActors();
      for(const seat of r.seats.values())seat.playerReady=false;
      state.remainingSeconds=this.lobbySeconds;
    }
    r.project();
  }
  resetRound(){
    const r=this.room,g=r.sim.game;
    g.state.paused=true;g.state.round=0;g.state.history=[];g.state.lossStreak={analysts:0,counterAnalysts:0};g.state.score={analysts:0,counterAnalysts:0};
    for(const a of g.actors){a.alive=false;a.money=g.config.startMoney;a.kills=a.deaths=0;delete a.combat;}
    g.beginRound();g.drainEvents();this.absent.clear();
  }
  resetActors(){
    const r=this.room,g=r.sim.game;
    if(r.classic){this.resetRound();return;}
    g.state.paused=true;g.state.score={analysts:0,counterAnalysts:0};
    g.events=[];g.soundEvents=[];g.pendingDamage=[];g.state.projectiles=[];g.state.smokes=[];g.state.grenades=[];g.state.drops=[];
    r.state.brokenGlass.clear();prepareNetworkWorld(g.world);g.tacticalContacts=[];g.state.combatFlow.firstKill=false;this.absent.clear();
    // Remove every old body before selecting the new safe spawn positions.
    for(const a of g.actors)a.alive=false;
    for(const seat of r.participants()){
      const sid=seat.client?.sessionId;if(sid)r.inputs.get(sid).clear();seat.holdThrow=seat.aim=seat.trigger=false;seat.lastSelect=0;seat.enabled=false;
      seat.lastFire=seat.lastReload=seat.lastSampleTick=seat.lastShotStamp=0;
      if(!seat.ready)continue;
      seat.epoch++;seat.actor.controlEpoch=seat.epoch;
      seat.actor.kills=seat.actor.deaths=0;delete seat.actor.combat;
      if(!respawnActor(g,seat.actor))throw Error('No safe match spawn.');
      seat.lifeStartedAt=this.now;seat.diedAtMs=0;
      r.state.actors.set(seat.id,new ActorState({id:seat.id,sessionId:sid||'',name:seat.actor.name,team:seat.actor.team}));
    }
    g.state.zombies=[];
    if(g.config.zombies||g.config.danceman)populateZombies(g);
    g.drainEvents();r.lag?.tickTimes.clear();r.lag?.shots.clear();
  }
  beforeTick(){
    this.ownership();const s=this.state;
    if(this.continuous)return;
    if(s.phase==='countdown'){
      // New reservations may load during deployment. Only the ready cohort that
      // launched the match participates in the cancellation decision.
      if(this.startingSeats.some(seat=>!seat.connected||!seat.playerReady||!this.room.seats.has(seat.client.sessionId))){
        s.phase='waiting';s.remainingSeconds=this.lobbySeconds;this.startingSeats=null;
      }
      else if(this.now>=this.deadline){
        // Inputs received during the hold must not become a queued first shot or step.
        for(const client of this.room.clients)this.room.inputs.get(client.sessionId).clear();
        this.startingSeats=null;
        if(!this.room.classic){
          // The deployment hold has already satisfied initial weapon readiness.
          // Ordinary mid-match respawns retain their own short draw delay.
          for(const actor of this.room.sim.game.actors)actor.nextShot=this.room.sim.game.state.time;
        }
        s.phase='active';this.deadline=this.now+this.tdmDuration*1000;
        this.room.sim.game.state.paused=false;
        if(!this.room.classic)this.room.sim.game.world.networkDynamics.elevatorOpenAt=this.room.sim.game.state.time;
      }
    }
    if(s.phase==='active'){
      if(!this.room.classic&&this.now>=this.deadline){this.finish('time');return;}
      for(const team of teams){
        const present=[...this.room.participants()].some(seat=>seat.ready&&seat.connected&&seat.actor.team===team);
        if(present)this.absent.delete(team);else if(!this.absent.has(team))this.absent.set(team,this.now);
      }
      const gone=teams.filter(team=>this.absent.has(team)&&this.now-this.absent.get(team)>=RECONNECT_SECONDS*1000);
      if(gone.length)this.finish('forfeit',gone.length===2?'draw':teams.find(t=>t!==gone[0]));
    }
    if(['active','countdown'].includes(s.phase))s.remainingSeconds=Math.max(0,(this.deadline-this.now)/1000);
  }
  afterTick(){
    if(this.room.classic){
      const g=this.room.sim.game;
      if(this.state.phase==='active'&&g.phase==='match')this.finish('rounds',g.state.result.winner);
      return;
    }
    if(!this.continuous&&this.state.phase==='active'&&teams.some(t=>this.room.sim.game.state.score[t]>=this.tdmScoreTarget))this.finish('score');
  }
  finish(reason,forced){
    if(this.state.phase!=='active')return;
    const r=this.room,g=r.sim.game,score=g.state.score;
    // Resolve after the complete damage batch: simultaneous final kills can draw.
    const winner=forced||(score.analysts===score.counterAnalysts?'draw':score.analysts>score.counterAnalysts?'analysts':'counterAnalysts');
    Object.assign(this.state,{phase:'results',winner,reason,remainingSeconds:0,resultsAtMs:this.now,
      results:JSON.stringify({matchId:this.state.matchId,winner,reason,score:{...score},players:g.actors.map(a=>({id:a.id,name:a.name,team:a.team,kills:a.kills,deaths:a.deaths}))})});
    g.state.paused=true;g.state.projectiles=[];g.state.grenades=[];
    for(const actor of g.actors){resetRush(actor);actor.cartridge=null;actor.waitTriggerRelease=false;}
    for(const [sid,seat] of r.seats){seat.enabled=false;seat.holdThrow=false;r.inputs.get(sid).clear();}
  }
}
