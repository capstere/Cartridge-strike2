# CS3-12 operator rehearsal

On 2026-11-28, candidate `40060d6b27655dd88fc87bffde41d3cce45209c7` passed the Raspberry Pi operator rehearsal. Its operator SHA-256 was `0fd442f77e839d43b3c2ff55cab9f0ff12318f4da62bafe5d4d50a9f4ed7b0b5`. Production kept its original release pointer and both original service PIDs throughout. [Machine receipt](manager.json)

| Gate | Observed result |
| --- | --- |
| Occupied service | The initial activation refused to interrupt an existing CS2 seat. |
| Activate and explicitly roll back | The staged manager activated CS3 `e52226e2` and then restored CS2 `30f8f4af`. On both releases, two independent public HTTPS/WSS clients readied, moved, fired, observed each other’s events, reloaded and left. Unauthorized HTTP returned 401 and the wrong room code was rejected. |
| Private data written after activation | The external test player registered an account and selected Meltem with Domination. The old release reopened its supported Floor 5 settings. The cold, validated schema 5 recovery database contained the new account. The conversion recorded two adjusted fields, map and mode. |
| Failed public verification during real play | Between actual connector thaw and the probe, the fixture admitted an independent player. A deliberately mismatched verifier invite triggered recovery. The manager journal reached rollback-pending while the player occupied CS3. After termination, a fresh manager resumed, waited through six seconds with that seat still connected, and restored CS2 only after its voluntary departure. The restored public probe passed and the final census was empty. |
| Service isolation | The kernel reported four actual frozen connector states. All three observed successful SDK probe processes had effective UID/GID 65534, the disposable game’s identity. The test connector, units, private state and runtime tree were removed. |

The installed manager, external SDK probe, rollback converter and account backup source were byte-identical at final browser revision `fc61be4382b4ea97024d3eeb762f655b96612503`.

The rehearsal uses the staged operations bundle and two real, uniquely named systemd services. Its authority has a private loopback port and disposable family and account state. A temporary Cloudflare connector exposes its invite gate over HTTPS/WSS. The fixture maps the operator's installation directories, local health port and unit names to this installation. It checks the staged operations bytes and both runtime manifests against their Git objects. Activation, freeze/thaw, verification, rollback conversion, journaling and resume run from the copied installed manager.

The independent client uses the shipped SDK and a separate cookie. It holds and voluntarily leaves a normal seat, registers a synthetic CS3 account, and saves a map and mode unavailable to CS2. The fixture checks the verified cold backup with SQLite. It also observes the effective UID and GID of the operator's external two-player SDK process through the operating system.

To reproduce on the Pi, reserve the single heavy slot, use immutable staged releases, and supply a fresh receipt path. The script creates disposable runtime units under `/run/systemd/system` and deletes them and the private fixture directory after execution. It compares the production current pointer and service PIDs before and after the rehearsal.

```sh
sudo -n python3 tools/release-cutover.py \
  "$PREVIOUS_DISPOSABLE_RUNTIME" "$STAGED_CANDIDATE" \
  "$REPOSITORY_CHECKOUT" "$REVIEWED_SHA" "$NEW_RECEIPT"
```

The staged candidate requires its sibling `operations/$REVIEWED_SHA` from the release staging tool. The previous disposable runtime requires the manifest-verified CS2 public files, server, locked production dependencies and vendor loader. Credentials, account records, external addresses and raw edge logs remain inside the throwaway fixture.
