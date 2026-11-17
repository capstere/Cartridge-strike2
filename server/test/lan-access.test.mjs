import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import {WebSocket} from 'ws';
import {Client} from '@colyseus/sdk';
import {createLocalServer} from '../local-server.mjs';
import {CONTRACT} from '../../shared/multiplayer/build.mjs';

const options={code:'private-123',name:'Player',contract:CONTRACT};
function request(url,{headers={},body,method=body?'POST':'GET',chunks}={}) {
  return new Promise((resolve,reject)=>{
    const r=http.request(url,{method,headers},res=>{let text='';res.on('data',b=>text+=b);res.on('end',()=>resolve({status:res.statusCode,headers:res.headers,text}));});
    r.on('error',reject);if(chunks){for(const chunk of chunks)r.write(chunk);r.end();}else r.end(body);
  });
}
function upgrade(url,headers={}) {
  return new Promise((resolve,reject)=>{
    const socket=new WebSocket(url.replace('http:','ws:')+'/probe',{headers});
    socket.once('open',()=>{socket.close();reject(Error('unapproved upgrade succeeded'));});
    socket.once('unexpected-response',(_req,res)=>{res.resume();socket.terminate();resolve(res.statusCode);});
    socket.on('error',()=>{});
  });
}
test('HTTP and WebSocket admission enforce origin independently before room creation',{timeout:15000},async t=>{
  const local=await createLocalServer({port:0});t.after(()=>local.close());
  assert.equal(local.httpServer.address().address,'127.0.0.1');
  const url=local.url+'/matchmake/create/private-fps',headers={'Content-Type':'application/json',Origin:local.url};
  for(const origin of [undefined,'null','http://evil.example','http://localhost:1']){
    const h={...headers};if(origin===undefined)delete h.Origin;else h.Origin=origin;
    const r=await request(url,{headers:h,body:JSON.stringify(options)});assert.equal(r.status,403);assert(!r.headers['access-control-allow-origin']);
    assert.equal(await upgrade(local.url,origin===undefined?{}:{Origin:origin}),403);
  }
  assert.equal((await request(local.url+'/health',{headers:{Host:'rebind.example'}})).status,403);
  assert.equal((await request(url,{method:'OPTIONS',headers:{Origin:'http://evil.example'}})).status,403);
  assert.equal((await request(url,{headers,body:'{bad json'})).status,400);
  assert.equal((await request(url,{headers,body:JSON.stringify({...options,position:{x:1}})})).status,400);
  assert.equal((await request(url,{headers:{...headers,'Content-Length':5000},body:'x'.repeat(5000)})).status,413);
  assert.equal((await request(url,{method:'POST',headers,chunks:['x'.repeat(3000),'x'.repeat(2000)]})).status,413,'chunked bodies are bounded too');
  assert.equal(local.rooms.size,0);
  for(const path of ['/server/package.json','/server/access.mjs','/.git/config','/HANDOVER.md'])assert.equal((await fetch(local.url+path)).status,404);
  const c=new Client(local.url,{headers:{Origin:local.url}}),a=await c.create('private-fps',options);
  assert.equal(local.rooms.size,1);await a.leave();
  assert.equal((await fetch(local.url+'/health')).status,200);
});
test('failed admission attempts are rate limited without allocating rooms',{timeout:10000},async t=>{
  const local=await createLocalServer({port:0});t.after(()=>local.close());
  const responses=[];for(let i=0;i<40;i++)responses.push(await request(local.url+'/matchmake/joinById/missing',{headers:{Origin:local.url,'Content-Type':'application/json'},body:JSON.stringify(options)}));
  assert(responses.some(r=>r.status===429));assert.equal(local.rooms.size,0);
  assert.equal((await fetch(local.url+'/health')).status,200,'health/assets use no admission budget');
});
