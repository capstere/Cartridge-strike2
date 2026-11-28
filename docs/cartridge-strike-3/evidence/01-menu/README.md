# CS3-01 menu and Solo journey

On 27 November 2026 two fresh Chromium profiles opened the ordinary root redirect, entered Play, inspected With friends, returned focus to its opener, opened Options and News, chose Solo, opened Maps, changed team, started Floor 5, paused, and returned to Main. The browser used an ordinary pointer or emulated touch throughout. This pass covered the offline Pages-style distribution.

| Input and display | Main | Routes | In play |
| --- | --- | --- | --- |
| Desktop, 1280 × 720, Swedish browser locale | [Main](desktop-main.jpg) | [Play](desktop-play.jpg), [News](desktop-news.jpg), [Maps](desktop-maps.jpg), [Solo](desktop-solo.jpg) | [Classic HUD](desktop-match.jpg) |
| Touch emulation, French browser locale, 390 × 844 menus and 844 × 390 landscape play | [Main](touch-main.jpg) | [Play](touch-play.jpg), [News](touch-news.jpg), [Maps](touch-maps.jpg), [Solo](touch-solo.jpg) | [Classic HUD](touch-match.jpg) |

The menu uses the Floor 5 scene image and the game's authored operator rig. Comparison points are IMG_8150 (main menu), IMG_8158 (dated news), IMG_8160–8162 (Play, roster and maps) and IMG_8164 (map identity during loading). V1 shows the deployed HUD moving from countdown into play. The captured offline round timer is the Classic buy phase. An authoritative multiplayer countdown needs its own recording.

## Capture identity

- The earlier CS2 lobby image entered Git at `ad6742cec17bb6aa01fcd6718a21ca1940740d06`. Its originating audit compares the public game with `75e25ce`. [Previous 932-pixel lobby](../../../playtest-audit/lobby-932.jpg)
- The [capture receipt](capture-receipt.json) records clean commit `fa7ba0578a880316ec2d6b2b6ec96f94f6131ac9` (Git tree `bc486fe6dd134f378b188bd31846f6015c56534b`, runtime build `3c32ffca247c52c213dea80c88c1b2fb7b0ec63c51f5b9ed37cd9cc752ca665c`). Chromium 156.0.8078.79 used the Raspberry Pi's native EGL backend from 12:43:52 to 12:44:45 UTC. [Image checksums](SHA256SUMS)
- Both profiles selected Floor 5 from the qualified map list. The roster, spawn names, mode and pinned Start button were in English. The Classic HUD showed the opening round and objective. The [earlier capture](https://github.com/capstere/Cartridge-strike2/tree/ca547884de62f94139e6b0e68b03dc66a5cc21aa/docs/cartridge-strike-3/evidence/01-menu) preserves the original navigation milestone and its known untranslated labels. Meltem has separate map qualification evidence.
- Both map photographs were inspected directly. Legible labels include NO SIGNAL on Floor 5 and PULSE / 03 in Compact Arena. The guest entry, credits, fallback link, mobile rotation dialog, static labels, accessibility names and CSS-generated buy labels were reviewed. Pilot admission and denied/recovered access have separate evidence from the HTTP and online tests. [Private entry record](../01-private-entry.md)
- The menu streams the existing stereo 48 kHz MP3 `audio/Preparation.mp3`, duration 59.232 seconds, SHA-256 `b8d3fc426201159c2c9a240667341ceb88a341fbeb6102eb84be6c6af3b6bd01`. The existing match-flow test checks playback after a gesture, pause on Start and resume after Cancel. The normal route test exercises the mute control and saved preference. Actual speaker/headphone level and interruptions on physical devices still need a device session.

## Solo result and purchase confirmation

At 12:52 UTC native Pi Chromium ran the touch match-flow test on clean commit `3e339b9d4200810b298aad476e2b9ec1534ce2c0`, tree `ca72c18036b229d369065e3298da8858d589f534`, runtime build `00c3c3a73787a79d810a741fabcdb106bcac52fe02d244f7543ee75b6a757898`. This 844 × 390 test uses a small deterministic fixture level. The test advances the fixed-step clock and delivers damage to each opposing actor. The ordinary round controller recorded five elimination victories and displayed “Analysts win” and “5 – 0 · 5 rounds”. Tapping Return to lobby and Back and selecting Solo again opened a new round one with a 0–0 score. The screenshot records the finished animation. [Touch match result](touch-solo-result.jpg)

The same journey purchased armor, verified the remaining 150 credits, and attempted an unaffordable weapon. The denial preserved the balance. The dedicated network session regression applies old and duplicate acknowledgments before and after a valid receipt and across round, match, life, control-epoch and reconnect changes. The online Classic browser exercises actual server replies through the visible buy panel. [Solo flow](../../../../tools/match-flow-browser.mjs) · [Network receipt test](../../../../tools/network-session.test.mjs) · [Online Classic](../../../../tools/online-classic-browser.mjs)

## Desktop and touch rocket presentation

On 27 November 2026, two separate Chromium processes used native EGL on the Raspberry Pi and joined an isolated local room on clean revision `2bc33f3660967e1e6d90ddf883c1e65f5030b72d`. The touch guest fired in TDM and the desktop host bought and fired the launcher in Classic. The test verified that each client saw the same projectile inside the camera view before the visible impact, started Web Audio sources for exactly one launch and one explosion, and observed zero health on the eliminated actor’s correct life. The server confirmed the ammunition debit and reload. A second TDM shot ended the match and the deciding touch release left the result visible. [Two-client receipt](rocket-browser-receipt.json) · [Browser assertions](../../../../tools/online-rockets-browser.mjs)

The first process ended with SIGTERM after TDM map and radio checks. That attempt had no assertion result. A bounded retry completed both modes in 126.17 seconds at 13:27:52 UTC. Both browsers closed and Node exited with status 0. The touch client used emulated controls. Web Audio verification counted scheduled voices; physical speaker levels require a device check.

From the isolated repository root, with the server and Playwright dependencies installed, run this as the sole Pi browser job.

```sh
WAYLAND_DISPLAY=wayland-0 CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 \
FPS_NETWORK_ANGLE=gl-egl node tools/online-rockets-browser.mjs
```

## Repeat on the integration revision

Serve an isolated checkout with `python3 -m http.server 8765 --bind 127.0.0.1`. Run the capture as the single active Pi browser job. Use a directory outside the game for the resulting images and JSON.

```sh
CS3_MENU_EVIDENCE=/tmp/cs3-menu-evidence FPS_TEST_ORIGIN=http://127.0.0.1:8765 \
CHROMIUM_PATH=/usr/bin/chromium WAYLAND_DISPLAY=wayland-0 FPS_NETWORK_HEADED=1 \
CS3_VERIFY_MELTEM=1 node tools/cs3-menu-browser.mjs
```

The current runner records the commit, clean/dirty state, both displays, locales, completed maps and timestamps. It asserts an English Classic HUD, enters Meltem Endless when available, and exercises an incompatible Classic deep link. Set `CS3_VERIFY_MELTEM=1` for the qualified map gate. Set `CS3_MATCH_RESULT_EVIDENCE` to an output directory to save the final scoreboard from `node tools/match-flow-browser.mjs`. This companion test exercises delayed load/cancel, visible failure and retry, successful and rejected Classic purchases, real match completion and the return button. Physical touch and the authenticated multiplayer flow have separate verification requirements.
