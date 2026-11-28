# Bot navigation and perception

The bot package addresses three behaviors in the five playable maps. A large search can occupy a game tick. Bots can hear a quiet footstep across storeys, while the original Rush footstep used the short walking radius. A bot seeking cover on a rooftop could test its candidate against ground-floor geometry.

## Source integration

| Reference source | Adaptation in Cartridge-Strike |
| --- | --- |
| Riposte 03-nav.js, findPath and smoothPath, d96de98d | The public route API retains synchronous Yuka A*, including construction-time route generation and saved-map callers. Live bots use the same graph, edge weights, Euclidean heuristic and priority queue, with a resumable frontier and parent chain. Actor-radius probes and smoothing continue on subsequent simulation ticks. The layered graph keeps its directed stair connections and excludes unsupported leap links. |
| 07-bots.js, botSense and setPath, 564f949c | Sensors remember the last observed ground position for navigation alongside the original aim point. A moving bot keeps its validated corridor until a changed goal, geometry, obstruction or deviation requires a new route. |
| 07b-tactics.js, findCover and decideTactic, 084835fd | A cover candidate must conceal the operator at its actual elevation. A teammate's short-lived cover reservation at the same height excludes another selection. An injured or reloading bot's existing seeded preference affects how long it holds shelter while facing the last sighting. |
| 07d-squad.js, squadIntel and squadPlan, 087a6775 | The existing squad assignments retain their Classic bomb, hostage and radio priorities. New cover reservations use the same principle of accounting for a teammate already committed to a location. |
| 07e-humain.js, botEars and botUnstick, 2452b479 | The source's 3.5 m footstep height check now precedes the wall ray. Rush and running share the same hearing radius. Sound can start investigation, and firing still requires a visual target and reaction time. Waiting for a route computation no longer triggers the physical unsticking behavior by itself. |

One of ten seats may start a query per fixed step. Up to four seats can process a query slice, and movement and tactical requests share each seat's allowance. Search yields use deterministic work counts so route ordering does not depend on host wall time. A changed target floor, navigation revision or blocker invalidates unfinished work. The native timing study measures the cost of each slice.

## Acceptance and reproduction

The focused tests compare a real lower-to-upper Meltem stair route with the synchronous Yuka result, with and without tactical weighting. The sampled stair route has identical waypoints. Equal-cost branches on other graphs can select a different legal path. Other cases exercise the ten-seat work limit, invalidation, floor-aware hearing, last-known position, cover ownership, hidden-target fire suppression and leaving an overlapping body on a layered route. A native bot hears a shot directly overhead, waits, requests the actual stair path, and finishes investigating only at the correct elevation. Roof sidestep tests cover upper-deck reservations and a body directly below the recovery point.

The load harness can run against two independent checkouts from the same script. Each map uses nine real bot controllers and one human seat driven by a deterministic movement, aim, fire and reload sequence. The network profile builds room geometry, assigns vacant seats, binds the human through ControllerRegistry and advances AuthoritativeSimulation. The Solo profile drives the ordinary standalone Game at 60 fixed steps per simulated second. Both retain the map hash and seed. Elapsed CPU work per fixed step, starts, search slices, completed route CPU time, movement, early shots, eliminations and world setup time are recorded separately. The raw `responseTicks` starts at route-search admission and stops at completion, including empty paths. The final study also records `requestToUsefulPathTicks` from the controller's first request through admission to delivery of a nonempty path. Both series omit cancelled and pending work. `firstMovementFromActiveTicks` records each bot's first observed movement after active play begins, including its scheduled departure from spawn. These headless figures measure simulation work. Actual socket load and rendered objective scenarios have their own acceptance runs.

