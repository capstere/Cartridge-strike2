# Pass 3A.1 — real Floor 5 multiplayer

Base: `ad6742cec17bb6aa01fcd6718a21ca1940740d06`, the reviewed merge of
[Pass 2 PR #19](https://github.com/capstere/Cartridge-strike2/pull/19).
Branch: `feat/multiplayer-floor5`. This implements the explicitly scoped 3A.1
assignment, not the remaining full Pass 3 in the planning package.

## Play locally

Use the pinned Node in `server/.node-version`, then:

```sh
npm ci --prefix server --ignore-scripts
npm run build --prefix server -- --check
npm start --prefix server
```

Open `http://127.0.0.1:2567/fps/?network=local` in two browser windows/profiles.
Create a room with a name/private code, then join its exact room ID with that
code in the other window. On desktop use Resume to capture the mouse.
WASD/mouse, left click, R, Space, Ctrl and Shift use the existing FPS controls.
Escape releases just that player's input; the room continues. Return to lobby
leaves the room. This remains a loopback-only, two-human, Pulse SMG slice with
automatic respawn. No bot fills an empty seat. Offline `/fps/` retains the
complete Classic and Endless game.

## Pass 2 review

Reviewed final head `014b316e4b15c75477b9c0d8b84d95753b4e4f9f`, its diff,
validation report, review threads and required CI. Both jobs in
[run 44101439929](https://github.com/capstere/Cartridge-strike2/actions/runs/44101439929)
passed. No unresolved review threads or reproduced blocking product defect
remained. The expected-head merge succeeded without overriding any check.
GitHub authentication expired during delivery, then was renewed; local work
was carried onto a new branch from the actual merge commit.

A fresh, unchanged 20-cycle offline lifecycle test passed. Its final Classic
and Endless GPU counts were both 1,327 geometries / 162 textures / 109 programs;
listeners stayed 267, retained Games stayed one, and audio stayed one context /
three nodes / zero live voices in the lobby. Earlier intermittent late GPU
allocation is not claimed fully explained. The final-head normal-launch smoke
also passed two humans, actual keyboard/mouse input, reload and leaving without
test hooks. Headed Chromium still reported `WrongDocumentError`, but a minimal
plain HTML canvas/button reproduced it even without fullscreen or game code.
This isolates that observation to the current headed test environment; it does
not establish physical-window mouse capture acceptance.

## Implemented ownership

- Both sides load the exact `levels/floor5-prepared.json` from the public
  manifest through the existing world adapter. The published Pages file was
  fetched and matched SHA-256
  `89283f437623457a10da37be29a282a41591f202270051ba940549ba01b4b050`
  (1,761,561 bytes). No map, furniture, source model, texture or animation changed.
- Existing renderer, lighting, instancing, visibility/culling, character sharing,
  weapon/audio/HUD and input systems remain in use. The build generator derives
  the map's furniture dependencies into the runtime allowlist: 45 existing
  files were missing from the old synthetic slice's allowlist. No second scene
  implementation or placeholder laboratory is introduced.
- Final review measured three resident model downloads and three parsed sources
  despite zero online residents. The renderer now skips that initialization only
  for the network slice. This removes **7,982,418 compressed payload bytes per
  fresh client** and all three unused source models; the browser test rejects any
  resident-model request online. All original assets and offline loading remain.
  [Before/after loading evidence](floor5/resident-loading.json) records one native
  sample each (6.24 / 5.80 s startup); that timing pair is not a statistical gain.
- The existing authoritative Game advances all 51 hinged doors before movement
  and combat, using the original proximity opening, swing direction, hold timer
  and occupied-sweep safety. Schema patches include angle, target, sign and hold
  deadline. Initial state and late joins carry the full door set.
- The two original spawn elevators are stationary cabins with sliding shutters,
  not vertically moving platforms. The server starts their existing 1.5-second
  opening when the first human is ready, replicating the start time and current
  progress. Later joins receive their current state. Team spawns use the existing
  validated anchors and safe respawn selection; no client chooses positions.
- The pinned Colyseus SDK still owns adoption, replay and interpolation. Each
  prediction adoption restores the authoritative door/shutter state, then the
  same door controller and shared capsule movement advance unacknowledged input.
  Prediction owns only lightweight door records and a dynamic broadphase. It
  shares the immutable Floor 5 triangle tree/static indices. A synchronous,
  exception-safe collision context keeps predicted leaves separate from the
  authoritative leaves read by rendering, audio and hit tests. No second replay
  queue, physics engine or full map allocation is added.
- Glass is visibly intact and unbreakable online. Existing Game raycasting stops
  every bullet at the solid pane; no client-side break events occur. Offline
  breakage and round reset behavior are unchanged.
- Map bytes, resolved collision, configuration, wire protocol and source build
  compatibility are generated by `tools/build-network.mjs`. The collision
  fingerprint canonicalizes keys and rounds only hash-input numbers to 1e-9:
  Chromium/Node trig differed in 209 fields by at most 3.56e-15. Physics values
  are never rounded or changed. Exact map bytes and source/config hashes remain
  independent compatibility gates. Generated files are not edited manually.

## Validation

Initial failures were fixed rather than waived: hash serialization differed across V8
versions, the local HTTP allowlist omitted real furniture, and synthetic-map
fixtures assumed permanently open doors and empty combat coordinates.
The browser route helper originally stopped on predicted waypoint arrival; a
latency run exposed the server still behind it. It now waits for the exact SDK
input acknowledgement and checks authoritative arrival before advancing. The
final arrival threshold remains 0.3 m; no teleport or collision bypass is used.

A later failed-admission probe reproduced a real lobby cleanup defect: returning
from a network match constructed an empty lobby Game but retained the previous
round marker. Its next render frame read `game.player.yaw` with no player and
stopped the loop. The network lobby reset now synchronizes the round/phase
markers. The same probe now displays the ordinary missing-room error, keeps
the lobby rendering and leaves the other human connected. Earlier repeated-join
checks did not require a Game render between transitions and missed this defect;
every cycle now requires a real lobby frame and a real active frame after joining.
[Before/after recovery evidence](floor5/lobby-recovery.json).

The new focused tests cover collision identity/drift, hash normalization without
geometry mutation, 102 real door approaches with matching prediction/authority,
closed-shutter blocking and both humans crossing during the same predicted and
authoritative opening, late adoption, safe spawns and context restoration.
The two-browser harness uses real paths and network inputs, never teleporting
players or setting health/ammunition to manufacture gameplay success. It visits
C08, shoots into a solid wall and closed D39, opens D39 through normal proximity,
and verifies an actual body hit through the open aperture before ordinary
combat, reload, scoring, death and respawn. Initial admission uses the real
form; repeated cleanup joins use that form's application handler.

| Check | Observed result |
| --- | --- |
| FPS/tools unit suite | PASS, 217 tests; the expanded shutter case also passed in the final four-test Floor 5 rerun |
| Pinned server/API and focused network suite | PASS, 13 combined tests (four server/API, four Floor 5, three protocol, two session) |
| Prepared door traversal | PASS, 102 approaches; no missing routes |
| Generated contract and runtime hashes | PASS, 516 runtime files; no hand-edited generated output |
| Offline deterministic traces | PASS, all eight state/event hashes and shot counts unchanged over 9,600 steps against the Pass 2 baseline |
| Existing browser regressions | PASS, desktop/touch smoke, match flow, simultaneous touch/orientation, objective routes and spectator controls |
| Existing visual/resource regressions | PASS, workstation visibility, actor occlusion and 208 shared-character poses |
| Compatible saved character | PASS, generated compatible fixture, both teams, first/third person, replay, cancel/retry and incompatible recovery; Studio UI export not run |
| Offline lifecycle | PASS, 20 measured match/lobby cycles after warmup; final plateau 1,329 geometries / 162 textures / 109 programs, 267 listeners, one retained Game, one audio context / three nodes / zero voices |
| Native two-browser Floor 5 | PASS, loopback and 100 ms RTT with jitter, 20 + 4 leave/rejoin cycles; both players move/aim/shoot/reload, one counted kill, damage/death/respawn, D39 obstruction/opening, late world state, pause/orientation and empty-room cleanup |
| Remote presentation | PASS, visible original operator follows interpolated body; actual `Walk_Loop` and `Death01` observed in rendered gameplay |
| Normal Floor 5 launch without test hooks | PASS, two humans, actual keys/mouse, pointer lock on first Resume, 1.05 m movement, four shots, reload HUD and leaving without disturbing the other player |
| Mac SwiftShader functional profile | Initial gameplay run passed at DPR 0.5 with downward route-travel look in 232.1 / 242.9 s. Its cleanup checks had the render-frame coverage gap described above; a stricter post-fix run is pending. This is not a software FPS pass. |

The network test also asserts unchanged first/final GPU allocations, model,
callback and listener counts. Both scenarios finish with **1,642 geometries /
98 textures**, two actor models, four SDK callbacks, one remote entry, 230 DOM
listeners and zero audio voices. Every own confirmed shot reuses its immediate
effect (11/11 loopback, 17/17 delayed), with no duplicate confirmation playback.
Both settled position errors and respawn errors are zero in these runs.

Evidence: [native browser record](floor5/browser-native.json),
[software functional record](floor5/browser-software.json),
[offline lifecycle](floor5/offline-lifecycle.json),
[offline replay](floor5/offline-replay.json),
[normal launch](floor5/normal-launch.json),
[two humans in C08](floor5/c08-two-humans.png),
[authoritative kill/death](floor5/c08-combat.png).

The required Linux CI checks must pass on the PR's final head; their status is
tracked on that PR rather than asserted ahead of execution here.
[Run 44120393983](https://github.com/capstere/Cartridge-strike2/actions/runs/44120393983)
passed the server and every offline stage, then reproduced the second-scene
readiness timeout seen on Mac SwiftShader. Two independent browser/GPU processes
resolve that startup contention. The software functional profile uses browser
DPR 0.5 and ordinary downward look (`pitch=-1.3`) only during route travel;
C08 measurements and combat restore normal aim. Both real scenes, collision,
network inputs, 20 + 4 lifecycle cycles and all assertions still execute. No
actor teleportation, hidden map, simulation override or longer per-waypoint
movement deadline is used. This profile is functional coverage, not acceptable
software-renderer FPS evidence.

The Linux job spent 16m30s on the unchanged offline checks and setup before the
network step. Its overall bound is now 28 minutes, with 10 minutes for the two
complete software network scenarios and cleanup. The complete offline checks, PR-only
browser policy and cancellation of superseded PR runs remain. The network step
now runs before the slower offline browser suites to fail sooner during
diagnosis; Node 22 is restored for those existing suites. Admission failures
print the actual lobby/fatal/focus state instead of only an opaque timeout.
[Run 44127848429](https://github.com/capstere/Cartridge-strike2/actions/runs/44127848429)
passed every offline stage and initialized both scenes, then timed out waiting
for the first playable human. That Linux admission failure is still under
diagnosis; local normal and CPU-throttled admission both passed. Default
native tests retain full DPR 1 and ordinary forward look during travel.

### Reproduce

Run from the repository root with dependencies installed as above. The core
suite also remains covered by Node 22 in CI; the server uses pinned Node 26.13.0.

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node --import ./server/register-shared.mjs --test server/test/*.test.mjs tools/network-floor5.test.mjs tools/network-protocol.test.mjs tools/network-session.test.mjs
node tools/build-network.mjs --check
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/foundation-replay.mjs
node --import ./server/register-shared.mjs tools/network-browser.mjs
FPS_NETWORK_ANGLE=swiftshader FPS_NETWORK_DPR=0.5 FPS_NETWORK_TRANSIT_PITCH=-1.3 node --import ./server/register-shared.mjs tools/network-browser.mjs
node --import ./server/register-shared.mjs tools/network-launch-browser.mjs
```

The existing offline browser scripts use a root HTTP server on port 8765:
`mobile-smoke.cjs`, `match-flow-browser.mjs`, `mobile-reliability-browser.mjs`,
`floor5-workstation-visibility.cjs`, `actor-occlusion-browser.mjs`,
`asset-sharing-browser.mjs`, `player-routes-browser.mjs`,
`match-lifecycle-browser.mjs` and `saved-character-browser.mjs`, all under
`tools/`. The saved-character script needs the compatible fixture and original
rig paths via its documented environment variables. Raw network arrays and
screenshots are regenerated under ignored `test-results/network/`.

### Measured native performance

Apple M1 / macOS ARM64, Chromium 153.0.8010.12 / ANGLE Metal, low graphics,
browser DPR 1, desktop 1280×720 and touch emulation 844×390. The game's existing
mobile rendering budget remains active. Two independent browser/GPU processes and the authority share
this host. Five-second fixed-camera windows run together in the two clients;
these are measured views, not a universal map or physical-phone FPS guarantee.

| View | Loopback FPS / frame p95 | Delayed FPS / frame p95 | Draw calls | Mean render submission, loopback / delayed |
| --- | --- | --- | --- | --- |
| Cargo Lift, desktop | 60.0 / 16.7 ms | 60.0 / 16.8 ms | 1,081 | 9.50 / 9.74 ms |
| Service Lift, mobile emulation | 60.0 / 16.8 ms | 60.0 / 16.8 ms | 79 | 1.46 / 1.44 ms |
| C08, desktop facing the other human | 58.4 / 16.7 ms | 59.8 / 16.8 ms | 1,196 | 10.90 / 10.61 ms |
| C08, mobile emulation facing back | 60.0 / 16.7 ms | 60.0 / 16.8 ms | 198 | 2.35 / 2.19 ms |

Across the whole scripted matches, including travel, combat, menus and cleanup,
server fixed-step elapsed p95 is **0.95 / 1.07 ms**, and client prediction/frame
submission p95 is **0.30–0.50 ms**. These elapsed timings include scheduling and
GC; they are not GPU timer queries or isolated process CPU measurements. The
largest server samples were 49.3 / 152.1 ms, and the C08 desktop windows had
149.9 / 33.3 ms frames despite their low p95. Those isolated stalls remain a
profiling target before longer soak or capacity claims. Apart from the measured
unused resident loading above, no renderer/AI rewrite was justified by this
two-human sample.

Sampled JavaScript heaps across the four windows were 97.5–126.7 MiB loopback
and 94.4–148.7 MiB delayed (not forced-GC retained-size measurements). Cleanup
checks use forced GC and explicit resource/listener counts. The delayed proxy
carried 64,138 bytes upstream and 401,956 downstream across the match and four
rejoins, 13,967 messages in total. Its first 4,096 ordered one-way delays had a
52.1 ms median, 68.4 ms p95 and 77.4 ms maximum; ordered jitter can queue beyond
the nominal 30–70 ms range. This is reliable WebSocket latency/jitter testing,
not a packet-loss or external-internet test.

The exact map replaces a much smaller synthetic scene, so previous synthetic
draw counts are not an equivalent rendering baseline. No visual, collision,
animation-sharing or mobile-budget changes were made to manufacture a gain.

## Limits and next work

- Capacity remains two human players, one Pulse SMG each, shared Endless-style
  scoring/respawn. Offline weapons, bots, residents, objectives, economy and
  Classic rounds remain available in singleplayer. Their full online rules are
  not part of 3A.1.
- Prediction knows the local player's pending input and the latest authoritative
  remote body positions. It cannot predict the other human's future inputs;
  server corrections remain authoritative. Dynamic world poses are presented
  from the 20 Hz patches; remote humans retain the SDK's 100 ms interpolation.
- The published map deliberately marks some decorative furniture non-solid.
  For example, blue screen `NY-OBJ-0449` is visible but has `collision:none`;
  this original authoring rule is preserved on both sides. Visual review caught
  that screen obscuring the first test camera, so final combat checks use the
  clear C08 sightline at x=22.8 without editing the level.
- No historical hitscan rewind, reconnect grace, 5v5, public listener, internet
  hosting, Raspberry Pi deployment or physical handset testing is claimed.
  Broader Pass 3 soak/capacity gates remain unfinished and require that scope.
- Full-view software-renderer performance remains inadequate on this host; the
  reduced-resolution CI profile establishes functional coverage only. Required
  Linux CI is a separate environment; neither emulation nor native Mac results
  establish physical-handset performance. Headed native-window capture remains
  unverified.
- The next task is review of this PR and its final CI, followed by any explicitly
  authorized next multiplayer milestone. Do not auto-merge this PR. The existing
  physical iPhone/Android validation backlog remains open.
