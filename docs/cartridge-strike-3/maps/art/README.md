# Meltem waterfront signs

Riposte’s Meltem factory places painted boards on shops and the chapel, lettering on fishing boats, menus, fair posters and wall markings. The donor also supplies atlas cells such as ferry times and a for-sale board for use by its level kit. The original geometry export preserved their quads and UVs. Converting every unidentified material to an opaque vertex color made the boards blank and filled the transparent parts of the decals.

The compiler preserves the original geometry, winding and vertex colors for all 44 sign boards and 93 decal quads. The two painters in `frontline/source/src/02yb-cyclades.js`, `cySignAtlas` and `cyDecalAtlas`, run offline with the original seeded variation and typography. A checked translation table supplies English words for every Greek label before text measurement and painting. The paint colors, borders, weathering, prices, schedules, coordinates and non-text symbols follow the source. The complete graphics kit is Git blob `ed36786a3e36eaf292b8d51b064fa8648b72da73`. BenDBSS published the source under the [MIT license](../../../../licenses/riposte-MIT.txt).

Both original UV layouts share one 1024 × 512 sRGB texture. WebGL retains two small world-space batches with 88 opaque sign triangles and 186 transparent decal triangles. The packed U coordinate selects the left or right atlas half, and V retains the original top-to-bottom convention. The water-facing text follows the same lighting and depth as its building. The decal material blends its original partial alpha over the underlying surface. Both use the existing map texture disposal path. The maximum steady texture storage at RGBA8 including mipmaps is 2,796,204 bytes.

## Native waterfront comparison

On November 27, 2026, Chromium 156.0.8078.79 rendered the ordinary Solo Endless match through Broadcom V3D 7.1.10.2. Both runs used the low graphics profile, a 960 × 540 viewport, an 816 × 459 framebuffer, and the same fixed player pose. The restored menu is visible on the wall to the right of the arch. A pergola rail crosses the larger tavern sign from this position. The historical HUD also displays the pre-localization spawn label present at the captured revision. [Original frame](before.jpg) · [Restored frame](after.jpg)

| Fixed-view measurement | Original | Restored |
| --- | ---: | ---: |
| Frame intervals sampled | 90 | 90 |
| Median frame interval | 19.5 ms | 19.9 ms |
| 95th percentile | 33.9 ms | 33.3 ms |
| 99th percentile | 37.7 ms | 41.0 ms |
| Complete scene draw calls | 443 | 445 |
| Complete scene submitted triangles | 370,624 | 370,674 |
| Resident textures | 71 | 72 |

Both signage materials reported the same decoded texture. The opaque batch sampled U from 0 to 0.5 and the transparent batch from 0.5 to 1. Grouping the sign faces across the map changes which faces enter a particular frame’s view. The packed base still contains 291,400 triangles and the unchanged detail level contains 29,702. This single pair measures cost at the quay. Longer sessions and traversal use the package performance gates. [Original renderer receipt](before.json) · [Restored renderer receipt](after.json)

The atlas is 80,880 bytes with SHA-256 `79ee402e3c9735f698db635da120089cad53b55f45fbde4094842bb6f81470dd`. The base mesh changed from 2,806,902 to 2,805,032 bytes with SHA-256 `8ef6ea1744698179b8f3baa2aa322fff603cd3660fd443463ee80c7b4d9625fe`. Together they add 79,010 bytes to the packaged low-tier map. The restored runtime revision was `c52c3363649fb27d4d1ef1130d6e7b99984cd79f`.

## Reproduction

Use the full checkout with the map export’s Python dependencies and the vendored Playwright dependencies installed. Supply the private directory produced by the original map exporter to the existing packer. `CHROMIUM_PATH` can select the installed Pi Chromium. The packer invokes the sign generator automatically.

```sh
OPENBLAS_NUM_THREADS=1 CHROMIUM_PATH=/usr/bin/chromium python3 tools/reference-map/pack.py "$raw" .
```

For the fixed-view comparison, serve the checkout over loopback and set `FPS_TEST_ORIGIN`. The comparison starts the ordinary Solo Endless match twice on the low graphics profile. After entry, it fixes the camera at a known point on the quay to obtain the same view of the same geometry. The baseline serves the three original renderer/mesh files from the supplied commit, keeping the map, game, controls and browser settings matched.

```sh
CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  node tools/reference-map/capture-signs.mjs "$evidence" 37c006f766ec799581eff54c9273703373a4099a
```
