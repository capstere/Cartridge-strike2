# Multiplayer pass 2 — local two-player FPS

Base: **20289c50f709dea8ac04b71b8f5100dad9e4032a**, the merged Foundation.
Branch: `feat/multiplayer-network-slice`. Implements only
`CartridgeStrike2_Multiplayer_Plan_V2/prompts/02_NETWORK_SLICE.txt`.

## Play locally

Use Node **26.13.0** from `server/.node-version` and the committed lockfile:

```sh
npm ci --prefix server --ignore-scripts
npm run build --prefix server -- --check
npm start --prefix server
```

Open [the local lobby](http://127.0.0.1:2567/fps/?network=local) in two separate
browser windows/profiles on the same computer. Enter a name and a private code
(6–64 letters, digits or hyphens), then **Skapa rum**. Copy the room ID from the
HUD or Escape menu. In the other window enter the same ID/code and **Anslut**.
On desktop, click **Resume** to capture the mouse after joining.
WASD/mouse move and aim, left click fires, R reloads, Space jumps, Ctrl crouches,
Shift sneaks, Tab shows scores and Escape opens the menu. Mobile landscape uses
the existing touch controls. Returning to the lobby leaves the room.

This is a private **1v1 synthetic-demo** slice with the actual FPS renderer,
authored operators, Pulse SMG viewmodel, recoil, sounds, HUD, hit feedback,
death animation and automatic respawn. Both humans can move, aim, shoot, damage
and reload independently. No bot occupies a missing seat. Doors are fixed open
and glass stays solid. Bomb/hostage missions, residents, bots, other weapons,
shop/economy, grenades, aim assistance and private character uploads are disabled
only in this online path. Ordinary `/fps/` retains Classic/Endless and Floor 5.

The server deliberately binds **127.0.0.1**, and the client accepts loopback
endpoints only. This is not LAN, internet, finished 5v5, a hosted service or a
GitHub Pages multiplayer server. No tunnel or public deployment was performed.

## Foundation review and merge

[PR #18](https://github.com/capstere/Cartridge-strike2/pull/18) was reviewed at
`c71a987c3a24b60b837089bc7fd20da80b660b0f`: shared Game/controller/movement
changes, world isolation, input boundary, validation report and workflow.
Run **44072355721** had successful `node-tests` and
`multiplayer-foundation` checks on that head. The completed review reported no
findings and there were no unresolved review threads. The expected-head merge
succeeded as **20289c50f709dea8ac04b71b8f5100dad9e4032a**, without a check override.
This pass started from that new main, preserving PRs #14–#17.

## Actual ownership

| Responsibility | Implementation |
| --- | --- |
| Authority | One Colyseus `NetworkRoom`, fresh Foundation world/Game/controller registry, 60 Hz `setFixedTimestep`. Exactly one `sim.tick` per callback; no nested Game accumulator. |
| Admission | Explicit create or exact joinById; private code hash; two seats per room, two rooms per local server. Protocol/map/config/source hashes checked before a seat becomes a body. Client ready follows world/model loading. Loading seats expire after 20 s. |
| Inputs | Official reliable SDK input handle and acknowledgements. At most one validated frame per seat per simulation tick, 12 queued frames maximum, 120 messages/s and 4 KiB WebSocket payload cap. Missing/disabled/stale/old-life input is neutral. |
| Prediction | Official `Predict.sim` owns adoption/replay. It calls the Foundation's `moveActor(..., effects=false)` against the same fixed collision geometry. No predicted combat/damage or second replay queue. 45 ms display correction smoothing. |
| Interpolation | Official `Predict.attach`/timestamp buffer, 100 ms remote delay; angle-aware yaw/pitch. No interpolation across life/death changes. |
| Combat | Existing Game weapon data, capsule/body hitscan, wall occlusion, ammo, cadence, reload, damage, scores, death and safe respawn. No rewind in this milestone. Aim belongs to the consumed input. Server owns actor identity, team, origin and damage. |
| Cosmetics | Immediate own muzzle/audio/recoil actions carry `actorId:lifeId:fireId`. Confirmed shot IDs suppress duplicate local effects; authoritative tracer/hit/damage events still arrive. Playback never mutates authoritative inventory. |
| Resets | Monotonic life IDs across respawn and seat reuse. Reset prediction/interpolation/cosmetic history, retain SDK reliable wire acknowledgement counters. Reject delayed events from departed or earlier-life actors/sources. |
| Presentation | A Game-shaped read-only view feeds existing Renderer/Audio/HUD. Calling its Game update is an error. Recoil has a separate presentation RNG. Human names use text nodes; unchanged scoreboard/feed content retains cached DOM. |
| Cleanup | Unsubscribe callbacks, dispose SDK prediction, clear events/remotes/input/room references; delete authority bodies/controller bindings on leave and dispose empty rooms. Two reusable renderer actor slots remain bounded. |
| Menus/background | Clear local controls/audio; room continues and the actor remains vulnerable. Rotation requires explicit Resume. Returning to lobby cannot restart the other player's match. Rejoin is explicit; no reconnect grace yet. |

SDK **0.18.10**, core **0.18.28**, ws-transport **0.18.5**, schema **5.0.49**
and Express **5.3.0** remain pinned. The vendored official UMD SDK is 222,653
bytes with its license; its bundled schema identifies itself as **5.0.8**.
That shipped client/server combination is exercised by the integration tests;
we do not claim the embedded and server schema versions are identical.

`tools/build-network.mjs` reproducibly copies the official browser SDK and hashes
the 70 simulation/network source entries, exact map JSON and rules/weapon data.
`--check` rejects stale output. The public runtime manifest includes client/shared
files, not server dependencies, tests, credentials or logs. The local HTTP server
serves only manifest-listed runtime files.

The pinned SDK documents one delta-encoded input per `send()`, including a
body-less frame when unchanged. The render loop submits up to six fixed-step
inputs together when catching up, as supported by its `Predict.tick` API.
**There is no multi-input wire-packet batching API in this pinned version**;
no custom transport/replay protocol was layered around it. This is the explicit
adaptation to the plan's batching target.

## Verification

Local environment: Apple M1, macOS ARM64, Chromium **153.0.8010.12**, Metal,
low graphics, DPR 1, desktop 1280×720 and touch emulation 844×390
(with portrait rotation). Server tests use Node 26.13.0; offline tests use the
installed Node 26.0.0. CI additionally checks the existing Node 22 offline path.
These are browser automation and local server results, not physical-handset or
external-network play.

| Check | Result |
| --- | --- |
| Full FPS/tools unit suite | **PASS — 211 full-suite tests + one focused client-event test** |
| Real server/API/protocol tests | **PASS — 7 tests**, including pinned Foundation API spike |
| Prepared Floor 5 traversal | **PASS — 102 doors** |
| Runtime manifest | **PASS — 469 files**, source sizes/SHA-256/total |
| Offline deterministic replay | **PASS — eight state/event hashes unchanged over 9,600 steps**, compared with the Foundation report |
| Existing browser regressions | **PASS** desktop/touch smoke, Classic/Endless match flow, both objective routes and spectator controls |
| Existing visual/resource regressions | **PASS** nine workstation comparisons and 25 actor-occlusion comparisons pixel-identical; 208 shared-character poses |
| Existing mobile controls | **PASS** simultaneous touch/orientation tests at 844×390 and 932×430 |
| Two-browser network game | **PASS — loopback and 100 ms RTT/jitter, both humans shoot/reload, 20 + 4 join/leave cycles** |
| Repeated offline lifecycle | **PASS — final unchanged 20-cycle run**, after two initial GPU tail-equality failures documented below |
| Compatible private character | **PASS — generated compatible fixture; both teams, first/third person, cancel/retry/replay and incompatible recovery. Studio UI export itself NOT RUN.** |

The network browser test creates two actual browser contexts in the same private
room. Real keyboard events drive simultaneous movement; subsequent route inputs
go through the normal validated input path, without teleporting actors. Both
players aim/fire/reload, damage is observed, one kill increments once, and respawn
snaps to a fresh life with a full magazine. It tests menu/orientation pause,
literal HTML-looking names, room full, stale build, leave/rejoin and empty room
disposal. A 50 ms one-way proxy with seeded ±20 ms jitter delays actual binary
WebSocket messages in both directions, retaining ordered reliable delivery.
It does not simulate packet loss by dropping snapshots.

[Raw browser measurements](network/browser.json) · [actual combat capture](network/loopback-combat.png) · [mobile lobby](network/loopback-mobile-lobby.png).

| Measured final run | Loopback | 100 ms RTT with jitter |
| --- | ---: | ---: |
| Immediate own movement in the first normal input step | 0.07 m | 0.07 m |
| Authoritative movement received during that sample | 0 m | 0 m |
| Settled prediction error | 0 m | 0 m |
| Respawn pose error / ammo | 0 m / 30 | 0 m / 30 |
| Maximum sampled remote interpolation offset | 0.432 m | 0.589 m |
| Confirmed own shots / suppressed duplicate effects | 7 / 7 | 8 / 8 |
| Maximum pending SDK inputs | 8 | 16 |
| Join/leave cycles | 20 | 4 |
| First → last DOM listeners | 230 → 230 | 230 → 230 |
| First → last actor models / SDK callbacks | 2 / 4 → 2 / 4 | 2 / 4 → 2 / 4 |
| First → last game geometries / textures | 101 / 39 → 101 / 39 | 101 / 39 → 101 / 39 |
| Active audio voices after each rejoin | 0 | 0 |

The proxy recorded 2,657 messages, 9,167 upstream and 85,742 downstream payload
bytes across its scenario. Ordered one-way delay averaged 51.7 ms, p95 68.4 ms.
These totals include setup/control traffic; they are not a sustained 10-player
bandwidth benchmark. Both scenarios ended with zero live rooms and zero browser
page errors.

Two initial offline lifecycle attempts failed the strict final GPU equality
comparison: resources first appeared near cycles 18–20. Their samples are kept
in [initial](network/lifecycle-initial.json) and [second](network/lifecycle-second.json).
Retained games, listeners, audio nodes and RAF owners remained bounded in both.
The same test against merged Foundation [passed](network/lifecycle-baseline.json),
also showing lazy resource initialization after warmup. An instrumented draw
follow-up [passed](network/lifecycle-instrumented.json); the final **unchanged**
test [passed](network/lifecycle-final.json), with game GPU counts 1,328 geometries,
162 textures and 109 programs stable from cycle 2 through 20, one retained Game,
267 listeners, one audio context, three audio nodes and zero active voices.
No assertion was relaxed. The exact cause of the intermittent late cache fill
was not isolated; repeat this strict check on additional environments before
claiming universal cleanup stability.

The first private-character attempt had no supplied Studio fixture; a raw
runtime export lacked the required forearm color attributes and was rejected.
The generated compatible fixture then passed the existing browser check. The
network test also exposed two harness issues: desktop Resume needs real foreground
focus for pointer lock, and a one-frame interpolation sample can land after both
poses stop at a wall. The test now foregrounds Resume and samples the movement
interval immediately after the normal frame updates its display pose, before a
later state patch can replace it. The probe is installed before keyboard input,
so slow driver calls cannot miss the movement. All gameplay assertions remain enabled.

The first GitHub run, [44082904519](https://github.com/capstere/Cartridge-strike2/actions/runs/44082904519),
passed all existing checks but failed the new test's wall-clock reload comparison
(27 → 30 ammo). Slow software-renderer/CDP round trips had allowed the reload to
finish before the sample. The follow-up observes authoritative state patches:
both players submit held-fire inputs during reload, every active-reload ammo
sample stays constant, and completion restores 30 rounds. Immediate prediction
is now sampled synchronously around a normal SDK input submission, rather than
assuming two rendered frames fit inside a network round trip. No reload duration
or gameplay mechanic changed.

This exposed a real disposal mistake too: SDK signal registration returns an
emitter, not a disposer. NetworkSession now explicitly removes its state/leave
callbacks before leaving. All 24 browser cleanup cycles assert zero state-signal
callbacks immediately, before waiting for connection closure. The updated native
loopback/latency suite and seven server/protocol tests pass locally. GitHub checks
must pass on the follow-up head before any later merge.

The next CI run, [44086476045](https://github.com/capstere/Cartridge-strike2/actions/runs/44086476045),
exposed a separate burst-test assumption: a queue cap of 12 does not limit total
consumed frames to 12 when incoming messages and server ticks interleave. The
revised test deliberately interleaves two 40-input bursts, verifies the 12-frame
pending cap and discarded overflow, and bounds movement and firing by actual
fixed ticks. It passes locally with 15 consumed inputs over 18 ticks (1.05 m).
The authoritative simulation and queue limits did not change.

An additional forced SwiftShader run on this Mac was **not accepted**: at DPR
0.5 the corrected interpolation observation passed, but no held-fire input was
submitted during the reload window under heavy rendering stalls. Earlier
out-of-frame probes sampled only two or three frames and missed interpolation.
The native Metal DPR 1 suite passes both complete scenarios. Optional
`FPS_NETWORK_ANGLE` and `FPS_NETWORK_DPR` settings reproduce this stress condition;
CI retains its default renderer and DPR 1. This is not evidence of acceptable
software-renderer performance or a physical-phone result.

The adoption-distance diagnostics in the raw test include legitimate pending
movement and are **not** a measured prediction-error percentile. The settled
pose comparison and immediate-local-motion assertions are the numeric gates.
No multiplayer FPS gain, 10-client bandwidth budget or Pi capacity is claimed.

Reproduce the additional checks:

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
npm run build --prefix server -- --check
npm test --prefix server
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
npm run test:browser --prefix server
```

The private-character check uses a generated fixture, keeping original rig
animations and adding the compatible short-sleeve color attributes. Generate it
without publishing a private GLB, with the repository served on port 8765:

```sh
node tools/export-private-character-fixture.mjs
FPS_CHARACTER_GLB=/tmp/cs2-compatible-private.glb \
FPS_CHARACTER_RIG=assets/fps/models/quaternius-operator-male.glb \
node tools/saved-character-browser.mjs
```

Serve the repository on port 8765 for the existing browser commands listed in
[validation evidence](network-validation.json). CI retains the two existing job
names and PR-only full browser policy. It reuses the node-tests job's Chromium
installation for multiplayer, then switches to the pinned server Node version;
main does not gain duplicate full browser runs or extra artifacts.

## Limits and next work

- Pass 2 PR stays **unmerged for review**. No Pass 3 implementation or public
  server deployment is authorized by this delivery.
- Internet combat remains gated on bounded hitscan rewind and real-network
  validation. Dynamic Floor 5 doors/glass/elevators, reconnect grace, 4–10 humans,
  50/150/250 ms matrix, real transport loss and a 30-minute network soak are
  **NOT RUN / not implemented in this pass**.
- Static shared movement parity covers doorways, walls/corners, jump/crouch and
  height. Moving-player collision prediction uses the newest authoritative
  remote bodies; it is not a historical replay of every other player's motion.
- Background input is neutralized; closing/restarting the local server interrupts
  the match. The user must explicitly rejoin/recreate; no persistent account or
  reconnect identity exists. A shared room code is a local prototype gate.
- Physical iPhone/Android, Safari, Linux ARM64/Pi, thermal/load budgets and two
  physical computers on different networks remain **NOT RUN**. The original
  handover's physical-mobile task remains first in the general backlog.
- Review this slice and its CI next. Only after separate authorization should
  `prompts/03_FLOOR5_COMBAT.txt` be executed.
