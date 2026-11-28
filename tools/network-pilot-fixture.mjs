// A loopback-only TLS terminator for the browser integration test. Chromium trusts
// only this run's ephemeral certificate, while the game sees the public Host.
import {execFileSync} from 'node:child_process';
import {createHash,randomBytes,X509Certificate} from 'node:crypto';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import '../server/register-shared.mjs';
import {configFromEnv} from '../server/access.mjs';
const {createLocalServer}=await import('../server/local-server.mjs');

export async function startPilotFixture({testMatch, familyRoom=false, publicListing=false, host='pilot.example.test', startAuthority=createLocalServer}={}){
  const dir=await mkdtemp(join(tmpdir(),'cs2-pilot-tls-'));
  const certPath=join(dir,'cert.pem'),keyPath=join(dir,'key.pem');
  let edge,authority;
  const sockets=new Set(),tunnels=new Set();
  // Own the keep-alive pool. An accepted upgrade leaves the HTTP agent and
  // remains a fixture-owned tunnel until both peers close.
  const upstreamAgent=new http.Agent({keepAlive:true});
  async function stopAuthority(){
    const current=authority;
    authority=undefined;
    upstreamAgent.destroy();
    for(const socket of tunnels)socket.destroy();
    await current?.close();
  }
  async function close(){
    const stopped=edge?.listening ? new Promise(resolve=>edge.close(resolve)) : Promise.resolve();
    for(const socket of sockets)socket.destroy();
    try{await Promise.all([stopped,stopAuthority()]);}finally{await rm(dir,{recursive:true,force:true});}
  }
  try{
    execFileSync('openssl',['req','-x509','-newkey','rsa:2048','-nodes','-days','1',
      '-subj','/CN='+host,'-addext','subjectAltName='+(host==='127.0.0.1'?'IP:':'DNS:')+host,'-keyout',keyPath,'-out',certPath],{stdio:'ignore'});
    const cert=await readFile(certPath);
    const publicKey=new X509Certificate(cert).publicKey.export({type:'spki',format:'der'});
    const pin=createHash('sha256').update(publicKey).digest('base64');
    edge=https.createServer({key:await readFile(keyPath),cert});
    function forward(req){
      return http.request(authority.url+req.url,{agent:upstreamAgent,method:req.method,
        headers:{...req.headers,'x-forwarded-proto':'https','cf-connecting-ip':'127.0.0.1'}});
    }
    edge.on('request',(req,res)=>{
      if(!authority){res.writeHead(503);res.end();return;}
      const up=forward(req);
      res.once('close',()=>{if(!res.writableFinished)up.destroy();});
      up.on('response',reply=>{
        reply.on('error',()=>res.destroy());
        res.writeHead(reply.statusCode,reply.headers);reply.pipe(res);
      });
      up.on('error',()=>res.destroy());req.pipe(up);
    });
    edge.on('connection',socket=>{sockets.add(socket);socket.once('close',()=>sockets.delete(socket));});
    edge.on('upgrade',(req,client,head)=>{
      if(!authority){client.destroy();return;}
      const up=forward(req);
      // A reconnect can abandon the downstream socket before the authority
      // accepts its upgrade. Attach cancellation before forwarding the request.
      const cancel=()=>{up.destroy();client.destroy();};
      client.once('close',cancel);
      client.once('end',cancel);
      client.on('error',cancel);
      up.on('upgrade',(reply,server,upHead)=>{
        if(client.destroyed){server.destroy();return;}
        // Once bridged, pipe forwards a normal half-close to the other peer.
        client.off('end',cancel);
        tunnels.add(server);
        server.once('close',()=>{tunnels.delete(server);client.destroy();});
        client.once('close',()=>server.destroy());
        server.on('error',()=>client.destroy());
        client.write('HTTP/1.1 101 Switching Protocols\r\n');
        for(let i=0;i<reply.rawHeaders.length;i+=2)client.write(reply.rawHeaders[i]+': '+reply.rawHeaders[i+1]+'\r\n');
        client.write('\r\n');if(head.length)server.write(head);if(upHead.length)client.write(upHead);
        client.pipe(server).pipe(client);
      });
      up.on('response',reply=>{reply.resume();client.end('HTTP/1.1 '+reply.statusCode+' Rejected\r\nConnection: close\r\n\r\n');});
      up.on('error',()=>client.destroy());up.end();
    });
    await new Promise((resolve,reject)=>{edge.once('error',reject);edge.listen(0,'127.0.0.1',resolve);});
    const origin='https://'+host+':'+edge.address().port;
    const invite=randomBytes(32).toString('base64url');
    const familyPassword=familyRoom?randomBytes(24).toString('base64url'):undefined;
    const familyStateFile=familyRoom?join(dir,'family-settings.json'):undefined;
    const config=configFromEnv({CS2_PUBLIC_ORIGIN:origin,CS2_PILOT_INVITE:invite,CS2_FAMILY_ROOM_PASSWORD:familyPassword,CS2_FAMILY_ROOM_STATE:familyStateFile,CS3_PUBLIC_LISTING:publicListing?'1':'0'});
    const start=()=>startAuthority({...config,port:0,testMatch});
    authority=await start();
    return {origin,invite,familyPassword,close,get authority(){return authority;},
      async restart(){await stopAuthority();authority=await start();},
      args:['--host-resolver-rules=MAP '+host+' 127.0.0.1','--no-proxy-server','--ignore-certificate-errors-spki-list='+pin]};
  }catch(error){await close();throw error;}
}