```sh
node --import ./server/register-shared.mjs --test tools/bot-navigation-budget.test.mjs
node --import ./server/register-shared.mjs --test --test-concurrency=1 \
  tools/bot-tactics.test.mjs tools/bot-tactics-rounds.test.mjs src/fps/reference-world.test.mjs

# Run one checkout at a time. HARNESS points to the same candidate script for both.
node --import "$CHECKOUT/server/register-shared.mjs" "$HARNESS" \
  --root "$CHECKOUT" --profiles authority,solo --seeds 17 --ticks 1800 --out "$OUTPUT"
```

## Initial scheduling trial

The first integrated build at 3b8ee76c used source fa6636a and protocol 20 build 3631e6d442e239956cf5c7008e9daff594391a88c28a31681b01333698eeceeb. Its original comparison checkout was 02dc5ab. The same Pi ran both programs serially with seed 17, identical map hashes and nine bots beside one scripted human, for 1,800 fixed ticks per map and profile.

The candidate reduced p99 tick CPU in all ten cases. For example, Meltem authority went from 5.416 to 1.352 ms and Solo from 5.016 to 0.904 ms. However, its rotating seat schedule spent only one short search checkpoint on each eligible turn. The completed-request p95 reached 151 ticks for Meltem authority and 153 ticks for Solo. The number of moving live-bot samples fell from 1,093 to 441 and from 1,080 to 450 on those paths. The longest individual route tick rose on Solo Floor 5 and Kervénec. The team retained this trial to document the tradeoff and changed the scheduler to spend unused turns on waiting actors before further qualification.

[Original measurements](first-trial/original-seed-17.json) · [First candidate](first-trial/seed-17.json) · [Matched results](first-trial/first-block.json)

## Classic rescue regression

The three-seed intermediate build f78b949 failed the existing seed 93 rescue test with one of two hostages safe at the original 121-second round deadline. In repeated fixed steps at 51.617, 53.567 and 55.517 seconds, the escort received a legal path home, observed no physical blocker, and scheduled a new sidestep before taking its first step. The stall timer included its deliberate wait after yielding. Restarting that timer when the yield expires gives a clear corridor a chance to carry the actor forward. Physical collisions, hostage pace and objective timers still apply. The corrected run rescued both hostages at 102.783 simulated seconds. The second escort replanned eight times across the round, compared with 59 times before the correction. [Before and after objective events and route trace](rescue/seed-93.json)

Diagnostic sampling on the same source also separated the unresolved long Solo route spikes from ordinary operator navigation. The longest sampled calls on all three Floor 5 Solo seeds were synchronous resident zombie paths. On seed 17 a patrol search took 16.33 ms and on seed 93 a patrol search took 13.19 ms. The full tick measurements below include this work. Operator search admissions and completion delay are scoped to their own controllers.

## Final matched simulations

The Cortex-A76 Pi ran baseline 02dc5abded50b538aa045194e0a5430a5f01cdbe against the integrated revision 4c3b35de67787492d33ac36e49fb11b381c0546a on Node v26.13.0. The candidate uses protocol 20 and build 50b73d583957282a52efe4d78b4fc4f83930a0682134f4f92680286dfcadae62. Each checkout ran five maps in both profiles at seeds 17, 42 and 93. Each row represents three samples of 1,800 60 Hz simulation steps on each checkout. The pair order was original first, candidate first, original first. Each pair used identical map hashes, input schedules and actor counts. Candidate temperatures recorded after the runs ranged from 48.5 to 52.9 °C.

