# Rush input and presentation timing

The [six native candidate runs](../matched-client.json) at `05a4535a` measured 108–112 ms from a keyboard Rush event to the first shifted render and 220–317 ms with the touch stick. The previous Riposte measurements were 38–55 ms and 117–155 ms respectively. The CS3 runs used Floor 5 and the Riposte runs used Khamsin. These scenes have different geometry and populations.

## Reproduce the trace

Use the Pi's EGL Chromium in its Wayland session, an isolated checkout and an existing private output directory. Run each command separately so the renderer has the Pi to itself.

```sh
export WAYLAND_DISPLAY=wayland-0
export CS3_BENCH_OUT=/tmp/cs3-rush-trace/baseline
export CS3_TRACE_RUSH=1
node docs/cartridge-strike-3/baseline/performance/compare.cjs candidate touch 3
node docs/cartridge-strike-3/baseline/performance/compare.cjs candidate desktop 3
python3 docs/cartridge-strike-3/evidence/rush/latency/summarize.py "$CS3_BENCH_OUT"/candidate-*.json
```

Use `frontline` for the original reference. Use `CS3_TRACE_RAW=1` in a separate diagnostic run to observe early raw pointer events. Registering a raw pointer listener can change Chromium's input scheduling, so the primary comparison leaves it off.

The collector runs the shipped Play → Solo flow on the full scene, equips the rifle and uses real keyboard or Chromium touch input. The existing three-second warm-up, ten-second moving-world frame sample and all subsequent actions remain in place. Sampling one additional pre-warm-up frame records draws by scene subtree. Input timing hooks record only timestamps, small scalar fields and the actual submitted gun root's Y position and roll. The reference records the live controller and viewmodel springs. Timed CS3 draws retain both world and weapon passes. All timestamps share a browser monotonic clock. Only frames for which Chromium reports a presentation timestamp can establish compositor presentation. Physical input, display scanout and phone hardware need separate measurements.

A candidate fix must preserve the map, actor simulation, weapon transforms, fixed-step Rush damping, input-release behavior and shoulder-ready gate. Compare the same full candidate scene, input sequences and render profile across at least one cold and two warm runs per input. Look for a repeated reduction in event-to-submission time, reproduce the causal stage and check forward frame pacing and tails for regressions. The reference provides a separate feel target.

## First integrated trace

Two new browser contexts on the Pi used the integrated countdown and handling runtime from `fd49143f` (hosted tree `33a6ee0b`). The timing harness was `241bbd42`. Both runs had ten team actors. Desktop had five residents and touch had four. Each row follows one actual Rush gesture. The [timestamps and scene census](initial.json) also record the 10-second frame distributions.

| Time from input origin, ms | Desktop X | Touch stick |
| --- | ---: | ---: |
| JavaScript receives pointer move or X | 75.1 | 269.4 |
| Game reads the requested Rush | 75.6 | 270.7 |
| First movement step above 2% | 76.5 | 271.3 |
| First completed shifted weapon render | 141.3 | 325.0 |
| Chromium compositor presentation | 155.6 | 371.3 |

Both first shifted frames had Rush weight 0.4231. The long delay precedes the game's input handler. Once dispatched, the first simulation step picks up the input within 2 ms in both traces. The following world draw takes 42.2–43.4 ms while the first-person draw costs 0.4–0.6 ms. The initial forward view sent 727 project-furniture draws, including 247 for I04, 234 for I12 and 98 for I01. The touch run records three completed frames after the source timestamp that still have zero Rush weight. Separate browser input and static visibility trials use these measurements.

A [cold raw-pointer trial](raw-input-trial.json) updated the stick's sampled input on `pointerrawupdate` and painted its thumb on normal `pointermove`. The raw callback preceded the usual callback by 1.1 ms. Both callbacks arrived before the same movement step. Three unshifted renders still completed before either callback. The resulting frame submitted at 296.6 ms and presented at 343.7 ms, within the earlier range. This trial implementation was removed.

The [fine visibility trial](fine-culling.json) tested an existing opaque-wall proof on individually bounded rigid furnishing groups inside each 8 m cell. Nine frozen views were pixel-identical to coarse culling, including an exposed workstation with 11,308 visible pixels. The initial lift view saved 90 submissions. On the first complete cold route the median frame time was 71.6 ms, the Rush frame submitted at 359.5 ms and one world draw cost 165.4 ms. This run used Node 26.13.1 and the prior pair used 26.13.0. Both used Chromium 156.0.8078.79. The CPU load also differed. The [six alternating stick gestures](gesture-delivery.json) after the normal route had overlapping dispatch and render times with and without an explicitly cancelled touchstart. Every gesture began with zero Rush pose. The next comparison retains the initial pointer handlers and coarse spatial cells.

