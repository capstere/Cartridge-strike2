# Dependency-aware implementation roadmap

The owner approved the preparation and opened CS3-00. Live package status is in [the task manifest](tasks.json). A package can start only after its listed dependencies are VERIFIED. A BLOCKED record carries evidence and a recovery action. CS3-00 specifies interfaces on paper. Their first consumer owns the minimal implementation and a working fixture. CS3-11 consolidates those proven interfaces.

Use the [media evidence](RECORDING_REVIEW.md), [screenshot and English gates](UI_UX_SPECIFICATION.md) and [source review](SOURCE_REVIEW.md) at each visual exit. Frontend delivers the solo navigation and class-picker mount in 01, gameplay the CR4/P9 Rush slice in 02, wardrobe in 03 and the complete configurable touch layout in 06. For 02 the mobile specialist supplies the first real sprint gesture on existing controls and the backend specialist owns the matching input/pose contract. Do a rendered two-client check before expanding the slice to every held object. One writer per integration path and one heavy Pi job at a time.

## CS3-00 — Baseline, backup, architecture

- Lead delegate: performance + reference-integration + lead
- Dependencies: Preparation approval
- Scope / reference / file ownership: Read-only runtime and deployment inspection. Lead owns baseline, backup receipts and versioned contract designs in development evidence.
- Implementation: Recheck live/recovery identity and privately rehearse restore. Compare playable CS2 and vendored Frontline. Record source hashes, steady and worst-case measurements, input/action, map, inventory, access and English contracts. Inventory release files versus browser allowlist and Pages publishing root.
- Verification: Existing tests; reproducible scenarios; exact SHA, sanitized backup receipt and review of contract
- Exit evidence: Verified backup/isolated restore, comparable baselines and signed-off interface designs. A missing prerequisite is BLOCKED and keeps dependents pending.

## CS3-01 — English frontend and navigation

- Lead delegate: frontend
- Dependencies: CS3-00
- Scope / reference / file ownership: Frontend owns fps/, ui/ and the English catalog, lead coordinates root entry/credits, app and match-flow. Backend owns pre-auth form/error keys. Follow 09e-menus and 09ea-liste.
- Implementation: Design system; en catalog; main/Play/Solo/With Friends, options, map cards, roster, countdown, news; real solo and private lobby actions; placeholder routes explicitly disabled pending 03/04/09/10.
- Verification: IMG_8150, 8158, 8160–8162 and 8164, V1 countdown, English guest Pages and denied/authorized Pi routes. Provide class-picker navigation for later class/wardrobe owners. Exercise real loading, Classic buy success/failure and re-login after translation.
- Exit evidence: Menu→match→results real flows; stable back/resize/focus.

## CS3-02 — FPS feel, movement, Rush and combat audio

- Lead delegate: gameplay (lead writer), audio, mobile-input, multiplayer-backend
- Dependencies: CS3-00
- Scope / reference / file ownership: movement.mjs, game.mjs via lead, models.mjs, presentation-*, strike-kit-*, reload-foley.mjs, shared input/protocol + server schema via multiplayer; ref 06-weapons, 06c-models, 07c-controller, 08-player, 06d-reload, 05a-sfx
- Implementation: First prove CR4 and P9 hip → Rush → release/ADS/short fire in both normal input paths and under reconciliation. Extend to slide, reload/inspect/switch, grenade hold/return and remaining held models. Preserve manual/auto-fire and saved bindings.
- Verification: RECORDING_REVIEW V2/V4/V6, input tick → legal shot → ammo/FX, near/far A/V onset, pause/cancel. Use view-arms-capture, recoil-autofire, online-equipment and the sprint-reload reticle fixture.
- Exit evidence: Readable camera and grips, distinct supported poses, no lost tap or duplicate shot/foley. Fixed-step client/server/offline trace and synchronized video per weapon family.

## CS3-03 — Character animation and wardrobe

