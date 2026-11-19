import {MATCH_DEFAULTS,RECONNECT_SECONDS} from '../shared/multiplayer/rules.mjs';
import {prepareNetworkWorld} from '../shared/multiplayer/world.mjs';
import {onlinePrimaries,respawnActor} from '../src/fps/action-rules.mjs';
import {populateZombies} from '../src/fps/zombies.mjs';
import {ActorState} from './network-schema.mjs';

const teams=['analysts','counterAnalysts'];
/** Match rules around the existing simulation. No second game or client authority. */
export class MatchLifecycle {
  constructor(room, fixture={}) {
    this.room=room;this.settings={...MATCH_DEFAULTS,...fixture};
    for(const [key,max] of [['durationSeconds',3600],['scoreTarget',60000],['countdownSeconds',10]])
      if(!Number.isFinite(this.settings[key])||this.settings[key]<0||this.settings[key]>max)throw Error('Invalid server match settings');
    // Old collision/combat fixtures can isolate continuous simulation. This is
    // only a factory argument in tests, never an env var or a client option.
    this.continuous=fixture.continuous===true;this.absent=new Map();
    Object.assign(room.state,{phase:this.continuous?'active':'waiting',matchId:1,ownerId:'',
      durationSeconds:room.classic?room.sim.game.config.roundTime:this.settings.durationSeconds,scoreTarget:room.classic?room.sim.game.config.matchWins:this.settings.scoreTarget,
      remainingSeconds:this.settings.durationSeconds,winner:'',reason:'',results:''});
    room.sim.game.state.paused=!this.continuous;
  }
  get state(){return this.room.state;}
  get now(){return this.room.clock.elapsedTime;}
  eligible(){
    const connected=[...this.room.seats.values()].filter(s=>s.connected);
    return connected.length>0&&connected.every(s=>s.ready&&s.playerReady)&&teams.every(team=>connected.some(s=>s.actor?.team===team)||[...this.room.bots.values()].some(s=>s.actor.team===team));
  }
  ownership(){
    const r=this.room;
    if(r.seats.has(this.state.ownerId))return;
    this.state.ownerId=[...r.seats].find(([,s])=>s.connected)?.[0]||r.seats.keys().next().value||'';
  }
  command(client,m){
    const r=this.room,s=r.seats.get(client.sessionId),state=this.state;
    if(!s?.ready||!s.connected||s.client!==client||!m||m.matchId!==state.matchId||m.controlEpoch!==s.epoch||
      Object.keys(m).some(k=>!['kind','matchId','controlEpoch','ready','team','primary','zombies','danceman'].includes(k)))return;
    if(!r.classic&&m.kind==='loadout'&&['waiting','active'].includes(state.phase)&&onlinePrimaries(s.actor.team).includes(m.primary))s.actor.loadout=m.primary;
    else if(m.kind==='ready'&&state.phase==='waiting'&&typeof m.ready==='boolean')s.playerReady=m.ready;
    else if(m.kind==='team'&&state.phase==='waiting')r.changeTeam(client,m.team);
    else if(m.kind==='residents'&&state.phase==='waiting'&&state.ownerId===client.sessionId&&
      typeof m.zombies==='boolean'&&typeof m.danceman==='boolean'){
      state.zombiesEnabled=m.zombies;state.dancemanEnabled=m.danceman;
      Object.assign(r.sim.game.config,{zombies:m.zombies,danceman:m.danceman});
    }else if(m.kind==='start'&&state.phase==='waiting'){
      if(state.ownerId!==client.sessionId)throw Error('Bara rumsägaren kan starta matchen.');
      if(!this.eligible())throw Error('Alla anslutna spelare måste vara redo, med minst en spelare i varje lag.');
      this.resetActors();state.phase='countdown';this.deadline=this.now+this.settings.countdownSeconds*1000;
    }else if(m.kind==='rematch'&&state.phase==='results'){
      state.matchId++;state.phase='waiting';state.winner=state.reason=state.results='';
      this.resetActors();
      for(const seat of r.seats.values())seat.playerReady=false;
      state.remainingSeconds=this.settings.durationSeconds;
    }
    r.project();
  }
  resetActors(){
    const r=this.room,g=r.sim.game;
    if(r.classic){
      g.state.paused=true;g.state.round=0;g.state.history=[];g.state.lossStreak={analysts:0,counterAnalysts:0};g.state.score={analysts:0,counterAnalysts:0};
      for(const a of g.actors){a.alive=false;a.money=g.config.startMoney;a.kills=a.deaths=0;delete a.combat;}
      g.beginRound();g.drainEvents();this.absent.clear();return;
    }
    g.state.paused=true;g.state.score={analysts:0,counterAnalysts:0};
    g.events=[];g.soundEvents=[];g.pendingDamage=[];g.state.projectiles=[];g.state.smokes=[];g.state.grenades=[];g.state.drops=[];
    r.state.brokenGlass.clear();prepareNetworkWorld(g.world);g.tacticalContacts=[];g.state.combatFlow.firstKill=false;this.absent.clear();
    // Remove every old body before selecting the new safe spawn positions.
    for(const a of g.actors)a.alive=false;
    for(const seat of r.participants()){
      const sid=seat.client?.sessionId;if(sid)r.inputs.get(sid).clear();seat.aim=seat.trigger=false;seat.lastSelect=0;seat.enabled=false;
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
      if(!this.eligible()){s.phase='waiting';s.remainingSeconds=this.settings.durationSeconds;}
      else if(this.now>=this.deadline){
        s.phase='active';this.deadline=this.now+this.settings.durationSeconds*1000;
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
    if(!this.continuous&&this.state.phase==='active'&&teams.some(t=>this.room.sim.game.state.score[t]>=this.settings.scoreTarget))this.finish('score');
  }
  finish(reason,forced){
    if(this.state.phase!=='active')return;
    const r=this.room,g=r.sim.game,score=g.state.score;
    // Resolve after the complete damage batch: simultaneous final kills can draw.
    const winner=forced||(score.analysts===score.counterAnalysts?'draw':score.analysts>score.counterAnalysts?'analysts':'counterAnalysts');
    Object.assign(this.state,{phase:'results',winner,reason,remainingSeconds:0,
      results:JSON.stringify({matchId:this.state.matchId,winner,reason,score:{...score},players:g.actors.map(a=>({id:a.id,name:a.name,team:a.team,kills:a.kills,deaths:a.deaths}))})});
    g.state.paused=true;
    for(const [sid,seat] of r.seats){seat.enabled=false;r.inputs.get(sid).clear();}
  }
}
