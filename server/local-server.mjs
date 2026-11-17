import http from 'node:http';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {Server,ServerError} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {NetworkRoom} from './network-room.mjs';
import {ROOM_TYPE} from '../shared/multiplayer/rules.mjs';

// Development only: deliberately no configurable public bind/tunnel/deployment.
export async function createLocalServer({port=2567}={}) {
  const active=new Set(),root=fileURLToPath(new URL('../',import.meta.url));
  class LocalRoom extends NetworkRoom {
    async onCreate(options){
      if(active.size>=2)throw new ServerError(429,'Local server room limit reached.');
      active.add(this);
      try{await super.onCreate(options);}catch(e){active.delete(this);throw e;}
    }
    onDispose(){super.onDispose();active.delete(this);}
  }
  const httpServer=http.createServer();
  const server=new Server({greet:false,gracefullyShutdown:false,
    transport:new WebSocketTransport({server:httpServer,maxPayload:4096}),
    express:async app=>{
      const manifest=JSON.parse(await readFile(new URL('../build-info.json',import.meta.url)));
      const publicFiles=new Set(manifest.files.map(f=>'/'+f.path));
      app.get('/health',(_req,res)=>res.json({status:'ok',localOnly:true,rooms:active.size}));
      app.use((req,res,next)=>{
        const path=req.path.endsWith('/')?req.path+'index.html':req.path;
        if(!publicFiles.has(path))return res.sendStatus(404);
        next();
      });
      app.use(express.static(root,{dotfiles:'deny',index:'index.html'}));
    },
  });
  server.define(ROOM_TYPE,LocalRoom);
  await server.listen(port,'127.0.0.1');
  return {server,httpServer,rooms:active,url:`http://127.0.0.1:${httpServer.address().port}`,
    close:()=>server.gracefullyShutdown(false)};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const local=await createLocalServer({port:Number(process.env.PORT)||2567});
  console.log(`Local two-player slice: ${local.url}/fps/?network=local`);
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await local.close();});
}
