import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {FAMILY_ROOM_ALIAS} from '../shared/multiplayer/family-room.mjs';
import {AccountStore} from './account-store.mjs';
import {readJson} from './access.mjs';
import {publicRooms} from './public-rooms.mjs';

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
  const directory=config.publicListing?publicRooms(store,active):null;
  // Colyseus process-private rooms do not survive an authority restart.
  store.transaction(()=>{
    store.db.exec('DELETE FROM public_grants');
    store.db.prepare('DELETE FROM grants WHERE room<>?').run(FAMILY_ROOM_ALIAS);
    store.db.prepare('DELETE FROM invites WHERE room<>?').run(FAMILY_ROOM_ALIAS);
  });
  const features={publicMatches:!!directory};
  function context(req,origin){
    const token=cookie(req,accountCookie),roomToken=cookie(req,roomCookie);
    const device=store.deviceFor(roomToken,origin);
    const publicScopes=directory?.scopes(device,store.userFor(token,origin))??[];
    return {origin,token,roomToken,device,publicScopes,rooms:[...new Set([...store.rooms(device),...publicScopes])]};
  }
  function bind(ctx,res,legacy){
    store.clean();
    const device=store.device(ctx.roomToken,ctx.origin);
    if(device.token!==ctx.roomToken)setCookie(res,roomCookie,device.token);
    const user=store.userFor(ctx.token,ctx.origin);
    return {device:device.id,user:user?.id,session:user?.session,legacy};
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
      if(path==='/api/account')json(res,{...store.profile(user,ctx.rooms),features});
      else if(path==='/api/account/export'){
        if(!user)fail(401,'Sign in to export your account.');
        res.setHeader('Content-Disposition','attachment; filename="cartridge-strike-account.json"');json(res,{...store.profile(user,[],true),
          blocks:store.db.prepare('SELECT u.display_name AS name FROM public_blocks b JOIN users u ON b.target=u.id WHERE b.owner=?').all(user.id),
          reports:store.db.prepare('SELECT reason,created FROM public_reports WHERE reporter=? ORDER BY created DESC').all(user.id)});
      }else if(path==='/api/rooms/public'&&config.publicListing){
        if(!user)fail(401,'Sign in to view public matches.');
        json(res,{enabled:true,rooms:directory.list(user.id)});
      }else if(directory&&path==='/api/room/moderation'){
        if(!user)fail(401,'Sign in to manage a public match.');
        const room=roomFor(new URL(req.url,'http://local').searchParams.get('room'));
        json(res,directory.moderation(room,user,ctx.device));
      }else if(directory&&path==='/api/account/blocks'){
        if(!user)fail(401,'Sign in to manage blocked players.');
        json(res,{blocks:directory.blocks(user)});
      }else fail(404,'Unknown route.');
      return true;
    }
    if(req.method!=='POST')fail(405,'Method not allowed.');
    const match=/^\/api\/(account|room)\/([a-z-]+)$/.exec(path),group=match?.[1],action=match?.[2];
    const publicFields={publish:['room','enabled'],'public-join':['room'],report:['room','player','reason'],block:['room','player'],remove:['room','player'],unblock:['id']};
    if(Object.hasOwn(publicFields,action)){
      if(!directory||group!==(action==='unblock'?'account':'room'))fail(404,'Unknown route.');
      if(!user)fail(401,'Sign in to use public matches.');
      const input=await readJson(req),fields=publicFields[action];
      if(Object.keys(input).length!==fields.length||!fields.every(key=>Object.hasOwn(input,key))||
        (fields.includes('room')&&(typeof input.room!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(input.room)))||
        (fields.includes('player')&&(typeof input.player!=='string'||input.player.length!==36))||
        (action==='unblock'&&(typeof input.id!=='string'||input.id.length!==36)))fail(400,'Invalid request fields.');
      const room=roomFor(input.room);
      if(action==='publish'){
        if(typeof input.enabled!=='boolean')fail(400,'Choose a listing status.');
        directory.publish(room,user,ctx.device,input.enabled);json(res,{room:room.roomId,enabled:input.enabled});
      }else if(action==='public-join'){
        if(!room)fail(404,'That public room is unavailable.');
        const {device}=bind(ctx,res,false);
        directory.grant(room,user,device);json(res,{room:room.roomId,destination:destination(room.roomId)});
      }else{
        if(action==='unblock')directory.unblock(user,input.id);
        else directory.moderate(action,room,user,ctx.device,input);
        json(res,{ok:true});
      }
      return true;
    }
    if(!Object.hasOwn(actions,action)||(['invites','exchange','forget','revoke'].includes(action)!==(group==='room')))fail(404,'Unknown route.');
    const input=await readJson(req);
    if(Object.keys(input).some(k=>!actions[action].includes(k)))fail(400,'Invalid request fields.');
    if(group==='room'){
      if(action==='exchange'){
        store.clean();
        const {room,device}=store.exchange(input.code,ctx.origin,ctx.roomToken);
        setCookie(res,roomCookie,device.token);json(res,{room,destination:destination(room)});return true;
      }
      if(typeof input.room!=='string'||!/^[A-Za-z0-9_-]{1,32}$/.test(input.room))fail(400,'Invalid room.');
      if(action==='invites'&&directory?.publication(roomFor(input.room)))fail(409,'Unpublish the room before issuing private invitations.');
      if(action==='invites')json(res,store.issue(requireHost(ctx,input.room),ctx.origin));
      else if(action==='revoke'){
        const scope=requireHost(ctx,input.room);store.revoke(scope,ctx.origin);disconnectRevoked(scope);json(res,{room:scope});
      }else{
        store.forget(ctx.device,input.room);if(ctx.device)directory?.forget(input.room,ctx.device);if(ctx.device)disconnectRevoked(input.room,ctx.device);json(res,{rooms:store.rooms(ctx.device)});
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
    directory?.reconcile();
    if(Object.hasOwn(result,'token'))setCookie(res,accountCookie,result.token);
    const token=Object.hasOwn(result,'token')?result.token:ctx.token;
    const current=store.userFor(token,ctx.origin);
    const rooms=[...new Set([...store.rooms(ctx.device),...directory?.scopes(ctx.device,current)??[]])];
    json(res,{...store.profile(current,rooms),features,...(result.recoveryCode?{recoveryCode:result.recoveryCode}:{})});
    return true;
  }
  const pending=new Map();
  let retry;
  function flush(){
    for(const [id,args] of pending){
      try{store.recordMatch(...args);pending.delete(id);}catch{break;}
    }
    if(!pending.size){clearInterval(retry);retry=undefined;}
  }
  function recordMatch(...args){
    if(!args[3].length)return;
    try{store.recordMatch(...args);}catch{
      if(pending.size>=64){console.error('Account storage is unavailable and the pending result queue is full.');return;}
      pending.set(args[0],args);
      if(!retry){
        console.error('Account storage is unavailable. Completed results will retry.');
        retry=setInterval(flush,5000);retry.unref();
      }
    }
  }
  function close(){
    clearInterval(retry);flush();
    if(pending.size)console.error('Account storage still has unsaved match results at shutdown.');
    directory?.close();store.close();
  }
  return {directory,store,context,bind,handle,roomFor,recordMatch,close};
}
