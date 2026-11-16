# Acceptance, measurement and deployment

All values below are initial engineering targets, not measured performance claims. Record actual hardware, browser, map hash, build SHA, tick rate and graphics settings.

## Required gates

| Gate | Evidence required |
| --- | --- |
| Foundation | Existing offline tests pass; headless world loads; two human controllers move independently; world mutation in room A cannot alter room B |
| Network slice | Real server + two real browser contexts join same room; both move/aim/shoot/reload; no bot takes control of a human |
| Prediction | Input replay agrees with reference movement within documented numeric tolerance on doors, corners, stairs/height boundaries, jump and crouch; own motion does not wait for RTT |
| Combat | Fire direction belongs to correct input; magazine/reload/cadence enforced; client cannot submit hit/damage; wall occlusion and hitbox visual debug pass |
| Lifecycle | Leave/rejoin, reconnect grace, full room, wrong code, protocol/map mismatch, page background, death/respawn, server restart, empty room cleanup |
| Dynamic world | Late join sees current doors/elevators/glass; no invisible blocker caused by stale state; historical occlusion is correct for any enabled rewind |
| Regression | Classic/Endless offline, saved characters, default prepared map and existing rendering optimizations remain valid |
| Internet pilot | Two real machines on different networks; browser → real HTTPS matchmaking → WSS → deployed server; then 4 and 10 simulated/real clients with honest labels |

Test invalid, duplicate, stale and oversized input; reject NaN/Infinity, position/dt/moveWorld overrides, actor spoofing, future/ancient fire timestamps, dead-life commands and unauthenticated room creation. Use safe text rendering for player names. A shared code is for a private prototype, not an account system.

## Network scenarios

Run baseline local and test at 50/100/150 ms RTT with ±20 ms jitter; include a stressed 250 ms case with a visible degraded-network state. Exercise 1% packet loss at transport/network level where supported. WebSocket is reliable/ordered over TCP: loss causes delays and retransmission; dropping random app snapshots alone is not a valid substitute for a real network-loss test. Record which simulator/proxy was used.

Probe backlog, acknowledgements, maximum history, event deduplication and eventual correction after a burst delay. Throttled/background browser must not advance the server clock. Simulate an old connection callback arriving after a new room has joined.

## Performance targets and method

- Initial server target: 60 Hz, 16.67 ms budget, simulation p95 below 8 ms at 10 clients on the chosen host, and p99 below one tick. Include event-loop delay, serialization/transport overhead and missed ticks; a fast isolated step does not prove server health.
- Initial bandwidth budget: average outbound under 50 KB/s per client during a sustained firefight, excluding initial asset loading. Measure inbound/outbound bytes and bursts; 10 clients at that ceiling are about 4 Mbit/s server payload before protocol overhead. This is a budget, not a measured need.
- Client: measure active-frame p50/p95/p99, CPU, render draws and memory under matched conditions. Aim for desktop 60 FPS on the chosen reference machine; do not claim a universal device guarantee.
- Compare the same camera, map, resolution and actor count. The repository's PR #14 reports CPU reductions, but those are existing results, not multiplayer gains from this package.
- Run 30-minute network soak and at least 20 join/leave/respawn cycles. Memory/actor/listener counts must settle after cleanup, not grow per cycle. Record CPU thermal throttling on Pi where observable.
- Store reconciliation distance/frequency percentiles and hit-confirm latency. Define numeric pass thresholds after the first measured baseline; separate corrections due to player collisions from open-space drift.

Use compact changed-field state and bounded events. Start without custom compression, packet bit-packing or interest management; add only when measurements show a useful gain. Do not send bone animation poses; derive animations locally from replicated movement/action state. Keep event buffers, replay history, connection queues and entity counts bounded. Keep dynamic simulation and drawing separate so render culling cannot make an actor cease to exist server-side.

## Existing repo checks (verify against current HANDOVER)

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
```

Serve the repo locally in a separate terminal, then run relevant browser checks including match-flow-browser.mjs and mobile-smoke.cjs. Update affected build-info.json hashes/byte totals if runtime files change. Add meaningful multiplayer integration tests, not source-string assertions that merely mirror implementation. Old “192 tests passed” is prior repo documentation; rerun current tests and report current results.

## Release contract to be produced by Codex

1. Build reproducible client and headless server artifacts from same commit. Include Node version, lockfile, config/map/protocol versions, licenses and install/run commands. Prefer `npm ci` over unconstrained install.
2. Publish only intended static client assets to Pages; do not include .env, tunnel credentials, server logs, node_modules or server deployment artifacts in Pages output. Server source can live in the same repo; source code is not a secret.
3. Produce Linux ARM64/Pi runbook, non-root systemd service, environment template and localhost binding for tunnel deployment. Explain direct local development versus systemd env loading. Validate executable bits or use an explicit shell invocation.
4. Provide liveness and readiness endpoints without secrets, structured bounded logs, active rooms/clients, tick cost/event-loop delay, message rates and error metrics. Apply log rotation and restart limits.
5. Test Origin/CORS and WebSocket admission independently. Origin checking is browser hygiene, not authentication. Rate-limit joins and messages; validate payloads before they reach gameplay; cap rooms/connections. Enforce WSS for public clients.
6. Test Quick Tunnel endpoint end-to-end for pilot, then evaluate stable tunnel/VPS. Do not claim HTTP /health success proves WebSocket/gameplay success. No router port-forwarding is needed for the proposed tunnel arrangement.
7. Define deployment/version mismatch UX. Drain/notify active rooms before restart, or explicitly accept interrupted matches in the pilot. Keep previous client + server versions for coordinated rollback.
8. Deliver exact private operator commands after the target host is known. Do not assume SSH access or buy hosting. No secrets in reports. Physical Pi, two-network and handset tests that cannot be performed must stay marked NOT RUN.

## Result report template

For every pass record: baseline/current SHA; files changed; commands and exit codes; test environment; observed failures and fixes; performance before/after; remaining work; next command/prompt. Classify evidence as unit simulation, local server integration, browser integration, real-network play, Pi load or physical mobile. Use PASS / FAIL / NOT RUN, never infer one from another.
