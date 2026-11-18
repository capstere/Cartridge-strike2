import assert from 'node:assert/strict';
import {setTimeout as delay} from 'node:timers/promises';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';
export {delay};
export const options={fillBots:false,code:'pass3b-123',name:'Player',contract:CONTRACT};
export async function until(fn,label,timeout=5000){const end=performance.now()+timeout;while(!fn()){assert(performance.now()<end,label);await delay(10);}}
export const own=room=>[...(room.state.actors?.values()||[])].find(a=>a.sessionId===room.sessionId);
export async function ready(room){
 room.reconnection.enabled=false;room.onMessage('events',()=>{});room.onMessage('problem',()=>{});
 room.onMessage('clock-probe',token=>room.send('clock-echo',token));room.send('ready',CONTRACT);
 await until(()=>own(room)?.ready,'ready');return room;
}
export function send(room,overrides={}){
 const a=own(room),input=room.input({mode:'reliable',renderDelay:100});
 Object.assign(input.data,{lifeId:a.lifeId,controlEpoch:a.controlEpoch,sampleTick:room.state.tick,fireId:0,reloadId:0,
 forward:0,strafe:0,yaw:0,pitch:0,jump:false,crouch:false,sneak:false,fire:false,...overrides});input.send();return input;
}
