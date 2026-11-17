import {CONFIG, WEAPONS} from '../../src/fps/config.mjs';

// Trusted, deliberately small online ruleset. Offline defaults stay untouched.
export const NETWORK_CONFIG = Object.freeze({...CONFIG, networkSlice:true,
  mode:'endless', difficulty:'normal', loadout:'smg', firefight:false,
  wanderers:false, hostageDamage:false, friendlyFire:false,
  startMoney:0, maxMoney:0, killMoney:0});
export const NETWORK_MAP = 'floor5-prepared';
export const PROTOCOL_VERSION = 3;
export const ROOM_TYPE = 'private-fps';
export const POSE_NUMBERS = ['x','y','z','yaw','pitch','height','vy','moving','distanceWalked','lastStep'];
export const POSE_BOOLEANS = ['onGround','crouching','jumpHeld'];
export function copyPose(target, source) {
  for(const key of [...POSE_NUMBERS,...POSE_BOOLEANS]) target[key]=source[key];
}
export const configContract = () => ({config:NETWORK_CONFIG, weapon:WEAPONS.smg,
  world:'floor5-authoritative-doors-spawn-shutters-intact-unbreakable-glass-v1', capacity:2});
export const wrapYaw = value => Math.atan2(Math.sin(value),Math.cos(value));
export function safeName(value) {
  if(typeof value!=='string')return 'Player';
  return value.normalize('NFKC').replace(/[\p{C}]/gu,'').trim().slice(0,24)||'Player';
}
