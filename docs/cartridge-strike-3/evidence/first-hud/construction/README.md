# Floor 5 room construction and input delivery

Two fresh Chromium processes create and join a normal private Team Deathmatch room, ready up, start and move the emulated guest with the ordinary thumbstick. The authoritative actor has to move more than 8 cm while the room's tick advances. No bots or production services are involved. Both waiting canvases are captured from the next regular world and first-person weapon render. A CDP mouse sentinel on **each** page measures browser event timestamp to JavaScript handler, including the touch-configured page. The post-start movement is a separate trusted emulated touch gesture.

## Cause and change

On development at `2ffd5821`, two complete fresh Floor 5 controls recorded 3.26–3.46 s desktop and 3.53–3.67 s emulated-seat pointer delays. In those windows each browser synchronously built the room's collision geometry, navigation graph, tactical choices and renderer. Navigation alone occupied 870–993 ms and tactical route construction occupied another 864–1,010 ms. Renderer construction occupied 511–591 ms. The browser could not deliver JavaScript input while these operations ran together. The async asset-load window includes IO, CPU work and scheduling; it must not be counted as exclusive blocked time.

At product source `6466399` the private client gives the browser an opportunity to run queued work between geometry, collision, graph, tactics and rendering. It uses the original construction, insertion order, tactical choices, collision digest and shader warm-up. Each continuation checks the room's abort signal. The synchronous server/Solo construction path still runs to completion in one call. Local geometry, doors, glass and navigation stay private to each fresh room. A focused cancellation-and-retry test compares the completed private graph and all four team/objective route sets with the authority.

## Matched runs

Raspberry Pi 5, two simultaneous Chromium 156.0.8078.79 processes, both ANGLE GL-EGL on Broadcom V3D 7.1.10.2. The existing desktop session's display socket refused connections during this run. Two isolated labwc virtual outputs used the Pi DRM render node to give each browser an independent display. The Low preset, DPR 0.75, desktop 896×504 and emulated mobile 640×360 matched earlier CS3 tests. The same Pi served the room and both clients. Compare the paired runs here; the virtual outputs and input used after Ready differ from the earlier directly displayed keyboard qualification.

The two instrumented controls use `control-observer.diff` against `2ffd5821`. Their candidates use `candidate-observer.diff` against the product source at `6466399`. Those diagnostic overlays retain the existing generated protocol-21 handshake in both arms. Use the overlay identities for interpretation. The clean pair uses unmodified product modules, their own build manifests and a driver-only observer. It omits diagnostic stage wrappers. The first two attempted desktop pointer-lock qualifications closed native Chromium on the virtual output. Their post-start movement checks failed and both attempts are excluded from scored comparisons. The scored runs all use the touch guest for movement.

The comparison stores raw input timestamps, loading rAFs, HUD and Ready markers, native GPU and pose per seat, counts, movement and tick advancement in each compressed receipt. The two Floor 5 seat pairs showed matching blue elevator panels, floor numeral, SMG and correct sleeves from the same room-owned cameras. Both captured views use a 320×180 PNG. The comparison script in the parent directory checks source pose, driver, draw counts, scissor and canvas dimensions and compares pixels. Independently animated textures contribute small differences.

## Timings

Each cell shows control → candidate. The complete receipt and visual metrics are in [comparison.json](comparison.json).

| Pair and seat | Worst pre-HUD pointer (ms) | Worst loading rAF (ms) | Join → Ready (ms) | First post-HUD rAF (ms) |
| --- | ---: | ---: | ---: | ---: |
| floor5-1 desktop | 3,463 → 819 | 3,483 → 883 | 22,993 → 23,247 | 117 → 117 |
| floor5-1 emulated | 3,668 → 1,203 | 3,683 → 1,241 | 18,848 → 19,044 | 100 → 100 |
| floor5-2 desktop | 3,263 → 889 | 3,300 → 917 | 22,609 → 22,866 | 100 → 117 |
| floor5-2 emulated | 3,532 → 1,102 | 3,550 → 1,153 | 18,186 → 18,419 | 83 → 100 |
| floor5-clean desktop | 3,434 → 835 | 3,466 → 966 | 23,562 → 22,742 | 117 → 100 |
| floor5-clean emulated | 3,652 → 1,184 | 3,716 → 1,279 | 18,927 → 18,605 | 83 → 83 |
| compact desktop | 477 → 515 | 517 → 517 | 13,243 → 14,014 | 83 → 83 |
| compact emulated | 823 → 861 | 835 → 880 | 12,593 → 12,277 | 83 → 168 |

The clean candidate ran first in the third pair. Its full build hash is `7fe8e3d51f8615772a6963edf12500b60d37d2e94b816bf18e8fdef4a2f3a9d6` at `835205c`. The control build is `2438ef6bd351251749c2e957a9c003150a19428563031cbb93b67f3ebb444cc5`. Repeating the normal journey without detailed wrappers retained the direction and approximate magnitude of the reduction in both seats. In the two instrumented comparisons the candidate reached Ready 197–257 ms later. In the clean reversed pair it reached Ready 820/322 ms earlier. These three pairs do not establish a change in total admission or a latency percentile. In the one Compact pair delays varied by 38 ms per seat and the emulated first post-HUD interval rose from 83 to 168 ms; no scheduling boundaries were introduced in that map's construction.

## Cancellation and visuals

On the clean candidate the guest used Cancel during the first Floor 5 preparation and rejoined. During the second preparation the host changed the room to Compact. Revision 2 arrived with its current actor and the original Floor 5 renderer retired. The guest left and joined again through an injected optional GPU-fence error. Three fences were created and deleted, zero scissor leaks or uncovered frames were recorded in the checked intervals, and the final Compact view made 109 draws with an SMG. Details are in the [lifecycle receipt](lifecycle/lifecycle.json) and [rejoined view](lifecycle/rejoined-world.png). The real Floor 5 suite passed all seven tests, including early abort within CPU construction, retry, collision hash, exact graph nodes and four tactical route comparisons. The build regenerated and passed the deterministic contract check.

The three Floor 5 pairs preserved 295/40 desktop/emulated show-scene draw counts. Across the six paired PNGs, mean per-channel RGB error never exceeded 0.965/255. In the clean pair 1.63% of desktop and 0.98% of emulated pixels differed by more than 15/255 in any channel. Camera poses and scissor matched.

## Remaining delay

The largest two instrumented candidate desktop delays overlapped 819 ms of graph construction in one run and 888 ms of tactical route construction in the other. Both emulated-seat peaks (1,203 and 1,102 ms) instead fell inside the existing bounded spawn-frame warm-up. Its WebGL `getProgramInfoLog` for the real `floor5-wall` program occupied 447 and 384 ms respectively. These are nested CPU wall-clock timings. Remaining candidates for an isolated experiment include finer cooperative graph/route work and the observed first-use wall shader. End-to-end room admission, continuous Rush input and physical handset response retain separate qualification.

## Reproduction

Use two isolated Wayland runtimes on the Pi with the same native GPU; the recorded overlay uses `/tmp/cs3-floor5-load-guest` for the second. Apply the corresponding diagnostic patch to a matching disposable checkout, then run the original command from the parent README with a unique evidence directory. For the clean pair apply only the two tools hunks and set `CS3_FIRST_HUD_STAGES=0`. Compare separate fresh processes per condition. Run `node --import ./server/register-shared.mjs --test --test-concurrency=1 tools/network-floor5.test.mjs` for the collision, world ownership and cancellation checks. Keep physical handset, server scheduling, network delay and steady-state moving-Rush measurements under their own gates.
