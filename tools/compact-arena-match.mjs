// Run with node --import ./server/register-shared.mjs tools/compact-arena-match.mjs.
// The fixture clock drives the normal game and TDM result rules, without wall-clock sleeps.
import assert from 'node:assert/strict';
import {createHeadlessSimulation} from '../server/headless.mjs';
import {MatchLifecycle} from '../server/match-lifecycle.mjs';
import {respawnActor} from '../src/fps/action-rules.mjs';
import {prepareNetworkWorld} from '../shared/multiplayer/world.mjs';
import {NETWORK_CONFIG} from '../shared/multiplayer/rules.mjs';

const teams=['analysts','counterAnalysts'];
const rows=[];
for(const count of [2,4,10]){
  const controllers={};
  for(const team of teams)for(let i=0;i<count/2;i++)controllers[team+'-'+i]='human';
  const sim=await createHeadlessSimulation({mapId:'compact-arena',seed:42,controllers,config:NETWORK_CONFIG});
  const {game}=sim,world=prepareNetworkWorld(game.world);
  const room={sim,state:{},seats:new Map(),clock:{elapsedTime:0},participants:()=>seats};
  const seats=game.actors.map(actor=>({actor,ready:true,connected:true}));
  const lifecycle=new MatchLifecycle(room);
  for(const actor of game.actors)Object.assign(actor,{controllerType:'bot',alive:false});
  for(const actor of game.actors)assert.ok(respawnActor(game,actor));
  room.state.phase='active';
  lifecycle.deadline=room.state.durationSeconds*1000;
  game.state.paused=false;
  world.networkDynamics.elevatorOpenAt=0;
  const visited=new Map(game.actors.map(actor=>[actor.id,new Set()]));
  const activatedDoors=new Set();
  let firstKill=null,respawns=0;
  while(room.state.phase==='active'){
    room.clock.elapsedTime=sim.tickNumber*1000/60;
    lifecycle.beforeTick();
    if(room.state.phase!=='active')break;
    const events=sim.tick();
    lifecycle.afterTick();
    if(firstKill===null&&events.some(e=>e.type==='kill'))firstKill=game.state.time;
    respawns+=events.filter(e=>e.type==='respawn').length;
    for(const door of world.doors.doors)if(door.angle>.4)activatedDoors.add(door.id);
    if(sim.tickNumber%30===0)for(const actor of game.actors.filter(a=>a.alive)){
      assert.ok(world.scopeAllowed(actor.x,actor.z,actor.radius),actor.id+' outside arena');
      const room=world.roomAt(actor.x,actor.z);
      if(room)visited.get(actor.id).add(room.publicName);
    }
  }
  const result=JSON.parse(room.state.results);
  assert.ok(firstKill!==null);
  assert.ok(respawns>0);
  assert.ok([...visited.values()].every(zones=>zones.size>=3));
  rows.push({actors:count,seed:42,score:result.score,winner:result.winner,reason:result.reason,
    simulationSeconds:+game.state.time.toFixed(2),firstKillSeconds:+firstKill.toFixed(2),respawns,
    doorsOpened:activatedDoors.size,areasVisited:Object.fromEntries([...visited].map(([id,areas])=>[id,[...areas].sort()]))});
}
console.log(JSON.stringify({mapId:'compact-arena',fixture:'Headless 60 Hz, all slots bot-controlled; normal TDM timer and score target',matches:rows},null,2));
