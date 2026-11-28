import {BONUSES,BONUS_VERSION} from '../../src/fps/bonuses.mjs';
import {CONFIG, WEAPONS} from '../../src/fps/config.mjs';

export const BOT_DIFFICULTY_IDS = Object.freeze(['casual', 'normal', 'hard']);
export const DEFAULT_NETWORK_BOT_DIFFICULTY = 'normal';
// Trusted, deliberately small online ruleset. Offline defaults stay untouched.
export const NETWORK_CONFIG = Object.freeze({...CONFIG, networkSlice:true,
  mode:'endless', difficulty:DEFAULT_NETWORK_BOT_DIFFICULTY, loadout:'smg', firefight:false,
  wanderers:false, zombies:false, danceman:false, hostageDamage:false, friendlyFire:false,
  startMoney:0, maxMoney:0, killMoney:0});
export const CLASSIC_NETWORK_CONFIG = Object.freeze({...NETWORK_CONFIG,mode:'classic',
  startMoney:CONFIG.startMoney,maxMoney:CONFIG.maxMoney,killMoney:CONFIG.killMoney,hostageDamage:CONFIG.hostageDamage});
export {DEFAULT_MAP_ID as NETWORK_MAP} from './maps.mjs';
export const PROTOCOL_VERSION = 18;
export const TEAM_CAPACITY = 5;
export const ROOM_CAPACITY = TEAM_CAPACITY * 2;
export const TDM_MINUTES = Object.freeze([3,5,10,15]);
export const TDM_KILLS = Object.freeze([10,25,50,100]);
export const CLASSIC_WINS = Object.freeze([3,5,8]);
export const BOT_COUNTS = Object.freeze(Array.from({length: TEAM_CAPACITY+1}, (_, count)=>count));
export const MATCH_PREFERENCES = Object.freeze({tdmMinutes:10,tdmKills:50,classicWins:CLASSIC_NETWORK_CONFIG.matchWins,
  analystsBots:TEAM_CAPACITY,counterAnalystsBots:TEAM_CAPACITY});
export const MATCH_CHOICES = Object.freeze({tdmMinutes:TDM_MINUTES,tdmKills:TDM_KILLS,classicWins:CLASSIC_WINS,
  analystsBots:BOT_COUNTS,counterAnalystsBots:BOT_COUNTS});
export const MATCH_DEFAULTS = Object.freeze({durationSeconds:MATCH_PREFERENCES.tdmMinutes*60,scoreTarget:MATCH_PREFERENCES.tdmKills,countdownSeconds:5});
export const RTT_FRESH_MS = 4000;
export const RECONNECT_SECONDS = 15;
export const INTERPOLATION_MS = 100;
export const SHOT_TICK_MARGIN_MS = 75;

// The SDK advances its render clock between patches. A resumed tab or a
// still-converging RTT estimate can describe a different instant from the
// acknowledged tick. In that case send the ordinary input without a rewind
// stamp so its shot uses current authoritative positions.
export function reliableRoomInput(room) {
  const clock = room.clock;
  return room.input({
    mode: 'reliable',
    renderDelay: INTERPOLATION_MS,
    allowRewind() {
      const patch = clock.lastServerTime();
      const render = clock.serverNow() - INTERPOLATION_MS - clock.smoothedRtt() / 2;
      // Leave a simulation step for the time between the sampled tick and
      // its serialized patch, plus rounding on either side of the wire.
      const margin = SHOT_TICK_MARGIN_MS - Math.ceil(NETWORK_CONFIG.fixedStep * 1000) - 2;
      return patch > 0 && render >= patch - INTERPOLATION_MS - margin && render <= patch + margin;
    },
  });
}
// The 250 ms ordered-jitter run measured ~310 ms SDK RTT; 400 ms rejected
// legitimate shots. Include its 100 ms display buffer plus scheduler margin.
export const REWIND_MS = 500;
export const ROOM_TYPE = 'private-fps';
export const MOVEMENT_NUMBERS=['x','y','z','yaw','pitch','height','vy','moving','distanceWalked','lastStep','rushWeight','rushResumeAt'];
export const MOVEMENT_BOOLEANS=['onGround','crouching','jumpHeld','rushing'];
export const SLIDE_NUMBERS=['slideUntil','slideReadyAt','slideSpeed','travelDirX','travelDirZ','slideBuffer'];
export const POSE_NUMBERS=[...MOVEMENT_NUMBERS,...SLIDE_NUMBERS];
export const POSE_BOOLEANS=[...MOVEMENT_BOOLEANS,'crouchHeld'];
export function copyPose(target,source){
  for(const key of MOVEMENT_NUMBERS)target[key]=source[key];
  for(const key of MOVEMENT_BOOLEANS)target[key]=source[key];
  const from=source.handling || source,to=target.handling || target;
  for(const key of SLIDE_NUMBERS)to[key]=from[key] || 0;
  to.crouchHeld=!!from.crouchHeld;
}
export const configContract = () => ({config:NETWORK_CONFIG,classic:CLASSIC_NETWORK_CONFIG, bonuses:{version:BONUS_VERSION,items:BONUSES}, weapons:Object.values(WEAPONS).filter(w=>['smg','ar47','cr4','sniper','shotgun','bazooka','p9','p12','knife','he'].includes(w.id)),
  world:'floor5-authoritative-doors-spawn-shutters-breakable-glass-v2',
  capacity:ROOM_CAPACITY, teamCapacity:TEAM_CAPACITY, reconnectSeconds:RECONNECT_SECONDS,
  rewindMs:REWIND_MS, interpolationMs:INTERPOLATION_MS, match:MATCH_DEFAULTS, matchPreferences:MATCH_PREFERENCES,
  matchChoices:MATCH_CHOICES, botDifficulties:BOT_DIFFICULTY_IDS, rttFreshMs:RTT_FRESH_MS});
export const wrapYaw = value => Math.atan2(Math.sin(value),Math.cos(value));
export function safeName(value) {
  if(typeof value!=='string')return 'Player';
  return value.normalize('NFKC').replace(/[\p{C}]/gu,'').trim().slice(0,24)||'Player';
}
