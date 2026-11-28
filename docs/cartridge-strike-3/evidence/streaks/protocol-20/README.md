# Integrated Rage reload verification

Raspberry Pi Chromium used two native Wayland windows and ANGLE/V3D on November 28. Protocol 20 build `5d3875bbbda009d9d1c63ce4d8e06227d5493745a1cc4c63c12935f5278a34fb` contains the qualified map, accounts, renderer, operator wardrobe and streak changes. Its 706 runtime files include every path from the 704-file wardrobe build and the 702-file account/map/streak build. The generated contracts and static integrity checks reproduced. This run used Compact Arena over loopback. One desktop player and one Chromium-emulated touch player entered from Home using the normal multiplayer menus.

## What the players saw and heard

The desktop player equipped Breacher in Wardrobe, fired the SMG using the mouse and pressed R. After the ordinary reload the player activated Rage with J, fired again and pressed R. The server accepted 1.80 s and 1.35 s intervals. The selected Breacher remained visible to both players. Each client rendered its own camera continuously. The probe captured the owner weapon mechanism, the remote authored Pistol_Reload mixer and actual 48 kHz Web Audio magazine buffers. The renderer used adaptive resolution on a 896 × 504 desktop viewport and a 568 × 320 touch viewport with a 0.75 device scale factor.

| Measured contact | Ordinary | Rage |
| --- | ---: | ---: |
| Magazine withdrawal, both clients | 0.400 s | 0.300 s |
| Owner magazine displacement | 0.0682 m | 0.0682 m |
| Remote authored clip progress | 22.22% | 22.22% |
| Owner / observer insertion audio | 1.400 / 1.400 s | 1.050 / 1.057 s |
| Playback rate | 1.000× | 1.333× |
| Owner / observer rendered reload frames | 72 / 67 | 60 / 57 |

The authority holds the selected reload start and duration through expiry of Rage. Snapshots include both values for the owner and observers. A separate two-client test disconnected the reloading player, advanced the Rage deadline and reconnected the same seat before reload completion. Both clients retained the original interval and cleared it on completion. Exact start, end and intermediate phase regressions exercise ordinary and accelerated SMG, P9 and CR4 meshes as well as the actual shipped male and female operator skeletons. Mid-reload listeners can pick up subsequent foley contacts.

[Ordinary owner frame](ordinary-owner.webp) · [Ordinary observer frame](ordinary-observer.webp) · [Rage owner frame](rage-owner.webp) · [Rage observer frame](rage-observer.webp) · [Per-frame and audio receipts](rage-reload.json)

The same clients verified private UAV markers, the touch Immortal button, both hit notifications, reconnect restoration, death carry and spent/locked UI. The checks measured each control's live hit target in CSS pixels. Physical-phone and headset qualification remain separate. [Browser receipt](browser.json) · [Desktop UAV](desktop-uav.png) · [Small touch viewport](touch-ready.png)

## Cold first sightline remains a performance finding

In a separate unprimed run, the harness brought the desktop forward and placed Breacher in the touch observer's sightline immediately before reloading. The observer's simulation times at consecutive audio callbacks were 1.467 s before and 0.867 s after reload start, a 2.333 s gap. Its audio context was running, the buffer was decoded, and the game was active. The 0.396 s withdrawal cue was already 471 ms overdue at that callback. The existing 120 ms freshness rule suppressed it. The observer played the later insertion cue at 1.419 s. The owner played both. This reproduces a player-visible loss of early presentation on first sight. Foreground changes, asset uploads and shader compilation remain possible contributors. This trace cannot attribute the gap to any one of them.

For the paired warm comparison above, each camera had to render the placed operator for ten consecutive frames with simulation advances under 110 ms before the trial started. The game kept rendering and accepting input throughout. The cold transition remains open for performance investigation. [Cold observer frames and sound clock](cold-observer.json) · [Simultaneous owner trace](cold-owner.json)

To repeat, set `CS3_BONUS_RELOAD_CAPTURE=1`, `CS3_BONUS_EVIDENCE` to an output directory, and run the normal two-browser command in the [streak acceptance guide](../README.md).
