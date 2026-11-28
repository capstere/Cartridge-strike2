# First-person match countdown

V1 opens on a first-person view with a 0–0 score, a full 10:00 clock and the current map. The player turns from rock toward a teammate between 3.000 and 3.500 seconds. The final three digits are amber. The launch text appears by 4.668 seconds and fades toward 5.502. The recording starts partway into the first displayed second. Its roughly 1 kHz pulses occur near 1.56, 2.59 and 3.59 seconds, followed by a different launch cue near 4.57. [Recording review](../../RECORDING_REVIEW.md)

CS3 adapts the five-second duration, look permission, amber threshold, compact text pulse and distinct launch from Riposte. Solo pauses the deployment clock when the player pauses. Private rooms use the existing server deadline and 60 Hz release tick. The client renders only observed seconds, keeps the mode-specific score and timer, and leaves position, ammunition, AI, purchases and score under the existing rules. Classic retains its full buy phase after deployment. Re-entering an active room, returning from a hidden tab and starting later Classic rounds discard earlier cues. Reduced motion keeps the same timing and color with static text. [Reference implementation](../../../../frontline/source/src/09y-decompte.js)

The three unchanged source MP3 files add 20,349 bytes. The original files live under `frontline/source/assets/sfx/`. The existing game audio context plays them locally. A cold audio buffer can produce an immediate synthesized cue for that beat. Decoding later never queues it for replay. [Original sound credits](../../../../licenses/riposte-sfx-credits.json)

| Mark | Source file | Author and license | SHA-256 |
| --- | --- | --- | --- |
| 5 and 4 | ui/ui_tick.mp3 at 0.82× | Jan Schupke, CC0 | 1a5635ec970c8fe5e0b9b0ccba0fbe149fd99ac0159c7884b695f038e4092765 |
| 3, 2 and 1 | series/r_beep-1.mp3 | qubodup, US government recording, CC0 | b8d597b92c7b41e71073e8d5d57c0bdc3b6af0b22bdde990713a0f12b91e03b6 |
| Move out! | series/st_start.mp3 | Versilian Studios, Sam Gossner and Simon Dalzell, CC0 | beb94e8bd5895379cd5df178b27440e7671fac462b643c27102cae26a93fd35f |

## Verified on the integrated handling build

On 27 November 2026, native EGL Chromium 156.0.8078.79 completed the normal entries on the Raspberry Pi between 14:12:54 and 14:14:13 UTC. Both browser profiles used the English game. The clean runtime revision was `317255e2d358e7661635da04395d2020b6aa80be`, its compatibility hash was `5693fe6e5f2f2bf0ac865e43e63853aa561d8eb1f0b43d874905b46928976338`, and its 568-file runtime manifest SHA-256 was `c4653b7a9b1b16cd3da60dcf5d922ab986f44930b5c314674dd22db82128bdba`. [Two-scenario receipt](countdown.json) · [Evidence hashes](SHA256SUMS)

| Normal entry | First person and controls | Measured timing |
| --- | --- | --- |
| Floor 5 Solo Classic, French locale, 844 × 390 emulated touch, reduced motion | The touch drag turned the camera and map heading. The score stayed 0–0 and the buy timer stayed at 0:15. The map and score occupied fixed rectangles. The buy menu opened after release. [5](solo-five.jpg) · [3, after turning](solo-three.jpg) · [Release](solo-release.jpg) | 5 to release took 5,113 ms. The static release text retained full opacity throughout the reduced-motion samples. |
| Compact Arena private TDM, Swedish locale, 1000 × 600 desktop, real SDK opponent | The arrow key turned the camera while held forward and trigger inputs left the host at its spawn with 30 rounds. The configured 50-kill score and 10:00 clock stayed visible. The first live server tick was 879 at simulation time 1/60 s. A subsequent ordinary click spent ammunition. [5](private-five.jpg) · [3, after turning](private-three.jpg) · [Release and English shield](private-release.jpg) | 5 to release took 4,983 ms. Release opacity was 0.407 at 868 ms and 0.050 at 1,064 ms. |

Each entry played exactly two original ticks, three original beeps and one original launch clip. The application presented the first digit and cue after the first expensive world draw. The measured difference between native Web Audio source start and the DOM observation of the corresponding mark was within 1 ms for all twelve pairs. The receipt records both sequences and the complete timing samples. Speaker output and physical display scanout require hardware capture.

The TDM client returned from a genuinely hidden browser tab, left and re-entered an active match, and produced no additional countdown sound or text. A second ordinary room started another countdown. Its host hid the tab on 5, returned during 2, then saw 1 and the release. Only the forthcoming beep and start clip played after returning. The SDK round tests additionally admitted a third seat during TDM deployment, preserved a ready Classic arrival, held an unfinished Classic map load for the next round, and confirmed that an original participant's disconnect can cancel deployment.

The combined serial suite passed 23 checks across the deployment presenter, real Solo rules, room lifecycle, procedural hostage and facility lettering, original weapon recordings and pointer ownership. It includes a one-second visible stall, a hidden interval and a backwards initial animation timestamp after resume. The clean HUD now paints “SPAWN PROTECTION” and the procedural hostage marker paints “HOSTAGE”. Physical iOS/Android input and end-to-end speaker latency remain separate device gates.

## Reproduction

Run the qualifying state, room, art, handling and pointer checks from the repository root.

```sh
node --import ./server/register-shared.mjs --test --test-concurrency=1 \
  server/test/deployment-countdown.test.mjs server/test/match-lifecycle.test.mjs \
  tools/english-world-art.test.mjs src/fps/shot-audio.test.mjs tools/mobile-input-ownership.test.mjs
```

The browser runner opens the normal Main menu in native Chromium. It enters a Floor 5 Solo Classic match through touch emulation and a two-seat private Team Deathmatch through Play → With friends → LAN server. It samples the visible digits, English release, HUD boxes, actual decoded audio starts, server pose and ammo. It also checks the post-release buy menu, a fresh shot, foreground return and ordinary re-entry into the already active room. It creates a temporary loopback game server. Output belongs outside the game.

```sh
CS3_COUNTDOWN_EVIDENCE=/tmp/cs3-countdown-proof CHROMIUM_PATH=/usr/bin/chromium \
  WAYLAND_DISPLAY=wayland-0 FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  node --import ./server/register-shared.mjs tools/cs3-countdown-browser.mjs
```

Set `CS3_COUNTDOWN_CASE=solo` or `CS3_COUNTDOWN_CASE=private` to rerun one path. The runner writes a scenario receipt as soon as that path passes.
