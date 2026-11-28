# Cold first sightline on Compact Arena

The original protocol-20 observer missed the SMG magazine withdrawal. Its first audio callback during the reload received a game time 0.867 s after the authoritative start and a previous time 1.467 s before it. That 2.333 s difference measures **client display simulation time between audio updates**. The native receipt contains neither a wall-clock render interval nor page visibility history. Its owner saw a 150 ms maximum in the same clock and delivered both magazine cues. [Original observer](../protocol-20/cold-observer.json) · [Original owner](../protocol-20/cold-owner.json)

On the network client, a snapshot moves display time forward to the latest authoritative simulation time. Between snapshots the client extrapolates up to 100 ms. The audio system stores its previous simulation time. Waking a background page, draining a blocked event loop or applying a late snapshot can therefore produce a large simulation delta. RenderBudget skips hidden documents and caps modal rendering at 10 Hz. Chromium background-throttling flags do not override the game's own budget. The two participants run in separate Chromium processes and native Wayland windows. Both processes reported document focus during the controlled experiments below. Exclusive operating-system focus cannot be inferred from that flag.

## Reproducing the first visible draw

The diagnostic uses the two normal multiplayer flows on the real local authority. Desktop selects Breacher in Wardrobe. Emulated touch and desktop take opposing seats. In matched fresh browser processes the authority places Breacher at the same authored navigation sightline and starts a single ordinary reload. This repeatable test action allows the observer window to stay in front. The original failing play used desktop fire and R. Both clients' render loops and Web Audio continue through the measured transition. Existing steady Rage and human-input checks remain separate.

The [two focus experiments and renderer-stage control](baseline.json) distinguish RAF delivery and renderer submission on the browser's monotonic clock from authoritative and displayed simulation time. The Pi 5 runs used Debian Chromium 156.0.8078.79 with native Wayland and Broadcom V3D 7.1.10.2, a single loopback room, protocol 20, build `5d3875bbbda009d9d1c63ce4d8e06227d5493745a1cc4c63c12935f5278a34fb`, two humans, zero bots and low graphics. Desktop was 896 × 504 CSS pixels, touch was 568 × 320 with mobile emulation, both at 0.75 device scale. The focused browser, episode length, instrumentation and SHA-256 of each raw trace are recorded with its result.

| Requested foreground | Desktop longest render | Touch observer longest render |
| --- | ---: | ---: |
| Desktop owner | 3,578 ms | 4,790 ms |
| Touch observer | 3,477 ms | 5,014 ms |

Both focused conditions reproduced a visible, unpaused first render stall. At that render the observer showed the actual shotgun outfit, comprising 51 meshes, including 13 skinned meshes. Three's GPU counts went from 119 to 162 geometries, 45 to 57 textures and 53 to 56 programs. No diagnostic image export had occurred before that first long observer draw.

With a third fresh pair, the observer's real world pass took 5,219 ms and the longest RAF interval was 5,234 ms. WebGL program-log calls accounted for almost the entire main-thread wait. The longest individual call took 1,077 ms. These synchronous calls can wait for earlier queued GPU work, including a shader pipeline's first actual draw. They locate where JavaScript blocked. Texture submission calls alone took up to 4 ms in that run. The server polling measures when a Node timer could observe simulation progress. It does not measure authoritative tick execution cost or network round-trip time. The first two runs ended before a full post-stall RAF interval was always delivered, so their render durations are the reliable wall-clock metric.

Use the pinned checkout with the existing Playwright and server dependencies, a fresh private output directory per run and only one heavy Pi job at a time.

```sh
WAYLAND_DISPLAY=wayland-0 XDG_RUNTIME_DIR=/run/user/1000 FPS_NETWORK_ANGLE=gl-egl \
CS3_BONUS_EVIDENCE=/tmp/fresh-owner-sightline CS3_BONUS_RELOAD_CAPTURE=1 CS3_BONUS_COLD_FOCUS=owner \
node --import ./server/register-shared.mjs tools/online-bonuses-browser.mjs
```

Use a different output directory and `CS3_BONUS_COLD_FOCUS=observer` for the second condition. Physical-phone touch latency, display scanout and acoustic output timing require separate evidence.
