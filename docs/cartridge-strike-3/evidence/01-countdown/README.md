# First-person match countdown

V1 opens on a first-person view with a 0–0 score, a full 10:00 clock and the current map. The player turns from rock toward a teammate between 3.000 and 3.500 seconds. The final three digits are amber. The launch text appears by 4.668 seconds and fades toward 5.502. The recording starts partway into the first displayed second. Its roughly 1 kHz pulses occur near 1.56, 2.59 and 3.59 seconds, followed by a different launch cue near 4.57. [Recording review](../../RECORDING_REVIEW.md)

CS3 adapts the five-second duration, look permission, amber threshold, compact text pulse and distinct launch from Riposte. Solo pauses the deployment clock when the player pauses. Private rooms use the existing server deadline and 60 Hz release tick. The client renders only observed seconds, keeps the mode-specific score and timer, and leaves position, ammunition, AI, purchases and score under the existing rules. Classic retains its full buy phase after deployment. Re-entering an active room, returning from a hidden tab and starting later Classic rounds discard earlier cues. Reduced motion keeps the same timing and color with static text. [Reference implementation](../../../../frontline/source/src/09y-decompte.js)

The three unchanged source MP3 files add 20,349 bytes. The original files live under `frontline/source/assets/sfx/`. The existing game audio context plays them locally. A cold audio buffer can produce an immediate synthesized cue for that beat. Decoding later never queues it for replay. [Original sound credits](../../../../licenses/riposte-sfx-credits.json)

| Mark | Source file | Author and license | SHA-256 |
| --- | --- | --- | --- |
| 5 and 4 | ui/ui_tick.mp3 at 0.82× | Jan Schupke, CC0 | 1a5635ec970c8fe5e0b9b0ccba0fbe149fd99ac0159c7884b695f038e4092765 |
| 3, 2 and 1 | series/r_beep-1.mp3 | qubodup, US government recording, CC0 | b8d597b92c7b41e71073e8d5d57c0bdc3b6af0b22bdde990713a0f12b91e03b6 |
| Move out! | series/st_start.mp3 | Versilian Studios, Sam Gossner and Simon Dalzell, CC0 | beb94e8bd5895379cd5df178b27440e7671fac462b643c27102cae26a93fd35f |

## Reproduction

Run the state-machine, Solo gameplay and two-seat room checks from the repository root.

```sh
node --import ./server/register-shared.mjs --test server/test/deployment-countdown.test.mjs server/test/match-lifecycle.test.mjs
```

The browser runner opens the normal Main menu in native Chromium. It enters a Floor 5 Solo Classic match through touch emulation and a two-seat private Team Deathmatch through Play → With friends → LAN server. It samples the visible digits, English release, HUD boxes, actual decoded audio starts, server pose and ammo. It also checks the post-release buy menu, a fresh shot, foreground return and ordinary re-entry into the already active room. It creates a temporary loopback game server. Output belongs outside the game.

```sh
CS3_COUNTDOWN_EVIDENCE=/tmp/cs3-countdown-proof CHROMIUM_PATH=/usr/bin/chromium \
  WAYLAND_DISPLAY=wayland-0 FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  node --import ./server/register-shared.mjs tools/cs3-countdown-browser.mjs
```
