import '../../../vendor/colyseus/colyseus.js';
import {Game,WEAPONS} from '../game.mjs';
import {seededRandom} from '../config.mjs';
import {moveActor} from '../movement.mjs';
import {NETWORK_CONFIG,ROOM_TYPE,copyPose,wrapYaw} from '../../../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../../../shared/multiplayer/build.mjs';

import {applyNetworkWorld,createPredictedWorld} from '../../../shared/multiplayer/world.mjs';

const {Client,Predict}=globalThis.Colyseus;
const wait=async(predicate,timeout=15000)=>{
  const end=performance.now()+timeout;
  while(!predicate()){if(performance.now()>end)throw Error('The local server did not become ready.');await new Promise(r=>setTimeout(r,20));}
};
function actorView(s,localId){
  const a={id:s.id,name:s.name,team:s.team,index:0,isPlayer:s.id===localId,controllerType:'human',bot:null,
    radius:NETWORK_CONFIG.radius,weapon:'smg',lastWeapon:'smg',money:0,flash:0,action:null,
    inventory:{primary:{id:'smg',ammo:s.ammo,reserve:s.reserve},pistol:null,knife:null,smoke:0,flash:0,he:0}};
  copyPose(a,s);
  for(const k of ['lifeId','alive','hp','armor','kills','deaths','reloadUntil','nextShot','respawnAt','spawnProtectedUntil','deathAt','hurtTime','recoil'])a[k]=s[k];
  a.deathCause=s.deathWeapon?{sourceName:s.deathSource,weapon:s.deathWeapon}:null;
  return a;
}

