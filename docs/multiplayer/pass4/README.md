# Pass 4 Raspberry Pi internet pilot

The authoritative Floor 5 server runs on a Raspberry Pi 5 Model B Rev 1.1 with four Cortex-A76 cores, 16 GB RAM, Debian 12 ARM64 and Linux 6.12.96. The existing service was on the Pass 2 checkout at ad6742c, running Node 26.13.0 on loopback port 2567. The new pilot uses the system Node 26.13.1 and a separately installed release on loopback port 2568. The pilot address and invitation are shared privately. The Pi serves release 27480426a, with build fingerprint 2e5e53aa. The connector expires on November 19, 2026 at 06:27 CET.

## Measurements

| Real SDK clients | Simulation p95 | Total tick work p99 | Sent per player | Server CPU, one core |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 0.24 ms | 1.16 ms | 6.03 KB/s | 7.2% |
| 4 | 0.57 ms | 3.25 ms | 13.97 KB/s | 8.3% |
| 10 | 1.17 ms | 6.27 ms | 39.17 KB/s | 13.9% |

These samples use the merged 5v5 simulation on the real Pi with a separate server process, five seconds of warmup and 45 measured seconds per count. The clients drive combat through Colyseus. The fixture places players in C08 on spawn. At ten players the authority used about 237 MiB RSS, and the p99 interval between scheduled ticks was approximately 32 ms. A 60 Hz simulation target does not guarantee every tick runs within 16.67 ms. [Raw measurements and build identity](pi-load.json)

A second 45-second series used the internet candidate while Chromium and regression suites were running on the Pi. For 2/4/10 clients, total tick-work p99 was 6.52/11.29/13.75 ms and CPU was 12.0/15.8/22.6% of one core. These two series cover different build hashes and host loads. Both retained all expected players through combat and disposed of their rooms after leave.

## Verification

PR #22 passed all seven jobs on its final head and merged as f7218c2. The new admission tests cover pilot login, secure session cookies, room codes, allowed static files, the public Host/Origin boundary, the actual WebSocket upgrade, the loopback monitor and origin rotation. The browser test uses separate Chromium instances and the shipped game UI. The SDK test checks that one actor's movement, shots, ammunition and reload reach the other client. [PR #22 checks](https://github.com/capstere/Cartridge-strike2/actions/runs/44209972562)

| Gate on the Pi | Actual result |
| --- | --- |
| Core, build and dependencies | **PASS**. 228 core tests, 518 runtime file hashes, 102 prepared door traversals. npm audit reported zero known production advisories. |
| CI rendered latency case | One ten-player, 50 ms test failed when its first renderer received no shot confirmation within the seven-second performance sample. A focused reproduction on the Pi V3D GPU measured its first new confirmed and deduplicated shot after 12.81 seconds. The matrix retains seven-second performance samples and requires each rendered client to receive new confirmation and deduplication within 20 seconds, with full combat load throughout. |
| Server integration | **PASS**. All 18 tests completed in 98.58 seconds in serial execution. Six existing timing-sensitive tests exceeded their deadlines in an earlier parallel run alongside the load benchmark, core suite and two browsers. |
| Browser preflight | **PASS**. Two normal Chromium 156 instances rendered Floor 5 using the Pi's V3D GPU, with a pinned local TLS certificate. The first UI attempt overlapped regeneration of the client contract and failed to reach Resume. The fixed release preflight passed. [Local browser evidence](pi-browser-loopback-tls.json) |
| Real internet route, SDK | **PASS**. Two clients on the Pi connected through the publicly resolved Cloudflare HTTPS hostname, authenticated separately and exchanged WSS gameplay. Each saw the other move, consume ammo and reload. The server denied anonymous matchmaking and the wrong private room code. Passed on the initial tunnel and on the reassigned hostname. [Recovered endpoint evidence](pi-public-sdk.json) |
| Real internet route, 5v5 | **PASS**. Ten separately authenticated SDK clients joined one room. Every socket saw 1/1, 2/2 and 5/5 ready team rosters. At full capacity, two actors observed one another move, fire twice and reload. All ten left cleanly. Clients ran on the Pi through the public edge. [Ten-player WSS evidence](pi-public-5v5.json) |
| Real internet route, game UI | **PASS**. Desktop Chromium and a second touch-emulated Chromium on the Pi reached the shipped lobby, joined the same Floor 5 and verified 51 replicated doors. The friend observed the host move 0.42 units, fire twice (30 to 28), reload to 30 and leave. Both exchanged WebSocket frames over WSS. [Public browser evidence](pi-browser-public-wss.json) |
| Isolation, restart and rollback | **PASS**. Stopped the replacement and verified the original still served on 2567. Forced exit of the pilot process and then of the connector child. Systemd recovered both. The connector assigned a new hostname and both public gameplay probes passed on it. The original service retained PID 46794. |
| Monitoring | **PASS**. Local authority and edge readiness checks succeeded. The first timer fired during connector startup. Its initial delay now starts at timer activation. |
| Two independent internet connections | **PASS**. A Pi client created the room over public HTTPS. A GitHub-hosted Ubuntu client joined it over WSS from another network using a separately authenticated, encrypted session. Each verified the other actor moving, firing and reloading. The runner measured 126 ms RTT and acknowledged 358 inputs. The first split-client run joined but timed out on the remote move/fire check. The passing run used the game’s fixed-step input cadence and SDK clock. [Both players’ results](pi-public-wan.json) · [External runner log](https://github.com/capstere/Cartridge-strike2/actions/runs/44246257389) |
| Physical iPhone, Android and two human players | **NOT RUN**. Desktop and touch-emulated Chromium ran on the Pi. The independent-network run used two SDK clients. |

[Pass 4 pull request and GitHub CI](https://github.com/capstere/Cartridge-strike2/pull/23). The temporary service, expiration, units, monitoring, verification commands and rollback are described in the [Pi deployment runbook](../../../deploy/pilot/README.md).
