import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {FAMILY_ROOM_ALIAS} from '../shared/multiplayer/family-room.mjs';
import {AccountStore} from './account-store.mjs';
import {readJson} from './access.mjs';
import {matchMaker} from '@colyseus/core';

const accountCookie='__Host-cs3_account',roomCookie='__Host-cs3_room';
const cookie=(req,name)=>(req.headers.cookie||'').split(/;\s*/).find(s=>s.startsWith(name+'='))?.slice(name.length+1);
const setCookie=(res,name,token)=>res.appendHeader('Set-Cookie',name+'='+(token||'')+'; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age='+(token?2592000:0));
const actions={
  register:['username','displayName','password'],login:['username','password'],recover:['username','recoveryCode','newPassword'],
  password:['password','newPassword'],'recovery-code':['password'],profile:['displayName'],logout:[],delete:['password'],
  invites:['room'],exchange:['code'],forget:['room'],revoke:['room'],
};
const assets=new Map([
  ['/profile',['../fps/account.html','text/html; charset=utf-8']],
  ['/fps/account.css',['../fps/account.css','text/css; charset=utf-8']],
  ['/src/fps/account-profile.mjs',['../src/fps/account-profile.mjs','text/javascript; charset=utf-8']],
]);
const fail=(status,message)=>{throw Object.assign(Error(message),{status});};
function json(res,value){
  res.writeHead(200,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'private, no-store'});
  res.end(JSON.stringify(value));
}
export const roomScope=room=>room.familyRoom?FAMILY_ROOM_ALIAS:room.roomId;
export const destination=scope=>'/fps/?network=internet&'+(scope===FAMILY_ROOM_ALIAS?'family=':'room=')+encodeURIComponent(scope);

function joinPage(res,head){
  const nonce=randomBytes(16).toString('base64');
  res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Referrer-Policy':'no-referrer',
    'Content-Security-Policy':"default-src 'none'; connect-src 'self'; script-src 'nonce-"+nonce+"'; style-src 'self'; form-action 'none'; base-uri 'none'; frame-ancestors 'none'"});
  res.end(head?undefined:`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Join a private room · Cartridge-Strike 3</title><link rel="stylesheet" href="/fps/account.css"><main><h1>Join a private room</h1>
<form><label>Room invitation code <input required name="code" type="password" maxlength="64" autocomplete="off" spellcheck="false"></label>
<button>Join room</button></form><p role="status" aria-live="polite"></p></main><script nonce="${nonce}">
const fragment=location.hash.slice(1);history.replaceState(null,'',location.pathname);
const form=document.querySelector('form'),status=document.querySelector('[role=status]');
async function enter(code){form.querySelector('button').disabled=true;status.textContent='Checking invitation…';
try{const r=await fetch('/api/room/exchange',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({code})});
const value=await r.json();if(!r.ok)throw Error(value.error);location.replace(value.destination);}
catch(error){status.textContent=error.message;}finally{form.querySelector('button').disabled=false;}}
form.addEventListener('submit',e=>{e.preventDefault();const code=form.elements.code.value.trim();form.reset();enter(code);});if(fragment)enter(fragment);
</script></html>`);
}

