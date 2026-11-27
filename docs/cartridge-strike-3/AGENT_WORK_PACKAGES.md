# Specialist coordination and file ownership

Existing Codex config enables agents with maximum 3 concurrent threads. Keep that value. Existing gameplay, performance and reviewer definitions retained; add seven specialized role files using same TOML mechanism. Verify CLI actually loads custom roles before delegation; if unavailable lead executes same responsibilities sequentially. Named roles are not independent simultaneous processes.

| Role | Responsibility / boundaries |
| --- | --- |
| Lead / integrator | Own root, architecture, shared interface approvals, merge, worktrees, release; assigns one writer for game.mjs, app.mjs, schema and shared protocol at any instant. |
| reference-integration | Read reference source, pin symbols/hash, investigate runnable behavior, direct/adapt/new decision; no wholesale imports; own matrix/evidence, no gameplay writes without explicit scope. |
| frontend | fps/ and UI modules, en catalog, navigation, settings, previews UI, lobby; coordinate app/session adapter with lead; no server-rule edits. |
| gameplay | Existing role; owns FPS feel, Rush, movement, weapon/character animation; gameplay shared changes via lead; no unilateral protocol changes. |
| multiplayer-backend | server/ and shared/multiplayer contracts, auth, persistence, streak authority, lifecycle; coordinate game rules and frontend. |
| ai-navigation | bots.mjs, bot-tactics.mjs, navigation.mjs; map collision shared ownership with graphics; bounded queries, preserve objectives. |
| graphics-assets | render/asset/map adapters, registry, material/LOD, characters preview assets; models.mjs single writer with gameplay; no client-only collision blockers. |
| audio | riposte-audio/strike-kit-audio/reload-foley/floor-audio, event registry and sound lifecycle; event contract via gameplay/lead. |
| mobile-input | mobile-controls/tactical-controls/ui/cs-mobile, bindings, touch editor, gamepad; input schema via backend/lead. |
| performance | Existing role; fresh baseline/benchmarks, one heavy Pi job, CI QA and evidence; focused changes only assigned. |
| reviewer | Existing read-only role; independent diff, runtime evidence, security, visual quality, release gate. |

## Delegation protocol
Lead assigns package ID, exact commit, worktree/branch, paths allowed to edit, read dependencies, explicit interface revision, acceptance tests and evidence. Specialists report changed paths, source symbols, tests, results, known blockers and next action; no nested orchestration or independent deploy. One writer per shared file; review and integrate small slices. Serialize protocol/schema changes; regenerate build with existing tooling, validate client/server contract. Freeze shared interfaces before parallel tasks. Review no fake screenshots, no softened tests, no secrets. Heavy Pi builds/probes coordinated by lead: max one at a time. Lead remains sole owner contact; use persistent tasks.json, status and evidence files to resume new contexts without relying on chat history.
