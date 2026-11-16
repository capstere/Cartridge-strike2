# Measured Floor 5 rendering and simulation — November 16, 2026

Base: `ca9d6dc1cdf88bfcfec558d25cb37fc147ffabdc` (main after PR #13).
This pass retains PR #13's mirrored batching, resolution governor, catch-up cap
and non-Floor-5 AO changes. It does not count them as new improvements.

## Method and evidence

Apple M1, macOS 26.6.2 / Darwin 25.6, Chromium 153.0.8010.12, ANGLE Metal.
Local HTTP server, three fresh browser contexts per configuration per revision:
844×390 touch emulation, DPR 2, low graphics, 658×304 drawing buffer; and
1280×720 desktop, DPR 2, standard graphics, 1280×720 drawing buffer.
The adaptive governor is disabled **only inside the benchmark** to hold resolution
identical. The normal live benchmark separately exercises the shipping governor.
No runtime benchmark flag or test-only optimization is introduced.

`tools/measured-floor5-profile.mjs` starts a normal seeded Endless match through
the lobby. It stops the app's automatic clock and advances exactly 1,500 steps at
1/60 s, one per animation frame, retaining the nine bots and mobile/desktop resident
populations. The observer sees Cargo Lift at ticks 120–359 and C08 at ticks
1200–1439; combat spans ticks 360–1439, with the observer moving to C08 at tick
720. Camera movement does not move the player or change simulation inputs.
There are 21 shot events per replay. State snapshots and event hashes must match
across repetitions and revisions. This harness measures game simulation,
presentation and submission; it does not include the ordinary app's HUD/audio
update cost. The separate existing live profiler covers that frame loop.
[Live before](live-before.json) and [live after](live-after.json) each include
cold and warm starts, ten team actors, and 20 nearby shot events. After-change
Cargo Lift p95 was 16.7 ms in both runs; C08 p95 remained 33.4 ms.

Frame intervals measure RAF pacing. `work` is synchronous CPU work per frame,
including simulation and rendering. `gpuSubmission` is **CPU submission time**,
not GPU execution time. Timers are inclusive and overlapping (navigation can
be inside bot logic); do not add them. Profiling runs with the V8 sampling
profiler are separate from the three timing repetitions.

## Three implemented changes

1. **Opaque-wall actor occlusion.** Floor 5 previously submitted posed team
   actors and hostages through opaque walls. Reuse the existing single-wall,
   whole-box occlusion rule after posing. Per-bone support boxes bound the actual
   skin without scanning every skinned vertex each frame; rigid attachments and
   contact shadows are included. Non-unit positive weights are conservatively
   bounded; unsupported morphs, sprites and instanced geometry stay visible.
   This only runs with Floor 5 neutral lighting, where actors do not cast dynamic
   shadows. Animation, AI and damage continue unchanged while hidden.
2. **Collision broad-phase reuse.** Cache the most recent spatial cell rectangle
   and its ordered, unique members. Repeated clearance probes no longer repeat
   string lookups and WeakMap deduplication. Inserts invalidate the cache;
   returned arrays are independent and mutable door/glass properties are still
   read by the original narrow phase on every call.
3. **Exact CPU skin sampling.** Corpse fitting spent about 672 ms of the
   initial sampled replay scanning deformed vertices. Three.js recomputed each
   bone's world × inverse-bind matrix for every weighted vertex. Compute those
   products once per skin scan, then retain the original vertex/morph/weight/bind
   operations in the same order. Keep double-precision matrices: the GPU's
   Float32 bone buffer is not accurate enough for an exact fitting replacement.
   This preserves the fitted pose and avoids changing animations or corpse shape.

An isolated three-repeat ablation rejected a proposed interior-floor-cell
shortcut: its median 60-second simulation cost was 2,624 ms versus 2,623 ms
without it. It is **not shipped**. Spatial-index caching alone measured 2,458 ms
(6.3% lower). All ablation traces matched exactly; see the [recorded samples](simulation-ablation.json).

The initial CPU profile spent about 14 ms/frame in render submission and about
1 ms/frame in simulation. Its hottest rendering functions were shader parameter
and program selection; hidden actors accounted for 734 lift draws in the live
trace. Simulation samples identified spatial queries, polygon containment and
Yuka search. Changes target that measured work without reducing fidelity.

## Before / after results

Medians of the three repetition summaries. Lower CPU work means more headroom;
median display interval remains 16.7 ms in every case (VSync).

| Configuration / scene | CPU work median, ms | CPU work p95, ms | Frame p95, ms | Frames over 25 ms |
| --- | ---: | ---: | ---: | ---: |
| Touch / lift | 16.7 → 13.5 | 22.9 → 15.8 | 33.3 → 16.8 | 16.0 → 1.0 |
| Touch / c08 | 18.4 → 17.6 | 21.1 → 20.3 | 33.4 → 33.3 | 32.0 → 20.0 |
| Touch / combat | 15.6 → 12.4 | 20.0 → 18.3 | 16.8 → 16.8 | 47.0 → 22.0 |
| Desktop / lift | 18.5 → 15.7 | 21.5 → 21.3 | 33.4 → 16.8 | 36.0 → 11.0 |
| Desktop / c08 | 21.5 → 18.8 | 27.2 → 21.4 | 33.4 → 33.4 | 80.0 → 36.0 |
| Desktop / combat | 17.7 → 15.2 | 24.8 → 20.2 | 33.3 → 33.3 | 134.0 → 61.0 |

Across active combat the median CPU work fell **20.5% on touch emulation**
and **14.1% on desktop**. C08 gains are smaller than Cargo Lift gains; C08
frame p95 remains about 33 ms. Desktop combat p95 also remains 33.3 ms.
Median display rate is still VSync-limited. Frame counts are 240 per fixed view
and 1,080 for combat. These are CPU-headroom gains, not a universal FPS claim.

Exact tick comparisons (first repetition; all team actors and residents retained):

| View / tick | Draw calls before → after | Triangles before → after |
| --- | ---: | ---: |
| Touch Cargo Lift / 180 | 1,942 → 1,524 | 1,070,534 → 806,836 |
| Touch C08 / 1,320 | 1,926 → 1,842 | 912,082 → 858,844 |
| Desktop Cargo Lift / 180 | 1,940 → 1,522 | 1,097,334 → 833,636 |
| Desktop C08 / 1,320 | 1,851 → 1,767 | 865,530 → 812,292 |

[Summary and inclusive subsystem timings](measurements.json) ·
[Raw before frames](before-frames.json.gz) · [Raw after frames](after-frames.json.gz) ·
[Frozen actor visibility comparisons](actor-visibility.json)

All six before/after replay pairs have identical state and event hashes.
The 25 frozen visibility comparisons changed **zero pixel bytes** and saved
up to 756 draws. Exhaustive validation found all 4,655,215 sampled posed vertices
inside their conservative bounds, with **zero exact-coordinate differences**
between cached and upstream skin sampling. Alternating-order scans of 1,140,118
actual skinned vertices took 168.2 ms upstream versus 132.0 ms cached (21.5%
less CPU time), with identical fitted bounds. This microbenchmark is separate
from frame-pacing measurements.

The [three-seed simulation traces](simulation-traces.json) match at every one
of 10,800 fixed steps, including their combat events.

## Regression results

**PASS** — [commands, first-run outcomes and corrected retests](regressions.json).

- Full Node suite: **192/192**; runtime manifest: **458 files**.
- Prepared Floor 5 door traversal: **102/102**.
- Actor occlusion: **25/25** frozen views, zero pixel-byte differences;
  existing workstation visibility: **9/9** views, with an exposed positive control.
- Mobile/desktop startup and controls, match flow, three-seed bot tactics,
  player plant/defuse/rescue/spectator routes and destructible-glass traversal.
- Classic/Endless zombie encounters, Danceman audio/death/round/respawn checks.
- **20-cycle** Classic/Endless lifecycle: one retained game and audio context,
  four resident instances, stable GPU resources, no resident music or voice
  playback after returning to the lobby.
- Render/HUD/minimap/tracer smoke, including unchanged pixel and command output.

Two existing test assumptions needed correction. The Danceman test requested
100 ms updates even though PR #13 caps catch-up at 50 ms; its alleged incomplete
death pose was sampled after only 1.95 seconds. It now advances elapsed simulation
time and confirms the original 2.9667-second final pose. The menu smoke assumed
that software WebGL would draw inside a 650 ms host wait. It now requires actual
frame progress and checks the 10 Hz ceiling against measured browser elapsed
time. Neither correction changes game timing or weakens gameplay assertions.

## Reproduction

```sh
npm ci --prefix frontline/source/tools/dev
python3 -m http.server 8765
# Separate terminal, no concurrent benchmark or regression workload:
PROFILE_LABEL=before PROFILE_REPEATS=3 node tools/measured-floor5-profile.mjs
PROFILE_LABEL=after PROFILE_REPEATS=3 node tools/measured-floor5-profile.mjs
PROFILE_LABEL=profile PROFILE_REPEATS=1 PROFILE_CPU=1 node tools/measured-floor5-profile.mjs
PROFILE_LABEL=current node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/measured-simulation.mjs
PROFILE_ANGLE=metal node tools/endless-floor5-profile.cjs
node tools/actor-occlusion-browser.mjs
node tools/compare-floor5-profile.mjs test-results/measured-before/measurements.json test-results/measured-after/measurements.json
```

Run `before` on the base revision with the new benchmark tools copied in, then
`after` on this change, on the same machine/browser. Raw timing samples and
source fingerprints accompany the report. Backend changes, power state,
background tasks, JIT and VSync can affect timing; these measurements are not a
universal FPS guarantee.

## Remaining uncompleted work

- Physical iPhone/Android performance, controls and audio remain **unverified**;
  touch emulation on this Mac is not handset evidence.
- GPU execution-time attribution, a broader laptop/GPU sample and extended
  thermal/battery tests are still open.
- Shader variant selection remains costly, including transmission framebuffer
  changes and mixed instanced/non-instanced materials. This pass does not fork
  Three.js or change transmission appearance to conceal that cost.
- Whole-map portal culling, additional static geometry consolidation and actor
  animation throttling remain unimplemented. They need their own correctness
  and visual audits.
- PR #13's severe-low-FPS time dilation remains in place. It is not changed or
  claimed as solved by these optimizations.
