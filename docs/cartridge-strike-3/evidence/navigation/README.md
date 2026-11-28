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

The focused tests run a real Meltem roof-to-ground route against the synchronous Yuka result both with and without tactical weighting. Other cases exercise the ten-seat work limit, invalidation, floor-aware hearing, last-known position, cover ownership, hidden-target fire suppression and leaving an overlapping body on a layered route.

The load harness can run against two independent checkouts from the same script. Each map uses nine real bot controllers and one human seat driven by a deterministic movement, aim, fire and reload sequence. The network profile builds room geometry, assigns vacant seats, binds the human through ControllerRegistry and advances AuthoritativeSimulation. The Solo profile drives the ordinary standalone Game at 60 fixed steps per simulated second. Both retain the map hash and seed. Elapsed CPU work per fixed step, request starts, search slices, completed route CPU time, route response measured in simulation ticks, movement, early shots, eliminations and world setup time are recorded separately. These headless figures measure simulation work. Actual socket load and rendered objective scenarios have their own acceptance runs.

```sh
node --import ./server/register-shared.mjs --test tools/bot-navigation-budget.test.mjs
node --import ./server/register-shared.mjs --test --test-concurrency=1 \
  tools/bot-tactics.test.mjs tools/bot-tactics-rounds.test.mjs src/fps/reference-world.test.mjs

# Run one checkout at a time. HARNESS points to the same candidate script for both.
node --import "$CHECKOUT/server/register-shared.mjs" "$HARNESS" \
  --root "$CHECKOUT" --profiles authority,solo --seeds 17 --ticks 1800 --out "$OUTPUT"
```
