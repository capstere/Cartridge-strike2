# Reference map admission

The Meltem pilot runs the original Cyclades factory and compiles its output into one local LevelProject and two indexed render files. The room server reads the same LevelProject as the browser. The game never starts the donor client to load a map. [Source and packaged asset digests](meltem-assets.json)

| Source ID | Factory | Admission and reason |
| --- | --- | --- |
| sable | 02s-sable.js | Held. Khamsin has courtyard and indoor routes, roof positions and destructible cover props. Verify cover ownership and traversals before admitting this variant. |
| givre | 02t-givre.js | Held. Val-Blanc combines station platforms, rail corridors, sheds and snow. Platform head clearance and snow material/footsteps need paired tests. |
| embruns | 02u-embruns.js | Held. Kervénec adds harbor basins, piers, stepped shore geometry and waterfront ambience. Its water and route fixtures are distinct from Meltem. |
| floreal | 02v-floreal.js | Held. Hortus adds glass/greenhouse sight lines, gardens and dense foliage. Validate projectile materials, transparency and mobile overdraw. |
| meltem | 02yf-meltem.js | Pilot. A deterministic 72 × 96 m village, mirrored spawns, quay, pier, under-roof routes, terraces, eight ramps and two wells. TDM/Endless use the donor spawn positions and original scale. Classic lacks bomb and hostage objectives. |
| tephra | 02yh-tephra.js | Held. Volcanic industrial structures, differences in elevation, hot surfaces and emissive effects need their own traversal and low-quality measurements. |
| stratus | 02yj-stratus.js | Held. Islands have open edges, void falls, suspension bridges and required jump links. Requires authoritative void death, respawn, client correction and reliable bot jump timing. |
| simoun | 02yl-simoun.js | Held. Dunes, sampled relief, circular confinement, pools and well holes require the source terrain and ray solver. |
| lotissement | 02yn-french-dream.js | Held. French Dream includes furnished houses and garages, construction floors, climbable roofs, parked vehicles and mirrored residential lanes. Test indoor/outdoor transitions and upper floors. |

## Deterministic production inputs

The exporter launches the pinned local reference package in an isolated Chromium context. It recomputes the private HTML fixture’s inline script digest after attaching listeners to the original factory. It reads the original merged material buffers, spawns, named zones, points of interest, collision flags, water, holes, ramps and multi-level navigation arrays. Static rest-pose props use the original prefab geometry transforms and ray shapes. Room authority and prediction share all body obstacles; the props stay in their authored rest positions in the pilot. No dynamic prop motion or synchronized destruction is advertised.

Two separate factory executions agreed on every collision volume, ramp, well, water bound, spawn, named zone and point of interest. The complete navigation position, cost and adjacency arrays also agreed. The native source contains 791 collision volumes, 5,376 multi-storey navigation nodes and 31,642 directed edges. The pilot routes bots along the 31,504 walk edges. The remaining 138 edges require authored parkour input. A port offering those edges must implement the corresponding bot action and add a traversal test.

The uninstanced source decoration contained 259,138 triangles. Baking the 250 authentic resting props produces 321,102 triangles including their appearance, with the same 791 collision volumes. Low quality loads principal and fine architecture, totalling 291,400 triangles in the entire map. Standard quality also loads 29,702 fine-detail triangles. The smaller low download is 2,806,902 gzip bytes. The fine-detail increment costs 246,408 bytes. Frustum/chunk visibility determines submitted triangles per frame.

Run from the repository root on the Pi, with the heavy slot reserved. Supply an empty private scratch directory outside the checkout. The source build requires Chromium, the existing Playwright dependency, Python 3, NumPy and Pillow.

```sh
scratch=$(mktemp -d)
WAYLAND_DISPLAY=wayland-0 node tools/reference-map/export.cjs "$scratch"
OPENBLAS_NUM_THREADS=1 python3 tools/reference-map/pack.py "$scratch" .
```

Material diffuse maps are 512-pixel resamples of the original CC0 sources. The bundled shoreline recording retains its original audio bytes, source attribution and shore-distance/filter curve. Fine geometry uses separate loading and distance culling. Map disposal removes the scene subtree, aborts pending geometry loads, releases GPU buffers/materials/textures, stops the shoreline stream and disconnects its audio graph. [Source credits and asset inventory](meltem-assets.json)

