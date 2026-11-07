# Cartridge Strike 0.14.0 – Precision Pack

This release extends the original game at `/fps/`, not the separate Frontline copy.
No floor-plan, collision, bot AI, weapon damage or firing cadence changes are intended.

## Player features

**Precision aim / sniper zoom.** Hold right mouse on desktop, or toggle with F. On touch, tap SIKTA or double-tap the right-hand look area. Standard guns narrow field of view from 76 to 52 degrees (shotgun 60); sniper uses 24 degrees and an original CSS scope. Mouse/finger sensitivity scales down with zoom. Scoped weapons have lower shot spread and the Riposte ADS recoil factor (0.66). Hip fire and bots keep their existing spread. Aiming is cleared on pause, death, respawn, round/weapon changes and loss of focus. Sniper auto-fire requires the scope to be ready as well as the existing target dwell.

**Soft mobile aim assistance.** Optional, enabled by default on touch. Finger movement slows by up to 40% near a visible opposing actor. It does not snap, rotate, track, reveal enemies or enlarge the actual hitbox. Physical obstacles, smoke, strong flash and range restrict assistance. Desktop mouse never receives this assistance.

**Automatic empty-magazine reload.** Optional, enabled by default. After an empty magazine has remained selected for 280 ms, the normal reload is requested. No free ammunition or shorter reload times. It does not start while paused, interacting or dead, with no reserves, or after switching away. The reserve/round mechanics are owned by the existing Game implementation.

**Usable mobile inventory.** VAPEN cycles primary, sidearm and knife instead of only toggling last weapon. The manual KASTA / AVFYRA button remains visible for grenades and rocket launchers, even with auto-fire enabled. These explosives never auto-trigger.

## Source and licensing

Mechanics adapted from the public MIT-licensed Riposte: Frontline snapshot at commit `31ca050d8ce59f4885c01a3237f68cdf186c9b60`:

- `src/09qd-visee.js`: visible-target look friction and zoom-related assistance.
- `src/09q-tactile.js`: double-tap aiming / separate touch actions.
- `src/07c-controller.js`: aimed spread and delayed automatic reload.
- `src/07ca-recul.js`: ADS recoil multiplier.

Copyright (c) 2026 BenDBSS. Existing `licenses/riposte-MIT.txt` and `licenses/riposte-NOTICE.md` remain unchanged. The adapters, UI layout and CSS scope are authored for Cartridge Strike. No restricted music, animations, logos or assets are imported.

## Verification

`tools/precision.test.mjs` exercises rules and exclusions without rendering.
`tools/precision-smoke.cjs` boots the actual game in Chromium mobile and desktop contexts and exercises scoped FOV, touch double tap, pause/reset, actual reload/ammunition transfer, manual grenade throwing, rocket controls, inventory cycling and setting persistence.
The pre-existing recoil/auto-fire and mobile/desktop smoke suites are retained.

Headless mobile emulation is not a physical iPhone/Safari test. Screenshots and CI results are attached to the feature workflow. Original artwork/assets remain under their existing separate notices.
