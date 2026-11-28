// A room owns one live simulation. Prepare and validate a replacement off to the
// side so a failed level load or failed family save leaves its lobby playable.
import {createHash} from 'node:crypto';
import {createHeadlessSimulation} from './headless.mjs';
import {CLASSIC_NETWORK_CONFIG, NETWORK_CONFIG, TEAM_CAPACITY} from '../shared/multiplayer/rules.mjs';
import {MAP_CONTRACTS} from '../shared/multiplayer/build.mjs';
import {collisionContract} from '../shared/multiplayer/collision-contract.mjs';
import {prepareNetworkWorld} from '../shared/multiplayer/world.mjs';
import {prepareClassicRound} from './classic-round.mjs';
import {ActorState, DoorState} from './network-schema.mjs';

export const ROOM_SEATS = ['analysts', 'counterAnalysts'].flatMap(team =>
  Array.from({length: TEAM_CAPACITY}, (_, i) => `${team}-${i}`));
export const MAP_LOAD_MS = 120_000;

export async function prepareRoomSimulation(settings) {
  const contract = MAP_CONTRACTS[settings.mapId];
  const base = settings.mode === 'classic' ? CLASSIC_NETWORK_CONFIG : NETWORK_CONFIG;
  const sim = await createHeadlessSimulation({mapId: settings.mapId,
    controllers: Object.fromEntries(ROOM_SEATS.map(id => [id, 'human'])),
    config: {...base, difficulty: settings.botDifficulty}});
  if (sim.sourceHash !== contract.mapHash) throw Error('Server map differs from built contract.');
  const collisionHash = createHash('sha256').update(collisionContract(sim.game.world)).digest('hex');
  if (collisionHash !== contract.collisionHash) throw Error('Server collision differs from built contract.');
  prepareNetworkWorld(sim.game.world);
  Object.assign(sim.game.config, {zombies: settings.zombiesEnabled, danceman: settings.dancemanEnabled, friendlyFire: settings.friendlyFire});
  return sim;
}

export function installRoomSimulation(room, sim) {
  const game = sim.game;
  room.sim = sim;
  room.classic = room.state.mode === 'classic';
  room.templates = new Map(game.actors.map(actor => [actor.id, actor]));
  game.state.actors = [];
  game.drainEvents();
  game.onResidentSpawn = resident => {
    resident.lifeId = ++room.residentLife;
    resident.lifeStartedAt = room.clock.elapsedTime;
  };
  game.onGlassBreak = id => room.state.brokenGlass.set(id, room.clock.elapsedTime);
  for (const door of game.world.doors.doors) room.state.doors.set(door.id, new DoorState());
  // All lobbies can switch rules. TDM starts its rounds in MatchLifecycle.
  game.beforeBeginRound = () => prepareClassicRound(room, game.state.mode === game.config.mode);
  game.afterBeginRound = () => {
    if (room.classic) game.world.networkDynamics.elevatorOpenAt = Math.max(0, game.state.buyDeadline - 1.5);
  };
}

export async function changeRoomMap(room, client, settings) {
  room.changingMap = true;
  try {
    const sim = await prepareRoomSimulation(settings);
    const owner = room.seats.get(client.sessionId);
    if (room.disposed || !owner?.connected || owner.revoked || owner.client !== client ||
        room.state.ownerId !== client.sessionId || room.state.phase !== 'waiting') return;
    room.familyRoom?.saveSettings(settings);

    // Preserve the room/session identities and monotonic network tick. All
    // collision-dependent state and every admission to the old world expires.
    sim.tickNumber = room.sim.tickNumber;
    sim.game.eventSerial = room.sim.game.eventSerial;
    room.sim.controllers.clear();
    room.teamComms.dispose();
    room.lag.dispose();
    room.bots.clear();
    for (const field of ['doors', 'actors', 'brokenGlass', 'residents', 'hostages', 'drops', 'smokes', 'grenades', 'projectiles']) room.state[field].clear();
    Object.assign(room.state, settings, {worldRevision: room.state.worldRevision + 1, round: 0, roundPhase: '',
      deadline: 0, buyDeadline: 0, resultDeadline: 0, roundReason: '', roundWinner: '', bombStatus: '',
      carrierId: '', bombX: 0, bombY: 0, bombZ: 0, bombDeadline: 0});
    installRoomSimulation(room, sim);
    room.lag.bindWorld();
    room.teamComms.refreshAnchors();
    sim.game.state.paused = true;
    room.match.absent.clear();
    room.match.setModeLimits();
    room.state.remainingSeconds = room.state.durationSeconds;
    for (const [sessionId, seat] of room.seats) {
      if (seat.actor) {
        room.lives.set(seat.id, seat.actor.lifeId);
        seat.loadout = seat.actor.loadout;
      }
      Object.assign(seat, {actor: null, ready: false, enabled: false, pending: false, waitId: seat.id,
        playerReady: false, epoch: seat.epoch + 1, deadline: room.clock.elapsedTime + MAP_LOAD_MS,
        lastSelect: 0, lastFire: 0, lastReload: 0, lastSampleTick: 0, lastShotStamp: 0, lastClassic: 0,
        trigger: false, aim: false, releaseInteract: false, interactUntil: 0});
      if (seat.connected) room.inputs.get(sessionId).clear();
      room.state.actors.set(seat.id, new ActorState({id: seat.id, sessionId, name: seat.name,
        team: seat.id.split('-')[0], connected: seat.connected, controlEpoch: seat.epoch}));
    }
    room.fillVacancies();
    room.project();
  } finally {
    room.changingMap = false;
  }
}
