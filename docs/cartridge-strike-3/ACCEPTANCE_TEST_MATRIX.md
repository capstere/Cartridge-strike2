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
