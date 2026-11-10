# Reload Foley on Floor 5

Each primary weapon follows its visible reload mechanism. Times below are fractions of the weapon’s existing reload duration. All takes come from the supplied `foley.zip` and play at their recorded pitch and speed. The runtime filenames add the existing `ffsl-` prefix.

| Weapon | Duration | Recording and animation cue |
| --- | ---: | --- |
| AR47 · Arc Rifle | 2.30 s | `f_magout_rifle-2.mp3` at 23% during extraction. The short, sharp `f_magin_rifle-2.mp3` seats the curved magazine at 77%. |
| CR4 · Pulse Carbine | 2.10 s | `f_magout_rifle-2.mp3` at 25% and `f_magin_rifle-1.mp3` at 63% follow the Strike Kit glove and magazine. On empty only, `f_charge_rifle-2.mp3` begins at 71%. Its closing transient arrives around 88% as the hand releases the charging handle. |
| SMG · Pulse SMG | 1.80 s | `f_magout_smg.mp3` at 22% and `f_magin_smg.mp3` at 77%. These short takes fit the compact magazine and faster reload. |
| Shotgun · Breach Shotgun | 2.60 s | Four visible shell cycles. `f_shell-1.mp3`, `f_shell-2.mp3` and `f_shell-1.mp3` begin at 24.6%, 49.7% and 74.7%. `f_shell-3.mp3` begins at 89.3% so its later contact lands just before the fourth shell seats. The animation always shows four strokes, regardless of the ammunition deficit. |
| Sniper · Scout Rifle | 2.90 s | `f_magout_rifle-1.mp3` at 25% gives the slower withdrawal a longer handling sound. `f_magin_rifle-1.mp3` seats the detachable magazine at 77%. The scope rifle’s bolt and shotgun’s pump move during firing. Their reload sequences have no bolt or pump cue. |
| Bazooka · Rocket Launcher | 2.80 s | `f_pickup-2.mp3` at 30% accompanies taking hold of the rocket. `f_stow-2.mp3` at 75.6% gives the round a seating sound as it slides into the tube. A one-round launcher always reloads from empty. |

## Playback and mix

The archive contained 49 MP3s. Each was decoded to mono 48 kHz PCM for analysis of onset, peak time, significant tail, peak level and active RMS. For example, the SMG insertion peaks 6 ms into its recording, the carbine charge peaks at 349 ms, and the final shotgun shell peaks at 241 ms. Those differences informed the cue positions. The sharper magazine insertions use lower gains. The game ships the original MP3 bytes. Twelve distinct recordings serve the six weapons, including two files already present in the game.

Previously, Action Audio gave the AR47, SMG, shotgun, sniper and launcher the same four stages at 0%, 27%, 65% and 88%. Those stages mixed three generic metal impacts with noise and an insertion tone. CR4 used the Strike Kit release click, the first rifle magazine-out and magazine-in recordings, and the first charging recording on empty, with synthesized fallbacks. Riposte supplies other effects such as weapon draws and gunfire. P9 and P12 retain the Strike Kit release at 12%, pistol extraction at 25%, insertion at 64% and empty-only slide at 83%, including their existing gains and fallback sounds.

The primary Foley player reads the same actor deadline and weapon duration as the viewmodel. It starts a sound when simulation time crosses its cue, limits the tail to the remaining reload time, and drops obsolete cues after a long frame. Each actor has one reload voice. Switches, death and reset stop it. Pause clears the active voice and resume can play the remaining animation cues. A bot uses its current position and the existing distance, wall filtering and master-volume path. A missing recording is reported in audio diagnostics and its cue is skipped. [Cue definitions and playback](../src/fps/reload-foley.mjs)

## Verification

Serve the repository on port 8765 and install the locked Chromium tooling described in the [handover](../HANDOVER.md#verification). Run the focused browser test with `node tools/reload-foley-browser.mjs`. Set `FPS_TEST_ORIGIN` to exercise a deployed build.

The browser test enters Floor 5 through the normal lobby and uses the inspection clock to advance the rendered match. It sets reproducible magazine deficits, presses R, lets a bot initiate its own reload, and observes the decoded buffers sent to Web Audio. It checks partial and empty magazines, consecutive reloads, switch cancellation, death, pause/resume, match restart, ammunition transfer and positional bot channels. It also checks both pistol sequences. The Node tests cover skipped frames, mute and per-actor cancellation. The acoustic checks use decoded signals and browser playback. Speaker and headphone listening on a physical handset remains unverified.
