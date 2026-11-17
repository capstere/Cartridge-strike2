# PASS 3A.2 — two-player Floor 5 on a trusted LAN

Base: **bac0756a54796a64a99fc936388e97b1b188ee33**, the reviewed merge of
[PR #20](https://github.com/capstere/Cartridge-strike2/pull/20).
Branch: `feat/multiplayer-lan`. This is the explicitly requested LAN/cross-device
pass. It does not implement PASS 3B, PASS 4, combat rewind, reconnect grace,
additional players, public hosting or a Pi deployment.

**Operator instructions:** [Swedish Raspberry Pi update, verification and rollback](raspberry-pi-lan-sv.md).

## PR #20 review

Reviewed its final head **11b585f9f55c53dd7da01137315b5bbaec47be94**, actual
runtime/test changes, generated contracts, reports and final workflow. The
authoritative door/shutter state and prediction collision context remain isolated;
the lobby reset and reliable jitter FIFO have focused regressions. The scope is
the documented localhost two-player slice. Physical-device and software-renderer
performance limits were not treated as completed gates.

Both jobs in [final-head run 44148009027](https://github.com/capstere/Cartridge-strike2/actions/runs/44148009027)
were successful, including the complete Floor 5 browser scenarios and existing
offline/mobile suites. No review threads or change requests remained. Fresh local
verification passed 220 core tests, five server tests, the generated contract and
516 runtime hashes. The normal launch passed with no `__fps` hooks: two humans,
actual keys/mouse, pointer lock on first Resume, 1.05 m movement, four shots,
reload HUD and leaving without disconnecting the other player. No reproducible
blocker remained. Merged with an expected-head check; no failed CI was bypassed.

## Hosting and access boundary

- `npm start --prefix server` still binds **127.0.0.1:2567**. LAN requires both
  `CS2_LAN=1` and `CS2_LAN_HOST=<assigned private IPv4>`. Only RFC1918 addresses
  are accepted; wildcard/public binds and accidental LAN environment values fail
  closed. IPv6 and hostname discovery are deliberately not added.
- Static client, HTTP matchmaking and WS share the same host/port. The lobby
  shows that address read-only; no cross-origin endpoint entry or browser security
  exception is needed. Both `?network=local` and `?network=lan` open this lobby.
- Host is checked against the configured listener, not accepted from arbitrary
  request input. Matchmaking and WS independently require an exact matching Origin;
  missing/null origins, foreign hosts, forwarded headers and non-local peers are
  rejected. Normal first-party page navigation may omit Origin. The gate wraps the
  complete Colyseus HTTP dispatcher **before** listening, because its Express
  callback runs after matchmaking. WS uses the pinned `beforeUpgrade` hook.
- Admission: 30-token per-IP burst, refill 1/s; aggregate 60-token burst, refill
  2/s. Both HTTP and WS spend a token. Peer accounting is bounded to 256 records
  and removes idle entries. Assets/health do not spend this budget. Two rooms,
  two humans per room, 16 open WS connections and 64 TCP connections are caps.
- HTTP JSON is limited to 4 KiB including chunked transfer, expected option keys
  and types; only explicit create/joinById routes are exposed. Existing room-code
  hashing/timing-safe comparison, compatibility gates, 4 KiB WS cap, 120 messages/s,
  12-frame input buffer and authoritative input validation remain in force.
- Only manifest-listed runtime files are served. Health includes mode, rooms,
  players and the public compatibility contract, never room codes or session
  tokens. HTTP/WS remains unencrypted, appropriate only for the requested trusted
  LAN. Origin is browser hygiene, not an account system or encryption.

## Browser behavior

Private-IP HTTP lacks WebCrypto's `subtle` API. The first real private-IP probe
reproduced a fatal `assetHash(...).digest` call in shared furniture loading,
in addition to the known map/collision hash calls. The common `shared/sha256.mjs`
uses native WebCrypto when available and a tested SHA-256 fallback for public
asset/map fingerprints otherwise. It never replaces server authentication.
Padding boundaries, random bytes, Unicode, a million-byte vector and exact Floor 5
bytes match Node's SHA-256. No crypto/browser global is replaced or weakened.

The existing desktop input and mobile controls remain. Production joins enter
the menu on both desktop and mobile; **Fortsätt** supplies a fresh gesture for
audio and mouse capture. The form also unlocks audio directly on submission.
LAN Resume requests pointer lock without an automatic fullscreen transition;
fullscreen is an explicit action in the existing menu. This keeps the mouse/audio
gesture separate from fullscreen focus/orientation changes, while preserving
offline automatic fullscreen. Unsupported/rejected fullscreen does not prevent
play; promise and event pointer-lock failures return to the menu.
Audio unlock handles Safari's `interrupted` state as well as `suspended`.

The compact form uses 16 px editable input text, touch-sized actions, safe-area
layout and text-only connection feedback. Wrong code, full/missing room, version
mismatch, throttling and unreachable server receive actionable Swedish errors.
The room ID remains visible in the gameplay HUD and menu. Codes are not put in URLs.

The SDK still owns fixed input, prediction, reconciliation and remote interpolation.
The exact Floor 5, 51 doors, two spawn shutters, original characters/weapon/audio,
rendering optimizations and offline rules remain. Online glass stays intact.

Acquisition has a ten-second deadline, HTTP cancellation and ownership of the
SDK's pending room for socket cleanup. A lost connection releases callbacks,
prediction, timers, pending effects and the room reference. Stale state stops
input at one second; a ten-second watchdog returns to the lobby even without a
WS close event. Rejoin is explicit, with a fresh seat/life; it does not preserve
score. Returning to the menu never restarts the other player's game.

## Validation and reproduction

Local host: macOS ARM64 / Apple M1, Node 26.0.0 for core/browser tooling and
26.13.0 for server/full network tests. Chromium 153.0.8010.12 / Metal and
Playwright WebKit 26.6. Both clients and server run on this one host. Direct tests
bind an actual assigned private IPv4 and assert `isSecureContext === false` and
`crypto.subtle === undefined`; they are not localhost disguised by viewport size.

| Evidence | Status |
| --- | --- |
| Core unit/simulation suite | PASS, 226 tests |
| Pinned Node 26.13.0 server/API/access/proxy suite | PASS, 7 tests |
| Generated contract and published runtime bytes | PASS, 76 contract sources and 518 runtime files |
| Prepared Floor 5 traversal | PASS, 102 approaches |
| Offline state/events | PASS, eight unchanged hashes and shot counts across 9,600 steps against merged 3A.1 |
| Chromium desktop + Chromium touch over private-IP HTTP | PASS, simultaneous move/look/fire reaching authority, reload, rotation, audio suspend/resume, wrong code, real WS termination, rejoin and restart |
| Chromium desktop + WebKit touch over private-IP HTTP | PASS, same lifecycle and gameplay-input checks; WebKit reports no fullscreen support and remains playable |
| Normal launch without game hooks, native + software renderer | PASS, actual keys/mouse, first Resume pointer lock, reload HUD, input after explicit fullscreen, independent leave |
| Full Floor 5 combat, ordered jitter and 20 + 4 rendered leave/rejoins | PASS, direct private-IP HTTP and approximately 100 ms RTT/jitter; [full browser evidence](lan/full-floor5-browser.json) |
| Linux / Windows / macOS CI | Required final-head jobs tracked on the PR, not inferred from local passes |
| Physical Pi/Bookworm ARM64, physical iPhone/Android, Windows interactive desktop, two physical LAN devices | NOT RUN |

Raw local evidence: [Chromium touch](lan/chromium-chromium.json),
[WebKit touch](lan/chromium-webkit.json), [normal launch](lan/normal-launch.json),
[software normal launch](lan/normal-launch-software.json),
[offline replay](lan/offline-replay.json).
Rendered review: [landscape lobby](lan/chromium-lobby.png),
[WebKit gameplay without fullscreen](lan/webkit-game.png).

Each mobile lifecycle run checks 844×390 and 932×430 and releases the departed
session's callback/event/remote collections, prediction, watchdog, room reference
and audio voices. Server restart invalidates the old room; creating/joining a new
one succeeds and the last departure removes the room. The full Floor 5 harness
paces rapid lifecycle admissions to respect the real admission budget; the first
unpaced attempt correctly hit that budget after 15+ cycles. No limit or gameplay
assertion was removed to obtain a pass.

Chromium uses its native multi-contact injection protocol. WebKit uses synthetic
PointerEvents through the real handlers because Playwright's WebKit interface
provides taps but no multi-contact protocol. Backgrounding is a synthetic blur
signal; real OS suspension, phone interruptions, thermal behavior and physical
touch capture remain unverified. Browser automation is not physical-phone play.
Safe-area checks use an explicitly emulated Chromium CSS environment; physical
notch/home-indicator clearance remains on the device checklist.

Run from the repository root, with the pinned Node available:

```sh
npm ci --prefix server --ignore-scripts
npm ci --prefix frontline/source/tools/dev
node frontline/source/tools/dev/node_modules/playwright-core/cli.js install chromium webkit
npm run build --prefix server -- --check
node tools/verify-owner-runtime.mjs
npm test --prefix server
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
node --import ./server/register-shared.mjs tools/network-lan-browser.mjs
FPS_LAN_MOBILE_BROWSER=webkit node --import ./server/register-shared.mjs tools/network-lan-browser.mjs
FPS_NETWORK_LAN=1 node --import ./server/register-shared.mjs tools/network-launch-browser.mjs
FPS_NETWORK_LAN=1 node --import ./server/register-shared.mjs tools/network-browser.mjs
```

Test-only private-address discovery can be overridden by `FPS_LAN_TEST_HOST`.
Production never discovers/enables a LAN bind automatically. The full browser
harness retains the legacy scenario label `loopback` for its direct scenario;
`FPS_NETWORK_LAN=1` makes that scenario private-IP HTTP. The delayed scenario serves
the entire client through its test proxy on one origin, preserving reliable order.
It is jitter/delay coverage, not a claim of packet-loss simulation.

CI preserves all prior Linux offline/visual/mobile gates and adds bounded LAN jobs on
Linux Chromium, Windows Chromium and macOS WebKit. Linux uses SwiftShader;
Windows selects Chromium's D3D11 WARP software backend and records/asserts the
actual WebGL renderer. Every LAN/server job uses the pinned Node 26.13.0.
Software jobs use DPR 0.5 on Linux and 0.25 on Windows for
functional coverage; no software-renderer FPS or Pi capacity claim follows.
Only small JSON/screenshots are retained for seven days. The build generator
normalizes asset paths on Windows; CI checks out committed LF bytes there so
compatibility hashes do not change with Git line-ending conversion. Source
maps/assets remain unchanged.

While loading the second client, the harness freezes only the first empty lobby
using Chromium's lifecycle API. Both pages are active before room creation and
every gameplay assertion. This bounds overlapping animated-preview work on one
software CI host; two physical devices normally have separate GPUs. It does not
freeze a game, skip a client, or change production rendering.

The normal-launch regression also isolates each human's browser/GPU process,
as the existing full-map harness does. Real keys/fire stay held until the
authority observes them within a bounded deadline: a fixed 250 ms press can
fall entirely between software-rendered frames. It still requires pointer lock,
reload HUD and independent leave behavior without `?test` or game hooks. It
observes the transient reload label before pressing R and uses real mouse look
toward the floor during that check; authority must confirm the pitch and full
magazine. The full-map job retains the normal forward camera. The
cross-platform harness waits for application readiness after DOMContentLoaded,
rather than a window load event that can wait on unrelated media. Failed launch
checks preserve focus/pointer-lock events and pending asset requests for diagnosis.
Normal launch checks windowed input first, then explicitly enables fullscreen and
proves mouse capture and keyboard movement again. This caught an intermittent
input interruption during simultaneous automatic fullscreen/Resume; LAN now
keeps those gestures separate. No game state or input handler is substituted.
Full Floor 5 gameplay runs in a separate macOS/Metal job at DPR 1 and the normal
forward camera, with every combat/prediction/interpolation and 24 lifecycle
assertions retained. Linux software runs showed zero frames during one five-second
spawn observation and a later route deadline while input was still progressing;
that environment cannot reliably sample gameplay or interpolation timing. The
Linux/Windows LAN jobs retain real WebGL and input/lifecycle checks; the original
Linux offline gates are unchanged. This is functional CI, not physical-device or
Pi performance acceptance. The LAN/normal-launch server runs in a separate Node process so browser-driver
I/O cannot hold up its HTTP/WS loop. Test-only IPC observes real server state and
terminates sockets for loss checks; it exposes no HTTP test endpoints and never
changes player state. Pending HTTP requests, server response completion and the
actual WebGL renderer are retained on LAN loading failures.

No running Pi service, router, tunnel or public listener was changed. The new PR
is for review and must not be automatically merged. After its review/merge, the
next actionable task is the Swedish Pi update and a recorded Mac–iPhone 1v1,
followed by Windows/Android physical checks. The previous handset backlog remains.

Browser references: [SubtleCrypto secure-context requirement](https://developer.mozilla.org/en-US/docs/Web/API/SubtleCrypto/digest),
[interrupted audio on Safari](https://developer.mozilla.org/en-US/docs/Web/API/BaseAudioContext/state),
[pointer lock](https://developer.mozilla.org/en-US/docs/Web/API/Pointer_Lock_API),
[fullscreen capability](https://developer.mozilla.org/en-US/docs/Web/API/Fullscreen_API).
The exact Colyseus hook/router/room APIs were verified against installed pinned
package source and exercised by the real HTTP/WS tests.
