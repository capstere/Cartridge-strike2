# Cold multiplayer room admission on Raspberry Pi 5

Two ordinary multiplayer rooms reproduce the first-HUD input stall. The unoptimized Floor 5 repeats showed 2.08–2.25 s on desktop and 2.54–2.57 s on the emulated seat between the first visible-HUD rAF and the next callback. Compact Arena showed 1.55–2.02 s and 2.60–2.91 s, respectively. Each delayed frame coincided with delayed trusted pointer delivery. Normal room simulation advanced and keyboard movement reached the authoritative actor.

## What blocked the client

On Floor 5, the first traced repeat spent 1,207/701 ms inside the actual world render (desktop/emulated), then 735/1,343 ms rendering the first-person weapon. Synchronous calls to WebGL getProgramInfoLog accounted for 1,787/1,592 ms in those passes. The second Floor 5 repeat recorded 1,328/718 ms for the world and 778/1,315 ms for the weapon. Compact reproduced both passes and the same type of GL wait. Timings are nested CPU wall times. They do not measure GPU execution duration. Compilation, buffer upload and previously queued driver work can all contribute to one blocking WebGL call.

The prior five Compact captures are included with their source digests in [historical-compact.json](historical-compact.json). The separately measured first-sight remote outfit work and the continuously moving touch/keyboard acceptance have different measurement windows. This experiment addresses cold room entry. It does not close steady-state Floor 5 performance or physical-phone input qualification.

## Matched scenario

- Raspberry Pi 5 Model B Rev 1.1, AArch64 kernel 6.12.96+rpt-rpi-2712, Debian Chromium 156.0.8078.79, Wayland, ANGLE GL-EGL, Broadcom V3D 7.1.10.2. Two visible, fresh browser processes per run. Local authoritative server and both clients share the Pi. Tests run serially with the browser runner at nice level 10.
- The desktop host is 896×504 CSS pixels and the emulated guest is 640×360, both at device scale 0.75. The matched low graphics setting renders 672×378 and 480×270. Audio volume is 0.35 with ambient disabled, default host-selected shotgun outfit, initial SMG, opposite teams, two humans, zero bots, Team Deathmatch, original full maps. The fixture shortens the subsequent countdown to 0.15 s. The product's own operator warm-up still runs in each fresh client.
- Play → Friends → LAN → Create on desktop; guest joins by room ID. Both use the normal Ready control. The first visible HUD is the first browser rAF timestamp at which its DOM hidden flag is false while waiting in the room. Ready time is measured from the create/join marker through delivery and completion of the normal Ready interaction. It includes browser automation scheduling. Time zero is local to each page. HUD visibility and handler receipt do not measure physical presentation or finger-to-photon latency.
- Each browser receives a trusted CDP mouse move about every 100 ms, with at most one outstanding command. Browser event timestamp and handler entry are kept separately. Coalescing means individual maximums are lower bounds; this is not a 100 Hz touch test. Guest Ready/Start input uses browser touch emulation. Normal post-resume W displaces the continuous authoritative actor at least 0.08 m while the room tick advances. Tests keep the normal game and application frame loops running throughout. Server RTT, individual tick durations, and physical handsets were outside this capture.
- The viewport, start pose, camera, draw count, restored scissor, geometry and texture counts accompany the waiting-frame images. Each image samples the actual presented world/weapon canvas on the next normal render; HUD overlays are excluded. PNGs are 320×180. Runs have independently animated scenery, which precludes exact pixel equality. compare.py checks identity of map, protocol, counts, camera pose, V3D driver and scissor before calculating absolute RGB differences.
- Baseline source ea6c67cb7662f6e75822fe49a282b0abd1a9679d, protocol 21, build 1ac88e31ba8f2aa7460034ae3c16f741e2527fb3fbcae199ffcd58681df393c9. Diagnostics and original receipts live separately from experimental runtime commits. Capture both maps with the same instrumentation flags.

## Timing comparisons

