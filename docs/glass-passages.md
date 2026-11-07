# Broken glass passages

Broken standing-height, floor-near panes can become walk-through openings when the
actor fits between retained posts and there is continuous allowed floor across
the opening and on both sides. Actors step over the existing low glazing rail
(up to 12 cm); the rail, frames and all source geometry remain in place. Intact
neighboring panes still collide. Curtains, blinds and pooled shards are visual.

High windows, parapets, solid walls, narrow frames, furniture obstructions, missing
floor and excluded rooms remain blocked. No outdoor floor or playable scope is
added. The prepared level/project file is unchanged.

Pane break events update rail eligibility, add collision-swept local navigation
links and invalidate bot routes. Round reset restores pane collision and removes
those links. Pooled sample nodes are reused; inactive nodes cannot capture nearest
node queries after reset. There is no per-frame graph rebuild. Existing pane
rendering and the 128-slot fragment pool are reused unchanged.

Validation:

- 102 regression tests passed, followed by 22 focused tests after the final reset
  correction. Coverage includes rotated walls, both travel directions, retained
  posts/neighboring panes, off-axis paths connecting isolated rooms, blocked scope,
  and five break/reset cycles without growing the node pool.
- `tools/glass-passages-browser.mjs` runs the actual FPS in Chromium/software WebGL:
  intact glass, a real shot, crossing both ways over the 9 cm rail, bot steering,
  the next round, cleared shards and stable rendering uploads between events.
  The office's existing blind is retained; a sheer curtain is added only to an
  in-memory test copy. No saved furniture or project data is changed.
- Runtime hashes and the existing geometry/layout fingerprint checks pass.

This is a short controlled desktop test, not a long multiplayer or mobile test.
