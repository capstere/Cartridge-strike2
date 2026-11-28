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
