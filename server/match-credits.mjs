import {randomUUID} from 'node:crypto';
import {combatOpponents} from '../src/fps/bonuses.mjs';
import {completion,deltas,elimination,fold,playerXP,tally} from './progression.mjs';

// One scoring seat per signed user. Grace reconnects keep the same seat. Full
// leaves seal the session segment, so a different tab cannot claim its events.
export class MatchCredits {
  constructor(seats){
    this.id=randomUUID();
    this.players=new Map();
    this.byActor=new Map();
    this.deaths=new Map();
    this.serial=0;
    for(const seat of seats)this.admit(seat);
  }
  admit(seat){
    if(!seat.admitted||seat.pending||!seat.actor||this.byActor.has(seat.actor.id))return;
    const user=seat.credential?.user;
    const key=user??seat;
    const player=this.players.get(key)??{user,seat:null,sessions:new Map()};
    if(player.seat)return;
    player.seat=seat;
    player.live=tally();
    player.chain=0;player.lastKill=-Infinity;
    this.players.set(key,player);
    this.byActor.set(seat.actor.id,player);
  }
  leave(seat){
    const player=this.byActor.get(seat?.actor?.id);
    if(!player||player.seat!==seat)return;
    const session=seat.credential?.session;
    const part=fold([player.sessions.get(session)??tally(),player.live]);
    Object.assign(part,{session,team:seat.actor.team,actorId:seat.actor.id});
    player.sessions.delete(session);
    player.sessions.set(session,part);
    player.seat=null;
    this.byActor.delete(seat.actor.id);
    if(!player.user)this.players.delete(seat);
  }
  // The synchronous observer uses the exact actor/life that generated the
  // event, including grenades, two deaths in one tick and overlapping logins.
  event(room,e){
    if(e.serial<=this.serial||room.state.phase!=='active')return;
    this.serial=e.serial;
    if(e.type!=='kill'&&e.type!=='combat-medal'&&e.type!=='bonus-activated')return;
    const g=room.sim.game;
    if(g.state.paused||g.phase!=='active')return;
    const actor=g.actors.find(a=>a.id===e.actorId);
    if(!actor||e.lifeId!=null&&e.lifeId!==actor.lifeId||e.controlEpoch!=null&&e.controlEpoch!==(actor.controlEpoch||0))return;
    const member=this.byActor.get(actor.id);
    const live=member?.seat?.connected&&!member.seat.pending&&!member.seat.revoked;
    if(e.type==='bonus-activated'){
      if(live&&e.bonusId==='uav')member.live.challenges.tUav=(member.live.challenges.tUav||0)+1;
      return;
    }
    if(e.type==='combat-medal'){
      if(!live)return;
      if(e.kind==='capture'&&room.state.mode==='dom')member.live.challenges.vDom=(member.live.challenges.vDom||0)+1;
      if(e.kind==='assist'){
        const death=this.deaths.get(e.targetId);
        if(!death?.eligible||e.targetLifeId!==death.life||death.assists.has(actor.id)||actor.id===death.killer||
            member.user&&death.victimUser===member.user)return;
        death.assists.add(actor.id);
        member.live.assists++;
        this.reward(room,member.seat,e,{kind:'assist',xp:5,weapon:'',weaponXp:0});
      }
      return;
    }
    if(!['human','bot'].includes(actor.controllerType))return;
    const source=g.actors.find(a=>a.id===e.sourceId);
    const shooter=this.byActor.get(source?.id);
    const seats=[...room.seats.values()];
    const victimSeat=seats.find(s=>s.actor===actor),sourceSeat=seats.find(s=>s.actor===source);
    const victimUser=victimSeat?.credential?.user;
    const key=[actor.lifeId,actor.controlEpoch||0,g.state.round].join('/');
    if(this.deaths.get(actor.id)?.key===key)return;
    const eligible=combatOpponents(source,actor,room.state.mode)&&
      (e.sourceLifeId==null||e.sourceLifeId===source.lifeId)&&
      (e.sourceControlEpoch==null||e.sourceControlEpoch===(source.controlEpoch||0))&&
      (!victimSeat||victimSeat.connected&&!victimSeat.revoked)&&
      (!sourceSeat||sourceSeat.connected&&!sourceSeat.revoked)&&
      (!victimUser||victimUser!==sourceSeat?.credential?.user);
    this.deaths.set(actor.id,{key,life:actor.lifeId,eligible,killer:source?.id,victimUser,assists:new Set()});
    if(live){member.live.deaths++;member.chain=0;member.lastKill=-Infinity;}
    if(!eligible||!shooter?.seat?.connected||shooter.seat.revoked)return;
    shooter.chain=e.time-shooter.lastKill<4?shooter.chain+1:1;
    shooter.lastKill=e.time;
    const reward=elimination(shooter.live,e,source,actor,shooter.chain,room.state.mapId);
    this.reward(room,shooter.seat,e,reward);
  }
  reward(room,seat,event,reward){
    seat.client.send('reward',{actorId:seat.actor.id,matchId:room.state.matchId,
      round:room.classic?room.sim.game.state.round:room.state.round,worldRevision:room.state.worldRevision,
      lifeId:seat.actor.lifeId,controlEpoch:seat.epoch,serial:event.serial,...reward});
  }
  observe(room,events){
    for(const event of events)this.event(room,event);
  }
  finish(winner,room){
    const results=[];
    const standings=JSON.parse(room.state.results).players;
    for(const player of [...this.players.values()]){
      const seat=player.seat;
      if(seat){
        if(seat.connected&&!seat.revoked){
          const rank=standings.findIndex(p=>p.id===seat.actor.id)+1;
          completion(player.live,room.state.mode,room.state.mapId,rank,
            (room.state.mode==='ffa'?seat.actor.id:seat.actor.team)===winner);
        }
        this.leave(seat);
      }
      // An FFA actor ID can be reseated. Its eventual victory belongs to the
      // winning occupant and cannot retroactively turn a former occupant into a winner.
      const segments=[...player.sessions.values()].map(s=>({...s,win:room.state.mode==='ffa'
        ? Boolean(seat?.connected&&!seat.revoked&&s.session===seat.credential?.session&&seat.actor.id===winner)
        : s.team===winner}));
      results.push({user:player.user,seat,segments});
    }
    return results;
  }
  present(room,seat,parts,ranked){
    if(!seat?.connected||seat.revoked)return;
    const p=fold(parts);
    seat.client.send('match-progression',{actorId:seat.actor.id,matchId:room.state.matchId,worldRevision:room.state.worldRevision,
      ranked,xp:playerXP(p),assists:p.assists,headshots:p.headshots,weapons:Object.entries(p.weapons).map(([id,xp])=>({id,xp})),challenges:deltas(p.challenges)});
  }
}
