import {randomUUID} from 'node:crypto';

// A participant earns from one authoritative actor at a time. A grace reservation
// retains that actor. A full leave completes its segment before another tab can take over.
export class MatchCredits {
  constructor(seats){
    this.id=randomUUID();
    this.players=new Map();
    for(const seat of seats)this.admit(seat);
  }
  admit(seat){
    const user=seat.credential?.user;
    if(!user||!seat.admitted||seat.pending||!seat.actor)return;
    let player=this.players.get(user);
    if(!player){
      player={seat:null,sessions:new Map()};
      this.players.set(user,player);
    }
    if(player.seat)return;
    player.seat=seat;
    player.baselineKills=seat.actor.kills;
    player.baselineDeaths=seat.actor.deaths;
  }
  leave(seat){
    const player=this.players.get(seat?.credential?.user);
    if(!player||player.seat!==seat)return;
    const session=seat.credential.session;
    const segment=player.sessions.get(session)??{session,kills:0,deaths:0};
    segment.kills+=seat.actor.kills-player.baselineKills;
    segment.deaths+=seat.actor.deaths-player.baselineDeaths;
    segment.team=seat.actor.team;
    // Map order records which valid session last participated, including team changes.
    player.sessions.delete(session);
    player.sessions.set(session,segment);
    player.seat=null;
  }
  finish(winner){
    const results=[];
    for(const [user,player] of this.players){
      if(player.seat)this.leave(player.seat);
      const segments=[...player.sessions.values()].map(({session,kills,deaths,team})=>({session,kills,deaths,win:team===winner}));
      results.push({user,segments});
    }
    return results;
  }
}
