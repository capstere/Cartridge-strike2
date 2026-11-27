# Persistent project status

State: **REVIEW_REQUIRED** — preparation only. Baseline 239b15b01040c2b0a1fd394f3be158cfb006d82a; reference 31ca050d8ce59f4885c01a3237f68cdf186c9b60; backup branch verified. Default language English. No production code implemented or deployed. No Pi backup, fresh benchmark, CS2 build or physical device test run here. GitHub tree inspection and selected runtime file reads; source symbol extraction from supplied reference ZIP. Current deployment identity only historical.

| ID | State | Next action |
| --- | --- | --- |
| CS3-00 | NOT_STARTED | After approval: verify Pi baseline and backup, run tests |
| CS3-01 | NOT_STARTED | Wait for CS3-00 |
| CS3-02 | NOT_STARTED | Wait for CS3-00 |
| CS3-03 | NOT_STARTED | Wait for CS3-00, CS3-02 |
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
