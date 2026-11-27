# CS3-04 account and room authority

The backend runs on the existing HTTPS pilot. The reference UI in `frontline/source/src/09j-compte.js` supplies the profile, sign-in, registration and recovery flow. Its remote account service is absent from the source. Colyseus supplies the authoritative room, seat, mode, readiness, results and host changes. The existing family settings file retains its format.

## Private storage and recovery

With family access enabled, the default database is `cs3-accounts.sqlite` beside the family settings file. A pilot without family access can set an absolute `CS3_ACCOUNT_DB`. Keep the private state directory outside the release. Only one pilot process owns the database. On the tested Pi Node 26.13, the native SQLite module uses WAL, FULL synchronous commits, foreign keys and transactions. Account deployments require the native `node:sqlite` module enabled. LAN and local gameplay use their existing account-free path.

Schema v1 contains users, hashed sessions and recovery proofs, scoped device admissions, match summaries and unique reward receipts. The v2 migration adds bounded, expiring credential-attempt records and a grant lookup index. Session and device cookies last 30 days, are restricted to the HTTPS origin and have the Secure, HttpOnly and SameSite=Strict attributes. New passwords use salted scrypt with N=32768, r=8, p=1 and at most two concurrent derivations. Ten credential attempts per normalized account in ten minutes supplement peer and server-wide admission limits. Password changes and recovery invalidate prior account sessions. An account can retain up to sixteen session records. A deleted account's match results and reward receipts are removed with it.

For an operator-controlled backup, supply two absolute private paths. The destination must be new. A consistent SQLite snapshot is integrity-checked and published with mode 0600. Restore to a separate new file, verify the restored accounts in isolation and select the restored file at a controlled restart.

```sh
node server/account-backup.mjs backup "$CS3_ACCOUNT_DB" "$CS3_BACKUP_FILE"
node server/account-backup.mjs restore "$CS3_BACKUP_FILE" "$CS3_ISOLATED_RESTORE"
```

The rehearsal in `server/test/account-store.test.mjs` registers a fixture account, grants a device access, credits results, opens a v1 database with v2, snapshots active WAL state, restores to a fresh path, signs into that copy and replays receipts. It also verifies that deleting the restored account leaves its original intact. Backup files contain private account data and remain outside Git.

## Room and result behavior

The invitation URL contains a one-use fragment. The entry page clears it from the address bar and exchanges it at the same origin. The ten-character short code and 256-bit link share a 15-minute deadline and one redemption. Issuing another invitation rotates outstanding links. Explicit host revocation invalidates claimed grants and disconnects those scoped members. A host credential belongs to the device bound to the connected authoritative host seat. Longstanding family or private passwords still work through the pilot and remember the device after it joins. The stable family alias survives process replacement. Transient private grants expire with the room. Signing out of a profile preserves the separate room grant. Forgetting a room drops that device's room access.

Existing rooms stay private. With `CS3_PUBLIC_LISTING=1`, the signed-in listing queries the matchmaker for unlocked, nonprivate rooms and requires explicit trusted moderation metadata. The listing is disabled by default. Later public matchmaking and moderation must supply eligible rooms before any can appear there.

The authority allocates a random match instance when deployment becomes active. The result transaction writes one summary and one reward receipt per participant and instance. An expired or signed-out account session cannot earn a new result. Basic match credits currently award 10 XP per kill and 25 XP for a win. Package CS3-10 owns the remaining progression rules. CS3-09 owns validated equipment, outfit and class persistence when its content and entitlements are available.

## Verification

Backend revisions `6ab359d`, `13315a7` and `a37006f` build on `adb3cdf`. Local verification used the Raspberry Pi, Node v26.13.0, temporary stores and loopback test servers. No production credentials or state entered the fixtures.

```sh
node --import ./server/register-shared.mjs --test --test-concurrency=1 server/test/account-access.test.mjs server/test/account-store.test.mjs server/test/pilot-access.test.mjs server/test/family-room.test.mjs server/test/lan-access.test.mjs
node docs/cartridge-strike-3/evidence/04-account/kdf-cost.mjs
```

The serial backend suite passed 13 tests in 43.6 seconds before the additional concurrent-room case. The additional case passed individually in 13.6 seconds. It uses two real Colyseus rooms with local match number one, completes a rematch on each, and verifies exactly three results for the account after the final match is played signed out. Together the fixtures exercise two separate guest/host clients, legacy passwords, scoped links, rotation, revocation, forgetting, private-room return, account registration, restart, login, recovery, export, deletion, hash concurrency, invitation expiry and durable reward replay. The lead owns the separate serialized cost measurement, rendered checks, physical-device evidence, hosted CI and independent review.
