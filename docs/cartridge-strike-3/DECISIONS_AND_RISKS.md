# Decisions and risks

| ID | Decision / risk | Resolution / verification |
| --- | --- | --- |
| D01 | Same repo/domain, CS2 backup branch verified (not protected), no parallel permanent production game | Owner requirement; verify actual Pi release and separate private backup. |
| D02 | Evolutionary integration, preserve Colyseus/shared simulation and Three r180 | Compare reference slice; refactor only when evidence and compatibility justify. |
| D03 | Source 5.6.0 at 31ca050d8ce59f4885c01a3237f68cdf186c9b60 vs screenshot 5.20.1 | Main verified 2026-11-27; no newer main found; tag listing blocked. Visual requirements stand independently. |
| D04 | Respect MIT notices and NOTICE exclusions automatically; original brand/music/animations or eligible assets | Reuse freely where licensed, minimal provenance. Do not copy restricted resources into public repo. |
| D05 | English default/fallback everywhere; future locale catalog | Owner added mandatory English; keep IDs and historical Swedish reports. |
| D06 | Rush screenshot is countdown pose, not conclusive sprint state | Verified upstream sprint functions; compare actual play and tune closest pose. |
| D07 | Initial Rage x1.20 movement/x0.75 reload; Immortal 8s with shooting, no stacking, one charge and carry per life/match | Owner design plus explicit proposed edge cases; central config, human playtest. |
| D08 | Bonus keys configurable, avoid numeric weapon conflicts; Z/X/C tentative; bots bonus off initially, zombie eligibility off | Defaults chosen for safety/balance, test conflicts; expose config. |
| D09 | Account store proposed SQLite, opaque scoped cookie/session/invite, guest solo, public flag off until secure | Verify Pi/Node driver, recovery code and private auth migration. No official backend to copy. |
| D10 | Existing broad actor replication may expose hidden positions | Do not claim privacy from UI hiding; audit/filter sensitive data with measured performance. |
| D11 | Meltem proposed first reference map (subject to adapter analysis) | Existing map adapter may not support multi-level/ramp/void; validate before shipping. |
| D12 | Initial animation adapter and cosmetics, joint hitboxes separately reviewed | Existing Quaternius imports and server rewind compatibility. |
| D13 | Screenshots textual requirements, not committed originals | Public repo and source exclusions; all 10 documented. Owner can provide private images if needed, no requirement to re-upload to start. |
| D14 | Keep max concurrent agent threads 3, one heavy job on Pi | Existing config; role definitions not a requirement to run all at once. Verify CLI support. |
| R01 | No local clone / runtime or Pi access in preparation | Connector inspection + local reference ZIP symbol scan only; CS3-00 requires actual runtime audit, benchmark and deployment inventory. |
| R02 | Physical iPhone/Android not verified even for historical CS2 reports | Explicit pending tests; do not misrepresent emulation; owner-visible acceptance limitation. |
| R03 | Account security and persistence migration, public abuse and capacity | Stage opt-in and verify; no public exposure before gates. |
| R04 | Scope huge; risk of disconnected changes or unfinished program | Dependency DAG, one writer per interface, vertical slices with evidence, persistent status. Record blockers without quietly waiving requirements. |
| R05 | Client performance and Pi bot path tails | Fresh baselines, one heavy task, compare like-for-like. |
| R06 | GitHub Pages vs Pi runtime contracts | Preserve separate offline deployment, build-info and source/runtime allowlists; exclude development materials/secrets. |

All proposed defaults are revisable through measured implementation, not extra approvals for routine details. Changes to explicit owner scope, irreversible migrations or production risk must be recorded and reviewed. Preparation does not validate implementation or actual live release.
