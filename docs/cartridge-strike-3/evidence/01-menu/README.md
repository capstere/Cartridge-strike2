# CS3-01 menu and Solo journey

On 27 November 2026 two fresh Chromium profiles opened the ordinary root redirect, entered Play, inspected With friends, returned focus to its opener, opened Options and News, chose Solo, opened Maps, changed team, started Floor 5, paused, and returned to Main. The browser used an ordinary pointer or emulated touch throughout. This pass covered the offline Pages-style distribution.

| Input and display | Main | Routes | In play |
| --- | --- | --- | --- |
| Desktop, 1280 × 720, Swedish browser locale | [Main](desktop-main.jpg) | [Play](desktop-play.jpg), [News](desktop-news.jpg), [Maps](desktop-maps.jpg), [Solo](desktop-solo.jpg) | [Classic HUD](desktop-match.jpg) |
| Touch emulation, French browser locale, 390 × 844 menus and 844 × 390 landscape play | [Main](touch-main.jpg) | [Play](touch-play.jpg), [News](touch-news.jpg), [Maps](touch-maps.jpg), [Solo](touch-solo.jpg) | [Classic HUD](touch-match.jpg) |

The menu uses the Floor 5 scene image and the game's authored operator rig. Comparison points are IMG_8150 (main menu), IMG_8158 (dated news), IMG_8160–8162 (Play, roster and maps) and IMG_8164 (map identity during loading). V1 shows the deployed HUD moving from countdown into play. The captured offline round timer is the Classic buy phase. An authoritative multiplayer countdown needs its own recording.

## Capture identity

- The earlier CS2 lobby image entered Git at `ad6742cec17bb6aa01fcd6718a21ca1940740d06`. Its originating audit compares the public game with `75e25ce`. [Previous 932-pixel lobby](../../../playtest-audit/lobby-932.jpg)
- The CS3 run used Chromium 156.0.8078.79 on the Pi's native EGL backend, 11:06–11:07 UTC. The [raw receipt](capture-receipt.json) records the checked-out HEAD, `31de9f85f2cecddc611338f256d24a1c86048e63`. The tested working directory contained the menu follow-up before it was committed. Its runtime source is preserved in `0e9675d85e464c674fd399b1acb013944867a26a`, including the synchronous team/roster event and the fixed Options layout. The rendered stylesheet preceded that commit's two footer visibility/contrast selectors. Its SHA-256 was `6c253c31fbf4dd3274759258e6e5fe651c704364f743951673aa764d95373b14`. [Capture SHA-256 values](SHA256SUMS)
- At capture time the shared engine supplied legacy Swedish strings to the Solo eyebrow, spawn names, mode description, score and objective HUD. These screenshots record the navigation and layout milestone. The qualified manifest picker and pinned Start landed subsequently in `a5fff6bcfb8fcc617c1a6bf721a9c4d54b2f973d`. Full rendered English and map qualification require the integration revision.
- Both map photographs were inspected directly. Legible labels include NO SIGNAL on Floor 5 and PULSE / 03 in Compact Arena. The guest entry, credits, fallback link, mobile rotation dialog, static labels, accessibility names and CSS-generated buy labels were reviewed. Pilot admission and denied/recovered access have separate evidence from the HTTP and online tests. [Private entry record](../01-private-entry.md)
- The menu streams the existing stereo 48 kHz MP3 `audio/Preparation.mp3`, duration 59.232 seconds, SHA-256 `b8d3fc426201159c2c9a240667341ceb88a341fbeb6102eb84be6c6af3b6bd01`. The local server delivered this track to both captured profiles at 11:06:16 and 11:06:49 UTC. The existing match-flow test checks playback after a gesture, pause on Start and resume after Cancel. The normal route test exercises the mute control and saved preference. Actual speaker/headphone level and interruptions on physical devices still need a device session.

## Repeat on the integration revision

Serve an isolated checkout with `python3 -m http.server 8765 --bind 127.0.0.1`. Run the capture as the single active Pi browser job. Use a directory outside the game for the resulting images and JSON.

```sh
CS3_MENU_EVIDENCE=/tmp/cs3-menu-evidence FPS_TEST_ORIGIN=http://127.0.0.1:8765 \
CHROMIUM_PATH=/usr/bin/chromium WAYLAND_DISPLAY=wayland-0 FPS_NETWORK_HEADED=1 \
CS3_VERIFY_MELTEM=1 node tools/cs3-menu-browser.mjs
```

The current runner records the commit, clean/dirty state, both displays, locales, completed maps and timestamps. It asserts an English Classic HUD, enters Meltem Endless when available, and exercises an incompatible Classic deep link. Set `CS3_VERIFY_MELTEM=1` for the qualified map gate. The companion `node tools/match-flow-browser.mjs` exercises delayed load/cancel, visible failure and retry, successful and rejected Classic purchases, real match completion and the return button. Physical touch and the authenticated multiplayer flow have separate verification requirements.
