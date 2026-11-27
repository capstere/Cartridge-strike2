# Pi 5 performance baseline

This baseline exercises two shipped games from their normal local entry points. Field branches must repeat the CS2 benchmark on the same scene and hardware to evaluate a regression. An offline Khamsin match in Frontline has twelve combatants. Endless on Floor 5 has ten combatants. The sample records the current resident count for each input profile. The geometry, AI, world lighting, item definitions, audio banks and simulation clocks differ. The following controls make the observed sequences comparable.

## Client protocol

- Start a private loopback HTTP server, block external host resolution and use an isolated browser context. Launch headed system Chromium on the Pi 5 Wayland EGL driver. Select low graphics, manual fire, an 844×390 CSS viewport, a device scale of 0.65 and a neutral world FOV of 76°. Both inputs use landscape. Touch is emulated with Chromium’s real pointer-event path.
- In CS2 choose Endless, launch, buy the free Arc Rifle from the normal equipment screen and return to play. The default setup seeds the match with 42. In Frontline choose Play → Solo → Khamsin → Deploy with the M4A1 and wait for the countdown. On a fresh touch browser, take the installation help and play-in-browser options. Frontline uses its normal random match state. It disables dynamic resolution for this comparison. CS2 keeps its shipped adaptive-resolution behavior. The JSON reports measured scale, camera and buffers.
- Record each completed CS2 scene submission through Renderer.render and each completed Frontline composer.render. An interval is measured from the beginning of one submitted frame to the next, including simulation and skipped presentation callbacks. “Submission” is elapsed time spent in the respective render function, including any driver stalls. The render functions have different scopes. Measuring GPU execution separately would require a GPU timer query.
- Use three seconds of warmup followed by ten seconds looking forward at spawn. Place the input and audio trace after the frame-pacing window. On desktop, walk forward for 600 ms, release, then walk with Shift for 700 ms, press fire for 300 ms, release and reload. Frontline interprets Shift as Rush and CS2 interprets it as sneak. On touch, drag the left stick 28 CSS pixels forward then 47 more, keep that touch while pressing Fire, release and tap Reload. Use the browser’s event timestamps. Actual input and frame intervals include scheduling.
- Record the first completed frame with displacement over 0.005 m relative to the last pre-input frame, first Rush blend over 0.02, first observed ready state during the fire request, first ammunition decrement and refill. The audio marker is the first local rifle buffer start linked to that action, adjusted for positive WebAudio scheduling delay. It measures scheduling at the browser, with neither speakers nor screen scan-out instrumented. A negative audio-minus-frame value means the source was scheduled before the render function returned.
- Each combination gets its own fresh browser context. The first load is cold at the HTTP cache layer. The next two navigate with the same context and a populated HTTP cache. OS filesystem, driver and shader caches can already be warm. Page-to-menu records the visible menu control. Start-to-playable includes class selection and countdown for Frontline. Normal-entry calls, window durations, browser versions, Git revisions, input targets, thermal/throttle, stalls and sample counts are in the reduced receipts. The exploratory SMG run, reference capture without internal render dimensions, initial PWA gate and three early Clean HUD runs are listed in [excluded.json](excluded.json). The Clean HUD displays Reload after ammunition is used. The corrected harness resolves and taps it after firing. Measurements ran serially on the actual Pi. The production room service was left in place.

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
node "$bench/compare.cjs" frontline desktop 3

for rep in 1 2 3
do
  CS3_BENCH_REV=$(git rev-parse HEAD)
  export CS3_BENCH_REV
  (
    cd "$scratch" || exit 1
    CS2_LOAD_AI=1 CS2_LOAD_COUNTS=2 CS2_LOAD_SECONDS=90 CS2_LOAD_RTTS=0,100 \
      CS2_LOAD_RESIDENTS=1 CS2_LOAD_OUTPUT="server-$rep.json" \
      NODE_OPTIONS="--import=$bench/network-observer.mjs" node "$repo/tools/network-load.mjs"
  ) || exit 1
done

FPS_MAP_CASE=mobile FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  CHROMIUM_PATH=/usr/bin/chromium FPS_MAP_OUT="$scratch/online-mobile" node tools/multimap-browser.mjs
python3 "$bench/lifecycle.py" "$scratch/lifecycle.json"
python3 "$bench/summarize.py" "$scratch" "$scratch/reduced"
```

The network observer instruments only the existing benchmark parent and child. It adds a 16.67 ms budget count and correlates a sent action ID with the matching local-player shot received from the real server. Authoritative work and start-to-start tick intervals are reported separately. Each 90 s window follows 5 s of warmup. The SDK fixture uses two real seats, eight AI, residents, real combat and cleanup in an isolated Floor 5 room. Artificial RTT uses the existing ordered, seeded delay proxy with jitter. The HTTP and WebSocket endpoints stay on loopback. The navigation sample is wall-clock milliseconds per call to world.navigation.findPath while the client workload runs. A slow-tick row separately aggregates nested work per tick, including world.findPath. Nested durations can overlap. Client transfer bytes sum PerformanceResourceTiming entries through pacing. They exclude the navigation HTML, which contains the bundled reference JavaScript. A separate navigation entry is included when collected, otherwise null. The browser uses nearest-rank quantiles. The existing server fixture takes the sorted value at floor(n�q). The added shot confirmation observer uses nearest rank. The retained traces only record small tuples during gameplay and sort the samples after each window. The test-only server instrumentation wraps tick/projection/serialization and navigation calls, so measured tick work includes its overhead. No isolated cost for production tracing is asserted. RSS is process memory resident on the server. CPU percentages use one core as 100%.

The lifecycle launcher supplies system Chromium and the same native EGL backend to the existing 20-cycle assertion suite in a temporary browser directory. The lifecycle suite deliberately invokes test hooks, backgrounding, GC and object counters. Its measurements are separate from the forward-facing native client timings.
