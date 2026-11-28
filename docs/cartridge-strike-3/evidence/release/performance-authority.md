# Native Floor 5 authority on the release candidate

The Raspberry Pi 5 ran the six CS3-00 socket scenarios serially against release head `7579b1c5e074b92f35955c8b0feafab5e9925e15`, build `e52226e22acd0cc49583683ecf340e31ff108943e46a3d4f9bc8ed8e3c8bf984`. Node v26.13.1 matched the original baseline binary on the same Pi. The shipped server pins v26.13.0. Each run used two real SDK seats, eight bots, six residents, normal TDM gameplay and a separate server process. Five seconds of warm-up preceded the 90-second window. The delay profile uses a seeded ordered WebSocket proxy with 50 ms nominal per direction and up to 20 ms jitter. Baseline and candidate use the same measurement observer and server sampler. The current input driver requests reload only when reserve ammunition remains. [Original benchmark and commands](../../baseline/performance/README.md) · [All six release receipts, hashes and exact comparisons](performance-authority.json)

| Profile | Measure | CS3-00 range of three repeats | Release range of three repeats |
| --- | --- | ---: | ---: |
| Loopback | Tick work p95 / p99 | 5.19–5.99 / 18.44–19.49 ms | 3.99–4.11 / 5.62–5.81 ms |
| Loopback | Tick intervals p95 / p99 | 20.95–22.05 / 32.30–32.33 ms | 16.96–17.05 / 32.17–32.25 ms |
| Loopback | Confirmed shot p50 / p95 / p99 | 34.88–36.07 / 58.04–62.96 / 65.20–67.72 ms | 37.22–38.36 / 59.45–62.80 / 64.32–73.29 ms |
| 100 ms proxy | Tick work p95 / p99 | 5.08–5.49 / 15.80–16.68 ms | 3.87–4.31 / 5.67–6.95 ms |
| 100 ms proxy | Tick intervals p95 / p99 | 19.85–20.73 / 32.26–32.37 ms | 17.13–17.44 / 32.22–32.24 ms |
| 100 ms proxy | Confirmed shot p50 / p95 / p99 | 141.16–141.55 / 172.99–175.74 / 184.75–187.71 ms | 150.77–153.44 / 181.29–184.87 / 192.29–193.35 ms |

Every release run passed workload and zero-room cleanup assertions without thermal throttling. Maximum server input queue depths ranged 3–8. The server recorded zero invalids, drops and backpressure. Loopback had 2–4 fixed tick executions over 16.67 ms per release run, versus 63–79 at baseline. Delayed delivery had 2–5 versus 47–55. No release tick execution exceeded 33 ms. One delayed run recorded a 108.52 ms interval between tick starts despite the longest fixed-tick work in that run being 23.67 ms. The cause of that scheduler interval is unknown. The instrumentation still wraps the old lag-compensation accept method, so its release shot-age series is empty. The client-to-authoritative-event timings use the independent action-ID observer.

The original comparison rule flags the median of the release repeats when it exceeds the upper endpoint of the historical repeats. Loopback confirmed-shot p99 triggered it at 70.91 versus 67.72 ms. Delayed p95 and p99 triggered it at 182.27 versus 175.74 and 193.05 versus 187.71 ms. Tick execution, interval and slow-execution counts triggered zero flags. See the full distributions for individual extremes.

The two SDK clients each fired 150 shots on every run. The CS2 observer counted 268 loopback and 270 delayed shots after warm-up, and the release observer counted all 300. CS2 used a three-second countdown and every raw five-second reset snapshot showed active gameplay. CS3 uses five seconds and all six reset snapshots still showed countdown. The action observer starts tracking sends at that time. Changing the countdown changes which shots enter its distribution. The benchmark also records the ID chosen by the authority when several valid held-fire frames arrive during one tick. Both effects must be resolved before attributing the headline difference to actual delayed delivery.

## Where the 100 ms RTT difference arises

A native, unmodified runtime pair compared the baseline checkout `8ea01ffb721c2f3ec0d5685031fb93afcde5b404` and the same release checkout `7579b1c5`. The first run used the original SDK driver from the older checkout and the second used its release counterpart. The five-second warm-up, 90-second window, two clients, eight bots, six residents and 100 ms proxy were retained. A diagnostic preload observed client send and receive, first and last valid fire frames consumed in each server tick, event enqueue and the return from the actual patch flush. It used the common monotonic kernel clock across both local processes and transferred diagnostic data over private IPC after the run. The normal socket payload and gameplay were preserved. Each client fired 150 shots on both builds. [Individual original shots](performance-authority-shot-1-baseline.json.gz) · [Individual release shots](performance-authority-shot-2-candidate.json.gz) · [Distributions and source hashes](performance-authority-shots.json)

The authority selected the last eligible input in all 300 historical shots and the first eligible input in all 300 release shots. Respectively 148 and 150 fired shots had multiple eligible frames in one tick. The original had 270 shots after the warm-up cutoff, the release had 300. All 600 fired shots reached the SDK clients and had both endpoint timestamps. The comparison below scores the same 300 received shots per build from each specified origin.

| Origin to client receipt | Original p50 / p95 / p99, ms | Release p50 / p95 / p99, ms |
| --- | --- | --- |
| Action ID chosen by that runtime | 141.74 / 173.79 / 181.03 | 151.58 / 178.02 / 188.20 |
| First eligible fire input in the batch | 153.06 / 186.06 / 197.10 | 151.58 / 178.02 / 188.20 |
| Last eligible fire input in the batch | 141.74 / 173.79 / 181.03 | 140.92 / 172.59 / 182.19 |
| Single-input batches only | 148.94 / 177.66 / 188.96 | 146.59 / 175.71 / 186.14 |
| Actual patch flush to SDK callback | 60.80 / 69.99 / 71.53 | 60.25 / 69.88 / 71.31 |

