# Reference map admission

The development candidate offers Meltem, Kervénec Harbor and Tephra in Solo Endless and room TDM. Each uses baked output from its original factory and a versioned LevelProject shared by the client and authority. Floor 5 and Compact Arena retain their original mode eligibility. Selecting Classic for one of these maps returns to Floor 5, and the three authored maps stay outside Random. [Source and packaged asset digests](source-to-package.json) · [English desktop and touch entries](candidates/english-menu/menu.json)

| Source ID | Factory | Admission and reason |
| --- | --- | --- |
| sable | 02s-sable.js | Held. Khamsin has courtyard and indoor routes, roof positions and destructible cover props. Verify cover ownership and traversals before admitting this variant. |
| givre | 02t-givre.js | Held. Val-Blanc combines station platforms, rail corridors, sheds and snow. Platform head clearance and snow material/footsteps need paired tests. |
| embruns | 02u-embruns.js | Offered in Solo Endless and room TDM. Kervénec Harbor preserves quays, multilevel pier surfaces, original boats, moored rigs and harbor audio. The nine-bot TDM finished 1–1, recovered after a damaged map, and released the seat. [Map receipt](candidates/p16-ground/embruns.json) |
| floreal | 02v-floreal.js | Held. Hortus adds glass/greenhouse sight lines, gardens and dense foliage. Validate projectile materials, transparency and mobile overdraw. |
| meltem | 02yf-meltem.js | Offered in Solo Endless and room TDM. The 72 × 96 m village preserves its terraces, quay, eight ramps and two open wells. The merged pilot passed both desktop and touch room entry and its original 20-switch test. [Pilot lifecycle](meltem-integrated-native.json) |
| tephra | 02yh-tephra.js | Offered in Solo Endless and room TDM. The field station retains its walkable levels, source materials, eruption, vents and bolt-synchronized thunder. The nine-bot TDM finished 1–2, recovered the map and released the seat. [Map receipt](candidates/p16-ground/tephra.json) |
| stratus | 02yj-stratus.js | Held. All sampled spawn/POI routes have a walk connection; the original also exposes jump links. Open edges and native void falls still require authoritative death, respawn and prediction. |
| simoun | 02yl-simoun.js | Held. Dunes, sampled relief, circular confinement, pools and well holes require the source terrain and ray solver. |
| lotissement | 02yn-french-dream.js | Held. French Dream includes furnished houses and garages, construction floors, climbable roofs, parked vehicles and mirrored residential lanes. Test indoor/outdoor transitions and upper floors. |

## Measured donor factories

The survey executed each original map factory at pinned upstream `31ca050d8ce59f4885c01a3237f68cdf186c9b60`. It sampled the completed multi-level directed navigation graph, each team’s actual spawn lookup, factory materials, lighting, local wind, cloth, water shapes and configured sound beds. The prefab totals are measured before GPU finalization releases those CPU buffers. GPU culling and render submissions are verified separately in matched gameplay. [Full factory results, original HTML and file digests](source-capabilities.json)

| Factory | Walk-connected opposing spawn pairs | POIs reachable from every spawn | Static triangles + resting prop triangles | Sea / wading pools / visible pond meshes | Other requirements |
| --- | ---: | ---: | ---: | --- | --- |
| meltem | 450/450 | 76/76 | 259,138 + 61,964 | 1 / 0 / 8 | Pilot. Wells, sail rotors, cloth, foliage, flags and port sound. |
| sable | 288/288 | 32/32 | 624,296 + 110,806 | 0 / 0 / 4 | Flat collision and walking fit. The souk also owns 43 simulated cloth groups and four fountain/pond surfaces; verify cover, fountains, fabric and frame budget. |
| givre | 288/288 | 40/40 | 602,040 + 38,783 | 0 / 0 / 0 | Walk-compatible station. Needs snow cover and falling flakes tied to indoor clearance, platform transitions and winter audio. |
| embruns | 288/288 | 35/35 | 425,669 + 107,884 | 1 / 0 / 17 | Next compatible coastal candidate. Original three-rectangle shore, harbor floor, ramped trawler route, deck materials and foghorn. |
| floreal | 648/648 | 81/81 | 377,797 + 18,776 | 0 / 6 / 11 | Walk-compatible. Six wading pools need polygonal water support; transparent greenhouses, vegetation, koi and waterfalls have separate rendering costs. |
| tephra | 450/450 | 23/23 | 120,516 + 0 | 0 / 0 / 0 | Second low-static-cost candidate. Source ash, lava, vapor, lightning and English-rendered industrial signage need target evidence. |
| stratus | 450/450 | 22/22 | 220,233 + 0 | 0 / 0 / 0 | Void and suspension bridges require falling, recovery and bot-boundary fixtures even though the source exposes a walk route between every sampled spawn pair. |
| simoun | 450/450 | 39/39 | 410,770 + 92,366 | 0 / 1 / 3 | Source ring, sampled dune relief, central wading pool and timed sandstorm require authority and client support. |
| lotissement | 450/450 | 44/44 | 158,812 + 28,662 | 0 / 2 / 2 | Walk-compatible cul-de-sac. Two wading pools, furnished multi-storey rooms, roof access and local grass effects need paired fixtures. |

