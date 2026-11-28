import {ClientState} from '@colyseus/core';
import {TEAM_COMMS_TYPE,TEAM_COMMS_COMMANDS,TEAM_COMMS_RATE_MS,TEAM_COMMS_LIFETIME} from '../shared/multiplayer/protocol.mjs';
import {multiplayerMapAnchors} from '../src/fps/minimap-cache.mjs';

const MAX_TICK_AGE=120;
const TEAM_RATE_MS=250;
const MAX_PENDING_SIGNALS=8;
const COUNTERS=['serial','matchId','round','lifeId','controlEpoch','tick'];
const REQUEST_FIELDS=new Set(['kind','anchorId',...COUNTERS]);

function validRequest(message,anchors){
  if(!message||Object.getPrototypeOf(message)!==Object.prototype||
    Reflect.ownKeys(message).some(key=>!REQUEST_FIELDS.has(key))||!TEAM_COMMS_COMMANDS.includes(message.kind))return false;
  if(COUNTERS.some(key=>!Number.isSafeInteger(message[key])||message[key]<0||message[key]>0xffffffff)||message.serial===0)return false;
  return message.kind==='ping'?anchors.has(message.anchorId):!Object.hasOwn(message,'anchorId');
}

function liveSeat(seat){
  return seat?.ready&&seat.connected&&seat.client?.state===ClientState.JOINED&&
    !seat.revoked&&!seat.pending&&seat.actor?.alive;
}

export class TeamComms {
  constructor(room){
    this.room=room;
    this.refreshAnchors();
    this.requests=new WeakMap();
    this.teamRate=new Map();
    this.teamSerial=new Map();
    this.pending=[];
    this.orders=new Map();
  }

  refreshAnchors(){
    const r=this.room;
    this.anchors=new Set(multiplayerMapAnchors(r.sim.game.world,r.classic).map(anchor=>anchor.id));
  }

  active(){
    const {state,sim}=this.room;
    return state.mode!=='ffa'&&state.phase==='active'&&sim.game.phase==='active'&&!sim.game.state.paused;
  }

  receive(client,message){
    const {state,sim,clock,seats}=this.room;
    const sender=seats.get(client.sessionId);
    if(!liveSeat(sender)||sender.client!==client||!sender.enabled||!this.active()||!validRequest(message,this.anchors))return false;
    const actor=sender.actor;
    if(message.matchId!==state.matchId||message.round!==state.round||message.lifeId!==actor.lifeId||
      message.controlEpoch!==sender.epoch||message.tick>sim.tickNumber||message.tick<sim.tickNumber-MAX_TICK_AGE)return false;

    const previous=this.requests.get(sender);
    if(previous?.epoch===sender.epoch&&message.serial<=previous.serial)return false;
    const now=clock.elapsedTime;
    const request={epoch:sender.epoch,serial:message.serial,nextAt:previous?.nextAt??0};
    this.requests.set(sender,request);
    if(now<request.nextAt||now<(this.teamRate.get(actor.team)??0))return false;
    request.nextAt=now+TEAM_COMMS_RATE_MS;
    this.teamRate.set(actor.team,now+TEAM_RATE_MS);

    const {kind,anchorId}=message;
    const expiresAt=sim.game.state.time+TEAM_COMMS_LIFETIME;
    const botAssigned=kind!=='ping'&&this.assign(sender,kind,expiresAt,now+TEAM_COMMS_LIFETIME*1000);
    const serial=(this.teamSerial.get(actor.team)??0)+1;
    this.teamSerial.set(actor.team,serial);
    const packet={kind,...(kind==='ping'?{anchorId}:{}),senderId:actor.id,senderName:actor.name,
      senderLifeId:actor.lifeId,senderEpoch:sender.epoch,team:actor.team,matchId:state.matchId,round:state.round,
      expiresAt,serial,botAssigned};
    const recipients=[];
    for(const seat of seats.values())if(liveSeat(seat)&&seat.actor.team===actor.team){
      recipients.push({seat,client:seat.client,lifeId:seat.actor.lifeId,epoch:seat.epoch});
    }
    if(this.pending.length>=MAX_PENDING_SIGNALS)this.pending.shift();
    this.pending.push({sender,client,packet,recipients,expiresAtMs:now+TEAM_COMMS_LIFETIME*1000});
    return true;
  }

