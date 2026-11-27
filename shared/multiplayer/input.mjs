/** Foundation wire allowlist. Actor identity and dt never come from a payload.
 * Colyseus owns sequencing/buffering; this module validates a consumed frame.
 */
const axes = {forward: 1, strafe: 1, yaw: Math.PI, pitch: 1.49};
const buttons = ['jump', 'crouch', 'sneak', 'sprint', 'aim', 'fire', 'interact', 'reload'];
const slots = ['primary', 'pistol', 'knife'];
const fields = new Set([...Object.keys(axes), ...buttons, 'select']);

export function validateInput(frame) {
  if (!frame || typeof frame !== 'object' || Array.isArray(frame) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(frame))) throw new Error('Invalid input object');
  for (const key of Reflect.ownKeys(frame)) {
    if (!fields.has(key) || !('value' in Object.getOwnPropertyDescriptor(frame, key))) throw new Error('Unknown input field');
  }
  const input = {};
  for (const [key, bound] of Object.entries(axes)) {
    const value = frame[key];
    if (value === undefined) continue; // Missing orientation retains the actor's last aim.
    if (typeof value !== 'number' || !Number.isFinite(value) || Math.abs(value) > bound) throw new Error('Invalid input axis: ' + key);
    input[key] = value;
  }
  for (const key of buttons) {
    if (frame[key] === undefined) continue;
    if (typeof frame[key] !== 'boolean') throw new Error('Invalid input button: ' + key);
    input[key] = frame[key];
  }
  if (frame.select !== undefined) {
    if (!slots.includes(frame.select)) throw new Error('Invalid weapon selection');
    input.select = frame.select;
  }
  return input;
}

/** Trusted room code assigns seats; client-controlled actor IDs are never read. */
export class ControllerRegistry {
  #connections = new Map();
  constructor(game) { this.game = game; }
  bind(connectionId, actorId) {
    const actor = this.game.actors.find(a => a.id === actorId);
    if (typeof connectionId !== 'string' || !connectionId.length || connectionId.length > 128 ||
        this.#connections.has(connectionId) || [...this.#connections.values()].includes(actorId) ||
        actor?.controllerType !== 'human') throw new Error('Invalid controller ownership');
    this.#connections.set(connectionId, actorId);
  }
  unbind(connectionId) { this.#connections.delete(connectionId); }
  clear() { this.#connections.clear(); }
  collect(frames = new Map()) {
    if (!(frames instanceof Map) || frames.size > this.#connections.size) throw new Error('Invalid input batch');
    const inputs = new Map();
    for (const [connectionId, frame] of frames) {
      const actorId = this.#connections.get(connectionId);
      if (!actorId || this.game.actors.find(a => a.id === actorId)?.controllerType !== 'human') throw new Error('Unowned input');
      inputs.set(actorId, validateInput(frame));
    }
    return inputs;
  }
}