export function accountAccess(config,active){
  const store=new AccountStore(config.accountDb);
  // Colyseus process-private rooms do not survive an authority restart.
  store.transaction(()=>{
    store.db.prepare('DELETE FROM grants WHERE room<>?').run(FAMILY_ROOM_ALIAS);
    store.db.prepare('DELETE FROM invites WHERE room<>?').run(FAMILY_ROOM_ALIAS);
  });
  function context(req,origin){
    const token=cookie(req,accountCookie),roomToken=cookie(req,roomCookie);
    const device=store.deviceFor(roomToken,origin);
    return {origin,token,roomToken,device,rooms:store.rooms(device)};
  }
  function bind(ctx,res,legacy){
    const device=store.device(ctx.roomToken,ctx.origin);
    if(device.token!==ctx.roomToken)setCookie(res,roomCookie,device.token);
    return {device:device.id,user:store.userFor(ctx.token,ctx.origin)?.id,legacy};
  }
  function roomFor(id){return [...active].find(r=>r.roomId===id||roomScope(r)===id);}
  function requireHost(ctx,id){
    const room=roomFor(id),owner=room?.seats?.get(room.state.ownerId);
    if(!ctx.device||!owner?.ready||!owner.connected||owner.revoked||owner.credential?.device!==ctx.device||
      !ctx.rooms.includes(roomScope(room)))fail(403,'Only the connected room host can manage invitations.');
    return roomScope(room);
  }
  function disconnectRevoked(scope,device){
    for(const room of active)if(roomScope(room)===scope)for(const seat of room.seats.values()){
      const id=seat.credential?.device;
      if(id&&(!device||id===device)&&!store.rooms(id).includes(scope)){
        seat.revoked=true;seat.client.leave(4003);
      }
    }
  }
  async function handle(req,res,path,ctx){
    const read=['GET','HEAD'].includes(req.method);
    if(read&&assets.has(path)){
      const [file,mime]=assets.get(path),body=await readFile(new URL(file,import.meta.url));
      res.writeHead(200,{'Content-Type':mime,'Content-Length':body.length,'Referrer-Policy':'no-referrer',
        'Content-Security-Policy':"default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'"});
      res.end(req.method==='HEAD'?undefined:body);return true;
    }
    if(path==='/join'&&read){joinPage(res,req.method==='HEAD');return true;}
    if(!path.startsWith('/api/'))return false;
    const user=store.userFor(ctx.token,ctx.origin);
    if(req.method==='GET'){
      if(path==='/api/account')json(res,store.profile(user,ctx.rooms));
      else if(path==='/api/account/export'){
        if(!user)fail(401,'Sign in to export your account.');
        res.setHeader('Content-Disposition','attachment; filename="cartridge-strike-account.json"');json(res,store.profile(user,[],true));
      }else if(path==='/api/rooms/public'&&config.publicListing){
        if(!user)fail(401,'Sign in to view public matches.');
        const listings=await matchMaker.query({private:false,locked:false});
        const rooms=listings.filter(room=>room.metadata?.moderatedPublic===true&&room.clients<room.maxClients)
          .slice(0,24).map(room=>({id:room.roomId,players:room.clients,capacity:room.maxClients}));
        json(res,{enabled:true,rooms});
      }else fail(404,'Unknown route.');
      return true;
    }
    if(req.method!=='POST')fail(405,'Method not allowed.');
    const match=/^\/api\/(account|room)\/([a-z-]+)$/.exec(path),group=match?.[1],action=match?.[2];
    if(!Object.hasOwn(actions,action)||(['invites','exchange','forget','revoke'].includes(action)!==(group==='room')))fail(404,'Unknown route.');
    const input=await readJson(req);
    if(Object.keys(input).some(k=>!actions[action].includes(k)))fail(400,'Invalid request fields.');
    if(group==='room'){
      if(action==='exchange'){
        const {room,device}=store.exchange(input.code,ctx.origin,ctx.roomToken);
        setCookie(res,roomCookie,device.token);json(res,{room,destination:destination(room)});return true;
      }
      if(typeof input.room!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(input.room))fail(400,'Invalid room.');
      if(action==='invites')json(res,store.issue(requireHost(ctx,input.room),ctx.origin));
      else if(action==='revoke'){
        const scope=requireHost(ctx,input.room);store.revoke(scope,ctx.origin);disconnectRevoked(scope);json(res,{room:scope});
      }else{
        store.forget(ctx.device,input.room);if(ctx.device)disconnectRevoked(input.room,ctx.device);json(res,{rooms:store.rooms(ctx.device)});
      }
      return true;
    }
    let result={};
    if(['register','login','recover'].includes(action))result=await store[action](input,ctx.origin,ctx.token);
    else if(action==='logout'){store.logout(ctx.token,ctx.origin);result={token:null};}
    else{
      if(!user)fail(401,'Sign in to change your account.');
      if(action==='profile')store.rename(user,input.displayName);
      else result=await store.change(action,user,input,ctx.origin,ctx.token);
    }
    if(Object.hasOwn(result,'token'))setCookie(res,accountCookie,result.token);
    const token=Object.hasOwn(result,'token')?result.token:ctx.token;
    json(res,{...store.profile(store.userFor(token,ctx.origin),ctx.rooms),...(result.recoveryCode?{recoveryCode:result.recoveryCode}:{})});
    return true;
  }
  return {store,context,bind,handle,roomFor};
}
