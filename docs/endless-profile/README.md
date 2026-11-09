# Floor 5 Endless rendering profile

9 November 2026 · Local HTTP · Analysts · seed 42

At the Analysts elevator, four hidden mirrored workstation kits cost 352 draw calls for 4,224 triangles. Applying the existing opaque-wall test to those kits cut total submissions by 15.5% at the lift and 41.3% at the C08 encounter trace. The Apple M1 delivered a 16.7 ms median frame interval in both scenes on both builds. [Per-frame measurements and trace totals](measurements.json) · [Active handover](../../HANDOVER.md)

## Reproduce the scenes

Use the repository's locked Playwright Core and Chromium. Serve the checkout from its root with `python3 -m http.server 8765`. Open `/fps/?test&realtime&seed=42` and launch from the lobby Start button. Use the default prepared Floor 5, Analysts, Originalkaraktär, default Pulse SMG and low graphics. The browser uses touch emulation at 844×390 CSS px, device scale factor 2 and a 658×304 game drawing buffer. All ten team actors, including the nine active bots, remain in the simulation. The default hostages and wanderers also run.

| Camera | Position and direction in world space | Timing in simulated seconds |
| --- | --- | --- |
| Cargo Lift | Before any movement, eye `(-20.541, 1.58, -30.03999)`, direction `(0, 0, 1)`, yaw π and pitch 0. | Trace at the first frame at or after 1 s. Sample intervals from 2 to 6 s. |
| C08 | Eye `(20, 1.58, -5.4)`, direction `(0.70441, 0, 0.70979)`, yaw −2.36 and pitch 0. | At 12 s the profiler switches the rendered view to a fixed observer. The player stays at the lift. Sample from 20 to 24 s, then trace the next frame. |

The C08 camera looks along the bots' seed-42 engagement. The game generated 20 shots within 15 m of the observer in the baseline cold Metal window. The raw report records the shooter IDs and shot count for each run. The game controlled bot positions, gunfire and damage throughout.

```sh
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
PROFILE_ANGLE=metal node tools/endless-floor5-profile.cjs
PROFILE_ANGLE=swiftshader node tools/endless-floor5-profile.cjs
PROFILE_ANGLE=metal node tools/floor5-workstation-visibility.cjs
```

Omit `PROFILE_ANGLE` to use Chromium's default backend. The profiler records the actual WebGL device string. To reproduce the before rows, run the profiler from this branch with `FPS_TEST_ORIGIN` set to the local HTTP origin of a checkout at `2957bed`. Each invocation writes its two launches under `test-results/endless-floor5-<backend>.json`. [Baseline commit](https://github.com/capstere/Cartridge-strike2/commit/2957bedb16b86f3b0a1ccce9cd43bc3818986a19) · [Profiler](../../tools/endless-floor5-profile.cjs) · [Visibility check](../../tools/floor5-workstation-visibility.cjs)

## Submitted work

The development-only probe wraps `WebGLRenderer.renderBufferDirect` during one live frame per scene and records changes in Three.js's call and triangle counters. Scene identity separates the world and first-person passes. Scene-graph ancestry identifies the owning furniture cell, actor or effect. Owner and pass totals independently reconcile to the engine's combined counter. Trace frames fall outside the timing windows. [Renderer](../../src/fps/render-engine.mjs) · [Scene construction](../../src/fps/render.mjs)

| Owner or pass, cold Metal trace | Lift before | Lift after | C08 before | C08 after |
| --- | ---: | ---: | ---: | ---: |
| Furniture cells | 1,045 | 693 | 2,769 | 1,097 |
| ↳ Workstation kits within those cells | 352 | 0 | 1,852 | 180 |
| Team actor models and attached gear | 734 | 734 | 593 | 593 |
| Everything else in the world | 472 | 472 | 668 | 668 |
| **World pass** | **2,251** | **1,899** | **4,030** | **2,358** |
| **First-person SMG pass** | **19** | **19** | **19** | **19** |
| **Combined draws** | **2,270** | **1,918** | **4,049** | **2,377** |
| **Combined triangles** | **1,061,778** | **1,057,554** | **932,362** | **912,298** |

The four I04 kits were `NY-OBJ-0024`, `NY-OBJ-0483`, `NY-OBJ-0538` and `NY-OBJ-0539`. Each submitted 88 draws. At the C08 trace, 19 mirrored kits dropped out of the draw list. Their 8 m furniture cells intersect the view, while one nearby opaque span fully covers each individual kit. Mirrored transforms already take the independent-model path. The change registers an additional item bound for rigid opaque models on that path with at least 32 meshes. Camera movement and lift-panel progress invalidate occlusion through the existing visibility code. [Furniture batching](../../src/fps/project-batches.mjs) · [Opaque-span test](../../src/fps/project-visibility.mjs)

## Startup

One fresh Chromium process and empty browser context per build and backend. A warm launch returns through Pause → lobby and starts again on the same document with its assets and renderer resident. Playable time is the first completed active game frame observed with the HUD visible and the loading overlay hidden. Local resource transfer sums same-origin Resource Timing entries completed by that frame, from navigation on cold runs and from Start on a replay. Optional external fonts were disabled. Storage, HTTP serving and OS caches on this Mac affect the cold numbers.

| Backend | Build | Cold navigation to playable | Cold Start to playable | Warm Start to playable | Local resource transfer, cold / warm |
| --- | --- | ---: | ---: | ---: | ---: |
| Metal | Before | 4.184 s | 3.996 s | 0.894 s | 37,864,534 / 0 B |
| Metal | After | 3.988 s | 3.847 s | 0.898 s | 37,864,976 / 0 B |
| SwiftShader | Before | 38.728 s | 31.714 s | 1.579 s | 37,864,534 / 0 B |
| SwiftShader | After | 37.461 s | 28.683 s | 0.897 s | 37,864,976 / 0 B |

