# Multiplayer implementation

**Current: [Pass 2 — playable local two-player slice](network-slice.md).**
Foundation [PR #18](https://github.com/capstere/Cartridge-strike2/pull/18) was
reviewed with both CI jobs successful and merged as `20289c50`. Pass 2 starts
there and remains a separate, unmerged review PR. No public server is deployed.

The remainder records the original Foundation delivery and its historical
validation. Its next-pass instructions have been superseded by the explicit
Pass 2 assignment and the linked report.

## Pass 1 — shared authoritative foundation

Baseline: **7e917312831bb783c77c6425cc1c6174c9bc5f76**, latest main when this work
started on 2026-11-17. Branch: `feat/multiplayer-foundation`.
The planning package's older c794a03 baseline is not used. Only
`CartridgeStrike2_Multiplayer_Plan_V2/prompts/01_FOUNDATION.txt` is implemented.
The package and its original prototype ZIP remain unmodified.

**Foundation implemented and tested locally.** This branch adds a headless engine
boundary and a loopback framework test, not a playable network mode. Offline
Classic/Endless still launch through the existing app. The PR remains open for
review; no merge, Pages release, tunnel or public server is part of this pass.

## Delivered code

- `Game` accepts trusted `controllers: {actorId: 'human'|'bot'|'unoccupied'}` and
  `localPlayerId`. Omitting both retains the original local player, stable actor
  IDs, nine bots and autoplay behavior. Explicit assignments survive rounds and
  Endless respawns. A headless game has `localPlayerId:null` and no `isPlayer`.
- `Game.stepActors(Map<actorId,input>)` runs one existing fixed simulation step.
  `Game.update(dt,input)` retains the browser accumulator/catch-up limit. The
  authority calls only `stepActors`, never a nested `update`.
- `src/fps/movement.mjs` contains the original movement/capsule-body sweep, shared
  by `Game` and the prediction spike. Static collision still runs through the
  same physics/Octree/spatial indexes. `effects=false` suppresses sound/events and
  random rustle work during replay; it does not run combat, objectives or damage.
- PvP damage and precision no longer depend on which human is client-local.
  Existing local bot/neutral difficulty reductions, autoplay balance and bot
  firing budgets are retained. Independent human inputs set aim before firing.
- `shared/multiplayer/input.mjs` validates consumed frames and maps trusted
  connection IDs to assigned human actors. It rejects unknown keys, accessors,
  actor/position/dt/damage/moveWorld overrides, nonfinite/out-of-range numbers and
  unsupported commands. Forward/strafe are bounded to ±1, yaw to ±π, pitch to
  ±1.49. Senders must wrap yaw. Allowed buttons: jump/crouch/sneak/fire/interact/
  reload; selection: primary/pistol/knife. Game still validates ammo, cooldown,
  inventory, alive state, reload and damage. No generic method dispatch exists.
- `server/headless.mjs` loads only manifest-listed public maps from disk, defaulting
  to **floor5-prepared**, and creates a fresh world/Game/controller registry. Its
  source SHA-256 identifies the loaded JSON bytes; it is **not yet** the canonical
  collision/config/protocol handshake required by later passes. Missing input is
  neutral for that tick. No timer, connection buffer or custom replay queue exists
  in this boundary.

`unoccupied` currently means an existing offline roster actor with no controller;
its body remains in the 5v5 roster. This deliberately does not implement the online
roster/ruleset: pass 2 must expose only joined human seats and consistently disable
unsupported offline systems. No client can request controller reassignment.

## Ownership and import audit

[Static transitive import graph](imports.json): 63 modules, including vendored
Three/Yuka and the necessary furniture-editor runtime modules. Actual Node tests
construct both maps with no window/document/localStorage/WebGL context or renderer
shim. The registration hook resolves bare `three` to the same vendored module;
it does not install browser globals or substitute physics.

| Boundary | Concrete owners and remaining coupling |
| --- | --- |
| Game | Per-instance RNG, state, actors/inventories, events/serials, sound events, bot controllers, squad tactics, round candidates and pending damage. `team` still defines offline teammate/opponent bot difficulty; online bots are deferred. |
| World/physics | Fresh world owns source data, description, anchors, resolved scene, doors/leaves/elevators, glass, Octree, scratch vectors, dynamic/static boxes and spatial indexes. Physics query reuse from PR #14 is intact. |
| Navigation | Graph/nodes/edges, route cache, clearance cache, scratch arrays and glass-added links are allocated inside each `createNavigation`. Invalidation remains world-local. |
| Global source caches | `world.mjs` has an offline `sharedWorld` and a last-project world cache. `src/world.js` also caches its description. `project-scene.mjs` caches `floor5Baseline` with nested polygons/items. `fresh:true` now detaches the resolved project graph and bypasses the legacy description cache with a fresh source. Generated coordinate helpers close over the copied data. |
| Other caches | `zombie-sites.mjs` uses a WeakMap keyed by the world; each fresh world gets its own sites. Catalog Maps/constants are read-only inputs on this path, copied before room mutation. Yuka navigation and bot memory are instance-owned. |
| Browser-only helpers in shared imports | `floor-tape.mjs` has a lazy canvas tile; `glb-utils.mjs` has explicit IndexedDB helpers. Map parsing does not call either. GLB/texture/audio loaders and `render.mjs` are outside the headless import graph. Do not call authoring/presentation helpers in room construction. |
| app/presentation | App owns DOM, settings/localStorage, input, recoil, visibility/RAF, renderer/audio and one `Game.player`. `consumeEvents` can consume gameplay RNG for local recoil and writes local aim; TacticalControls writes ADS fields. These stay offline in this pass and must be routed through the session boundary before network play. |

### Measured isolation bug and fix

At the baseline, two `fresh:true` prepared worlds shared **11,930 nested objects**
across data/description/project/scene/anchors. After this change they share **0**
([measurement](isolation.json)). Tests mutate source polygons and scene entries,
open a door, break glass and move elevator panels in A, then verify B's data,
collision flags, navigation route and a newly constructed C remain unchanged.
Legacy fresh-world coordinate transforms and description objects are also tested.
This is an ownership correction, not a claimed frame-rate or memory improvement.

## Pinned framework decision

The installed versions, declarations and real loopback behavior were checked:

| Component | Selected version |
| --- | --- |
| Node LTS used for the framework spike / new CI job | 26.13.0 (`server/.node-version`) |
| Existing offline CI | Node 22, unchanged |
| `@colyseus/core` | 0.18.28 |
| `@colyseus/ws-transport` | 0.18.5 |
| `@colyseus/schema` | 5.0.49 |
| `@colyseus/sdk` | 0.18.10, development dependency for the spike |
| Express transport peer | 5.3.0 |

`server/package-lock.json` locks the complete tree. `npm ci --prefix server
--ignore-scripts` succeeds on macOS ARM64; npm reported zero known vulnerabilities
at installation. Linux ARM64/Pi install/runtime is **NOT RUN**. The existing Node
22 job remains an offline compatibility gate; the new bounded PR/manual job uses
the pinned LTS. Main retains fast tests without duplicate dependency/browser runs,
PR cancellation policy and opt-in mobile pacing from #16–#17.

**Decision: keep the framework's input, clock, prediction and rewind owners.**
The loopback-only test in `server/test/colyseus-api.test.mjs` proves:

1. `schema()`/`t.*`, `Room.defineInput` with bounded buffer and sequence dedupe,
   `setFixedTimestep(callback,60)`, and 50 ms state patches work with the pinned SDK.
2. Exactly one `.inputs.get(sessionId).next()` is consumed per client per shared
   world step. Never drain several frames then advance everyone once, or call
   `Game.update` inside the fixed callback. 60 engine steps advance exactly 1 second.
3. `room.input({mode:'reliable'})` receives the server's 1/60 second contract.
   `Predict.get(...).sim({world,step,adopt,pose})` runs the shared capsule movement
   immediately, adopts a deliberately corrected server pose, and replays **two**
   pending frames when the test deliberately holds partial acknowledgements.
4. `allowRewindState({maxRewindMs:150})`, `.attach` and `.at` provide bounded,
   read-only historical scalar access. This is an API check, **not** lag-compensated
   combat: door/glass history, life boundaries and hitbox rewind are not implemented.
5. Duplicate declared sequences are discarded; a NaN frame is rejected by the
   application validator without poisoning position or stopping the server clock.

Concrete adapter details: the Game object graph is not a flat Schema and contains
methods, bot references, graphs and Infinity ammo/deadlines. Use a compact schema
projection plus `Predict.sim`'s engine-backed callbacks, not serialization of Game.
Schema fields live behind accessors; project known fields by name before strict
plain-frame validation. The framework sanitizer *clamps* malformed values rather
than rejecting them; strict domain rejection therefore remains an application
boundary. None of these requires replacing the framework's replay queue.
The spike is test-only and binds an ephemeral port on **127.0.0.1**.

Sources checked: [server fixed input](https://docs.colyseus.io/netcode/server-input),
[engine-backed prediction](https://docs.colyseus.io/netcode/client-prediction),
[rewind API](https://docs.colyseus.io/netcode/lag-compensation),
[Node 26.13.0 LTS](https://nodejs.org/en/blog/release/v26.13.0), plus the installed
package source/declarations exercised by the test. Node 26 emits a deprecation
warning for the existing async module registration API; it does not affect these
checks. A future loader migration can be separate from the engine changes.

## Proposed session interface from actual consumers

This is a pass-2 contract, **not** a placeholder NetworkSession implementation.
The browser app remains wired to Game in pass 1 to avoid a broad presentation
rewrite before the protocol exists.

| Contract | Actual consumer / LocalSession behavior | Required NetworkSession behavior in pass 2 |
| --- | --- | --- |
| `view`, `world`, `localPlayerId` | Renderer.render/events, HUD, minimap, CombatHUD, GrenadeAssist, AudioSystem, viewActor use actors, hostages/residents, bomb/projectiles, inventory, phase/time and physical queries | Read-only compatible presentation projection; predicted local pose, interpolated remote poses; no remote BotController or rule ticking |
| `advanceFrame(dt,input)` | app.frame calls Game.update under RenderBudget; tactical/recoil currently alter player fields | SDK Predict/input handle owns fixed input generation and replay; rendering cannot advance room time |
| `command(type,value)` | keyboard/touch/shop call reload/select/drop/buy/radio; TacticalControls cycles weapons/auto-reloads and writes ADS | Whitelist supported actions with IDs; reject unsupported shop/radio/grenades; ADS must become validated input, not client-written damage state |
| `drainEvents()` | consumeEvents feeds renderer, audio, HUD, recoil and killfeed | Bounded, deduplicated authoritative events with life/action IDs; cosmetic prediction reconciled separately; recoil must not consume authoritative RNG |
| `setInputEnabled(bool)` | pause/buy/blur/orientation/visibility clear input and call Game.pause, audio.reset | Clear input only; never pause the room. Preserve #16's pointer/orientation cleanup and audio lifecycle |
| `start/restart/leave/dispose` | app.start creates Game, newMatch pauses/reset/lobby, pagehide disposes renderer | Explicit join/leave/ready/reset generation; local restart cannot reset a room; cancel callbacks/queues on leave |
| `capabilities`, `settings` | settings mutate difficulty, friendlyFire, wanderers; reticleTarget provides local mobile auto-fire | Server rules/capabilities; local graphics/audio only. Disable online assists/unsupported systems consistently |

Network display names must use text rendering; current scoreboard/killfeed HTML
is safe only for its bundled offline labels. Do not reuse that path for untrusted
names. Keep current saved character compatibility offline; no private asset upload
is added here. Full handshake, roster changes, lifeId, reconnect and stale-input
policy belong to the explicitly authorized next pass.

## Evidence and reproduction

Local environment: macOS / Apple M1 ARM64, Node 26.0.0 for existing core/browser
commands and Node 26.13.0 for the framework test. Chromium uses browser/device
emulation; no physical phone, Raspberry Pi or external player/network was used.

| Evidence | Status |
| --- | --- |
| Core unit/simulation regression, including 12 new foundation cases | PASS, 208 tests |
| Headless manifest/map construction and room/Game isolation | PASS, actual Node construction of synthetic-demo and floor5-prepared |
| Offline before/after deterministic trace | PASS, eight identical hashes across 9,600 steps |
| Pinned framework with one real Node SDK over loopback WebSocket | PASS, fixed-step/ack/prediction/replay/rewind API spike |
| Runtime manifest and prepared-map traversal | PASS, 460 files; 102 traversals |
| Desktop/touch browser smoke, match-flow, mobile ownership/rotation | PASS, 844×390 and 932×430 touch emulation |
| Repeated match/lobby lifecycle and objective routes | See validation.json for the recorded run results |
| Two browser clients in a network match, latency/loss, online combat | NOT RUN / not implemented: pass 2 onward |
| Physical iPhone/Android, Pi/Linux ARM64, real-network/thermal/load | NOT RUN |
| Public deployment and merge | NOT RUN / outside this request |

[Before trace](replay-before.json) and [after trace](replay-after.json) include
construction/whole-trace wall times for reproducibility. They are single samples
with JIT/GC/system-load variation; **no performance gain is claimed**. Hashes omit
only BotController objects (cyclic/internal state) and the new controllerType
metadata; all recorded state and drained events otherwise match. This is bounded
regression evidence, not proof of cross-platform determinism or online prediction
through dynamic doors. [Validation record](validation.json).

Run from the repository root:

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/foundation-replay.mjs
# Use Node 26.13.0 for the dependency spike (via your preferred version manager).
npm ci --prefix server --ignore-scripts
npm test --prefix server
```

For browser checks, install the existing locked Chromium tooling, serve the root
with `python3 -m http.server 8765 --bind 127.0.0.1` in another terminal, then run
`node tools/mobile-smoke.cjs`, `node tools/match-flow-browser.mjs`,
`node tools/mobile-reliability-browser.mjs`, `node tools/match-lifecycle-browser.mjs`
and `node tools/player-routes-browser.mjs`.

Observed implementation failures were fixed: cloning legacy generated data initially
failed on two coordinate functions (now rebound to copied geometry); the first
spike incorrectly expected an adopt even without divergence (now injects an actual
correction and proves replay with pending inputs). No headless construction blocker
remains. Review/merge this foundation before separately authorizing
`prompts/02_NETWORK_SLICE.txt`; it was read for context but not executed.
The existing physical-mobile backlog remains open in HANDOVER.md.