The [material batching trial](palette-trial.json) applied Riposte's linear vertex-color batching to untextured, opaque standard materials marked as studio-owned. Seven original/candidate pairs had identical pixels, draw counts and triangle counts. Floor 5's imported rigid cart has five opaque glTF primitives and its materials lack the studio marker. It generated ten draws in the forward view. The tested rule therefore provided no measured gain on these assets. The full cold touch route submitted its first shifted weapon frame at 310.7 ms and presented it at 354.6 ms. The same frame census identifies 126 rigid avatar attachment submissions, 92 skinned avatar submissions and 90 held weapon submissions. The two five-draw sets on the cart motivated a direct check of the renderer's offscreen transmission pass.

## Floor 5 glass transmission

The forward view can include the two distant frosted leaves in the camera frustum even when an opaque wall covers every corner of each pane. Three's `renderTransmissionPass` submits the opaque world into a four-sample render target, resolves it, builds mipmaps and then renders the visible world. A single frosted sheet can therefore submit the opaque furniture and character geometry twice. The trial retained the original refraction material. It tested each moving pane's transformed bounds against individual solid walls and the current lift panels.

The [first full native trial](door-first.json) cut the median frame interval to 31.3 ms from the original 63–72 ms. The corrected touch route submitted the first shifted weapon frame at 120.1 ms. The forward census contained 814 main-target draws and zero offscreen draws. Sixteen of seventeen source views were pixel-identical. The closed lift differed at 2,349 pixels. All eight near-door positive controls showed 12,598 pane pixels on both sides of either leaf, closed and moving.

The [second native control](door-order-control.json) reproduced the first closed-lift difference at exactly the same 2,349 pixels. Consecutive candidate draws matched each other. Consecutive original draws matched each other. Rendering one original transmission pass, then restoring the candidate in the same frozen scene, made all subsequent candidate and original images identical. The remaining sixteen views matched in every order. On this separate cold run the first shifted weapon submitted at 127.1 ms, the median frame interval was 32.3 ms and p95 was 45.7 ms. Chromium supplied no presentation timestamp for these shorter individual Rush frames.

### Fractional viewport and resumed comparison

Three rounds the physical viewport when setting or resizing the logical viewport. In this vendored Three revision, returning from its offscreen transmission pass sets the default target viewport to the floored logical rectangle. The rectangles can differ by one pixel at fractional device or adaptive pixel ratios. The conservative visibility path now allows the first native transmission pass whenever the current rectangle differs from the restored rectangle. It also requires the default framebuffer and disabled scissoring. Geometry behind an opaque partition may be skipped on subsequent frames once both rectangles match. The material on a visible glass leaf uses the original shader.

The native gate compares the world and world-plus-weapon framebuffer immediately after setting each logical viewport and again on stable frames. It compares repeated draws in both orders. The 24 views cover the actual player camera, the elevator at multiple positions, desks and corridors, closed and moving leaves observed from both sides, and three additional fractional pixel ratios. Eleven close-ups must change visible pixels when the glass is intentionally removed. The open lift, threshold and C08 views must reduce draw calls. Run the visual gate with the following environment in addition to the native settings above.

```sh
CS3_DOOR_PIXELS=1 CS3_REQUIRE_DOOR_PARITY=1 \
  node docs/cartridge-strike-3/baseline/performance/compare.cjs candidate touch 1
```

For the timing comparison, use separate private output directories for the original and candidate. Run three repetitions per input profile and door version in a fresh browser process for each combination. Set `CS3_ORIGINAL_DOORS=1` for the original and `CS3_ORIGINAL_DOORS=0` for the candidate. The original uses the door module from `33a6ee0b`, identical to the module in the integrated movement revision `f789655` (Git blob `0f68426f92a17a71133a80901d91701fca84de7b`). All other served files come from the same checkout. The normal timing run keeps the world, input handlers, movement, adaptive resolution and both render passes active. It includes walking, Rush, firing and reloading. Enabling `CS3_TRACE_PRESENT=1` starts Chromium timeline tracing only for an additional action after the last scored run. The trace can perturb timing and must be identified separately. The native low-quality Pi rendering profile uses an 844 × 390 CSS viewport with a 0.65 device scale. Both the keyboard and emulated touch tests use this same display profile.

