import {schema,t} from '@colyseus/schema';
import {POSE_NUMBERS,POSE_BOOLEANS} from '../shared/multiplayer/rules.mjs';
export const NetworkInput=schema({
  lifeId:t.uint32(),controlEpoch:t.uint32(),sampleTick:t.uint32(),fireId:t.uint32(),reloadId:t.uint32(),
  forward:t.float64(),strafe:t.float64(),yaw:t.float64(),pitch:t.float64(),
  jump:t.boolean(),crouch:t.boolean(),sneak:t.boolean(),aim:t.boolean(),fire:t.boolean(),interact:t.boolean(),
},'FPSInputV10');
export const ActorState=schema({
  ...Object.fromEntries(POSE_NUMBERS.map(k=>[k,t.float64()])),
  ...Object.fromEntries(POSE_BOOLEANS.map(k=>[k,t.boolean()])),
  id:t.string(),sessionId:t.string(),team:t.string(),name:t.string(),
  lifeId:t.uint32(),controlEpoch:t.uint32(),connected:t.boolean(),lifeStartedAt:t.float64(),diedAtMs:t.float64(),ready:t.boolean(),playerReady:t.boolean(),alive:t.boolean(),hp:t.float64(),armor:t.float64(),
  pending:t.boolean(),money:t.uint16(),actionType:t.string(),actionStart:t.float64(),actionDuration:t.float64(),bot:t.boolean(),aimAmount:t.float32(),aiming:t.boolean(),weapon:t.string(),lastWeapon:t.string(),loadout:t.string(),
  primary:t.string(),primaryAmmo:t.uint16(),primaryReserve:t.uint16(),pistol:t.string(),pistolAmmo:t.uint16(),pistolReserve:t.uint16(),he:t.uint8(),
  ammo:t.uint16(),reserve:t.uint16(),kills:t.uint16(),deaths:t.uint16(),
  reloadUntil:t.float64(),nextShot:t.float64(),respawnAt:t.float64(),
  spawnProtectedUntil:t.float64(),deathAt:t.float64(),hurtTime:t.float64(),
  deathSource:t.string(),deathWeapon:t.string(),deathVariant:t.string(),recoil:t.float64(),
},'FPSActorV12');
export const DoorState=schema({angle:t.float64(),poseAngle:t.float64(),target:t.float64(),sign:t.float64(),holdUntil:t.float64()},'FPSDoorV10');
export const GrenadeState=schema({id:t.string(),type:t.string(),ownerId:t.string(),team:t.string(),ownerLifeId:t.uint32(),deadline:t.float64(),x:t.float32(),y:t.float32(),z:t.float32()},'FPSGrenadeV10');
export const RocketState=schema({
  id:t.string(),ownerId:t.string(),ownerName:t.string(),ownerLifeId:t.uint32(),team:t.string(),born:t.float64(),until:t.float64(),
  x:t.float32(),y:t.float32(),z:t.float32(),vx:t.float32(),vy:t.float32(),vz:t.float32(),
},'FPSRocketV10');
export const HostageState=schema({id:t.string(),name:t.string(),x:t.float32(),y:t.float32(),z:t.float32(),yaw:t.float32(),alive:t.boolean(),rescued:t.boolean(),escortId:t.string(),distanceWalked:t.float32()},'FPSHostageV10');
export const ResidentState=schema({
  id:t.string(),model:t.string(),name:t.string(),lifeId:t.uint32(),lifeStartedAt:t.float64(),diedAtMs:t.float64(),
  x:t.float64(),y:t.float64(),z:t.float64(),yaw:t.float64(),radius:t.float64(),height:t.float64(),alive:t.boolean(),hp:t.float32(),
  behavior:t.string(),clip:t.string(),poseAt:t.float64(),rate:t.float32(),offset:t.float32(),loop:t.boolean(),
},'FPSResidentV10');
export const RoomState=schema({mapId:t.string(),mode:t.string(),round:t.uint32(),roundPhase:t.string(),zombiesEnabled:t.boolean(),dancemanEnabled:t.boolean(),friendlyFire:t.boolean(),botDifficulty:t.string(),residents:t.map(ResidentState),deadline:t.float64(),buyDeadline:t.float64(),resultDeadline:t.float64(),roundReason:t.string(),roundWinner:t.string(),
  bombStatus:t.string(),carrierId:t.string(),bombX:t.float32(),bombY:t.float32(),bombZ:t.float32(),bombDeadline:t.float64(),hostages:t.map(HostageState),fillBots:t.boolean(),brokenGlass:t.map('number'),grenades:t.map(GrenadeState),projectiles:t.map(RocketState),actors:t.map(ActorState),tick:t.uint32(),time:t.float64(),
  phase:t.string(),matchId:t.uint32(),ownerId:t.string(),remainingSeconds:t.float64(),durationSeconds:t.uint16(),scoreTarget:t.uint16(),
  winner:t.string(),reason:t.string(),results:t.string(),resultsAtMs:t.float64(),
  analysts:t.uint16(),counterAnalysts:t.uint16(),worldRevision:t.uint32(),doors:t.map(DoorState),elevatorProgress:t.float64(),elevatorOpenAt:t.float64()},'FPSRoomV13');
