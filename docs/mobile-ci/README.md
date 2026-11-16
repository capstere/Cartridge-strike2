# Mobile input, lifecycle and CI reliability — November 16, 2026

Base: main `5b8660527b14a403ded5f486e4e3c2917c36acf9` (PR #15).
Four improvements based on reproduced behavior and Actions history:

1. **Keep movement/look ownership during weapon switching.** Tactical controls
   previously cleared all touch pointers on any weapon change. A held joystick
   immediately returned zero and further look drags were ignored until fingers
   lifted. Weapon changes now clear held actions while preserving the two drag
   owners. New games/rounds, pause, backgrounding and full resets still clear all
   controls. Trigger release on weapon change is retained.
2. **Count remaining held-button owners on release/cancel.** With two fingers on
   Fire, releasing either previously stopped the still-held trigger. A release,
   cancellation or lost capture now preserves the action and pressed appearance
   until its last owner releases. Other controls use the same ownership rule.
3. **Pause on touch viewport orientation changes.** The portrait prompt could
   cover a running match without triggering blur/visibility events. Bots, combat
   time and audio continued behind it. Crossing either orientation now clears
   input and uses the existing pause/audio reset path, requiring explicit Resume.
   The listener only installs on touch devices. Desktop resize behavior is intact.
4. **Avoid repeated browser CI and stale PR work.** Remove the obsolete feature
   branch push trigger. Full browser checks run on PRs and manual dispatch; main
   pushes retain units, runtime integrity and real door traversal, but skip browser
   installation and the already-passed browser suites. Superseded PR runs cancel
   by PR number; main checks are not cancelled. Cache locked npm dependencies for
   browser runs. No regression checks were removed from the pre-merge PR gate.

## Before and after

Apple M1 / macOS 26.6.2, Chromium 153 / ANGLE Metal, touch emulation at 844×390
and 932×430, DPR 2, low graphics, seeded normal Endless with all ten team actors.
This is browser emulation, **not physical iPhone or Android evidence**.

The same finalized `tools/mobile-reliability-browser.mjs` ran against base source
and changed source, with fresh contexts. It uses native CDP three-finger touch
input for movement/look/fire, actual simulation shots and movement, weapon
switching with fingers down, multiple fire owners, a normal realtime reload,
60 live RAF intervals, portrait/landscape transitions, explicit resume and lobby
return. A stopped clock makes the input samples deterministic; the separate
rotation/pacing section uses the ordinary realtime loop. Native touch movement
can be coalesced; readings settle over two RAF callbacks before comparison.

| Check, both widths | Before | After |
| --- | --- | --- |
| Movement immediately after weapon switch | 0 | 0.73 / 0.70 retained |
| Subsequent held-thumb movement | 0 | 0.77 / 0.73 |
| Subsequent look drag | ignored | yaw changes by −0.05676 rad |
| Fire after one of two fingers releases | false | true until last release |
| Portrait game state | active | paused |
| Combat advance during 650 ms portrait hold | 0.667 / 0.650 s | 0 / 0 s |
| Portrait active voices + ambient loops | 10 / 11 | 0 / 0 |
| Return to landscape | combat never paused | stays paused until Resume |
| Lost WebGL contexts / browser errors | 0 / 0 | 0 / 0 |
| Lobby residual voices / ambient / music | 0 / 0 / false | 0 / 0 / false |

Each combined-input sample moved 0.051 / 0.049 m and fired one actual round in
both revisions. The extra thumb move is accepted after switching without lifting.
The snapshot's `settledReadMs` includes CDP round trips and deliberate RAF waits;
it is not touch-to-photon latency and no latency reduction is claimed.

Median RAF interval was 16.7 ms in both revisions and sizes. Short-sample p95:
844 wide 16.8 → 16.7 ms; 932 wide 16.8 → 33.2 ms (1 → 4 intervals over 25 ms).
These 60-frame samples are too short to establish an FPS improvement or a stable
frame-time regression. Rendering remained operational through rotation; the
existing adaptive resolution governor is unchanged, and can choose different
post-rotation drawing buffers while the baseline continues playing and the new
version pauses. No rendering-performance gain is claimed for this pass.

[Raw before](before.json) · [raw after](after.json).

## CI audit

The single FPS workflow uploaded **zero artifacts** in audited successful PR
run 43930343049. No unnecessary FPS artifact upload existed to remove. The
separate Pages deployment artifact is required for publication and is retained.

[Recorded job timings and steps](ci-before.json):

- Exact feature head `245856f` ran both push and PR workflows: 5m42s + 8m47s
  of job wall time. Removing the feature push trigger avoids that duplicate path.
- PR #14's tested source tree ran 7m29s on its PR and another 10m28s after
  squash merge to main. Main now runs the fast checks instead of repeating the
  browser install and suites for that tested tree. Timings vary by runner; these
  historical job durations are evidence of duplicated work, not a future quota.
- Browser suites remain on every PR update. Concurrency cancellation is scoped
  to a PR and event, so another PR or a main deployment does not cancel it.
- A manual `workflow_dispatch` provides full checks on main when needed, including
  direct main pushes that did not go through a PR. Direct pushes receive only
  the fast automatic checks; contributors should use PRs for browser validation.
- npm caching does not cache Chromium binaries, skip dependency verification,
  suppress failures or create downloadable artifacts. Cache speedup is not claimed
  without a measured cache hit. Each browser suite retains its bounded deadline.

## Validation and reproduction

Start the local HTTP server and install the locked browser tooling from HANDOVER.
Run `MOBILE_BASELINE=1 node tools/mobile-reliability-browser.mjs` on base source
with this harness copied in, and `node tools/mobile-reliability-browser.mjs` on
changed source. The baseline switch only disables assertions for the three known
bugs; normal startup, actual movement/fire, cleanup and error checks stay active.
Set `FPS_TEST_ORIGIN` to verify the same harness against Pages.

Focused Node tests exercise up/cancel/lost-capture ownership and partial/full
reset behavior. Existing desktop/mobile controls, auto-fire, recoil and pause
checks are retained. [Validation record](validation.json) lists the final results.

## Remaining physical-device work

The next genuine task remains hands-on iPhone Safari and Android Chrome testing:
three-finger movement/look/fire, weapon changes while dragging, repeated
rotation, interrupted touch capture, safe-area clearance, actual audio output,
background/resume and full-screen behavior. Record device/OS/browser and timings.
Browser emulation cannot verify touch hardware latency, thermal throttling,
Safari audio interruptions, notches, battery use or sustained handset FPS.
Longer matched rendering profiles and physical latency measurements remain open.