- Lead delegate: gameplay + graphics-assets
- Dependencies: CS3-00, CS3-01, CS3-02
- Scope / reference / file ownership: character-runtime-contract.mjs, character-actors.mjs, character-library.mjs, models.mjs adapter, view-character-appearance.mjs; frontend mounts wardrobe; ref 06ac-loco, 06g-body, 06h-ragdoll, 09u-tenues
- Implementation: Canonical rig adapter, existing GLB, directional blending, IK, death/ragdoll visual and LOD; outfit previews, original skins; separately assess joint hitboxes.
- Verification: saved-character-browser, view-grips, view-character-appearance, headshot-landing; rig fixtures/video
- Exit evidence: Existing imports and arms matching; visual/authority separation.

## CS3-04 — Multiplayer access and account persistence

- Lead delegate: multiplayer-backend
- Dependencies: CS3-00, CS3-01
- Scope / reference / file ownership: server/access.mjs,pilot-access.mjs,local-server.mjs,family-room.mjs, network/session.mjs, new account modules; frontend mounts profile; ref 09j-compte UI only
- Implementation: Scoped remembered sessions, invite link/QR/short code, migration, optional accounts/recovery/stats storage, secure public listing behind off-by-default flag.
- Verification: network-family-browser, network-pilot-browser, security/expiry/revoke/replay tests, migration/restore. Verify guest Pages flow separately from Pi pilot proof, room proof and account identity.
- Exit evidence: Two-client old and new access, private credentials protected, real persistent accounts.

## CS3-05 — Authoritative killstreaks

- Lead delegate: multiplayer-backend + gameplay
- Dependencies: CS3-00, CS3-02
- Scope / reference / file ownership: game.mjs, config.mjs, new pure streak module, movement, server/network-room.mjs/network-schema.mjs, shared protocol, session, combat-hud/minimap; ref 08b-killstreaks
- Implementation: Implement dedicated spec 3/5/8 and 15/15/8; shared pure transitions, kill attribution, authoritative command and own radar, HUD/action binding, audio.
- Verification: state tests, invalid input cases, two-client online, offline parity, delayed projectiles, exact durations. Split-screen observer/recipient check on a fresh join and reconnect, including mixed assist/kill/headshot signals.
- Exit evidence: All bonus rules proven, no unauthorized activation/stacking; UI confirmed.

## CS3-06 — Mobile layout and gamepad

- Lead delegate: mobile-input
- Dependencies: CS3-01, CS3-02, CS3-05
- Scope / reference / file ownership: mobile-controls.mjs,tactical-controls.mjs,ui/cs-mobile.mjs, HUD and shared input; ref 09q,09qb,09qc,09qd,08a-binds,09r-pwa
- Implementation: Finish saved fixed/floating layouts, auto/on/off touch UI, stick-threshold or Run button, look while firing, tap/hold ADS, optional double-tap and fire-on-release, sprint+crouch, manual throw, bonuses, gamepad and PWA.
- Verification: Replay V2/V4/V6 and IMG_8153–8157 profiles, three pointers, HUD and cancel/rotation; mobile-input-ownership, mobile-reliability-browser and online-autofire-browser. Record hardware/emulation separately.
- Exit evidence: Simultaneous controls, rotation, no stuck input, no key conflicts; physical status explicit.

## CS3-07 — Graphics, audio environments and map pipeline

