import test from 'node:test';
import assert from 'node:assert/strict';
import {MatchCredits} from '../match-credits.mjs';

function fixture(mode='tdm'){
  const messages=[];
  function seat(id,team,user){
    const actor={id,team,lifeId:1,controlEpoch:3,controllerType:'human',inventory:{primary:{id:'smg',attachments:['sil']}},crouching:true,onGround:true,slideUntil:0};
    return {actor,epoch:3,ready:true,admitted:true,connected:true,credential:user?{user,session:user+'-session'}:{},
      client:{send:(channel,payload)=>messages.push({id,channel,payload})}};
  }
  const source=seat('a','analysts','first'),target=seat('b','counterAnalysts','second'),assist=seat('c','analysts');
  const others=[source,target,assist];
  const room={state:{mode,phase:'active',worldRevision:1,matchId:8,round:0,mapId:'embruns',
    results:JSON.stringify({players:others.map(s=>({id:s.actor.id}))})},
    sim:{game:{phase:'active',state:{paused:false,round:1},actors:others.map(s=>s.actor)}},seats:new Map(others.map(s=>[s.actor.id,s]))};
  const credits=new MatchCredits(others);
  let serial=0;
  function emit(type,actor,extra={}){
    const e={type,actorId:actor.id,lifeId:actor.lifeId,controlEpoch:actor.controlEpoch,time:10,serial:++serial,...extra};
    credits.event(room,e);return e;
  }
  const kill=(extra={})=>emit('kill',target.actor,{sourceId:source.actor.id,sourceLifeId:1,sourceControlEpoch:3,
    weapon:'smg',head:false,point:{x:51,y:1,z:0},sourcePosition:{x:0,y:1,z:0},...extra});
  return {credits,room,messages,source,target,assist,kill,emit};
}
test('only eligible authority events award private player and weapon XP once across lives and epochs',()=>{
  const {credits,room,messages,source,target,assist,kill,emit}=fixture();
  target.actor.deathVariant='headshot';
  const e=kill({head:true});
  credits.observe(room,[e]);
  kill({head:true});
  emit('combat-medal',assist.actor,{kind:'assist',targetId:'b',targetLifeId:1});
  emit('combat-medal',assist.actor,{kind:'assist',targetId:'b',targetLifeId:1});
  target.actor.lifeId++;
  kill({sourceLifeId:0});
  target.actor.lifeId++;
  target.actor.controlEpoch++;source.actor.crouching=false;source.actor.slideUntil=13;
  kill({time:12});
  assert.deepEqual(messages.map(m=>[m.id,m.payload.kind,m.payload.xp,m.payload.weaponXp]),
    [['a','headshot',15,150],['c','assist',5,0],['a','kill',10,100]]);
  for(const {payload} of messages){
    assert.deepEqual(Object.keys(payload).sort(),['actorId','controlEpoch','kind','lifeId','matchId','round','serial','weapon','weaponXp','worldRevision','xp'].sort());
    assert.equal(payload.round,0);
  }
  const results=credits.finish('analysts',room);
  const scorer=results.find(p=>p.user==='first').segments[0];
  assert.equal(scorer.kills,2);assert.equal(scorer.headshots,1);assert.equal(scorer.weapons.smg,250);
  assert.deepEqual(scorer.challenges,{rPm:2,tLoin:2,fSil:2,fAcc:1,gElim:2,rDouble:1,rMouv:1,fCartes:1,gParties:1,gVict:1});
  const guest=results.find(p=>!p.user);
  credits.present(room,guest.seat,guest.segments,false);
  assert.deepEqual(messages.at(-1).payload,{actorId:'c',matchId:8,worldRevision:1,ranked:false,xp:30,headshots:0,assists:1,
    weapons:[],challenges:[{id:'fCartes',count:1},{id:'gParties',count:1},{id:'gVict',count:1}]});
});
test('friendly, self, resident, stale life, paused and same-account opposition give no rewards',()=>{
  const {room,messages,source,target,kill}=fixture();
  target.actor.team=source.actor.team;kill();
  target.actor.team='counterAnalysts';target.actor.lifeId++;
  kill({sourceId:target.actor.id,sourceLifeId:target.actor.lifeId});
  target.actor.lifeId++;target.actor.controllerType='resident';kill();
  target.actor.controllerType='human';target.credential.user=source.credential.user;kill();
  target.actor.lifeId++;target.credential.user='second';kill({controlEpoch:0});
  room.sim.game.state.paused=true;kill();
  assert.equal(messages.length,0);
});
test('FFA scoring uses actor identity, qualified connected finishes and server captures/activations',()=>{
  const {credits,room,source,target,assist,kill,emit}=fixture('ffa');
  target.actor.team='analysts';kill({weapon:'knife'});
  const bonus=emit('bonus-activated',source.actor,{bonusId:'uav'});
  credits.observe(room,[bonus]);
  emit('combat-medal',source.actor,{kind:'capture'});
  room.state.mode='dom';emit('combat-medal',source.actor,{kind:'capture'});
  credits.leave(assist);
  room.state.mode='ffa';
  const results=credits.finish(source.actor.id,room);
  const score=results.find(p=>p.user==='first').segments[0],loser=results.find(p=>p.user==='second').segments[0];
  assert.equal(score.win,true);assert.equal(loser.win,false);
  assert.deepEqual(score.challenges,{nBrut:1,gElim:1,tUav:1,vDom:1,nFfa:1,fCartes:1,gParties:1,gVict:1});
  assert.equal(results.some(p=>!p.user),false);
});

test('a vacated FFA actor ID cannot confer its new occupant’s win on a former account',()=>{
  const {room,credits,source}=fixture('ffa');
  credits.leave(source);
  const replacement={...source,actor:{...source.actor,lifeId:2,controlEpoch:4},credential:{user:'replacement',session:'replacement-session'}};
  room.seats.set(source.actor.id,replacement);credits.admit(replacement);
  const results=credits.finish(source.actor.id,room);
  const departed=results.find(p=>p.user==='first').segments[0],winner=results.find(p=>p.user==='replacement').segments[0];
  assert.equal(departed.win,false);assert.equal(departed.completed,false);
  assert.equal(winner.win,true);assert.equal(winner.completed,true);
});
