# Cartridge-Strike repository — CS3 review gate

Read [CS3 program](docs/cartridge-strike-3/README.md), [CODEX_HANDOVER](docs/cartridge-strike-3/CODEX_HANDOVER.md) and [PROJECT_STATUS](docs/cartridge-strike-3/PROJECT_STATUS.md). CS3 preparation is REVIEW_REQUIRED. Do not execute implementation or deployment until explicit owner approval of the preparation. After approval the CS3 program supersedes the historical first-open-task rule for the CS3 assignment. English is mandatory for CS3 player-facing UI, server notices and new documentation. The existing CS2 instructions below remain valid for historical maintenance and recovery; do not silently change production. Keep one writer per shared file, maximum existing agent concurrency, one heavy Pi job.

---

# Working on Cartridge-Strike 2

When Jesper asks the lead agent to read the repo and follow the handover, the lead agent opens [HANDOVER.md](HANDOVER.md) and carries out the first open task.

This repository ships a standalone FPS on GitHub Pages. Keep the Tactical Industrial UI, the Classic and Endless rules, and support for compatible saved characters and levels. The FPS imports shared modules from `furniture-editor/build/` and `furniture-editor/library/`. Keep public entry points focused on the game.

Use the [documentation index](docs/README.md) for supporting material and the [FPS audit](docs/playtest-audit/README.md) for measured baselines. Run the checks in the handover for the systems you change.

## Agent coordination

- The lead agent coordinates the work and is Jesper’s only point of contact. Spawn the project’s named specialists when their expertise is useful. Use `performance` for measurements, `gameplay` for gameplay changes and behavior checks, and `reviewer` for independent review. Small tasks may need only one specialist or none.
- Give each delegation a goal, scope, edit permissions and file ownership, verification expectations, and a deliverable. A subagent works only on its assignment, reports to the lead agent, and does not start a handover task or spawn further agents.
- Assign one writer for overlapping code. Use separate worktrees for independent implementations that need to proceed in parallel. Coordinate builds and tests so at most one heavy job runs at a time on the Raspberry Pi.
- The lead agent integrates and verifies the results, handles PRs, merges, and deployment within the current assignment, and updates HANDOVER.md with the outcome and next step. Reuse Jesper’s existing authorization without introducing extra approvals just for delegation.