| Map | Runtime | Median tick p99, original → candidate (ms) | Largest route tick, original → candidate (ms) | Highest request-to-usable-path p95 (ticks) | Moving samples, original → candidate |
| --- | --- | ---: | ---: | ---: | ---: |
| Floor 5 | Authority | 2.206 → 2.479 | 21.050 → 2.760 | 3 | 2695 → 3001 |
| Floor 5 | Solo | 2.980 → 3.009 | 35.678 → 26.067 | 3 | 2918 → 2934 |
| Compact Arena | Authority | 4.490 → 3.853 | 9.937 → 14.048 | 3 | 2404 → 2311 |
| Compact Arena | Solo | 4.595 → 3.192 | 9.647 → 6.196 | 3 | 2102 → 2088 |
| Meltem | Authority | 4.860 → 2.145 | 30.619 → 17.278 | 4 | 3252 → 3405 |
| Meltem | Solo | 5.006 → 1.988 | 25.596 → 14.304 | 4 | 3265 → 3374 |
| Kervénec Harbor | Authority | 5.132 → 2.402 | 22.422 → 25.536 | 4 | 3057 → 3407 |
| Kervénec Harbor | Solo | 4.949 → 1.911 | 16.895 → 9.816 | 4 | 3032 → 3333 |
| Tephra | Authority | 3.768 → 1.654 | 10.722 → 11.937 | 4 | 3089 → 3335 |
| Tephra | Solo | 3.919 → 1.349 | 23.390 → 10.755 | 4 | 3133 → 3330 |

The prepared Floor 5 graph with operational lift cabins spends three checkpoints per admitted seat. The other maps spend ten. An earlier three-checkpoint trial across all maps raised the worst per-run p95 response to 15 simulation ticks. The final graph-specific allowance brings that figure to four ticks across the 30 candidate runs. The longest individual Floor 5 route spent 45 ticks between its first controller request and delivery. A moving operator can continue following an existing legal corridor while a replacement query is pending.

The two Floor 5 p99 tick results were slightly higher in this final pair. Its worst route tick fell in both profiles. The other eight tick p99 results improved, while three isolated maxima in the authority runs increased. The largest case was 25.536 ms on Kervénec Harbor. These are measured end-to-end route API times, including host scheduling and other runtime work during the call. The harness does not identify the cause of each extreme sample. Compact Arena showed a small decrease in moving samples. All tested map/profile/seed combinations had zero pre-reaction shots.

[Matched comparison](accepted/comparison.json) · [Original raw runs](accepted/original) · [Candidate raw runs](accepted/candidate)

## Gameplay and rendered acceptance

All 50 focused tests passed on the final integrated build. Eight complete Classic rounds on four seeds finished under the original rules and had no early shots. Across the three controlled seeds, bots planted in 43.17–49.83 seconds, completed defuses in 18.40–20.12 seconds and physically escorted both hostages to safety in 100.33–104.77 seconds. Maximum continuous stalls while trying to move toward an objective were 1.40–1.83 seconds in the four two-round simulations. [Classic round and objective results](accepted/objectives.json)

On the Pi's physical Broadcom V3D GPU, the normal desktop menus entered Floor 5 Classic and the touch menus entered Meltem Endless. Keyboard and pointer input moved the human 3.64 m in Floor 5. The emulated touch joystick moved the human 5.75 m on Meltem. Each session observed all nine native bots move at least 1 m during 12 active simulation seconds. The unpaused renderer produced 358 frames on Floor 5 and 812 on Meltem. These observations cover Pi desktop and emulated touch. Physical handset qualification has its own gate. [Sampled live states](accepted/live.json) · [Floor 5 desktop](accepted/floor5-desktop.jpg) · [Meltem touch](accepted/meltem-touch.jpg)

A separate Chromium run used the established deterministic simulation clock and rendered snapshots to exercise six complete Floor 5 rounds on seeds 17, 42 and 93. All rounds finished, both teams used multiple lanes in every round, living bots left their lifts and there were zero early shots. [Rendered round results](accepted/browser-rounds.json)

To reproduce the rendered checks on a Pi Wayland session, start a private static HTTP server in the checked-out repository. Point both commands at that origin. The live test enters from Home. The round fixture uses the project's test entry.

```sh
export FPS_TEST_ORIGIN="http://127.0.0.1:$PORT"
export CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl
node tools/bot-navigation-live.mjs
node tools/bot-tactics-browser.mjs
```
