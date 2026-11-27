# Target architecture and interface ownership

**Decision:** evolutionary CS3 on existing engine, with replaceable presentation and content adapters. Compare a representative vertical slice with upstream before any major engine replacement. Full Riposte fork would regress dedicated authority, custom map/GLB contracts and deployment; wholesale replacement requires an explicit compatibility proof.

| Layer | Ownership and interface |
| --- | --- |
| Shared simulation | src/fps/game.mjs Game, config.mjs, movement.mjs, action rules; fixed 60 Hz step, deterministic time/RNG, authoritative events. New modules for bonus/mode logic consumed here and server/headless.mjs. No DOM, GPU or socket dependence in rules. |
| Server authority | server/network-room.mjs, room-world, match-lifecycle, classic-round, network-schema, lag-compensation; server owns admission, actor identity/life/match generation, damage, phase, settings, validated content and rewards. |
| Transport | shared/multiplayer/input.mjs, protocol.mjs, rules.mjs, build.mjs, maps.mjs; use one versioned schema and build identity. Extend explicit sprint/slide/bonus semantics only with compatibility tests. Reject mismatched builds, stale epochs, invalid input. |
| Client gameplay | app.mjs orchestrates; network/session.mjs predicts/reconciles using shared moveActor. Input adapters issue normalized commands; no duplicate damage or economy. Separate confirmed events from predicted cosmetics; dedup by match/life/event ID. |
| Presentation | render.mjs/render-engine.mjs, models.mjs, existing asset/animation modules. Consume read-only actor state; scene ownership and disposal; no game-rule writes. Animation adapter translates canonical intent to rig, separate viewmodel and body. |
| UI | fps/ plus new narrowly scoped UI modules; single navigation state, English catalog, action adapter (lobby/match/settings), no direct mutation of room authoritative fields. Preview scenes lazily built/disposed, keyboard/touch/gamepad focus. |
| Audio | event registry with ID, surface, spatial mode, channel, priority and variant; separate bot hearing simulation from played effects. |
| Content | typed validated registries, stable identifiers, versioned schemas, runtime asset/collision manifests. Offline local imports stay private; online accepts only server-approved content. |
| Accounts | separate server service/repository, durable store outside release (proposed SQLite if available and verified), session/identity distinct from temporary actor seats; authorization before room admission. |

## Proposed contracts to finalize CS3-00
- Input frame: retain lifeId/controlEpoch/sampleTick/fireId/reloadId; add explicit sprint intent/slide edge with sequence validation; no client-reported movement speed or immunity. Prediction shares modifiers and reconciliation history; reconcile by authoritative tick. 
- Animation intent: actor ID, life generation, mode/phase, normalized move vector, actual velocity, ground/crouch/sprint/slide/aim blend, weapon/action, start/end tick, reload timing, hit/death event. Adapter maps logical clips to rig; fallback safe, not silent fake completion.
- Combat events: stable event ID, match, source life/epoch/team, damage kind, effect-at-emission provenance, target and confirmed time. Bonus/XP consume only server-validated events.
- Map contract: canonical bounds, coordinate convention Y-up/meters, collision solids/ramps/heights/doors/glass, spawn/zone/objective/nav/minimap + hashes, allowed modes, asset dependencies. Render/physics generated from same approved manifest.
- Versioned settings, content and storage migration. Retain stable CS2 IDs, backup original data; reject unknown mandatory schema versions, allow forward-compatible optional fields.
- Stable English error codes with locale catalog; server logs internal details privately, UI receives safe translated message key.

Do not couple cosmetic Ragdoll or outfit state to authoritative collision; if joint hitboxes implemented, first prove deterministic reconstruction/rewind and load. Radar visibility is not merely a UI toggle: inspect Colyseus replication; current room actors can already expose positions to clients. Scope privacy realistically, add interest filtering where required; never promise anti-wallhack merely by hiding HUD. Measure overhead and keep server authority. Phase gate, feature flags and package dependency contracts prevent parallel writers to app.mjs/game.mjs/network schema. Existing deployment uses versioned stage/activate/rollback; retain that infrastructure.
