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

## Ownership of the recorded interactions

| Package | Writer and handoff | Review evidence |
| --- | --- | --- |
| 00 | Performance owns one serial local measurement window. Reference integration supplies source→target→fixture receipts. Lead owns contracts, artifact inventory and isolated restore evidence. | Same-route CS2 and reference baseline, revision, input profile, and explicit recovery result. |
| 01, 03, 04, 09 | Frontend owns route stack, focus, loading and English catalog. Graphics/gameplay own wardrobe and class model/mount respectively. Backend owns pre-auth messages and persistent identity. | 01 delivers navigation. 03 owns IMG_8152. 04 owns IMG_8159. 09 owns IMG_8151, 8163 and 8165, with actual progression verified in 10. |
| 02 | Gameplay writes shared gait and animation intent. Backend writes input/pose schema and reconciliation adapters. Mobile-input owns raw stick threshold before normalization. Audio owns timed cues. Lead integrates shared orchestrators. | V2/V4/V6, rifle and pistol, local and remote view, one deferred shot, verified ammo and one set of cues. |
| 06, 10 | Mobile-input owns layout, gestures and cancellation. Match backend owns replay eligibility/clock and event recipients. Frontend owns displays, including captions. | 06 proves IMG_8153–8157 under each supported input profile. 10 proves V1/V5/V6 through death, skip, respawn or Classic spectator, and reward attribution. |
| 12 | Reviewer independently samples all media-linked flows and both distribution paths; performance owns serial measurement. | Compare evidence with actual build and scope, including English, physical-phone status and recovery. |
