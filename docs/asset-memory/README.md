# Asset loading and memory — November 16, 2026

Base: main `c794a0331e4d3d34cd3d0a01daba0804e14adce3` after PR #14.
Three changes, with no asset deletion or texture/animation downsampling:

1. Load a deterministic gzip copy of Danceman through the existing resident
   decompression path. 5,738,204 → 1,810,602 bytes (68.4% smaller). Decompression
   is byte-identical to the original GLB, including all 16 original clips.
   Original GLB remains available at its stable path. Both compressed zombie
   models and all their original clips are retained.
2. Cache upper/lower operator animation splits by original clip in a WeakMap.
   Splits reference immutable original tracks instead of copying arrays for each
   avatar. Mixers and actions remain independent. No source track is edited.
3. Reuse a cloned skeleton for meshes referencing the same source skin within
   one avatar. Different avatars retain separate bones, palettes and textures.
   Operators now use the same safe cloning helper as residents. Source skins
   with distinct inverse bind matrices remain distinct even if bones match.

## Measurement

Apple M1, macOS 26.6.2, Node 26, Chromium 153 / ANGLE Metal. Local Python HTTP
server, 844×390 touch emulation, default Classic seed 42, low graphics. Three
fresh isolated contexts, each with a cold visit and warm reload in the same
context. Readiness means Start enabled / loading overlay hidden; the normal
start path performs audio unlocking and weapon warmup. The automatic loop is
stopped after readiness, then GC is requested before heap collection. These
are short local loading samples, not mobile-device or network-throttled results.

| Measure | Before | After |
| --- | ---: | ---: |
| Cold model/audio HTTP transfer, bytes | 16,113,999 | 12,186,581 |
| Warm model/audio response-body transfer | 0 | 0 |
| Cold lobby readiness median, ms | 2,651 | 2,690 |
| Cold match readiness median, ms | 4,029 | 4,105 |
| Warm lobby readiness median, ms | 2,424 | 2,492 |
| Warm match readiness median, ms | 3,802 | 3,904 |
| Collected JS heap, cold median bytes | 80,256,328 | 75,062,676 |
| Backing storage, cold median bytes | 121,652,053 | 111,985,924 |
| Active-scene skeleton objects | 102 | 18 |
| Unique active-avatar clip objects | 273 | 65 |
| Unique active-avatar track-array bytes | 8,937,104 | 1,888,480 |
| Scene geometries / material texture references | 1,981 / 145 | 1,981 / 145 |
| Decoded audio PCM bytes | 13,362,496 | 13,362,496 |
| Warmed game GPU textures after cycles | 230 | 163 |
| Warmed lobby GPU textures | 14 | 7 |

No local startup speed improvement is claimed: gzip adds decompression work,
and these local samples were slightly slower. The demonstrated gains are
3.93 MB less cold model transfer and lower retained allocations/palettes.
The HTTP transfer row sums Resource Timing entries for 65 GLB/gzip/MP3/OGG
requests, including headers. It excludes JS/CSS and generated blob resources.
The raw CDP `transfer` total includes blob/data loads and must not be described
as network bytes. CDP response counts were 382 cold / 369 warm in both versions.
Warm assets were cache/validation hits on this server; Pages caching can differ.
Track bytes count unique underlying track arrays visible through active avatars,
not total application memory. Heap and backing storage are separate Chromium
metrics; they must not be added or interpreted as process RSS/GPU residency.

[Three raw cold/warm repetitions before](before.json) · [after](after.json).

## Dependency and disposal audit

Normal Floor 5 startup loads both operator templates, business hostages,
three resident rigs, furniture/material libraries and local audio. The original
Danceman file was the largest individual recorded model request. Furniture and
resident geometry/textures already share source assets; no redundant model
request was removed speculatively. Operator split tracks and skin palettes were
redundant allocations, now shared at their appropriate lifetime.

The scene has 145 material texture objects before/after. Largest sampled images
include two 2048² hostage maps, a 2048×864 image and 1024² room finish maps.
No image was resized or removed. Bone textures account for the demonstrated GPU
texture reduction; artistic texture references and geometry counts are unchanged.

Audio uses one context and caches decoded buffers across matches. Reload Foley,
pistol cues, voices and music remain eagerly prepared as before so first-use
sounds are ready. Resident source assets live for the renderer lifetime; each
resident has an independent mixer and bone hierarchy. Match return clears
playback and reuses bounded instances. Explicit resident disposal releases source
geometry/materials/textures, skeletons, mixers and instance maps; audio disposal
closes its context and clears its owned buffers. The split WeakMap does not pin
released source clips. No observed per-match leak justified replacing this
architecture.

[Before](lifecycle-before.json) and [after](lifecycle-after.json): 20 measured
alternating Classic/Endless cycles plus warmups, actual tab background/resume,
resident visits, audio, buy, weapon switching and forced GC. Both pass: one
retained game/context, four resident instances, three audio nodes, 266 listeners,
zero ambient/music/voice playback in lobby. Tail GPU resource counts are stable
in both modes. Scene geometry counts can fill lazily; no geometry-count saving
is claimed. Resident palettes explain the lower GPU texture plateau.

## Validation and reproduction

Run `python3 -m http.server 8765` and install locked Playwright tooling as in
HANDOVER. Run each loading profile without concurrent workloads:

```sh
PROFILE_LABEL=before node tools/asset-memory-profile.mjs
PROFILE_LABEL=after node tools/asset-memory-profile.mjs
FPS_LIFECYCLE_JSON=test-results/lifecycle.json node tools/match-lifecycle-browser.mjs
node tools/asset-sharing-browser.mjs
node tools/actor-occlusion-browser.mjs
```

Run before on the base revision with the new measurement tool copied in; after
on this branch. Source hashes accompany after results. Sharing tests verify
independent character bones/actions, exact original compressed bytes, immutable
track reuse, exact upstream-style copied-track poses and owned-resource teardown.
The first pose-test draft compared different starting rigs and was corrected to
use identical independent clones before accepting the result.

Full suite and browser results are recorded in [validation.json](validation.json).

## Remaining work

Physical iPhone/Android, Safari memory behavior, throttled/real mobile networks,
process RSS, GPU byte residency and long thermal sessions remain unmeasured.
Local timings do not establish a load-time gain. Audio decoding (13.36 MB PCM)
and large artistic textures remain intentional costs; any future streaming,
texture transcoding or deferred initialization needs first-use latency and
visual/audio equivalence tests. Whole-renderer teardown under pending asynchronous
loads and repeated level/character replacement deserve a separate stress audit;
this pass verifies normal match reuse and explicit resident/audio disposal.
