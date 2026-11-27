# Persistent project status

**CS3-00 verified. English navigation, Rush and map integration are in progress.** Jesper authorized the complete program and gated production release. [PR #47](https://github.com/capstere/Cartridge-strike2/pull/47) merged at `5364240599164c0aee278bb0ac2a35d662c3a818` after [all eight jobs](https://github.com/capstere/Cartridge-strike2/actions/runs/45976270665) passed on `f1f363963cd082c6cc1b0f6289c3f9b616064e83`. The reviewed draft head and merge preserve the CS2 game runtime. Development and its evidence live on the integration branch `develop/cartridge-strike-3`. The Pi remains on its verified CS2 release.

| ID | State | Next action |
| --- | --- | --- |
| CS3-00 | VERIFIED | Independent recovery, architecture and performance review passed. See [measurements](baseline/performance/README.md) and [recovery](baseline/recovery.json). |
| CS3-01 | IN_PROGRESS | Verify the integrated English guest, Solo and With Friends routes in [PR #50](https://github.com/capstere/Cartridge-strike2/pull/50), after private entry [PR #48](https://github.com/capstere/Cartridge-strike2/pull/48). |
| CS3-02 | IN_PROGRESS | CR4/P9 Rush merged in [PR #49](https://github.com/capstere/Cartridge-strike2/pull/49). Extend the remaining stances, equipment and combat sound on `cs3/02-handling` and `cs3/02-spatial-audio`. |
| CS3-03 | NOT_STARTED | Wait for CS3-00, CS3-01, CS3-02 |
| CS3-04 | NOT_STARTED | Wait for CS3-00, CS3-01 |
| CS3-05 | NOT_STARTED | Wait for CS3-00, CS3-02 |
| CS3-06 | NOT_STARTED | Wait for CS3-01, CS3-02, CS3-05 |
| CS3-07 | IN_PROGRESS | Prove the reference-map adapter and collision, navigation, presentation and budget for the first candidate. Branch `cs3/07-reference-maps`. |
| CS3-08 | NOT_STARTED | Wait for CS3-00, CS3-02, CS3-07 |
| CS3-09 | NOT_STARTED | Wait for CS3-01, CS3-03, CS3-04 |
| CS3-10 | NOT_STARTED | Wait for CS3-04, CS3-05, CS3-07, CS3-08, CS3-09 |
| CS3-11 | NOT_STARTED | Wait for CS3-03, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10 |
| CS3-12 | NOT_STARTED | Wait for CS3-01, CS3-02, CS3-03, CS3-04, CS3-05, CS3-06, CS3-07, CS3-08, CS3-09, CS3-10, CS3-11 |

Update tasks.json in sync with this document. Allowed states NOT_STARTED / IN_PROGRESS / BLOCKED / REVIEW / VERIFIED. For each task maintain exact SHA, actual changed files, reference symbols, commands/results, evidence, known gaps, next executable action. Before context compaction or reset save this state and the lead's decisions. Do not infer progress from task descriptions. Gate changes only with explicit owner approval and preparation PR review; record approval/PR/merge SHA. Do not begin implementation merely because preparation files are merged.

## Development checkpoints on November 27

| Package | Published work and observed behavior | Next verification |
| --- | --- | --- |
| CS3-01 | [Private access PR #48](https://github.com/capstere/Cartridge-strike2/pull/48) targets the integration branch. Independent review found incorrect room-code guidance and lost map-load recovery. The corrected browser fixture checks the exact English failure, releases the admitted seat, retries on the same page and reconnects across map changes. [English menu and twelve initial desktop/touch captures](https://github.com/capstere/Cartridge-strike2/tree/c12eabf170dcfa358bb1de827dc68ab0857fd858/docs/cartridge-strike-3/evidence/01-menu) include Main → Play → Solo → Floor 5, pause, and return in Swedish and French browser profiles. The capture record identifies the working-tree differences. | Check [all eight jobs at the corrected access head](https://github.com/capstere/Cartridge-strike2/actions/runs/46001094422). Exercise the integrated English HUD, ordinary private admission, map selection and typed Classic purchase confirmations on `cs3/01-runtime-english`. |
| CS3-02 | [Rush implementation](https://github.com/capstere/Cartridge-strike2/tree/852939f061ff139bf25322a1670bbdf06718b2d7) carries a short tap and its aim through seven fixed simulation steps. Corrections preserve Reduced Motion and separate receipt-time input admission from release-time rewind. Eight local Pi Chromium CR4/P9 combinations used mouse/keyboard or emulated touch, 30 or 60 Hz configured steps, and full or reduced motion. | Retain reviewable keyframes and the delayed two-seat trace, run PR checks on the exact preserved tree, then extend the remaining CS3-02 behaviors. |
| CS3-07 | [Meltem conversion](https://github.com/capstere/Cartridge-strike2/tree/ef3bfa3bf5472e24d6020282dab392fd38a6c45c) includes the extraction procedure, original texture/shore assets, geometry and layered navigation. The export reproduced 791 collision volumes, eight ramps, two wells, 5,376 nodes and 31,642 directed edges. The walk planner uses 31,504 of those edges. | Verify negative elevations and the live rendered map from ordinary Solo and private-room entry. Meltem supports Endless/TDM. Qualify each of the nine maps individually before adding it to Random. |

[PR #49](https://github.com/capstere/Cartridge-strike2/pull/49) merged into development at `1a0e1fab3ed2fe53f9764470039a89ebe5943598` after independent review and [eight passing jobs](https://github.com/capstere/Cartridge-strike2/actions/runs/45989855234). The [Rush receipts](evidence/rush/README.md) record 116.67 ms of simulation recovery, one debit and one sound dispatch in all eight cases. The next handling check compares the weapon sights and reticle in actual rendered ADS. The spatial audio branch adapts the Riposte first-person, nearby and distant sample selection.

The English private-room correction includes three exact summary rows and typed join failures. Its [CI run](https://github.com/capstere/Cartridge-strike2/actions/runs/46001094422) includes protocol 15 from the merged Rush slice. [PR #50](https://github.com/capstere/Cartridge-strike2/pull/50) incorporates independently scoped saved-character and world-signage work. Its original CI failed on obsolete text expectations and timed out after a passing Compact Arena match. The native rerun exited with zero active Node resources. Check the amended PR head and all eight jobs before accepting that change.

Meltem reached real Solo play in 14.51 seconds on the native Pi 5 desktop. Its 485 frame intervals had a median of 19.8 ms and a 95th percentile of 25.2 ms on this run. The playthrough exposed and fixed the reference scene's warmup traversal. The hosted match and combined map build remain gates on offering the new map.

The project lead owns the integration branch, contract rebuilds after merges, independent sign-off and production release. Work continues in dependency order. A feature-branch checkpoint does not advance a package gate.

## CS3-00 execution

The approved preparation head and merge share the CS2 runtime. The [production identity](baseline/identity.json) records the live and previous revisions, exact protocol/build, compared directories and Pages publishing ref. The [interface decisions](baseline/contracts.md) tie each proposed cross-system change to an owner and a working reference implementation.

| Check from repository root at the preparation head | Result on Raspberry Pi 5 |
| --- | --- |
| `node --experimental-loader ./tools/vendor-three-test-loader.mjs --test src/fps/*.test.mjs tools/*.test.mjs` | 258 passed in 147.3 s |
| `npm test --prefix server` | 53 passed in 152.0 s |
| `python3 deploy/online/test_manage.py` | 7 passed |
| `node tools/verify-owner-runtime.mjs` | 528 manifest files verified |
| `npm run build --prefix server -- --check` | 107 compatibility sources, protocol 14 |
| `node --experimental-vm-modules docs/cartridge-strike-3/baseline/runtime-inventory.mjs` | Five script entry points, 166 statically imported modules, 230 editor dependencies, 59,025,743 manifest bytes |

The [private backup and public verification](baseline/recovery.json) passed. Its 17,155 regular files and 28 links matched the independent restore, including four release directories. Two clients played both the restored active authority and the live authority. Two peers also read the earlier authority's supported family settings. Services, release identity and private state matched after the live test. The copy resides on the production disk. The reviewer verified source hashes, runtime identity, tests and the static inventory. The death-carry, durable reward key, legacy level and input replay contracts incorporate the review findings.

Eleven sampled dependencies matched build-info SHA-256 byte for byte on both Pages and the authenticated production Pi, including all four dynamic imports from app.mjs, the browser SDK, CSS, level, audio and a furniture GLB. The private server returned 401 for a guest request to the session module. Representative screenshot and ZIP HEAD requests returned 200 on Pages and 404 on the authenticated Pi. [Distribution requests](baseline/distribution.json).

The [performance baseline](baseline/performance/README.md) contains 12 native EGL runs on the Pi and six independent 90-second authority windows. Median frame intervals ranged from 71.8–73.0 ms in Floor 5 desktop and 63.8–70.1 ms with emulated touch. The reference Khamsin ranges were 47.2–49.4 ms and 43.2–43.7 ms. These worlds have different geometry and actors. Compare future builds against the same game's scene. Three loopback and three 100 ms injected-RTT server runs recorded p95 input-to-shot-confirmation ranges of 58.04–62.96 ms and 172.99–175.74 ms. The worst measured tick was 105.53 ms. Navigation ran during the slowest tick of each run. Use the per-scenario repeat envelopes when measuring a change.

The [two-seat mobile match](baseline/performance/online-mobile.json) used one rendered touch client and one SDK peer, confirmed movement and shooting, rejoined the correct map and ended by time. The [lifecycle suite](baseline/performance/lifecycle.json) completed four warmups and twenty measured returns using the original assertions, including real background/foreground transitions, resource stability and one retained game. [Scenario status](baseline/performance/progress.json) and [server results](baseline/performance/network.json). All seven recorded test revisions have the same gameplay, reference and test-tool trees as the preparation merge. The Pi supplied both input profiles. Physical iPhone and Android timing and an off-device recovery remain unmeasured.

Independent reviewer decision on November 27: CS3-00 VERIFIED. The reviewer checked both recovery copies, six source blob identities, twelve client traces, six distinct authority windows, the rendered-touch reconnect and all twenty measured lifecycle returns. The lead verified source directory equality across the recorded revisions and checked the dependency manifest. CS3-01, CS3-02 and CS3-07 are eligible and assigned. Runtime performance evidence on other devices belongs to the field and release checks.

## Historical pre-implementation review on November 27

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
