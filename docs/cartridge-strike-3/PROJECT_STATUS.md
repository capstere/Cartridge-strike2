# Persistent project status

**REVIEW_REQUIRED · owner approval pending.** The pre-implementation review covers preparation head `b387b4d`, main `1a9dc3f`, and the local Riposte source tree recorded in tasks.json. All 13 implementation packages remain NOT_STARTED. English is a release requirement. The existing CS2 game still contains Swedish. CS3-00 owns the private backup/restore, comparable baselines and architecture gates.

| ID | State | Next action |
| --- | --- | --- |
| CS3-00 | NOT_STARTED | After approval: verify Pi baseline and backup, run tests |
| CS3-01 | NOT_STARTED | Wait for CS3-00 |
| CS3-02 | NOT_STARTED | Wait for CS3-00 |
| CS3-03 | NOT_STARTED | Wait for CS3-00, CS3-01, CS3-02 |
| CS3-04 | NOT_STARTED | Wait for CS3-00, CS3-01 |
| CS3-05 | NOT_STARTED | Wait for CS3-00, CS3-02 |
| CS3-06 | NOT_STARTED | Wait for CS3-01, CS3-02, CS3-05 |
| CS3-07 | NOT_STARTED | Wait for CS3-00 |
| CS3-08 | NOT_STARTED | Wait for CS3-00, CS3-02, CS3-07 |
| CS3-09 | NOT_STARTED | Wait for CS3-01, CS3-03, CS3-04 |
| CS3-10 | NOT_STARTED | Wait for CS3-04, CS3-05, CS3-07, CS3-08, CS3-09 |
| CS3-11 | NOT_STARTED | Wait for CS3-03, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10 |
| CS3-12 | NOT_STARTED | Wait for CS3-01, CS3-02, CS3-03, CS3-04, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10, CS3-11 |

Update tasks.json in sync with this document. Allowed states NOT_STARTED / IN_PROGRESS / BLOCKED / REVIEW / VERIFIED. For each task maintain exact SHA, actual changed files, reference symbols, commands/results, evidence, known gaps, next executable action. Before context compaction or reset save this state and the lead's decisions. Do not infer progress from task descriptions. Gate changes only with explicit owner approval and preparation PR review; record approval/PR/merge SHA. Do not begin implementation merely because preparation files are merged.

## Pre-implementation review on November 27

The lead reviewed both fetched branches and the full preparation program with gameplay, performance and an independent reviewer. The backup ref still resolves to `239b15b01040c2b0a1fd394f3be158cfb006d82a`. Main `1a9dc3f10605a7ccd2c28fef354b25bcd4418c1b` has seven media-only commits beyond that runtime. The [source audit](SOURCE_REVIEW.md) covers the 966-file vendored tree, including all 144 runtime scripts. The [screenshot inventory](UI_UX_SPECIFICATION.md) covers IMG_8150–IMG_8165. The [recording report](RECORDING_REVIEW.md) gives the five archive blobs and extracted hashes, 451 timestamped frames, stereo audio and the observed transitions. All decoding and local browser captures used private scratch directories. Heavy jobs ran serially.

| Check | Result and implications |
| --- | --- |
| Local player journeys | On the Pi 5, Chromium 156, 844×390 CSS viewport, low quality and en-US, the packaged Frontline 5.6.1 reached Play → Solo → Khamsin → class selection → Deploy. After Go, W+Shift changed controller sprint weight from 0 to 0.9994, and viewmodel weight from 0 to 1.0000. After release the values returned to 0.0039 and approximately zero. CS2 reached its Swedish Floor 5 Classic buy phase from the normal FPS entry. These runs used loopback assets and isolated profiles. They establish reachability and pose state. Matched performance, touch latency and human handling comparisons belong to CS3-00. |
| Browser limitation | The first software-rendered run reached the reference class selector and CS2 HUD but timed out on the Deploy click and CS2 screenshot. Both normal-entry captures completed in headed Chromium using the Pi EGL driver. The read-only probes changed no game files. |
| English | Required across both distributions. The existing game renders Swedish on an English browser, including startup, buy phase and HUD. Loading, buy success and re-login currently interpret localized prose. The roadmap assigns their state contracts, English voices, accessibility and world lettering to named owners and gates CS3-12 on the complete sweep. |
| Production identity | Read-only `cs2-online status` returned healthy, zero rooms at the sample, active game and tunnel services, revision `8307e91118dba4fdca964012d2b0c247a40221fd`, protocol 14 and build `30f8f4af97b2b082f995196f06f498b132ba9bf8d303671ee8ab8d4b69590385`. CS3-00 still needs a private restore rehearsal. Recheck occupancy at any future activation. |
| Distribution | None of the 21 uploads appear in build-info.json. The Pi staging script copies the full tree. HTTP HEAD requests to the existing Pages site returned 200 for the FPS entry, IMG_8150.PNG and the unsuffixed recording ZIP. CS3-00 inventories both distributions and CS3-12 checks the actual publish/stage outputs. |
| Repository checks | The program links, source inventory, media SHA/PTS evidence and JSON/roadmap/status dependencies were checked locally. `node tools/verify-owner-runtime.mjs` passed for all 528 runtime files. `npm run build --prefix server -- --check` passed for 107 compatibility sources and protocol 14. |
| Independent review | Reviewer cross-checked all screenshot sheets, all five clip overviews, source/target symbols, 13 package dependencies, local links and scope. The program now distinguishes near-wall/countdown from Rush, preserves input edges and guest/pilot boundaries, and assigns UI acceptance to the package that implements each screen. Reviewer found no blocking preparation defect. |

**Readiness decision.** Ready for owner approval and then CS3-00. All feature work remains gated on its verified dependencies. Open work includes the private backup and restore, measured baseline and timing targets, physical iPhone/Android play, versioned multi-level collision/navigation, durable account/reward migration, and filtered authoritative replay/UAV. These have assigned packages and acceptance checks. This review did not implement CS3, stage a release, or activate production.
