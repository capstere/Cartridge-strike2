import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {Server,ServerError} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {NetworkRoom} from './network-room.mjs';
import {ROOM_TYPE} from '../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {hostingConfig,configFromEnv,accessPolicy,readAdmission,rejectHttp} from './access.mjs';

// One direct HTTP/WS origin. LAN needs an explicit, concrete private address.
export async function createLocalServer(options={}) {
  const config=hostingConfig(options),{host,port,lan}=config;
  const active=new Set(),root=fileURLToPath(new URL('../',import.meta.url));
  class LocalRoom extends NetworkRoom {
    async onCreate(options){
      if(active.size>=2)throw new ServerError(429,'Local server room limit reached.');
      active.add(this);
      try{await super.onCreate(options);}catch(e){active.delete(this);throw e;}
    }
    onDispose(){super.onDispose();active.delete(this);}
  }
  const httpServer=http.createServer({requestTimeout:10000,headersTimeout:10000});
  httpServer.maxConnections=128;
  let policy;
  const transport=new WebSocketTransport({server:httpServer,maxPayload:4096,
    beforeUpgrade:(_path,context)=>{
      const denied=policy.check({headers:context.headers,remoteAddress:context.ip},true);
      if(denied)return new Response(denied[1],{status:denied[0]});
      if(transport.wss.clients.size>=32)return new Response('Connection limit reached.',{status:429});
    }});
  const server=new Server({greet:false,gracefullyShutdown:false,
    transport,
    express:async app=>{
      const manifest=JSON.parse(await readFile(new URL('../build-info.json',import.meta.url)));
      const publicFiles=new Set(manifest.files.map(f=>'/'+f.path));
      app.get('/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',localOnly:!lan,lan,host,
        rooms:active.size,players:[...active].reduce((n,r)=>n+r.clients.length,0),contract:CONTRACT}));
      app.use((req,res,next)=>{
        const path=req.path.endsWith('/')?req.path+'index.html':req.path;
        if(!publicFiles.has(path))return res.sendStatus(404);
        next();
      });
      app.use(express.static(root,{dotfiles:'deny',index:'index.html'}));
    },
  });
  server.define(ROOM_TYPE,LocalRoom);
  // The pinned public serverless API binds routes without listening. Wrap the
  // complete dispatcher before opening a socket (including its OPTIONS path).
  await server.serverless();
  const handlers=httpServer.listeners('request');httpServer.removeAllListeners('request');
  httpServer.on('request',async(req,res)=>{
    const admission=req.url?.startsWith('/matchmake/'),sensitive=admission||!['GET','HEAD'].includes(req.method);
    const denied=policy.check({headers:req.headers,remoteAddress:req.socket.remoteAddress},sensitive);
    if(denied)return rejectHttp(res,...denied);
    res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','same-origin');
    res.setHeader('Cross-Origin-Resource-Policy','same-origin');res.setHeader('X-Frame-Options','DENY');
    if(admission){
      if(req.method!=='POST'||!/^\/matchmake\/(create\/private-fps|joinById\/[A-Za-z0-9_-]{1,32})$/.test(req.url))return rejectHttp(res,404,'Unknown matchmaking route.');
      try{req.body=await readAdmission(req);}catch(e){if(!res.destroyed)rejectHttp(res,e.status||400,e.message);return;}
    }else if(!['GET','HEAD'].includes(req.method))return rejectHttp(res,405,'Method not allowed.');
    for(const handler of handlers)handler.call(httpServer,req,res);
  });
  // Configure the policy before connections can arrive, including ephemeral
  // test ports, in the synchronous listening callback before resolving startup.
  await new Promise((resolve,reject)=>{
    httpServer.once('error',reject);
    httpServer.listen(port,host,()=>{policy=accessPolicy(config,httpServer.address().port);httpServer.off('error',reject);resolve();});
  });
  return {server,httpServer,transport,rooms:active,config,url:`http://${host}:${httpServer.address().port}`,
    close:async()=>{await server.gracefullyShutdown(false);httpServer.closeIdleConnections();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const local=await createLocalServer(configFromEnv(process.env));
  console.log(`${local.config.lan?'Trusted LAN':'Localhost only'} · up to 10 players (5v5): ${local.url}/fps/?network=lan`);
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await local.close();});
}
