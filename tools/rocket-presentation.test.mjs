import test from 'node:test';
import assert from 'node:assert/strict';
import * as THREE from '../vendor/three/three.module.js';
import {ActionVisuals} from '../src/fps/action-visuals.mjs';
import {AudioSystem} from '../src/fps/audio.mjs';
import {NetworkSession} from '../src/fps/network/session.mjs';

const launch={type:'rocket-launch',rocketId:'rocket-17',matchId:7,round:3,eventId:18,time:10,x:0,y:1.6,z:0};
const impact={...launch,type:'rocket-explosion',eventId:19,time:10.35,z:-7.7,flightFrom:{x:0,y:1.6,z:-7.6}};

function visualScene(){
  const visuals=Object.assign(Object.create(ActionVisuals.prototype),{
    root:new THREE.Group(),rocketGeometry:new THREE.CapsuleGeometry(),rocketMaterial:new THREE.MeshBasicMaterial(),
    rockets:new Map(),unseenLaunches:new Map(),shortFlights:[],particles:[],position:new THREE.Vector3(),
    light:new THREE.PointLight(),lightUntil:-1,lastTrail:-1,
  });
  const game={config:{networkSlice:true},state:{time:10,projectiles:[]}};
  return {visuals,game};
}

test('a whole confirmed flight between paints presents one model before the impact',()=>{
  const {visuals,game}=visualScene();
  visuals.events([launch,impact],game);
  visuals.updateRockets(game.state,10.4);
  const mesh=visuals.rockets.get(impact.rocketId);
  assert.equal(mesh.parent,visuals.root);
  assert.deepEqual(mesh.position.toArray(),[0,1.6,-3.85]);
  assert.equal(visuals.lightUntil,-1);
  visuals.updateRockets(game.state,10.5);
  assert.equal(visuals.rockets.size,0);
  assert.equal(visuals.shortFlights.length,0);
  assert.equal(visuals.unseenLaunches.size,0);
  assert.equal(visuals.lightUntil,10.5+.32);
  assert(visuals.particles.length>=24);
  assert.deepEqual(game.state.projectiles,[]);
});

test('a lethal flight between paints holds only its victim’s current view until impact',()=>{
  const {visuals,game}=visualScene();
  const victim=game.player={id:'analysts-0',lifeId:7,alive:false};
  const kill={type:'kill',rocketId:impact.rocketId,actorId:victim.id,lifeId:7};
  visuals.events([launch,impact],game);
  assert.equal(visuals.finishingFlightFor(victim),false);
  visuals.events([kill],game);
  assert(visuals.finishingFlightFor(victim));
  for(const actor of [{...victim,id:'ally'},{...victim,lifeId:8},{...victim,alive:true}])
    assert.equal(visuals.finishingFlightFor(actor),false);
  visuals.updateRockets(game.state,10.4);
  assert(visuals.finishingFlightFor(victim),'first frame shows the actual approach');
  visuals.updateRockets(game.state,10.5);
  assert.equal(visuals.finishingFlightFor(victim),false,'the next frame may select a living teammate');
  assert.equal(victim.alive,false);
});

test('a flight already displayed from a server snapshot explodes without a replay',()=>{
  const {visuals,game}=visualScene();
  visuals.events([launch],game);
  game.state.projectiles=[{id:launch.rocketId,x:0,y:1.6,z:-3,vx:0,vy:0,vz:-22}];
  visuals.updateRockets(game.state,10.15);
  assert.equal(visuals.rockets.get(launch.rocketId).position.z,-3);
  game.state.time=10.35;game.state.projectiles=[];
  visuals.events([impact],game);
  assert.equal(visuals.lightUntil,10.35+.32);
  visuals.updateRockets(game.state,10.35);
  assert.equal(visuals.rockets.size,0);
  assert.equal(visuals.shortFlights.length,0);
});

test('rocket sound uses the confirmed patch once and still rejects stale or muted cues',()=>{
  const played=[];
  const audio=new AudioSystem({}, {volume:.5});
  Object.assign(audio,{context:{state:'running'},listener:{},play:event=>played.push([event.rocketId,event.type])});
  const state={phase:'active',mode:'classic',matchId:7,round:3,time:10.05,actors:new Map(),residents:new Map()};
  const session=Object.assign(Object.create(NetworkSession.prototype),{
    room:{state},enabled:true,closed:false,connectionState:'connected',seenEvent:0,events:[],
    onRocketAudio(e,serverTime){audio.handleEvent(e,serverTime);return true;},
  });
  session.receiveEvents([launch]);
  state.time=10.4;
  session.receiveEvents([launch,impact]);
  session.receiveEvents([{...impact,eventId:20,round:2},{...impact,eventId:21,matchId:6}]);
  assert.deepEqual(played,[[launch.rocketId,'rocket-launch'],[launch.rocketId,'rocket-explosion']]);
  assert(session.drainEvents().every(e=>e.audioPresented));
  assert.equal(audio.stats.duplicates,0);
  state.time+=1;
  session.receiveEvents([{...impact,eventId:22}]);
  assert.equal(audio.stats.stale,1);
  audio.volume=0;
  session.receiveEvents([{...impact,eventId:23,time:state.time}]);
  session.connectionState='reconnecting';
  session.receiveEvents([{...impact,eventId:24,time:state.time}]);
  assert.equal(played.length,2);
});
