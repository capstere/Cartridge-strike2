# PASS 3B — authoritative Floor 5 5v5

[PR #22](https://github.com/capstere/Cartridge-strike2/pull/22) implements PASS 3B
on `feat/multiplayer-pass3b` from merged main `ac87eec`. The measured implementation,
completed local validation and remaining acceptance limits are recorded below.
The new PR remains open for review. No Raspberry Pi service, router, tunnel,
public server or deployed installation is modified by this change.

## 1. Implementation summary

The existing Game, movement/collision modules, NetworkRoom and SDK Predict remain
the execution path. Rooms now admit ten independently controlled humans, at most
five per team, with no bots. The online rules remain Pulse SMG, automatic respawn,
Floor 5 proximity doors, opening spawn shutters and intact solid glass. Missions,
shop, other weapons, resident NPCs and unrelated modes remain disabled online.
Offline Classic/Endless and their saved assets remain available unchanged.

Protocol 4 adds connection epochs, connection status and signed door poses.
Compatibility hashes include the new authority implementation and online limits.
A mixed client/server build is rejected before spawning.

## 2. Changed systems

| Files | Purpose |
| --- | --- |
| `server/network-room.mjs`, `network-schema.mjs`, `lag-compensation.mjs` | Ten seats, team allocation, fixed-tick validation, history, nonce RTT probes, reconnect ownership and lifecycle |
| `shared/multiplayer/rules.mjs`, `protocol.mjs`, generated `build.mjs` | Shared limits, validated counters/ticks and protocol/build compatibility |
| `src/fps/game.mjs` | Extract the existing hitscan trace for read-only historical collision queries; retain weapon rules and deferred damage |
| `src/fps/action-rules.mjs` | Skip spawn visibility rays whose distance makes their score contribution exactly zero |
| `src/fps/network/session.mjs` | SDK reconnect lifecycle, epoch/reset handling, consistent world/player interpolation, deduplicated cosmetics and bounded diagnostics |
| `src/fps/network/menu.mjs`, `connection.mjs`, `src/fps/app.mjs`, `fps/` | Team selection, ten-player admission errors, 5v5 scoreboard and reconnect/Resume feedback |
| `server/access.mjs`, `local-server.mjs` | Explicit team option; bounded connection limits sized for two full rooms |
| `server/test/`, `tools/network-*.mjs`, workflows | Real protocol/browser tests, performance instrumentation, 30-minute soak and CI artifacts |

## 3. 2/4/10-player evidence

Protocol admission tests pass at 2, 4 and 10 players, including a full-room
reconnect reservation, five-player team caps, explicit team selection and a rejected
eleventh join. Protocol clients exercise the actual Colyseus
server and input serializer. They are not rendered browsers. The browser matrix
uses **two independent fully rendered Chromium processes**, plus zero, two or
eight protocol peers. It does not claim ten rendered machines or ten people.

The C08 combat placement in the load/browser matrix is a test-only IPC fixture.
It uses the real map and validates occupancy; ammunition, movement, hits, deaths,
score and respawn timers remain authoritative. The existing two-rendered-client
route test separately traverses the map from the normal spawn positions.

## 4. Lag compensation

Colyseus 0.18.28's verified `allowRewindState` API records read-only actor hitboxes,
signed door angles and spawn-shutter progress at the 20 Hz patch cadence. The
client displays remote actors and changing collision geometry on the same 100 ms
interpolation timeline. A separate dynamic collision context poses historic doors
for a ray query; it does not tick another game or mutate the live world.

A shot carries the SDK's reliable input frame, life ID, connection epoch, monotonic
fire ID, observed authoritative tick, yaw/pitch and SDK render timestamp. The server
checks the input envelope, tick age, timestamp age and monotonicity, tick/time
agreement and server-originated nonce RTT samples. It rejects future/old times,
old lives/epochs and duplicate actions. Unsynchronized zero timestamps receive
only a live query. Clients cannot submit damage, hitboxes or a hit target.

The **500 ms hard history bound** follows measurement. A
[pre-coalescing 250 ms ordered-jitter run](pass3b/rewind-window-before.json)
measured stamped input age **p95 427 / p99 435 / max 447 ms**; a 400 ms cap
would discard that legitimate SDK-generated tail. Removing avoidable input
backlog reduces the final 250 ms protocol sample to **p95 383 / p99 390 /
max 399 ms**. The retained 500 ms cap covers the 100 ms render buffer plus bounded
jitter/patch/scheduling margin without growing histories indefinitely.
Tick/time agreement allows 75 ms scheduler margin; nonce RTT agreement allows
125 ms. These are bounded scheduling tolerances, not a trusted client clock or
proof against a maliciously delayed RTT echo. No client can extend the hard
history bound. The final browser matrix below includes the remaining rejected
old-life, regressed and out-of-window inputs in its raw counters.

CI exposed an additional, avoidable delay: processing one reliable frame per
tick let catch-up input accumulate a 12-frame/~200 ms server queue. One rendered
client produced cosmetics but no accepted shots. The server now consumes each
ordered batch, validates every frame and coalesces controls for **one** simulation
step. A short fire press retains its own orientation, observed tick and render
stamp even when a release follows in that batch. It does not replay extra
movement or weapon ticks. The reliable SDK acknowledgement advances over all
consumed frames. Invalid-frame, burst-speed and short-press regressions exercise
this fix; the RTT/timestamp validation limits were not relaxed.

Ammo, cooldown, RNG, health, score, spawn protection and match time always use the
live authoritative Game. Respawn replaces the actor schema identity so history
cannot blend bodies across lives. A body killed after the selected instant may
still block that ray, but cannot receive another kill. Deferred damage retains
same-tick mutual kills. Local muzzle/recoil/audio feedback is immediate; authoritative
shot confirmations suppress matching effects and hit feedback follows server damage.

Official references: [Colyseus rewind](https://docs.colyseus.io/netcode/lag-compensation)
and [reconnection](https://docs.colyseus.io/server/room#allowreconnection-client-seconds).
The pinned package implementation and executable API tests, rather than unpinned
documentation alone, establish the API behavior used here.

## 5. Reconnection

A transport drop immediately unbinds input and disables controls. The SDK is the
single retry owner; the server reserves a ready player's seat for 15 seconds.
Its private reconnect token restores the same session/actor and rotates on success.
Identity, team, inventory, health and scores are retained during transport
reconnection. A full page reload is a new join; this pass does not persist reconnect
tokens across browser reloads. Death and ordinary
respawn continue while disconnected; reconnection itself grants neither life nor
protection. Invalid/oversized protocol connections do not reserve a seat.

The server increments a control epoch. Old input and Resume messages are rejected.
The client waits for the reconnect full snapshot, resets prediction, interpolation
and transient effects, then requires explicit Resume for input/audio. Expiry or
server restart returns an actionable disconnected message. Explicit Leave cancels
the reservation immediately. Timers, event handlers and predictions are disposed.

A liveness check distinguishes a blocked rendering thread from sustained network
silence. After a delayed timer it first allows pending socket callbacks to run;
input is already neutralized after one second without a state patch. A real
four-second browser main-thread stall and a deterministic silence test cover
this distinction. A slow reader is disconnected when its outgoing WebSocket backlog exceeds
256 KiB at the next authority tick: a real corked-socket regression verifies disconnection and seat cleanup
while another player's match continues.

**Known reconnection boundary:** if another transport break occurs during the
new-token JOIN handshake, before the client receives/acknowledges it, the pinned
framework rejects reconnection of that unjoined socket. This is reproduced in a
separate test: the seat/actor is released, the remaining match continues, and a
fresh authenticated join succeeds. Automatic identity preservation across this
particular handshake interruption is not delivered; old-token acceptance is not
weakened to hide it. Full page reload and server restart likewise require a fresh
join. Repeated interruptions after completed full snapshots retain the identity.

## 6. Network matrix

**PASS for all seven cases** in [the final browser matrix](pass3b/browser-matrix.json).
Each case has two fully rendered Chromium 153 processes at 960×540, DPR 1, low
settings, Apple M1/Metal, with a seven-second moving-target combat measurement
window after warmup. Additional actors are real SDK clients. These are short,
controlled C08 samples, not universal FPS or Wi-Fi performance guarantees.

| Humans | Nominal RTT ms | Hit confirmation p95 A / B ms | Reconciliation p95 A / B cm | Max unacknowledged frames A / B |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 0 | 75.6 / 69.5 | 1.7 / 1.7 | 5 / 5 |
| 4 | 0 | 75.7 / 56.0 | 1.8 / 1.3 | 6 / 6 |
| 10 | 0 | 89.4 / 41.8 | 2.5 / 1.7 | 5 / 5 |
| 10 | 50 | 160.3 / 123.2 | 3.1 / 3.0 | 9 / 9 |
| 10 | 100 | 167.2 / 171.4 | 2.9 / 2.6 | 12 / 12 |
| 10 | 150 | 249.2 / 250.4 | 2.7 / 2.8 | 15 / 15 |
| 10 | 250 | 315.4 / 307.4 | 2.5 / 2.7 | 21 / 21 |

The proxy delays actual WebSocket messages in both directions and preserves
ordering; a separate test verifies all 600 messages arrive in order. Nonzero RTT
cases add approximately ±20 ms jitter **per direction**. Nominal proxy RTT and
SDK-observed RTT differ because of jitter, scheduling and input/patch cadence;
the raw report retains the SDK readings. This is **not TCP packet loss or
retransmission emulation**. No random application snapshots are discarded.

Reconnection during combat and a fresh explicit Resume pass in every case.
The two-player case additionally passes a four-second JavaScript main-thread
stall and a 3.2-second Chromium CDP freeze/resume while the other player's match
keeps advancing. Every case tests synthetic blur/input neutralization. These
are automated browser scenarios; physical OS suspension remains NOT RUN.

The SDK correction diagnostic is explicitly enabled and calibrated with a
known injected local prediction error before the measurement window. Earlier
zero-valued readings from its disabled gauge are discarded. Reported corrections
are the SDK's actual post-replay corrections; `adoptionDistance` in the raw
report also contains the expected prediction lead and life adoption and is
**not** a prediction-error measurement. Remote display offsets compare the
100 ms interpolated past against the newest state and are likewise not errors.
For this controlled moving/strafe fixture, use reconciliation p95 ≤0.15 m as a
regression reference, not a whole-map collision tolerance. Shared door/shutter
movement comparisons separately use a 1e-9 numeric tolerance. The normal route
test proves immediate local motion before authority receives the delayed input.

| Humans / RTT ms | Mean FPS A / B | Frame p95 / p99 A ms | Frame p95 / p99 B ms |
| --- | ---: | ---: | ---: |
| 2 / 0 | 60.0 / 60.0 | 16.8 / 16.8 | 16.8 / 16.8 |
| 4 / 0 | 59.0 / 60.0 | 16.8 / 33.3 | 16.8 / 16.8 |
| 10 / 0 | 53.8 / 58.9 | 33.3 / 33.4 | 16.8 / 33.3 |
| 10 / 50 | 50.7 / 59.4 | 33.4 / 33.4 | 16.8 / 16.8 |
| 10 / 100 | 54.0 / 59.1 | 33.3 / 33.4 | 16.8 / 33.3 |
| 10 / 150 | 48.1 / 59.3 | 33.4 / 33.4 | 16.8 / 33.2 |
| 10 / 250 | 57.6 / 60.0 | 16.8 / 33.4 | 16.7 / 16.8 |

The desktop 60 FPS aspiration is not met in every ten-player view on this
shared development host; p95 frames reach roughly 33 ms. No renderer or visual
quality reduction was introduced to make these measurements pass. [Rendered
Floor 5 capture](pass3b/5v5-combat.png), [ten-player scoreboard](pass3b/5v5-scoreboard.png)
and [posed character bounds](pass3b/characters.json) were inspected. The captures
show the established presentation after combat/respawn, not ten rendered clients.

Real TCP packet loss/retransmission, Wi-Fi and physical phones: **NOT RUN**.

## 7. Performance and Raspberry Pi readiness

The development host is Apple M1 ARM64/macOS, Node.js 26.13.0. Each
protocol benchmark has five seconds of warmup and thirty seconds of measured
sustained combat; the server runs in a separate process. The host also ran
validation work, so these are shared-host engineering samples, not isolated
thermal or hardware certification. [Raw 2/4/10 results](pass3b/load.json) and
[RTT results](pass3b/load-latency.json) retain the environment and build contracts.

| Humans | Simulation p50 / p95 / p99 ms | Tick work p50 / p95 / p99 ms | Projection p95 ms | Patch serialization p95 ms | CPU % of one core | Outbound KB/s per player |
| --- | --- | --- | ---: | ---: | ---: | ---: |
| 2 | 0.161 / 0.362 / 1.231 | 0.470 / 0.869 / 1.979 | 0.248 | 0.461 | 9.2 | 6.43 |
| 4 | 0.098 / 0.374 / 1.149 | 0.217 / 0.810 / 1.619 | 0.191 | 0.505 | 5.9 | 12.80 |
| 10 | 0.274 / 1.161 / 3.597 | 0.521 / 1.787 / 4.162 | 0.277 | 0.943 | 9.5 | 36.30 |

The 10-player case meets the initial **simulation p95 <8 ms**, **tick work
p99 <16.67 ms** and **average outbound <50 KB/s per player** targets in this
sample. The 50–250 ms RTT load cases measured simulation p95 0.59–1.31 ms,
tick work p99 1.89–5.31 ms and outbound 34.61–37.76 KB/s per player.
These figures include instrumented tick CPU work, not a guarantee of punctual
scheduling. The measured rate was 59.91–59.99 ticks/s; tick-interval p99 was
32.46–33.53 ms in the current samples, with occasional stalls. A strict
p99 **cadence** of 16.67 ms is not achieved on this shared host.

Event-loop p95 was 11.49–12.92 ms with a 10 ms measurement resolution (including
that baseline interval). Post-GC heap was 62.71 / 63.21 / 63.93 MiB at 2/4/10
clients. Raw samples also retain RSS, inbound bytes, max pauses, resources and
listeners. Bandwidth is payload bytes, excluding TCP/IP/WebSocket framing and
HTTP asset loading. Serialization is the cost of an entire room broadcast,
not a per-client number. Tick, projection and serialization timings overlap;
they must not be added as independent costs.

[The merged PASS 3A.2 baseline](pass3b/before-2.json) supports only two clients.
With the same current combat driver, its simulation p95 was 0.224 ms, tick-work
p99 0.887 ms and outbound 5.48 KB/s/player. Current two-player values are
0.362 ms, 1.979 ms and 6.43 KB/s/player. The new authority/history/epoch handling
adds work; this is not presented as a global speedup. No baseline 4/10-client
networking capacity is invented.

[Before input coalescing at ten clients](pass3b/before-queue10.json), input-stamp
age p95/p99 was 171/173 ms on loopback. The matched current run measured
131/132 ms, and the observed final input queue fell from one to zero. CI's
slower rendered case had reached the 12-frame cap and rejected a client's shots;
the fix was validated without relaxing timestamp rejection. Individual shared-host
CPU differences are not a controlled causal speedup estimate.

[Spawn microbenchmark](pass3b/spawn-before-after.json): thirty measured batches of
ten actual actors selected identical positions before/after the distance cutoff.
Irrelevant visibility queries fell from **70,350 to zero**; batch p50/p95/p99
changed from **21.07/42.19/47.12 ms** to **9.28/10.14/10.25 ms**. This is a
spawn microbenchmark, not ten baseline network clients or a universal FPS gain.

Only the measured spawn-query reduction, input coalescing and bounded outgoing
transport queue were prioritized. No renderer rewrite or visual reduction is
included. The eight 1,200-tick offline replay hashes match the baseline.

The long server run and 2/4/10 measurements use contract `378356671759…`;
the later `68e47c3472fc…` contract enables the client's SDK correction diagnostic.
**Server gameplay, security, protocol schema and shared simulation sources are
identical between those contracts.** Both endpoints of every test use the same
contract. Per-run fingerprints are retained rather than relabeling old samples.

**Physical Raspberry Pi 5 / 16 GB / Debian Bookworm ARM64: NOT RUN.** Node.js
26.13.0 is pinned and used for authority tests. Development-host success is not
an ARM Pi thermal, scheduler or deployment acceptance result. The existing
`cartridge-strike2` service and trusted LAN installation were not accessed.

## 8. Long-running stability

**PASS — 1,800.08 measured seconds**, ten real SDK clients and a separate Node.js
26.13.0 server on the development Mac. [Soak evidence](pass3b/soak.json) retains
all 356 approximately five-second stability samples, baseline/final/cleanup
snapshots and the original full artifact's SHA-256. This is protocol-only sustained
combat, not thirty minutes of ten rendered browsers.

There were **20 leave/rejoin replacements, 30 completed transport reconnections
and 2,658 respawns during the measured interval** (2,663 including warm-up).
Every sampled world had ten actors and ten seats. Socket listener counts remained
seven per connection; tick/time history stayed at 64 entries, actor/door/shutter
rewind entity counts at 10/51/1, and the maximum observed input queue was 11 of
the allowed 12. The SDK's maximum pending acknowledgement count was 14; that is
a different client-side measure from the server's input queue.

Post-GC heap maxima over the first and last six warm samples were **64.68 and
65.23 MiB**, a **0.55 MiB** increase against the asserted 16 MiB bound. The final
retained heap was 65.16 MiB and fell to 27.76 MiB after all clients left. Cleanup
had zero rooms and zero client TCP sockets. The HTTP listener, IPC pipe and four
timeouts in that snapshot belong to the still-running measurement server; it was
then closed and the harness exited successfully. This establishes bounded growth
over this run, not proof that no possible long-term leak exists.

Full-run average CPU was **11.82% of one core**, outbound traffic **37.78 KB/s per
client** and effective simulation rate **59.98 Hz**. The final bounded timing
window measured simulation p50/p95/p99 **0.566/1.619/5.323 ms**, tick-work
**1.189/2.506/6.069 ms**, projection p95 **0.419 ms** and serialization p95
**1.315 ms**. Cost percentiles cover the last 8,192 samples, not an unbounded
thirty-minute histogram. Event-loop p99 was 14.37 ms at 10 ms resolution, with a
370 ms maximum stall over the full run. Tick-interval p99 was 18.62 ms in the
final window, so the strict 16.67 ms cadence aspiration remains unmet.

The server rejected 9,308 previous-life actions, seven tick/stamp mismatches and
two clock/RTT mismatches while accepting 264,061 validated firing inputs; those
are input validations, not a count of bullets bypassing the weapon cooldown.
No server crash, actor duplication, accumulating listeners, unbounded histories
or failed cleanup occurred. Separate tests cover malformed messages, slow readers
and cross-room isolation. The manual GitHub soak workflow remains separate from
normal PR CI and was **not dispatched**; this completed local run is the evidence.

## 9. Acceptance matrix

[Regression commands, counts and source fingerprints](pass3b/validation.json).
PASS means the stated scope actually ran; it does not extend to physical devices.

The exact final-head GitHub Actions verdict is recorded in [PR #22's checks and
delivery description](https://github.com/capstere/Cartridge-strike2/pull/22/checks).
Committing this report creates a new revision, so an older successful run is not
substituted for its checks. All seven jobs must pass: `node-tests`,
`multiplayer-foundation`, `multiplayer-gameplay`, `multiplayer-pass3b`,
`lan-ubuntu-latest-chromium`, `lan-windows-latest-chromium` and
`lan-macos-15-webkit`. The separate manual soak is not a normal PR gate.

| Acceptance | Result | Evidence / boundary |
| --- | --- | --- |
| PR #21 reviewed, six required jobs, merge without bypass | PASS | Final head e3d2884; merge ac87eec; review record below |
| 2 / 4 / 10 independent authoritative humans, max five per team | PASS | Real SDK admission, input ownership, all clients firing; two rendered clients plus 0/2/8 peers |
| Safe spawn, ordinary protection, full-room reservation, explicit team/leave/rejoin | PASS | Protocol integration, real Floor 5 occupancy and room lifecycle |
| Historical moving hitboxes, walls, doors and shutters | PASS | Colyseus history queries plus real browser combat/movement matrix |
| Direction/tick binding, ammo/reload/cadence, mutual kills, dead/old-life/duplicate rejection | PASS | Real reliable input tests and existing Game rules |
| Correct controls after completed reconnect, health/inventory/team/score ownership | PASS | Repeated real socket drops, new epoch/full state, explicit Resume, death/expiry tests |
| Identity recovery if a second break interrupts the new-token JOIN handshake | FAIL | Pinned framework releases the unjoined seat; tested fresh authenticated join works; see section 5 |
| Expired session / restart / stale callbacks / empty-room disposal | PASS | Server and rendered LAN tests; restart intentionally creates a new match |
| Loopback and 50 / 100 / 150 / 250 ms RTT with ordered jitter | PASS | Seven browser cases plus separate-process SDK load matrix |
| Browser main-thread stall, CDP freeze/resume and synthetic blur | PASS | Automated suspension/input-neutralization scenarios; not physical OS backgrounding |
| Immediate local movement and measured reconciliation | PASS | Local motion precedes server receipt; calibrated SDK correction measurement; shared collision comparisons |
| Origin, private binding, code/contract checks, malformed/unauthorized input and transport limits | PASS | Preserved LAN tests, protocol rejection and corked-write backlog regression |
| Independent rooms | PASS | Two live worlds, independent movement/door state and separate disposal; not two-full-room load certification |
| Core / server tests / runtime hashes / prepared door traversal | PASS | 228 core tests, 15 server tests, 518 runtime files, 102 traversals |
| Offline Classic/Endless, characters, animations, audio/resource lifecycle | PASS | Eight matching replay hashes / 9,600 steps; 20 browser lifecycle cycles, routes and compatible character fixture |
| Client frame / server cost / bandwidth / resource measurement | PASS | Raw reproducible development-host data in sections 6–8 |
| 10-client simulation p95 <8 ms, tick-work p99 <16.67 ms, outbound <50 KB/s/client | PASS | Measured sample; target-host Pi guarantee is NOT RUN |
| Strict tick-interval p99 16.67 ms and desktop 60 FPS in every sampled view | FAIL | Shared-host scheduler tails and some ten-player views miss those aspirations |
| Final 30-minute / 20-replacement soak | PASS | 1,800.08 s, 20 replacements, 30 reconnections, 2,658 measured respawns, bounded retention and zero rooms after cleanup |
| GitHub-dispatched manual soak workflow | NOT RUN | Workflow supplied separately; local long run is the measured evidence |
| Ten fully rendered physical clients / human LAN play | NOT RUN | Protocol capacity and two rendered browser clients do not prove this |
| Physical Raspberry Pi / iPhone / Android / Windows laptop | NOT RUN | No Pi service was accessed; Windows validation is hosted CI automation |
| Real TCP packet loss/retransmission, Wi-Fi, physical OS background suspension | NOT RUN | Ordered WebSocket jitter and real socket interruption only |
| Public server / tunnel / router / Pi deployment | NOT RUN | Excluded by the assignment; PASS 3B PR remains unmerged |

Observed validation failures were investigated rather than bypassed: queued
inputs were coalesced without extra authority ticks; render stalls stopped
triggering false disconnects; the SDK diagnostic was calibrated; the fixture
now places respawns before projection so it cannot interpolate through an
intermediate test-only teleport. The Windows software launch ran at **1 FPS**
and produced over-age/clock-mismatched shots. Two Linux CI attempts stopped at
the keyboard check after only one 0.07 m authority step; the first reported
0 FPS and both had multi-second input age. The same two-process SwiftShader
fixture passed locally, so this is not represented as a universal Linux failure.
Its existing real mouse-look step now precedes both movement and firing, allowing
the compatibility fixture to render timely input while the server keeps its
strict validation. It still checks real keys,
pointer lock, mouse fire/look, reload HUD, manual fullscreen and leave.
Full normal-camera two-rendered-client combat remains in the GPU jobs.
Windows uses one rendered client plus a protocol peer; Linux/macOS LAN retain
two rendered clients. No physical-device FPS claim follows from these jobs.

The saved-character regression used a generated compatible GLB, **not a fresh
Studio UI export**. It rendered both teams, first/third-person models and hands,
and checked cancel/retry/incompatible recovery without uploading a private asset.
Audio lifecycle checks are automated state/resource checks, not a listening test.

## 10. PASS 4 and operational limits

Review [PR #22](https://github.com/capstere/Cartridge-strike2/pull/22) without automatic merge.
Resolve or explicitly accept the interrupted-handshake identity boundary with
the pinned framework before widening the pilot. Then measure the exact build on the
physical Pi and multiple physical clients through the existing authorized LAN
workflow. Preserve the separate iPhone/Android controls/audio backlog. Test real
Wi-Fi/TCP retransmission, OS background suspension and longer multi-room soak.
Public deployment, TLS/identity infrastructure and internet adversarial tuning
remain outside this private-LAN milestone.

## PR #21 review and starting point

Reviewed final PR #21 head `e3d2884d843e0eded7a86c3c4433ae6d61c7889d`:
all six jobs of [run 44184782939](https://github.com/capstere/Cartridge-strike2/actions/runs/44184782939)
succeeded (`multiplayer-foundation`, `node-tests`, `multiplayer-gameplay`, Linux
Chromium LAN, Windows Chromium LAN and macOS WebKit LAN). Fresh local baseline
verification passed 226 core tests, seven server tests, runtime/contract hashes
and the normal two-rendered-client launch with real keyboard/mouse input.
Origin restrictions, explicit private-IP binding, admission validation, bounded
resources, Floor 5 compatibility and the reported physical-device limitations
were reviewed. No reproducible blocking defect was found. The expected head was
merged with checks intact as `ac87eec485cd898bd6e9ce36fc2e0fe0fc2ab1d8`.
PASS 3B starts from that updated main on `feat/multiplayer-pass3b`.

## Reproduction

From the repository root, with the pinned Node and locked dependencies installed:

```sh
npm run build --prefix server -- --check
npm test --prefix server
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node --import ./server/register-shared.mjs tools/network-browser.mjs
node --import ./server/register-shared.mjs tools/network-5v5-browser.mjs
node --import ./server/register-shared.mjs tools/network-load.mjs
CS2_LOAD_COUNTS=10 CS2_LOAD_RTTS=0,50,100,150,250 node --import ./server/register-shared.mjs tools/network-load.mjs
CS2_SOAK=1 CS2_LOAD_COUNTS=10 CS2_LOAD_SECONDS=1800 CS2_LOAD_OUTPUT=test-results/pass3b/soak-30m.json node --import ./server/register-shared.mjs tools/network-load.mjs
```

The benchmark's `CS2_BENCH_ROOT` can point at a separate baseline checkout. The
baseline room supports only two clients; a ten-actor spawn microbenchmark is not
evidence of baseline ten-client networking. `network-spawn-profile.mjs` checks
identical selected positions before/after the visibility optimization.
