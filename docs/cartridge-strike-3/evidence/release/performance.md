# CS3-12 performance qualification

The default integrated candidate at `25decefc5eee3f5f66daa17ee51629df6d7d4825` uses protocol 22 and runtime build `ca85c51ad40bd98ed62b7763ee0029e5c89788ce3cccc3260c2dd378d6a81dde`. The measurements below name the builds that actually ran each comparison. The suite exercises four different boundaries: normal client rendering, authoritative fixed-tick work, elapsed time between tick starts, and transport to a confirmed action. Values in one boundary do not estimate latency in another.

## Native Pi client

The CS3-00 reference used a Pi 5, full CS2 Floor 5 Endless with ten combatants, three 10-second sessions per keyboard or Chromium touch profile. CS2's desktop frame p50 ranged 71.8–73.0 ms and p95 91.4–96.5 ms. Touch ranged 63.8–70.1 and 78.3–83.0 ms. Riposte on Khamsin had twelve combatants, different scenes and simulation rules, with medians of 47.2–49.4 ms desktop and 43.2–43.7 ms touch. The door experiment below provides the controlled CS3 comparison. [Original timings, assumptions and replay commands](../../baseline/performance/README.md)

On the Pi 5's native V3D 7.1.10.2, twelve serial runs compared the original door geometry at `33a6ee0b` against the correction at `bc3f5ce4` with the remaining source fixed. Each run used the normal Play → Solo path, original Floor 5, ten team actors, AR47, 76° FOV, Low, 844 × 390 CSS pixels, device scale 0.65, three seconds of warm-up, a ten-second forward view and uninterrupted movement, Rush, firing and reload. Keyboard had five residents and emulated touch four. Each condition included cold, warm and warm launches. The table gives ranges across the three repetitions. [Per-run frame, action and thermal receipts](../rush/latency/door-timing.json)

| Input | Forward frame p50, ms | p95, ms | p99, ms | Frames above 50 ms | Worst, ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Keyboard, original | 59.6–62.4 | 76.2–80.8 | 88.5–90.8 | 470/486 | 96.9 |
| Keyboard, corrected | 30.0–30.5 | 42.3–46.5 | 53.6–63.8 | 23/943 | 79.7 |
| Emulated touch, original | 61.7–67.9 | 75.1–89.8 | 81.7–101.4 | 462/467 | 106.1 |
| Emulated touch, corrected | 30.5–32.6 | 42.2–49.3 | 57.4–84.6 | 27/897 | 89.2 |

Removing an unnecessary transmission pass saved 697–702 submissions in the starting view. The median adaptive pixel ratio changed from 0.455 to 0.39. Restricting samples to the same 0.455 ratio retained the frame improvement, from 60.0–67.7 to 30.5–33.2 ms. All 24 paired views matched, including immediate fractional viewport resets, closed and moving leaves and eleven positive controls where deliberate glass removal changed pixels. During the separate continuous moving/firing/reloading windows, p95 improved from 59.3–62.7 to 30.7–32.6 ms on keyboard and from 63.8–81.1 to 33.4–39.7 ms on touch. One cold touch shot took 328.3 ms to the ammo decrement versus 302.9 ms originally. [Views and timing method](../rush/latency/README.md)

Four fresh traces at runtime `d4018d7b` paired the *first* shifted weapon frame with Chromium compositor feedback: original → corrected was 121.7 → 69.1 ms for keyboard and 347.9 → 167.3 ms for emulated touch. Each number is one gesture. In the repeated untraced actions, corrected keyboard callback delivery took 28.7–31.2 ms and touch 87.0–114.6 ms. In the corrected traced touch case, renderer and game update calls occupied 74.5 of the 87.4 ms before JavaScript received the event. The first shifted step finished 2.1 ms after callback entry. The input-routing and queue stages were not captured. Physical sensor-to-display and speaker latency remain unmeasured. [Traces, repeated input and instrumentation limits](../rush/latency/input-delivery.md)

## Cold room entry and first historical replay

Two clean V3D Chromium processes on the Pi joined a private Floor 5 TDM room with two humans and zero bots via the normal LAN controls. A queued mouse-move sentinel on both pages measured delivery while each HUD loaded. The guest was touch-configured. The probe checked authoritative motion after Ready. All comparisons kept the normal application loops active.

| Matched Pi comparison | Desktop | Emulated seat |
| --- | ---: | ---: |
| First post-HUD rAF, initial → guarded shader preparation | 2,250 → 133 ms | 2,542 → 100 ms |
| Longest post-HUD pointer delay, same comparison | 2,174 → 52 ms | 2,426 → 84 ms |
| Peak loading pointer, clean control → cooperative construction | 3,434 → 835 ms | 3,652 → 1,184 ms |
| Longest loading rAF, same clean pair | 3,466 → 966 ms | 3,716 → 1,279 ms |
| Join to Ready, same clean pair | 23.562 → 22.742 s | 18.927 → 18.605 s |

The first change paid the initial world/weapon shader work before the HUD appeared, moving first visibility 2.35 s later. The second yielded during client world construction. Two instrumented pairs and one reversed clean pair retained the latter improvement. The instrumented candidates reached Ready 197–257 ms later. The clean pair used control build `2438ef6b` and candidate `7fe8e3d5` under protocol 21. Single-portions of graph building, tactical routes and initial shader work still occupied hundreds of milliseconds. Three Floor 5 pairs preserved poses, scissor and 295/40 desktop/guest draw counts. The separate protocol-22 integration at `ec9ce496` exercised cancellation, map change, rejoin, resource retirement and trusted guest movement of 0.651 m over 40 observed ticks. [First-HUD measurements](../first-hud/README.md) · [Matched construction study and pixels](../first-hud/construction/README.md) · [Protocol 22 integration](../first-hud/construction/protocol22/README.md)