## Steady play

Apple M1 MacBook Pro, 16 GB, macOS 26.6.2. Both backends ran in headless Chromium 153.0.8010.12. The hardware run reported ANGLE Metal on Apple M1. The software run reported ANGLE Vulkan with SwiftShader. The profiler takes consecutive rendered-frame intervals from the browser animation timeline, averages the middle pair for an even-sized median, and uses nearest-rank p95. These are browser frame intervals. GPU execution time and physical-display latency were outside the capture.

### Apple M1 / Metal

| Scene | Build | Launch | Frame intervals | Median ms | p95 ms | Draws per frame | Triangles per frame |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Cargo Lift | Before | Cold | 226 | 16.7 | 33.3 | 2,284–2,308 | 1,046,000–1,060,728 |
| Cargo Lift | Before | Warm replay | 214 | 16.7 | 33.3 | 2,284–2,308 | 1,046,000–1,060,728 |
| Cargo Lift | After | Cold | 223 | 16.7 | 33.3 | 1,932–1,956 | 1,041,776–1,056,504 |
| Cargo Lift | After | Warm replay | 213 | 16.7 | 33.3 | 1,932–1,956 | 1,041,776–1,056,504 |
| C08 firefight | Before | Cold | 173 | 16.7 | 33.4 | 3,827–4,052 | 799,728–954,510 |
| C08 firefight | Before | Warm replay | 174 | 16.7 | 33.4 | 3,827–4,052 | 799,728–954,510 |
| C08 firefight | After | Cold | 187 | 16.7 | 33.4 | 2,155–2,378 | 779,664–934,222 |
| C08 firefight | After | Warm replay | 182 | 16.7 | 33.4 | 2,155–2,380 | 779,664–934,446 |

### SwiftShader on the same Mac

| Scene | Build | Launch | Frame intervals | Median ms | p95 ms | Draws per frame | Triangles per frame |
| --- | --- | --- | ---: | ---: | ---: | ---: | ---: |
| Cargo Lift | Before | Cold | 39 | 616.6 | 683.4 | 2,284–2,308 | 1,046,000–1,060,728 |
| Cargo Lift | Before | Warm replay | 39 | 600.0 | 700.0 | 2,284–2,308 | 1,046,000–1,060,728 |
| Cargo Lift | After | Cold | 39 | 600.0 | 666.6 | 1,932–1,956 | 1,041,776–1,056,504 |
| Cargo Lift | After | Warm replay | 39 | 600.0 | 683.4 | 1,932–1,956 | 1,041,776–1,056,504 |
| C08 firefight | Before | Cold | 45 | 466.8 | 1033.2 | 3,828–4,047 | 799,842–947,396 |
| C08 firefight | Before | Warm replay | 42 | 466.7 | 933.2 | 3,828–4,047 | 799,842–947,396 |
| C08 firefight | After | Cold | 46 | 450.0 | 883.3 | 2,156–2,378 | 779,778–934,222 |
| C08 firefight | After | Warm replay | 40 | 450.0 | 516.6 | 2,155–2,378 | 779,892–934,222 |

The November 9 audit recorded 2,251–2,284 elevator draws in SwiftShader samples that included startup frames. The separate startup and steady windows above give a new local comparison. SwiftShader still took hundreds of milliseconds per frame in the sampled scenes. [Earlier audit](../playtest-audit/README.md)

## Movement and visibility

A keyboard forward input moved the live player 0.42 m and a touch drag changed yaw by -0.166 rad. Pause returned to the lobby. After exercising input, the visibility check froze the simulation and drew each pose twice on Metal. One draw used the shipped item culling. The second re-enabled individual items under visible cells and used the original cell culling alone. The comparison reads every RGBA pixel in the world pass, including areas subsequently covered by the weapon. As a positive control, the check also rendered each pose with the I04 desk kit explicitly removed.

| Fixed view | World draws with cell culling alone | World draws with item culling | Changed world pixels | Pixels contributed by the sampled I04 kit |
| --- | ---: | ---: | ---: | ---: |
| lift closed | 1,344 | 1,344 | 0 | 0 |
| lift opening | 2,063 | 1,711 | 0 | 0 |
| lift open | 2,237 | 1,885 | 0 | 0 |
| turn inside the lift | 183 | 183 | 0 | 0 |
| through the lift doors | 1,540 | 1,188 | 0 | 0 |
| C08 encounter | 3,661 | 1,989 | 0 | 0 |
| C08 reverse angle | 380 | 380 | 0 | 0 |
| I04 desk | 960 | 872 | 0 | 5,161 |
| I04 reverse angle | 1,066 | 1,066 | 0 | 2,322 |

## Verification and device coverage

The core suite passed 158 tests. The runtime verifier checked all 432 files and the prepared-floor simulation passed 102 door traversals. The match-flow browser check passed delayed startup, retry, lobby audio state and return. The mobile smoke passed emulated touch combat and pause/resume, followed by desktop startup with one pointer-lock request recorded by its test stub. The profile contains 1,921 frame intervals and 16 reconciled traces across eight launches.

| Device coverage | Status |
| --- | --- |
| Apple M1 desktop GPU | Measured, local Chromium with touch emulation. |
| Physical iPhone | Open. Record Safari, device, render backend where exposed, frame timings and the input/audio checks in the handover. |
| Physical Android | Open. Record Chrome, device, render backend, frame timings and the same input/audio checks. |
| Published GitHub Pages | The earlier audit covers the deployed lobby, gameplay and return. These before/after measurements used locally served checkouts. |
