# First-person and spatial shot audio

Cartridge-Strike 3 uses two original Riposte takes per bank. A local shot starts immediately. A remote shot uses the nearby recording below 40 m and the appropriate distant weapon family at 40 m or more. Its arrival delay follows the reference distance curve, capped at 0.5 s. The existing spatial panner, occlusion filter and volume controls own the final mix. A pause or round reset cancels scheduled arrivals.

The first take is available through the game's regular audio unlock. Three decoders share that initial queue. The second take loads on first use of that bank in a single serial queue. An event that used a fallback can never be replayed by a completed decode. The 24 additional MP3 files total 304,728 bytes. All 38 shot takes match the original donor files. [Asset hashes and license IDs](donor-takes.json)

The cartridge latch reuses Riposte’s processed `f_pin.mp3` from `05-audio.js` and the marker in `08-player.js`. One confirmed `cartridge-latch` event from the handling package owns the cue. CGEffex’s CC BY 4.0 attribution, edits and source are included in the in-game credits. The shipped clip and the donor both have Git blob ID `854046f05784b331a701a8960063bf96f84efda9` (4,221 bytes).

The Scout bolt and shotgun pump recordings reuse the byte-identical CC0 FFSL edits cataloged as `f_bolt-1` and `f_pump-1` (10,677 and 8,349 bytes). The handling integration owns the animation markers and cancellation.

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

Run `node --test src/fps/shot-audio.test.mjs`. Serve the checkout on loopback and run `FPS_TEST_ORIGIN=http://127.0.0.1:8765 node tools/spatial-audio-browser.mjs`. Set `CHROMIUM_PATH=/usr/bin/chromium` for the Pi browser. The offline render, reset and asset identity checks also run in the FPS regression workflow. The combined English and acoustic run used protocol 15 build `ff13002dba01f90bfe2bd221dd267df792c422a9699f98869f7f64b32f90963c` with 562 allowlisted files. Native Chromium 156 rendered one latch source with its first PCM onset at 5.71 ms after the gameplay marker, at 48 kHz. A combined protocol-16 session is needed to bind that measurement to the actual hold animation.

## Radio language

All six shipped radio commands matched the English captions in `src/fps/action-rules.mjs` when decoded against the same English command vocabulary. A blind general-English model independently recognized “go go go” and most of “stick together team”, and misheard several short, filtered phrases. The death sound is a vocal effect and is excluded from the command count. On the matched Pi, run `python3 docs/cartridge-strike-3/evidence/audio/read-radio.py .` with FFmpeg, PocketSphinx 0.8 and its US English acoustic model installed. [Decoded output and controls](radio-language.json)

## Flash hearing

V6 shows a bright world flash while the direction pad, map and status remain readable. Its audio track contains a decaying band around 3.11 kHz. The local game reuses the distance and obstruction response in Riposte’s `flashBang` and the gain, filter and ringing envelopes in `sfxFlashBang`. Within 13 metres the effect weakens with distance, halves behind cover and recovers over the listener’s individual exposure time. Ten 100 ms windows between 0.9 and 3.4 seconds in the original stereo recording place the ringing between 3,108.45 and 3,109.19 Hz. The game uses a steady 3,109 Hz oscillator. The exact source hashes, relative levels and frequency estimates are in the [source measurement](v6-source-band.json), reproducible from the original stereo PCM with [the measurement script](v6-source-band.py). Reduced Flash, enabled by default, lowers the transient and shortens and attenuates the ringing and world filtering. The existing pause, round-reset and disposal paths clear the effect. Solo supports these flash grenades. The current private TDM and Classic rules supply HE cartridges.

The spatial audio browser regression renders the complete event through a real OfflineAudioContext with near, distant, occluded, reduced and reset cases. It checks the frequency after the initial detonation, amplitude decay, restored silence, and reduced exposure. A continuously playing 6 kHz world tone measures the filter during exposure and after recovery. Spectating another actor or spawning into a new life clears the ear effect while the world continues playing. The test measures the browser mixer at 48 kHz.

On the Pi, Chromium 156 measured 3,109.07 Hz between 450 and 550 ms on a nearby full-strength exposure. RMS amplitude over this interval fell from 0.00899 at full strength to 0.00072 with Reduced Flash. At 1.8 s only the full-strength near ring remained. A continuing 6 kHz environmental tone measured 0.12085 before exposure, 0.000121 when muffled and 0.12085 after recovery. The distant, reset, new-life and spectator cases had zero measured ringing in the sampled post-blast window. [Native PCM evidence](v6-flash-pcm.json)
