# Kervénec and Tephra signs and instruments

Kervénec uses BenDBSS’s painted port boards, fishing boat lettering, price chalkboard, posters, tide table and auction clock. Tephra uses the same author’s laboratory and plant signs, geothermal hazard markings, seismograms and volcanic monitoring displays. The source includes the art, drawing commands, seeded weathering, UV rectangles and world placements. The build runs those commands offline. [Riposte MIT license](../../../../../licenses/riposte-MIT.txt)

| Map | Original kit | Opaque signs, left half | Alpha decals, right half | Unlit geometry |
| --- | --- | --- | --- | --- |
| Kervénec (`embruns`) | `02l-port.js`, blob `a996fb0d9a47d3a1eb6fb485b9d92699c015357d` | `portSignAtlas`, material `signs3` | `portDecalAtlas`, material `decals3` | `screen` reads decal cell 4 on the two sides of the auction clock. The donor's unlit color multiplier is 1.8. |
| Tephra | `02yg-tephra-kit.js`, blob `b394efcfc19d1bf4feb85153976a6c590b8a60bf` | `tpSignAtlas`, material `signs5` | `tpDecalAtlas`, material `decals5` | `screenTp` uses the seismogram and monitoring map from sign cells 6 and 7. Control consoles, displays and rack indicators crop these cells differently. The material is unlit with vertex tint. |

The Kervénec auction face shows lot 0347, bass, the price 12.40, a 48 kg lot and buyer 112. The source placement and digits are preserved. The tide table uses High and Low, 24-hour clock times and decimal points. Vessel registrations, the personal name Gwenola and the BZH regional mark follow the original. The signs identify the ice works, fish market, harbor office and fish auction. Tephra’s two-line signs distinguish destinations from their functions. The field station, steam hazard, well labels, gas identification, seismic channel and monitoring legend all use English. Instrument readings, station codes and units retain their source values.

Each map loads a single 1536 × 768 sRGB texture for three materials. Packing two 1024-square source painters at 75% scale preserves their original aspect ratio and leaves almost ten sampled pixels in the smallest 13 px instrument headers. The decoded RGBA8 allocation is 4,718,592 bytes per loaded map, or 6,291,448 bytes including all mip levels. Hardware and quality settings determine allocation and sampling in a complete match.

## Reproduction

With the vendored browser tooling and a local Chromium installation, generate each atlas and its English text receipt. Set `CHROMIUM_PATH` to the browser executable. The helper checks the source Git blob before painting, enumerates every real canvas text draw by cell and checks the complete result against the English label set.

```sh
node tools/reference-map/candidate-signs.mjs embruns assets/fps/maps/embruns/signs.webp docs/cartridge-strike-3/maps/art/candidates/embruns-paint.json
node tools/reference-map/candidate-signs.mjs tephra assets/fps/maps/tephra/signs.webp docs/cartridge-strike-3/maps/art/candidates/tephra-paint.json
```

Given the private map exporter output for a candidate, inspect the decoded WebP, restore each source triangle’s original UV coordinates and count the actual emitted sign, decal and instrument faces by atlas cell.

```sh
python3 tools/reference-map/inspect-sign-surfaces.py "$map" "$raw" "assets/fps/maps/$map/signs.webp" "docs/cartridge-strike-3/maps/art/candidates/$map-paint.json"
```
