import {Room,ServerError} from '@colyseus/core';
import {createHash,timingSafeEqual,randomBytes} from 'node:crypto';
import {createHeadlessSimulation} from './headless.mjs';
import {WEAPONS} from '../src/fps/config.mjs';
import {onlinePrimaries,respawnActor} from '../src/fps/action-rules.mjs';
import {zombiePosition} from '../src/fps/zombie-poses.mjs';
import {prepareClassicRound,projectClassic} from './classic-round.mjs';
import {CLASSIC_NETWORK_CONFIG,DEFAULT_NETWORK_BOT_DIFFICULTY,NETWORK_CONFIG,NETWORK_MAP,ROOM_CAPACITY,TEAM_CAPACITY,RECONNECT_SECONDS,copyPose,safeName} from '../shared/multiplayer/rules.mjs';
import {checkContract,TEAM_COMMS_TYPE,validateNetworkInput,wireInput} from '../shared/multiplayer/protocol.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {NetworkInput,ActorState,RoomState,DoorState,GrenadeState,ResidentState,RocketState} from './network-schema.mjs';

import {prepareNetworkWorld,DOOR_FIELDS} from '../shared/multiplayer/world.mjs';
import {collisionContract} from '../shared/multiplayer/collision-contract.mjs';

const hashCode=code=>createHash('sha256').update(code).digest();
const MAX_PATCH_EVENTS=64;
function eventsForPatch(events){
  if(events.length<=MAX_PATCH_EVENTS)return events;
  // Damage may emit several events for each victim. Keep the projectile sound
  // and effect even when several explosions land in the same tick.
  const selected=new Set(events.filter(e=>e.type==='rocket-launch'||e.type==='rocket-explosion'));
  for(let i=events.length-1;i>=0&&selected.size<MAX_PATCH_EVENTS;i--)selected.add(events[i]);
  return events.filter(e=>selected.has(e));
}
const validCode=code=>typeof code==='string'&&/^[A-Za-z0-9-]{6,64}$/.test(code);
const teams=['analysts','counterAnalysts'];
const seats=teams.flatMap(team=>Array.from({length:TEAM_CAPACITY},(_,i)=>`${team}-${i}`));
export const MAX_BUFFERED_BYTES=256*1024;
import {LagCompensation, recordRtt} from './lag-compensation.mjs';
import {MatchLifecycle} from './match-lifecycle.mjs';
import {TeamComms} from './team-comms.mjs';
export class NetworkRoom extends Room {
  async onCreate(options) {
    if(!validCode(options.code))throw new ServerError(400,'Use a private code of 6–64 letters, digits or hyphens.');
    try {checkContract(options.contract,CONTRACT);}catch(e){throw new ServerError(409,e.message);}
    this.codeHash=hashCode(options.code);
    this.maxClients=ROOM_CAPACITY;this.maxMessagesPerSecond=120;this.patchRate=50;
    await this.setPrivate(true);
    this.bots=new Map();this.seats=new Map();this.lives=new Map();this.metrics={invalid:0,maxQueue:0,coalesced:0,ticks:0,events:0,reconnects:0,drops:0,backpressure:0};
    if(options.mode!==undefined&&!['tdm','classic'].includes(options.mode))throw new ServerError(400,'Okänt spelläge.');
    this.classic=options.mode==='classic';
    this.sim=await createHeadlessSimulation({mapId:NETWORK_MAP,controllers:Object.fromEntries(seats.map(id=>[id,'human'])),config:this.classic?CLASSIC_NETWORK_CONFIG:NETWORK_CONFIG});
    if(this.sim.sourceHash!==CONTRACT.mapHash)throw Error('Server map differs from built contract. Run npm run build --prefix server.');
    if(createHash('sha256').update(collisionContract(this.sim.game.world)).digest('hex')!==CONTRACT.collisionHash)throw Error('Server collision differs from built contract.');
    prepareNetworkWorld(this.sim.game.world);
    // Map construction is synchronous and can take >1 s. Seed the handshake
    // clock after loading, or the first SDK offset starts one load-time behind.
    this.clock.tick();
    this.templates=new Map(this.sim.game.actors.map(a=>[a.id,a]));
    this.sim.game.state.actors=[];this.sim.game.drainEvents();
    this.sim.game.onResidentSpawn=resident=>{
      resident.lifeId=++this.residentLife;
      resident.lifeStartedAt=this.clock.elapsedTime;
    };
    this.residentLife=0;
    const zombiesEnabled=options.zombies===true,dancemanEnabled=options.danceman===true;
    Object.assign(this.sim.game.config,{zombies:zombiesEnabled,danceman:dancemanEnabled});
    this.state=new RoomState({zombiesEnabled,dancemanEnabled,friendlyFire:false,botDifficulty:DEFAULT_NETWORK_BOT_DIFFICULTY,
      mode:this.classic?'classic':'tdm',round:0,fillBots:options.fillBots!==false,worldRevision:1,elevatorOpenAt:-1});
    for(const d of this.sim.game.world.doors.doors)this.state.doors.set(d.id,new DoorState());
    this.sim.game.onGlassBreak=id=>this.state.brokenGlass.set(id,this.clock.elapsedTime);
    this.project();
    this.lag=new LagCompensation(this);this.lag.recordTick();
    if(this.classic){
      const g=this.sim.game;
      g.beforeBeginRound=()=>prepareClassicRound(this);
      g.afterBeginRound=()=>{g.world.networkDynamics.elevatorOpenAt=Math.max(0,g.state.buyDeadline-1.5);};
    }
    this.match=new MatchLifecycle(this,this.matchOptions);
    this.teamComms=new TeamComms(this);
    this.onMessage('match',(client,m)=>{try{this.match.command(client,m);}catch(e){client.send('notice',e.message);}});
    this.onMessage(TEAM_COMMS_TYPE,(client,message)=>this.teamComms.receive(client,message));
    // Reliable WS input has its own monotonic wire sequence. Do not introduce a
    // second sequence/ack counter; dropping a queued frame still advances its ack.
    this.inputs=this.defineInput(NetworkInput,{bufferMaxSize:12});
    this.onMessage('ready',(client,message)=>{
      const seat=this.seats.get(client.sessionId);if(!seat||seat.ready)return;
      try{checkContract(message,CONTRACT);}catch(e){client.send('problem',e.message);client.leave(4009);return;}
      const actor=structuredClone(this.templates.get(seat.id));
      Object.assign(actor,{name:seat.name,alive:false,lifeId:this.lives.get(seat.id)||0,controlEpoch:seat.epoch,respawnAt:null});
      if(seat.pending)actor.id=seat.waitId;
      else this.sim.game.actors.push(actor);
      if(this.classic)this.prepareClassicActor(actor,!seat.pending);
      else if(!respawnActor(this.sim.game,actor)){this.sim.game.state.actors.pop();client.send('problem','No safe spawn is available.');client.leave(4008);return;}
      if(this.sim.game.world.networkDynamics.elevatorOpenAt<0)this.sim.game.world.networkDynamics.elevatorOpenAt=this.sim.game.state.time;
      seat.ready=true;seat.enabled=true;seat.actor=actor;seat.deadline=Infinity;
      seat.lifeStartedAt=this.clock.elapsedTime;seat.diedAtMs=0;
      if(!seat.pending)this.sim.controllers.bind(client.sessionId,actor.id);
      this.project();
    });
    this.onMessage('controls',(client,message)=>{
      const seat=this.seats.get(client.sessionId);
      if(!seat?.ready||!seat.connected||seat.client!==client||message?.lifeId!==seat.actor.lifeId||
        (message.controlEpoch??0)!==seat.epoch||typeof message.enabled!=='boolean')return;
      seat.enabled=message.enabled;seat.interactUntil=0;seat.actor.action=null;seat.aim=false;seat.trigger=false;seat.actor.aimAmount=0;this.inputs.get(client.sessionId).clear();
      if(!seat.enabled)this.teamComms.prune();
    });
    this.onMessage('select',(client,m)=>{
      const s=this.seats.get(client.sessionId);
      if(!s?.enabled||!s.ready||!s.connected||s.client!==client||!s.actor.alive||this.state.phase!=='active'||
        m?.lifeId!==s.actor.lifeId||m.controlEpoch!==s.epoch||!Number.isSafeInteger(m.serial)||m.serial<=(s.lastSelect||0)||
        !['primary','pistol','knife','he','last',...(this.classic?['bomb']:[])].includes(m.slot))return;
      s.lastSelect=m.serial;
      this.inputs.get(client.sessionId).clear();
      const previous=s.actor.weapon;
      if(this.sim.game.select(m.slot,s.actor)){
        s.aim=false;s.actor.aimAmount=0;
        if(this.classic&&previous!==s.actor.weapon&&s.actor.action){
          s.actor.action=null;s.interactUntil=0;s.releaseInteract=true;
        }
      }
    });
    this.onMessage('classic',(client,m)=>{
      const s=this.seats.get(client.sessionId),g=this.sim.game;
      if(!this.classic||!s?.ready||!s.connected||s.client!==client||this.state.phase!=='active'||
        !m||m.matchId!==this.state.matchId||m.round!==g.state.round||m.lifeId!==s.actor.lifeId||
        m.controlEpoch!==s.epoch||!Number.isSafeInteger(m.serial)||m.serial<=(s.lastClassic||0))return;
      s.lastClassic=m.serial;
      if(m.kind==='buy'&&typeof m.item==='string'){
        const result=g.buy(m.item,s.actor);
        client.send('notice',result.ok?WEAPONS[m.item].name+' köpt.':result.reason);
      }else if(m.kind==='drop'&&s.enabled&&s.actor.alive&&g.phase==='active')g.drop(s.actor);
    });
    this.onMessage('clock-echo',(client,message)=>{
      const seat=this.seats.get(client.sessionId);
      if(!seat?.probe||seat.client!==client||message!==seat.probe.token)return;
      const rtt=this.clock.elapsedTime-seat.probe.at;seat.probe=null;
      recordRtt(seat,rtt,this.clock.elapsedTime);
    });
    this.clock.setInterval(()=>{
      for(const c of this.clients){const seat=this.seats.get(c.sessionId);if(!seat?.ready)continue;
        seat.probe={token:randomBytes(12).toString('hex'),at:this.clock.elapsedTime};c.send('clock-probe',seat.probe.token);}
    },1000);
    this.setFixedTimestep(()=>this.fixedTick(),60);
  }
  acceptsCode(code) {
    return validCode(code) && timingSafeEqual(hashCode(code), this.codeHash);
  }
  onAuth(client,options) {
    try{checkContract(options.contract,CONTRACT);}catch(e){throw new ServerError(409,e.message);}
    if(!this.acceptsCode(options.code))throw new ServerError(403,'Incorrect private room code.');
    this.chooseSeat(options.team);
    return true;
  }
  chooseSeat(team='auto',exclude){
    if(!['auto',...teams].includes(team))throw new ServerError(400,'Invalid team.');
    const used=new Set([...this.seats.values()].filter(s=>s!==exclude).map(s=>s.id));
    const order=team==='auto'?[...teams].sort((a,b)=>[...used].filter(id=>id.startsWith(a+'-')).length-[...used].filter(id=>id.startsWith(b+'-')).length):[team];
    const id=order.flatMap(t=>seats.filter(id=>id.startsWith(t+'-'))).find(id=>!used.has(id));
    if(!id)throw new ServerError(409,team==='auto'?'This private room is full.':'This team is full (5 players).');
    return id;
  }
  onJoin(client,options) {
    const id=this.chooseSeat(options.team);
    const waiting=this.classic&&this.state.phase==='active';
    if(!waiting)this.removeBot(id);
    const waitId=waiting?id+'-waiting':id;
    const seat={id,waitId,pending:waiting,name:safeName(options.name),ready:false,playerReady:false,enabled:false,lastFire:0,lastReload:0,lastSampleTick:0,lastShotStamp:0,epoch:0,connected:true,client,rtts:[],deadline:this.clock.elapsedTime+20000};
    client.ref.once('error',()=>{if(seat.client===client)seat.revoked=true;});
    this.seats.set(client.sessionId,seat);this.match.ownership();
    this.state.actors.set(waitId,new ActorState({id:waitId,sessionId:client.sessionId,name:seat.name,team:id.split('-')[0],controlEpoch:seat.epoch,connected:true}));
    this.fillVacancies();this.project();
  }
  *participants(){yield* this.seats.values();yield* this.bots.values();}
  removeActor(actor){
    if(!actor)return;
    this.lives.set(actor.id,actor.lifeId);
    actor.alive=false;
    const g=this.sim.game;
    this.releaseObjectives(actor,true);
    for(const other of g.actors){
      const ai=other.bot;
      if(ai?.memory.hasRecord(actor))ai.memory.deleteRecord(actor);
      if(ai?.target?.entity===actor){ai.target=null;ai.command={};ai.aimGoal=null;}
      if(ai?.investigation?.entity===actor)ai.investigation=null;
      if(other.combat?.incoming)delete other.combat.incoming[actor.id];
    }
    g.state.actors=g.actors.filter(a=>a!==actor);
    this.state.actors.delete(actor.id);
    this.lag.shots.delete(actor.id);
  }
  removeBot(id){
    const bot=this.bots.get(id);
    if(bot){this.removeActor(bot.actor);this.bots.delete(id);}
  }
  releaseObjectives(actor,dropBomb){
    const g=this.sim.game;
    if(!this.classic||!actor)return;
    actor.action=null;
    if(dropBomb&&g.bomb.carrierId===actor.id)Object.assign(g.bomb,{status:'dropped',carrierId:null,x:actor.x,y:actor.y,z:actor.z});
    for(const h of g.hostages)if(h.escortId===actor.id){h.escortId=null;h.path=[];}
  }
  prepareClassicActor(a,alive){
    const g=this.sim.game,p=g.world.anchors[a.team][a.index];
    Object.assign(a,{x:p.x,y:p.y||0,z:p.z,yaw:p.yaw||0,alive,lifeId:(a.lifeId||0)+1,money:g.config.startMoney,inventory:g.startInventory(a.team),
      armor:0,hp:g.config.health,weapon:a.team==='analysts'?'p9':'p12',lastWeapon:'knife',bot:null,action:null,
      aimAmount:0,aiming:false,respawnAt:null,spawnProtectedUntil:0});
  }
  fillVacancies(roundBoundary=false){
    if(this.classic&&this.state.phase==='active'&&!roundBoundary)return;
    if(!this.state.fillBots||!this.seats.size)return;
    const occupied=new Set([...this.participants()].map(s=>s.id));
    for(const id of seats){
      if(occupied.has(id))continue;
      const a=structuredClone(this.templates.get(id));
      Object.assign(a,{controllerType:'bot',name:'BOT '+a.name,lifeId:this.lives.get(id)||0,
        loadout:onlinePrimaries(a.team)[a.index%4],alive:false});
      if(this.classic)this.prepareClassicActor(a,true);
      else if(!respawnActor(this.sim.game,a))continue;
      this.sim.game.actors.push(a);
      this.bots.set(id,{id,actor:a,ready:true,connected:true,playerReady:true,epoch:0,lifeStartedAt:this.clock.elapsedTime,diedAtMs:0});
      this.state.actors.set(id,new ActorState({id,team:a.team,name:a.name,bot:true}));
    }
  }
  changeTeam(client,team){
    const seat=this.seats.get(client.sessionId);
    const id=this.chooseSeat(team,seat);if(id===seat.id)return;
    this.removeBot(id);
    const old=seat.actor,actor=structuredClone(this.templates.get(id));
    this.lives.set(old.id,old.lifeId);
    Object.assign(actor,{name:seat.name,alive:false,lifeId:Math.max(old.lifeId,this.lives.get(id)||0),controlEpoch:seat.epoch+1,kills:0,deaths:0});
    this.sim.game.state.actors=this.sim.game.actors.filter(a=>a!==old);
    if(this.classic)this.prepareClassicActor(actor,true);
    else {
      if(onlinePrimaries(team).includes(old.loadout))actor.loadout=old.loadout;
      if(!respawnActor(this.sim.game,actor)){this.sim.game.actors.push(old);this.fillVacancies();throw Error('No safe spawn is available.');}
    }
    this.state.actors.delete(seat.id);seat.id=id;seat.actor=actor;seat.epoch++;seat.playerReady=false;
    seat.lifeStartedAt=this.clock.elapsedTime;seat.diedAtMs=0;seat.lastSelect=seat.lastFire=seat.lastReload=seat.lastSampleTick=seat.lastShotStamp=0;
    this.inputs.get(client.sessionId).clear();this.sim.game.actors.push(actor);this.sim.controllers.unbind(client.sessionId);this.sim.controllers.bind(client.sessionId,id);
    this.state.actors.set(id,new ActorState({id,sessionId:client.sessionId,name:seat.name,team:actor.team}));this.fillVacancies();
  }
  fixedTick() {
    this.match.beforeTick();
    const frames=new Map(),actions=new Map();this.lag.shots.clear();
    for(const client of this.clients){
      const seat=this.seats.get(client.sessionId),buffer=this.inputs.get(client.sessionId);
      // ws buffers writes when a peer stops reading. Bound that transport queue
      // too, rather than retaining an unlimited stream of snapshots/events.
      if(client.ref.readyState===1&&client.ref.bufferedAmount>MAX_BUFFERED_BYTES){
        if(seat){seat.enabled=false;seat.revoked=true;}buffer.clear();
        this.metrics.backpressure++;client.ref.terminate();continue;
      }
      this.metrics.maxQueue=Math.max(this.metrics.maxQueue,buffer.size);
      if(this.state.phase!=='active'||!seat?.ready||!seat.enabled||!seat.connected||seat.client!==client){buffer.clear();if(seat&&this.clock.elapsedTime>seat.deadline)client.leave(4008);continue;}
      if(!seat.actor.alive){buffer.clear();continue;}
      // Consume ordered arrivals once per authority tick. Replaying one queued
      // frame per tick accumulated ~200 ms of avoidable input delay when a
      // renderer sent catch-up frames faster than the server timer could drain.
      // Coalesce controls, never simulation time. Preserve a short fire press
      // with ITS orientation/tick/stamp even if a release follows in this batch.
      let latest,shot,reload=false,consumed=0;
      for(let f;(f=buffer.next());){
        consumed++;
        try{
          const input=validateNetworkInput(wireInput(f),seat.actor,this.sim.tickNumber);
          if(f.sampleTick<seat.lastSampleTick)throw Error('Regressed input tick');
          seat.lastSampleTick=f.sampleTick;
          latest={input,frame:f,stamp:buffer.renderTime};
          if(f.fire&&f.fireId>seat.lastFire&&(WEAPONS[seat.actor.weapon].automatic||!seat.trigger))shot=latest;
          seat.trigger=f.fire;seat.aim=!!input.aim;
          if(!input.interact)seat.releaseInteract=false;
          input.interact=!!input.interact&&!seat.releaseInteract;
          seat.interactUntil=this.classic&&input.interact?this.clock.elapsedTime+180:0;
          reload ||= f.reloadId>seat.lastReload;
          seat.lastFire=Math.max(seat.lastFire,f.fireId);seat.lastReload=Math.max(seat.lastReload,f.reloadId);
        }catch{this.metrics.invalid++;}
      }
      this.metrics.coalesced+=Math.max(0,consumed-1);
      if(!latest){
        const interact=this.classic&&seat.interactUntil>this.clock.elapsedTime;
        if(seat.aim||interact)frames.set(client.sessionId,{aim:!!seat.aim,interact});
        continue;
      } // no cached held movement/fire on silence
      const selected=shot||latest,{input,frame:f,stamp}=selected;
      input.interact=latest.input.interact;
      input.fire=!!shot&&(WEAPONS[seat.actor.weapon].projectile||this.lag.accept(seat,f,stamp));input.reload=reload;
      frames.set(client.sessionId,input);
      actions.set(seat.id,`${seat.id}:${seat.actor.lifeId}:${seat.epoch}:${f.fireId}`);
    }
    this.teamComms.prune();
    const oldLives=new Map(this.sim.game.actors.map(a=>[a.id,a.lifeId]));
    const events=this.sim.tick(frames);this.match.afterTick();
    for(const seat of this.participants())if(!this.classic&&seat.ready&&oldLives.get(seat.id)!==seat.actor.lifeId){
      const sid=seat.client?.sessionId;if(sid)this.inputs.get(sid).clear();seat.lastFire=seat.lastReload=seat.lastSelect=0;seat.trigger=seat.aim=false;
      seat.lifeStartedAt=this.clock.elapsedTime;seat.diedAtMs=0;
      // New schema identity drops old-life interpolation and rewind histories.
      this.state.actors.set(seat.id,new ActorState({id:seat.id,sessionId:sid||'',name:seat.actor.name,team:seat.actor.team}));
    }
    this.project();this.lag.recordTick();
    if(events.length){
      const wire=eventsForPatch(events).map(e=>{
        const actor=this.state.actors.get(e.actorId)||this.state.residents.get(e.actorId);
        const source=this.state.actors.get(e.sourceId)||this.state.residents.get(e.sourceId);
        return {...e,round:this.state.round,matchId:this.state.matchId,eventId:e.serial,tick:this.sim.tickNumber,lifeId:actor?.lifeId||0,sourceLifeId:source?.lifeId||0,controlEpoch:actor?.controlEpoch||0,sourceControlEpoch:source?.controlEpoch||0,
          actionId:actions.get(e.sourceId||e.actorId)||''};
      });
      this.metrics.events+=wire.length;this.broadcast('events',wire,{afterNextPatch:true});
    }
    if(this.metrics.ticks%60===0&&this.state.actors.size<ROOM_CAPACITY)this.fillVacancies();
    this.metrics.ticks++;
  }
  project() {
    const g=this.sim.game;
    if(this.classic)projectClassic(this);
    this.teamComms?.prune();
    const residents=this.state.residents;
    for(const id of residents.keys())if(!g.state.zombies.some(z=>z.id===id))residents.delete(id);
    for(const z of g.state.zombies){
      let state=residents.get(z.id);
      if(state?.lifeId!==z.lifeId){
        state=new ResidentState({id:z.id,model:z.model,name:z.name,lifeId:z.lifeId,radius:z.radius,lifeStartedAt:z.lifeStartedAt});
        residents.set(z.id,state);
      }
      if(!z.alive&&!state.diedAtMs)state.diedAtMs=this.clock.elapsedTime;
      Object.assign(state,zombiePosition(z,g.state.time),{height:z.height,yaw:z.yaw,alive:z.alive,hp:z.hp,
        behavior:z.behavior,clip:z.clip,poseAt:z.poseAt,rate:z.rate,offset:z.offset,loop:z.loop});
    }
    for(const d of g.world.doors.doors){const s=this.state.doors.get(d.id);for(const key of DOOR_FIELDS)s[key]=d[key];s.poseAngle=d.angle*d.sign;}
    this.state.elevatorProgress=g.world.doors.elevators.progress;
    this.state.elevatorOpenAt=g.world.networkDynamics.elevatorOpenAt;
    for(const seat of this.participants())if(seat.ready){
      const a=seat.actor,s=this.state.actors.get(a.id);copyPose(s,a);
      if(!a.alive&&!seat.diedAtMs)seat.diedAtMs=this.clock.elapsedTime;
      s.playerReady=seat.playerReady;s.connected=seat.connected;s.controlEpoch=seat.epoch;s.lifeStartedAt=seat.lifeStartedAt;s.diedAtMs=seat.diedAtMs;
      for(const k of ['lifeId','alive','hp','armor','kills','deaths','reloadUntil','nextShot','spawnProtectedUntil','recoil'])s[k]=a[k]??0;
      const {primary,pistol,he}=a.inventory;
      Object.assign(s,{ready:true,pending:!!seat.pending,bot:a.controllerType==='bot',money:a.money||0,actionType:a.action?.type||'',actionStart:a.action?.start||0,actionDuration:a.action?.duration||0,weapon:a.weapon,lastWeapon:a.lastWeapon,loadout:a.loadout||'smg',
        aimAmount:a.aimAmount||0,aiming:!!a.aiming,primary:primary?.id||'',primaryAmmo:primary?.ammo||0,primaryReserve:primary?.reserve||0,
        pistol:pistol.id,pistolAmmo:pistol.ammo,pistolReserve:pistol.reserve,he});
      const item=g.item(a);s.ammo=Number.isFinite(item?.ammo)?item.ammo:0;s.reserve=item?.reserve||0;
      s.respawnAt=a.respawnAt??0;s.deathAt=a.deathAt??0;s.hurtTime=Number.isFinite(a.hurtTime)?a.hurtTime:-100;
      s.deathSource=a.deathCause?.sourceName||'';s.deathWeapon=a.deathCause?.weapon||'';
    }
    const active=new Set();
    for(const grenade of g.state.grenades){
      const {id,type,ownerId,team,ownerLifeId,deadline,x,y,z}=grenade;
      active.add(id);
      if(!this.state.grenades.has(id))this.state.grenades.set(id,new GrenadeState({id,type,ownerId,team,ownerLifeId,deadline}));
      Object.assign(this.state.grenades.get(id),{x,y,z});
    }
    for(const id of this.state.grenades.keys())if(!active.has(id))this.state.grenades.delete(id);
    const rockets=this.state.projectiles;
    active.clear();
    for(const {id,ownerId,ownerName,ownerLifeId,team,born,until,x,y,z,vx,vy,vz} of g.state.projectiles){
      active.add(id);
      if(!rockets.has(id))rockets.set(id,new RocketState({id,ownerId,ownerName,ownerLifeId,team,born,until,vx,vy,vz}));
      Object.assign(rockets.get(id),{x,y,z});
    }
    for(const id of rockets.keys())if(!active.has(id))rockets.delete(id);
    this.state.tick=this.sim.tickNumber;this.state.time=g.state.time;
    this.state.analysts=g.state.score.analysts;this.state.counterAnalysts=g.state.score.counterAnalysts;
  }
  onDrop(client,code){
    const seat=this.seats.get(client.sessionId);if(!seat||seat.client!==client)return;
    this.releaseObjectives(seat.actor,false);seat.interactUntil=0;
    seat.enabled=false;seat.aim=seat.trigger=false;if(seat.actor)seat.actor.aimAmount=0;seat.connected=false;seat.playerReady=false;this.inputs.get(client.sessionId).clear();
    this.sim.controllers.unbind(client.sessionId);this.metrics.drops++;this.project();
    // Protocol violations, payload limits and server shutdown never reserve a seat.
    if(seat.ready&&!seat.revoked&&[1000,1001,1005,1006].includes(code))this.allowReconnection(client,RECONNECT_SECONDS).catch(()=>{});
  }
  onReconnect(client){
    const seat=this.seats.get(client.sessionId);if(!seat?.ready||seat.connected)throw new ServerError(409,'Expired player session.');
    seat.client=client;seat.revoked=false;client.ref.once('error',()=>{if(seat.client===client)seat.revoked=true;});seat.connected=true;seat.enabled=false;seat.epoch++;seat.actor.controlEpoch=seat.epoch;
    seat.lastSelect=seat.lastFire=seat.lastReload=seat.lastSampleTick=seat.lastShotStamp=0;seat.probe=null;seat.rtts=[];delete seat.rtt;delete seat.rttAt;
    this.inputs.get(client.sessionId).clear();if(!seat.pending)this.sim.controllers.bind(client.sessionId,seat.id);
    this.metrics.reconnects++;this.project();
  }
  onLeave(client) {
    const seat=this.seats.get(client.sessionId);if(!seat||seat.client!==client)return;
    this.sim.controllers.unbind(client.sessionId);this.inputs.get(client.sessionId).clear();
    if(!seat.pending)this.removeActor(seat.actor);
    this.state.actors.delete(seat.actor?.id||seat.waitId);this.seats.delete(client.sessionId);this.match.ownership();this.fillVacancies();this.project();
  }
  onDispose(){this.teamComms?.dispose();this.lag?.dispose();this.sim?.controllers.clear();this.seats?.clear();this.templates?.clear();this.lives?.clear();}
}
