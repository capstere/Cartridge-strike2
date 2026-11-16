# Codex architecture contract

Status: proposed implementation, not existing code. Audit baseline is c794a0331e4d3d34cd3d0a01daba0804e14adce3. Reconcile paths against current main before editing.

## Ownership and module boundary

Keep the current renderer, audio, HUD, asset pipeline and offline modes. Introduce an adapter boundary (proposed names: LocalSession and NetworkSession) exposing the view-state/actions required by app.mjs. Enumerate its actual consumers before designing it. Do not serialize the entire Game instance, bot objects, navigation graphs, Three meshes or inventory values containing Infinity.

The server owns gameplay. Each room owns a fresh Game/world and controller registry. A connection maps to an actor on the server; client actorId never grants ownership. Replace one-human assumptions with human/bot/unoccupied controllers and input keyed by actorId. Derive localPlayerId on each client. Preserve the existing offline one-human path. Independent room RNG/state/events; no module-global mutable world shared between matches.

Extract the smallest reusable movement/combat kernel from existing code, preserving behaviour. Shared math/Three geometry in Node is acceptable. Do not run a browser renderer on the server. Prove imports and actual world construction without window/document/localStorage/WebGL. Avoid a full engine rewrite and avoid copying functions into divergent server/client implementations.

Suggested boundaries (adapt to actual conventions):
- shared/multiplayer/: protocol schema/version, canonical input, movement kernel, map manifest contract.
- server/: Colyseus bootstrap, room, controller ownership, authoritative world, metrics and deployment.
- src/fps/network/: transport, state adapter, prediction/reconciliation, remote interpolation.
- tests/tools and docs/multiplayer/: integration harness, measurements, runbooks.

## Framework decision gate

Colyseus 0.18 official docs expose defineInput, setFixedTimestep, client prediction/reconciliation and lag compensation. Prefer a small proven integration of those facilities over inventing a second netcode stack. The old archive pins server 0.18.12 and SDK 0.18.10 but does not demonstrate their install/runtime compatibility. Verify the selected exact server/SDK versions, API signatures, Node support and ARM64 install; commit lockfiles. Documentation for a minor version is not proof every patch has identical APIs.

Choose one coherent input/reconciliation owner. Do not combine framework-managed input with a second custom replay queue. If the current Game representation cannot use framework prediction cleanly, document the concrete mismatch and implement a bounded custom adapter with equivalent tests. Do not let a speculative framework conversion absorb the whole project.

## Clock and wire contract

Use the game's existing 60 Hz simulation as initial target; make server/client prediction use identical fixed dt. Start with 20 Hz state patches and input frames generated at sim rate, batched for transport as supported by the verified SDK. Rendering stays independent. Avoid a nested Game.update accumulator inside a framework fixed tick: exactly one authority advances simulation. Measure CPU before changing tick rate. If 30 Hz is needed, change and validate both sides, movement and combat; do not silently downgrade server only.

Logical fields below are requirements, not promises about SDK field names:

| Flow | Required semantics |
| --- | --- |
| Handshake | protocolVersion, build compatibility, mapId/mapHash, simulation config hash; reject mismatch before spawning |
| Join/create | server-issued roomId, explicit join-existing, cap, private access token/code, sanitized displayName; full room must not silently create another match |
| Input | increasing sequence/tick, finite bounded axes and view angles, action edges/IDs, bounded queue and rate; no client dt/position/damage/moveWorld |
| Authoritative state | tick/time, local input acknowledgement, actor IDs, position/velocity/stance/lifeId, HP/ammo/weapon/reload, team/score, current world revision |
| World state | stable door IDs/poses, glass broken set, elevator state when enabled; complete current state on late join |
| Events | unique eventId, server tick, actorId/lifeId, action/shot association, type and bounded payload; deduplicate audio, recoil, FX and damage display |
| Disconnect/rejoin | authenticated session/seat identity, bounded grace, neutral input, full current state, invalidation of stale callbacks and old buffers |

Movement is predicted immediately on the local client using shared collision/movement code. On authoritative acknowledgement restore authoritative state and replay only unacknowledged input. Smooth presentation corrections separately from simulation truth. Remote players interpolate between timestamped states, initially around 100 ms behind server time, adjustable after measurement; cap extrapolation and visibly handle stale connections.

Respawn, reconnect, teleport and round reset are discontinuities. Increment lifeId/reset generation, clear prior input/event/interpolation history and snap appropriately. Do not lerp a player through walls from a death location to a spawn.

Prediction must not repeat authoritative side effects. Replay cannot produce another shot sound, consume ammo again, score a kill or break glass. Predicted muzzle/recoil feedback is cosmetic and reconciled by actionId; hit confirmations come from server.

## Combat

Start with one shared weapon (Pulse SMG is a proposed default), normal existing damage, ammo, reload and fire intervals. All humans use equal PvP rules. Disable mobile auto-aim/auto-fire online initially; later make assists an explicit server ruleset.

Queue actions and process them in the simulation tick with associated validated orientation. For automatic fire, enforce held input/cadence server-side; for edge actions prevent duplicates. Server validates alive state, weapon ownership, cooldown, reload and ammo. No client hit claims.

Before internet FPS acceptance implement bounded hitscan rewind with server-validated clock mapping and maximum history (initial proposal: 150–200 ms, tune). Rewind target hitboxes and relevant door/glass state consistently; reject timestamps outside accepted bounds. Use server history and current authoritative ammo/cooldown, never a client-selected shooter origin. If dynamic-world history is not implemented, keep a clearly documented static-world combat gate until it is; do not claim full lag compensation through changing doors/glass. Test occlusion, simultaneous kills and old-life packets. Rewind is an implementation step, not permission for a client to pick any past state.

## Maps and assets

First smoke map: existing synthetic-demo. Final pilot map: levels/floor5-prepared.json, currently the manifest default. Do not accidentally use createWorld() without the prepared LevelProject and call that the current map.

Generate/load collision and gameplay from the same validated canonical data on both sides. Hash the map and collision-affecting config, not only the visual GLB. Never upload geometry, skeleton matrices or full maps each tick. Static assets stay in HTTP/cache. Initial clients choose from approved bundled avatars; private device-local GLB designs remain offline until a separate publishing/validation pipeline exists.

For early transport tests use explicitly fixed door/elevator poses and intact, non-breakable glass on both sides. Ensure routes/spawns remain reachable. Before the Floor 5 pilot gate restore required dynamic doors/elevators and synchronize authoritative state; add breakable glass with history in the next combat gate or keep it visibly disabled in this MVP. Never allow local-only breaking.

## Scope and lifecycle

Pilot: private 2-player match, then 4, then measured 10 (5v5), one map, one weapon, teams, scoring and respawn. No bots, residents/wanderers/zombies, bomb, hostages, economy or grenades in the first online ruleset. Disable those consistently at server, client and HUD; do not delete offline features. Select safe available spawns and define spawn protection that cancels on firing.

Online Escape/buy/settings/backgrounding stops local input only. Match continues, player remains vulnerable. Returning to lobby leaves the room; no client-side restart of everyone else's match. A reconnect may retain the same actor/score within a defined grace (proposed 15 s); after it expires use explicit rejoin. Reconnect must not duplicate actor, score or spawn protection. Paused clients cannot hold fire or interactions indefinitely.

Initially one Node process and one private active room is sufficient. Nevertheless prove mutable-world room isolation using two test rooms. Add room caps before exposure. Redis, horizontal scaling, accounts, ranked matchmaking, voice chat, durable statistics and asset upload are out of scope.