## Source and runtime trace

| Item | Transfer and runtime consumer | Verification |
| --- | --- | --- |
| Authored waterfront, village, rooms and spawn positions | The original `mapEnsure('meltem')` executes the Meltem and Cyclades factories during export. `finalizeWorld` yields the geometry buffers and map arrays. `pack.py` writes the level and quantized indexed geometry. | Runtime loads `lvl-meltem` in Solo and the room registry. The room fixture counts the indexed buffer groups attached to the active scene. |
| Collision, elevation and routes | The exporter retains source `COL`, `RAMPS`, `HOLES`, `WATER` and all `NAV` arrays. `world.mjs` selects `createReferenceWorld` for this level. Cartridge adapters implement movement, layered route lookup, body occupancy and rays. The server and browser both import that world constructor. | `reference-world.test.mjs` checks opposing spawn routes, upstairs and downstairs occupancy, ramp movement and well/pier/sea ray elevations. |
| Decoration and materials | The original `Maker.put` transforms bake the donor props at rest. The private extraction runs with the bundled global Three.js r147. The target `referenceScene` imports Three.js r180 as an ES module and creates new `BufferGeometry`, indexed attributes, Lambert materials and sRGB textures. | Shader warmup, draw, detail visibility and disposal use that target scene via `Renderer`. Solo GPU counters and the in-game harbor frame are recorded below. |

The export source and Three.js revisions can be compared directly with the following SHA-256 digests. The source attribution and packaged artifact digests are in [the asset inventory](meltem-assets.json).

| Source file | SHA-256 |
| --- | --- |
| `frontline/source/src/02yf-meltem.js` | `04504a6f645029155d6ffa755a470f446ad132a1fe19262cc9f397acc8668c35` |
| `frontline/source/src/02yb-cyclades.js` | `c5cd39e15f00485d324e4ee3b39334fb6dbb7e21b36e97f8d5f1ab2cacea605c` |
| `frontline/source/src/02yc-cyclades-bati.js` | `16c59eea00d9b77a2f357b730714eac43b7c35ceb98ffdc068991b17e42df3ee` |
| `frontline/source/src/02yd-cyclades-edifices.js` | `79e684f75095d7ba96735f59c69cacc1d4ffdc7dfa8e995f76c007d3a0c9266e` |
| `frontline/source/src/02ye-cyclades-deco.js` | `4edc1a69bb42d1b82a25545a08dcb623f471a72d4176d3a4b33b9fe63b657814` |
| `frontline/source/src/02-map.js` | `c2d67fc6049a8259d24e89ee47078cc9c6d39444967ff0d176241c60002e7f9a` |
| `frontline/source/src/02z-load.js` | `957a774241c8772aef2e40bbb13086939093e195a10aecadfe8e8484aacfe98e` |
| `frontline/source/src/03-nav.js` | `a2391d3aa4a98c50ce56398bb4af9853963c086a530a1aaf138be01ba4a7f4c1` |
| `frontline/source/assets/vendor/three-r147.js` | `e2328c394c763146864047540d6e16088af89c8118539f9295cb3d6652f4153a` |
| `vendor/three/three.core.js` | `eb077d2417f61d3e6d9264c317cabc4ea35769ed6b0ab533067292a550784c20` |

## Raspberry Pi gameplay observation

The normal setup page accepted `?level=meltem`, opened Endless and reached an active round with ten actors. The player moved 4.59 m, fired three times, reloaded and returned to the lobby. On the Raspberry Pi 5, Chromium used Broadcom V3D at 493 × 228 internal resolution in the low desktop profile. A ten-second sample recorded 485 frame intervals, with a median of 19.8 ms, p95 of 25.2 ms and a maximum of 153.7 ms. One interval exceeded 100 ms. The playable scene took 14.51 s from navigation in a new browser context. This is one desktop run. The capture shows the map branch before the English frontend integration. [Measured inputs and results](meltem-solo.json) · [In-game frame](meltem-solo.jpg)

The first normal Solo and room entries exposed a shader-warmup crash before the first playable frame. The renderer was traversing the generated furniture group while preparing the reference map. It now prepares the reference map’s own scene root. The real room fixture checks the 293 indexed architecture groups and 291,400 base triangles in the active rendered scene. Reproduce a desktop capture with the existing benchmark.

