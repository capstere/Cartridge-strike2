# Pi 5 performance baseline

This baseline exercises two shipped games from their normal local entry points. Field branches must repeat the CS2 benchmark on the same scene and hardware to evaluate a regression. An offline Khamsin match in Frontline has twelve combatants. Endless on Floor 5 has ten combatants. The sample records the current resident count for each input profile. The geometry, AI, world lighting, item definitions, audio banks and simulation clocks differ. The following controls make the observed sequences comparable.

## Client results

Three 10 s forward-view samples per game and input, with the same Pi, browser geometry, neutral FOV and graphics tier. The table gives the range of each run's quantile, in milliseconds. “Worst” is the slowest submitted frame interval across the three runs. [Per-run inputs, timings, graphics and environment](client.json)

| Scenario | p50 | p95 | p99 | Worst | Start to playable, cold / warm |
| --- | ---: | ---: | ---: | ---: | ---: |
| CS2 desktop | 71.8–73.0 | 91.4–96.5 | 95.8–117.0 | 140.4 | 23.0 / 8.4–8.8 s |
| CS2 touch | 63.8–70.1 | 78.3–83.0 | 108.6–111.0 | 118.0 | 20.1 / 7.9–8.2 s |
| Frontline desktop | 47.2–49.4 | 67.4–76.0 | 81.1–127.2 | 156.6 | 66.7–67.1 / 17.2 s |
| Frontline touch | 43.2–43.7 | 61.1–64.9 | 72.7–78.4 | 141.0 | 48.7 / 16.0–16.6 s |

Each action has one sample per run. The values below span the three observations, in milliseconds from source input to the indicated event. “Fire” includes the exit from held Rush for Frontline. The CS2 desktop equivalent holds sneak, and CS2 touch continues ordinary movement. The omitted Rush value corresponds to the unimplemented CS2 mechanic.

| Scenario | First displaced frame | Rush pose above 2% | First ammo decrement frame | Local rifle audio schedule | Reload to full magazine |
| --- | ---: | ---: | ---: | ---: | ---: |
| CS2 desktop | 79–100 | — | 85–147 | 28–54 | 2675–2788 |
| CS2 touch | 238–262 | — | 207–299 | 137–162 | 2593–2801 |
| Frontline desktop | 62–79 | 38–55 | 135–207 | 103–164 | 2032–2062 |
| Frontline touch | 101–135 | 117–155 | 239–302 | 207–275 | 2071–2114 |

The state trace confirms the donor start, displaced weapon pose, held fire canceling Rush, legal rifle fire and reload. CS2 shows its existing movement, shot and reload. These forward-view scenes on this Pi did not reach a 33.3 ms median frame interval. Higher refresh hardware, physical mobile input latency and actual display/audio onset require separate measurements. The matched offline pair uses 844 by 390, with no additional 932 by 430 performance repeat in this receipt.

## Floor 5 authority

Each profile uses three 90 s repeats with two SDK seats, eight AI bots and six residents. Each table cell gives the range of the three per-run quantiles or extremes in milliseconds. Shot confirmations correlate a sent action to the first matching shot event received by the same seat. The samples omit rejected or unconfirmed actions. [Per-run authority receipts](network.json)

| Network profile | Measurement | p50 | p95 | p99 | Worst |
| --- | --- | ---: | ---: | ---: | ---: |
| Loopback | Tick execution | 1.40–1.50 | 5.19–5.99 | 18.44–19.49 | 81.36–86.03 |
| Loopback | Tick start intervals | 16.19–16.20 | 20.95–22.05 | 32.30–32.33 | 81.61–86.28 |
| Loopback | Input to confirmed shot | 34.88–36.07 | 58.04–62.96 | 65.20–67.72 | 82.11–100.70 |
| 100 ms delayed | Tick execution | 1.43–1.51 | 5.08–5.49 | 15.80–16.68 | 63.55–105.53 |
| 100 ms delayed | Tick start intervals | 16.07–16.08 | 19.85–20.73 | 32.26–32.37 | 64.98–109.07 |
| 100 ms delayed | Input to confirmed shot | 141.16–141.55 | 172.99–175.74 | 184.75–187.71 | 187.90–193.43 |