In a separate two-client native replay comparison (`61fdb371` → `262c8974`), the emulated victim's first historical world draw fell from 1,101 ms and ten new program links to 12 ms and zero links. Its next callback took 1,186 → 79 ms. The desktop first final replay went from 2,204 ms and 15 links to 23 ms and zero links. Reusing the warmed lighting configuration preserved private historical actors, one finishing sound and one marker. This is one paired run. macOS/Metal and Pi/V3D have distinct evidence. [Native registers, frames and hosted trace](../competitive/first-replay/README.md)

## Authoritative ticks, transport and held interactions

The CS3-00 authority baseline used a Pi 5, five-second warm-up, three 90-second repeats per network profile, two real SDK clients, eight bots and six residents on Floor 5 TDM. The highest loopback p95/p99 tick execution was 5.99/19.49 ms, and interval p95/p99 was 22.05/32.33 ms. Locally confirmed shot p95 ranged 58.04–62.96 ms. At 100 ms artificial RTT plus 20 ms ordered jitter the confirmed-shot p95 was 172.99–175.74 ms. The slowest sampled navigation calls occupied 61.69–102.80 ms. These figures use a loopback server and real sockets. [Raw repeats, queue depth, CPU, RSS, bandwidth and method](../../baseline/performance/README.md)

With the new navigation scheduler, three seeds on five maps ran in each of authority and Solo for 108,000 fixed steps total over both revisions. Floor 5 authority's worst route tick fell from 21.050 to 2.760 ms, with p99 fixed-step CPU 2.206 → 2.479 ms and more moving-bot observations. Floor 5 Solo's worst route tick fell 35.678 → 26.067 ms. Synchronous resident patrol searches still consumed 13–16 ms on two seeds. [Matched simulated work, behavior and source identities](../navigation/README.md)

Two additional native Pi socket checks at `8dd1cd4a` used the unchanged one-human/nine-bot Classic and four-human/six-bot TDM workloads. They recorded the following whole-run values. [Raw socket receipts](../navigation/accepted/published-sockets.json)

| Mode and duration | Tick execution p50 / p95 / p99 / max, ms | Tick interval p50 / p95 / p99 / max, ms | Executions / intervals above 33 ms |
| --- | --- | --- | ---: |
| Classic 180 s, 10,804 ticks | 1.033 / 2.333 / 4.205 / 38.030 | 16.161 / 17.674 / 32.283 / 65.443 | 1 / 28 |
| TDM 90 s, 5,403 ticks | 1.575 / 3.226 / 5.190 / 90.920 | 16.197 / 17.548 / 32.240 / 92.427 | 1 / 8 |

Both p95 execution times were within the 16.67 ms work budget. Each room reached zero after final departure, maximum input queue was five, and neither room dropped a connection or reported backpressure. Classic recorded two rejected input messages. The TDM outlier included 20.93 ms of actor motion. Its remaining cost is unattributed. The 60 Hz simulation target applies separately to execution cost and elapsed scheduling intervals.

Native Pi emulated Classic touch at protocol 22, build `57abdeb8`, completed a 5.071 s normal hold with one authoritative defuse start and maximum accepted input gap 53.78 ms. A sustained 4× CPU challenge kept one start and a 145.12 ms maximum. An artificial short 7× pulse produced 215–302 ms SDK send gaps while the pointer stayed owned, crossing the 180 ms control lease. Both peers received the resulting cancellations and fresh starts. The server's worst tick execution in this control was 11.51 ms. A minimap experiment retained multiple starts and was rejected. The cause of the original uninstrumented duplicate remains open. A real handset, network loss and physical input/display or audio onset require separate evidence. [Held-action data, stress profiles and exact protocol checks](https://github.com/capstere/Cartridge-strike2/blob/8a6b7846a71e757728294e7d01de4929521ffa39/docs/cartridge-strike-3/evidence/first-hud/construction/protocol22/held-defuse/README.md)

## Release-head endurance

The release workflow runs ten real SDK clients against a separate authoritative process on a hosted Ubuntu runner, full Floor 5, five seconds warm-up and 1,800 seconds of active sampling with no added RTT. Its 60 Hz input pump uses a controlled combat placement at each new life. Once per minute it forces a real transport disconnect and verifies an increased control epoch. It replaces a seat every 30 seconds until 20 replacements. Every sample checks the room, actor and seat census, bounded input/rewind history, and socket listeners. The fixture requires multiple completed matches, at least 20 combat respawns and bounded post-GC retained heap. All ten final seats must fire, at least one must hit, and all clients leave before the final zero-room census.

The sampler forces GC roughly every five seconds, sorts instrumented timing distributions and shares the hosted machine with the clients. Tick execution, interval, memory and throughput describe this instrumented hosted workload. It cannot establish real WAN RTT, Pi rendering, performance on physical phones or human perception. Each eligible release PR update checks out the head SHA, validates the generated build and uploads the complete report, SHA-256 and tested revision. A completed job and matching receipt are required before recording a pass. [Workflow](../../../../.github/workflows/multiplayer-soak.yml) · [Client driver](../../../../tools/network-load.mjs) · [Authoritative sampler](../../../../tools/network-load-server.mjs)
