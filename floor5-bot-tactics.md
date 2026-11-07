# Floor 5 bot tactics

The prepared Floor 5 previously had no tactical routing overlay. It now prepares
up to three collision-validated routes from each lift toward the objectives.
Alternatives use different accepted doors where available. The original Yuka
graph, StateMachine, SeekBehavior, perception and MemorySystem remain in use.

- Seeded round personalities vary route preferences, departure order, walking
  pace, decision cadence, angle-holding time and sound-investigation delay.
  Walking pace never exceeds the configured bot speed.
- A small squad coordinator assigns defense, guard, watch, flank, support,
  objective, rescue and escort tasks. Assignments respond to surviving teammates,
  carrier changes and hostage state; bomb and rescue interactions retain priority.
- Route scoring considers teammates' selected lanes and recent **seen** contact
  reports. A new contact, blockage or glass revision can trigger an adaptive path.
  Contacts are snapshots, expire after eight seconds, and reset each round.
- At most two eligible hearers investigate the same sound area. Other bots keep
  covering their objectives. Repeated footsteps update the remembered position
  without restarting the reaction wait indefinitely.
- Guard positions reserve space for teammates. Injured, reloading or supporting
  bots can move to nearby reachable cover against their perceived threat.
- Congested bots wait or yield to a swept free position. A temporary query can
  route around a physically encountered teammate or hostage. A bot pushed into
  the conservative area reserved for a door's opposite swing can physically walk
  back onto the navigation graph; there is no teleport or collision bypass.

Alternative costs and temporary body exclusions belong only to their path query;
they never mutate the shared graph. Prepared alternatives are reused after round
reset. Local recovery and weighted searches happen on events/timed retries, not
every frame. Broken-glass paths continue to use the existing navigation revision.

The difficulty profiles, weapon behavior, damage, bomb/hostage/rescue rules,
timers, map geometry and project data are unchanged. Reports wait for the reporting
bot's reaction time. Cover decisions do not inspect hidden enemy positions, and
the existing per-shot visibility check still applies.

Validation includes 131 regression tests; four seeds with two complete simulated
rounds each; three seeds for each of planting, defusing and rescuing both hostages;
opposing traffic through a real doorway; remembered sound expiry; all difficulty
reaction floors; danger-driven rerouting; body overlap and door-clearance recovery.
The objective traversal fixtures disable opposing AI and vision to isolate travel
and interaction, while retaining bodies, physical doors and original timers.

`tools/bot-tactics-browser.mjs` also runs six actual FPS rounds in Chromium with
software WebGL, rendering checkpoints and capturing both-round departures. This
checks live model/render integration and console errors, not hardware frame rate,
multiplayer balance or physical mobile performance. CI stores the reports and
captures as the `bot-tactics` artifact.