| Profile | Tick executions over 16.67 / 33 / 50 / 100 ms | Tick intervals over 33 / 50 / 100 ms | Confirmations per run | Server CPU, % of one core | RSS, MiB | Outbound / inbound, KiB/s per seat |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| Loopback | 63–79 / 15–22 / 9–11 / 0 | 23–26 / 9–14 / 0 | 268 | 16.8–18.0 | 269.0–279.5 | 28.55–29.19 / 1.48–1.49 |
| 100 ms delayed | 47–55 / 9–15 / 3–8 / 0–1 | 17–28 / 4–9 / 0–1 | 270 | 16.4–16.8 | 266.4–272.7 | 27.59–28.03 / 1.48 |

A pathfinding wrapper occupied 61.69 to 102.80 ms of each run’s slowest tick. The 105.53 ms execution in the second delayed repeat included a 102.80 ms navigation call. Each receipt preserves the specific wrapper, including world.findPath and navigation.findPath, plus the per-call distribution. This reproduces pathfinding as a contributor to these six execution outliers. The distribution of inter-tick delays has additional causes that the timings do not isolate. The server reported a maximum queue depth of 5 to 7, zero invalid inputs, zero drops and zero backpressure events.

Compare a candidate against three same-profile, paired baseline runs on this Pi, using identical bots, residents, server clock, synthetic delay, jitter, scripted inputs and timing. Investigate when the candidate median repeat p95 or p99 for tick work, tick intervals or shot confirmations exceeds that row’s upper endpoint, or when its median slow-execution count exceeds the observed range. The 16.67 ms simulation budget is an independent engineering target. All six rooms cleaned up. A single extreme, network transport over the public Internet and physical handset scheduling require separate evaluation.

## Networked touch

A separate emulated Chromium touch client entered the normal hosted flow, selected Compact Arena with a second SDK seat, played, disconnected and reconnected to the same map. The stick moved the player 0.64 m and Fire reduced the magazine from 30 to 28. The match ended on time and the final departure left zero rooms. In a 10 s window after 3 s warmup, client intervals were 19.3 / 27.6 / 51.3 / 89.8 ms (p50 / p95 / p99 / worst). On the same window, authority execution was 0.61 / 1.23 / 2.88 / 10.49 ms and successive authority tick starts were 16.16 / 22.14 / 32.32 / 32.72 ms. This used local TLS, one rendered client at 915 by 412 CSS pixels, one SDK peer, low graphics and a 499 by 224 sampled buffer. The cross-check covers entry, touch, transport, continuity after reconnect and room closure. It has one observed run and supports functional reproduction. [Online touch receipt](online-mobile.json)

## Repeated match lifecycle

Four warmups and twenty measured alternating Classic/Endless matches completed on the native Pi 5 renderer. Each cycle exercised the shop, three resident rigs, proximity music, a real background tab pause, resume, restart and explicit garbage collection. On every measured return to the lobby, the browser retained one game, one Web Audio context, three audio nodes, 270 JavaScript event listeners and four resident instances. There were zero active or ambient gameplay voices. The game and lobby each owned one pending animation callback. The last three samples of each mode had stable GPU counts. At the endpoint the game had 1,332 geometries, 165 textures and 106 programs, and the lobby had 29, 7 and 10 respectively. These counts describe the original lifecycle fixture on this build. Heap-retainer bytes and driver memory are outside its assertions. [Lifecycle receipt](lifecycle.json)

## Comparison gate

On a change to the CS2 renderer or controls, run the baseline and candidate with the same active scene, quality, DPR, roster, forward view, input profile and three-repeat procedure. Use the upper end of that input's p50, p95 and p99 interval ranges above as the initial comparison envelope. A candidate median across repeats above an upper endpoint triggers a paired rerun and investigation. Report the absolute worst, slow event counts per ten seconds and draw/resolution changes alongside quantiles. A faster run at lower effective resolution cannot establish a renderer improvement. Compare startup only within the same cache class. Keep the existing tunable quality and 16.7/33.3 ms client goals visible independently of this baseline.

