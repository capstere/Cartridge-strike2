# Acceptance matrix

Baseline commands (from repo README/CI): 
- node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
- npm ci --prefix server; npm run build --prefix server -- --check; npm test --prefix server
- node tools/verify-owner-runtime.mjs
- python3 deploy/online/test_manage.py
- existing .github/workflows/fps-regression.yml and multiplayer-soak.yml; use the workflow's pinned browser setup and exact command/env, not assumed executable binaries.

| Gate | Existing probes / required new evidence | Acceptance |
| --- | --- | --- |
| English UI all screens | mobile-smoke.cjs, match-flow-browser.mjs; add key coverage and browser path assertions + screenshot suite | en default/fallback; no unexpected Swedish labels or errors; back, focus, resize, loading, real actions |
| Existing modes/maps | game-only.test, foundation-replay, owner-door-traversal, online-classic/online-match, compact-arena tests | Classic, TDM, Endless existing availability; Floor 5 and Compact Arena; original objectives/economy/residents preserved |
| FPS / Rush | view-arms-capture, view-grips, recoil-autofire, reload-foley, online-equipment, new sprint/slide prediction tests | all held items/poses; ADS/fire/switch/reload transitions and deadlines; no collision bypass; real video |
| Character | saved-character-browser, view-character-appearance, headshot-death/landing, zombie tests | custom imports, wardrobe/material match, directional/air/death, visual-only ragdoll; hitbox parity if changed |
| Authority / bonus | network-protocol/session tests, server tests, new pure bonus cases and abuse fixtures per spec | exact counts/durations, no forged/duplicate/stale/stacked effects, delayed damage, two clients, private data |
| Access/accounts | network-family, pilot, lobby, resume, match-lifecycle browser; new auth/migration/rate-limit/CSRF/expiry/revocation cases | family link old/new, authorized quick access, no leaked secret, guest/account recovery, persistent restart |
| Mobile/gamepad | mobile-input-ownership.test, mobile-reliability-browser, online-autofire, new layout/editor/gamepad tests | multi-pointer movement+look+fire, resize/rotation, cancel, safe area, layout persistence, conflict-free binding; physical iPhone/Android separately |
| Map/graphics | build-network --check, multimap-browser/recovery, asset-sharing, actor-occlusion, map adapter fixtures | actual map collisions identical server/client, all required spawn paths, full matches, map swap/disposal, no visual-only blockers |
| AI/navigation | bot-tactics/rounds, bot-tactics-browser, network-load, online-classic | fair perception, cover, route/door/glass/hostage, objective completion, improved measured tail |
| Classes | online-classic/equipment + illegal attachment/price tests, preview lifecycle | valid loadout, compatible stats, real save, Classic cannot bypass economy |
| Replay/modes/XP | new replay buffer expiry/filter, spectator, FFA/Domination scoring, duplicate reward, server reset tests | bounded history, no live leak, correct end/rematch, trusted persistence |
| Performance | measured-simulation, network-load, network-room-startup, asset-memory-profile, render/performance and soak tools | compare exact baseline, p50/p95/p99, no material regressions; see budget |
| Delivery | deploy test_manage, build check, private backup and migration/restore rehearsal, staging rendered clients and HTTPS/WSS verify | exact build, idle activation, rollback ready, no active room interruption |

Every result record: task ID, SHA/build, command, scenario/browser/device, outcome PASS/FAIL/NOT_RUN, artifact path and reviewer. For new behavior add deterministic unit and integration test plus normal player journey. Test with 1/2/4/10 actors where appropriate, bots vs humans, high RTT/loss and malformed messages; use same physical hardware when comparing. No treating mocked backend or automated SDK-only client as full visual playtest. Mark emulated touch separately from actual phones. No hiding skipped checks. Release gate requires reviewer signoff, all applicable checks, no high-severity open regression, explicit owner-visible unresolved scope and physical-device evidence gap. Do not deploy just because CI is green.

## Required media-linked evidence

| Owner | Exercise through the normal entry | Passing observation |
| --- | --- | --- |
| 01, 10 · V1 | Start, rotate view near a wall and in free space, late join or return during countdown. | One cue per displayed count and one Go, persistent score/time/map, correct combat enable tick. Record relative audio/visual onset. |
| 02, 06 · V4 and V6 | Use one continuous recording of forward stick movement below and above threshold, several strides, release, then a second run interrupted by ADS or a short trigger tap. Replay the same input on keyboard and on a delayed two-client match. | Capture raw radius, resolved gait, input/ready/shot ticks, two muzzle/grip tracks, reticle visibility, ammo and remote pose. Prove distinct lowered long gun, pistol handling, no dropped tap or duplicate sound. Prove gesture release and overlay reset after cancellation/rotation. |
| 02, 06 · V2 | Hold and aim, release, then hold through expiry where the equipped item supports it. Exercise cancellation and interruption. | Visual feedback and guide use the current authorized weapon and fuse. One item per accepted action, continuous grip/return, useful danger direction, no stale marker, audio or damage after respawn. Confirm preview endpoint semantics against shared simulation. |
| 02, 05, 10 · V6 | In overlapping events present ordinary hit, kill, assist/headshot, nearby grenade, flash recovery and low ammo while moving. | HUD and controls remain legible, one event per confirmed result and one eligible streak increment. No stale awards after reconnect. Assess simultaneous reload/pickup prompt ordering. Compare reduced effects and muted captions. |
| 10 · V5 | Enter TDM death card and scoped replay, skip promptly or let replay expire. Repeat with unavailable history, reset and Classic spectator. | Correct authorized killer/weapon/distance, camera and scope match recorded history, local controls suppressed during replay, eligible life receives correct ammo/controls. No forced Classic respawn. |
| 01, 03, 04, 06, 09, 10, 12 | Walk the screenshot journeys under the owning package, then repeat the full UI matrix in 12. Use clean and pre-existing saves and English fallback under Swedish and French browser preferences. | All 16 states tied to functioning routes. English HTML, UI, in-world signs, accessible names, voices, notifications and recovery. Real progress for loading, clear affordance for locked/disabled controls. |
| 00, 07, 12 | Load the approved maps and late-loaded feature modules via the distribution's real paths. Inspect generated package, static allowlist and cache. Play across a change of map and build version. | Shared map/config match, original entry points and saved content work, required assets load, and reference uploads/recordings never enter the game payload. |

The clips supply sequences and visual targets. Input latency, audio-to-frame offset, slide prediction, full reload, actual handset reach and two-client agreement need independent measurements. Record both the local event-to-first-presented-frame delay and the authoritative ready/confirmation ticks. Use a physical input/video instrument when reporting finger-to-photon time. A screen capture alone cannot provide it.
