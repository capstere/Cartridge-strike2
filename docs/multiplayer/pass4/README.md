# Pass 4 Raspberry Pi internet pilot

The authoritative Floor 5 server runs on a Raspberry Pi 5 Model B Rev 1.1 with four Cortex-A76 cores, 16 GB RAM, Debian 12 ARM64 and Linux 6.12.96. The existing service was on the Pass 2 checkout at ad6742c, running Node 26.13.0 on loopback port 2567. The new pilot uses the system Node 26.13.1 and a separately installed release on loopback port 2568. The pilot address and invitation are shared privately.

## Measurements

| Real SDK clients | Simulation p95 | Total tick work p99 | Sent per player | Server CPU, one core |
| ---: | ---: | ---: | ---: | ---: |
| 2 | 0.24 ms | 1.16 ms | 6.03 KB/s | 7.2% |
| 4 | 0.57 ms | 3.25 ms | 13.97 KB/s | 8.3% |
| 10 | 1.17 ms | 6.27 ms | 39.17 KB/s | 13.9% |

These samples use the merged 5v5 simulation on the real Pi with a separate server process, five seconds of warmup and 45 measured seconds per count. The clients drive combat through Colyseus. The fixture places players in C08 on spawn. At ten players the authority used about 237 MiB RSS, and the p99 interval between scheduled ticks was approximately 32 ms. A 60 Hz simulation target does not guarantee every tick runs within 16.67 ms. [Raw measurements and build identity](pi-load.json)

## Verification

PR #22 passed all seven jobs on its final head and merged as f7218c2. The new admission tests cover pilot login, secure session cookies, room codes, allowed static files, the public Host/Origin boundary, the actual WebSocket upgrade, the loopback monitor and origin rotation. The browser test uses separate Chromium instances and the shipped game UI. The SDK test checks that one actor's movement, shots, ammunition and reload reach the other client. [PR #22 checks](https://github.com/capstere/Cartridge-strike2/actions/runs/44209972562)

Physical iPhone, Android and two human players on independent ISPs require a device session. The temporary service, expiration, units, monitoring, verification commands and rollback are described in the [Pi deployment runbook](../../../deploy/pilot/README.md).