Compare actions by input-to-first-state, first completed render, authority and audio schedule independently. Use the three paired observations as a range to investigate. Three independent action samples cannot establish a stable p95. The donor ranges characterize the Rush choreography for the new vertical slice. Validate the new mechanic on each target using its own scene, an uncut motion capture, both input types, a 30 fps profile where attainable and reduced motion. Report device identification, overlap with other clocks, blocked readiness, canceled edges, duplicate confirmations and physical handset status.

## Client protocol

- Start a private loopback HTTP server, block external host resolution and use an isolated browser context. Launch headed system Chromium on the Pi 5 Wayland EGL driver. Select low graphics, manual fire, an 844×390 CSS viewport, a device scale of 0.65 and a neutral world FOV of 76°. Both inputs use landscape. Touch is emulated with Chromium’s real pointer-event path.
- In CS2 choose Endless, launch, buy the free Arc Rifle from the normal equipment screen and return to play. The default setup seeds the match with 42. In Frontline choose Play → Solo → Khamsin → Deploy with the M4A1 and wait for the countdown. On a fresh touch browser, take the installation help and play-in-browser options. Frontline uses its normal random match state. It disables dynamic resolution for this comparison. CS2 keeps its shipped adaptive-resolution behavior. The JSON reports measured scale, camera and buffers.
- Record each completed CS2 scene submission through Renderer.render and each completed Frontline composer.render. An interval is measured from the beginning of one submitted frame to the next, including simulation and skipped presentation callbacks. “Submission” is elapsed time spent in the respective render function, including any driver stalls. The render functions have different scopes. Measuring GPU execution separately would require a GPU timer query.
- Use three seconds of warmup followed by ten seconds looking forward at spawn. Place the input and audio trace after the frame-pacing window. On desktop, walk forward for 600 ms, release, then walk with Shift for 700 ms, press fire for 300 ms, release and reload. Frontline interprets Shift as Rush and CS2 interprets it as sneak. On touch, drag the left stick 28 CSS pixels forward then 47 more, keep that touch while pressing Fire, release and tap Reload. Use the browser’s event timestamps. Actual input and frame intervals include scheduling.
- Record the first completed frame with displacement over 0.005 m relative to the last pre-input frame, first Rush blend over 0.02, first observed ready state during the fire request, first ammunition decrement and refill. The audio marker is the first local rifle buffer start linked to that action, adjusted for positive WebAudio scheduling delay. It measures scheduling at the browser, with neither speakers nor screen scan-out instrumented. A negative audio-minus-frame value means the source was scheduled before the render function returned.
- Each combination gets its own fresh browser context. The first load is cold at the HTTP cache layer. Normally the next two navigate with the same context and a populated HTTP cache. An interrupted desktop donor session ended during the second launch. For that case the accepted sequence is cold, cold, warm. Run the last two with a fresh process using `frontline desktop 2 1` to reproduce the cache labels and repeat IDs. OS filesystem, driver and shader caches can already be warm. Page-to-menu records the visible menu control. Start-to-playable includes class selection and countdown for Frontline. Normal-entry calls, window durations, browser versions, Git revisions, input targets, thermal/throttle, stalls and sample counts are in the reduced receipts. The exploratory SMG run, reference capture without internal render dimensions, initial PWA gate and three early Clean HUD runs are listed in [excluded.json](excluded.json). The Clean HUD displays Reload after ammunition is used. The corrected harness resolves and taps it after firing. Measurements ran serially on the actual Pi. The production room service was left in place.

## Reproduce

Run from the repository root on the Pi. Raw JSON and any captures belong in a private temporary directory. Sequential commands below keep one heavy workload active.

