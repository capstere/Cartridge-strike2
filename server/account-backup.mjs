// Snapshot a live WAL database without copying a potentially inconsistent set of files.
// Restore always publishes a separate new file. Select it at the next controlled restart.
import {chmod,link,lstat,mkdtemp,open,realpath,rm} from 'node:fs/promises';
import {basename,dirname,isAbsolute,join,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {DatabaseSync} from 'node:sqlite';
import {applyMatchCredit,pendingBackup,resultJournalPath} from './result-journal.mjs';

const release=fileURLToPath(new URL('../',import.meta.url));
async function privatePath(path) {
  if(typeof path!=='string'||!isAbsolute(path))throw Error('Use absolute private database paths.');
  const directory=await realpath(dirname(path));
  const resolved=join(directory,basename(path));
  if(resolved.startsWith(release))throw Error('Keep account data outside the release.');
  return resolved;
}
export function verifyAccountDatabase(db){
  const version=db.prepare('PRAGMA user_version').get().user_version;
  if(![1,2,3,4,5].includes(version))throw Error('Unsupported account database version.');
  for(const table of ['users','sessions','devices','invites','grants','rewards','summaries',...(version>=2?['credential_attempts']:[]),...(version>=3?['public_grants','public_blocks','public_reports']:[]),...(version>=4?['arsenals','weapon_progress']:[]),...(version>=5?['challenge_progress','challenge_maps','match_progression']:[])]){
    if(!db.prepare("SELECT 1 FROM sqlite_schema WHERE type='table' AND name=?").get(table))throw Error('Incomplete account database schema.');
  }
  if(db.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'||db.prepare('PRAGMA foreign_key_check').get())throw Error('Account database integrity check failed.');
  return version;
}
export async function copyAccountDatabase(action,from,to) {
  if(!['backup','restore'].includes(action))throw Error('Use backup or restore with a source and a new destination.');
  from=await privatePath(from);to=await privatePath(to);
  if(!(await lstat(from)).isFile()||resolve(from)===resolve(to))throw Error('Use separate regular file paths.');
  // Refuse collateral SQLite sidecars as well as any occupied destination.
  const occupied=[to,resultJournalPath(to)].flatMap(file=>[file,file+'-wal',file+'-shm',file+'-journal']);
  for(const file of occupied){
    if(await lstat(file).then(()=>true,error=>{if(error.code==='ENOENT')return false;throw error;}))throw Error('Destination must be a new isolated database.');
  }
  const dir=await mkdtemp(join(dirname(to),'.cs3-snapshot-'));
  try{
    const staged=join(dir,'snapshot.sqlite');
    await (await open(staged,'wx',0o600)).close();
    const pending=pendingBackup(from);
    const source=new DatabaseSync(from,{readOnly:true});
    try{
      source.exec('PRAGMA trusted_schema=OFF; PRAGMA busy_timeout=1500');
      verifyAccountDatabase(source);
      source.prepare('VACUUM INTO ?').run(staged);
    }finally{source.close();}
    const copy=new DatabaseSync(staged,{readOnly:!pending.length});
    let version;
    try{
      if(pending.length){
        copy.exec('PRAGMA trusted_schema=OFF; PRAGMA foreign_keys=ON; BEGIN IMMEDIATE');
        for(const receipt of pending)applyMatchCredit(copy,receipt);
        copy.exec('COMMIT');
      }
      version=verifyAccountDatabase(copy);
    }finally{copy.close();}
    await chmod(staged,0o600);
    const data=await open(staged,'r');try{await data.sync();}finally{await data.close();}
    await link(staged,to);
    const parent=await open(dirname(to),'r');try{await parent.sync();}finally{await parent.close();}
    return {version};
  }finally{await rm(dir,{recursive:true,force:true});}
}
if(process.argv[1]===fileURLToPath(import.meta.url)){
  try{
    const [action,source,destination]=process.argv.slice(2);
    const {version}=await copyAccountDatabase(action,source,destination);
    console.log('Verified private '+action+' of account schema v'+version+'.');
  }catch(error){console.error(error.message);process.exitCode=1;}
}
