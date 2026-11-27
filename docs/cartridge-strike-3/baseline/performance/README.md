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

The state trace confirms the donor start, displaced weapon pose, held fire canceling Rush, legal rifle fire and reload. CS2 shows its existing movement, shot and reload. These forward-view scenes on this Pi did not reach a 33.3 ms median frame interval. Higher refresh hardware, physical mobile input latency and actual display/audio onset require separate measurements.

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

The network observer instruments only the existing benchmark parent and child. It adds a 16.67 ms budget count and correlates a sent action ID with the matching local-player shot received from the real server. Authoritative work and start-to-start tick intervals are reported separately. Each 90 s window follows 5 s of warmup. The SDK fixture uses two real seats, eight AI, residents, real combat and cleanup in an isolated Floor 5 room. Artificial RTT uses the existing ordered, seeded delay proxy with jitter. The final seat RTT fields are the minimum observed clock-echo RTT per seat (server/lag-compensation.mjs). The delayed profile adds 50 ms per direction before jitter. The configured RTT is separate from those minima and shot confirmation time. The HTTP and WebSocket endpoints stay on loopback. The navigation sample is wall-clock milliseconds per call to world.navigation.findPath while the client workload runs. A slow-tick row separately aggregates nested work per tick, including world.findPath. Nested durations can overlap. Client transfer bytes sum PerformanceResourceTiming entries through pacing. They exclude the navigation HTML, which contains the bundled reference JavaScript. A separate navigation entry is included when collected, otherwise null. The browser uses nearest-rank quantiles. The existing server fixture takes the sorted value at floor(n×q). The added shot confirmation observer uses nearest rank. The retained traces only record small tuples during gameplay and sort the samples after each window. The test-only server instrumentation wraps tick/projection/serialization and navigation calls, so measured tick work includes its overhead. No isolated cost for production tracing is asserted. RSS is process memory resident on the server. CPU percentages use one core as 100%.

The lifecycle launcher supplies system Chromium and the same native EGL backend to the existing 20-cycle assertion suite in a temporary browser directory. The lifecycle suite deliberately invokes test hooks, backgrounding, GC and object counters. Its measurements are separate from the forward-facing native client timings.

## Revision boundaries

The runtime baseline is the preparation merge at 5364240599164c0aee278bb0ac2a35d662c3a818. Each client captures HEAD immediately before navigation. Each server receipt preserves the revision read at shell invocation. The second through fourth authority processes shared one serial shell, started at 8ea01ffb721c2f3ec0d5685031fb93afcde5b404. The worktree reflog advanced to 3012a6378d75ead639d27e3ee5745b771f33f040 at 10:24:34 UTC. The first two authority windows began on 8ea01ffb, the third and fourth on 3012a637. This documentation checkpoint did not touch the measured runtime. The reproduction loop records the ref again for each individual run.