For the exact same release shots, moving the reference point from the last eligible send to the first makes median delay 10.66 ms larger. For the same historical shots it makes the median 11.32 ms larger. This explains the apparent roughly 10 ms change in the original comparison. The first-to-last time is the difference between real input packets that the server consumed within one tick. In 58 release automatic-fire batches the two endpoints also supplied different aim. Switching the product to a newer ID or orientation simply to improve that metric would change the chosen input. This evidence supports retaining precise buffered press, firing and rewind behavior.

The release's dequeue-to-event p95 was 4.10 ms versus 6.30 ms in the original. Event-to-patch p95 was 45.66 versus 46.70 ms. The route includes real scheduling, a 50 ms patch cadence and ordered jitter for both builds. The two phase distributions and the retained trigger/held-fire cohorts isolate costs that the original aggregate joined together. A single paired check cannot establish stable extreme quantiles, real WAN latency or how a physical finger sees a shot on screen. The original flags are preserved for audit.

To reproduce, use isolated worktrees at the named revisions and their locked server dependencies. Set `NODE_OPTIONS=--import=/absolute/path/to/tools/release-perf-shot-observer.mjs`, `CS2_LOAD_SECONDS=90`, `CS2_LOAD_COUNTS=2`, `CS2_LOAD_AI=1`, `CS2_LOAD_RESIDENTS=1`, `CS2_LOAD_MODE=tdm`, `CS2_LOAD_RTTS=100` and a different `CS2_LOAD_OUTPUT` in each directory. Run the original `/usr/bin/node --import ./server/register-shared.mjs tools/network-load.mjs` once per checkout. Run `python3 tools/release-perf-shot-summary.py OUTPUT_FROM_EACH_ARM` from the release evidence checkout. The optional `--trace-directory DIRECTORY` preserves every scored event.

## Order reversal and loopback on the public-cache build

A second Pi window ran the integrated release head `d43379995cbed5f6858cc403fa0e86f5094856f9`, build `aec199fd40e814a4df3b4ff04a49b25277aca6fd2788375a32d801bb11d1420b`. It used the same Node v26.13.1, Pi 5, Floor 5, two SDK clients, eight bots, six residents, 60 Hz input, five-second warm-up and 90-second measured duration. Every run exited successfully with zero remaining rooms and no thermal throttling. The delayed sequence ran release then original, reversing the preceding pair. The subsequent loopback sequence ran original then release. Each row below covers 300 actually fired, received and correlated shots on each build. Values within a column are p50 / p95 / p99 in milliseconds. [Six-run timing distributions](performance-authority-shots.json)

| Pair | Timing | Original | Release |
| --- | --- | --- | --- |
| Reversed, 100 ms proxy | First eligible input → receipt | 154.08 / 191.42 / 200.19 | 154.27 / 183.87 / 193.88 |
| Reversed, 100 ms proxy | Last eligible input → receipt | 142.73 / 175.84 / 181.31 | 141.35 / 170.71 / 179.30 |
| Reversed, 100 ms proxy | Patch flush → receipt | 61.40 / 70.06 / 71.14 | 60.16 / 70.07 / 71.23 |
| Loopback | First eligible input → receipt | 36.46 / 62.91 / 94.78 | 36.46 / 60.02 / 66.41 |
| Loopback | Last eligible input → receipt | 33.78 / 62.69 / 64.36 | 35.14 / 58.84 / 65.56 |
| Loopback | Patch flush → receipt | 0.25 / 0.62 / 2.42 | 0.24 / 0.56 / 0.80 |

Both delayed orders reproduced the 10–13 ms change from choosing the first or last input timestamp within the same build. The equivalent-input delayed p95/p99 stayed inside or below the comparison builds' observed variation. The final loopback earliest-input p99 was 66.41 ms, below the CS3-00 investigation trigger of 67.72 ms. Its latest-input p99 was 1.20 ms higher than the paired control, with a lower p95 and lower maximum. Loopback had only 22/20 multi-frame batches on the original/release, versus 162/162 in the reversed delayed pair. These observations explain why delayed RTT showed a much larger action-ID effect. At the warm-up boundary the original had 271 of 300 delayed and 268 of 300 loopback shots left, versus all 300 in both release runs. [Reversed release events](performance-authority-shot-3-cache-rtt100.json.gz) · [Reversed original events](performance-authority-shot-4-baseline-rtt100.json.gz) · [Loopback original events](performance-authority-shot-5-baseline-rtt0.json.gz) · [Loopback release events](performance-authority-shot-6-cache-rtt0.json.gz)

The first historical delayed run included a 264.59 ms first-input confirmation with a 146.17 ms wait from authoritative event to patch flush. The reversed historical run's 238.18 ms maximum included 82.11 ms from dequeue to event. In the final delayed candidate, the 213.63 ms maximum comprised 85.86 ms to dequeue, 2.48 ms to authoritative event, 48.16 ms to patch flush and 77.13 ms to the SDK callback. For the final loopback candidate the maximum was 73.43 ms, including 45.93 ms to patch. These stages include surrounding engine and OS scheduling and do not attribute every long interval to a specific function.

The qualified outcome is a change in what the original counter timed, with no reproducible additional delivery delay under the tested multiplayer workload when the inputs are aligned. All three historical comparison flags remain recorded. The timing investigation produced no runtime change. The Pi results qualify these 2+8+6 SDK fixtures. Browser presentation, physical controllers and WAN scheduling remain separate.
