# Dependency-aware implementation roadmap

All packages NOT_STARTED; preparation review gate applies. Package 00 establishes minimal versioned interface skeletons for registries before individual integrations; package 11 consolidates and proves extensibility. Packages 01, 02 and 07 may start after 00 only with separate worktrees and one owner for shared files. 04 and 05 share server protocol ownership and must serialize overlapping writes. 03/09 share models/preview ownership. 08 follows pilot map adapter and Rush contract. Run a vertical slice and review before broad rollout. More maps may be developed after pilot adapter without waiting for all AI polish, but cannot ship before their navigation acceptance.

## CS3-00 — Baseline, backup, architecture
- Lead delegate: performance + reference-integration + lead
- Dependencies: Preparation approval
- Scope / reference / file ownership: All runtime paths read-only; deploy/online/README.md, tools/*, build-info.json, shared/multiplayer/*
- Implementation: Pin actual Pi release, verify private backup/restore; compare stock CS2 and reference; inventory source/runtime imports, baseline metrics; agree contracts and language keys; run existing CI commands. No production changes.
- Verification: Existing tests; reproducible scenarios; exact SHA, sanitized backup receipt and review of contract
- Exit evidence: Baseline verified or explicit blocker; contract decisions written before dependent work.

## CS3-01 — English frontend and navigation
- Lead delegate: frontend
- Dependencies: CS3-00
- Scope / reference / file ownership: fps/*, ui/*, app.mjs integration via lead, lobby-stage.mjs, match-flow.mjs; reference 09e-menus, 09w-fond, 09f-news
- Implementation: Design system; en catalog; main/Play/Solo/With Friends, options, map cards, roster, countdown, news; real solo and private lobby actions; placeholder routes explicitly disabled pending 03/04/09/10.
- Verification: mobile-smoke, match-flow-browser, network-lobby-browser; screenshots per UI spec, en string coverage
- Exit evidence: Menu→match→results real flows; stable back/resize/focus.

## CS3-02 — FPS feel, movement, Rush and combat audio
- Lead delegate: gameplay + audio
- Dependencies: CS3-00
- Scope / reference / file ownership: movement.mjs, game.mjs via lead, models.mjs, presentation-*, strike-kit-*, reload-foley.mjs, shared input/protocol + server schema via multiplayer; ref 06-weapons, 06c-models, 07c-controller, 08-player, 06d-reload, 05a-sfx
- Implementation: CR4/P9 sprint/slide/ADS/reload vertical slice then all held objects. Normalize sprint input, shared movement and timing, authoritative prediction; event IDs, sounds and FX fixes.
- Verification: view-arms-capture, recoil-autofire, reload-foley-browser, network-delay, online-equipment; video and latency/CPU
- Exit evidence: All weapons transition without clipping or simulation divergence; actual Rush shown.

## CS3-03 — Character animation and wardrobe
- Lead delegate: gameplay + graphics-assets
- Dependencies: CS3-00, CS3-02
- Scope / reference / file ownership: character-runtime-contract.mjs, character-actors.mjs, character-library.mjs, models.mjs adapter, view-character-appearance.mjs; frontend mounts wardrobe; ref 06ac-loco, 06g-body, 06h-ragdoll, 09u-tenues
- Implementation: Canonical rig adapter, existing GLB, directional blending, IK, death/ragdoll visual and LOD; outfit previews, original skins; separately assess joint hitboxes.
- Verification: saved-character-browser, view-grips, view-character-appearance, headshot-landing; rig fixtures/video
- Exit evidence: Existing imports and arms matching; visual/authority separation.

## CS3-04 — Multiplayer access and account persistence
- Lead delegate: multiplayer-backend
- Dependencies: CS3-00, CS3-01
- Scope / reference / file ownership: server/access.mjs,pilot-access.mjs,local-server.mjs,family-room.mjs, network/session.mjs, new account modules; frontend mounts profile; ref 09j-compte UI only
- Implementation: Scoped remembered sessions, invite link/QR/short code, migration, optional accounts/recovery/stats storage, secure public listing behind off-by-default flag.
- Verification: network-family-browser, network-pilot-browser, security/expiry/revoke/replay tests, migration/restore
- Exit evidence: Two-client old and new access, private credentials protected, real persistent accounts.

## CS3-05 — Authoritative killstreaks
- Lead delegate: multiplayer-backend + gameplay
- Dependencies: CS3-00, CS3-02
- Scope / reference / file ownership: game.mjs, config.mjs, new pure streak module, movement, server/network-room.mjs/network-schema.mjs, shared protocol, session, combat-hud/minimap; ref 08b-killstreaks
- Implementation: Implement dedicated spec 3/5/8 and 15/15/8; shared pure transitions, kill attribution, authoritative command and own radar, HUD/action binding, audio.
- Verification: state tests, malicious requests, two-client online, offline parity, delayed projectiles, exact durations
- Exit evidence: All bonus rules proven, no unauthorized activation/stacking; UI confirmed.

## CS3-06 — Mobile layout and gamepad
- Lead delegate: mobile-input
- Dependencies: CS3-01, CS3-02, CS3-05
- Scope / reference / file ownership: mobile-controls.mjs,tactical-controls.mjs,ui/cs-mobile.mjs, HUD and shared input; ref 09q,09qb,09qc,09qd,08a-binds,09r-pwa
- Implementation: Customizable layout, safe areas, opacity/size, profile import/export, normalized multi-pointer input, sprint/slide/bonus, gamepad and PWA.
- Verification: mobile-input-ownership, mobile-reliability-browser, online-autofire-browser; physical device matrix
- Exit evidence: Simultaneous controls, rotation, no stuck input, no key conflicts; physical status explicit.

## CS3-07 — Graphics, audio environments and map pipeline
- Lead delegate: graphics-assets + audio
- Dependencies: CS3-00
- Scope / reference / file ownership: levels/*, level-adapter.mjs, world.mjs, shared maps/collision/map-build, render/materials/props, audio registry; ref 02-map,02a-kit,02c-materials,02z-load,09a-loading,04b-physprops,05c-ambiance
- Implementation: Baseline visual pass, reference map adapter and Meltem or lower-risk pilot; validated additional maps, all nine assessed, environment FX and ambience; LOD/disposal.
- Verification: build-network --check, compact-arena/owner-door-traversal tests, multimap-browser/recovery, asset-memory and complete matches
- Exit evidence: Original maps preserved, each added map validated collision/nav/spawn/lifecycle and performance.

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
- Exit evidence: No purchase bypass, correct stats and saved real loadouts.

## CS3-10 — Replay, modes, match presentation and progression
- Lead delegate: multiplayer-backend + gameplay + frontend
- Dependencies: CS3-04, CS3-05, CS3-07, CS3-08, CS3-09
- Scope / reference / file ownership: game.mjs mode interfaces, match-lifecycle, session, combat-hud/match-flow, account storage; ref 09b-killcam,09i-modes,09l-fin,09y-decompte,06r-arsenal,06s-defis
- Implementation: Bounded filtered killcam/final replay, spectator, scoreboard/results, FFA and Domination, server XP/challenges/unlocks; preserve existing modes.
- Verification: match-lifecycle-browser, online-match/classic, replay, FFA/domination win rules, trusted XP idempotency
- Exit evidence: Real replays, new modes verified, no information leaks or double rewards.

## CS3-11 — Future content extensibility
- Lead delegate: reference-integration + graphics-assets + lead
- Dependencies: CS3-03, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10
- Scope / reference / file ownership: registries, manifests, validation/import/thumbnail tools, docs; extend existing runtime contracts
- Implementation: Consolidate versioned registries, examples, migration, validated additions for character/rig/weapon/attachment/map/mode/bonus/audio/outfit/bot/theme/progression; no parallel editor.
- Verification: schema negative/positive tests, import sample and runtime smoke, build reproducibility
- Exit evidence: Adding example content without unrelated gameplay edits.

## CS3-12 — Final integration, staging and release
- Lead delegate: lead + performance + reviewer
- Dependencies: CS3-01, CS3-02, CS3-03, CS3-04, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10, CS3-11
- Scope / reference / file ownership: all reviewed integration, deployment tools and release manifest
- Implementation: Full acceptance, hardware/physical status, security, before-after, backup restore rehearsal, stage exact SHA; release on idle Pi via existing process only after authorized gates.
- Verification: all CI, server tests, rendered two-client HTTPS/WSS, long soak, migration rollback rehearsal
- Exit evidence: Independent reviewer evidence, no silent scope gaps, production verified or CS2 remains active.

## Parallel waves (conceptual, not a schedule)
00 first; 01/02/07 independent slices after interfaces frozen; 03/04/05/08 after respective prerequisites; 06/09 then 10/11 then 12. Actual worktree overlap governs order. Every task produces focused PR, exact test commands, results, before/after screenshot/video where visual, revision, reviewer findings and known gaps. Update tasks.json and PROJECT_STATUS before context reset. No task may be marked complete without real verification. If blocked record source, impact, alternative and next executable action; finish independent work. Owner need not micro-manage tasks.
