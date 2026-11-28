# CS3-05 authority, controls and play measurements

The Raspberry Pi ran the November 28 acceptance against protocol 18, build `dad083e84e1ccf1997ecfc12be871a14b75d0ab53baf4ff7e8acd9050b83c5d4`. The two-player browser session, ten-seat load and balance runs used separate time windows on Compact Arena. The normal CS2 service continued running.

## Two players on the published game UI

Two headed Chromium sessions entered through Home → Play → Play with friends → LAN. The desktop viewport was 896 × 504. The other session used Chromium touch emulation, initially 640 × 360 and then 568 × 320. Neither URL enabled the game's test mode. A loopback room fixture supplied eight ordinary credited eliminations per player and immediate respawns to reach all three thresholds. Normal server ticks, public room controls, accepted commands and rendering continued throughout.

Both fresh HUDs showed 0/3, 0/5 and 0/8. Pressing H on desktop started a 900-tick UAV. The owner's actual minimap canvas drew 95 orange markers over multiple frames. The other client's private stream contained zero opponent samples and its renderer drew zero such markers. Reconnecting the original socket restored the same activation ID and deadline. The duplicate delivery of the current sample on reconnect accounts for six private sample deliveries over the five-pulse activation. This channel sits alongside existing actor positions replicated for normal game rendering.

At 568 × 320 all three touch controls measured at least 51 × 44 CSS pixels, lay fully inside the viewport and passed center-point hit testing. A real emulated tap activated Immortal. A subsequent ordinary SMG hit preserved the target's health and armor. The shooter saw “Opponent is Immortal” and the recipient saw “Immortal · hit blocked”. Both audio engines requested the 760 Hz immunity cue. The desktop HUD then showed Used for its spent UAV. After death it returned to 0/3 and kept an unused Rage charge. Both sessions completed without page errors. [Browser receipt](browser.json) · [Desktop active UAV and blocked hit](desktop-uav.png) · [Small touch viewport with charged controls](touch-ready.png)

The two-client protocol regression separately covers accepted and stale requests, recipient selection after same-slot replacement, public Rage deadlines and complete rematch reset. The shared simulation tests cover Classic rounds, death carry, every ordinary damage kind, administrative damage, exact expiry, mid-slide speed transitions and delayed rockets/HE at both launch and impact. [Socket regression](../../../../server/test/online-bonuses.test.mjs) · [Simulation regression](../../../../src/fps/bonus-game.test.mjs)

## Bounded ten-seat server load

Ten genuine SDK clients moved at 20 input frames/s per seat. Following 240 baseline fixed ticks, all ten clients requested UAV through their own sockets. Each received five pulses containing its five enemies. The workload delivered 250 total sampled contacts across 50 private updates. The largest payload measured 715 bytes as JSON. The input queue peaked at one frame with zero drops and zero backpressure events over 3,820 client frames.

| Window | Fixed ticks | Median | p95 | p99 | Maximum |
| --- | ---: | ---: | ---: | ---: | ---: |
| Moving seats before activation | 240 | 0.608 ms | 1.314 ms | 2.690 ms | 3.673 ms |
| Concurrent UAV effects through expiry | 901 | 0.512 ms | 1.045 ms | 2.046 ms | 5.719 ms |

The timer wrapped the authoritative room tick. Serial setup used the shared award transition to preload each seat. Packet byte counts describe the JSON representation. Separate session timing and JIT warmup can account for differences between windows. [Ten-client receipt](load.json)

## Initial play balance

Two seeded 180-second normal-difficulty 5v5 bot matches ran the existing Endless rules with manual bonus activation. Bots never activated a bonus. On seed 42 they recorded 118 eliminations, with 15 lives reaching UAV, five reaching Rage and four reaching Immortal. On seed 81 they recorded 118 eliminations, with 14, nine and six lives reaching those same thresholds. These distributions measure award opportunities on this map with those opponents.

On a matched 15-tick forward input, the ordinary player covered 1.05 m and the Rage player covered 1.26 m. Their SMG reloads took 1.80 s and 1.35 s. Each lost 18 HP to the same ordinary SMG hit. Immortal covered 1.05 m and lost zero HP. Physical-phone handling, headset listening and subjective human balance require separate play evidence. [Seeded matches and matched inputs](balance.json)

## Reproduce

Run one Pi job at a time in the checkout with server dependencies and the existing Playwright installation available. To save the same evidence, set `CS3_BONUS_EVIDENCE` to an output directory for the two-player captures, and `CS3_BONUS_LOAD` and `CS3_BONUS_BALANCE` to JSON output filenames for the independent runs.

```sh
WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 FPS_NETWORK_ANGLE=gl-egl \
  node --import ./server/register-shared.mjs tools/online-bonuses-browser.mjs
node --import ./server/register-shared.mjs tools/bonus-load.mjs
node --import ./server/register-shared.mjs tools/bonus-balance.mjs
node --import ./server/register-shared.mjs --test --test-concurrency=1 \
  src/fps/bonuses.test.mjs src/fps/bonus-game.test.mjs src/fps/bonus-hud.test.mjs \
  src/fps/rush.test.mjs server/test/online-bonuses.test.mjs
```
