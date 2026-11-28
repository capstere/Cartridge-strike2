import {purchaseReasons} from '../game-english.mjs';
import {RUSH,rushReady} from '../rush.mjs';
import {networkEndpoint} from './connection.mjs';
import '../../../vendor/colyseus/colyseus.js';
import {Game,WEAPONS} from '../game.mjs';
import {seededRandom} from '../config.mjs';
import {moveActor} from '../movement.mjs';
import {multiplayerMapAnchors} from '../minimap-cache.mjs';
import {TEAM_COMMS_TYPE,TEAM_COMMS_COMMANDS,TEAM_COMMS_RATE_MS} from '../../../shared/multiplayer/protocol.mjs';
import {CLASSIC_NETWORK_CONFIG,NETWORK_CONFIG,ROOM_TYPE,ROOM_CAPACITY,RECONNECT_SECONDS,reliableRoomInput,INTERPOLATION_MS,copyPose,wrapYaw} from '../../../shared/multiplayer/rules.mjs';
import {CONTRACT,MAP_CONTRACTS} from '../../../shared/multiplayer/build.mjs';
import {FAMILY_ROOM_ALIAS} from '../../../shared/multiplayer/family-room.mjs';

import {applyNetworkWorld,createPredictedWorld} from '../../../shared/multiplayer/world.mjs';

const {Client,Predict}=globalThis.Colyseus;
// Capture the SDK-owned pending room so a timeout/cancel also closes its socket.
class SessionClient extends Client {
  createRoom(...args){const room=super.createRoom(...args);room.reconnection.enabled=false;this.owner.joiningRoom=room;return room;}
}
const wait=async(predicate,timeout=15000)=>{
  const end=performance.now()+timeout;
  while(!predicate()){if(performance.now()>end)throw Error('The local server did not become ready.');await new Promise(r=>setTimeout(r,20));}
};
// Match results freeze simulation time. The finishing shot still follows the
// room clock, including on a late client's first snapshot.
function headshotResultTime(room){
  return room.state.time+Math.max(0,room.clock.serverNow()-room.state.resultsAtMs)/1000;
}
function discardSlideRequest(session){
  const predicted=session.prediction?.world?.actor;
  if(predicted)predicted.slideBuffer=0;
  if(session.view?.player)session.view.player.slideBuffer=0;
}
function actorView(s,localId){
  const a={outfitId:s.handling?.outfitId || 'issued',id:s.id,name:s.name,team:s.team,index:Number(s.id.split('-').at(-1)),isPlayer:s.id===localId,controllerType:s.bot?'bot':'human',bot:null,
    cartridge:s.handling?.cartridgeStart?{type:s.weapon,started:s.handling.cartridgeStart,releaseAt:s.handling.cartridgeRelease,deadline:s.handling.cartridgeFuse}:null,
    pending:!!s.pending,radius:NETWORK_CONFIG.radius,weapon:s.weapon,lastWeapon:s.lastWeapon,loadout:s.loadout,aimAmount:s.aimAmount,aiming:s.aiming,money:s.money,flash:0,action:s.actionType?{type:s.actionType,start:s.actionStart,duration:s.actionDuration}:null,
    inventory:{primary:s.primary?{id:s.primary,ammo:s.primaryAmmo,reserve:s.primaryReserve}:null,pistol:{id:s.pistol,ammo:s.pistolAmmo,reserve:s.pistolReserve},knife:{id:'knife',ammo:Infinity,reserve:0},smoke:0,flash:0,he:s.he}};
  copyPose(a,s);
  for(const k of ['lifeId','controlEpoch','connected','alive','hp','armor','kills','deaths','reloadUntil','nextShot','respawnAt','spawnProtectedUntil','deathVariant','hurtTime','recoil'])a[k]=s[k];
  // An unspawned Classic reservation also has alive=false, with no death.
  a.deathAt=s.deathWeapon?s.deathAt:null;
  a.deathCause=s.deathWeapon?{sourceName:s.deathSource,weapon:s.deathWeapon}:null;
  return a;
}