  flush(){
    if(!this.pending.length)return;
    const pending=this.pending;
    this.pending=[];
    if(!this.active())return;
    const {state,sim,clock,seats}=this.room;
    for(const {sender,client,packet,recipients,expiresAtMs} of pending){
      if(!liveSeat(sender)||sender.client!==client||seats.get(client.sessionId)!==sender||
        sender.actor.lifeId!==packet.senderLifeId||sender.epoch!==packet.senderEpoch||sender.actor.team!==packet.team||
        state.matchId!==packet.matchId||state.round!==packet.round||sim.game.state.time>=packet.expiresAt||
        clock.elapsedTime>=expiresAtMs)continue;
      for(const recipient of recipients){
        const {seat,client,lifeId,epoch}=recipient;
        if(liveSeat(seat)&&seat.client===client&&seats.get(client.sessionId)===seat&&
          seat.actor.team===packet.team&&seat.actor.lifeId===lifeId&&seat.epoch===epoch){
          client.send(TEAM_COMMS_TYPE,{...packet,recipientLifeId:lifeId,recipientEpoch:epoch});
        }
      }
    }
  }

  assign(sender,kind,expiresAt,expiresAtMs){
    const {sim,bots,state}=this.room;
    const actor=sender.actor;
    this.clearOrder(actor.team);
    sim.game.squadTactics?.refresh();
    let bot=null,bestDistance=Infinity;
    for(const seat of bots.values()){
      const candidate=seat.actor;
      if(candidate.team!==actor.team||!candidate.bot?.canFollowTeamOrder())continue;
      const distance=Math.hypot(candidate.x-actor.x,candidate.z-actor.z);
      if(distance<bestDistance){bot=candidate.bot;bestDistance=distance;}
    }
    if(!bot)return false;

    const order={kind,point:{x:actor.x,y:actor.y,z:actor.z},expiresAt,expiresAtMs,sender,senderActor:actor,senderLifeId:actor.lifeId,
      senderEpoch:sender.epoch,matchId:state.matchId,round:state.round,bot,botLifeId:bot.actor.lifeId};
    this.orders.set(actor.team,order);
    bot.setTeamOrder(order);
    return true;
  }

  clearOrder(team){
    const order=this.orders.get(team);
    if(!order)return;
    if(order.bot.teamOrder===order)order.bot.setTeamOrder(null);
    this.orders.delete(team);
  }

  prune(){
    if(!this.orders.size)return;
    const {state,sim,clock,seats,bots}=this.room;
    for(const [team,order] of this.orders){
      const {sender,senderActor,bot}=order;
      if(!this.active()||state.matchId!==order.matchId||state.round!==order.round||
        sim.game.state.time>=order.expiresAt||clock.elapsedTime>=order.expiresAtMs||
        !liveSeat(sender)||!sender.enabled||seats.get(sender.client.sessionId)!==sender||sender.actor!==senderActor||
        senderActor.team!==team||senderActor.lifeId!==order.senderLifeId||sender.epoch!==order.senderEpoch||
        !bot.actor.alive||bot.actor.team!==team||bot.actor.lifeId!==order.botLifeId||bot.actor.bot!==bot||
        bots.get(bot.actor.id)?.actor!==bot.actor||bot.teamOrder!==order)this.clearOrder(team);
    }
  }

  dispose(){
    this.pending.length=0;
    for(const team of this.orders.keys())this.clearOrder(team);
    this.teamRate.clear();
    this.teamSerial.clear();
  }
}
