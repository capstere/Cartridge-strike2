// Rehearse CS2 -> CS3 -> CS2 against the retained CS2 reader and an isolated
// copy of the actual family envelope. All generated account secrets stay private.
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {copyFileSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {DatabaseSync} from 'node:sqlite';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {prepareRollback} from '../deploy/online/prepare-rollback.mjs';
import {openFamilyRoom} from '../server/family-room.mjs';
import {AccountStore} from '../server/account-store.mjs';
import {copyAccountDatabase} from '../server/account-backup.mjs';
import {pendingBackup,resultWriter} from '../server/result-journal.mjs';

process.umask(0o077);
const [previous,productionCopy,destination] = process.argv.slice(2);
if (!previous || !productionCopy || !destination) throw Error('Expected previous release, private backup settings and a new rehearsal directory.');
const current = fileURLToPath(new URL('../',import.meta.url)).replace(/\/$/,'');
const root = resolve(destination);
mkdirSync(root,{mode:0o700});
const family = join(root,'settings.json'), account=join(root,'accounts.sqlite');
copyFileSync(productionCopy,family);
const familyPassword=randomBytes(32).toString('base64url');
const oldReader = (await import(pathToFileURL(join(resolve(previous),'server/family-room.mjs')))).openFamilyRoom;
const old = oldReader({familyPassword,familyStateFile:family}).settings;
const candidate = openFamilyRoom({familyPassword,familyStateFile:family});
assert.deepEqual(candidate.settings,old);
const origin='https://rehearsal.example.test';
const store=new AccountStore(account);
const identity=await store.register({username:'migration_player',displayName:'Migration Player',password:randomBytes(28).toString('hex')},origin);
const user=store.userFor(identity.token,origin);
const first=join(root,'before-post-snapshot-writes.sqlite');
await copyAccountDatabase('backup',account,first);
candidate.saveSettings({...candidate.settings,mapId:'meltem',mode:'dom',zombiesEnabled:false,dancemanEnabled:false,friendlyFire:!old.friendlyFire});
const entry={user:user.id,kills:3,deaths:1,win:true};
store.recordMatch(randomUUID(),'tdm','floor5-prepared',[entry]);
const writer=resultWriter(store,account);
const lock=new DatabaseSync(account);
lock.exec('BEGIN IMMEDIATE');
try {
  writer.recordMatch(randomUUID(),'dom','meltem',[entry]);
  assert.equal(pendingBackup(account).length,1);
  writer.close();
} finally { lock.exec('ROLLBACK'); lock.close(); store.close(); }
const snapshot=join(root,'rollback');
const result=await prepareRollback(current,resolve(previous),family,account,snapshot);
assert.deepEqual(new Set(result.adjustedFields),new Set(['mapId','mode']));
assert.equal(oldReader({familyPassword,familyStateFile:join(snapshot,'family.for-target.json')}).settings.friendlyFire,!old.friendlyFire);
assert.equal(openFamilyRoom({familyPassword,familyStateFile:join(snapshot,'cold/settings.json')}).settings.mode,'dom');
const restored = new AccountStore(join(snapshot,'verification/restored.sqlite'));
const before = new AccountStore(first);
try {
  const latest=restored.profile(restored.userFor(identity.token,origin)).stats;
  assert.equal(before.profile(before.userFor(identity.token,origin)).stats.matches,0);
  assert.equal(latest.matches,2);assert.equal(latest.kills,6);
  assert.equal(pendingBackup(account).length,1);
  const receipt={status:'PASS',source:'private CS3-12 family backup',originalFamilyFields:Object.keys(old).length,
    recoveredFamilyFields:result.familyFields,restoredCS3Settings:'Meltem / Domination',olderReaderSubstitutions:result.adjustedFields,
    compatiblePostSnapshotPreference:true,accountSchema:result.accountSchema,matchesBeforeSnapshot:0,
    recoveredMatches:latest.matches,recoveredKills:latest.kills,pendingResultsRecovered:1,originalPrivateJournalRetained:true};
  writeFileSync(join(root,'proof.json'),JSON.stringify(receipt,null,2)+'\n');
  console.log(JSON.stringify(receipt));
} finally { restored.close(); before.close(); }
