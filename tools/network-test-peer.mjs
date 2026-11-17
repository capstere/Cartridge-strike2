// A real protocol peer for one-renderer CI hosts. It joins over HTTP/WS, receives
// authoritative snapshots and never substitutes browser/server state or rendering.
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
const {Client}=createRequire(new URL('../server/package.json',import.meta.url))('@colyseus/sdk');

export async function createTestPeer(url,roomId){
  const client=new Client(url,{headers:{Origin:url}}),options={name:'Protocol peer',code:'private-123',contract:CONTRACT};
  const room=await (roomId?client.joinById(roomId,options):client.create('private-fps',options));
  let closed=false;const errors=[];
  room.reconnection.enabled=false;
  room.onLeave(()=>{closed=true;});room.onError((code,message)=>errors.push({code,message}));
  room.onMessage('events',()=>{});room.onMessage('problem',message=>errors.push({message}));
  room.send('ready',CONTRACT);
  try{
    const end=performance.now()+10000;
    while(![...(room.state.actors?.values()||[])].some(a=>a.sessionId===room.sessionId&&a.ready&&a.alive)){
      assert(performance.now()<end,'protocol peer becomes ready on the real authority');
      assert(!closed,'protocol peer stays connected');await new Promise(resolve=>setTimeout(resolve,25));
    }
    return {room,errors,get closed(){return closed;},close:async()=>{if(!closed)await room.leave();}};
  }catch(error){await room.leave();throw error;}
}
