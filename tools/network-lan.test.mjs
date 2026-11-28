import test from 'node:test';
import assert from 'node:assert/strict';
import {createHash,randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {sha256,sha256Fallback} from '../shared/sha256.mjs';
import {networkEndpoint,connectionMessage,connectionFailure} from '../src/fps/network/connection.mjs';
import {hostingConfig,configFromEnv,admissionLimiter,accessPolicy} from '../server/access.mjs';
import {AudioSystem} from '../src/fps/audio.mjs';

test('LAN HTTP fingerprint fallback matches Node SHA-256 across padding boundaries, Unicode and the exact Floor 5',async()=>{
  for(const size of [0,1,55,56,63,64,65,127,128,4096]){const bytes=randomBytes(size);assert.equal(sha256Fallback(bytes),createHash('sha256').update(bytes).digest('hex'));}
  for(const text of ['Åäö 🎮','a'.repeat(1000000),await readFile(new URL('../levels/floor5-prepared.json',import.meta.url),'utf8')]){
    const expected=createHash('sha256').update(text).digest('hex');assert.equal(sha256Fallback(new TextEncoder().encode(text)),expected);assert.equal(await sha256(text),expected);assert.equal(await sha256(new TextEncoder().encode(text)),expected);
  }
});
test('LAN is explicit and limited to a concrete private IPv4 address',()=>{
  assert.deepEqual(hostingConfig(),{lan:false,host:'127.0.0.1',port:2567});
  for(const host of ['0.0.0.0','::','::1','8.8.8.8','100.64.0.1','169.254.1.2','172.32.0.1','localhost','192.168.1.999'])assert.throws(()=>hostingConfig({lan:true,host}));
  assert.throws(()=>hostingConfig({lan:true}));assert.throws(()=>hostingConfig({host:'192.168.1.5'}));
  assert.throws(()=>configFromEnv({CS2_LAN:'true'}));assert.throws(()=>configFromEnv({PORT:'oops'}));assert.throws(()=>configFromEnv({PORT:''}));assert.throws(()=>configFromEnv({PORT:'0'}));
  for(const host of ['10.1.2.3','172.16.1.2','172.31.255.2','192.168.1.5'])assert.equal(hostingConfig({lan:true,host}).host,host);
});
test('exact host/origin checks reject rebinding, null, missing origins, public peers and forwarding',()=>{
  const p=accessPolicy(hostingConfig({lan:true,host:'192.168.1.5'}),2567);
  const request={remoteAddress:'192.168.1.7',headers:{host:'192.168.1.5:2567',origin:'http://192.168.1.5:2567'}};
  assert.equal(p.check(request,true),null);
  for(const headers of [{origin:'null'},{origin:undefined},{origin:'http://evil.example'},{host:'evil.example:2567',origin:'http://evil.example:2567'},{'x-forwarded-for':'127.0.0.1'},{'sec-fetch-site':'cross-site'}])assert.equal(p.check({...request,headers:{...request.headers,...headers}},true)[0],403);
  assert.equal(p.check({...request,remoteAddress:'8.8.8.8'},true)[0],403);
  assert.equal(p.check({...request,headers:{host:request.headers.host}},false),null,'normal page navigation is allowed');
});
test('admission budgets refill and release inactive peer records',()=>{
  let time=0;const p=admissionLimiter({now:()=>time});
  for(let i=0;i<30;i++)assert(p.allow('a'));assert(!p.allow('a'));time+=1000;assert(p.allow('a'));assert(!p.allow('a'));
  time+=61000;assert(p.allow('b'));assert(!p.peers.has('a'));
});
test('client requires the same origin on any LAN port and translates connection failures',()=>{
  const origin='http://192.168.1.2:2789';assert.equal(networkEndpoint(origin,origin),origin);
  for(const endpoint of ['http://127.0.0.1:2567',origin+'/fps/',origin+'?code=secret','https://example.com','ws://192.168.1.2:2789','http://x:y@192.168.1.2:2789'])assert.throws(()=>networkEndpoint(endpoint,origin));
  for(const [message,text] of [['Incorrect private room code.','Incorrect private room code'],['room is locked','room is full'],['room not found','Room not found'],['Incompatible buildHash','versions differ'],['Failed to fetch','Cannot reach']])assert(connectionMessage({message}).includes(text));
});
test('pilot sign-in and room proof have distinct recoveries regardless of locale',()=>{
  const family=connectionFailure({code:403,message:'Incorrect family room password.'});
  assert.equal(family.id,'wrongFamilyPassword');
  assert.equal(family.recovery,'retry');
  const pilot=connectionFailure({code:401,message:'Unauthorized'});
  assert.equal(pilot.recovery,'signIn');
  assert.equal(pilot.id,'pilotExpired');
  const unknown=connectionFailure({message:'private internal diagnostic'});
  assert.equal(unknown.id,'failed');
  assert(!unknown.message.includes('diagnostic'));
});

test('audio resumes from Safari interruption inside the existing gesture path',async()=>{
  for(const state of ['suspended','interrupted']){
    let calls=0;const audio={initializeContext:()=>true,context:{state,async resume(){calls++;this.state='running';}},loadPromise:Promise.resolve()};
    assert(await AudioSystem.prototype.unlock.call(audio));assert.equal(calls,1);
  }
  const denied={initializeContext:()=>true,context:{state:'interrupted',async resume(){throw Error('gesture denied');}}};
  assert.equal(await AudioSystem.prototype.unlock.call(denied),false);
});
