# First-person and spatial shot audio

Cartridge-Strike 3 uses two original Riposte takes per bank. A local shot starts immediately. A remote shot uses the nearby recording below 40 m and the appropriate distant weapon family at 40 m or more. Its arrival delay follows the reference distance curve, capped at 0.5 s. The existing spatial panner, occlusion filter and volume controls own the final mix. A pause or round reset cancels scheduled arrivals.

The first take is available through the game's regular audio unlock. Three decoders share that initial queue. The second take loads on first use of that bank in a single serial queue. An event that used a fallback can never be replayed by a completed decode. The 24 additional MP3 files total 304,728 bytes. All 38 shot takes match the original donor files. [Asset hashes and license IDs](donor-takes.json)

## Pi Chromium signal measurement

The native Pi browser rendered the actual decoded MP3s through the game's shot selection, tracking and spatial Web Audio graph at 48 kHz. Each second shot used the other recorded take. The onset is the first sample above 3% of that signal’s peak. At 48 m, pausing before arrival gave an all-zero output buffer and zero retained sources. This measures the browser mixer. Physical speaker onset and touch-to-display latency require device measurements. [Recorded samples and timestamps](pi-offline-pcm.json)

| Weapon | Distance (m) | Scheduled arrival (ms) | Measured PCM onset (ms) |
| --- | ---: | ---: | ---: |
| CR4 | 0 | 0.00 | 0.31 |
| CR4 | 8 | 23.32 | 29.85 |
| CR4 | 48 | 139.94 | 146.31 |
| P9 | 0 | 0.00 | 0.17 |
| P9 | 8 | 23.32 | 30.67 |
| P9 | 48 | 139.94 | 147.62 |

Run `node --test src/fps/shot-audio.test.mjs`. Serve the checkout on loopback and run `FPS_TEST_ORIGIN=http://127.0.0.1:8765 node tools/spatial-audio-browser.mjs`. Set `CHROMIUM_PATH=/usr/bin/chromium` for the Pi browser. The offline render, reset and asset identity checks also run in the FPS regression workflow. Captured build `1fb2f6b227eaf166bca0d0dee294d46fef3bcc7a342a728336812fd75a854a8b` used protocol 15.
