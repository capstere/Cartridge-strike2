import http from 'node:http';
import {randomBytes,randomUUID} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {readFile} from 'node:fs/promises';
import express from 'express';
import {matchMaker,Server,ServerError} from '@colyseus/core';
import {WebSocketTransport} from '@colyseus/ws-transport';
import {NetworkRoom} from './network-room.mjs';
import {ROOM_TYPE} from '../shared/multiplayer/rules.mjs';
import {CONTRACT} from '../shared/multiplayer/build.mjs';
import {checkContract} from '../shared/multiplayer/protocol.mjs';
import {FAMILY_ROOM_ALIAS,FAMILY_ROOM_PATH} from '../shared/multiplayer/family-room.mjs';
import {hostingConfig,configFromEnv,accessPolicy,admissionLimiter,readAdmission,rejectHttp} from './access.mjs';
import {pilotAccess,localMonitor,redirectLobby,showInvite} from './pilot-access.mjs';
import {openFamilyRoom} from './family-room.mjs';

const admissionRoute = /^\/matchmake\/(?:create\/private-fps|joinById\/([A-Za-z0-9_-]{1,32}))$/;
const familyAdmission = '/matchmake/joinOrCreate/' + FAMILY_ROOM_ALIAS;
const roomSocket = /^\/[\w-]{1,64}\/[\w-]{1,32}\?[^#\s]{1,512}$/;
const readMethod = method => method === 'GET' || method === 'HEAD';

// The pilot only listens on loopback behind an explicitly configured HTTPS origin.
export async function createLocalServer(options={}) {
  const config=hostingConfig(options),{host,port,lan}=config,testMatch=options.testMatch;
  const pilot=config.pilotInvite ? pilotAccess(config, admissionLimiter()) : null;
  const family=openFamilyRoom(config);
  let familyInstance, familyCreation;
  const active=new Set(),root=fileURLToPath(new URL('../',import.meta.url));
  const accounts=config.accountDb?(await import('./account-access.mjs')).accountAccess(config,active):null;
  const manifest=JSON.parse(await readFile(new URL('../build-info.json',import.meta.url)));
  const publicFiles=new Set(manifest.files.map(f=>'/'+f.path));

  class LocalRoom extends NetworkRoom {
    async onCreate(options){
      if(!this.familyRoom && active.size-Number(!!familyInstance)>=2)throw new ServerError(429,'Local server room limit reached.');
      active.add(this);
      if(accounts)this.rememberedProof=randomBytes(32).toString('hex');
      // Trusted in-process fixtures only; never read match overrides from matchmaking.
      this.matchOptions=testMatch;
      try{await super.onCreate(options);}catch(e){active.delete(this);throw e;}
    }
    acceptsCode(code){return !!this.rememberedProof&&code===this.rememberedProof||super.acceptsCode(code);}
    onAuth(client,options){
      if(accounts&&options.credential&&!options.credential.legacy&&!accounts.store.rooms(options.credential.device).includes(this.familyRoom?FAMILY_ROOM_ALIAS:this.roomId)){
        throw new ServerError(403,'Room access has expired.');
      }
      return super.onAuth(client,options);
    }
    onJoin(client,options){
      super.onJoin(client,options);
      if(!accounts||!options.credential)return;
      this.seats.get(client.sessionId).credential=options.credential;
      if(options.credential.legacy)accounts.store.remember(options.credential.device,this.familyRoom?FAMILY_ROOM_ALIAS:this.roomId);
    }
    beginAccountMatch(){
      if(accounts)this.accountMatch={id:randomUUID(),departed:new Map()};
    }
    snapshotAccount(seat){
      const actor=seat?.actor,user=seat?.credential?.user;
      if(!user||!seat.admitted||seat.pending||!actor)return;
      return {user,kills:actor.kills,deaths:actor.deaths,team:actor.team};
    }
    onLeave(client){
      const entry=this.accountMatch&&this.state.phase==='active'&&this.snapshotAccount(this.seats.get(client.sessionId));
      if(entry)this.accountMatch.departed.set(entry.user,entry);
      super.onLeave(client);
    }
    finishAccountMatch(winner){
      if(!this.accountMatch)return;
      const {id,departed}=this.accountMatch;
      const players=new Map(departed);
      // One account can receive at most one result, even with two browser tabs.
      for(const seat of this.seats.values()){
        const entry=this.snapshotAccount(seat);
        if(entry&&!players.has(entry.user))players.set(entry.user,entry);
      }
      const results=[...players.values()].map(entry=>({...entry,win:entry.team===winner}));
      const mode=this.state.mode,map=this.state.mapId;
      const persist=()=>accounts.store.recordMatch(id,mode,map,results);
      try{persist();}catch{
        // The same immutable result can be retried without granting XP twice.
        this.clock.setTimeout(()=>{try{persist();}catch{console.error('Account match result could not be saved.');}},1000);
      }
      this.accountMatch=null;
    }
    onDispose(){
      super.onDispose();active.delete(this);
      if(accounts&&!this.familyRoom)accounts.store.removeScope(this.roomId);
    }
  }
  class LocalFamilyRoom extends LocalRoom {
    async onCreate(options) {
      this.familyRoom=family;
      familyInstance=this;
      try { await super.onCreate(options); }
      catch (error) {
        if(familyInstance===this)familyInstance=undefined;
        throw error;
      }
    }
    onDispose() {
      super.onDispose();
      if(familyInstance===this)familyInstance=undefined;
    }
  }
  const httpServer=http.createServer({requestTimeout:10000,headersTimeout:10000,maxHeaderSize:16384});
  httpServer.maxConnections=128;
  let policy;
  const transport=new WebSocketTransport({server:httpServer,maxPayload:4096});
  const server=new Server({greet:false,gracefullyShutdown:false,transport,
    express:async app=>{
      app.get('/health',(_req,res)=>res.set('Cache-Control','no-store').json({status:'ok',localOnly:!lan&&!pilot,lan,pilot:!!pilot,host,
        matches:[...active].map(r=>({phase:r.state?.phase??'loading',mapId:r.state?.mapId,matchId:r.state?.matchId,tick:r.state?.tick,players:r.clients.length})),rooms:active.size,players:[...active].reduce((n,r)=>n+r.clients.length,0),contract:CONTRACT}));
      app.use(express.static(root,{dotfiles:'deny',index:'index.html'}));
    },
  });
  server.define(ROOM_TYPE,LocalRoom);
  if(family)server.define(FAMILY_ROOM_ALIAS,LocalFamilyRoom);
  await server.serverless();

  // The pinned matchmaker's joinOrCreate opens another room when the first
  // is locked. Keep one creation in flight and explicitly reserve on its ID.
  function getFamilyInstance() {
    if(familyCreation) return familyCreation;
    if(familyInstance) return familyInstance;
    familyCreation=matchMaker.createRoom(FAMILY_ROOM_ALIAS,{contract:CONTRACT}).finally(()=>{familyCreation=undefined;});
    return familyCreation;
  }
  async function joinFamily(body, directId) {
    const options=family.reserveOptions(body);
    if(body.credential)options.credential=body.credential;
    for(let attempt=0;attempt<2;attempt++){
      if(matchMaker.state===matchMaker.MatchMakerState.SHUTTING_DOWN)break;
      const roomId=directId || (await getFamilyInstance()).roomId;
      try { return await matchMaker.joinById(roomId,options); }
      catch (error) {
        if(familyInstance?.roomId===roomId){
          if(familyInstance.locked || /already full/i.test(error.message))throw new ServerError(409,'The family room is full.');
          throw error;
        }
        if(directId)throw new ServerError(404,'The family room instance has closed.');
      }
    }
    throw new ServerError(503,'The family room is temporarily unavailable.');
  }

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
      const id=req.url.split('?')[0].split('/')[2],room=id&&accounts?.roomFor(id);
      const scoped=!access.denied&&room&&accounts.context(req,access.origin).rooms.includes(room.familyRoom?FAMILY_ROOM_ALIAS:room.roomId);
      const status=access.denied?.[0] || (pilot&&!access.authenticated&&!scoped?401:0) ||
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
      let ctx,pilotAuthorized=false;
      if(!localHealth){
        const access=await inspect(req,admission||!readMethod(req.method));
        if(access.denied)return rejectHttp(res,...access.denied);
        if(pilot){
          pilotAuthorized=access.authenticated;
          if(accounts){
            ctx=accounts.context(req,access.origin);
            if(await accounts.handle(req,res,path,ctx))return;
          }
          if(req.method==='POST'&&req.url==='/pilot/session'){
            const denied=await pilot.login(req,res,access.origin,!!family);
            if(denied)rejectHttp(res,...denied);
            return;
          }
          const familyLink=!!family&&path===FAMILY_ROOM_PATH;
          const entry=familyLink||path==='/'||path==='/fps/'||path==='/fps/index.html';
          const redirect=path==='/'||familyLink;
          const scoped=!!ctx?.rooms.length;
          if(entry&&readMethod(req.method)&&(!access.authenticated&&!scoped||redirect)){
            const query=new URL(req.url,'http://local').searchParams;
            const familyEntry=familyLink||!!family&&query.get('family')===FAMILY_ROOM_ALIAS;
            const room=query.get('room');
            if(!access.authenticated&&!scoped)return showInvite(res,false,room,familyEntry);
            if(!access.authenticated&&scoped&&!room&&!familyEntry)return redirectLobby(res,ctx.rooms[0],ctx.rooms[0]===FAMILY_ROOM_ALIAS);
            return redirectLobby(res,room,familyEntry);
          }
          if(!access.authenticated&&!scoped)return rejectHttp(res,401,'Pilot invite required.');
          if(path==='/health')return rejectHttp(res,404,'Unknown route.');
        }
      }
      if(admission){
        const route=admissionRoute.exec(req.url);
        const viaAlias=!!family&&req.url===familyAdmission;
        if(req.method!=='POST'||!route&&!viaAlias)return rejectHttp(res,404,'Unknown matchmaking route.');
        req.body=await readAdmission(req);
        const room=route?.[1]&&[...active].find(r=>r.roomId===route[1]);
        if(route?.[1]&&!room)return rejectHttp(res,404,'Private room not found.');
        const scope=viaAlias||room?.familyRoom?FAMILY_ROOM_ALIAS:room?.roomId;
        const remembered=ctx?.rooms.includes(scope)&&req.body.code==='';
        if(ctx&&!pilotAuthorized&&!ctx.rooms.includes(scope))return rejectHttp(res,403,'This device has no access to that room.');
        if(viaAlias||room?.familyRoom){
          if(!remembered&&!family.acceptsPassword(req.body.code))return rejectHttp(res,403,'Incorrect family room password.');
          try{checkContract(req.body.contract,CONTRACT);}
          catch(error){return rejectHttp(res,409,error.message);}
          if(ctx)req.body.credential=accounts.bind(ctx,res,!remembered);
          let reservation;
          try{reservation=await joinFamily(req.body,room?.roomId);}
          catch(error){
            if(error.code===409||error.code===404)return rejectHttp(res,error.code,error.message);
            return rejectHttp(res,503,'The family room is temporarily unavailable.');
          }
          const body=JSON.stringify(reservation);
          res.writeHead(200,{'Content-Type':'application/json','Content-Length':Buffer.byteLength(body)});
          return res.end(body);
        }
        // Colyseus normally checks the room code after reserving a seat, at WS
        // JOIN. Check it here too to avoid spending seats on invalid invites.
        if(!remembered&&room&&!room.acceptsCode(req.body.code))return rejectHttp(res,403,'Incorrect private room code.');
        if(ctx){
          req.body.credential=accounts.bind(ctx,res,!remembered);
          if(remembered)req.body.code=room.rememberedProof;
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
    close:async()=>{await server.gracefullyShutdown(false);httpServer.closeIdleConnections();accounts?.store.close();}};
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  const local=await createLocalServer(configFromEnv(process.env));
  const mode=local.config.pilotInvite?'Invite-only HTTPS pilot':local.config.lan?'Trusted LAN':'Localhost only';
  console.log(`${mode} · up to 10 players (5v5), listening at ${local.url}`);
  let stopping=false;
  for(const signal of ['SIGINT','SIGTERM'])process.on(signal,async()=>{if(stopping)return;stopping=true;await local.close();});
}
