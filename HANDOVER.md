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