Original navigation reachability establishes a candidate for target testing. Admission still requires target collision and human/bot traversal, mode eligibility, actual rendered matches and disposal. The survey runs independently of the target server and renderer.

```sh
WAYLAND_DISPLAY=wayland-0 node tools/reference-map/export.cjs "$scratch" --assess --environment
```

## Deterministic production inputs

The exporter launches the pinned local reference package in an isolated Chromium context. It recomputes the private HTML fixture’s inline script digest after attaching listeners to the original factory. It reads the original merged material buffers, spawns, named zones, points of interest, collision flags, water, holes, ramps and multi-level navigation arrays. Static rest-pose props use the original prefab geometry transforms and ray shapes. Room authority and prediction share all body obstacles; the props stay in their authored rest positions in the pilot. No dynamic prop motion or synchronized destruction is advertised.

Two separate factory executions agreed on every collision volume, ramp, well, water bound, spawn, named zone and point of interest. The complete navigation position, cost and adjacency arrays also agreed. The native source contains 791 collision volumes, 5,376 multi-storey navigation nodes and 31,642 directed edges. The pilot routes bots along the 31,504 walk edges. The remaining 138 edges require authored parkour input. A port offering those edges must implement the corresponding bot action and add a traversal test.

The uninstanced source decoration contained 259,138 triangles. Baking the 250 authentic resting props produces 321,102 triangles including their appearance, with the same 791 collision volumes. Low quality loads principal and fine architecture, totalling 291,400 triangles in the entire map. Standard quality also loads 29,702 fine-detail triangles. The smaller low download is 2,806,902 gzip bytes. The fine-detail increment costs 246,408 bytes. Frustum/chunk visibility determines submitted triangles per frame.

Run from the repository root on the Pi, with the heavy slot reserved. Supply an empty private scratch directory outside the checkout. The source build requires Chromium, the existing Playwright dependency, Python 3, NumPy and Pillow.

