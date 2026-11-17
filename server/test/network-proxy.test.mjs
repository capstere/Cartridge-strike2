import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket,WebSocketServer} from 'ws';
import {latencyProxy} from '../../tools/network-proxy.mjs';
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));

test('jitter proxy retains all 600 WebSocket messages in both directions',{timeout:20000},async()=>{
 const host=http.createServer(),wss=new WebSocketServer({server:host}),received=[],echoed=[];
 wss.on('connection',socket=>socket.on('message',bytes=>{received.push(bytes.readUInt32LE());socket.send(bytes);}));
 await new Promise(resolve=>host.listen(0,'127.0.0.1',resolve));
 const proxy=await latencyProxy(`http://127.0.0.1:${host.address().port}`),socket=new WebSocket(proxy.url.replace('http:','ws:'));
 try{
  await new Promise((resolve,reject)=>{socket.once('open',resolve);socket.once('error',reject);});
  socket.on('message',bytes=>echoed.push(bytes.readUInt32LE()));
  for(let sequence=1;sequence<=600;sequence++){
   const bytes=Buffer.alloc(32);bytes.writeUInt32LE(sequence);socket.send(bytes);await delay(1000/60);
  }
  const until=performance.now()+2000;
  while(echoed.length<600&&performance.now()<until)await delay(10);
  const expected=Array.from({length:600},(_,i)=>i+1);
  assert.deepEqual(received,expected,'upstream preserves reliable wire order');
  assert.deepEqual(echoed,expected,'downstream preserves reliable wire order');
  assert.equal(proxy.metrics.messages,1200);
  assert.equal(proxy.metrics.deliveredDelays.length,1200);
 }finally{
  socket.terminate();await proxy.close();
  await new Promise(resolve=>wss.close(resolve));await new Promise(resolve=>host.close(resolve));
 }
});
