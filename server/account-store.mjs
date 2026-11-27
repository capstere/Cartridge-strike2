import {createHash,randomBytes,randomInt,randomUUID,scrypt,timingSafeEqual} from 'node:crypto';
import {promisify} from 'node:util';
import {closeSync,openSync,chmodSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

const derive=promisify(scrypt);
const DAY=86400000;
const digest=value=>createHash('sha256').update(value).digest('hex');
const secret=()=>randomBytes(32).toString('base64url');
const normalized=value=>typeof value==='string'?value.trim().toLowerCase():'';
const denied=(status,message)=>Object.assign(Error(message),{status});
const badLogin=()=>denied(403,'The credentials could not be verified.');
const shortAlphabet='23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const strongPassword=value=>typeof value==='string'&&value.length>=12&&Buffer.byteLength(value)<=256;
const validateName=value=>typeof value==='string'&&value.trim().length>=1&&[...value.trim()].length<=24&&!/[\p{C}<>]/u.test(value);
const validatePassword=value=>{if(!strongPassword(value))throw denied(400,'Use at least 12 characters and at most 256 UTF-8 bytes for the password.');};
const emptyStats=()=>({matches:0,kills:0,deaths:0,wins:0,xp:0});
const schema=`
 CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL, password TEXT NOT NULL, recovery TEXT NOT NULL, created INTEGER NOT NULL);
 CREATE TABLE sessions(token TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE, origin TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE INDEX sessions_user ON sessions(user_id);
 CREATE TABLE devices(token TEXT PRIMARY KEY, origin TEXT NOT NULL, expires INTEGER NOT NULL);
 CREATE TABLE invites(id TEXT PRIMARY KEY, room TEXT NOT NULL, origin TEXT NOT NULL, token TEXT UNIQUE NOT NULL, short TEXT UNIQUE NOT NULL, expires INTEGER NOT NULL, used INTEGER NOT NULL DEFAULT 0);
 CREATE INDEX invites_room ON invites(room,origin);
 CREATE TABLE grants(device TEXT NOT NULL REFERENCES devices ON DELETE CASCADE, room TEXT NOT NULL, invite TEXT REFERENCES invites ON DELETE CASCADE, expires INTEGER NOT NULL, PRIMARY KEY(device,room));
 CREATE TABLE summaries(instance TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE, mode TEXT NOT NULL, map TEXT NOT NULL, played INTEGER NOT NULL, kills INTEGER NOT NULL, deaths INTEGER NOT NULL, win INTEGER NOT NULL, PRIMARY KEY(instance,user_id));
 CREATE INDEX summaries_user ON summaries(user_id,played);
 CREATE TABLE rewards(instance TEXT NOT NULL, event TEXT NOT NULL, user_id TEXT NOT NULL REFERENCES users ON DELETE CASCADE, kind TEXT NOT NULL, xp INTEGER NOT NULL, PRIMARY KEY(instance,event,user_id,kind));
 PRAGMA user_version=1;`;

export class AccountStore {
  constructor(path,{now=Date.now}={}) {
    this.now=now;this.activeHashes=0;this.failures=new Map();this.nextCleanup=0;
    if(path!==':memory:'){closeSync(openSync(path,'a',0o600));chmodSync(path,0o600);}
    this.db=new DatabaseSync(path);
    try{
      this.db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=1500; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL');
      this.transaction(()=>{
        const version=this.db.prepare('PRAGMA user_version').get().user_version;
        if(!version)this.db.exec(schema);else if(version!==1)throw Error('Unsupported account database version.');
      });
    }catch(error){this.db.close();throw error;}
  }
  transaction(fn){
    this.db.exec('BEGIN IMMEDIATE');
    try{const result=fn();this.db.exec('COMMIT');return result;}catch(error){this.db.exec('ROLLBACK');throw error;}
  }
  close(){this.db.close();}
  clean(){
    const now=this.now();if(now<this.nextCleanup)return;
    this.nextCleanup=now+60000;
    this.transaction(()=>{
      for(const table of ['sessions','devices','grants'])this.db.prepare(`DELETE FROM ${table} WHERE expires<=?`).run(now);
      // A used invitation continues to identify its grants for host revocation.
      this.db.prepare('DELETE FROM invites WHERE expires<=? AND NOT EXISTS(SELECT 1 FROM grants WHERE invite=invites.id)').run(now);
    });
    for(const [key,bucket] of this.failures)if(bucket.until<=now)this.failures.delete(key);
  }
  tryCredential(username){
    this.clean();const key=digest(username),now=this.now();let bucket=this.failures.get(key);
    if(!bucket||bucket.until<=now){if(this.failures.size>=2048)throw denied(429,'Too many attempts. Try again later.');this.failures.set(key,bucket={count:0,until:now+600000});}
    if(++bucket.count>10)throw denied(429,'Too many attempts. Try again later.');
  }
  async passwordKey(password,salt){
    if(this.activeHashes>=2)throw denied(429,'The sign-in service is busy. Try again shortly.');
    this.activeHashes++;
    try{return await derive(password,salt,32,{N:32768,r:8,p:1,maxmem:40*1024*1024});}finally{this.activeHashes--;}
  }
  async hashPassword(password){validatePassword(password);const salt=randomBytes(16).toString('hex');return `s1:${salt}:${(await this.passwordKey(password,salt)).toString('hex')}`;}
  async verify(password,encoded){
    if(typeof password!=='string'||Buffer.byteLength(password)>256)throw badLogin();
    const [,salt,key]=(encoded||`s1:${'0'.repeat(32)}:${'0'.repeat(64)}`).split(':');
    const verified=timingSafeEqual(await this.passwordKey(password,salt),Buffer.from(key,'hex'));
    if(!encoded||!verified)throw badLogin();
  }
  newSession(id,origin,previous){
    if(previous)this.db.prepare('DELETE FROM sessions WHERE token=? AND origin=?').run(digest(previous),origin);
    const token=secret();this.db.prepare('INSERT INTO sessions VALUES(?,?,?,?)').run(digest(token),id,origin,this.now()+30*DAY);return token;
  }
  userFor(token,origin){
    if(!token)return;
    return this.db.prepare('SELECT u.* FROM users u JOIN sessions s ON s.user_id=u.id WHERE s.token=? AND s.origin=? AND s.expires>?').get(digest(token),origin,this.now());
  }
  async register({username,displayName,password},origin,previous){
    username=normalized(username);
    if(!/^[a-z0-9_]{3,24}$/.test(username)||!validateName(displayName??username))throw denied(400,'Use a 3–24 character username with letters, numbers or underscores and a display name of 1–24 characters.');
    this.tryCredential(username);
    const encoded=await this.hashPassword(password),id=randomUUID(),code=randomBytes(20).toString('base64url');
    return this.transaction(()=>{
      const inserted=this.db.prepare('INSERT INTO users VALUES(?,?,?,?,?,?) ON CONFLICT(username) DO NOTHING').run(id,username,(displayName??username).trim(),encoded,digest(code),this.now());
      if(!inserted.changes)throw denied(409,'That username is unavailable.');
      return {token:this.newSession(id,origin,previous),recoveryCode:code};
    });
  }
  async login({username,password},origin,previous){
    username=normalized(username);this.tryCredential(username);
    const user=this.db.prepare('SELECT id,password FROM users WHERE username=?').get(username);
    await this.verify(password,user?.password);
    return this.transaction(()=>{
      if(!this.db.prepare('SELECT 1 FROM users WHERE id=? AND password=?').get(user.id,user.password))throw badLogin();
      this.failures.delete(digest(username));return {token:this.newSession(user.id,origin,previous)};
    });
  }
  async recover({username,recoveryCode,newPassword},origin,previous){
    username=normalized(username);this.tryCredential(username);validatePassword(newPassword);
    const user=this.db.prepare('SELECT id,recovery FROM users WHERE username=?').get(username);
    if(typeof recoveryCode!=='string'||recoveryCode.length!==27||!timingSafeEqual(Buffer.from(digest(recoveryCode),'hex'),Buffer.from(user?.recovery||'0'.repeat(64),'hex'))||!user)throw badLogin();
    const encoded=await this.hashPassword(newPassword),code=randomBytes(20).toString('base64url');
    return this.transaction(()=>{
      const changed=this.db.prepare('UPDATE users SET password=?,recovery=? WHERE id=? AND recovery=?').run(encoded,digest(code),user.id,user.recovery);
      if(!changed.changes)throw badLogin();
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);this.failures.delete(digest(username));
      return {token:this.newSession(user.id,origin,previous),recoveryCode:code};
    });
  }
  async change(action,user,input,origin,previous){
    this.tryCredential(user.username);await this.verify(input.password,user.password);
    const password=action==='password'?await this.hashPassword(input.newPassword):null;
    return this.transaction(()=>{
      const current=this.userFor(previous,origin);if(current?.id!==user.id||current.password!==user.password)throw badLogin();
      this.failures.delete(digest(user.username));
      if(action==='delete'){this.db.prepare('DELETE FROM users WHERE id=?').run(user.id);return {token:null};}
      if(action==='recovery-code'){
        const code=randomBytes(20).toString('base64url');this.db.prepare('UPDATE users SET recovery=? WHERE id=?').run(digest(code),user.id);return {recoveryCode:code};
      }
      this.db.prepare('UPDATE users SET password=? WHERE id=?').run(password,user.id);
      this.db.prepare('DELETE FROM sessions WHERE user_id=?').run(user.id);return {token:this.newSession(user.id,origin,previous)};
    });
  }
  rename(user,name){if(!validateName(name))throw denied(400,'Use a display name of 1–24 characters.');this.db.prepare('UPDATE users SET display_name=? WHERE id=?').run(name.trim(),user.id);}
  logout(token,origin){if(token)this.db.prepare('DELETE FROM sessions WHERE token=? AND origin=?').run(digest(token),origin);}
  profile(user,rooms=[],all=false){
    if(!user)return {user:null,stats:emptyStats(),recent:[],rooms};
    const stats=this.db.prepare(`SELECT count(*) AS matches,coalesce(sum(kills),0) AS kills,coalesce(sum(deaths),0) AS deaths,coalesce(sum(win),0) AS wins,
       (SELECT coalesce(sum(xp),0) FROM rewards WHERE user_id=?) AS xp FROM summaries WHERE user_id=?`).get(user.id,user.id);
    const recent=this.db.prepare('SELECT mode,map,played,kills,deaths,win FROM summaries WHERE user_id=? ORDER BY played DESC'+(all?'':' LIMIT 12')).all(user.id);
    return {user:{username:user.username,displayName:user.display_name,createdAt:user.created},stats,recent,rooms};
  }
  deviceFor(token,origin){
    if(!token)return;
    return this.db.prepare('SELECT token FROM devices WHERE token=? AND origin=? AND expires>?').get(digest(token),origin,this.now())?.token;
  }
  device(token,origin){
    const existing=this.deviceFor(token,origin);if(existing)return {id:existing,token};
    const fresh=secret(),id=digest(fresh);
    this.db.prepare('INSERT INTO devices VALUES(?,?,?)').run(id,origin,this.now()+30*DAY);return {id,token:fresh};
  }
  rooms(device){return device?this.db.prepare('SELECT room FROM grants WHERE device=? AND expires>? ORDER BY room').all(device,this.now()).map(g=>g.room):[];}
  remember(device,room,invite=null){
    this.db.prepare(`INSERT INTO grants VALUES(?,?,?,?) ON CONFLICT(device,room) DO UPDATE SET expires=excluded.expires,
      invite=CASE WHEN grants.invite IS NULL AND grants.expires>? THEN NULL ELSE excluded.invite END`).run(device,room,invite,this.now()+30*DAY,this.now());
  }
  forget(device,room){if(device)this.db.prepare('DELETE FROM grants WHERE device=? AND room=?').run(device,room);}
  revoke(room,origin){this.db.prepare('DELETE FROM invites WHERE room=? AND origin=?').run(room,origin);}
  removeScope(room){
    this.transaction(()=>{
      this.db.prepare('DELETE FROM grants WHERE room=?').run(room);
      this.db.prepare('DELETE FROM invites WHERE room=?').run(room);
    });
  }
  issue(room,origin){
    const token=secret(),shortCode=Array.from({length:10},()=>shortAlphabet[randomInt(shortAlphabet.length)]).join('');
    const id=randomUUID(),expiresAt=this.now()+15*60000;
    this.transaction(()=>{this.db.prepare('DELETE FROM invites WHERE room=? AND origin=? AND used=0').run(room,origin);this.db.prepare('INSERT INTO invites VALUES(?,?,?,?,?,?,0)').run(id,room,origin,digest(token),digest(shortCode),expiresAt);});
    return {id,token,shortCode,room,expiresAt};
  }
  exchange(input,origin,currentDevice){
    const code=typeof input==='string'?input.trim():'';
    if(!/^[\w-]{43}$|^[A-Z2-9]{10}$/i.test(code))throw denied(403,'The room invitation is invalid or has expired.');
    const hash=digest(code.length===10?code.toUpperCase():code);
    return this.transaction(()=>{
      const invite=this.db.prepare('UPDATE invites SET used=1 WHERE origin=? AND expires>? AND used=0 AND (token=? OR short=?) RETURNING id,room').get(origin,this.now(),hash,hash);
      if(!invite)throw denied(403,'The room invitation is invalid or has expired.');
      const device=this.device(currentDevice,origin);this.remember(device.id,invite.room,invite.id);
      return {room:invite.room,device};
    });
  }
  recordMatch(instance,mode,map,entries){
    this.transaction(()=>{
      const insert=this.db.prepare('INSERT OR IGNORE INTO summaries SELECT ?,id,?,?,?,?,?,? FROM users WHERE id=?');
      for(const e of entries){
        if(!insert.run(instance,mode,map,this.now(),e.kills,e.deaths,Number(e.win),e.user).changes)continue;
        const points=e.kills*10+(e.win?25:0);
        this.db.prepare('INSERT INTO rewards VALUES(?,?,?,?,?)').run(instance,'result',e.user,'match',points);
      }
    });
  }
}
