import {createHash, randomBytes, timingSafeEqual} from 'node:crypto';
import {closeSync, fsyncSync, openSync, readFileSync, renameSync, rmSync, writeFileSync} from 'node:fs';
import {isAbsolute} from 'node:path';
import {FAMILY_ROOM_ALIAS} from '../shared/multiplayer/family-room.mjs';
import {BOT_DIFFICULTY_IDS, DEFAULT_NETWORK_BOT_DIFFICULTY} from '../shared/multiplayer/rules.mjs';

import {DEFAULT_MAP_ID, networkMap} from '../shared/multiplayer/maps.mjs';
import {matchPreferences} from './match-preferences.mjs';

const passwordPattern = /^[A-Za-z0-9_-]{24,64}$/;
const digest = value => createHash('sha256').update(value).digest();
const defaults = Object.freeze({
  mapId: DEFAULT_MAP_ID, mode: 'tdm', fillBots: true, friendlyFire: false,
  botDifficulty: DEFAULT_NETWORK_BOT_DIFFICULTY, zombiesEnabled: false, dancemanEnabled: false,
});
const flags = ['fillBots', 'friendlyFire', 'zombiesEnabled', 'dancemanEnabled'];

export function familyRoomConfig({familyPassword, familyStateFile, pilotInvite}) {
  if (familyPassword === undefined && familyStateFile === undefined) return {};
  if (!pilotInvite || typeof familyPassword !== 'string' || !passwordPattern.test(familyPassword) ||
      familyPassword === pilotInvite || typeof familyStateFile !== 'string' || !isAbsolute(familyStateFile)) {
    throw Error('Family room needs the HTTPS pilot, a separate 24–64 character base64url password and an absolute state file path.');
  }
  return {familyPassword, familyStateFile};
}

function validateSettings(value) {
  // Earlier v1 files omitted mapId. Keep the v1 envelope: the previous
  // reader ignores extra fields and can continue on Floor 5 after rollback.
  const mapId = value?.mapId === undefined ? DEFAULT_MAP_ID : value.mapId;
  const map = networkMap(mapId);
  if (!value || !map?.modes.includes(value.mode) || !map.residents && (value.zombiesEnabled || value.dancemanEnabled) ||
      !BOT_DIFFICULTY_IDS.includes(value.botDifficulty) || flags.some(key => typeof value[key] !== 'boolean')) {
    throw Error('Invalid family room settings.');
  }
  const preferences=matchPreferences(value);
  if(!preferences)throw Error('Invalid family room settings.');
  return Object.freeze({...Object.fromEntries(Object.keys(defaults).map(key => [key, value[key]])),...preferences,mapId});
}

// Outside the versioned release. Only changes made by the waiting room host
// reach this file. A restart starts a fresh match with the same settings.
export function openFamilyRoom({familyPassword, familyStateFile}) {
  if (!familyPassword) return null;
  const passwordHash = digest(familyPassword);
  // Colyseus serializes join options while reserving a socket. Pass a process
  // proof in those options so neither HTTP route passes the password onward.
  const admissionProof = randomBytes(32).toString('base64url');
  const proofHash = digest(admissionProof);
  let settings;

  function saveSettings(value) {
    const next = validateSettings(value);
    const temporary = familyStateFile + '.' + randomBytes(8).toString('hex');
    try {
      const fd = openSync(temporary, 'wx', 0o600);
      try {
        writeFileSync(fd, JSON.stringify({version: 1, alias: FAMILY_ROOM_ALIAS, settings: next}) + '\n');
        fsyncSync(fd);
      } finally {
        closeSync(fd);
      }
      renameSync(temporary, familyStateFile);
      settings = next;
    } catch {
      try { rmSync(temporary, {force: true}); } catch {}
      throw Error('Room settings could not be saved.');
    }
  }

  return Object.freeze({
    alias: FAMILY_ROOM_ALIAS,
    get settings() {
      if (settings) return settings;
      try {
        const saved = JSON.parse(readFileSync(familyStateFile, 'utf8'));
        if (saved.version !== 1 || saved.alias !== FAMILY_ROOM_ALIAS) throw Error();
        return settings = validateSettings(saved.settings);
      } catch (error) {
        if (error.code !== 'ENOENT') throw Error('Room settings could not be loaded.');
        saveSettings(defaults);
        return settings;
      }
    },
    saveSettings,
    acceptsPassword(value) {
      const code = typeof value === 'string' ? value.trim() : '';
      return passwordPattern.test(code) && timingSafeEqual(passwordHash, digest(code));
    },
    reserveOptions({name, team, contract}) {
      return {name, team, contract, code: admissionProof};
    },
    acceptsCode(code) {
      return typeof code === 'string' && code.length === admissionProof.length && timingSafeEqual(proofHash, digest(code));
    },
  });
}