```sh
scratch=$(mktemp -d)
WAYLAND_DISPLAY=wayland-0 CS3_BENCH_LEVEL=meltem CS3_BENCH_OUT="$scratch" \
  node docs/cartridge-strike-3/baseline/performance/compare.cjs fps desktop 1 1
```

The private TLS room fixture then passed a complete 45-second Meltem match on map-branch revision `377595e` with one rendered touch client and one SDK peer. The host selected the map in the waiting room. The Pi received 0.71 m of stick movement and two shots, confirmed the same seat and map after reconnect, accepted rematch, then released both sockets and the room. The host rendered at 713 × 321 on V3D with a 915 × 412 emulated viewport. Across 567 intervals the client recorded 16.6 ms median, 22.2 ms p95 and a 126.6 ms maximum. Across 605 ticks the server recorded 0.51 ms median execution, 1.07 ms p95 and a 6.86 ms maximum. This two-human profile had zero bots. [Room results and phase timings](meltem-room-touch.json) · [Rendered match after input](meltem-room-touch.jpg)

The protocol-15 family-room run at `1daf1f6` used one rendered desktop player and nine authority-controlled bots. An earlier run found that network setup replaced the map’s 76 raised and ground-level patrol destinations with an empty list. The corrected setup preserves those destinations and bot goal elevation. The 45-second rematch fixture finished 1–1, with forward movement, right-click aim and a shot acknowledged by the authority. Over the measured ten seconds, server work took 1.23 ms median, 6.08 ms p95, 12.65 ms p99 and 20.4 ms maximum. Client frame intervals were 23.3 ms median, 34.0 ms p95 and 61.9 ms maximum on the Pi driving the renderer and server together. Adaptive resolution ranged from 0.47 to 0.77. [Desktop room measurements](meltem-room-desktop.json) · [Rendered gameplay](meltem-room-desktop.jpg)

The host switched that same room between Floor 5 and Meltem 20 times. After every switch one renderer was alive and reachable. On each return Floor 5 had 358 geometries and 124 textures, Meltem had 368 geometries and 59 textures. The damaged-map test rejected a modified Floor 5 level, released its seat and then reopened the saved map with the intact level. JavaScript heap after requested garbage collection rose from 39.67 to 47.36 MiB on Meltem and from 73.16 to 81.56 MiB on Floor 5 over those ten visits per map. This increase prompted the retained-allocation comparison below. The fixture records each individual switch and heap reading.

```sh
scratch=$(mktemp -d)
WAYLAND_DISPLAY=wayland-0 CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 \
  FPS_NETWORK_ANGLE=gl-egl FPS_MAP_CASE=meltem FPS_MAP_SWITCH_PAIRS=10 FPS_MAP_OUT="$scratch" \
  node --import ./server/register-shared.mjs tools/multimap-browser.mjs
```

### Retention comparison

On protocol-15 revision `3a65284`, the ten-return repeat kept one game, network session, prediction instance, world, audio system and audio context after forced garbage collection. At switches 2, 10 and 20, Chromium counted 81, 89 and 99 live canvas elements. The DOM retained 721 mounted elements, including 31 loading-panel descendants, and 163 event listeners throughout. At those same Meltem visits the JavaScript heap measured 39.26, 41.78 and 45.89 MiB. Parking the same map, seats and camera for 173 seconds left 99 canvases and 45.10 MiB of live heap. The sampled live allocation estimate rose from 15.24 to 22.85 MiB during switching and reached 23.09 MiB after parking. Three.js program assembly during shader warmup accounted for the largest increase. [Individual samples and prototype counts](meltem-retention-before.json) · [Sampled live allocation stacks](meltem-retention-before-stacks.json.gz)

The renderer now disposes uploaded geometry, materials and textures from the outgoing world, first-person scene and warmed weapons before discarding its WebGL renderer. Three.js r180 installs per-renderer callbacks on these resources. The CPU-side buffers and original character templates continue to serve the next map. A four-switch native repeat at `bb88b38` found 78 live canvases, zero detached game canvases, two Three renderers, two WebGL contexts, 69 programs and 130 shaders at both same-map visits and after a 53-second parked control. The JavaScript heap was 37.59 and 37.45 MiB on those visits and 37.14 MiB at the end of the control. All 272 portable root tests passed with server dependencies physically absent. [Short repeat and portable test receipt](meltem-retention-four.json)
