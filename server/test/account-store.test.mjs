import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,readFile,rm,stat} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {AccountStore} from '../account-store.mjs';
import {copyAccountDatabase} from '../account-backup.mjs';

const origin='https://room.example.test';
test('versioned migration, live WAL backup, isolated restore and authoritative result replay',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-restore-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const source=join(dir,'original.sqlite'),backup=join(dir,'backup.sqlite'),restore=join(dir,'restored.sqlite');
  let db=new AccountStore(source);
  const profile={username:'restored_user',displayName:'Restored user',password:randomBytes(24).toString('hex')};
  const account=await db.register(profile,origin),user=db.userFor(account.token,origin);
  const device=db.device(null,origin),invite=db.issue('JESPERS-ROOM',origin);
  db.remember(device.id,'JESPERS-ROOM');
  // Two different authoritative rooms can both finish their local match number one.
  const first=randomUUID(),second=randomUUID(),result={user:user.id,kills:3,deaths:2,win:true};
  db.recordMatch(first,'tdm','floor-5',[result]);
  db.recordMatch(second,'classic','floor-5',[result,result]);
  const before=db.profile(user);
  assert.equal(before.stats.matches,2);assert.equal(before.stats.kills,6);assert.equal(before.stats.xp,110);
  db.close();
  const v1=new DatabaseSync(source);
  v1.exec('DROP TABLE match_progression; DROP TABLE challenge_maps; DROP TABLE challenge_progress; DROP TABLE arsenals; DROP TABLE weapon_progress; DROP TABLE public_grants; DROP TABLE public_blocks; DROP TABLE public_reports; DROP TABLE credential_attempts; DROP INDEX grants_invite; PRAGMA user_version=1');v1.close();
  const oldCopy=join(dir,'v1.sqlite');
  assert.deepEqual(await copyAccountDatabase('backup',source,oldCopy),{version:1});
  db=new AccountStore(source);
  assert.equal(db.db.prepare('PRAGMA user_version').get().user_version,5);
  assert.deepEqual(db.profile(db.userFor(account.token,origin)),before);
  await Promise.all([copyAccountDatabase('backup',source,backup),Promise.resolve().then(()=>db.recordMatch(first,'tdm','floor-5',[result]))]);
  assert.equal((await stat(backup)).mode&0o777,0o600);
  const content=await readFile(backup);
  for(const proof of [profile.password,account.token,account.recoveryCode,invite.shortCode,invite.token,device.token])assert(!content.includes(proof));
  await assert.rejects(copyAccountDatabase('restore',backup,source),/new isolated/);
  assert.deepEqual(await copyAccountDatabase('restore',backup,restore),{version:5});
  const recovered=new AccountStore(restore);
  recovered.recordMatch(second,'classic','floor-5',[result]);
  assert.deepEqual(recovered.profile(recovered.userFor(account.token,origin)),before);
  assert.equal(recovered.rooms(recovered.deviceFor(device.token,origin))[0],'JESPERS-ROOM');
  recovered.exchange(invite.token,origin);
  assert.throws(()=>recovered.exchange(invite.shortCode,origin),{status:403});
  db.exchange(invite.shortCode,origin);
  const session=await recovered.login(profile,origin);
  assert.equal(recovered.userFor(session.token,origin).username,profile.username);
  await recovered.change('delete',user,{password:profile.password},origin,session.token);
  assert.equal(recovered.db.prepare('SELECT count(*) AS n FROM rewards').get().n,0);
  assert.equal(recovered.db.prepare('SELECT count(*) AS n FROM summaries').get().n,0);
  assert.equal(db.profile(user).stats.matches,2);
  db.close();recovered.close();
});

test('strict expiry, origin, rotation, revocation, credential attempt and hashing limits',async t=>{
  let now=Date.UTC(2026,0,1);
  const dir=await mkdtemp(join(tmpdir(),'cs3-expiry-'));
  t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'accounts.sqlite'),clock={now:()=>now};
  let db=new AccountStore(file,clock);
  const p={username:'scope_player',displayName:'Test Player',password:randomBytes(24).toString('hex')};
  const {token}=await db.register(p,origin);
  const device=db.device(null,origin),room='JESPERS-ROOM';
  const old=db.issue(room,origin),fresh=db.issue(room,origin);
  assert.throws(()=>db.exchange(old.shortCode,origin),{status:403});
  assert.throws(()=>db.exchange(fresh.token,'https://other.example.test'),{status:403});
  assert.equal(db.deviceFor(device.token,'https://other.example.test'),undefined);
  now=fresh.expiresAt;assert.throws(()=>db.exchange(fresh.token,origin),{status:403});
  const valid=db.issue(room,origin);
  db.exchange(valid.token,origin,device.token);assert.deepEqual(db.rooms(device.id),[room]);
  db.revoke(room,origin);assert.deepEqual(db.rooms(device.id),[]);
  const u=db.userFor(token,origin);
  const rotated=await db.change('password',u,{password:p.password,newPassword:p.password+'2'},origin,token);
  assert.equal(db.userFor(token,origin),undefined);assert.equal(db.userFor(rotated.token,origin).id,u.id);
  for(let i=0;i<10;i++)db.tryCredential(p.username);
  db.close();db=new AccountStore(file,clock);
  assert.throws(()=>db.tryCredential(p.username),{status:429});
  now+=600001;db.tryCredential(p.username);
  // A short bounded queue rejects excess work immediately and releases capacity on completion.
  const hash1=db.hashPassword(p.password),hash2=db.hashPassword(p.password);
  await assert.rejects(db.hashPassword(p.password),{status:429});
  const [a,b]=await Promise.all([hash1,hash2]);assert.notEqual(a,b);assert.equal(db.activeHashes,0);
  now+=30*86400000;assert.equal(db.userFor(rotated.token,origin),undefined);assert.equal(db.deviceFor(device.token,origin),undefined);
  db.clean();assert.equal(db.db.prepare('SELECT count(*) AS n FROM sessions').get().n,0);
  db.close();
});