Pairs are desktop / emulated seat. All values are milliseconds. The raw receipts retain browser timestamps, nested GL spans, source-stamped inputs and neighboring frame intervals. The continuous keyboard movement and advancing tick checks passed in every recorded case. Repeats establish the existence of the baseline stall. Each experimental variant has one cold pair per map, so its exact savings and tails need independent repeats.

| Map | Variant | Join → Ready | Worst pointer during loading | First post-HUD rAF | Longest post-HUD pointer |
| --- | --- | ---: | ---: | ---: | ---: |
| Floor 5 | Joined baseline | 22987 / 19614 | 3383 / 3776 | 2250 / 2542 | 2174 / 2426 |
| Floor 5 | Entire scene warm-up | 24349 / 21702 | 3370 / 3907 | 117 / 133 | 85 / 36 |
| Floor 5 | Spawn-visible compile | 25268 / 21777 | 3537 / 3866 | 117 / 117 | 8 / 69 |
| Floor 5 | Direct shader polling | 27401 / 21123 | 3419 / 4112 | 117 / 217 | 86 / 90 |
| Floor 5 | Batched first use | 23823 / 19605 | 3366 / 4015 | 100 / 100 | 15 / 83 |
| Compact | Joined baseline | 13302 / 15828 | 467 / 944 | 1550 / 2907 | 1442 / 2726 |
| Compact | Entire scene warm-up | 14385 / 13961 | 1807 / 2035 | 100 / 117 | 60 / 99 |
| Compact | Spawn-visible compile | 14198 / 14916 | 1798 / 2114 | 100 / 100 | 27 / 45 |
| Compact | Direct shader polling | 12917 / 13517 | 1111 / 2345 | 667 / 650 | 521 / 489 |
| Compact | Batched first use | 13940 / 13067 | 524 / 873 | 100 / 100 | 64 / 10 |

## Interpretation and decision

The first two prototypes warmed the normal world and weapon before the Ready screen. Both removed most of the post-HUD stall while adding 1.8–2.1 seconds of loading-screen input delay on Compact. Directly waiting for known shader programs to complete still stalled on a real world submission. Its first Compact post-HUD interval was approximately 650 ms. These prototypes should stay out of the game.

The fourth trial used the same live scene and first-person objects. It linked the visible materials, submitted groups of at most 16 visible drawables under a one-pixel scissor, restored their original layer masks and viewport immediately, and yielded while waiting on a GL fence between groups. Both maps reached 100 ms for the first post-HUD frame. During the preparation itself, peak trusted pointer delays were 555/1,139 ms on Floor 5 and 227/873 ms on Compact. Some synchronous first-use program checks during actual drawing used handles absent from the compile pass. Floor 5 desktop handles 96–100 each consumed 92–142 ms and the worst world group still occupied 551/701 ms on the two seats. This directly identifies a bounded place to investigate.

On Floor 5 the candidate added 836 ms on desktop from join to Ready and changed the guest result by −9 ms. The worst pointer delay anywhere during the guest's loading rose by 240 ms. Compact desktop took 638 ms longer, and the guest reached Ready 2,761 ms sooner. Each candidate has one cold run per map, and the two processes share one Pi. These values cannot establish an admission percentile or a stable total-time improvement.

Floor 5 Batches preserved the spawn pose and the 295/40 draw counts. Mean per-channel pixel difference was at most 0.16/255 on desktop and 1.01/255 on the emulated seat. 0.20%/1.16% of pixels differed by over 15 levels in any channel. Compact preserved 98/109 draw calls; up to 1.37% of pixels crossed this threshold. All four candidate/map/seat combinations restored scissor state. GPU memory at the steady waiting screenshot contained one additional texture per view and 2/1 extra geometries on Floor 5, or four extra on each Compact seat. These are live renderer counters. Their retired-owner measurements appear in the native cancellation section below. The three isolated lifecycle checks cover a successful and reused prepare, abort during async work, and unsupported contexts. The later guarded build exercises native cancellation/disposal below. Physical phones remain unverified.