/** A Game-shaped presentation only. Never advances Game combat/rules locally. */
export class NetworkSession {
  constructor(world,{onDisconnect=()=>{}}={}){
    this.world=world;this.onDisconnect=onDisconnect;this.closed=false;this.enabled=true;
    this.events=[];this.seenEvent=0;this.predictedShots=new Map();this.remote=new Map();this.unsub=[];
    this.fireId=0;this.reloadId=0;this.nextCosmetic=0;this.lifeId=0;this.lastPatch=0;
    this.metrics={sent:0,replays:0,adopts:0,resets:0,cosmeticShots:0,confirmedShots:0,suppressedShots:0,corrections:[],maxPending:0};
    this.view=new Game(world,{config:NETWORK_CONFIG,localPlayerId:null,controllers:{}});
    Object.assign(this.view.state,{mode:'endless',phase:'menu',round:1,projectiles:[],wanderers:[],orders:{}});
    // Presentation recoil gets its own RNG, never the authority's stream.
    this.view.random=seededRandom(81);this.view.network=true;
    this.view.pause=value=>this.setInputEnabled(!value);
    this.view.reload=()=>{if(!this.closed&&this.enabled&&this.view.player?.alive){this.reloadId++;return true;}return false;};
    this.view.select=this.view.drop=this.view.radio=this.view.setDifficulty=()=>false;
    this.view.buy=()=>({ok:false,reason:'Pulse SMG only in this local slice.'});
    this.view.drainEvents=()=>{const e=this.events;this.events=[];return e;};
    this.view.update=()=>{throw Error('NetworkSession owns input; the client cannot step Game.');};
  }
  async connect({endpoint,roomId,code,name,create=false,contract=CONTRACT}){
    const url=new URL(endpoint);
    if(!['localhost','127.0.0.1','[::1]'].includes(url.hostname)||!['http:','https:'].includes(url.protocol))throw Error('This slice supports a local loopback server only.');
    const client=new Client(url.href),options={code,name,contract};
    const room=create?await client.create(ROOM_TYPE,options):await client.joinById(roomId,options);
    if(this.closed){await room.leave();throw Error('Join cancelled.');}
    this.room=room;room.reconnection.enabled=false; // explicit rejoin; bounded grace is Pass 3
    this.unsub.push(room.onMessage('problem',message=>{this.problem=String(message);}));
    this.unsub.push(room.onMessage('events',events=>this.receiveEvents(events)));
    const left=code=>{
      if(this.closed)return;const problem=this.problem||`Disconnected (${code}). Rejoin the private room explicitly.`;
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
    this.predict=Predict.get(room,{mode:'lerp',delay:100});
    // World and bundled presentation have loaded before this ready command.
    room.send('ready',contract);
    await wait(()=>this.closed||room.state.actors.get(this.localPlayerId)?.ready);
    if(this.closed)throw Error(this.problem||'Room closed before spawn.');
    this.snapshot();this.view.state.phase='active';return this;
  }
  snapshot(){
    if(this.closed||!this.localPlayerId||!this.predict)return;
    this.lastPatch=performance.now();
    const state=this.room.state,ready=[...state.actors.values()].filter(a=>a.ready);
    applyNetworkWorld(this.world.doors,state);
    this.view.state.actors=ready.map(s=>actorView(s,this.localPlayerId));
    this.view.state.score={analysts:state.analysts,counterAnalysts:state.counterAnalysts};
    this.view.state.time=state.time;
    const self=state.actors.get(this.localPlayerId);
    for(const [id,entry] of this.remote)if(!ready.some(s=>s.id===id&&s.lifeId===entry.lifeId&&s.alive===entry.alive)){
      this.predict.detach(entry.schema);this.remote.delete(id);
    }
    for(const s of ready)if(s.id!==this.localPlayerId&&!this.remote.has(s.id)){
      this.predict.attach(s,{x:'lerp',y:'lerp',z:'lerp',yaw:{mode:'lerp',angle:true},pitch:{mode:'lerp',angle:true}});
      this.remote.set(s.id,{schema:s,lifeId:s.lifeId,alive:s.alive});
    }
    if(!self?.ready)return;
    if(!this.prediction){
      const actor=actorView(self,this.localPlayerId);
      const game={world:this.world,config:NETWORK_CONFIG,actors:[actor],hostages:[],state:{time:state.time,zombies:[]}};
      const dynamics=createPredictedWorld(this.world);
      this.prediction=this.predict.sim({input:this.input,world:{game,actor,dynamics},smoothMs:45,
        adopt:w=>{
          const s=this.room.state.actors.get(this.localPlayerId);if(!s)return;
          this.metrics.adopts++;const d=Math.hypot(w.actor.x-s.x,w.actor.y-s.y,w.actor.z-s.z);
          this.metrics.corrections.push(d);if(this.metrics.corrections.length>512)this.metrics.corrections.shift();
          w.dynamics.adopt(this.room.state);
          copyPose(w.actor,s);w.actor.alive=s.alive;w.actor.lifeId=s.lifeId;w.game.state.time=this.room.state.time;
          w.game.actors=[w.actor,...[...this.room.state.actors.values()].filter(a=>a.ready&&a.id!==s.id).map(a=>actorView(a,null))];
        },
        step:(ctx,w,f)=>{
          if(ctx.isReplay)this.metrics.replays++;
          if(!w.actor.alive||f.lifeId!==w.actor.lifeId)return;
          w.game.state.time+=ctx.dt;
          w.dynamics.step(w.game.state.time,ctx.dt,w.game.actors,()=>moveActor(w.game,w.actor,f,ctx.dt,false));
        },
        pose:w=>({x:w.actor.x,y:w.actor.y,z:w.actor.z}),
      });
    }
    const newLife=self.lifeId!==this.lifeId;
    if(newLife||self.alive!==this.alive){
      this.lifeId=self.lifeId;this.alive=self.alive;this.metrics.resets++;
      // Reset the replay controller, NOT InputHandle's reliable wire counters.
      this.prediction.reset();if(newLife)this.predictedShots.clear();this.nextCosmetic=0;
      this.fireId=0;this.reloadId=0;
      this.events=[];
    }
  }
  receiveEvents(events){
    if(this.closed||!Array.isArray(events))return;
    for(const event of events.slice(-64)){
      if(event.eventId<=this.seenEvent)continue;this.seenEvent=event.eventId;
      const actor=this.room.state.actors.get(event.actorId);
      if(event.actorId&&(!actor||event.lifeId&&actor.lifeId!==event.lifeId))continue;
      const source=this.room.state.actors.get(event.sourceId);
      if(event.sourceId&&(!source||event.sourceLifeId&&source.lifeId!==event.sourceLifeId))continue;
      if(event.type==='shot'&&event.actorId===this.localPlayerId){
        this.metrics.confirmedShots++;
        if(this.predictedShots.has(event.actionId)){this.predictedShots.delete(event.actionId);this.metrics.suppressedShots++;continue;}
      }
      if(this.enabled)this.events.push(event);
    }
    this.events=this.events.slice(-128);
  }
  advanceFrame(now,controls={}){
    if(this.closed||!this.predict||!this.prediction)return;
    const steps=Math.min(6,this.predict.tick(now)),state=this.room.state,self=state.actors.get(this.localPlayerId);
    if(!self)return;
    const stale=performance.now()-this.lastPatch>1000;
    for(let i=0;i<steps;i++){
      if(!this.enabled||!self.alive||stale)break;
      const data=this.input.data;
      Object.assign(data,{lifeId:self.lifeId,sampleTick:state.tick,fireId:this.fireId,reloadId:this.reloadId,
        forward:controls.forward||0,strafe:controls.strafe||0,yaw:wrapYaw(controls.yaw??self.yaw),pitch:controls.pitch??self.pitch,
        jump:!!controls.jump,crouch:!!controls.crouch,sneak:!!controls.sneak,fire:!!controls.fire});
      const time=this.prediction.world.game.state.time;
      if(data.fire&&time+1e-8>=this.nextCosmetic&&self.ammo>0&&!self.reloadUntil){
        data.fireId=++this.fireId;this.nextCosmetic=time+WEAPONS.smg.interval;
        const actionId=`${self.id}:${self.lifeId}:${this.fireId}`;
        this.predictedShots.set(actionId,performance.now());this.metrics.cosmeticShots++;
        const a=this.prediction.world.actor;
        this.events.push({type:'shot',actorId:self.id,team:self.team,weapon:'smg',time:this.view.state.time,
          x:a.x,y:a.y,z:a.z,yaw:data.yaw,pitch:data.pitch,actionId,lifeId:self.lifeId,predicted:true});
      }
      this.input.send();this.metrics.sent++;
    }
    this.metrics.maxPending=Math.max(this.metrics.maxPending,this.input.pendingCount);
    // A stalled renderer can receive a confirmation long after the effect was
    // shown. Keep a bounded action history until confirmation or a life reset;
    // wall-clock expiry could replay the same muzzle/audio after the stall.
    while(this.predictedShots.size>128)this.predictedShots.delete(this.predictedShots.keys().next().value);
    // Only the display clock advances here; it cannot tick combat or respawn.
    this.view.state.time=state.time+Math.min(.1,(performance.now()-this.lastPatch)/1000);
    for(const a of this.view.actors){
      const s=state.actors.get(a.id);if(!s)continue;
      if(a.isPlayer&&a.alive){
        copyPose(a,this.prediction.world.actor);
        for(const key of ['x','y','z'])a[key]=this.prediction.value(key);
        // Free look stays immediate even between fixed input steps.
        if(this.enabled){a.yaw=wrapYaw(controls.yaw??a.yaw);a.pitch=controls.pitch??a.pitch;}
      }else if(a.alive)for(const key of ['x','y','z','yaw','pitch'])a[key]=this.predict.value(s,key);
    }
    this.status=stale?'Connection stalled — controls stopped':`${this.room.roomId} · ${this.view.actors.length}/2 · ${Math.round(this.room.clock?.smoothedRtt?.()||0)} ms`;
  }
  setInputEnabled(enabled){
    if(this.closed)return;
    this.enabled=enabled;this.view.state.paused=!enabled;this.events=[];
    if(this.room&&this.lifeId)this.room.send('controls',{enabled,lifeId:this.lifeId});
    if(enabled&&this.prediction)this.prediction.reset();
  }
  dispose(leave=true){
    if(this.closed)return;this.closed=true;
    for(const off of this.unsub)if(typeof off==='function')off();this.unsub=[];
    this.predict?.dispose();this.prediction=null;this.predict=null;this.remote.clear();
    this.events=[];this.predictedShots.clear();this.view.state.actors=[];this.view.state.phase='menu';
    const room=this.room;this.room=null;this.input=null;
    if(leave&&room)return room.leave().catch(()=>{});
  }
}
