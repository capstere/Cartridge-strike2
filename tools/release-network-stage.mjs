// Stage only allowlisted exports. Temporary keys, test accounts and connector files
// stay in an owner-only directory and the server binds an OS-selected loopback port.
import assert from 'node:assert/strict';
import {execFileSync, spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes, createHash, X509Certificate} from 'node:crypto';
import {readFile, writeFile} from 'node:fs/promises';
import https from 'node:https';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
import {startPilotFixture} from './network-pilot-fixture.mjs';

export async function authority(root, options) {
  // The import hook and every runtime import resolve inside the selected release.
  const program = `import {createLocalServer} from './server/local-server.mjs';
    let authority,stopping=false;
    process.on('message', async options => {
      if (options === 'close') { stopping=true; await authority.close(); return process.disconnect(); }
      if (options?.dropGuest) {
        const matches = [...authority.rooms].flatMap(room => room.clients.filter(c =>
          [...room.state.actors.values()].some(a=>a.sessionId===c.sessionId && a.name===options.dropGuest)));
        if (matches.length===1) matches[0].ref.terminate();
        return process.send(matches.length);
      }
      authority = await createLocalServer(options);
      process.send(authority.url);
    });
    process.on('disconnect',()=>{if(!stopping)authority?.close().catch(()=>{});});`;
  const child = spawn(process.execPath,['--import','./server/register-shared.mjs','--input-type=module','--eval',program],
    {cwd:root,stdio:['ignore','ignore','ignore','ipc']});
  const terminate=()=>child.kill();process.once('exit',terminate);
  const ended = once(child,'exit').finally(()=>process.off('exit',terminate));
  const ready = once(child,'message');
  child.send(options);
  async function close() {
    if (child.connected) child.send('close');
    const timer=setTimeout(()=>child.kill('SIGKILL'),5000);
    try {await ended;} finally {clearTimeout(timer);}
  }
  try {
    const url=await Promise.race([ready.then(([value])=>value),ended.then(()=>{throw Error('Staged authority exited');}),
      delay(15000,null,{ref:false}).then(()=>{throw Error('Staged authority startup timed out');})]);
    return {url,close,async dropGuest(name){
      const dropped=once(child,'message'); child.send({dropGuest:name});
      assert.equal((await dropped)[0],1,'exactly the designated staging client was disconnected');
    }};
  } catch(error) {await close();throw error;}
}

export async function pilot(root, directory, internet) {
  if (!internet) return startPilotFixture({familyRoom:true,host:'127.0.0.1',startAuthority:options=>authority(root,options)});
  const publicOriginFile=join(directory,'origin'),invite=randomBytes(32).toString('base64url');
  const familyPassword=randomBytes(24).toString('base64url');
  const app=await authority(root,{host:'127.0.0.1',port:0,publicOriginFile,pilotInvite:invite,
    familyPassword,familyStateFile:join(directory,'family.json'),accountDb:join(directory,'accounts.sqlite')});
  const cloud=spawn(process.env.CLOUDFLARED||'cloudflared',['tunnel','--no-autoupdate','--metrics','127.0.0.1:0','--grace-period','3s','--protocol','http2','--url',app.url],
    {cwd:directory,stdio:['ignore','ignore','pipe']});
  const terminate=()=>cloud.kill();process.once('exit',terminate);
  let launchFailure;
  const stopped=new Promise(resolve=>{
    cloud.once('exit',resolve);
    cloud.once('error',error=>{launchFailure=error.code||error.name;resolve();});
  }).finally(()=>process.off('exit',terminate));
  let origin,detail='waiting for a quick tunnel address';
  cloud.stderr.on('data',buf=>{
    const msg=buf.toString();
    origin ??= msg.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com\b/i)?.[0];
    if (/429|rate limit/i.test(msg)) detail='provider rate limit';
    else if (/timeout|deadline exceeded/i.test(msg)) detail='provider connection timeout';
    else if (/failed to request|error requesting|error unmarshaling/i.test(msg)) detail='quick tunnel provisioning failed';
  });
  async function close(){cloud.kill();try{await stopped;}finally{await app.close();}}
  try {
    const deadline=Date.now()+180000;
    while(!origin && !launchFailure && cloud.exitCode===null && Date.now()<deadline) await delay(250);
    assert(origin,'External staging unavailable: '+(launchFailure||detail));
    await writeFile(publicOriginFile,origin,{mode:0o600});
    while(Date.now()<deadline){
      try {const page=await fetch(origin+'/room/JESPERS-ROOM',{signal:AbortSignal.timeout(4000)});
        if (page.ok && (await page.text()).includes('name="invite"')) return {origin,invite,familyPassword,authority:app,close,args:[]};
        detail='provider HTTP '+page.status;
      } catch(error) {detail=error.cause?.code || error.name;}
      await delay(1000);
    }
    throw Error('External staging unavailable: '+detail);
  } catch(error) {await close();throw error;}
}

export async function publicSite(root, pilotRoot, directory) {
  const key=join(directory,'public-key.pem'),cert=join(directory,'public-cert.pem');
  execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1','-subj','/CN=127.0.0.1',
    '-addext','subjectAltName=IP:127.0.0.1','-keyout',key,'-out',cert],{stdio:'ignore'});
  const pem=await readFile(cert);
  const pin=createHash('sha256').update(new X509Certificate(pem).publicKey.export({type:'spki',format:'der'})).digest('base64');
  const express=createRequire(join(pilotRoot,'server/package.json'))('express');
  const app=express();app.use('/Cartridge-strike2',express.static(root,{maxAge:'10m',dotfiles:'deny'}));
  const edge=https.createServer({key:await readFile(key),cert:pem},app);
  await new Promise((resolve,reject)=>{edge.once('error',reject);edge.listen(0,'127.0.0.1',resolve);});
  return {url:'https://127.0.0.1:'+edge.address().port+'/Cartridge-strike2/',pin,
    close:()=>new Promise(resolve=>{edge.close(resolve);edge.closeAllConnections();})};
}
