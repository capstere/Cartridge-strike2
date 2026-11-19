import {networkEndpoint} from './connection.mjs';
import '../../../vendor/colyseus/colyseus.js';
import {Game,WEAPONS} from '../game.mjs';
import {seededRandom} from '../config.mjs';
import {moveActor} from '../movement.mjs';
import {NETWORK_CONFIG,ROOM_TYPE,ROOM_CAPACITY,RECONNECT_SECONDS,INTERPOLATION_MS,copyPose,wrapYaw} from '../../../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../../../shared/multiplayer/build.mjs';

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
function actorView(s,localId){
  const a={id:s.id,name:s.name,team:s.team,index:Number(s.id.split('-').at(-1)),isPlayer:s.id===localId,controllerType:s.bot?'bot':'human',bot:null,
    radius:NETWORK_CONFIG.radius,weapon:s.weapon,lastWeapon:s.lastWeapon,loadout:s.loadout,aimAmount:s.aimAmount,aiming:s.aiming,money:0,flash:0,action:null,
    inventory:{primary:{id:s.primary,ammo:s.primaryAmmo,reserve:s.primaryReserve},pistol:{id:s.pistol,ammo:s.pistolAmmo,reserve:s.pistolReserve},knife:{id:'knife',ammo:Infinity,reserve:0},smoke:0,flash:0,he:s.he}};
  copyPose(a,s);
  for(const k of ['lifeId','controlEpoch','connected','alive','hp','armor','kills','deaths','reloadUntil','nextShot','respawnAt','spawnProtectedUntil','deathAt','hurtTime','recoil'])a[k]=s[k];
  a.deathCause=s.deathWeapon?{sourceName:s.deathSource,weapon:s.deathWeapon}:null;
  return a;
}

