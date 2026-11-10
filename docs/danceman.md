# Danceman in Sector H

Danceman stands at **(18, 0, −14)** on the C08 floor slab in both match types. From Sector E, pass through the eastern door and look to the side of the opening. Door BYGG-D-0034 is 2.46 m from his anchor. The surveyed spot has 0.90 m of radial clearance for the rig and keeps the doorway clear. Danceman uses a stationary living collision body and the existing neutral raycast, hit, damage and death events.

## Original model

The 1.70 m GLB has 16 named animations. Danceman plays four in shuffled groups, with a different clip on either side of a group boundary. Each plays at its original speed. The existing skeletal mixer blends the transition over 180 ms. Playback removes horizontal hip translation and preserves the vertical movement and joint rotations.

| Use | Original clips |
| --- | --- |
| Dance | `All_Night_Dance` (8.17 s), `Jazz_Hands` (2.73 s), `Flirty_Strut_inplace` (3.20 s), `Groovy_Walk` (4.97 s) |
| Lethal hit | `Dead` plays once for 2.97 s and holds its final pose. A new Classic round or new match restores him. |
| Other clips included in the source | `Running`, `Walking`, `Backflip`, `Idle_15`, `Run_and_Shoot`, `Skill_01`, `Skip_Forward`, `Talk_with_Left_Hand_Raised`, `Walk_Backward_with_Gun_1_inplace`, `Walk_Backward_with_Gun_inplace`, `Walking_Scan_with_Sudden_Look_Back` |

## Sound

The game decodes both local MP3s into its gameplay audio context. The existing simulation `start` event triggers `prepare-to-fight.mp3` once when Classic switches from buy to combat, or once at Endless entry. A cold launch waits for the playable HUD and audio unlock. Respawns, resume and duplicated events do not repeat the line.

Danceman’s 9.06 s track loops through one positional source. It starts at the current match-time offset when approached. The mix fades with distance, reaches zero at 9 m and releases the source at 10 m. Walls reduce the gain and low-pass the track. Mute, death, pause, match exit and round reset release the loop. The announcer and the music both use the gameplay master gain.

## Reproduce

Serve the repository and install the locked Chromium tooling from the [handover](../HANDOVER.md#verification). Run `node tools/danceman-browser.mjs` for Classic desktop and 844×390 touch-emulated Endless. Set `FPS_TEST_ORIGIN` to the Pages origin to test the published build. Set `FPS_CAPTURE_DIR` to save dancing and death screenshots. Run `node tools/match-lifecycle-browser.mjs` for 20 alternating match cycles with a visit to Danceman before backgrounding and returning to the lobby. [Focused simulation checks](../tools/danceman.test.mjs)
