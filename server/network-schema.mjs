import {schema,t} from '@colyseus/schema';
import {POSE_NUMBERS,POSE_BOOLEANS} from '../shared/multiplayer/rules.mjs';
export const NetworkInput=schema({
  lifeId:t.uint32(),sampleTick:t.uint32(),fireId:t.uint32(),reloadId:t.uint32(),
  forward:t.float64(),strafe:t.float64(),yaw:t.float64(),pitch:t.float64(),
  jump:t.boolean(),crouch:t.boolean(),sneak:t.boolean(),fire:t.boolean(),
},'FPSInputV3');
export const ActorState=schema({
  ...Object.fromEntries(POSE_NUMBERS.map(k=>[k,t.float64()])),
  ...Object.fromEntries(POSE_BOOLEANS.map(k=>[k,t.boolean()])),
  id:t.string(),sessionId:t.string(),team:t.string(),name:t.string(),
  lifeId:t.uint32(),ready:t.boolean(),alive:t.boolean(),hp:t.float64(),armor:t.float64(),
  ammo:t.uint16(),reserve:t.uint16(),kills:t.uint16(),deaths:t.uint16(),
  reloadUntil:t.float64(),nextShot:t.float64(),respawnAt:t.float64(),
  spawnProtectedUntil:t.float64(),deathAt:t.float64(),hurtTime:t.float64(),
  deathSource:t.string(),deathWeapon:t.string(),recoil:t.float64(),
},'FPSActorV3');
export const DoorState=schema({angle:t.float64(),target:t.float64(),sign:t.float64(),holdUntil:t.float64()},'FPSDoorV3');
export const RoomState=schema({actors:t.map(ActorState),tick:t.uint32(),time:t.float64(),
  analysts:t.uint16(),counterAnalysts:t.uint16(),worldRevision:t.uint32(),doors:t.map(DoorState),elevatorProgress:t.float64(),elevatorOpenAt:t.float64()},'FPSRoomV3');
