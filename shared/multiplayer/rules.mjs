import {CONFIG, WEAPONS} from '../../src/fps/config.mjs';

// Trusted, deliberately small online ruleset. Offline defaults stay untouched.
export const NETWORK_CONFIG = Object.freeze({...CONFIG, networkSlice:true,
  mode:'endless', difficulty:'normal', loadout:'smg', firefight:false,
  wanderers:false, hostageDamage:false, friendlyFire:false,
  startMoney:0, maxMoney:0, killMoney:0});
export const NETWORK_MAP = 'floor5-prepared';
export const PROTOCOL_VERSION = 4;
export const TEAM_CAPACITY = 5;
export const ROOM_CAPACITY = TEAM_CAPACITY * 2;
export const RECONNECT_SECONDS = 15;
export const INTERPOLATION_MS = 100;
// The 250 ms ordered-jitter run measured ~310 ms SDK RTT; 400 ms rejected
// legitimate shots. Include its 100 ms display buffer plus scheduler margin.
export const REWIND_MS = 500;
export const ROOM_TYPE = 'private-fps';
export const POSE_NUMBERS = ['x','y','z','yaw','pitch','height','vy','moving','distanceWalked','lastStep'];
export const POSE_BOOLEANS = ['onGround','crouching','jumpHeld'];
export function copyPose(target, source) {
  for(const key of [...POSE_NUMBERS,...POSE_BOOLEANS]) target[key]=source[key];
}
export const configContract = () => ({config:NETWORK_CONFIG, weapon:WEAPONS.smg,
  world:'floor5-authoritative-doors-spawn-shutters-intact-unbreakable-glass-v1',
  capacity:ROOM_CAPACITY, teamCapacity:TEAM_CAPACITY, reconnectSeconds:RECONNECT_SECONDS,
  rewindMs:REWIND_MS, interpolationMs:INTERPOLATION_MS});
export const wrapYaw = value => Math.atan2(Math.sin(value),Math.cos(value));
export function safeName(value) {
  if(typeof value!=='string')return 'Player';
  return value.normalize('NFKC').replace(/[\p{C}]/gu,'').trim().slice(0,24)||'Player';
}