```sh
repo=$(pwd)
bench="$repo/docs/cartridge-strike-3/baseline/performance"
scratch=$(mktemp -d)
export CS3_BENCH_OUT="$scratch" WAYLAND_DISPLAY=wayland-0

node "$bench/compare.cjs" fps desktop 3
node "$bench/compare.cjs" frontline touch 3
node "$bench/compare.cjs" fps touch 3
node "$bench/compare.cjs" frontline desktop 1
node "$bench/compare.cjs" frontline desktop 2 1

for scenario in 1:0 2:0 3:0 4:100 5:100 6:100
do
  rep=${scenario%:*}
  rtt=${scenario#*:}
  CS3_BENCH_REV=$(git rev-parse HEAD)
  export CS3_BENCH_REV
  (
    cd "$scratch" || exit 1
    CS2_LOAD_AI=1 CS2_LOAD_COUNTS=2 CS2_LOAD_SECONDS=90 CS2_LOAD_RTTS="$rtt" \
      CS2_LOAD_RESIDENTS=1 CS2_LOAD_OUTPUT="server-$rep.json" \
      NODE_OPTIONS="--import=$bench/network-observer.mjs" node "$repo/tools/network-load.mjs"
  ) || exit 1
done

FPS_MAP_CASE=mobile FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  CHROMIUM_PATH=/usr/bin/chromium FPS_MAP_OUT="$scratch/online-mobile" node tools/multimap-browser.mjs
python3 "$bench/lifecycle.py" "$scratch/lifecycle.json"
python3 "$bench/summarize.py" "$scratch" "$scratch/reduced"
```

The network observer instruments only the existing benchmark parent and child. It adds a 16.67 ms budget count and correlates a sent action ID with the matching local-player shot received from the real server. Authoritative work and start-to-start tick intervals are reported separately. Each 90 s window follows 5 s of warmup. The SDK fixture uses two real seats, eight AI, residents, real combat and cleanup in an isolated Floor 5 room. Artificial RTT uses the existing ordered, seeded delay proxy with jitter. The final seat RTT fields are the minimum observed clock-echo RTT per seat (server/lag-compensation.mjs). The delayed profile adds 50 ms per direction before jitter. The configured RTT is separate from those minima and shot confirmation time. The HTTP and WebSocket endpoints stay on loopback. The navigation sample is wall-clock milliseconds per call to world.navigation.findPath while the client workload runs. A slow-tick row separately aggregates nested work per tick, including world.findPath. Nested durations can overlap. Client transfer bytes sum PerformanceResourceTiming entries through pacing. They exclude the navigation HTML, which contains the bundled reference JavaScript. A separate navigation entry is included when collected, otherwise null. The browser uses nearest-rank quantiles. The existing server fixture takes the sorted value at floor(n×q). The added shot confirmation observer uses nearest rank. The retained traces only record small tuples during gameplay and sort the samples after each window. The test-only server instrumentation wraps tick/projection/serialization and navigation calls, so measured tick work includes its overhead. No isolated cost for production tracing is asserted. RSS is process memory resident on the server. CPU percentages use one core as 100%. The SDK fixture reports server queue depth, coalescing, invalid inputs, drops and backpressure. It did not instrument GC duration, corresponding client-side prediction correction magnitude or packet loss. The 100 ms profile preserves reliable ordered delivery.

The lifecycle launcher makes a private temporary copy of the repository’s browser fixture to select system Chromium, headed native EGL rendering and 120 s navigation allowance. It uses the fixture’s original raw browser connection and default tab context for real focus and visibility changes. It sets a private profile, resolves only loopback addresses, disables proxies and uses the basic password-store option for this isolated run. Every upstream behavior assertion remains in the executed suite. The lifecycle suite deliberately invokes test hooks, backgrounding, GC and object counters. Its measurements are separate from the forward-facing native client timings.

## Revision boundaries

The runtime baseline is the preparation merge at 5364240599164c0aee278bb0ac2a35d662c3a818. Each client captures HEAD immediately before navigation. Each server receipt preserves the revision read at shell invocation. The second through fourth authority processes shared one serial shell, started at 8ea01ffb721c2f3ec0d5685031fb93afcde5b404. The worktree reflog advanced to 3012a6378d75ead639d27e3ee5745b771f33f040 at 10:24:34 UTC. The first two authority windows began on 8ea01ffb, the third and fourth on 3012a637. This documentation checkpoint did not touch the measured runtime. The reproduction loop records the ref again for each individual run.