test('server-owned XP unlocks private class slots and fittings across restart and isolated restore',async t=>{
  const {defaultArsenal}=await import('../../src/fps/arsenal.mjs');
  const dir=await mkdtemp(join(tmpdir(),'cs3-arsenal-store-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const file=join(dir,'accounts.sqlite'),clone=join(dir,'restore.sqlite');
  let store=new AccountStore(file);
  try{
    const origin='https://arsenal.example.test',account=await store.register({username:'class_player',displayName:'Class Player',password:randomBytes(24).toString('hex')},origin);
    const user=store.userFor(account.token,origin);
    const profile={...defaultArsenal(),selected:'custom-1'};
    profile.slots[0]={name:'Harbor',primary:{id:'smg',attachments:['red'],camo:'desert'},secondary:{id:'sidearm',attachments:[],camo:null},equipment:'flash'};
    assert.throws(()=>store.saveArsenal(user.id,profile),{status:400});
    store.db.prepare('INSERT INTO rewards(instance,event,user_id,kind,xp) VALUES(?,?,?,?,?)').run(randomUUID(),'fixture',user.id,'match',2000);
    assert.throws(()=>store.saveArsenal(user.id,profile),{status:400});
    store.db.prepare('INSERT INTO weapon_progress(user_id,weapon,xp) VALUES(?,?,?)').run(user.id,'smg',2000);
    store.saveArsenal(user.id,profile);
    await copyAccountDatabase('backup',file,clone);
    store.close();store=new AccountStore(clone);
    const restored=store.profile(store.userFor(account.token,origin));
    assert.deepEqual(restored.arsenal,profile);assert.equal(restored.entitlements.weaponLevels.smg,3);
    assert.equal(restored.entitlements.weaponLevels.cr4,undefined);
    assert.equal(store.profile(null).arsenal,null);
  }finally{store.close();}
});

test('private earned progression migrates v4, folds live sessions, caps outfits, and survives backup, replay and restore',async t=>{
  const dir=await mkdtemp(join(tmpdir(),'cs3-earned-restore-'));t.after(()=>rm(dir,{recursive:true,force:true}));
  const path=join(dir,'original.sqlite'),snapshot=join(dir,'snapshot.sqlite'),restored=join(dir,'restored.sqlite');
  let store=new AccountStore(path);
  try{
    const credentials={username:'earned_player',password:randomBytes(20).toString('hex')};
    const account=await store.register(credentials,origin),user=store.userFor(account.token,origin);
    store.recordMatch('legacy','classic','floor5-prepared',[{user:user.id,kills:2,deaths:3,win:true}]);
    // Reproduce the published schema v4 with a pre-existing signed result and weapon.
    store.db.exec('DROP TABLE match_progression; DROP TABLE challenge_progress; DROP TABLE challenge_maps; PRAGMA user_version=4');
    store.db.prepare('INSERT INTO weapon_progress VALUES(?,?,?)').run(user.id,'smg',300);
    store.close();store=new AccountStore(path);
    const before=store.profile(user);
    assert.deepEqual({...before.stats},{matches:1,kills:2,deaths:3,wins:1,xp:45});
    assert.equal(before.progression.challenges.length,18);
    assert(before.progression.challenges.every(c=>c.count===0));
    const part={session:user.session,kills:2,deaths:1,headshots:1,assists:1,win:true,weapons:{smg:250},
      challenges:{rPm:151,rMouv:25,rDouble:14,fCartes:1},completed:true};
    const entries=[{user:user.id,segments:[{...part,session:'revoked'},part]}];
    store.recordMatch('match-a','ffa','embruns',entries);
    store.recordMatch('match-a','ffa','embruns',entries);
    const first=store.profile(user);
    assert.equal(first.stats.xp,100);
    assert.equal(first.progression.assists,1);assert.equal(first.progression.headshots,1);
    assert.deepEqual(first.progression.unlockedOutfits,[]);
    assert.deepEqual(first.progression.weapons,[{id:'smg',xp:550,level:2}]);
    assert.deepEqual(first.entitlements.weaponLevels,{smg:2});
    assert.equal(first.progression.challenges.find(c=>c.id==='rPm').count,150);
    store.recordMatch('match-b','ffa','embruns',entries);
    const complete=store.profile(user);
    assert.equal(complete.progression.challenges.find(c=>c.id==='fCartes').count,1);
    assert.deepEqual(complete.progression.unlockedOutfits,['raptor']);
    assert.deepEqual(store.unlockedOutfits(user.id),['raptor']);
    const final=store.db.prepare('SELECT challenges FROM match_progression WHERE instance=? AND user_id=?').get('match-b',user.id);
    assert.deepEqual(JSON.parse(final.challenges),{rDouble:1},'completion shows only actual new progress');
    await copyAccountDatabase('backup',path,snapshot);
    await copyAccountDatabase('restore',snapshot,restored);
    store.close();store=new AccountStore(restored);
    store.recordMatch('match-b','ffa','embruns',entries);
    assert.deepEqual(store.profile(store.userFor(account.token,origin)),complete);
    assert.equal(store.validScoringSession(user.id,user.session),true);
    store.logout(account.token,origin);
    assert.equal(store.validScoringSession(user.id,user.session),false);
    store.recordMatch('after-logout','ffa','meltem',entries);
    assert.deepEqual(store.profile(user),complete);
  }finally{store.close();}
});
