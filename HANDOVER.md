# Cartridge-Strike 2 handover

**First open task — profile the Endless spawn on Floor 5.** Find out which part of the scene accounts for the draw calls at the Analysts elevator. Use that result to decide whether a targeted optimization is warranted.

The launch, replay, lobby music, shop and mobile input fixes landed in [PR #3](https://github.com/capstere/Cartridge-strike2/pull/3). The final verification landed in [PR #4](https://github.com/capstere/Cartridge-strike2/pull/4). The published game passed lobby → match → pause → lobby. The November 9 suite passed 158 tests, verified 432 runtime files and traversed 51 interactive doors in both directions. [Full audit and screenshots](docs/playtest-audit/README.md) · [Play](https://capstere.github.io/Cartridge-strike2/)

## 1. Reproduce and explain the rendering cost

1. From the repo root run `python3 -m http.server 8765`. Open `http://127.0.0.1:8765/fps/?test&realtime&seed=42`. Select **Analysts**, **Endless Action** and **Originalkaraktär**. Use the default Floor 5 map, low graphics and an 844×390 viewport for the initial comparison. Keep all ten actors. Record the camera position and direction before moving.
2. Capture a cold launch and a warm launch. Separate time to the first playable frame from steady play. At the elevator and again during a busy encounter, record draw calls, triangles, median and p95 frame time, sample count, browser, device and graphics backend. Keep the view and settings fixed across comparisons.
3. Trace the render passes and the largest contributors with a browser frame capture or temporary local instrumentation. The engine counts both the world and first-person weapon passes. The November 9 elevator samples recorded **2,251–2,284 draw calls per frame** on SwiftShader. That observation leaves the dominant source and the impact on a hardware GPU open. [Renderer](src/fps/render.mjs) · [Render passes and counters](src/fps/render-engine.mjs) · [Render budget](src/fps/render-budget.mjs)
4. Compare a hardware desktop, iPhone and Android when available. Without a physical device, do the draw-call breakdown in Chromium, record the backend and leave the device rows open. The existing render smoke checks controlled scenarios with bots disabled or removed. Use the populated realtime scene for this comparison. [Render smoke](tools/render-performance-smoke.cjs)

**Done when** the handover contains a reproducible scene, a results table and evidence identifying the dominant contributor or the next experiment that would distinguish the remaining causes. If a small fix is demonstrated, include before/after results for the same scene and check movement, aiming, visibility and the lobby return. A measurement pass is a valid outcome when the data do not justify a change.

## Remaining work, in order

| Work | Check that closes it |
| --- | --- |
| Physical mobile controls and audio | At approximately 844×390 and 932×430, test simultaneous move/aim/fire, reload, jump, hold an objective, buy, rotate, background and resume. Record device, browser, safe-area clearance and whether the theme stops and resumes correctly. |
| Match lifecycle over time | Run 20 lobby → Classic/Endless → buy → pause → lobby cycles. Compare settled geometry, textures, audio nodes and event listeners against the warm baseline. Trace any sustained growth to its owner. |
| Human play and bot behavior | Play both factions and objective routes, including spectator cycling. For repeatable stalls, spawn kills or collision snags record seed, room, position and steps. |
| Saved characters | On a device with a compatible saved character, verify selection, first- and third-person appearance, cancellation, retry and replay. Exercise the recovery path with an incompatible copy. |

## Verification

Run the core checks from the repository root. If you change runtime files, refresh the affected entries and byte total in `build-info.json` and verify them. The door sweep uses the actual published floor plan.

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
```

For browser regression checks, install the locked tooling and matching Chromium once. Start the HTTP server from step 1 in a separate terminal, then run the relevant smoke tests from the repo root.

```sh
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium
node tools/match-flow-browser.mjs
node tools/mobile-smoke.cjs
```

When handing work back, update the first open task, link any measurements or PR, and distinguish published-site play, local browser play, simulation and physical-device observations.
