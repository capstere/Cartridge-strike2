# Cartridge-Strike 2 handover

**First open task — test physical mobile controls and audio.** Play on an iPhone and an Android phone in landscape, near 844×390 and 932×430 where available. Record the model, OS, browser, viewport and safe-area clearance. Move, aim and fire together, reload, jump, hold an objective and buy. Rotate, background and resume during the lobby and a match. Listen for the lobby theme stopping on Start and resuming on return. Record any failure with its screen position and steps. [Play the published build](https://capstere.github.io/Cartridge-strike2/)

Floor 5 has neutral Meshy residents in Classic and Endless. The 20-cycle match lifecycle check passed. The feature was merged in [PR #7](https://github.com/capstere/Cartridge-strike2/pull/7) and verified on Pages in [PR #8](https://github.com/capstere/Cartridge-strike2/pull/8). [Living zombies, frame samples and published captures](docs/zombies/gameplay.md)

## Completed — profile the populated Floor 5 Endless spawn

**PASS** on the integrated Floor 5 build. Nine frozen-world camera comparisons matched pixel for pixel. The open elevator saved 352 world draws with the zombie integration present. [Integration results](docs/endless-profile/README.md#november-10-integration-check)

A fixed-camera trace found **1,045 of 2,270 elevator draws came from furniture cells**. Inside two of those cells, four mirrored monitor, keyboard and mouse kits in I04 submitted 88 draws apiece. Each kit fit entirely behind an opaque wall. The change gives dense, rigid mirrored furnishings their own visibility check inside the existing cell. The first-person SMG submitted 19 draws.

| Apple M1 / Metal trace | World draws before → after | First-person draws | Total draws before → after | Triangles before → after |
| --- | ---: | ---: | ---: | ---: |
| Analysts Cargo Lift, 1 s | 2,251 → 1,899 | 19 | 2,270 → 1,918 | 1,061,778 → 1,057,554 |
| C08 firefight, about 24 s | 4,030 → 2,358 | 19 | 4,049 → 2,377 | 932,362 → 912,298 |

To reproduce, serve the repository with `python3 -m http.server 8765` and open `http://127.0.0.1:8765/fps/?test&realtime&seed=42`. Use the default prepared Floor 5, Analysts, Endless Action, Originalkaraktär, Pulse SMG, low graphics, 844×390 and all ten team actors. The untouched spawn eye is `(-20.541, 1.58, -30.03999)` facing `(0, 0, 1)`. The profiler also places an observation camera in C08 at `(20, 1.58, -5.4)` facing `(0.70441, 0, 0.70979)` while the two squads play normally. After installing the locked browser tooling below, run `node tools/endless-floor5-profile.cjs` and `node tools/floor5-workstation-visibility.cjs`.

On the M1, median frame time was 16.7 ms in both views before and after the change. The measurements cover local Chromium with touch emulation. Physical iPhone and Android measurements remain open. [Cold and warm results, pass breakdown and raw samples](docs/endless-profile/README.md)

The November 9 audit verified the earlier launch and replay fixes through gameplay, pause and lobby return on the published site. [Gameplay fixes in PR #3](https://github.com/capstere/Cartridge-strike2/pull/3) · [Verification in PR #4](https://github.com/capstere/Cartridge-strike2/pull/4) · [Audit and screenshots](docs/playtest-audit/README.md)

## November 10 handover checks

| Check | Status |
| --- | --- |
| Both factions and both objective routes | **PASS on Pages.** The browser drove the player slot through a plant and a defuse in North Laboratory. A player escort and a bot escort rescued both hostages. After a combat death, the spectator camera cycled through living teammates in both directions. [Seeds, routes and screenshots](docs/playtest-audit/november-10/README.md#objective-routes-and-spectator-controls) |
| Saved characters | **PASS on Pages.** A fresh Studio export appeared in first and third person on both teams. Cancel, retry, replay and recovery from an incompatible copy passed in an isolated local browser profile. [Character checks and reproduction](docs/playtest-audit/november-10/README.md#device-local-character-studio-pilot) |
| Published rendering | **PASS on Pages.** All nine views matched pixel for pixel. The open Cargo Lift saved 352 world draws. [Rendering PR](https://github.com/capstere/Cartridge-strike2/pull/6) |

## Remaining work

Physical iPhone and Android controls and audio are **pending**. No handset was available for the November 10 check. Use the device session at the top of this handover and also record how aiming, hit feedback and bot difficulty feel to the player. The recorded browser routes cover objective outcomes and spectator behavior.

## Verification

Run the core checks from the repository root. If you change runtime files, refresh the affected entries and byte total in `build-info.json` and verify them. The door sweep uses the actual published floor plan.

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
```

For browser regression checks, install the locked tooling and matching Chromium once. Start the HTTP server in a separate terminal, then run the relevant smoke tests from the repo root.

```sh
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
node tools/match-flow-browser.mjs
node tools/mobile-smoke.cjs
```

When handing work back, update the first open task, link any measurements or PR, and distinguish published-site play, local browser play, simulation and physical-device observations.

## November 15 — performance pass implementation

See [the 2026-11-15 performance pass](docs/performance-pass.md) for source-verified
rendering changes, tests, the earlier 1,918/2,377 draw-call baseline and explicit
validation limits. Desktop standard pixel ratio is lowered, a gated adaptive
resolution controller samples real active-frame intervals, simulation catch-up
is capped, mirrored opaque furniture can batch with correct face winding, and
non-Floor-5 SSAO is cheaper. **These changes do not yet constitute measured
FPS gains on physical laptops or mobile devices.**

Continue the first open task above and run the after-change
`tools/endless-floor5-profile.cjs` and `tools/floor5-workstation-visibility.cjs`
tests before claiming an improvement. Record before/after frame p95, draws,
triangles, visual differences and device/browser characteristics.

## November 16 — measured rendering and simulation optimization

**PASS in local Chromium / Apple M1 Metal and simulation.** The pass starts at
PR #13's merged main and adds three measured changes: opaque-wall actor draw
culling after posing, spatial-index query reuse, and exact cached bone matrices
for CPU skin sampling. Three matched repetitions reduced active-combat median
CPU work by 20.5% in touch emulation and 14.1% on desktop at identical resolution.
Median display interval remains 16.7 ms; C08 p95 remains about 33 ms.

[Raw measurements, source fingerprints, tests and remaining work](docs/measured-performance/README.md).
Six paired browser traces and 10,800 simulation steps retained identical recorded
state/events. All 192 unit tests, 102 door traversals, 25 pixel comparisons and the
relevant browser/lifecycle checks passed. A floor-interior shortcut was rejected
because isolated measurement did not establish a benefit. The old Danceman and
software-render menu tests now measure the actual simulation/browser clock.

**Next actionable task remains the physical iPhone/Android session at the top.**
GPU execution-time attribution, broader hardware/thermal sampling, shader-variant
cost and whole-map portal culling remain open; no physical-device pass is claimed.

## November 16 — asset loading and memory

Three measured improvements: lossless Danceman gzip loading, shared immutable
operator animation splits, and shared skin palettes within each cloned avatar.
[Measurements, dependency/disposal audit and remaining work](docs/asset-memory/README.md).
Cold recorded model/audio HTTP transfer falls 16.11 → 12.19 MB; active skeletons
102 → 18; track arrays 8.94 → 1.89 MB. Twenty-cycle before/after cleanup is stable;
warmed game/lobby GPU textures fall 230/14 → 163/7. Local readiness timings do
not improve, so no startup-speed gain is claimed. Original GLBs, all clips,
textures and gameplay remain intact. Physical handset testing remains the first
open task; Safari, real network and whole-renderer async teardown stress remain open.


## November 16 — mobile input and CI reliability

Completed emulated reproduction and fixes at 844×390 and 932×430: weapon changes
retain held movement/look pointers, multiple fingers retain a held action until
its last release, and orientation changes pause combat/audio for explicit Resume.
[Before/after samples, CI audit and validation](docs/mobile-ci/README.md).
The CI policy removes the obsolete feature push trigger, cancels stale PR runs,
keeps full pre-merge browser checks, and uses fast integrity/unit/door checks on
main instead of repeating browser suites after merge. No FPS or physical-phone
gain is claimed. The next genuine task remains the physical iPhone/Android
session at the top, with particular attention to three-finger capture, rotations,
safe areas and audio interruptions. Browser emulation does not close that task.


The first focused CI run timed out collecting unasserted pacing samples on its
software renderer (about 2.3 s/frame). The follow-up makes that profiling opt-in
with `MOBILE_PROFILE=1`, preserving all regression assertions and the bounded
step deadline. Main fast CI passed in 1m31s; Pages byte checks and both native
emulated viewport checks passed. Physical-device validation remains open.

## November 17 — multiplayer foundation (pass 1 only)

Implemented from **7e91731**, preserving PRs #14–#17. The shared Game now supports
independent human controllers separately from client-local presentation, preserves
PvP damage, and exposes a single externally clocked fixed step. Capsule movement
is shared with a headless/prediction boundary. Fresh prepared worlds no longer
share nested mutable source data; door, glass, elevator and navigation isolation
is tested. Both manifest maps construct in actual Node without DOM shims.

[Implementation, cache/import audit, framework decision, exact commands and
limitations](docs/multiplayer/README.md). The pinned Colyseus/SDK loopback spike
proves fixed input, acknowledgements, authoritative correction and framework-owned
replay using the existing movement code. It is test-only, bound to localhost.
Eight offline traces (9,600 steps) retain identical recorded state/event hashes.
The existing desktop/touch, match-flow, 20-cycle lifecycle and objective-route
checks pass; physical-device validation remains uncompleted.

**Next multiplayer step:** review this feature PR; authorize pass 2 separately
before implementing `prompts/02_NETWORK_SLICE.txt`. No network game UI, public
server, tunnel, deployment or auto-merge was added. Full online roster/rules,
handshake, life IDs, prediction through dynamic state, combat rewind and reconnect
remain for later passes. **The first open physical-mobile task above is unchanged.**

## November 17 — Foundation merged; local network slice for review

Reviewed Foundation PR #18's implementation, validation, completed review and
both successful CI jobs, then merged the expected head as **20289c50**. No failed
check was bypassed. The new `feat/multiplayer-network-slice` branch starts there
and implements only `prompts/02_NETWORK_SLICE.txt`.

Two human clients can create/join the same private local room in the existing FPS
presentation. Colyseus clocks the shared authoritative Game at 60 Hz with 20 Hz
patches; its SDK owns movement prediction, reconciliation and remote interpolation.
Pulse SMG combat, ammunition, reload, score, death and respawn use existing rules.
The slice uses synthetic-demo with fixed doors/glass and bundled default models;
unsupported online systems are disabled without changing offline Classic/Endless.

[Run commands, actual test results, screenshots, validation limits and remaining
work](docs/multiplayer/network-slice.md). The report distinguishes two-browser
loopback/latency tests from physical devices and internet play, and records
initial validation failures as well as final results. The unchanged offline
state/event traces still match over 9,600 steps.

**Next multiplayer task: review [Pass 2 PR #19](https://github.com/capstere/Cartridge-strike2/pull/19)
and its CI. Do not auto-merge it.** The final local results are 213 core tests,
seven server/protocol tests, full two-browser loopback/100 ms jitter gameplay,
24 join/leave cycles and a normal-launch smoke without test hooks. Follow-up
fixes explicitly remove SDK signal callbacks and prevent late shot confirmations
from duplicating effects after stalls, pause or death. Software-renderer coverage
passes; visible native-window mouse capture on this Mac remains unverified.
The report records initial CI failures, a measured whole-job timeout and the
required final-head checks. Repeated join tests now batch the application call
to avoid retyping identical form fields; all 24 rendered cleanup cycles remain.
Pass 3, dynamic Floor 5 networking, bounded combat rewind, reconnect grace and
public deployment require separate authorization. No public server/tunnel was
started. **The first open physical iPhone/Android task at the top is unchanged.**

## November 17 — Pass 2 merged; real Floor 5 multiplayer for review

Reviewed PR #19 at `014b316e`, its implementation, validation, review threads
and successful required CI. A fresh unchanged 20-cycle lifecycle run and normal
two-browser launch passed. The headed Mac pointer-lock error also reproduced on
a plain canvas without game code; physical-window capture remains unverified.
Merged the expected head as **ad6742ce**, then created `feat/multiplayer-floor5`
from that main. No failed check was bypassed.

Pass 3A.1 uses the exact published prepared Floor 5 on both client and authority,
including the original furniture, materials, collision and FPS presentation.
All 51 hinged doors and both existing spawn-cabin shutters are server owned,
replicated on late join and simulated with the same controller during prediction.
Generated map, resolved collision, configuration, protocol and build hashes gate
admission. Online glass stays intact and solid. The two-human cap and existing
Pulse SMG combat, scoring, respawn and SDK prediction/interpolation remain.
Measured online-only loading of three unused resident models was removed
(7,982,418 compressed bytes per fresh client); offline residents and all assets
remain intact. The network browser test rejects those unnecessary requests.

[Implementation, reproducible tests, measurements and limitations](docs/multiplayer/pass3a-floor5.md).
Offline Classic/Endless state and event traces still match over 9,600 steps;
the existing mobile, objective-route, visibility, shared-animation, compatible
character and 20-cycle lifecycle regressions pass. No original level or asset
was changed. Physical handset testing is still uncompleted.

A later admission-error probe caught an empty-lobby render crash after leaving a
network round. The reset now synchronizes its round/phase markers. Every network
cleanup cycle must actually render in the lobby and again after rejoining; the
normal-launch test also checks for a fatal error after returning. The report
records the original coverage gap and before/after recovery evidence.

The first Linux run passed the server and all offline checks but reproduced a
second-scene software GPU startup timeout. The browser harness now uses separate
GPU processes. A documented reduced-resolution software functional profile
passes both network scenarios and 24 cleanup cycles locally; native performance
is measured separately at full resolution and normal forward view. Required
Linux checks must pass on the final PR head.

**Next genuine task: review [Pass 3A.1 PR #20](https://github.com/capstere/Cartridge-strike2/pull/20) and its final required CI.
Do not automatically merge it.** Full online 5v5/objectives, bounded hitscan
rewind, reconnect grace, LAN/internet hosting, capacity soak and Raspberry Pi
deployment remain outside this delivery and need their own authorization.
No public multiplayer server or Pass 3A.1 Pages release was deployed.
The first open physical iPhone/Android task above remains open.
