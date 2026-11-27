# Backup and rollback

## GitHub baseline — verified
- main: 239b15b01040c2b0a1fd394f3be158cfb006d82a
- tree: 55f0c61077b49c0cd4b0f16cf8864fb24bcee3c3
- backup branch: backup/cs2-2026-11-27-239b15b, verified via branch listing at the exact SHA, not protected. Do not advance/delete it. Optionally create local annotated tag and independently store Git bundle on Pi before implementation; do not claim immutable remote tag.
- preparation branch: prepare/cartridge-strike-3. No game code or deployment modification in preparation.
- Restore source in separate checkout/worktree from SHA or backup branch, verify tree. Never force-push main as a routine rollback.

## Pi backup — REQUIRED / NOT RUN here
Historical HANDOVER reports live revision 8307e91118dba4fdca964012d2b0c247a40221fd, build 30f8f4af97b2b082f995196f06f498b132ba9bf8d303671ee8ab8d4b69590385. Verify actual with cs2-online status, service status and readlink of actual active release. Existing deploy/online/README.md documents production loopback 2568, original service/2567 left untouched, named Cloudflare tunnel, /opt/cartridge-strike2-pilot/releases/GIT_SHA, root-only backups /var/lib/cartridge-strike2-online/backups/, /etc/cartridge-strike2-pilot private config, /var/lib/cartridge-strike2-family-room/settings.json. Paths are documented, not live-inspected. Never print secrets.
1. On Pi record exact current/previous release SHA, manifest/build/protocol, service/tunnel config references, room count and state schema. Verify current functional two-client flow when safe.
2. Prepare private timestamped root-owned backup with strict permissions (0700 dir/0600 secrets), copy actual current release and prior known-good release or verify retained immutable release dirs and local bundle, private config/family state, service drop-ins, deployment tool identity, future account DB and WAL via consistent SQLite backup or equivalent. Ensure disk space and checksums; no live DB file copy without consistency. Save only sanitized receipts in repo. If backup requires quiet rooms, wait for natural drain; never evict active users.
3. Restore copy into isolated staging port/state; verify checksum, service and two-client game plus family settings/migration. Document rollback rehearsal. Save exact commands that actually passed.
4. Stage approved exact commit with bash deploy/pilot/stage-release.sh per existing guide, validate build, migrations and idle rooms. Use sudo cs2-online activate FULL_SHA and sudo cs2-online verify. Existing tool atomically switches/reverts on failed checks; verify compatibility with new database migration before relying on it.
5. On failure stop candidate safely after room drain, use sudo cs2-online rollback with verified prior release. Restore compatible private settings/DB snapshot if schema cannot roll back; never overwrite post-release user data without explicit recovery plan (export/replay compatible deltas or preserve snapshot). Verify health AND gameplay via two clients through HTTPS/WSS, legacy family link and restored settings. Do not change unrelated DNS or original service.
6. If failure before release, retain CS2 active, keep branch/evidence and diagnose. Production activation only after approved implementation, full tests and rollback readiness.

Browser localStorage/IndexedDB migration: preserve old key/version copy where feasible, do not delete private saved characters/maps; validate copy before switching, recovery/export route. Account data remains outside repo/releases. No Pi access in preparation; Codex must complete and verify backup before any production change.