/** A Game-shaped presentation only. Never advances Game combat/rules locally. */
export class NetworkSession {
  constructor(world,{onDisconnect=()=>{},onConnection=()=>{},onMatch=()=>{}}={}){
    this.onMatch=onMatch;this.matchId=0;this.matchPhase='';this.world=world;this.onDisconnect=onDisconnect;this.onConnection=onConnection;this.connectionState='connecting';this.controlEpoch=0;this.closed=false;this.enabled=true;
    this.events=[];this.seenEvent=0;this.predictedShots=new Map();this.actionTimes=new Map();this.remote=new Map();this.unsub=[];
    this.fireId=0;this.reloadId=0;this.trigger=false;this.nextCosmetic=0;this.lifeId=0;this.lastPatch=0;
    this.metrics={sent:0,replays:0,adopts:0,resets:0,cosmeticShots:0,confirmedShots:0,suppressedShots:0,corrections:[],adoptionDistance:[],shotLatency:[],hitLatency:[],maxPending:0,reconnects:0};
    this.view=new Game(world,{config:NETWORK_CONFIG,localPlayerId:null,controllers:{}});
    Object.assign(this.view.state,{mode:'endless',phase:'menu',round:1,projectiles:[],wanderers:[],orders:{}});
    // Presentation recoil gets its own RNG, never the authority's stream.
    this.view.random=seededRandom(81);this.view.network=true;
    this.view.pause=value=>this.setInputEnabled(!value);
    this.view.reload=()=>{if(!this.closed&&this.enabled&&this.view.player?.alive){this.reloadId++;return true;}return false;};
    this.selectId=0;
    this.view.select=value=>{
      const a=this.view.player;
      if(!this.enabled||!a?.alive||this.closed)return false;
      const slot=({'1':'primary','2':'pistol','3':'knife','4':'he',[a.inventory.primary.id]:'primary',[a.inventory.pistol.id]:'pistol'})[value]||value;
      if(!['primary','pistol','knife','he','last'].includes(slot))return false;
      this.room.send('select',{slot,serial:++this.selectId,lifeId:a.lifeId,controlEpoch:a.controlEpoch});
      return true;
    };
    this.view.drop=this.view.radio=this.view.setDifficulty=()=>false;
    this.view.buy=()=>({ok:false,reason:'Välj utrustning för nästa liv.'});
    this.view.drainEvents=()=>{const e=this.events;this.events=[];return e;};
    this.view.update=()=>{throw Error('NetworkSession owns input; the client cannot step Game.');};
  }
  async connect({endpoint,roomId,code,name,team='auto',fillBots=true,create=false,contract=CONTRACT}){
    const url=networkEndpoint(endpoint),client=new SessionClient(url),options={code,name,team,contract,fillBots};
    client.owner=this;
    this.joinAbort=new AbortController();client.http.options.signal=this.joinAbort.signal;
    const pending=create?client.create(ROOM_TYPE,options):client.joinById(roomId,options);
    let expired=false;
    const timeout=new Promise((_,reject)=>{this.joinTimer=setTimeout(()=>{expired=true;this.joinAbort.abort();this.joiningRoom?.leave(false).catch(()=>{});reject(Error('Connection timeout.'));},10000);});
    let room;
    try{room=await Promise.race([pending.then(room=>{if(expired||this.closed){room.leave();throw Error('Join cancelled.');}return room;}),timeout]);}
    finally{clearTimeout(this.joinTimer);this.joinTimer=null;}
    if(this.closed){await room.leave();throw Error('Join cancelled.');}
    this.joiningRoom=null;this.room=room;Object.assign(room.reconnection,{enabled:true,minUptime:0,minDelay:150,maxDelay:1000,maxRetries:30,maxEnqueuedMessages:0});
    this.unsub.push(room.onMessage('problem',message=>{this.problem=String(message);}));
    this.unsub.push(room.onMessage('notice',message=>{this.notice=String(message);}));
    this.unsub.push(room.onMessage('events',events=>this.receiveEvents(events)));
    this.unsub.push(room.onMessage('clock-probe',token=>{if(!this.closed&&this.connectionState==='connected')room.send('clock-echo',token);}));
    const dropped=()=>this.beginReconnect();
    const reconnected=()=>{if(this.closed)return;this.awaitingSnapshot=true;};
    room.onDrop(dropped);this.unsub.push(()=>room.onDrop.remove(dropped));
    room.onReconnect(reconnected);this.unsub.push(()=>room.onReconnect.remove(reconnected));
    const left=code=>{
      if(this.closed)return;const problem=this.problem||`Anslutningen bröts (${code}). Anslut till rummet igen, eller skapa ett nytt om servern startades om.`;
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
    this.input=room.input({mode:'reliable'});
    if(this.input.stepSeconds!==NETWORK_CONFIG.fixedStep)throw Error('Incompatible simulation step.');
    this.predict=Predict.get(room,{mode:'lerp',delay:INTERPOLATION_MS});
    // World and bundled presentation have loaded before this ready command.
    room.send('ready',contract);
    await wait(()=>this.closed||room.state.actors.get(this.localPlayerId)?.ready);
    if(this.closed)throw Error(this.problem||'Room closed before spawn.');
    this.connectionState='connected';this.snapshot();this.view.state.phase='active';
    this.lastWatchdog=performance.now();this.silenceSince=0;
    this.watchdog=setInterval(()=>this.checkConnection(performance.now()),1000);
    return this;
  }
  snapshot(){
    if(this.closed||!this.localPlayerId||!this.predict)return;
    this.lastPatch=performance.now();
    const state=this.room.state;
    const mine=[...state.actors.values()].find(a=>a.sessionId===this.room.sessionId);
    if(mine&&mine.id!==this.localPlayerId){
      this.prediction?.dispose();this.prediction=null;this.localPlayerId=mine.id;
      this.view.localPlayerId=mine.id;this.view.team=mine.team;
    }
    const newMatch=this.matchId!==state.matchId,newPhase=this.matchPhase!==state.phase;
    if(newMatch||newPhase){
      this.matchId=state.matchId;this.matchPhase=state.phase;
      this.prediction?.reset();this.events=[];this.predictedShots.clear();this.actionTimes.clear();this.nextCosmetic=0;
      if(newMatch){for(const entry of this.remote.values())this.predict.detach(entry.schema);this.remote.clear();}
      this.view.state.round=state.matchId;
    }
    const ready=[...state.actors.values()].filter(a=>a.ready);
    if(this.awaitingSnapshot){
      // onReconnect precedes the full state; only this callback can adopt it.
      this.awaitingSnapshot=false;clearTimeout(this.reconnectTimer);this.reconnectTimer=null;
      this.connectionState='connected';this.metrics.reconnects++;
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
    if(newMatch||this.glassCount===undefined){this.world.glass.reset();this.glassCount=-1;}
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
    this.view.state.time=state.time;
    const self=state.actors.get(this.localPlayerId);
    for(const [id,entry] of this.remote)if(!ready.some(s=>s.id===id&&s===entry.schema&&s.lifeId===entry.lifeId&&s.alive===entry.alive)){
      this.predict.detach(entry.schema);this.remote.delete(id);
    }
    for(const s of ready)if(s.id!==this.localPlayerId&&!this.remote.has(s.id)){
      this.predict.attach(s,{x:'lerp',y:'lerp',z:'lerp',height:'lerp',yaw:{mode:'lerp',angle:true},pitch:{mode:'lerp',angle:true}});
      this.remote.set(s.id,{schema:s,lifeId:s.lifeId,alive:s.alive});
    }
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
          copyPose(w.actor,s);w.actor.alive=s.alive;w.actor.lifeId=s.lifeId;w.game.state.time=this.room.state.time;
          w.game.actors=[w.actor,...[...this.room.state.actors.values()].filter(a=>a.ready&&a.id!==s.id).map(a=>actorView(a,null))];
        },
        step:(ctx,w,f)=>{
          if(ctx.isReplay)this.metrics.replays++;
          if(this.room.state.phase!=='active'||!w.actor.alive||f.lifeId!==w.actor.lifeId||f.controlEpoch!==this.controlEpoch)return;
          w.game.state.time+=ctx.dt;
          w.dynamics.step(w.game.state.time,ctx.dt,w.game.actors,()=>moveActor(w.game,w.actor,f,ctx.dt,false));
        },
        pose:w=>({x:w.actor.x,y:w.actor.y,z:w.actor.z}),
        onReconcile:()=>{if(!this.prediction)return;const c=this.prediction.lastCorrection;
          this.metrics.corrections.push(Math.hypot(c.x||0,c.y||0,c.z||0));if(this.metrics.corrections.length>512)this.metrics.corrections.shift();},
      });
    }
    if(this.cosmeticWeapon!==self.weapon){this.nextCosmetic=0;this.cosmeticWeapon=self.weapon;}
    const newLife=self.lifeId!==this.lifeId;
    if(newLife||self.alive!==this.alive||self.controlEpoch!==this.controlEpoch){
      const newConnection=self.controlEpoch!==this.controlEpoch;this.controlEpoch=self.controlEpoch;
      this.lifeId=self.lifeId;this.alive=self.alive;this.metrics.resets++;
      // Reset the replay controller, NOT InputHandle's reliable wire counters.
      this.prediction.reset();if(newLife||newConnection){this.predictedShots.clear();this.actionTimes?.clear();}this.nextCosmetic=0;
      this.fireId=0;this.reloadId=0;this.trigger=false;
      this.events=[];
    }
    if(newMatch||newPhase)queueMicrotask(()=>{if(!this.closed)this.onMatch(this.matchPhase);});
  }
  matchCommand(kind,extra={}){
    const self=this.room?.state.actors.get(this.localPlayerId);if(!self||this.connectionState!=='connected')return;
    this.notice='';this.room.send('match',{kind,matchId:this.room.state.matchId,controlEpoch:self.controlEpoch,...extra});
  }
  receiveEvents(events){
    if(this.closed||this.connectionState==='reconnecting'||!Array.isArray(events))return;
    for(const event of events.slice(-64)){
      if(event.matchId!==undefined&&event.matchId!==this.room.state.matchId)continue;
      if(event.eventId<=this.seenEvent)continue;this.seenEvent=event.eventId;
      const actor=this.room.state.actors.get(event.actorId);
      if(event.actorId&&(!actor||event.lifeId&&actor.lifeId!==event.lifeId||event.controlEpoch!==undefined&&actor.controlEpoch!==event.controlEpoch))continue;
      const source=this.room.state.actors.get(event.sourceId);
      if(event.sourceId&&(!source||event.sourceLifeId&&source.lifeId!==event.sourceLifeId||event.sourceControlEpoch!==undefined&&source.controlEpoch!==event.sourceControlEpoch))continue;
      if(event.type==='shot'&&event.actorId===this.localPlayerId){
        this.metrics.confirmedShots++;
        const sent=this.predictedShots.get(event.actionId);
        if(sent!==undefined&&this.metrics.shotLatency){this.metrics.shotLatency.push(performance.now()-sent);if(this.metrics.shotLatency.length>512)this.metrics.shotLatency.shift();}
        if(this.predictedShots.has(event.actionId)){this.predictedShots.delete(event.actionId);this.metrics.suppressedShots++;continue;}
      }
      if(event.type==='hit'&&event.sourceId===this.localPlayerId){const sent=this.actionTimes?.get(event.actionId);
        if(sent!==undefined){this.metrics.hitLatency.push(performance.now()-sent);if(this.metrics.hitLatency.length>512)this.metrics.hitLatency.shift();}}
      if(this.enabled)this.events.push(event);
    }
    this.events=this.events.slice(-128);
  }
  advanceFrame(now,controls={}){
    if(this.closed||this.connectionState==='reconnecting'||!this.predict||!this.prediction)return;
    const steps=Math.min(6,this.predict.tick(now)),state=this.room.state,self=state.actors.get(this.localPlayerId);
    if(!self)return;
    const stale=performance.now()-this.lastPatch>1000;
    for(let i=0;i<steps;i++){
      if(state.phase!=='active'||!this.enabled||!self.alive||stale)break;
      const data=this.input.data;
      Object.assign(data,{lifeId:self.lifeId,controlEpoch:self.controlEpoch,sampleTick:state.tick,fireId:this.fireId,reloadId:this.reloadId,
        forward:controls.forward||0,strafe:controls.strafe||0,yaw:wrapYaw(controls.yaw??self.yaw),pitch:controls.pitch??self.pitch,
        jump:!!controls.jump,crouch:!!controls.crouch,sneak:!!controls.sneak,aim:!!controls.aim,fire:!!controls.fire});
      const time=this.prediction.world.game.state.time;
      const weapon=WEAPONS[self.weapon],throwing=self.weapon==='he';
      if(data.fire&&(weapon.automatic||!this.trigger)&&time+1e-8>=Math.max(this.nextCosmetic,self.nextShot)&&
          (self.ammo>0||self.weapon==='knife'||throwing&&self.he>0)&&!self.reloadUntil){
        data.fireId=++this.fireId;this.nextCosmetic=time+weapon.interval;
        if(!throwing){
          const actionId=`${self.id}:${self.lifeId}:${self.controlEpoch}:${this.fireId}`;
          this.predictedShots.set(actionId,performance.now());this.actionTimes.set(actionId,performance.now());this.metrics.cosmeticShots++;
          const a=this.prediction.world.actor;
          this.events.push({type:'shot',actorId:self.id,team:self.team,weapon:self.weapon,time:this.view.state.time,
            x:a.x,y:a.y,z:a.z,yaw:data.yaw,pitch:data.pitch,actionId,lifeId:self.lifeId,predicted:true});
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
    // Only the display clock advances here; it cannot tick combat or respawn.
    this.view.state.time=state.time+Math.min(.1,(performance.now()-this.lastPatch)/1000);
    for(const a of this.view.actors){
      const s=state.actors.get(a.id);if(!s)continue;
      if(a.isPlayer&&a.alive){
        copyPose(a,this.prediction.world.actor);
        for(const key of ['x','y','z'])a[key]=this.prediction.value(key);
        // Free look stays immediate even between fixed input steps.
        if(this.enabled){a.yaw=wrapYaw(controls.yaw??a.yaw);a.pitch=controls.pitch??a.pitch;}
      }else if(a.alive)for(const key of ['x','y','z','height','yaw','pitch'])a[key]=this.predict.value(s,key);
    }
    // Display doors/shutters at the same snapshot time as remote hitboxes.
    // Local movement uses its separate, authoritative/replayed collision context.
    for(const d of this.world.doors?.doors||[]){const s=state.doors.get(d.id),angle=this.predict.value(s,'poseAngle');
      d.angle=Math.abs(angle);d.sign=Math.sign(angle)||s.sign;this.world.doors.pose(d);}
    if(this.predict.value)this.world.doors.elevators.setProgress(this.predict.value(state,'elevatorProgress'));
    const rtt=Math.round(this.room.clock?.smoothedRtt?.()||0);
    this.status=stale?'Anslutningen väntar — kontroller stoppade':`${this.room.roomId} · ${this.view.actors.length}/${ROOM_CAPACITY} · ${rtt} ms${rtt>=200?' · Hög fördröjning':''}`;
  }
  setInputEnabled(enabled){
    if(this.closed)return;
    enabled=enabled&&this.connectionState!=='reconnecting';
    this.trigger=false;this.enabled=enabled;this.view.state.paused=!enabled;this.events=[];
    if(this.room&&this.lifeId&&this.connectionState!=='reconnecting')this.room.send('controls',{enabled,lifeId:this.lifeId,controlEpoch:this.controlEpoch});
    if(enabled&&this.prediction)this.prediction.reset();
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
    this.connectionState='reconnecting';this.enabled=false;this.view.state.paused=true;
    this.events=[];this.status='Återansluter… Din plats reserveras i 15 sekunder. Matchen fortsätter.';
    this.onConnection('reconnecting');
    this.reconnectTimer=setTimeout(()=>this.disconnect('Återanslutningen gick inte. Platsen har löpt ut eller servern startades om. Anslut till rummet igen.'),RECONNECT_SECONDS*1000);
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
    clearInterval(this.watchdog);this.watchdog=null;clearTimeout(this.joinTimer);this.joinTimer=null;this.joinAbort?.abort();
    for(const off of this.unsub)if(typeof off==='function')off();this.unsub=[];
    this.predict?.dispose();this.prediction=null;this.predict=null;this.remote.clear();
    this.events=[];this.predictedShots.clear();this.actionTimes?.clear();this.view.state.actors=[];this.view.state.phase='menu';
    const room=this.room||this.joiningRoom;this.room=null;this.joiningRoom=null;this.input=null;
    if(leave&&room){room.reconnection.enabled=false;return room.leave().catch(()=>{});}
  }
}
