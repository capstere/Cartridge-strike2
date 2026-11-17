import {Room,ServerError} from '@colyseus/core';
import {createHash,timingSafeEqual} from 'node:crypto';
import {createHeadlessSimulation} from './headless.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
import {NETWORK_CONFIG,NETWORK_MAP,copyPose,fixedNetworkWorld,safeName} from '../shared/multiplayer/rules.mjs';
import {checkContract,validateNetworkInput,wireInput} from '../shared/multiplayer/protocol.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {NetworkInput,ActorState,RoomState} from './network-schema.mjs';

const hashCode=code=>createHash('sha256').update(code).digest();
const validCode=code=>typeof code==='string'&&/^[A-Za-z0-9-]{6,64}$/.test(code);
const seats=['analysts-0','counterAnalysts-0'];
export class NetworkRoom extends Room {
  async onCreate(options) {
    if(!validCode(options.code))throw new ServerError(400,'Use a private code of 6–64 letters, digits or hyphens.');
    try {checkContract(options.contract,CONTRACT);}catch(e){throw new ServerError(409,e.message);}
    this.codeHash=hashCode(options.code);
    this.maxClients=2;this.maxMessagesPerSecond=120;this.patchRate=50;
    await this.setPrivate(true);
    this.seats=new Map();this.lives=new Map();this.metrics={invalid:0,maxQueue:0,ticks:0,events:0};
    this.sim=await createHeadlessSimulation({mapId:NETWORK_MAP,controllers:Object.fromEntries(seats.map(id=>[id,'human'])),config:NETWORK_CONFIG});
    if(this.sim.sourceHash!==CONTRACT.mapHash)throw Error('Server map differs from built contract. Run npm run build --prefix server.');
    fixedNetworkWorld(this.sim.game.world);
    this.templates=new Map(this.sim.game.actors.map(a=>[a.id,a]));
    this.sim.game.state.actors=[];this.sim.game.drainEvents();
    this.state=new RoomState({worldRevision:1});
    // Reliable WS input has its own monotonic wire sequence. Do not introduce a
    // second sequence/ack counter; dropping a queued frame still advances its ack.
    this.inputs=this.defineInput(NetworkInput,{bufferMaxSize:12});
    this.onMessage('ready',(client,message)=>{
      const seat=this.seats.get(client.sessionId);if(!seat||seat.ready)return;
      try{checkContract(message,CONTRACT);}catch(e){client.send('problem',e.message);client.leave(4009);return;}
      const actor=structuredClone(this.templates.get(seat.id));
      Object.assign(actor,{name:seat.name,alive:false,lifeId:this.lives.get(seat.id)||0,respawnAt:null});
      this.sim.game.actors.push(actor);
      if(!respawnActor(this.sim.game,actor)){this.sim.game.state.actors.pop();client.send('problem','No safe spawn is available.');client.leave(4008);return;}
      seat.ready=true;seat.enabled=true;seat.actor=actor;seat.deadline=Infinity;
      this.sim.controllers.bind(client.sessionId,actor.id);
      this.project();
    });
    this.onMessage('controls',(client,message)=>{
      const seat=this.seats.get(client.sessionId);
      if(!seat?.ready||message?.lifeId!==seat.actor.lifeId||typeof message.enabled!=='boolean')return;
      seat.enabled=message.enabled;this.inputs.get(client.sessionId).clear();
    });
    this.setFixedTimestep(()=>this.fixedTick(),60);
  }
  onAuth(client,options) {
    try{checkContract(options.contract,CONTRACT);}catch(e){throw new ServerError(409,e.message);}
    if(!validCode(options.code)||!timingSafeEqual(hashCode(options.code),this.codeHash))throw new ServerError(403,'Incorrect private room code.');
    return true;
  }
  onJoin(client,options) {
    const id=seats.find(id=>![...this.seats.values()].some(s=>s.id===id));
    if(!id)throw new ServerError(409,'This private room is full.');
    const seat={id,name:safeName(options.name),ready:false,enabled:false,lastFire:0,lastReload:0,deadline:this.clock.elapsedTime+20000};
    this.seats.set(client.sessionId,seat);
    this.state.actors.set(id,new ActorState({id,sessionId:client.sessionId,name:seat.name,team:id.split('-')[0]}));
  }
  fixedTick() {
    const frames=new Map(),actions=new Map();
    for(const client of this.clients){
      const seat=this.seats.get(client.sessionId),buffer=this.inputs.get(client.sessionId);
      this.metrics.maxQueue=Math.max(this.metrics.maxQueue,buffer.size);
      if(!seat?.ready||!seat.enabled){buffer.clear();if(seat&&this.clock.elapsedTime>seat.deadline)client.leave(4008);continue;}
      const f=buffer.next();if(!f||!seat.actor.alive)continue; // no cached held movement/fire on silence
      try{
        const input=validateNetworkInput(wireInput(f),seat.actor,this.sim.tickNumber);
        const fire=f.fire&&f.fireId>seat.lastFire;
        input.fire=fire;input.reload=f.reloadId>seat.lastReload;
        seat.lastFire=Math.max(seat.lastFire,f.fireId);seat.lastReload=Math.max(seat.lastReload,f.reloadId);
        frames.set(client.sessionId,input);
        actions.set(seat.id,`${seat.id}:${seat.actor.lifeId}:${f.fireId}`);
      }catch{this.metrics.invalid++;}
    }
    const oldLives=new Map(this.sim.game.actors.map(a=>[a.id,a.lifeId]));
    const events=this.sim.tick(frames);
    for(const [sid,seat] of this.seats)if(seat.ready&&oldLives.get(seat.id)!==seat.actor.lifeId){
      this.inputs.get(sid).clear();seat.lastFire=seat.lastReload=0;
    }
    this.project();
    if(events.length){
      const wire=events.slice(-64).map(e=>{
        const actor=this.sim.game.actors.find(a=>a.id===e.actorId),source=this.sim.game.actors.find(a=>a.id===e.sourceId);
        return {...e,eventId:e.serial,tick:this.sim.tickNumber,lifeId:actor?.lifeId||0,sourceLifeId:source?.lifeId||0,
          actionId:actions.get(e.sourceId||e.actorId)||''};
      });
      this.metrics.events+=wire.length;this.broadcast('events',wire,{afterNextPatch:true});
    }
    this.metrics.ticks++;
  }
  project() {
    const g=this.sim.game;
    for(const seat of this.seats.values())if(seat.ready){
      const a=seat.actor,s=this.state.actors.get(a.id);copyPose(s,a);
      for(const k of ['lifeId','alive','hp','armor','kills','deaths','reloadUntil','nextShot','spawnProtectedUntil','recoil'])s[k]=a[k]??0;
      s.ready=true;s.ammo=a.inventory.primary.ammo;s.reserve=a.inventory.primary.reserve;
      s.respawnAt=a.respawnAt??0;s.deathAt=a.deathAt??0;s.hurtTime=Number.isFinite(a.hurtTime)?a.hurtTime:-100;
      s.deathSource=a.deathCause?.sourceName||'';s.deathWeapon=a.deathCause?.weapon||'';
    }
    this.state.tick=this.sim.tickNumber;this.state.time=g.state.time;
    this.state.analysts=g.state.score.analysts;this.state.counterAnalysts=g.state.score.counterAnalysts;
  }
  onLeave(client) {
    const seat=this.seats.get(client.sessionId);if(!seat)return;
    if(seat.actor)this.lives.set(seat.id,seat.actor.lifeId);
    this.sim.controllers.unbind(client.sessionId);this.inputs.get(client.sessionId).clear();
    this.sim.game.state.actors=this.sim.game.actors.filter(a=>a.id!==seat.id);
    this.state.actors.delete(seat.id);this.seats.delete(client.sessionId);
  }
  onDispose(){this.sim?.controllers.clear();this.seats?.clear();this.templates?.clear();this.lives?.clear();}
}
