// Loopback API spike only. No production room, lobby route or public listener.
import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {setTimeout as delay} from 'node:timers/promises';
import {Server, Room} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {schema, t as field} from '@colyseus/schema';
import {Client, Predict} from '@colyseus/sdk';
import {createHeadlessSimulation} from '../headless.mjs';
import {moveActor} from '../../src/fps/movement.mjs';

const Input=schema({sequence:field.uint32(),forward:field.float64(),strafe:field.float64(),yaw:field.float64(),pitch:field.float64(),jump:field.boolean(),crouch:field.boolean()},'FoundationInput');
const poseFields=['x','y','z','yaw','pitch','height','vy','moving','distanceWalked','lastStep'];
const boolFields=['onGround','crouching','jumpHeld'];
const ActorState=schema(Object.fromEntries([...poseFields.map(k=>[k,field.float64()]),...boolFields.map(k=>[k,field.boolean()])]),'FoundationActor');
const State=schema({actor:ActorState,tick:field.uint32(),time:field.float64()},'FoundationState');
const wireFrame = f => Object.fromEntries(['forward','strafe','yaw','pitch','jump','crouch'].map(k=>[k,f[k]]));
const copyPose=(target,source)=>{for(const k of [...poseFields,...boolFields])target[k]=source[k];};
async function fixture(){
 const sim=await createHeadlessSimulation({mapId:'synthetic-demo',controllers:{'analysts-0':'human'},config:{mode:'endless',firefight:false}});
 const actor=sim.game.actors[0];Object.assign(actor,{x:2,z:2,y:0,yaw:0,pitch:0});
 for(const a of sim.game.actors)if(a!==actor)a.alive=false;
 for(const h of sim.game.hostages)h.rescued=true;
 sim.game.update=()=>{throw Error('framework must not call the render accumulator');};
 return {sim,actor};
}
async function until(predicate,label,timeout=5000){
 const end=performance.now()+timeout;
 while(!predicate()){if(performance.now()>end)throw Error('Timed out: '+label);await delay(10);}
}

