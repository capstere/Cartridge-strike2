# Content registry and map pipeline

Use existing manifests and validation where feasible, not a parallel editor. Stable IDs (not translated labels) + versioned JSON schema or equivalent validation. New registries should reference original assets by digest, allowed scope and attribution; asset loading ownership/disposal declared. Registry version/build digest gates online compatibility. Private user content stays on device unless approved by server; no upload of owner-private files or copyrighted reference screenshots into public repo.

| Registry | Required fields / validation |
| --- | --- |
| Character / rig / animation | id, version, GLB hash/path, axes, skeleton signature, semantic clip mapping, outfit/team, first-person material hints, fallback, limits; use character-runtime-contract.mjs and existing IndexedDB path; validate embedded GLB size/geometry/textures, animation coverage and rig compatibility. |
| Outfits | character/rig compatibility, appearance/materials, allowed team, preview, unlock rule; no hidden gameplay advantage. |
| Weapons / attachments / equipment | stable IDs, model/pose anchors, shared stats, compatible slots/mutual exclusions, timing, audio events, icon, mode availability, cost, server validation. Validate derived stats and Classic buy rules. |
| Bonus / mode / bot | effect IDs and config, eligibility, state schema, duration/threshold, mode-specific rules, bounded bot profile; shared server authority. |
| Audio / UI / progression | event IDs/channel/priority, asset variant rights and size, localized keys, theme tokens; challenge/XP definitions and idempotent server events. |
| Maps | id/schema/asset version, bounds, coordinate convention, spawn teams, zones/objectives, collision/nav hashes, minimap, preview, atmosphere and mode capability; deterministic compile and independent server/client equality. |

## Map import plan
Retain floor5-prepared and compact-arena; preserve LevelProject/editor compatibility. Verify source map definitions and candidate rights against pinned reference. Investigate Khamsin, Val-Blanc, Kervénec, Hortus, Meltem, Tephra, Stratus, Simoun, French Dream. Proposed first representative vertical slice: Meltem (small in screenshots) or alternate if geometry/vertical complexity is lower after analysis. Use 02-map.js collision primitives (boxC/ramp/groundHeight/rayWorld), 02a-kit.js geometry, 02z-load.js mapSetup, 09a-loading.js map lifecycle. Build adapter/exporter producing canonical collision solids, ramps, heights/holes, doors/glass, spawns/zones, nav graph and render asset references; do not parse geometry only as collision approximation. Preserve coordinate transforms. For stacked floors, terrain and voids, validate multilevel solver and authoritative falls; Stratus likely hardest (islands/bridges/void). Add maps one by one only when complete:
1. Register source/rights and deterministic export; verify hash equality with build-network.mjs map contract.
2. Check bounds, safe spawn, all required route pairs, obstacles/line-of-sight, floors/void, objective feasibility, minimap alignment. Dynamic collision affects shared simulation; cosmetic physics never blocks secretly.
3. Run full offline and online supported-mode matches with bots/humans; two clients same map; reconnect/map swap/rematch; disposal and load time/memory/CPU budget. Missing objective rules means mode unavailable with explanatory label, not a broken mode.
4. Generate thumbnail from actual game camera and English label; menu registry and random selection only approved maps. 
Use map IDs independent of translated names. Original maps retain gameplay. Treat entire nine-map inventory as workstream, not claim all immediately portable; document each blocker/alternative and evidence.

## Future import workflow
CLI/GUI reuse existing tools: validate input→normalize axes/rig/metadata→optimize asset within measured budget→generate preview→register stable ID→validate content/build manifest→run compatibility smoke→review and commit. Provide example content packages for one existing character, attachment, map, bonus and mode; no fake runnable assets in preparation. Include schema docs, error messages, tests and non-destructive migration. Retain licenses/riposte-MIT.txt, NOTICE and per-asset credits; licensed texture/audio assets only; original names/branding, music, animation assets. Source reference not runtime dependency.
