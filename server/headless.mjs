import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createWorld} from '../src/fps/world.mjs';
import {Game, CONFIG} from '../src/fps/game.mjs';
import {ControllerRegistry} from '../shared/multiplayer/input.mjs';

import {networkMap} from '../shared/multiplayer/maps.mjs';

const root = new URL('../', import.meta.url);
const preparedMaps = new Map();

/** Load the actual manifest-selected LevelProject, never the legacy fallback. */
export async function loadHeadlessWorld(mapId) {
  const manifest = JSON.parse(await readFile(new URL('levels/manifest.json', root), 'utf8'));
  const entry = manifest.levels.find(level => level.id === (mapId ?? manifest.defaultLevel));
  if (!entry || !/^levels\/[a-z0-9-]+\.json$/.test(entry.file)) throw new Error('Unknown public map');
  const bytes = await readFile(new URL(entry.file, root));
  const sourceHash = createHash('sha256').update(bytes).digest('hex');
  // Cache immutable navigation templates for approved maps; all live door,
  // glass and actor state belongs to the newly constructed world.
  const approved = networkMap(entry.id);
  if (approved && entry.file !== approved.file) throw Error('Unexpected map source.');
  const cached = preparedMaps.get(entry.id);
  const template = approved ? (cached?.sourceHash === sourceHash ? cached : {sourceHash}) : null;
  const world = createWorld({levelProject: JSON.parse(bytes), fresh: true, template});
  if (template) preparedMaps.set(entry.id, template);
  return {world, mapId: entry.id, sourceHash};
}

/** Framework calls tick exactly once per fixed step. No timer or accumulator here.
 * This is an engine boundary, not a network ruleset or public server.
 */
export class AuthoritativeSimulation {
  constructor(game) {
    if (game.config.fixedStep !== CONFIG.fixedStep) throw new Error('Foundation requires the shared 60 Hz step');
    this.game = game;
    this.controllers = new ControllerRegistry(game);
    this.tickNumber = 0;
  }
  tick(frames = new Map()) {
    const inputs = this.controllers.collect(frames);
    if (!this.game.state.paused && ['buy', 'active'].includes(this.game.phase)) {
      for (const [id, input] of inputs) {
        const actor = this.game.actors.find(a => a.id === id);
        if (input.select) this.game.select(input.select, actor);
      }
    }
    this.game.stepActors(inputs);
    this.tickNumber++;
    return this.game.drainEvents();
  }
}

export async function createHeadlessSimulation({mapId, seed = 42, controllers = {}, config = {}} = {}) {
  const loaded = await loadHeadlessWorld(mapId);
  const game = new Game(loaded.world, {seed, controllers, localPlayerId: null, config}).start();
  return Object.assign(new AuthoritativeSimulation(game), {mapId: loaded.mapId, sourceHash: loaded.sourceHash});
}