- Lead delegate: graphics-assets + audio
- Dependencies: CS3-00
- Scope / reference / file ownership: levels/*, level-adapter.mjs, world.mjs, shared maps/collision/map-build, render/materials/props, audio registry; ref 02-map,02a-kit,02c-materials,02z-load,09a-loading,04b-physprops,05c-ambiance
- Implementation: Baseline visual pass, reference map adapter and Meltem or lower-risk pilot; validated additional maps, all nine assessed, environment FX and ambience; LOD/disposal.
- Verification: build-network --check, compact-arena/owner-door-traversal tests, multimap-browser/recovery, asset-memory and complete matches
- Exit evidence: Original maps preserved. All nine have a source ID, capability assessment and explicit disposition. Each offered map passes versioned collision/nav/void, mode eligibility, spawn, lifecycle and measured budget.

## CS3-08 — Bots and navigation

- Lead delegate: ai-navigation
- Dependencies: CS3-00, CS3-02, CS3-07
- Scope / reference / file ownership: bots.mjs,bot-tactics.mjs,navigation.mjs,world/room-world via map owner; ref 03-nav,07-bots,07b-tactics,07d-squad,07e-humain
- Implementation: Measure navigation tails, bounded route budgets, fair perception, cover, personalities/squad, objective preservation and multilevel routes.
- Verification: bot-tactics tests/scenarios/browser, network-load, Classic objectives, room startup
- Exit evidence: Improved natural behavior and measured tick tails without rule degradation.

## CS3-09 — Classes, arsenal and attachments

- Lead delegate: gameplay + frontend
- Dependencies: CS3-01, CS3-03, CS3-04
- Scope / reference / file ownership: config.mjs, action-rules, class/weapon registry, server/classic-round.mjs, models adapters, profile storage; ref 06p-accessoires,06q-camos,06r-arsenal,09n-armurerie,09o-vitrine
- Implementation: Presets/custom slots, primary/secondary/equipment/attachments/optics/camos, derived stats, real preview, server validation and Classic purchases; persistence.
- Verification: online-classic/equipment, illegal loadout tests, preview lifecycle, profile restart
- Exit evidence: No purchase bypass, correct stats and saved real loadouts. Use an explicitly seeded entitlement fixture for locked/unlocked states until CS3-10 supplies earned progression.

## CS3-10 — Replay, modes, match presentation and progression

- Lead delegate: multiplayer-backend + gameplay + frontend
- Dependencies: CS3-04, CS3-05, CS3-07, CS3-08, CS3-09
- Scope / reference / file ownership: game.mjs mode interfaces, match-lifecycle, session, combat-hud/match-flow, account storage; ref 09b-killcam,09i-modes,09l-fin,09y-decompte,06r-arsenal,06s-defis
- Implementation: Bounded filtered killcam/final replay, spectator, scoreboard/results, FFA and Domination, server XP/challenges/unlocks; preserve existing modes.
- Verification: match-lifecycle-browser, online-match/classic, replay, FFA/domination win rules, trusted XP idempotency. V5 killer card → scoped replay → legal respawn or Classic spectator, skip/timeout/disconnect and clean local HUD; V6 assist, kill and headshot credit exactly once.
- Exit evidence: Real replays, new modes verified, no information leaks or double rewards.

## CS3-11 — Future content extensibility

- Lead delegate: reference-integration + graphics-assets + lead
- Dependencies: CS3-03, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10
- Scope / reference / file ownership: registries, manifests, validation/import/thumbnail tools, docs; extend existing runtime contracts
- Implementation: Consolidate versioned registries, examples, migration, validated additions for character/rig/weapon/attachment/map/mode/bonus/audio/outfit/bot/theme/progression; no parallel editor.
- Verification: schema negative/positive tests, import sample and runtime smoke, build reproducibility
- Exit evidence: Adding example content without unrelated gameplay edits. New registries reference the already exercised interfaces and include a build/allowlist closure check.

## CS3-12 — Final integration, staging and release

- Lead delegate: lead + performance + reviewer
- Dependencies: CS3-01, CS3-02, CS3-03, CS3-04, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10, CS3-11
- Scope / reference / file ownership: all reviewed integration, deployment tools and release manifest
- Implementation: Full acceptance, hardware/physical status, security, before-after, backup restore rehearsal, stage exact SHA; release on idle Pi via existing process only after authorized gates.
- Verification: all CI, server tests, rendered two-client HTTPS/WSS, long soak, migration rollback rehearsal. All 16 screenshot states and all five recording scenarios, English journey sweep, reference-free distribution inventory, authenticated/unauthenticated HTTP and mixed-version reconnect, clean cached and cold clients on both surfaces.
- Exit evidence: Independent reviewer evidence, no silent scope gaps, production verified or CS2 remains active.

## Parallel work

01, 02 and 07 can proceed from the verified baseline in separate worktrees after the lead assigns interface writers. Serialize overlapping server changes in 04 and 05, model/preview changes in 03 and 09, and input, HUD or audio work shared with 06 and 07. The 09 fixture exercises pre-existing entitlements. CS3-10 proves earning and spending the same entitlements from a real match. New maps enter the picker only after their own navigation and mode checks. Each package records revision, test commands, before/after evidence, open gaps and independent review in project status.
