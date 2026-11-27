// User-facing identifiers are random and local to each publication. Only the server
// binds them to account rows, a room's current owner, or a Colyseus seat.
import {randomUUID} from 'node:crypto';

const reasons=new Set(['harassment','cheating','inappropriate-name','other']);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
const unavailable=()=>fail(404,'That public room is unavailable.');
const day=86400000;

export function publicRooms(store,active){
  const db=store.db;
  function sessionLive(credential){
    return !!credential?.user&&!!db.prepare('SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?')
      .get(credential.session,credential.user,store.now());
  }
  function revoke(room){
    if(!room?.publication)return;
    room.publication=null;
    db.prepare('DELETE FROM public_grants WHERE room=?').run(room.roomId);
    for(const seat of room.seats.values())if(seat.credential?.publicEpoch){seat.revoked=true;seat.client.leave(4003);}
  }
  function publication(room){
    if(!room?.publication)return;
    const host=room.seats.get(room.state.ownerId);
    if(!host?.connected||host.revoked||host!==room.publication.host||!sessionLive(host.credential)){
      revoke(room);return;
    }
    return room.publication;
  }
  function visible(room,user,capacity=true){
    const listing=publication(room);
    if(!listing||!user||listing.banned.has(user)||capacity&&(!listing.host.ready||room.changingMap||room.locked||room.hasReachedMaxClients()||room.state.phase==='results'))return false;
    const blocked=db.prepare('SELECT 1 FROM public_blocks WHERE (owner=? AND target=?) OR (owner=? AND target=?)');
    for(const seat of room.seats.values()){
      const peer=seat.credential?.user;
      if(peer&&blocked.get(user,peer,peer,user))return false;
    }
    return true;
  }
  function list(user){
    return [...active].filter(room=>visible(room,user)).map(room=>({id:room.roomId,map:room.state.mapId,mode:room.state.mode,
      players:room.clients.length,capacity:room.maxClients}));
  }
  function scopes(device,user){
    if(!device||!user)return [];
    const grants=db.prepare('SELECT room,epoch FROM public_grants WHERE device=? AND session=? AND expires>?').all(device,user.session,store.now());
    return grants.filter(grant=>{
      const room=[...active].find(r=>r.roomId===grant.room);
      return visible(room,user.id,false)&&room.publication.epoch===grant.epoch;
    }).map(grant=>grant.room);
  }
  function canJoin(room,credential){
    return !!credential&&visible(room,credential.user,false)&&credential.publicEpoch===room.publication.epoch&&sessionLive(credential)&&
      !!db.prepare('SELECT 1 FROM public_grants WHERE device=? AND room=? AND session=? AND epoch=? AND expires>?')
        .get(credential.device,room.roomId,credential.session,credential.publicEpoch,store.now());
  }
  function grant(room,user,device){
    if(!visible(room,user.id))unavailable();
    // A returned device can enter only this publication, on this account session.
    db.prepare(`INSERT INTO public_grants VALUES(?,?,?,?,?) ON CONFLICT(device,room) DO UPDATE SET session=excluded.session,epoch=excluded.epoch,
      expires=CASE WHEN public_grants.session=excluded.session AND public_grants.epoch=excluded.epoch THEN max(public_grants.expires,excluded.expires) ELSE excluded.expires END`)
      .run(device,room.roomId,user.session,room.publication.epoch,store.now()+5*60000);
  }
  function enter(room,credential){
    if(!canJoin(room,credential)||[...room.seats.values()].some(seat=>seat.credential?.user===credential.user))
      fail(403,'Public room admission is unavailable.');
    db.prepare('UPDATE public_grants SET expires=? WHERE device=? AND room=? AND session=? AND epoch=?')
      .run(store.now()+2*3600000,credential.device,room.roomId,credential.session,credential.publicEpoch);
  }
  function member(room,user,device){
    return [...(room?.seats?.values()||[])].find(seat=>seat.connected&&seat.ready&&!seat.revoked&&seat.credential?.device===device&&
      seat.credential?.user===user.id&&seat.credential.session===user.session);
  }
  function publish(room,user,device,enabled){
    const seat=member(room,user,device);
    if(!seat||room.seats.get(room.state.ownerId)!==seat||room.familyRoom)fail(403,'Only the signed-in host of a private match can change its listing.');
    if(!enabled){revoke(room);return;}
    if(publication(room))return;
    if(room.state.phase!=='waiting'||room.seats.size!==1||room.clients.length!==1||room.locked||
      db.prepare('SELECT 1 FROM grants WHERE room=? AND device<>? AND expires>?').get(room.roomId,device,store.now()))
      fail(409,'Publish a waiting room before inviting other players.');
    if(db.prepare('SELECT 1 FROM invites WHERE room=? AND expires>? AND used=0').get(room.roomId,store.now()))fail(409,'Revoke outstanding private invitations first.');
    room.publicBans??=new Set();
    room.publication={epoch:randomUUID(),host:seat,refs:new Map(),banned:room.publicBans};
  }
  function peers(room){
    const listing=room.publication,players=new Map();
    for(const seat of room.seats.values()){
      if(!seat.connected||!seat.ready||seat.revoked||!sessionLive(seat.credential))continue;
      const user=seat.credential.user;
      if(!listing.refs.has(user))listing.refs.set(user,randomUUID());
      players.set(listing.refs.get(user),{user,name:seat.name});
    }
    for(const [user,id] of listing.refs)if(!players.has(id))listing.refs.delete(user);
    return players;
  }
  function moderation(room,user,device){
    const caller=member(room,user,device),listing=publication(room);
    if(!caller||room.familyRoom)unavailable();
    const host=room.seats.get(room.state.ownerId)===caller;
    if(!listing&&!host)unavailable();
    const players=listing?peers(room):new Map();
    const reports=[];
    if(listing&&host){
      for(const row of db.prepare('SELECT target,reason,count(*) AS count FROM public_reports WHERE epoch=? GROUP BY target,reason')
        .all(listing.epoch)){
        const player=listing.refs.get(row.target);if(players.has(player))reports.push({player,reason:row.reason,count:row.count});
      }
    }
    return {room:room.roomId,published:!!listing,host,players:[...players].filter(([,p])=>p.user!==user.id).map(([id,p])=>({id,name:p.name})),reports};
  }
  function moderate(action,room,user,device,input){
    const caller=member(room,user,device);
    if(!publication(room)||!caller)unavailable();
    const target=peers(room).get(input.player);
    if(!target||target.user===user.id)fail(400,'Choose a current player.');
    const host=room.seats.get(room.state.ownerId)===caller;
    if(action==='report'){
      if(!reasons.has(input.reason))fail(400,'Choose a report reason.');
      store.transaction(()=>{
        db.prepare('DELETE FROM public_reports WHERE created<=?').run(store.now()-30*day);
        if(db.prepare('SELECT COUNT(*) AS n FROM public_reports WHERE reporter=? AND created>?').get(user.id,store.now()-day).n>=10||
          db.prepare('SELECT COUNT(*) AS n FROM public_reports').get().n>=4096)fail(429,'Report limit reached. Try again later.');
        db.prepare('INSERT OR IGNORE INTO public_reports VALUES(?,?,?,?,?)').run(room.publication.epoch,user.id,target.user,input.reason,store.now());
      });return;
    }
    if(action==='remove'){
      if(!host)fail(403,'Only the host can remove players.');
      if(room.publication.banned.size>=128)fail(429,'Room moderation limit reached. Close the public listing.');
      room.publication.banned.add(target.user);
    }else{
      if(db.prepare('SELECT count(*) AS n FROM public_blocks WHERE owner=?').get(user.id).n>=128)fail(429,'Remove an existing block first.');
      db.prepare('INSERT OR IGNORE INTO public_blocks VALUES(?,?,?)').run(randomUUID(),user.id,target.user);
    }
    const leaving=host?target.user:user.id;
    const seats=[...room.seats.values()].filter(seat=>seat.credential?.user===leaving);
    for(const seat of seats){
      db.prepare('DELETE FROM public_grants WHERE device=? AND room=?').run(seat.credential.device,room.roomId);
      seat.revoked=true;seat.client.leave(4003);
    }
  }
  function blocks(user){
    return db.prepare('SELECT b.id,u.display_name AS name FROM public_blocks b JOIN users u ON u.id=b.target WHERE b.owner=? ORDER BY b.rowid DESC').all(user.id);
  }
  function unblock(user,id){db.prepare('DELETE FROM public_blocks WHERE id=? AND owner=?').run(id,user.id);}
  function forget(room,device){db.prepare('DELETE FROM public_grants WHERE room=? AND device=?').run(room,device);}
  function reconcile(){
    for(const room of active)if(publication(room)){
      for(const seat of room.seats.values())if(seat.credential?.publicEpoch&&!seat.revoked&&!canJoin(room,seat.credential)){
        seat.revoked=true;seat.client.leave(4003);
      }
    }
  }
  const timer=setInterval(reconcile,30000);timer.unref();
  return {visible,enter,reconcile,close:()=>clearInterval(timer),list,scopes,canJoin,grant,publish,publication,revoke,moderation,moderate,blocks,unblock,forget};
}