On Pi 5 V3D, all 24 [native pixel comparisons](door-viewport.json) passed on `bc3f5ce4` with adaptive pixel ratios of 0.3575, 0.4550, 0.5200 and 0.5850. Every world and combined image matched, both immediately after a viewport reset and after repeated draws in alternating order. The eleven deliberately hidden close-up controls changed 12,598–33,839 pixels. Forcing the rejected culling behavior again changed 2,349 pixels at the closed lift and 11,174 at the actual player camera. The corrected open lift drew 663 calls versus 1,235 originally. C08 drew 659 versus 1,265, and the threshold drew 589 versus 1,125.

### Full Floor 5 input and frame timing

Twelve [normal gameplay runs](door-timing.json) used build `7e73540e4a8cf7dd06b7d0a45976d7c06764c2abee65e4a274190f8a5106c014` at `bc3f5ce4`, Pi 5 V3D, Chromium 156.0.8078.79 and Node 26.13.0. Each row below lists the cold run followed by the two HTTP-cache-warm runs. Both versions used the same full Floor 5 Solo Endless start with ten team actors, the AR47, low quality, 76° FOV, a three-second warm-up and ten seconds of forward-view pacing. The touch profile ran with four residents and the keyboard profile with five. Run order was original touch, corrected touch, corrected keyboard, original keyboard. Limited CPU fixtures during two cold menu loads finished before either scored window. All twelve runs reported zero throttling, zero page errors and a living player throughout the action. Every route moved, reached full Rush, fired with a local audio command, and reloaded to the initial magazine. The nine Floor 5, obstruction and actor bounds tests passed separately.

| Input and doors | Frame p50 (ms) | Frame p95 (ms) | Intervals above 50 ms | Source event to first shifted weapon submission (ms) |
| --- | --- | --- | ---: | --- |
| Emulated touch, original | 61.7 / 63.2 / 67.9 | 75.1 / 78.1 / 89.8 | 462 of 467 | 360.0 / 191.0 / 224.7 |
| Emulated touch, corrected | 32.2 / 32.6 / 30.5 | 49.3 / 48.6 / 42.2 | 27 of 897 | 152.5 / 120.0 / 122.4 |
| Keyboard, original | 62.4 / 60.8 / 59.6 | 79.1 / 80.8 / 76.2 | 470 of 486 | 137.5 / 105.8 / 127.5 |
| Keyboard, corrected | 30.0 / 30.1 / 30.5 | 43.7 / 46.5 / 42.3 | 23 of 943 | 58.2 / 55.3 / 57.2 |

The original forward-view census submitted 697–702 extra draws to the transmission target. The corrected census used only the main target. At the same 0.4550 pixel ratio, the original median interval was 60.0–67.7 ms across the six runs, versus 30.5–33.2 ms with the correction. The overall median adaptive ratio differed, 0.455 original and 0.39 corrected. In the separate live movement/firing/reload windows, touch frame p95 dropped from 63.8–81.1 ms to 33.4–39.7 ms and keyboard from 59.3–62.7 ms to 30.7–32.6 ms. All six corrected ten-second windows had zero intervals above 100 ms. The slowest interval was 89.2 ms.

The corrected touch input callback received the Rush gesture 87.0–114.6 ms after its browser source timestamp. All three traces recorded three unshifted renders after that source timestamp. The game read the input and completed the first shifted simulation step within 2.5 ms of its callback. Keyboard callbacks arrived after 28.7–31.2 ms. Effects on other actions varied. For example the cold touch firing gesture showed the ammo drop at 328.3 ms, compared with 302.9 ms originally, while both warm runs improved. The full per-run receipts include p99, maxima, render-target counts, local Solo update times, action poses, input phases and individual fire/reload outcomes. This Solo comparison isolates client rendering and input. Network delay, authoritative tick execution and intervals between ticks have separate multiplayer evidence.

**Presentation and phone verification remain open.** The six original scored gestures supplied long-animation-frame presentation feedback. The six corrected scored gestures supplied only submission timestamps. In the separate traced gesture farther along the route, touch presentation was 92.8 ms original and 118.4 ms corrected. Neither later keyboard gesture produced a Rush pose at its new position. A fresh-spawn compositor trace for each door version and input profile is pending. The Pi generated both sets of images and Chromium emulated the touch input. Physical-phone input-to-display and audio output timing still require a handset.

Reproduce the twelve-run summary with `python3 docs/cartridge-strike-3/evidence/rush/latency/summarize-doors.py ORIGINAL_DIRECTORY CANDIDATE_DIRECTORY`.
