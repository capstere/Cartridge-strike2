// Run while the candidate process is stopped. Preserve post-release writes
// before preparing settings that the preceding release can actually open.
import {copyFileSync, existsSync, lstatSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {randomBytes} from 'node:crypto';
import {pathToFileURL} from 'node:url';

export async function prepareRollback(source, target, family, account, snapshot) {
  for (const path of [source,target,family,account,snapshot]) {
    if (resolve(path) !== path) throw Error('Recovery paths must be absolute.');
  }
  mkdirSync(snapshot, {mode:0o700});
  const cold = join(snapshot,'cold');
  mkdirSync(cold, {mode:0o700});
  const copyRegular = (from,to) => {
    if (!lstatSync(from).isFile()) throw Error('Expected regular private state.');
    copyFileSync(from,to);
  };
  copyRegular(family,join(cold,'settings.json'));
  const database = 'accounts.sqlite';
  for (const journal of ['', '.pending.sqlite']) {
    for (const sidecar of ['', '-wal', '-shm', '-journal']) {
      const suffix = journal + sidecar;
      if (existsSync(account + suffix)) copyRegular(account + suffix,join(cold,database + suffix));
    }
  }
  let schema = null;
  if (existsSync(join(cold,database))) {
    const {copyAccountDatabase} = await import(pathToFileURL(join(source,'server/account-backup.mjs')));
    // Work on a second copy; SQLite may checkpoint or create a WAL-index.
    const work = join(snapshot,'verification');
    mkdirSync(work,{mode:0o700});
    for (const suffix of ['', '-wal', '-shm', '-journal', '.pending.sqlite', '.pending.sqlite-wal', '.pending.sqlite-shm', '.pending.sqlite-journal']) {
      const file = database + suffix;
      if (existsSync(join(cold,file))) copyRegular(join(cold,file),join(work,file));
    }
    const recovery = join(snapshot,'verified.sqlite');
    const result = await copyAccountDatabase('backup',join(work,database),recovery);
    await copyAccountDatabase('restore',recovery,join(work,'restored.sqlite'));
    schema = result.version;
  } else if (existsSync(join(cold,database + '.pending.sqlite'))) {
    throw Error('Pending results need their corresponding account database.');
  }
  const {openFamilyRoom} = await import(pathToFileURL(join(target,'server/family-room.mjs')));
  const password = randomBytes(32).toString('base64url');
  const file = join(snapshot,'family.for-target.json');
  const room = openFamilyRoom({familyPassword:password,familyStateFile:file});
  const original = JSON.parse(readFileSync(join(cold,'settings.json'),'utf8'));
  if (original.version !== 1 || original.alias !== room.alias) throw Error('Unknown family settings envelope.');
  // Use the previous release's own validator. Prefer the full current set,
  // then preserve every setting its map and mode can represent.
  try { room.saveSettings(original.settings); }
  catch (error) {
    if (error.message !== 'Invalid family room settings.') throw error;
    const defaults = room.settings;
    const maps = await import(pathToFileURL(join(target,'shared/multiplayer/maps.mjs')));
    const map = maps.networkMap(original.settings.mapId) || maps.networkMap(defaults.mapId);
    const mode = map.modes.includes(original.settings.mode) ? original.settings.mode : map.modes[0];
    room.saveSettings({...defaults,mapId:map.id,mode});
    for (const key of Object.keys(defaults)) {
      if (['mapId','mode'].includes(key) || !(key in original.settings)) continue;
      try { room.saveSettings({...room.settings,[key]:original.settings[key]}); }
      catch (error) { if (error.message !== 'Invalid family room settings.') throw error; }
    }
  }
  const reopened = openFamilyRoom({familyPassword:password,familyStateFile:file}).settings;
  const adjusted = Object.keys(original.settings).filter(key=>original.settings[key] !== reopened[key]);
  const result = {accountSchema:schema, familyFields:Object.keys(reopened).length, adjustedFields:adjusted};
  writeFileSync(join(snapshot,'receipt.json'), JSON.stringify(result,null,2)+'\n', {flag:'wx',mode:0o600});
  return result;
}
if (process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
  if (process.argv.length!==7) throw Error('Expected source release, previous release, family file, account file and new private backup directory.');
  console.log(JSON.stringify(await prepareRollback(...process.argv.slice(2))));
}