test('pinned framework: shared-world fixed input, prediction/adopt, ack and read-only bounded rewind', {timeout:15000}, async t=>{
 let authority;
 class SpikeRoom extends Room {
  async onCreate(){
   authority=this;Object.assign(this,await fixture());this.maxClients=1;
   this.state=new State({actor:new ActorState()});copyPose(this.state.actor,this.actor);
   this.inputs=this.defineInput(Input,{seqField:'sequence',bufferMaxSize:8});
   this.patchRate=50;
   this.rewind=this.allowRewindState({maxRewindMs:150});
   this.rewind.attach(this.state.actor,{fields:['x','y','z']});
   this.consumed=[];this.invalid=0;
   this.setFixedTimestep(ctx=>{
    assert.equal(ctx.dt,1/60);
    const frames=new Map();
    for(const client of this.clients){
     const f=this.holdInputs ? undefined : this.inputs.get(client.sessionId).next(); // one shared-world step, never drain a backlog
     if(f){frames.set(client.sessionId,wireFrame(f));this.consumed.push(f.sequence);}
    }
    try{this.sim.tick(frames);}catch(error){
     // Strict domain validation rejects this frame; neutral input still advances time.
     if(!/Invalid input axis/.test(error.message))throw error;
     this.invalid++;this.sim.tick();
    }
    if(this.correctOn && this.consumed.at(-1)===this.correctOn){this.actor.x+=.1;this.correctOn=null;this.holdInputs=true;}
    copyPose(this.state.actor,this.actor);this.state.tick=this.sim.tickNumber;this.state.time=this.sim.game.state.time;
   },60);
  }
  onJoin(client){this.sim.controllers.bind(client.sessionId,this.actor.id);}
  onLeave(client){this.sim.controllers.unbind(client.sessionId);}
 }
 const httpServer=http.createServer();
 const server=new Server({transport:new WebSocketTransport({server:httpServer}),greet:false,gracefullyShutdown:false});
 server.define('foundation-api-spike',SpikeRoom);
 await server.listen(0,'127.0.0.1');
 t.after(async()=>{await server.gracefullyShutdown(false);});
 assert.equal(httpServer.address().address,'127.0.0.1');
 const client=new Client(`http://127.0.0.1:${httpServer.address().port}`);
 const room=await client.create('foundation-api-spike');
 t.after(()=>room.leave());
 await until(()=>room.state?.actor?.x===2,'initial schema state');
 const input=room.input({type:Input,mode:'reliable'});
 assert(Math.abs(input.stepSeconds-1/60)<1e-12,'server fixed dt arrives in input handshake');
 const local=await fixture(),predict=Predict.get(room,{mode:'lerp',delay:100});let adopts=0,replays=0;
 const prediction=predict.sim({
  input,world:local,smoothMs:0,
  adopt:w=>{adopts++;copyPose(w.actor,room.state.actor);w.sim.game.state.time=room.state.time;},
  step:(ctx,w,f)=>{if(ctx.isReplay)replays++;w.sim.game.state.time+=ctx.dt;moveActor(w.sim.game,w.actor,wireFrame(f),ctx.dt,false);},
  pose:w=>({x:w.actor.x,y:w.actor.y,z:w.actor.z}),
 });
 t.after(()=>predict.dispose());
 const before=authority.actor.x,startTick=authority.sim.tickNumber;
 predict.tick(performance.now());
 for(let sequence=1;sequence<=4;sequence++){
  input.data.sequence=sequence;input.data.strafe=.5;input.send();
 }
 assert(prediction.world.actor.x>before,'prediction moves immediately, before any awaited network response');
 assert.equal(authority.actor.x,before,'server has not received those packets synchronously');
 await until(()=>authority.consumed.length===4,'four inputs consumed');
 assert.deepEqual(authority.consumed,[1,2,3,4]);
 assert(authority.sim.tickNumber>=startTick+4,'one queued input per fixed tick');
 await until(()=>input.lastProcessed>=4,'schema patch acknowledgement');
 predict.tick(performance.now());
 assert(Math.abs(prediction.world.actor.x-authority.actor.x)<1e-9,'authoritative adopt agrees with shared capsule movement');
 const previousAdopts=adopts;authority.actor.x+=.1;
 input.data.sequence=5;input.send();await until(()=>input.lastProcessed>=5,'ack after authority correction');
 predict.tick(performance.now());
 assert(adopts>previousAdopts,'engine-backed adapter restores a divergent authoritative pose');
 assert(Math.abs(prediction.world.actor.x-authority.actor.x)<1e-9);
 assert.equal(authority.sim.game.accumulator,0);
 assert(Math.abs(authority.state.time-authority.sim.tickNumber/60)<1e-10);
 // Hold consumption after the first frame of a burst, so rollback MUST replay
 // two unacknowledged frames rather than relying on network scheduling luck.
 authority.correctOn=6;
 for(let sequence=6;sequence<=8;sequence++){input.data.sequence=sequence;input.send();}
 await until(()=>input.lastProcessed===6,'partial burst acknowledgement');
 predict.tick(performance.now());assert(replays>=2,'SDK owns replay of pending frames');
 authority.holdInputs=false;
 await until(()=>input.lastProcessed>=8,'remaining burst acknowledgement');predict.tick(performance.now());
 assert(Math.abs(prediction.world.actor.x-authority.actor.x)<1e-9);
 const live=authority.state.actor.x,seen=authority.rewind.at(-1e9);
 assert(Number.isFinite(seen.value(authority.state.actor,'x')));assert.equal(authority.state.actor.x,live,'rewind never mutates live state');
 assert(seen.time>=authority.clock.elapsedTime-220,'history clamps to bounded window/patch cadence');
 input.data.sequence=8;input.send();await delay(80);assert.equal(authority.consumed.length,8,'declared sequence rejects duplicate');
 input.data.sequence=9;input.data.strafe=NaN;input.send();await until(()=>authority.invalid===1,'strict malformed frame rejection');
 assert.equal(authority.actor.x,live);assert(Number.isFinite(authority.actor.x));
 assert.equal(authority.sim.controllers.collect().size,0,'empty input has no held-action cache');
 console.log(JSON.stringify({spike:'PASS',node:process.version,platform:process.platform,arch:process.arch,core:'0.18.28',sdk:'0.18.10',schema:'5.0.49',fixedStep:1/60,patchMs:50,consumed:authority.consumed,adopts,replays,ticks:authority.sim.tickNumber}));
 await room.leave();
});
