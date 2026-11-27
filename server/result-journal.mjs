import {closeSync,constants,fchmodSync,fstatSync,openSync,existsSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';

export const resultJournalPath=path=>path+'.pending.sqlite';
const journalId=0x43533351;
const maxResults=64;
const maxBytes=256*1024;

export function resolveMatchCredit(db,result){
  const live=db.prepare('SELECT 1 FROM sessions WHERE token=? AND user_id=? AND expires>?');
  const entries=[];
  for(const player of result.entries){
    const eligible=(player.segments??[player]).filter(s=>!s.session||live.get(s.session,player.user,result.played));
    if(eligible.length)entries.push({user:player.user,kills:eligible.reduce((total,s)=>total+s.kills,0),
      deaths:eligible.reduce((total,s)=>total+s.deaths,0),win:eligible.at(-1).win});
  }
  return {...result,entries};
}

// Caller owns the transaction. A deleted account cannot be recreated by replay.
export function applyMatchCredit(db,result){
  const insert=db.prepare('INSERT OR IGNORE INTO summaries SELECT ?,id,?,?,?,?,?,? FROM users WHERE id=?');
  const reward=db.prepare('INSERT INTO rewards VALUES(?,?,?,?,?)');
  for(const p of resolveMatchCredit(db,result).entries){
    if(insert.run(result.instance,result.mode,result.map,result.played,p.kills,p.deaths,Number(p.win),p.user).changes){
      reward.run(result.instance,'result',p.user,'match',p.kills*10+(p.win?25:0));
    }
  }
}

class ResultJournal {
  constructor(accountPath,readOnly=false){
    const path=resultJournalPath(accountPath);
    const flags=(readOnly?constants.O_RDONLY:constants.O_RDWR|constants.O_CREAT)|constants.O_NOFOLLOW;
    const fd=openSync(path,flags,0o600);
    try{
      if(!fstatSync(fd).isFile())throw Error('Private result journal must be a regular file.');
      if(!readOnly)fchmodSync(fd,0o600);
    }finally{closeSync(fd);}
    this.db=new DatabaseSync(path,{readOnly});
    try{
      this.db.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=200');
      let id=this.db.prepare('PRAGMA application_id').get().application_id;
      if(!readOnly&&id===0&&!this.db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table'").get()){
        this.db.exec(`BEGIN IMMEDIATE; CREATE TABLE pending(instance TEXT PRIMARY KEY,receipt TEXT NOT NULL);
          PRAGMA application_id=${journalId}; PRAGMA user_version=1; COMMIT`);
        id=journalId;
      }
      if(id!==journalId||this.db.prepare('PRAGMA user_version').get().user_version!==1)throw Error('Unsupported private result journal.');
      if(!readOnly)this.db.exec('PRAGMA synchronous=FULL');
    }catch(error){this.close();throw error;}
  }
  append(result){
    const encoded=JSON.stringify(result);
    if(Buffer.byteLength(encoded)>maxBytes)throw Error('Private result receipt is too large.');
    // A duplicate acknowledgement after a crash retains the original immutable receipt.
    if(this.db.prepare('SELECT 1 FROM pending WHERE instance=?').get(result.instance))return;
    const added=this.db.prepare('INSERT INTO pending SELECT ?,? WHERE (SELECT count(*) FROM pending)<?').run(result.instance,encoded,maxResults);
    if(!added.changes)throw Error('Private result journal is full.');
  }
  *receipts(){
    // Read one bounded record at a time. Deletion happens after its primary commit.
    const read=this.db.prepare('SELECT receipt FROM pending WHERE instance=?');
    const ids=this.db.prepare('SELECT instance FROM pending ORDER BY rowid').all();
    if(ids.length>maxResults)throw Error('Invalid private result journal size.');
    for(const {instance} of ids){
      const row=read.get(instance);
      if(!row)continue;
      if(Buffer.byteLength(row.receipt)>maxBytes)throw Error('Invalid private result receipt.');
      const result=JSON.parse(row.receipt);
      if(result.version!==1||result.instance!==instance||!Array.isArray(result.entries))throw Error('Invalid private result receipt.');
      yield result;
    }
  }
  remove(id){this.db.prepare('DELETE FROM pending WHERE instance=?').run(id);}
  close(){this.db.close();}
}

// Capture outstanding receipts before snapshotting the primary database. A receipt
// removed concurrently has already committed there. The destination deduplicates both.
export function pendingBackup(path){
  if(!existsSync(resultJournalPath(path)))return [];
  const journal=new ResultJournal(path,true);
  try{return [...journal.receipts()];}finally{journal.close();}
}

export function resultWriter(store,path){
  let journal=existsSync(resultJournalPath(path))?new ResultJournal(path):null;
  let retry;
  const memory=new Map();
  const apply=result=>store.transaction(()=>applyMatchCredit(store.db,result));
  function stash(result){
    try{
      journal??=new ResultJournal(path);
      journal.append(result);
      memory.delete(result.instance);
      return true;
    }catch{
      const encoded=JSON.stringify(result);
      if(!memory.has(result.instance)&&memory.size<maxResults&&Buffer.byteLength(encoded)<=maxBytes)memory.set(result.instance,encoded);
      console.error('Private result storage is unavailable or at capacity.');
      return false;
    }
  }
  function flush(){
    let success=true;
    try{
      for(const result of journal?.receipts()??[]){
        apply(result);
        journal.remove(result.instance);
      }
    }catch{success=false;}
    for(const [id,encoded] of memory){
      const result=JSON.parse(encoded);
      try{apply(result);memory.delete(id);}catch{stash(result);success=false;break;}
    }
    if(success){clearInterval(retry);retry=undefined;}
    return success;
  }
  function schedule(){
    if(!retry){retry=setInterval(flush,5000);retry.unref();}
  }
  function recordMatch(instance,mode,map,entries){
    if(!entries.length)return;
    let result={version:1,instance,mode,map,entries,played:store.now()};
    try{
      // WAL allows this authority snapshot while an independent writer holds the
      // main write lock. Usually the retry record contains only aggregate scores.
      result=resolveMatchCredit(store.db,result);
      if(!result.entries.length)return;
      apply(result);
    }catch{
      stash(result);schedule();
    }
  }
  function close(){
    clearInterval(retry);flush();
    if(memory.size)console.error('Private storage is unavailable. Some match results could not be saved at shutdown.');
    journal?.close();
  }
  if(journal&&!flush())schedule();
  return {recordMatch,close};
}
