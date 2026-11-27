# Coastal soundscapes

Meltem now plays surf at four points along the quay, cicadas at four hillside sources and two creaking mills at their moving sail hubs. The two visible hubs are at (−10, 18.2, ±50.6). Gulls fly above the coast, the jetty chapel rings, goats sound from the hill and gusts pass the player. Kervénec has five surf sources, including one inside the harbor basin. Its intermittent calls include gulls, rigging, creaking vessels, the buoy bell and a distant foghorn. The map sound profiles activate when the game loads their respective reference worlds.

The implementation uses the authored coordinates, variational sample banks, event intervals, interior gain, shore distance and air filtering in `02yf-meltem.js`, `02u-embruns.js` and `05c-ambiance.js`. On Kervénec the distance to water also includes the harbor inlet around x = −18. Shot and world-hearing simulation use separate random state from these local presentation events. The original Floor 5 room tones continue through their existing path.

## Recordings and credit

The 26 MP3 files are the original Riposte MP3 edits, including all 13 takes from each pack. The audio credits shipped with the game identify the donor cuts and their 20 source entries. Each original recording is under CC0 1.0. The English [per-take file inventory](takes.json) contains the original file names, creators, links, licenses, exact shipped byte counts and SHA-256 digests. The original pack builders in `frontline/source/tools/sfx/ambiances.py` document the editing and mixing. The credited source material includes the following recordings.

| Map | Sound | Credited original recordings |
| --- | --- | --- |
| Meltem | Sea bed | Gentle sea wash by deleted_user_3277771, Cicada chorus in Paros and Winds howl across a sun shade by CalebLopez |
| Meltem | Quayside waves, cicadas and mills | Waves lapping on rocks by dan.pugsley, Cicada chorus in Paros by CalebLopez and Arizona windmill squeaks by Félix Blume |
| Meltem | Gulls, gusts and bells | Gulls by Soojay, wind by CalebLopez, Church Bell sound by Thejack288 and goats’ bells by Félix Blume |
| Kervénec | Harbor bed and quay | Deauville harbor and Dellec sea by Joseph Sardin, WavesOnTheShore by richardemoore, wind in dry grass by Félix Blume and RiverWavesWall by Biofonik |
| Kervénec | Gulls | Soojay, squashy555, genghisattenborough and kyles |
| Kervénec | Rigging and hulls | Kenney’s Impact Sounds, whistling masts by Joseph Sardin, wood ship and pulley creaks by craigsmith |
| Kervénec | Navigation signals | Ship Bell Single Ring by Sojan and East Brother Island Lighthouse foghorn by Elwood P. Dowd |

## Playback and resources

Each map fetches one compressed file and decodes one buffer at a time. The following map waits for the previous map’s in-flight decode to yield, even during a rapid map change. Sources that share a take also share the decoded buffer. The byte cap counts channel samples at the actual decode rate. The desktop profile uses up to 32 kHz and 17 MiB. A coarse-pointer device uses up to two takes per bank at 24 kHz and 12 MiB. Available voices are one bed, the map’s fixed sources and three overlapping spots. Releasing a map aborts its pending request and stops, disconnects and clears all its sources. Pause, mute and match reset use the same release path.

Run the byte, donor timing, authorship and geometry checks with `node --test src/fps/coastal-ambience.test.mjs`. For native audio, serve the checkout on loopback, set `FPS_TEST_ORIGIN` and `CHROMIUM_PATH`, and run `node docs/cartridge-strike-3/maps/audio/native-probe.mjs`. Set `CS3_COASTAL_RESULT` to store the JSON. The probe decodes both actual packs, renders mixed PCM and isolates the sea bed and a spatial wave emitter from three occupiable positions in Meltem’s real collision world. It also checks lifecycle behavior and simultaneous voices. Kervénec’s audio qualification uses its donor coordinates and a clear acoustic test scene before the new map’s normal entry is qualified.

On the Raspberry Pi 5, Chromium 156.0.8078.79 decoded 15.57 MiB for Meltem and 13.79 MiB for Kervénec on desktop. The emulated touch profile used 11.13 MiB and 9.30 MiB respectively. The maximum simultaneous channel counts were 14 for Meltem and nine for Kervénec. Both maps released every voice and retained zero decoded bytes after mute, immediate exit, and a pending-response map switch followed by reset. In the original Meltem world the sea bed measured RMS 0.02927 at the waterfront, 0.00464 inland and 0.01543 under quay roof `volume-431`. The nearest wave emitter was on the listener's right at the waterfront. These are digital audio measurements before physical device output. [Native PCM and lifecycle receipt](native.json).
