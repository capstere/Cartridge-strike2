# Cartridge-Strike 2 — targeted performance pass (2026-11-15)

## Verified baseline

The previous Floor 5 M1 profile recorded 1,918 combined draws at Cargo Lift
and 2,377 at C08, with approximately one million triangles per view.
Apple M1/Metal median frame intervals were 16.7 ms; software SwiftShader
took hundreds of milliseconds per frame.

These numbers are baseline results from
[Endless rendering profile](endless-profile/README.md), **not** measurements
of this implementation. Draw calls, vertex work, pixel fill, CPU/driver
submission and shader work can each dominate on different hardware.
A single universal draw-call ceiling cannot establish the cause of lag.

## Implemented

1. Default desktop **standard** pixel ratio changes from 1.5 to 1.0.
   The existing low graphics base ratio stays 0.85 desktop / 0.78 mobile.
2. Live-match-only adaptive resolution scales between 55% and 100% of
   the current graphics base. Forty real frame samples and two simulation
   seconds are required; sustained means over 21.5 ms decrease scale by
   0.1, while a stable mean under 17.3 ms increases it by 0.05.
   Paused, hidden, menu and loading frames do not inform adaptation.
   Changing scale clears stale measurement data. This reduces **pixel**
   work, not draw-call count.
3. Frame dt and the game's fixed-step catch-up are each capped at 0.05s.
   Under severe slowdown, simulation time intentionally runs slower.
4. Rigid, opaque reflected furniture is eligible for existing merging
   and instancing. A negative-determinant transform is baked into each
   part with indexed/nonindexed triangle winding corrected. Unsafe
   reflected tangents, interleaved buffers, morph targets, skinned or
   transparent material models retain the old path.
5. Non-Floor-5 VisualDepth reduces 20 AO taps to 8 and caps its
   internal MSAA at 2 instead of 4. Floor 5 continues to bypass it.

## Important limits and follow-ups

- **No new FPS improvement is claimed** until browser benchmarks run.
  Mirrored workstation draw calls may decrease, but exact counts and visual
  equivalence require side-by-side live captures.
- Compare same camera seeds, graphics, render backend, browser and viewport
  before/after: FPS, frame p95, draw calls, triangles, browser console,
  shots, door crossings, HUD, touch input and wall-hidden workstations.
- The catch-up cap can cause perceived slow-motion under sustained
  very low FPS. Assess game timings and difficulty in a real match.
- Whole-map static room/door/glass/decor portal culling needs an additional
  bounded design and correctness audit; this patch does not pretend it
  can safely combine animated or breakable objects.
- Physical iPhone/Android tests remain outstanding.

## Reproduction

```sh
node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs
node tools/verify-owner-runtime.mjs
node --experimental-loader ./tools/vendor-three-test-loader.mjs tools/owner-door-traversal.mjs --prepared
npm ci --prefix frontline/source/tools/dev
node tools/endless-floor5-profile.cjs
node tools/floor5-workstation-visibility.cjs
```

## Measured follow-up — November 16

The [measured rendering and simulation pass](measured-performance/README.md)
starts at this PR’s merged main, retains these changes, and reports matched
Cargo Lift, C08 and active-combat runs with source fingerprints and raw samples.
Physical handset and GPU-execution measurements remain open.
