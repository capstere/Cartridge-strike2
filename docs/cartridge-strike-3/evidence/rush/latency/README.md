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
