import test from 'node:test';
import assert from 'node:assert/strict';
import {REPLAY_FRAMES,REPLAY_SECONDS,sampleReplay,validReplayClip} from '../../shared/multiplayer/replay.mjs';
import {ReplayPlayback,SoloReplays} from '../../src/fps/replay-playback.mjs';
import {RoomReplays} from '../room-replays.mjs';

const world={matchId:7,round:1,worldRevision:1,mapId:'givre'};
const actor=(id,x)=>({id,name:id,team:x?'analysts':'counterAnalysts',x,y:0,z:0,yaw:3.12,pitch:0,height:1.72,
  weapon:'sniper',alive:true,lifeId:1,controlEpoch:4,aimAmount:1,accountId:'private-account'});
function setup(mode='tdm'){
  const actors=[actor('killer',0),actor('victim',5),actor('bystander',3)];
  const received={};
  const seats=new Map(actors.map(a=>{
    received[a.id]=[];
    const client={sessionId:'socket-'+a.id,send:(type,msg)=>received[a.id].push([type,msg])};
    return [client.sessionId,{actor:a,ready:true,connected:true,client,epoch:a.controlEpoch}];
  }));
  const state={...world,mode,roundPhase:'active',phase:'active'};
  const game={actors,state:{time:0}};
  const manager=new RoomReplays({state,seats,sim:{game}});
  function sample(t,events=[]){game.state.time=t;manager.capture(events);}
  function death(t){
    actors[1].alive=false;
    sample(t,[{type:'shot',actorId:'killer',time:t,yaw:-3.12,pitch:.04},{type:'kill',sourceId:'killer',actorId:'victim',weapon:'sniper',serial:41}]);
  }
  const scope=()=>({...state,actorId:'victim',lifeId:actors[1].lifeId,controlEpoch:4,connected:true,alive:actors[1].alive});
  return {manager,actors,seats,state,received,sample,death,scope};
}
test('bounded ring sends only two historical poses and confirmed shooter shots to the victim',()=>{
  const f=setup();
  for(let i=0;i<300;i++){f.actors[0].x=i/100;f.sample(i/30,[{type:'shot',actorId:'bystander',time:i/30}]);}
  f.death(10);f.manager.flush();
  assert.equal(f.received.killer.length+f.received.bystander.length,0);
  const [type,p]=f.received.victim[0];assert.equal(type,'replay');
  assert.ok(validReplayClip(p.clip));assert.ok(p.clip.samples.length<=REPLAY_FRAMES);
  assert.ok(p.clip.samples.at(-1).t<=REPLAY_SECONDS+.001);assert.equal(p.clip.shots.length,1);
  assert.ok(f.manager.history.frames.length<=REPLAY_FRAMES);assert.ok(f.manager.history.shots.length<=96);
  assert.doesNotMatch(JSON.stringify(p),/bystander|private-account|socket/);
  const samples=p.clip.samples;assert.equal(samples.at(-1).k.pitch,.04);
  const time=(samples.at(-2).t+samples.at(-1).t)/2;
  assert.ok(Math.abs(sampleReplay(p.clip,time).camera.yaw)>3);
  f.actors[0].x=12345;assert.notEqual(sampleReplay(p.clip,time).camera.x,12345);
});
test('card → historical scope, legitimate respawn, timeout, skip and disconnected fallback',()=>{
  const f=setup();for(let i=0;i<21;i++)f.sample(i/10);
  f.death(2.1);f.manager.flush();const [,packet]=f.received.victim[0];
  for(const changed of [{alive:true},{lifeId:2},{controlEpoch:5},{worldRevision:2},{round:2},{matchId:8},{actorId:'stranger'},{connected:false}]){
    const p=new ReplayPlayback();assert.ok(p.receive(packet,f.scope(),0));
    assert.equal(p.frame.stage,'card');assert.equal(p.update(f.scope(),1200).scoped,true);
    assert.equal(p.update({...f.scope(),...changed},1201),null);
    assert.equal(p.receive(packet,{...f.scope(),...changed},1300),false);
  }
  const p=new ReplayPlayback();p.receive(packet,f.scope(),0);
  assert.equal(p.update(f.scope(),6000),null);
  p.reset();p.receive(packet,f.scope(),0);p.skip();assert.equal(p.update(f.scope(),1100),null);
  assert.equal(p.receive(packet,f.scope(),1400),false);
  const late=new ReplayPlayback(),deadline={...f.scope(),respawnRemaining:1.3};
  assert.ok(late.receive(packet,deadline,0));assert.equal(late.frame.stage,'card');
  assert.equal(late.update(deadline,1030).target.alive,false,'actual finishing shot reached before the legitimate respawn');
  assert.equal(f.actors[1].alive,false);assert.equal(f.actors[1].lifeId,1);
});
test('unavailable history and live Classic expose only the death card, final kill only after results',()=>{
  for(const mode of ['classic','tdm']){
    const f=setup(mode);
    if(mode==='classic')for(let i=0;i<12;i++)f.sample(i/10);
    f.death(1.2);f.manager.flush();
    const [,packet]=f.received.victim[0];assert.ok(packet.card);assert.equal(packet.clip,undefined);
    assert.doesNotMatch(JSON.stringify(packet),/"samples"|"shots"|"yaw"|"pitch"/);
    const p=new ReplayPlayback();assert.ok(p.receive(packet,f.scope(),0));assert.equal(p.update(f.scope(),810),null);
    f.state.phase='results';f.sample(1.2);f.manager.flush();
    if(mode==='tdm'){assert.equal(f.received.killer.length,0);continue;}
    const [,final]=f.received.victim[1];assert.equal(final.kind,'final');assert.ok(final.clip);
    assert.equal(f.received.killer.length,1);assert.equal(f.received.bystander.length,1);
    assert.equal(p.receive(final,{...f.scope(),phase:'active'},2000),false);
    assert.ok(p.receive(final,f.scope(),2001));assert.equal(p.frame.stage,'replay');
    f.sample(1.2);f.manager.flush();assert.equal(f.received.victim.length,2);
  }
});
test('life discontinuity cuts old trajectory, pending deliveries recheck recipient and socket',()=>{
  const changes=[
    f=>f.seats.get('socket-victim').epoch++,
    f=>f.actors[1].lifeId++,
    f=>f.actors[1].alive=true,
    f=>f.seats.get('socket-victim').client={sessionId:'socket-victim'},
    f=>f.seats.get('socket-victim').connected=false,
    f=>f.seats.delete('socket-victim'),
    f=>f.state.worldRevision++,
  ];
  for(const change of changes){
    const f=setup();f.sample(0);f.actors[0].lifeId++;f.actors[0].x=50;f.sample(.1);f.death(.2);
    assert.ok(f.manager.lastKill.samples.every(s=>s.k.x===50));
    change(f);f.manager.flush();assert.deepEqual(f.received.victim,[]);
  }
});
test('solo uses same recorder, scoped viewer and ordinary classic spectator lifecycle',()=>{
  for(const mode of ['endless','classic']){
    const f=setup();const s={...world,time:0,mode,phase:'active'};
    const solo=new SoloReplays({player:f.actors[1],actors:f.actors,state:s,world:{referenceId:'givre'}});
    for(let i=0;i<15;i++){s.time=i/15;solo.capture([]);}
    s.time=1;f.actors[1].alive=false;solo.capture([{type:'kill',actorId:'victim',sourceId:'killer',weapon:'sniper',serial:30}]);
    assert.equal(solo.playback.frame.stage,'card');
    const start=solo.playback.started;
    if(mode==='endless')assert.equal(solo.update(start+820).stage,'replay');
    else assert.equal(solo.update(start+820),null);
    f.actors[1].alive=true;f.actors[1].lifeId++;assert.equal(solo.update(start+830),null);
    s.phase='match';solo.capture([]);assert.equal(solo.update().kind,'final');
  }
});