```sh
scratch=$(mktemp -d)
WAYLAND_DISPLAY=wayland-0 node tools/reference-map/export.cjs "$scratch" --environment
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

The integrated native repeat on `7ead5ac` completed the ordinary English menu in desktop and touch browser profiles. Each entered both Floor 5 Classic and Meltem Endless, checked the unsupported Classic bookmark and Random selection, and returned through the menus. A separate native V3D TLS room then ran a complete match with nine authority bots, twenty map switches and a 186.47-second same-room parked control. Both stages exited successfully under a bounded user service. At Meltem visits 2, 10 and 20 and after parking, Chromium retained 78 canvases, zero detached game canvases, two WebGL contexts, 59 program objects and 110 shader objects. The collected heap measured 37.13, 36.72, 36.88 and 36.12 MiB respectively. The room rejected a corrupted LevelProject, recovered on the saved map and released all seats. The active match measured a 33.1 ms client p95 frame interval and 5.23 ms authority p95 execution time. [Timings, per-switch resources, control and normal-menu receipts](meltem-integrated-native.json) · [Desktop Endless match](meltem-english-desktop-match.jpg) · [Touch setup](meltem-english-touch-setup.jpg)

## Native source exports and target candidates

The protected native export executed Meltem, Kervénec Harbor and Tephra on the pinned Riposte frontend. It completed at 15:08:45 UTC on November 27. The three LevelProjects use the original solids, ramps, layered graph, rest-position geometry and English sectors. Both new maps pass the shared world’s ten spawn fit checks and 25 opposing-team routes. Their normal-match and resource gates are open until their own receipts are recorded. [Original-to-package hashes and counts](source-to-package.json)

| Map | Low architecture | Separately loaded fine geometry | Environment captured |
|---|---:|---:|---|
| Meltem | 302 batches, 291,400 triangles | 33 batches, 29,702 triangles | 12 sheets, 2 mills, 22 floating boats, 8 ponds, 8 wave bands and the original photographic sky |
| Kervénec Harbor | 305 batches, 502,749 triangles | 21 batches, 30,804 triangles | 6 sheets, 14 boats, 17 ponds, 8 wave bands and the original misty harbor sky |
| Tephra | 222 batches, 112,492 triangles | 8 batches, 8,024 triangles | 9 geothermal vents, an authored night sky, lava, ash, sparks and roof masking |

Riposte’s r147 map builders, cloth constraints, water parameters and texture painters execute during export. The r180 target decodes indexed geometry directly and uses the fixed donor cloth samples with GPU interpolation. Its separate environment group owns its meshes, shaders, textures and teardown. The shore distance field, authored wave bands, boat position, draft and hull geometry come from the original water controller. The target’s volcanic particles use the donor’s vents and sampled roof mask. The photographic sky files are byte-identical to the low-resolution source. The audio and material provenance is recorded separately. [Factory and media hashes](source-to-package.json) [Coastal recordings](audio/takes.json)

The decoded source UVs and packed half-float target UVs select the same painted cell for every board, decal and electronic display. Kervénec’s two auction displays retain all four emissive triangles in decal cell 4. Tephra retains all 244 console triangles in sign cells 6 and 7. Kervénec’s English sector names match the Fish Auction, Fish Dispatch, Ice Works and Harbor Café signage. The volcanic map uses the same Laboratory, Core Archive, Pump Station 2 and Control Room labels as its signs. [Kervénec target cells](art/candidates/embruns-packed-signs.json) [Tephra target cells](art/candidates/tephra-packed-signs.json)

### First integrated native runs

On revision `419d403`, both candidate maps completed a 45-second scored TDM through normal TLS family admission with one rendered player and nine authoritative bots. Both returned to the waiting room, switched to Floor 5 and back, rejected a damaged map, recovered and released every seat. Node naturally drained after each browser and authority closed. These captures establish two outstanding presentation requirements.

| Candidate | Pi GPU frame interval p50 / p95 / p99 | Authority step p50 / p95 / p99 | Measured art and audio |
|---|---|---|---|
| Kervénec Harbor | 44.3 / 84.9 / 101.9 ms | 2.05 / 14.77 / 29.93 ms | 561 median draws, 640,017 median triangles, 14 moving boats, six cloth sheets, 17 basins, eight wave bands. Nine simultaneous voices, 14,464,328 decoded bytes and zero decoder errors. |
| Tephra | 21.1 / 33.7 / 50.7 ms | 1.25 / 5.77 / 10.31 ms | 469 median draws, 293,172 median triangles, geothermal steam, 700 low-tier ash/ember points, ceiling masking and the photographic night sky. |

On the first candidate, Kervénec needed fewer low-tier submissions and triangles to meet responsive play. Its shaded buildings also needed the original diffuse-light calibration. Tephra’s ground routes appeared too dark in the first target frames. The following sections record the subsequent lighting, visibility and lifecycle results.

### Source lighting and low-tier comparison

The original foreground light bake provided 23 lamps in Kervénec and four in Tephra. The target samples the source's occluded lamp irradiance and diffuse bounce in bounded three-dimensional textures. Its Lambert lights use Riposte r147’s legacy irradiance normalization on r180. Tephra preserves the original emissive windows, fixture colors, volcanic plume and fountain fragment functions. The source images and geometry retain their attribution in the public credits. [Captured lighting, inputs and asset hashes](source-to-package.json)

The matched Pi 5 repeat on `1c70c0d` completed the same two 45-second TLS matches, including real controls and nine server bots. At the original harbor pier, the low model reduced architecture from 305 batches and 502,749 triangles to 149 batches and 238,376 triangles. Medium and high keep the original base geometry. The atlas cell assignments are identical in both tiers. The frame median fell from 44.3 to 25.0 ms and p95 from 84.9 to 38.8 ms. The authority’s step p95 fell from 14.77 to 7.15 ms. [Original and revised timings, pixel regions and hashes](candidates/relit-native/comparison.json) [Low-tier sign faces](art/candidates/embruns-low-signs.json)

Tephra’s full presentation ran at 27.0 / 40.4 / 49.7 ms frame p50 / p95 / p99, with 6.96 ms authority-step p95. The eruption is anchored to the original summit. The red pipes, lit fixtures and facades are distinguishable in the ordinary route frame; the foreground ash outside lit areas remains dark. The game played twelve overlapping volcanic voices, then released every active voice, decoded buffer and sound bank recorded by the cleanup test. The separate native PCM probe decoded all ten original recordings, rendered the real visual bolt, and measured audible thunder 3.12835 seconds after its trigger. The scheduled delay was 3.12818 seconds. Leaving before onset yielded zero audio at the output. These are browser measurements on a Pi and the protected unit exited successfully. [Volcanic gameplay](candidates/relit-native/tephra-game.jpg) [Summit and plume](candidates/relit-native/tephra-eruption.jpg) [Audio samples and reset](candidates/relit-native/tephra-pcm.json) [Unit status](candidates/relit-native/unit.json)

Both fresh English Solo profiles reached Floor 5, Meltem, Kervénec Harbor and Tephra through the normal menu. Desktop used a Swedish browser locale. The French touch profile rotated from portrait menu to landscape play. Both exercised Random, the incompatible Classic fallback to Floor 5, and return from play. [Clean native menu receipt and screenshots](candidates/english-menu/menu.json) The hosted map workflow exercises the ordinary two-seat Compact Arena, Meltem, Kervénec Harbor and Tephra touch matches with reconnect and natural process exit.

### Ground routes in the harbor and field station

The original `embrunsGround` and `tephraGround` factories place roads, stone squares, docks, moss and ash in world coordinates. The offline compiler executes those functions up to their r147 DataTexture allocation and preserves every RGBA mask byte. The r180 renderer samples the original four source surfaces in metres with the original height blend and soil tint. A four-layer mipmapped texture array and one linear mask keep the complete ground material to two samplers per loaded map. The map compiler adapts the photo height calculation for the low profile and retains the generated moss. No donor renderer runs in the game. [Source blobs, mask hashes, tile inputs and sizes](source-to-package.json)

The integrated protocol 16 build rendered the harbor and volcanic matches with nine live bots, all source mask channels on the GPU and zero failed shader programs. Kervénec recorded 26.1 / 44.5 / 82.5 ms frame p50 / p95 / p99 and 9.81 ms authority step p95. Tephra recorded 24.4 / 34.4 / 41.9 ms with 4.66 ms authority p95. Both returned to the family room, changed maps, rejected a damaged level, recovered the seat and released the audio and browser resources. The dark ash along the volcanic pipes now retains surface detail. The source contains a further display-space shadow lift for this route. [Native frames, material samples and timings](candidates/p16-ground/comparison.json)


### Integrated rendering, recovery and map changes

The protocol 17 account, movement and map build on Pi 5 ran a 45-second Tephra TDM with one rendered player and nine server bots. The final score was 1–2. Frames measured 25.1 / 37.6 / 45.5 ms p50 / p95 / p99, and the authority’s step p95 was 4.46 ms. The earlier graded build measured the same pipe-lane region at median display luminance 18, compared with 3 using the ground mask alone and 0 before the source ground material. The original display-space shadow lift makes the ash and pipe supports visible without an additional render pass. [Graded route frame](candidates/four-map-lifecycle/graded-ash-lane.jpg) · [First controlled profiles](candidates/four-map-lifecycle/first-soak.json)

The same family room rotated through Floor 5, Meltem, Kervénec Harbor and Tephra five times. Each visit reproduced the same renderer, program, texture and geometry counts for that map. The first run revealed one lazy GPU upload. When Meltem’s visible boat at (−50, 26) rocks across the stationary waiting camera, Three uploads its wooden deck. The trace identified all 447 geometries before that draw and all 448 afterwards. The timed repeat recorded the original raw count and compared after this real draw on each visit. [Named source mesh and four-return allocation trace](candidates/four-map-lifecycle/boat-upload.json)

At the 4th, 12th and 20th switch and after the matched 175.121-second park, the page retained one Game, one NetworkSession and one AudioSystem, with zero detached gameplay canvases. After collection, parked JS heap was 39.56 MiB at entry and 40.32 MiB at the endpoint. A deliberately damaged Floor 5 map failed closed; the remembered family device returned, acknowledged the saved map and released its seat. [Integrated p17 overview](candidates/four-map-lifecycle/p17-summary.json) · [Full native timings, source fields and teardown](candidates/four-map-lifecycle/p17-native.json)

Kervénec’s normal Graphics option switched Low → Standard → Low. Architecture changed from 149 to 305 batches and back to 149. The 21 optional fine batches (30,804 triangles) returned to zero on Low. Each setting retained one architecture group and the same 63 textures. [Graphics-option receipt](candidates/four-map-lifecycle/quality.json) · [Standard harbor frame](candidates/four-map-lifecycle/standard-harbor.jpg)

A separate Pi 5 run enabled game audio throughout the four-map rotation and entered active matches on Tephra, Meltem and Kervénec Harbor. All three soundscapes played decoded samples. The probe paired each of six opened soundscapes with its disposal using the world ID and instance identity. All six released their decoded bytes, voices and banks. Peak usage reached 14 voices and 16,325,124 decoded bytes. After damaged-map recovery, the authority released the room and Node drained in 458 ms. [Four-map audio and teardown receipt](candidates/four-map-lifecycle/audio-owner-visits.json)

The first hosted run on the reconciled map head exposed an intermittent account fixture failure. The fixture used the account password generator for a private room code. Base64url can emit an underscore, and private room admission correctly rejected that character. The fixture now generates a random 48-character hexadecimal room code. Password generation, access validation, account assertions, public moderation and map acceptance are unchanged. [Hosted failure](https://github.com/capstere/Cartridge-strike2/actions/runs/46131496095/job/140937434653)