/** A Game-shaped presentation only. Never advances Game combat/rules locally. */
export class NetworkSession {
  constructor(world,{outfitId='issued',loadWorld,onLoading=()=>{},onCombatAudio,onRocketAudio,onDisconnect=()=>{},onConnection=()=>{},onMatch=()=>{}}={}){
    this.loadWorld=loadWorld;this.onLoading=onLoading;this.worldRevision=0;
    this.onCombatAudio=onCombatAudio;this.onRocketAudio=onRocketAudio;this.onMatch=onMatch;this.matchId=0;this.matchPhase='';this.world=world;this.onDisconnect=onDisconnect;this.onConnection=onConnection;this.connectionState='connecting';this.controlEpoch=0;this.closed=false;this.enabled=true;
    this.events=[];this.seenEvent=0;this.predictedShots=new Map();this.actionTimes=new Map();this.remote=new Map();this.residents=new Map();this.projectiles=new Map();this.unsub=[];
    this.fireId=0;this.reloadId=0;this.trigger=false;this.nextCosmetic=0;this.lifeId=0;this.lastPatch=0;
    this.metrics={sent:0,replays:0,adopts:0,resets:0,cosmeticShots:0,confirmedShots:0,suppressedShots:0,corrections:[],adoptionDistance:[],shotLatency:[],hitLatency:[],maxPending:0,reconnects:0};
    this.outfitId=outfitId;
    this.view=new Game(world,{config:NETWORK_CONFIG,localPlayerId:null,controllers:{}});
    Object.assign(this.view.state,{mode:'endless',phase:'menu',round:1,projectiles:[],wanderers:[],orders:{}});
    // Presentation recoil gets its own RNG, never the authority's stream.
    this.view.random=seededRandom(81);this.view.network=true;
    this.view.pause=value=>this.setInputEnabled(!value);
    this.view.reload=()=>{if(!this.closed&&this.enabled&&this.view.player?.alive){this.reloadId++;return true;}return false;};
    this.selectId=0;this.botDifficultySerial=0;
    this.teamAnchors=new Map();
    this.teamCommsSerial=0;
    this.receivedTeamComms=new Map();
    this.nextTeamCommsAt=0;
    this.teamSignal=null;
    this.teamAudioQueued=false;
    this.view.teamPing=null;
    this.view.select=value=>{
      const a=this.view.player;
      if(!this.enabled||!a?.alive||this.closed)return false;
      const slot=({'1':'primary','2':'pistol','3':'knife','4':'he','5':'bomb',[a.inventory.primary?.id]:'primary',[a.inventory.pistol.id]:'pistol'})[value]||value;
      if(!['primary','pistol','knife','he','last','bomb'].includes(slot))return false;
      this.room.send('select',{slot,serial:++this.selectId,lifeId:a.lifeId,controlEpoch:a.controlEpoch});
      return true;
    };
    this.view.radio=this.view.setDifficulty=()=>false;
    this.classicSerial=0;this.purchase=null;
    this.view.drop=()=>this.classicCommand('drop');
    this.view.buy=id=>this.classicCommand('buy',id)?{ok:true,pending:true}:{ok:false,reasonId:'nextRound',reason:purchaseReasons.nextRound};
    this.view.drainEvents=()=>this.drainEvents();
    this.view.update=()=>{throw Error('NetworkSession owns input; the client cannot step Game.');};
  }
  classicCommand(kind,item){
    const a=this.view.player,s=this.room?.state;
    if(!a||s?.mode!=='classic'||this.connectionState!=='connected')return false;
    this.notice='';
    const command={kind,item,serial:++this.classicSerial,round:s.round,matchId:s.matchId,lifeId:a.lifeId,controlEpoch:a.controlEpoch};
    if(kind==='buy')this.purchase={...command,outcome:'pending'};
    this.room.send('classic', command);
    return true;
  }
  currentPurchase(){
    const p=this.purchase, state=this.room?.state, self=state?.actors.get(this.localPlayerId);
    if(!p || !self || this.closed || this.connectionState!=='connected' || state.phase!=='active' ||
       state.mode!=='classic' || state.roundPhase!=='buy' || !self.alive || !self.connected ||
       p.round!==state.round || p.matchId!==state.matchId || p.lifeId!==self.lifeId || p.controlEpoch!==self.controlEpoch)return null;
    return p;
  }
  receivePurchase(reply){
    const pending=this.currentPurchase();
    if(!pending || pending.outcome!=='pending' || !reply ||
       !['matchId','round','lifeId','controlEpoch','serial','item'].every(key=>reply[key]===pending[key]))return;
    if(reply.outcome!=='accepted' && !(reply.outcome==='denied' && Object.hasOwn(purchaseReasons,reply.reasonId)))return;
    this.purchase={...pending,outcome:reply.outcome,reasonId:reply.reasonId};
  }
  teamCommsActor(){
    const state=this.room?.state;
    if(this.closed||this.connectionState!=='connected'||state?.phase!=='active'||
      (state.mode==='classic'&&state.roundPhase!=='active'))return null;
    const self=state.actors.get(this.localPlayerId);
    return self?.ready&&self.connected&&self.alive&&!self.pending?self:null;
  }
  canSendTeamComms(){
    return this.enabled&&!!this.teamCommsActor();
  }
  sendTeamComms(kind,anchorId){
    const self=this.teamCommsActor();
    if(!this.enabled||!self||!TEAM_COMMS_COMMANDS.includes(kind))return false;
    if(kind==='ping'&&!this.teamAnchors.has(anchorId))return false;
    const now=performance.now();
    if(now<this.nextTeamCommsAt)return false;
    const state=this.room.state;
    const message={kind,serial:++this.teamCommsSerial,matchId:state.matchId,round:state.round,
      lifeId:self.lifeId,controlEpoch:self.controlEpoch,tick:state.tick};
    if(kind==='ping')message.anchorId=anchorId;
    this.room.send(TEAM_COMMS_TYPE,message);
    this.nextTeamCommsAt=now+TEAM_COMMS_RATE_MS;
    return true;
  }
  validTeamComms(message){
    const self=this.teamCommsActor();
    if(!self||!message)return false;
    const state=this.room.state;
    if(message.team!==self.team||message.matchId!==state.matchId||message.round!==state.round||
      message.recipientLifeId!==self.lifeId||message.recipientEpoch!==self.controlEpoch||
      !Number.isFinite(message.expiresAt)||message.expiresAt<=this.view.state.time)return false;
    const sender=state.actors.get(message.senderId);
    return !!sender?.connected&&sender.alive&&!sender.bot&&sender.team===self.team&&
      sender.lifeId===message.senderLifeId&&sender.controlEpoch===message.senderEpoch;
  }
  receiveTeamComms(message){
    if(!this.validTeamComms(message)||!TEAM_COMMS_COMMANDS.includes(message.kind)||
      !Number.isSafeInteger(message.serial)||message.serial<=(this.receivedTeamComms.get(message.team)||0))return;
    const anchor=message.kind==='ping'?this.teamAnchors.get(message.anchorId):null;
    if(message.kind==='ping'&&!anchor)return;
    this.receivedTeamComms.set(message.team,message.serial);
    this.teamSignal={...message,anchor};
    if(anchor)this.view.teamPing=this.teamSignal;
    else if(this.enabled){
      const sender=this.room.state.actors.get(message.senderId);
      this.teamAudioQueued=true;
      this.events.push({type:'radio',teamPrivate:true,teamPacket:message,command:message.kind,
        actorId:sender.id,team:sender.team,x:sender.x,y:sender.y,z:sender.z,time:this.view.state.time,global:true});
    }
  }
  drainEvents(){
    const batch=this.events;
    this.events=[];
    if(!this.teamAudioQueued)return batch;
    this.teamAudioQueued=false;
    return batch.filter(event=>!event.teamPrivate||this.enabled&&this.validTeamComms(event.teamPacket));
  }
  clearTeamComms(){
    this.teamSignal=null;
    this.view.teamPing=null;
    if(this.teamAudioQueued)this.events=this.events.filter(event=>!event.teamPrivate);
    this.teamAudioQueued=false;
  }
  expireTeamComms(){
    if(this.teamSignal&&!this.validTeamComms(this.teamSignal))this.teamSignal=null;
    if(this.view.teamPing&&!this.validTeamComms(this.view.teamPing))this.view.teamPing=null;
  }
  async connect({endpoint,roomId,code,name,family,mapId,team='auto',mode='tdm',fillBots=true,zombies=false,danceman=false,create=false,contract=CONTRACT}){
    const url=networkEndpoint(endpoint),client=new SessionClient(url),options={code,name,team,contract,fillBots,mode,zombies,danceman};
    if(create&&mapId)options.mapId=mapId;
    client.owner=this;
    this.joinAbort=new AbortController();client.http.options.signal=this.joinAbort.signal;
    const pending=family===FAMILY_ROOM_ALIAS?client.joinOrCreate(FAMILY_ROOM_ALIAS,{code,name,team,contract}):
      create?client.create(ROOM_TYPE,options):client.joinById(roomId,options);
    let expired=false;
    const timeout=new Promise((_,reject)=>{this.joinTimer=setTimeout(()=>{expired=true;this.joinAbort.abort();this.joiningRoom?.leave(false).catch(()=>{});reject(Error('Connection timeout.'));},10000);});
    let room;
    try{room=await Promise.race([pending.then(room=>{if(expired||this.closed){room.leave();throw Error('Join cancelled.');}return room;}),timeout]);}
    finally{clearTimeout(this.joinTimer);this.joinTimer=null;}
    if(this.closed){await room.leave();throw Error('Join cancelled.');}
    this.joiningRoom=null;this.room=room;this.familyAlias=room.name===FAMILY_ROOM_ALIAS?FAMILY_ROOM_ALIAS:'';
    Object.assign(room.reconnection,{enabled:true,minUptime:0,minDelay:150,maxDelay:1000,maxRetries:30,maxEnqueuedMessages:0});
    this.unsub.push(room.onMessage('problem',message=>{this.problem=String(message);}));
    this.unsub.push(room.onMessage('purchase',message=>this.receivePurchase(message)));
    this.unsub.push(room.onMessage('notice',message=>{this.notice=String(message);}));
    this.unsub.push(room.onMessage('events',events=>{if(this.worldRevision===room.state.worldRevision)this.receiveEvents(events);}));
    this.unsub.push(room.onMessage(TEAM_COMMS_TYPE,message=>this.receiveTeamComms(message)));
    this.unsub.push(room.onMessage('clock-probe',token=>{if(!this.closed&&this.connectionState==='connected')room.send('clock-echo',token);}));
    const dropped=()=>this.beginReconnect();
    const reconnected=()=>{if(this.closed)return;this.awaitingSnapshot=true;this.sentReadyRevision=null;};
    room.onDrop(dropped);this.unsub.push(()=>room.onDrop.remove(dropped));
    room.onReconnect(reconnected);this.unsub.push(()=>room.onReconnect.remove(reconnected));
    const left=code=>{
      if(this.closed)return;
      const retry=this.familyAlias?'Reopen the family room using its permanent link.':'Rejoin the room, or create one if the server restarted.';
      const problem=this.problem||`Connection lost (${code}). ${retry}`;
      this.problem=problem;this.dispose(false);this.onDisconnect(problem);
    };
    const changed=()=>this.snapshot();
    // SDK signals return their emitter, whereas onMessage returns a disposer.
    room.onLeave(left);this.unsub.push(()=>room.onLeave.remove(left));
    room.onStateChange(changed);this.unsub.push(()=>room.onStateChange.remove(changed));
    await wait(()=>this.closed||[...(room.state.actors?.values()||[])].some(a=>a.sessionId===room.sessionId));
    if(this.closed)throw Error(this.problem||'Room closed during loading.');
    this.localPlayerId=[...room.state.actors.values()].find(a=>a.sessionId===room.sessionId).id;
    this.view.localPlayerId=this.localPlayerId;this.view.team=this.localPlayerId.split('-')[0];
    this.input=reliableRoomInput(room);
    if(this.input.stepSeconds!==NETWORK_CONFIG.fixedStep)throw Error('Incompatible simulation step.');
    this.predict=Predict.get(room,{mode:'lerp',delay:INTERPOLATION_MS});
    this.snapshot();
    await wait(()=>this.closed||(this.worldRevision===room.state.worldRevision&&room.state.actors.get(this.localPlayerId)?.ready),125000);
    if(this.closed)throw this.problem instanceof Error ? this.problem : Error(this.problem||'Room closed before spawn.');
    this.connectionState='connected';this.snapshot();
    this.lastWatchdog=performance.now();this.silenceSince=0;
    this.watchdog=setInterval(()=>this.checkConnection(performance.now()),1000);
    return this;
  }
  resetWorldBindings(){
    this.prediction?.dispose();
    this.prediction=null;
    for(const collection of [this.remote,this.residents,this.projectiles]){
      for(const entry of collection.values())this.predict.detach(entry.schema);
      collection.clear();
    }
    if(this.worldSchema)this.predict.detach(this.worldSchema);
    for(const door of this.doorSchemas||[])this.predict.detach(door);
    this.doorSchemas=[];this.worldSchema=null;this.glassCount=undefined;
    this.matchMode=null;this.matchPhase='';this.matchId=0;
    this.events=[];this.clearTeamComms();this.teamAnchors.clear();this.receivedTeamComms.clear();
    this.predictedShots.clear();this.actionTimes.clear();
    this.view.state.actors=[];
  }
  prepareRoomWorld(state){
    const {mapId,worldRevision}=state;
    if(this.loadingRevision===worldRevision)return;
    const contract=Object.hasOwn(MAP_CONTRACTS,mapId)&&MAP_CONTRACTS[mapId];
    if(!contract||worldRevision<1||(this.worldRevision&&!this.awaitingSnapshot&&state.phase!=='waiting')){
      this.disconnect('Incompatible room world. Reload the game.');return;
    }
    this.loadingRevision=worldRevision;
    this.mapAbort?.abort();this.mapAbort=new AbortController();
    const signal=this.mapAbort.signal;
    this.resetWorldBindings();this.onLoading(mapId);
    this.loadWorld(contract,state.mode,signal).then(world=>{
      if(signal.aborted||this.closed||worldRevision!==this.room.state.worldRevision)return;
      this.world=this.view.world=world;
      this.worldRevision=worldRevision;this.loadingRevision=null;
      this.snapshot();
    }).catch(error=>{
      if(!signal.aborted&&!this.closed)this.disconnect(error);
    });
  }
  snapshot(){
    if(this.closed||!this.localPlayerId||!this.predict)return;
    this.lastPatch=performance.now();
    const state=this.room.state;
    if(this.awaitingSnapshot){
      // A reserved seat may have missed a waiting-room map selection.
      clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
    }
    if(this.worldRevision!==state.worldRevision){this.prepareRoomWorld(state);return;}
    const mine=[...state.actors.values()].find(a=>a.sessionId===this.room.sessionId);
    if(mine&&mine.id!==this.localPlayerId){
      this.prediction?.dispose();this.prediction=null;this.localPlayerId=mine.id;
      this.view.localPlayerId=mine.id;this.view.team=mine.team;
    }
    if(!mine?.ready){
      if(mine&&this.sentReadyRevision!==state.worldRevision&&(this.connectionState!=='reconnecting'||this.awaitingSnapshot)){
        this.sentReadyRevision=state.worldRevision;
        this.room.send('ready',{...MAP_CONTRACTS[state.mapId],outfitId:this.outfitId,worldRevision:state.worldRevision});
      }
      return;
    }
    const classic=state.mode==='classic',newRound=classic&&this.view.state.round!==state.round;
    const modeChanged=this.matchMode!==state.mode;
    if(modeChanged){
      this.matchMode=state.mode;
      this.teamAnchors=new Map(multiplayerMapAnchors(this.world,classic).map(anchor=>[anchor.id,anchor]));
    }
    this.view.config=classic?CLASSIC_NETWORK_CONFIG:NETWORK_CONFIG;
    this.view.state.difficulty=state.botDifficulty??this.view.config.difficulty;
    this.view.state.mode=classic?'classic':'endless';
    const newMatch=this.matchId!==state.matchId,newPhase=this.matchPhase!==state.phase;
    if(newMatch||newRound||modeChanged){
      this.events=[];
      this.clearTeamComms();
    }
    if(newMatch||newPhase||modeChanged){
      this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;this.confirmedLocalShots?.clear();
      this.matchId=state.matchId;this.matchPhase=state.phase;
      this.resultsAt=state.phase==='results'?this.lastPatch:undefined;
      this.view.state.headshotTime=this.resultsAt!==undefined?headshotResultTime(this.room):undefined;
      this.prediction?.reset();this.keepRocketEffects();this.predictedShots.clear();this.actionTimes.clear();this.nextCosmetic=0;
      if(newMatch){for(const entry of this.remote.values())this.predict.detach(entry.schema);this.remote.clear();}
      this.view.state.round=classic?state.round:state.matchId;
    }
    this.view.state.phase=classic?state.roundPhase:'active';
    if(classic){
      const view=this.view.state;
      Object.assign(view,{round:state.round,buyDeadline:state.buyDeadline,deadline:state.deadline,resultDeadline:state.resultDeadline,
        result:state.roundReason?{reason:state.roundReason,winner:state.roundWinner}:null,
        bomb:{status:state.bombStatus,carrierId:state.carrierId,x:state.bombX,y:state.bombY,z:state.bombZ,deadline:state.bombDeadline},
        hostages:[...state.hostages.values()].map(h=>({id:h.id,name:h.name,kind:'hostage',height:1.6,radius:NETWORK_CONFIG.radius,
          x:h.x,y:h.y,z:h.z,yaw:h.yaw,alive:h.alive,rescued:h.rescued,escortId:h.escortId||null,distanceWalked:h.distanceWalked}))});
    }else if(modeChanged){
      Object.assign(this.view.state,{hostages:[],bomb:{status:'none'},result:null,deadline:Infinity,buyDeadline:0,resultDeadline:0});
    }
    const ready=[...state.actors.values()].filter(a=>a.ready&&(!a.pending||a.id===this.localPlayerId));
    if(this.awaitingSnapshot){
      // onReconnect precedes the full state; only this callback can adopt it.
      this.awaitingSnapshot=false;clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
      this.connectionState='connected';this.metrics.reconnects++;this.adoptedReconnect=true;
      for(const entry of this.remote.values())this.predict.detach(entry.schema);this.remote.clear();
      this.prediction?.reset();this.events=[];this.predictedShots.clear();
      this.onConnection('connected');
    }
    if(this.worldSchema!==state&&state.doors&&this.predict.attach){
      if(this.worldSchema)this.predict.detach(this.worldSchema);
      for(const s of this.doorSchemas||[])this.predict.detach(s);
      this.worldSchema=state;this.doorSchemas=[...state.doors.values()];
      this.predict.attach(state,{elevatorProgress:'lerp'});
      for(const d of this.doorSchemas)this.predict.attach(d,{poseAngle:'lerp'});
    }
    if(newMatch||newRound||modeChanged||this.glassCount===undefined){this.world.glass.reset();this.glassCount=-1;}
    if(this.glassCount!==state.brokenGlass.size){
      for(const id of state.brokenGlass.keys()){
        const pane=this.world.glass.panes.get(id);
        if(pane&&!pane.broken)this.world.glass.breakAt(pane.parts[0]);
      }
      this.glassCount=state.brokenGlass.size;
    }
    this.view.state.grenades=[...state.grenades.values()];
    applyNetworkWorld(this.world.doors,state);
    this.view.state.actors=ready.map(s=>actorView(s,this.localPlayerId));
    this.view.state.score={analysts:state.analysts,counterAnalysts:state.counterAnalysts};
    this.view.state.time=newMatch?state.time:Math.max(this.view.state.time??0,state.time);
    const self=state.actors.get(this.localPlayerId);
    this.expireTeamComms();
    for(const [id,entry] of this.remote)if(!ready.some(s=>s.id===id&&s===entry.schema&&s.lifeId===entry.lifeId&&s.alive===entry.alive)){
      this.predict.detach(entry.schema);this.remote.delete(id);
    }
    for(const s of ready)if(s.id!==this.localPlayerId&&!this.remote.has(s.id)){
      this.predict.attach(s,{x:'lerp',y:'lerp',z:'lerp',height:'lerp',yaw:{mode:'lerp',angle:true},pitch:{mode:'lerp',angle:true}});
      this.remote.set(s.id,{schema:s,lifeId:s.lifeId,alive:s.alive});
    }
    for(const [id,entry] of this.residents){
      if(state.residents.get(id)===entry.schema&&entry.view.lifeId===entry.schema.lifeId&&!this.adoptedReconnect)continue;
      this.predict.detach(entry.schema);this.residents.delete(id);
    }
    for(const [id,entry] of this.projectiles){
      if(state.projectiles.get(id)===entry.schema&&!this.adoptedReconnect)continue;
      this.predict.detach(entry.schema);this.projectiles.delete(id);
    }
    this.adoptedReconnect=false;
    for(const rocket of state.projectiles.values()){
      if(!this.projectiles.has(rocket.id)){
        this.predict.attach(rocket,{x:'lerp',y:'lerp',z:'lerp'});
        this.projectiles.set(rocket.id,{schema:rocket,view:{id:rocket.id,vx:rocket.vx,vy:rocket.vy,vz:rocket.vz}});
      }
      Object.assign(this.projectiles.get(rocket.id).view,{x:rocket.x,y:rocket.y,z:rocket.z});
    }
    this.view.state.projectiles=[...this.projectiles.values()].map(entry=>entry.view);
    for(const s of state.residents.values()){
      let entry=this.residents.get(s.id);
      if(!entry){
        this.predict.attach(s,{x:'lerp',y:'lerp',z:'lerp',yaw:{mode:'lerp',angle:true}});
        entry={schema:s,view:{}};this.residents.set(s.id,entry);
      }
      const view=entry.view;
      for(const key of ['id','lifeId','name','model','x','y','z','yaw','radius','height','alive','hp','behavior','clip','poseAt','rate','offset','loop'])view[key]=s[key];
      view.kind='zombie';
    }
    this.view.state.zombies=[...this.residents.values()].map(entry=>entry.view);
    if(!self?.ready)return;
    if(!this.prediction){
      const actor=actorView(self,this.localPlayerId);
      const game={world:this.world,config:NETWORK_CONFIG,actors:[actor],hostages:[],state:{time:state.time,zombies:[]}};
      const dynamics=createPredictedWorld(this.world);
      // The pinned SDK only populates lastCorrection when diagnostics are
      // enabled. An infinite public warning threshold enables the gauge without
      // flooding the console; the bounded sample ring below owns retention.
      this.prediction=this.predict.sim({input:this.input,world:{game,actor,dynamics},smoothMs:45,warnOnDivergence:Infinity,
        adopt:w=>{
          const s=this.room.state.actors.get(this.localPlayerId);if(!s)return;
          this.metrics.adopts++;const d=Math.hypot(w.actor.x-s.x,w.actor.y-s.y,w.actor.z-s.z);
          this.metrics.adoptionDistance.push(d);if(this.metrics.adoptionDistance.length>512)this.metrics.adoptionDistance.shift();
          w.dynamics.adopt(this.room.state);
          copyPose(w.actor,s);
          if(!this.enabled)w.actor.slideBuffer=0;
          w.actor.reloadUntil=s.reloadUntil;w.actor.cartridge=s.handling?.cartridgeStart || null;w.actor.action=s.actionType?{type:s.actionType}:null;w.actor.alive=s.alive;w.actor.lifeId=s.lifeId;w.game.state.time=this.room.state.time;
          w.game.hostages=this.view.hostages;
          w.game.state.zombies=[...this.residents.values()].map(({schema:s})=>({id:s.id,x:s.x,y:s.y,z:s.z,height:s.height,radius:s.radius,alive:s.alive}));
          w.game.actors=[w.actor,...[...this.room.state.actors.values()].filter(a=>a.ready&&a.id!==s.id).map(a=>actorView(a,null))];
        },
        step:(ctx,w,f)=>{
          if(ctx.isReplay)this.metrics.replays++;
          if(this.room.state.phase!=='active'||this.room.state.mode==='classic'&&this.room.state.roundPhase!=='active'||!w.actor.alive||f.lifeId!==w.actor.lifeId||f.controlEpoch!==this.controlEpoch)return;
          w.game.state.time+=ctx.dt;
          w.dynamics.step(w.game.state.time,ctx.dt,[...w.game.actors,...w.game.hostages,...w.game.state.zombies],()=>moveActor(w.game,w.actor,f,ctx.dt,false));
        },
        pose:w=>({x:w.actor.x,y:w.actor.y,z:w.actor.z}),
        onReconcile:()=>{if(!this.prediction)return;const c=this.prediction.lastCorrection;
          this.metrics.corrections.push(Math.hypot(c.x||0,c.y||0,c.z||0));if(this.metrics.corrections.length>512)this.metrics.corrections.shift();},
      });
    }
    if(this.cosmeticWeapon!==self.weapon){this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;this.nextCosmetic=0;this.cosmeticWeapon=self.weapon;}
    const newLife=self.lifeId!==this.lifeId;
    if(newLife||self.alive!==this.alive||self.controlEpoch!==this.controlEpoch){
      const newConnection=self.controlEpoch!==this.controlEpoch;this.controlEpoch=self.controlEpoch;
      this.lifeId=self.lifeId;this.alive=self.alive;this.metrics.resets++;
      // Reset the replay controller, NOT InputHandle's reliable wire counters.
      this.prediction.reset();if(newLife||newConnection){this.predictedShots.clear();this.actionTimes?.clear();}this.nextCosmetic=0;
      this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;this.confirmedLocalShots?.clear();
      this.fireId=0;this.reloadId=0;this.trigger=false;
      this.keepRocketEffects();
    }
    if(newMatch||newPhase||modeChanged)queueMicrotask(()=>{if(!this.closed)this.onMatch(this.matchPhase);});
  }
  matchCommand(kind,extra={}){
    const self=this.room?.state.actors.get(this.localPlayerId);if(!self||this.connectionState!=='connected')return;
    this.notice='';this.room.send('match',{kind,matchId:this.room.state.matchId,controlEpoch:self.controlEpoch,...extra});
  }
  setBotDifficulty(botDifficulty){
    this.matchCommand('botDifficulty',{botDifficulty,serial:++this.botDifficultySerial});
  }
  keepRocketEffects(){this.events=this.events.filter(event=>event.rocketId);}
  receiveEvents(events){
    if(this.closed||this.connectionState==='reconnecting'||!Array.isArray(events))return;
    for(let event of events.slice(-64)){
      const rocketEffect=!!event.rocketId;
      if(event.matchId!==undefined&&event.matchId!==this.room.state.matchId)continue;
      if(event.eventId<=this.seenEvent)continue;this.seenEvent=event.eventId;
      const actor=this.room.state.actors.get(event.actorId)||this.room.state.residents.get(event.actorId);
      if(event.round!==undefined&&this.room.state.mode==='classic'&&event.round!==this.room.state.round)continue;
      if(event.type!=='rocket-launch'&&event.actorId&&!this.room.state.hostages?.has(event.actorId)&&(!actor||event.lifeId&&actor.lifeId!==event.lifeId||event.controlEpoch!==undefined&&(actor.controlEpoch??0)!==event.controlEpoch))continue;
      const source=this.room.state.actors.get(event.sourceId)||this.room.state.residents.get(event.sourceId);
      if(event.sourceId&&(!source||event.sourceLifeId&&source.lifeId!==event.sourceLifeId||event.sourceControlEpoch!==undefined&&(source.controlEpoch??0)!==event.sourceControlEpoch)){
        if(!rocketEffect)continue;
        event={...event,sourceId:undefined};
      }
      if(event.type==='shot'&&event.actorId===this.localPlayerId){
        this.metrics.confirmedShots++;
        this.confirmedLocalShots ??= new Set();
        this.confirmedLocalShots.add(event.actionId);
        if(this.confirmedLocalShots.size>128)this.confirmedLocalShots.delete(this.confirmedLocalShots.values().next().value);
        const sent=this.predictedShots.get(event.actionId);
        if(sent!==undefined&&this.metrics.shotLatency){this.metrics.shotLatency.push(performance.now()-sent);if(this.metrics.shotLatency.length>512)this.metrics.shotLatency.shift();}
        if(this.predictedShots.has(event.actionId)){this.predictedShots.delete(event.actionId);this.metrics.suppressedShots++;continue;}
      }
      if(event.type==='hit'&&event.sourceId===this.localPlayerId){const sent=this.actionTimes?.get(event.actionId);
        if(sent!==undefined){this.metrics.hitLatency.push(performance.now()-sent);if(this.metrics.hitLatency.length>512)this.metrics.hitLatency.shift();}}
      if(this.enabled||rocketEffect&&['active','results'].includes(this.room.state.phase)){
        // Schedule fresh confirmed gunfire and slide starts on receipt. Rendering may resume after
        // the audio freshness window. Muzzle and rocket visuals keep their event.
        const rocketSound=event.type==='rocket-launch'||event.type==='rocket-explosion';
        if(event.type==='shot'||event.type==='slide'||rocketSound){
          const present=this.onCombatAudio??(rocketSound?this.onRocketAudio:undefined);
          if(present?.(event,this.room.state.time))event={...event,audioPresented:true};
        }
        this.events.push(event);
      }
    }
    this.events=this.events.slice(-128);
  }
  advanceFrame(now,controls={}){
    if(this.closed||this.connectionState==='reconnecting'||!this.predict||!this.prediction)return;
    const steps=Math.min(6,this.predict.tick(now)),state=this.room.state,self=state.actors.get(this.localPlayerId);
    if(!self)return;
    const weapon=Object.hasOwn(WEAPONS,self.weapon)?WEAPONS[self.weapon]:null;
    const throwing=self.weapon==='he';
    const stocked=throwing?self.he>0:self.ammo>0 || self.weapon==='knife';
    const stale=performance.now()-this.lastPatch>1000;
    if(this.enabled && !stale && self.alive && state.phase==='active' && (state.mode!=='classic'||state.roundPhase==='active')){
      if(controls.crouchEdge)this.crouchEdge=true;
      if(controls.firePress)this.firePress ??= controls.firePress;
    }else{this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;}
    for(let i=0;i<steps;i++){
      if(state.phase!=='active'||!this.enabled||!self.alive||stale)break;
      const data=this.input.data;
      Object.assign(data,{lifeId:self.lifeId,controlEpoch:self.controlEpoch,sampleTick:state.tick,fireId:this.fireId,reloadId:this.reloadId,
        forward:controls.forward||0,strafe:controls.strafe||0,yaw:wrapYaw(controls.yaw??self.yaw),pitch:controls.pitch??self.pitch,
        holdThrow:throwing && stocked && !!controls.fire && !controls.autoFire,jump:!!controls.jump,crouch:!!controls.crouch,crouchEdge:!!this.crouchEdge,sneak:!!controls.sneak,sprint:!!controls.sprint,
        fireEdge:!!weapon && !!this.firePress,shotYaw:wrapYaw(this.firePress?.yaw??0),shotPitch:this.firePress?.pitch??0,interact:!!controls.interact,aim:!!controls.aim,fire:!!weapon && !!controls.fire});
      const time=this.prediction.world.game.state.time;
      const shotReady=!!weapon && (!self.handling?.waitTriggerRelease || data.fireEdge) && !self.handling?.cartridgeStart && (state.mode!=='classic'||state.roundPhase==='active')&&time+1e-8>=Math.max(this.nextCosmetic,self.nextShot)&&
        stocked && !self.reloadUntil;
      const actor=this.prediction.world.actor,shouldered=rushReady(actor);
      if(data.fireEdge)data.fire=true;
      if(controls.autoFire && !data.fireEdge){
        // Auto-trigger is local input intent, never a new server privilege.
        // Semi-auto weapons need a real release between ordinary fire frames;
        // generate it per fixed input step, including render catch-up batches.
        const eligible=!!weapon && ['primary','pistol','knife'].includes(weapon.slot)&&!weapon.projectile;
        data.fire=data.fire&&eligible&&(weapon.automatic||(!this.trigger&&shotReady));
      }
      const manualPress=data.fireEdge || (!this.trigger && data.fire && !controls.autoFire);
      if(shotReady && !this.pendingCosmetic && data.fire && (weapon.automatic || !this.trigger || data.fireEdge) &&
        (shouldered || manualPress)){
        data.fireId=++this.fireId;
        this.pendingCosmetic={weapon:self.weapon,id:data.fireId,yaw:data.fireEdge?data.shotYaw:data.yaw,
          pitch:data.fireEdge?data.shotPitch:data.pitch,until:time+RUSH.edgeLifetime};
      }
      this.crouchEdge=false;this.firePress=null;
      const pending=this.pendingCosmetic;
      if(pending && (pending.weapon!==self.weapon || self.reloadUntil || time>pending.until))this.pendingCosmetic=null;
      else if(pending && shouldered){
        this.pendingCosmetic=null;this.nextCosmetic=time+weapon.interval;
        if(!throwing&&!weapon.projectile){
          const actionId=`${self.id}:${self.lifeId}:${self.controlEpoch}:${pending.id}`;
          // A late prediction must not replay a shot already seen from the authority.
          if(!this.confirmedLocalShots?.has(actionId)){
            this.predictedShots.set(actionId,performance.now());this.actionTimes.set(actionId,performance.now());this.metrics.cosmeticShots++;
            this.events.push({type:'shot',actorId:self.id,team:self.team,weapon:self.weapon,time:this.view.state.time,
              x:actor.x,y:actor.y,z:actor.z,yaw:pending.yaw,pitch:pending.pitch,actionId,lifeId:self.lifeId,predicted:true});
          }
        }
      }
      this.trigger=data.fire;
      this.input.send();this.metrics.sent++;
    }
    this.metrics.maxPending=Math.max(this.metrics.maxPending,this.input.pendingCount);
    // A stalled renderer can receive a confirmation long after the effect was
    // shown. Keep a bounded action history until confirmation or a life reset;
    // wall-clock expiry could replay the same muzzle/audio after the stall.
    while(this.predictedShots.size>128)this.predictedShots.delete(this.predictedShots.keys().next().value);
    while(this.actionTimes?.size>128)this.actionTimes.delete(this.actionTimes.keys().next().value);
    this.updateDisplayTime(state,now);
    for(const a of this.view.actors){
      const s=state.actors.get(a.id);if(!s)continue;
      if(a.isPlayer&&a.alive){
        copyPose(a,this.prediction.world.actor);
        for(const key of ['x','y','z'])a[key]=this.prediction.value(key);
        // Free look stays immediate even between fixed input steps.
        if(this.enabled){a.yaw=wrapYaw(controls.yaw??a.yaw);a.pitch=controls.pitch??a.pitch;}
      }else if(a.alive)for(const key of ['x','y','z','height','yaw','pitch'])a[key]=this.predict.value(s,key);
    }
    for(const {schema,view} of this.residents.values()){
      for(const key of ['x','y','z','yaw'])view[key]=this.predict.value(schema,key);
    }
    for(const {schema,view} of this.projectiles.values()){
      for(const key of ['x','y','z'])view[key]=this.predict.value(schema,key);
    }
    // Display doors/shutters at the same snapshot time as remote hitboxes.
    // Local movement uses its separate, authoritative/replayed collision context.
    for(const d of this.world.doors?.doors||[]){const s=state.doors.get(d.id),angle=this.predict.value(s,'poseAngle');
      d.angle=Math.abs(angle);d.sign=Math.sign(angle)||s.sign;this.world.doors.pose(d);}
    if(this.predict.value)this.world.doors.elevators.setProgress(this.predict.value(state,'elevatorProgress'));
    const rtt=Math.round(this.room.clock?.smoothedRtt?.()||0);
    this.status=stale?'Waiting for the connection · controls paused':`${this.room.roomId} · ${this.view.actors.filter(a=>!a.pending).length}/${ROOM_CAPACITY} · ${rtt} ms${rtt>=200?' · High latency':''}`;
  }
  updateDisplayTime(state,now){
    const results=this.resultsAt!==undefined,elapsed=Math.max(0,(now-(this.resultsAt??this.lastPatch))/1000);
    const time=state.time+Math.min(results?2:.1,elapsed);
    this.view.state.time=Math.max(this.view.state.time??0,time);
    if(this.view.state.headshotTime!==undefined){
      this.view.state.headshotTime=Math.max(this.view.state.headshotTime,headshotResultTime(this.room));
    }
  }
  setInputEnabled(enabled){
    if(this.closed)return;
    enabled=!!enabled && this.connectionState!=='reconnecting';
    const generation=[this.localPlayerId,this.matchId,this.matchPhase,this.lifeId,this.controlEpoch].join('/');
    if(this.enabled===enabled && this.lastControlGeneration===generation)return;
    this.lastControlGeneration=generation;
    this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;
    this.trigger=false;this.enabled=enabled;this.view.state.paused=!enabled;
    this.keepRocketEffects();
    if(this.room&&this.lifeId&&this.connectionState!=='reconnecting')this.room.send('controls',{enabled,lifeId:this.lifeId,controlEpoch:this.controlEpoch});
    if(enabled&&this.prediction)this.prediction.reset();
    discardSlideRequest(this);
  }
  checkConnection(now){
    if(this.closed||this.connectionState!=='connected')return;
    const stalled=now-this.lastWatchdog>1500;this.lastWatchdog=now;
    // A blocked renderer/background timer cannot observe network liveness.
    // Allow queued socket callbacks to run after resuming before declaring a
    // silent connection dead. Input already stops after 1 s without a patch.
    if(stalled||now-this.lastPatch<=1000){this.silenceSince=0;return;}
    this.silenceSince ||= now;
    if(now-this.silenceSince>=2000)this.interruptConnection();
  }
  beginReconnect(){
    if(this.closed||this.connectionState==='reconnecting')return;
    this.crouchEdge=false;this.firePress=null;this.pendingCosmetic=null;
    discardSlideRequest(this);
    this.connectionState='reconnecting';this.purchase=null;this.enabled=false;this.view.state.paused=true;
    this.events=[];this.clearTeamComms();this.status='Reconnecting… Your seat is reserved for 15 seconds. The match continues.';
    this.onConnection('reconnecting');
    this.reconnectTimer=setTimeout(()=>{
      const retry=this.familyAlias?'Reopen the family room using its permanent link.':'Rejoin the room.';
      this.disconnect('Reconnection failed. Your seat expired or the server restarted. '+retry);
    },RECONNECT_SECONDS*1000);
  }
  interruptConnection(){
    if(this.closed||this.connectionState==='reconnecting')return;
    // An unconsented transport close enters the SDK's single retry owner.
    this.beginReconnect();this.room?.connection.close();
  }
  disconnect(message){
    if(this.closed)return;this.problem=message;this.dispose();this.onDisconnect(message);
  }
  dispose(leave=true){
    if(this.closed)return;this.closed=true;this.connectionState='disconnected';
    clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
    clearInterval(this.watchdog);this.watchdog=null;clearTimeout(this.joinTimer);this.joinTimer=null;this.joinAbort?.abort();this.mapAbort?.abort();
    for(const off of this.unsub)if(typeof off==='function')off();this.unsub=[];
    this.predict?.dispose();this.prediction=null;this.predict=null;this.remote.clear();
    this.events=[];this.clearTeamComms();this.teamAnchors.clear();this.receivedTeamComms.clear();this.predictedShots.clear();this.actionTimes?.clear();this.view.state.actors=[];this.view.state.phase='menu';
    const room=this.room||this.joiningRoom;this.room=null;this.joiningRoom=null;this.input=null;
    if(leave&&room){room.reconnection.enabled=false;return room.leave().catch(()=>{});}
  }
}
