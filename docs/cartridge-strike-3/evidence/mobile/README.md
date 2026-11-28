# CS3-06 mobile acceptance

The first touch run used Chromium on the Raspberry Pi's Wayland desktop. Chromium generated the touch contacts through CDP. The game continued its ordinary frame loop throughout the match. The viewport began at 844 × 390 CSS pixels and rotated to 390 × 844. These observations describe emulated touch input on the Pi. Physical handset comfort, touch sampling and screen latency require a handset.

## Normal-play observations

Build `362425582c5d9142a0369d8c11feae670b899845af89c853350c88343463d1f7` at `c1a3db749e8be0050d4afc7d8bba16cae1ff1769` opened Options, restored settings after reload and deployed into Meltem Endless through the Solo menu. [Frame-by-frame state samples](p20-touch-through-rotation.json) include game times in seconds, renderer frame numbers, pointer ownership and weapon state.

| Reference requirement | Observed result |
| --- | --- |
| IMG_8153, IMG_8154 and IMG_8157 controls and persistence | Export/import and reload preserved the fixed stick, Run button, scope release, invert Y, 82° FOV, 0.9 zoom sensitivity and repositioned Reload button. A malformed import showed an English message and the valid profile could be reimported. |
| IMG_8155 sound controls | The live menu track read 0.2 at master 0.5 and music 0.4. Muting announcements left it at 0.2 after reload. The fixture reads the live audio element and saved settings. |
| V4 2.417–3.250 s and V6 6.252–6.502 s Rush pose and feedback | Forward motion alone kept the fixed-stick profile walking. Pressing Run entered Rush with a gold ring, reticle opacity 0 and weapon roll 0.467 rad at game time 1.10 s. Crouch entered the slide with 0.60 s remaining at game time 1.75 s. [Rush frame](p20-rush.jpg) |
| IMG_8157 compound gestures | With three pointers held, movement and camera yaw both changed while the scope reached full aim. The rifle held five rounds until the trigger finger lifted. Ammo then fell to four, while stick ID 6 and look ID 7 stayed active. A subsequent scoped touch cancel kept ammo at four. [Scope release frame](p20-scope-release.jpg) |
| Rotation during movement | Turning portrait paused the game at 3.83 s. Forward, Look and Fire had no active owners. The earlier viewport and renderer buffer sizes are retained in the sample. |

The 2026-11-28 source review used the actual IMG_8153–8157 settings panels and timestamped V2/V4/V6 frames. [Recording observations](../../RECORDING_REVIEW.md) and [settings panel requirements](../../UI_UX_SPECIFICATION.md) identify the original frames and their acceptance criteria. Riposte contributions include `09q-tactile.js` touch roles, `09qb-tactile-layout.js` normalized layouts, `09qc-manette.js` controller dead zones and spatial navigation, `09qd-visee.js` aim behavior, `08a-binds.js` distinct device input paths and `09r-pwa.js` install/update behavior. Local and network games use the existing CS game input and authoritative weapon rules.

## Reproduction

Serve the exact built checkout. Set `FPS_TEST_ORIGIN`, `CHROMIUM_PATH=/usr/bin/chromium`, `FPS_NETWORK_HEADED=1`, working Wayland environment variables and `CS3_MOBILE_EVIDENCE` to a scratch directory. Run the following fixtures serially on the Pi.

- `node tools/mobile-profile-browser.mjs` exercises the normal menus, scoped three-pointer play, rotation, grenades and power-saving cadence.
- `node tools/gamepad-menu-browser.mjs` supplies a virtual standard Gamepad API controller for menu navigation, gameplay, reconnect and stalled deployment.
- `node tools/mobile-pwa-browser.mjs` checks an installation at the supplied origin. Repeat with a repository subpath. The fixture disconnects page and service-worker traffic from the origin before checking recovery.
- Existing package checks include `tools/mobile-reliability-browser.mjs` and `tools/online-autofire-browser.mjs`.

This checkpoint covers the rows above. Native grenade hold/release and interruption, floating-stick thresholds, the 30 Hz rendering cap, controller play and offline recovery are tracked separately. No physical controller or handset was connected for this run.
