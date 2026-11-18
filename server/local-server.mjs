import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {Server,ServerError} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {NetworkRoom} from './network-room.mjs';
import {ROOM_TYPE} from '../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {hostingConfig,configFromEnv,accessPolicy,admissionLimiter,readAdmission,rejectHttp} from './access.mjs';
import {pilotAccess,localMonitor,redirectLobby,showInvite} from './pilot-access.mjs';

const admissionRoute = /^\/matchmake\/(?:create\/private-fps|joinById\/([A-Za-z0-9_-]{1,32}))$/;
const roomSocket = /^\/[\w-]{1,64}\/[\w-]{1,32}\?[^#\s]{1,512}$/;
const readMethod = method => method === 'GET' || method === 'HEAD';

// The pilot only listens on loopback behind an explicitly configured HTTPS origin.
export async function createLocalServer(options={}) {
  const config=hostingConfig(options),{host,port,lan}=config;
  const pilot=config.pilotInvite ? pilotAccess(config, admissionLimiter()) : null;
  const active=new Set(),root=fileURLToPath(new URL('../',import.meta.url));
  const manifest=JSON.parse(await readFile(new URL('../build-info.json',import.meta.url)));
  const publicFiles=new Set(manifest.files.map(f=>'/'+f.path));

  class LocalRoom extends NetworkRoom {
    async onCreate(options){
      if(active.size>=2)throw new ServerError(429,'Local server room limit reached.');
      active.add(this);
      try{await super.onCreate(options);}catch(e){active.delete(this);throw e;}
    }
    onDispose(){super.onDispose();active.delete(this);}
  }
  const httpServer=http.createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:16384});
  httpServer.maxConnections=128;
  let policy;
  const transport=new WebSocketTransport({server:httpServer,maxPayload:4096});
  const server=new Server({greet:false,gracefullyShutdown:false,transport,
    express:async app=>{
      app.get('/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',localOnly:!lan&&!pilot,lan,pilot:!!pilot,host,
        rooms:active.size,players:[...active].reduce((n,r)=>n+r.clients.length,0),contract:CONTRACT}));
      app.use(express.static(root,{dotfiles:'deny',index:'index.html'}));
    },
  });
  server.define(ROOM_TYPE,LocalRoom);
  await server.serverless();

  async function inspect(req, sensitive) {
    if(pilot)return pilot.inspect(req,sensitive);
    return {denied:policy.check({headers:req.headers,remoteAddress:req.socket.remoteAddress},sensitive)};
  }

  // Check the actual socket before handing the request to Colyseus. Its
  // AuthContext.ip may be derived from X-Forwarded-For or X-Real-IP.
  const upgrades=httpServer.listeners('upgrade');httpServer.removeAllListeners('upgrade');
  httpServer.on('upgrade',async(req,socket,head)=>{
    const onError=()=>socket.destroy();socket.once('error',onError);
    try{
      const access=await inspect(req,true);
      const status=access.denied?.[0] || (pilot&&!access.authenticated?401:0) ||
        (pilot&&(!roomSocket.test(req.url)||!new URLSearchParams(req.url.split('?')[1]).has('sessionId'))?404:0) ||
        (transport.wss.clients.size>=32?429:0);
      if(socket.destroyed)return;
      if(status){
        socket.end('HTTP/1.1 '+status+' '+http.STATUS_CODES[status]+'\r\nConnection: close\r\nCache-Control: no-store\r\nContent-Length: 0\r\n\r\n');
        return;
      }
      socket.off('error',onError);
      for(const upgrade of upgrades)upgrade.call(httpServer,req,socket,head);
    }catch{socket.destroy();}
  });

  const handlers=httpServer.listeners('request');httpServer.removeAllListeners('request');
  httpServer.on('request',async(req,res)=>{
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    if(pilot)res.setHeader('Cache-Control','private, no-store');
    try{
      const path=req.url.split('?')[0];
      const admission=path.startsWith('/matchmake/');
      const localHealth=pilot&&localMonitor(req,httpServer.address().port);
      if(!localHealth){
        const access=await inspect(req,admission||!readMethod(req.method));
        if(access.denied)return rejectHttp(res,...access.denied);
        if(pilot){
          if(req.method==='POST'&&req.url==='/pilot/session'){
            const denied=await pilot.login(req,res,access.origin);
            if(denied)rejectHttp(res,...denied);
            return;
          }
          const entry=path==='/'||path==='/fps/'||path==='/fps/index.html';
          if(!access.authenticated){
            if(entry&&readMethod(req.method))return showInvite(res);
            return rejectHttp(res,401,'Pilot invite required.');
          }
          if(path==='/'&&readMethod(req.method))return redirectLobby(res);
          if(path==='/health')return rejectHttp(res,404,'Unknown route.');
        }
      }
      if(admission){
        const route=admissionRoute.exec(req.url);
        if(req.method!=='POST'||!route)return rejectHttp(res,404,'Unknown matchmaking route.');
        req.body=await readAdmission(req);
        // Colyseus normally checks the room code after reserving a seat, at WS
        // JOIN. Check it here too to avoid spending seats on invalid invites.
        if(route[1]){
          const room=[...active].find(r=>r.roomId===route[1]);
          if(room&&!room.acceptsCode(req.body.code))return rejectHttp(res,403,'Incorrect private room code.');
        }
      }else{
        if(!readMethod(req.method))return rejectHttp(res,405,'Method not allowed.');
        if(req.headers['transfer-encoding']||Number(req.headers['content-length'])>0)return rejectHttp(res,400,'Unexpected request body.');
        const file=path.endsWith('/')?path+'index.html':path;
        if(path!=='/health'&&!publicFiles.has(file))return rejectHttp(res,404,'Unknown route.');
      }
      for(const handler of handlers)handler.call(httpServer,req,res);
    }catch(e){
      if(!res.destroyed&&!res.headersSent)rejectHttp(res,e.status||400,e.status?e.message:'Invalid request.');
    }
  });
  await new Promise((resolve,reject)=>{
    httpServer.once('error',reject);
    httpServer.listen(port,host,()=>{policy=accessPolicy(config,httpServer.address().port);httpServer.off('error',reject);resolve();});
  });
  return {server,httpServer,transport,rooms:active,config,url:`http://${host}:${httpServer.address().port}`,
    close:async()=>{await server.gracefullyShutdown(false);httpServer.closeIdleConnections();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const local=await createLocalServer(configFromEnv(process.env));
  const mode=local.config.pilotInvite?'Invite-only HTTPS pilot':local.config.lan?'Trusted LAN':'Localhost only';
  console.log(`${mode} · up to 10 players (5v5), listening at ${local.url}`);
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await local.close();});
}