Keep Floor 5 open. The bounded version merits a controlled repeat and independent review as an experimental change. Its extra admission work, the pre-existing map-load stall and hardware touch responsiveness remain open. Next use a freshly opened pair on both maps alternating reference and candidate, with detailed wrappers disabled and the trusted pointer sentinel enabled. Record admission-to-Ready, join-to-visible-HUD, and first-HUD/input waiting times. The later build below covers cancellation during the warm-up, leave/rejoin and map replacement on the same page. If first-use groups remain expensive, identify missing live shader variants by material, lighting, instancing and skinning using the captured program handles. Preserve full map geometry, visible features, normal input and original simulation settings.

## Source and reproduction

| Detached trial | Revision | Runtime build |
| --- | --- | --- |
| candidate | `987d6f7c502a3c1b9b8725b99ee5f586fa011a16` | `749945bacd7499229910b12a52bd6911f0a35cdb81cf290985325155e7a9e30b` |
| visible | `6757bc7dbd5597e08a96fabbb650f522e7f8c30c` | `a8a0ed3c093ee50a8bccdce3cef66f5b7138bd4b099ecd0d4ac8e0a64a24ec9d` |
| poll | `480a8a3cac188fba14e354436818c0528f0df1d1` | `91f26a0da4091fcf80664bf9607a4e2f020913bb4270f7f3d905c9570b3e896e` |
| batches | `5e8141717869f0ec23834833c6ab782c698a131f` | `e1113bbb16f899d131998be8cbd464b8ff742acf31e24744e6d6940ba2e5656f` |

The retained baseline evidence is named floor5-reference.json and compact-reference.json. Their two corresponding PNGs show the normal waiting frames. The observed JSON files hold the first instrumented reproduction, and trials/ contains the candidate receipts and images. To recalculate the committed Floor 5 pixel and timing comparison from this directory, run:

```sh
python3 compare.py floor5-reference.json trials/batches-floor5
```

With repository dependencies and Playwright installed, run from the matching checkout root. Pass compact-arena to repeat the control and use a new output directory per run.

```sh
WAYLAND_DISPLAY=wayland-0 CHROMIUM_PATH=/usr/bin/chromium \
CS3_FIRST_HUD_MAP=floor5-prepared CS3_FIRST_HUD_STAGES=1 \
CS3_BONUS_COLD_FOCUS=observer CS3_BONUS_RELOAD_CAPTURE=1 \
CS3_BONUS_EVIDENCE=/tmp/cs3-first-hud-repeat-floor5 \
nice -n 10 node --import ./server/register-shared.mjs tools/online-bonuses-browser.mjs
```

## Reversed order and join safety

Revision a926354, build 4b7198979d4422c4123f96dfd5958e8e59cb65d772fb5c0bc4a4558437d629a5, limited optional preparation to five seconds of elapsed time, skipped hidden/lost contexts, and allowed ordinary admission after an optional renderer exception. A synchronous WebGL call already in progress cannot be preempted. Fresh clients visited Floor 5 first and Compact second in this sweep. The earlier batched sweep visited Compact first. The reversal retained the same backend, maps, normal render path, browser settings, two seats and pointer instrumentation.

| Map | Source | Join → visible HUD | Join → Ready | Worst pre-HUD pointer | First post-HUD rAF | Post-HUD pointer |
| --- | --- | ---: | ---: | ---: | ---: | ---: |
| Floor 5 | baseline | 20434 / 16691 | 22987 / 19614 | 3383 / 3776 | 2250 / 2542 | 2174 / 2426 |
| Floor 5 | guarded | 22895 / 22603 | 23460 / 23152 | 3319 / 3700 | 100 / 100 | 56 / 56 |
| Compact | baseline | 11565 / 12502 | 13302 / 15828 | 467 / 944 | 1550 / 2907 | 1442 / 2726 |
| Compact | guarded | 13279 / 12854 | 13859 / 13357 | 538 / 850 | 83 / 117 | 67 / 47 |

The reversed run repeated the first-frame change on both maps. The emulated Floor 5 guest reached Ready 3.54 seconds later than the reference and 3.55 seconds later than the first batched trial. This variation and the persistent 3–4 second loading-screen pointer stall rule out a whole-path responsiveness claim. The related room-revision guard and native lifecycle results have a separate build identity.

## Native cancellation and map replacement

Build 2438ef6bd351251749c2e957a9c003150a19428563031cbb93b67f3ebb444cc5, source fae6958, reuses the bounded room-ready wait after optional rendering. It requires the currently advertised world revision, its confirmed local seat and the corresponding local actor before setting the camera. Cancellation still invalidates the original join. Seven focused lifecycle checks cover normal reuse, abort, two never-ready GPU paths, missing or failed fences, a thrown draw, restored masks/scissor and the revision/seat guard.

Two clients exercised the following lifecycle on the actual renderer:

1. The guest used the LAN form's Cancel button during Floor 5 preparation. Its first join closed and its signal aborted. The lobby menu owned all 11 observed rAFs and the scissor remained restored.
2. The guest rejoined the same room. Upon its second preparation callback, the host selected Compact with the ordinary waiting-room map control. The old preparation aborted while the guest's seat remained open. The menu stayed over all five observed rAFs. The guest opened the revision-2 room with the confirmed local actor counterAnalysts-0.
3. The Floor 5 renderer disposed, its context reported lost, and every tracked experimental fence had been deleted. Three.js recorded zero geometries and one texture on the disposed renderer, which precludes claiming a zero texture counter. Across the complete journey exactly three experimental fences were created and deleted.
4. After the guest left and rejoined Compact, the fixture threw once at the optional fence-submission boundary. The real join still succeeded. The new renderer displayed the correct first-person SMG and world from the guest pose, made 109 draw calls and had its scissor disabled. A final ordinary Leave succeeded without a page exception.

The independent Compact→Floor 5 control finished its original preparation before the host's new map arrived, so it qualifies resource disposal and rejoin only. The Floor 5→Compact run reached the intended pending-revision race twice. The complete receipt and rejoined world frame are in [trials/revision-recovery](trials/revision-recovery). The lifecycle test intentionally injected a GPU error and is excluded from admission timing comparisons.

To reproduce the lifecycle, use the matched command above, add CS3_FIRST_HUD_LIFECYCLE=1 and start on floor5-prepared. The regression test and native fixture are at b2653501ad23feeca29042135bec96dbce1f60d2. No physical device participated.

## Timing on the revision-safe build

With the same detailed wrappers as the matched reference, source fae6958 (build 2438ef6b above) ran Floor 5 and Compact in sequence using the normal create, join, ready and start controls. Desktop keyboard movement reached the authority in both matches. Each map had one cold measurement on this exact build. Additional earlier prototype runs show the direction of the first-frame change. They use different builds.

| Map | Join → visible HUD | Join → Ready | Worst pre-HUD pointer | First post-HUD rAF | Post-HUD pointer | Authoritative W distance |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| Floor 5 | 22782 / 19040 | 23294 / 19340 | 3429 / 3701 | 133 / 100 | 52 / 84 | 0.14 m |
| Compact | 13560 / 12917 | 14049 / 13344 | 520 / 858 | 100 / 117 | 66 / 29 | 0.14 m |

Both Floor 5 views showed the blue elevator doors, floor numeral, gray walls, first-person SMG and team-specific sleeves in their expected positions. The rejoined Compact screenshot showed the orange interior, ceiling lighting, stairway and SMG. The final Floor 5 pair preserved 295/40 draw calls with per-channel mean absolute error up to 1.06/255 and up to 1.70% of pixels differing by more than 15 levels. See the raw builds, RGB measures, normal input and timestamped frames for all seats in [session-floor5.json](session-floor5.json) and [session-compact.json](session-compact.json).

The final Floor 5 join-to-visible-HUD moved 2.35 seconds later on both clients. Join-to-Ready changed by +307 ms on desktop and −273 ms on the emulated seat. The 3.4–3.7 s loading-screen pointer stall survives. The evidence supports the first usable frame specifically. It does not qualify total admission speed or steady-state Floor 5 rendering. The next isolated trace should put the same trusted-input sentinel around Floor 5 map validation, CPU world construction and renderer creation during load.
