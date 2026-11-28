#!/usr/bin/env python3
"""Operate only the isolated online service. Never print credentials."""
import argparse
import datetime
import fcntl
from contextlib import contextmanager
import json
import os
from pathlib import Path
import re
import select
import stat
import secrets
import shutil
import subprocess
import tempfile
import time
import urllib.request
from urllib.parse import urlsplit

MANAGER_ROOT = Path(__file__).resolve().parents[2]
PREFIX = Path('/opt/cartridge-strike2-pilot')
CONFIG = Path('/etc/cartridge-strike2-pilot')
BACKUPS = Path('/var/lib/cartridge-strike2-online/backups')
SYSTEMD = Path('/etc/systemd/system')
SERVICE = 'cartridge-strike2-pilot'
TUNNEL = 'cartridge-strike2-tunnel'
FAMILY = Path('/var/lib/cartridge-strike2-family-room')
LOCK = Path('/run/lock/cartridge-strike2-cutover.lock')
FENCE = Path('/run/cartridge-strike2-cutover.token')



def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


def require_installed_operations():
    marker = MANAGER_ROOT / 'REVISION'
    sha = MANAGER_ROOT.name
    if not re.fullmatch(r'[0-9a-f]{40}', sha) or MANAGER_ROOT.parent != PREFIX / 'operations' or marker.read_text().strip() != sha:
        raise RuntimeError('Run the immutable operations bundle staged with the reviewed release.')
    sdk = (MANAGER_ROOT / 'server/node_modules').resolve()
    if sdk != PREFIX / 'releases' / sha / 'server/node_modules':
        raise RuntimeError('Unexpected operations SDK.')
    for path in [marker, Path(__file__).resolve(), MANAGER_ROOT / 'deploy/online/prepare-rollback.mjs',
                 MANAGER_ROOT / 'tools/network-pilot-probe.mjs', sdk]:
        for node in [path, *path.parents]:
            status = node.lstat()
            if status.st_uid or status.st_gid or status.st_mode & 0o022 or stat.S_ISLNK(status.st_mode):
                raise RuntimeError('The release and operations tooling must be root-owned and immutable to other users.')


def guard_fence(parent, token):
    # A transient system service survives a terminated terminal/manager. A
    # pidfd and a per-operation token protect against PID and lock reuse.
    try:
        descriptor = os.pidfd_open(parent)
    except ProcessLookupError:
        descriptor = None
    if descriptor is not None:
        try:
            poller = select.poll()
            poller.register(descriptor, select.POLLIN)
            while FENCE.exists() and FENCE.read_text().strip() == token:
                if poller.poll(500):
                    break
        finally:
            os.close(descriptor)
    with LOCK.open('a') as lock:
        # A surviving owner releases its fence; never wait behind a new
        # operation to thaw a different owner's connector.
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            return
        if FENCE.exists() and FENCE.read_text().strip() == token:
            try:
                if pending_path().exists():
                    recover_interrupted_fence()
            finally:
                run('systemctl', 'thaw', TUNNEL)
                FENCE.unlink(missing_ok=True)


@contextmanager
def fence_admissions():
    token = secrets.token_hex(16)
    FENCE.write_text(token)
    try:
        run('systemd-run', '--quiet', '--collect', '--unit=cs3-cutover-' + token,
            '/usr/bin/python3', '-I', str(Path(__file__).resolve()), 'guard-fence', str(os.getpid()), token)
        run('systemctl', 'freeze', TUNNEL)
        if run('systemctl', 'show', TUNNEL, '--property=FreezerState', '--value').stdout.strip() != 'frozen':
            raise RuntimeError('The public connector could not be fenced.')
        yield
    finally:
        run('systemctl', 'thaw', TUNNEL)
        FENCE.unlink(missing_ok=True)


def confirm_idle():
    idle()
    # A request sent by the connector just before freeze can still be
    # completing on loopback. Wait for that authority turn and recheck.
    time.sleep(1)
    idle()


def health():
    with urllib.request.urlopen('http://127.0.0.1:2568/health', timeout=5) as response:
        return json.load(response)


def idle():
    state = health()
    # Zero connected sockets can still mean a whole team is reconnecting.
    # Wait for room disposal, including the bounded seat reservations.
    if state['players'] or state['rooms']:
        raise RuntimeError('A room is still occupied or reserved. Wait until every room has closed.')


def origin():
    fixed = CONFIG / 'public-origin'
    return (fixed if fixed.exists() else Path('/run/cartridge-strike2-tunnel/origin')).read_text().strip()


def revision(value):
    if not re.fullmatch(r'[0-9a-f]{40}', value):
        raise ValueError('Expected a full reviewed Git commit SHA.')
    release = PREFIX / 'releases' / value
    if not (release / 'server/local-server.mjs').is_file():
        raise ValueError('Release has not been staged.')
    return release


def save():
    target = BACKUPS / datetime.datetime.now(datetime.timezone.utc).strftime('%Y%m%dT%H%M%S%fZ')
    target.mkdir(parents=True, mode=0o700)
    shutil.copytree(CONFIG, target / 'config')
    (target / 'release').write_text(str((PREFIX / 'current').resolve()))
    for unit in (SERVICE, TUNNEL):
        drop = SYSTEMD / (unit + '.service.d')
        if drop.is_dir():
            shutil.copytree(drop, target / drop.name)
    return target


def point(release):
    next_link = PREFIX / 'next'
    next_link.unlink(missing_ok=True)
    next_link.symlink_to(release)
    next_link.replace(PREFIX / 'current')


def restore_config(saved):
    shutil.rmtree(CONFIG)
    shutil.copytree(saved / 'config', CONFIG)
    for unit in (SERVICE, TUNNEL):
        directory = SYSTEMD / (unit + '.service.d')
        if directory.exists():
            shutil.rmtree(directory)
        if (saved / directory.name).exists():
            shutil.copytree(saved / directory.name, directory)
    run('systemctl', 'daemon-reload')


def verify():
    # Official SDK clients, independent cookies, real public matchmaking/WSS,
    # explicit Ready/Start and replicated movement/fire/reload. No health-only PASS.
    env = {'PATH':'/usr/bin:/bin', 'LANG':'C.UTF-8'}
    line = next(line for line in (CONFIG / 'invite.env').read_text().splitlines() if line.startswith('CS2_PILOT_INVITE='))
    env.update(CS2_PILOT_INVITE=line.split('=', 1)[1].strip().strip('"\''), CS2_PILOT_URL=origin(), CS2_PILOT_CLIENTS='2', CS2_PILOT_CONTRACT_URL=(PREFIX / 'current/shared/multiplayer/build.mjs').resolve().as_uri())
    env.pop('CS2_PILOT_LOOPBACK_PORT', None)
    uid, gid = service_identity()
    result = subprocess.run(['/usr/bin/node', 'tools/network-pilot-probe.mjs'], cwd=MANAGER_ROOT,
                            env=env, user=uid, group=gid, extra_groups=(), capture_output=True, text=True, timeout=90)
    # Only the deliberately redacted machine-readable report may reach stdout.
    reports = []
    for line in result.stdout.splitlines():
        try:
            row = json.loads(line)
            if row.get('status') == 'PASS' and row.get('clients') == 2:
                reports.append(row)
        except (ValueError, AttributeError):
            pass
    if result.returncode or not reports:
        raise RuntimeError('Public gameplay verification failed; credential-bearing diagnostics suppressed.')
    print(json.dumps(reports[-1]))


def wait_ready():
    for _ in range(30):
        try:
            if health()['status'] == 'ok':
                return
        except Exception:
            pass
        time.sleep(.5)
    raise RuntimeError('Online service did not become ready.')


def account_capable(release):
    return (release / 'server/account-backup.mjs').is_file()


def service_identity():
    pid = int(run('systemctl', 'show', SERVICE, '--property=MainPID', '--value').stdout)
    status = Path(f'/proc/{pid}').stat()
    if pid <= 0 or not status.st_uid or not status.st_gid:
        raise RuntimeError('Expected an unprivileged authority process.')
    return status.st_uid, status.st_gid


def private_state_paths():
    # The running unit is authoritative, including EnvironmentFile overrides.
    # Only these two non-secret file paths leave the process environment.
    pid = int(run('systemctl', 'show', SERVICE, '--property=MainPID', '--value').stdout)
    if pid <= 0:
        raise RuntimeError('Read the private state paths while the existing service is running.')
    fields = dict(item.split(b'=', 1) for item in Path(f'/proc/{pid}/environ').read_bytes().split(b'\0') if b'=' in item)
    family = Path(os.fsdecode(fields[b'CS2_FAMILY_ROOM_STATE']))
    account = Path(os.fsdecode(fields.get(b'CS3_ACCOUNT_DB', os.fsencode(family.with_name('cs3-accounts.sqlite')))))
    expected = FAMILY.resolve(strict=True)
    if (family.resolve() != expected / 'settings.json' or account.resolve() != expected / 'cs3-accounts.sqlite'
            or not stat.S_ISREG(family.lstat().st_mode) or family == account):
        raise RuntimeError('Unexpected private family or account location for this installation.')
    return family, account


def replace_family(source, destination, owner):
    if destination.exists() or destination.is_symlink():
        if not stat.S_ISREG(destination.lstat().st_mode):
            destination.rename(destination.with_name(destination.name + '.quarantine-' + secrets.token_hex(6)))
        elif source.read_bytes() == destination.read_bytes():
            return
    fd, name = tempfile.mkstemp(dir=destination.parent, prefix='.family-recovery-')
    staged = Path(name)
    try:
        with os.fdopen(fd, 'wb') as writer:
            writer.write(source.read_bytes())
            writer.flush()
            os.fchown(writer.fileno(), *owner)
            os.fsync(writer.fileno())
        staged.replace(destination)
        directory = os.open(destination.parent, os.O_RDONLY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        staged.unlink(missing_ok=True)


def prepare_older_family(source, target, paths, snapshot, owner):
    # Keep original cold bytes under root ownership. Give only a disposable
    # copy to the converter under the same unprivileged identity as the game.
    cold = snapshot / 'original'
    cold.mkdir(parents=True, mode=0o700)
    files = [(paths[0], 'settings.json')]
    for journal in ['', '.pending.sqlite']:
        for sidecar in ['', '-wal', '-shm', '-journal']:
            suffix = journal + sidecar
            path = Path(str(paths[1]) + suffix)
            if path.exists() or path.is_symlink():
                files.append((path, 'accounts.sqlite' + suffix))
    for path, name in files:
        if not stat.S_ISREG(path.lstat().st_mode):
            raise RuntimeError('Expected regular private state files.')
        shutil.copyfile(path, cold / name)
    with tempfile.TemporaryDirectory(dir='/var/tmp', prefix='cs3-convert-') as work:
        directory = Path(work)
        for file in cold.iterdir():
            copied = directory / file.name
            shutil.copyfile(file, copied)
            os.chown(copied, *owner)
        os.chown(directory, *owner)
        subprocess.run(['/usr/bin/node', str(MANAGER_ROOT / 'deploy/online/prepare-rollback.mjs'),
                        str(source), str(target), str(directory / 'settings.json'), str(directory / 'accounts.sqlite'),
                        str(directory / 'verified')], user=owner[0], group=owner[1], extra_groups=(), cwd='/',
                       env={'PATH':'/usr/bin:/bin','LANG':'C.UTF-8'}, check=True, capture_output=True, timeout=120)
        for name in ['receipt.json','family.for-target.json','verified.sqlite']:
            file = directory / 'verified' / name
            if name == 'verified.sqlite' and not (cold / 'accounts.sqlite').exists():
                continue
            if not stat.S_ISREG(file.lstat().st_mode):
                raise RuntimeError('Expected a regular recovery result.')
            shutil.copyfile(file, snapshot / name)
    replace_family(snapshot / 'family.for-target.json', paths[0], owner)


def pending_path():
    return BACKUPS.parent / 'cutover-pending.json'


def store_transition(record, phase):
    record['phase'] = phase
    target = pending_path()
    staged = target.with_suffix('.new')
    with staged.open('w') as file:
        json.dump(record, file)
        file.flush()
        os.fsync(file.fileno())
    staged.replace(target)
    directory = os.open(target.parent, os.O_RDONLY)
    try:
        os.fsync(directory)
    finally:
        os.close(directory)


def recovery_paths(record):
    previous = revision(record['previous'])
    candidate = revision(record['candidate'])
    saved = BACKUPS / record['backup']
    if saved.resolve().parent != BACKUPS.resolve() or not saved.is_dir():
        raise RuntimeError('Private cutover record does not identify a backup.')
    return previous, candidate, saved


def restore_previous(record):
    previous, candidate, saved = recovery_paths(record)
    owner = record['owner']
    paths = FAMILY / 'settings.json', FAMILY / 'cs3-accounts.sqlite'
    run('systemctl', 'stop', SERVICE)
    try:
        if owner and account_capable(candidate) and not account_capable(previous) and (PREFIX / 'current').resolve() == candidate:
            prepare_older_family(candidate, previous, paths, saved / ('failed-upgrade-' + secrets.token_hex(4)), owner)
        elif owner:
            replace_family(saved / 'family.before.json', paths[0], owner)
    except Exception:
        # Retain the in-place database and journal. A missing/invalid family
        # envelope must never prevent a known-good CS2 service from starting.
        if paths[0].is_file() and not paths[0].is_symlink():
            shutil.copyfile(paths[0], saved / 'family.failed-upgrade.json')
        replace_family(saved / 'family.before.json', paths[0], owner)
    finally:
        point(previous)
        run('systemctl', 'restart', SERVICE)
        wait_ready()
    store_transition(record, 'verify-restored')


def rollback_idle():
    try:
        state = health()
    except (OSError, ValueError):
        unit = run('systemctl', 'show', SERVICE, '--property=MainPID,ActiveState,SubState').stdout.splitlines()
        fields = dict(line.split('=',1) for line in unit)
        if fields['MainPID']=='0' and (fields['ActiveState'] in ['inactive','failed'] or fields['SubState']=='auto-restart'):
            return True
        raise RuntimeError('Authority census unavailable. Cutover saved; resume when the authority answers or is confirmed stopped.')
    return not state['players'] and not state['rooms']


def stable_rollback_idle():
    if not rollback_idle():
        return False
    time.sleep(1)
    return rollback_idle()


def recover_interrupted_fence():
    record = json.loads(pending_path().read_text())
    if record['phase'] != 'verify-restored':
        store_transition(record, 'rollback-pending')
        if stable_rollback_idle():
            restore_previous(record)


def resume_cutover():
    record = json.loads(pending_path().read_text())
    before, candidate, saved = recovery_paths(record)
    if (PREFIX / 'current').resolve() not in [candidate,before]:
        raise RuntimeError('Another release occupies the installation. Inspect the retained transition.')
    if record['phase'] != 'verify-restored':
        store_transition(record, 'rollback-pending')
        while True:
            if rollback_idle():
                with fence_admissions():
                    if stable_rollback_idle():
                        restore_previous(record)
                        break
            time.sleep(5)
    verify()
    (saved / 'rollback-verified').write_text(before.name + '\n')
    pending_path().unlink()


def activate(value):
    if pending_path().exists():
        raise RuntimeError('A cutover awaits recovery. Use the installed manager resume action.')
    release = revision(value)
    idle()
    previous = (PREFIX / 'current').resolve()
    if release == previous:
        verify()
        return
    saved = save()
    paths = private_state_paths() if account_capable(previous) or account_capable(release) else None
    owner = service_identity() if paths else None
    record = {'previous':previous.name, 'candidate':release.name, 'backup':saved.name, 'owner':owner}
    with fence_admissions():
        confirm_idle()
        if paths:
            shutil.copyfile(paths[0], saved / 'family.before.json')
        store_transition(record, 'switching')
        try:
            if account_capable(previous) and not account_capable(release):
                run('systemctl', 'stop', SERVICE)
                prepare_older_family(previous, release, paths, saved / 'downgrade', owner)
            point(release)
            run('systemctl', 'restart', SERVICE)
            wait_ready()
            expected = json.loads((release / 'shared/multiplayer/build.mjs').read_text().split('Object.freeze(', 1)[1].rsplit(')', 1)[0])
            if health()['contract'] != expected:
                raise RuntimeError('Client/server contract mismatch after activation.')
            store_transition(record, 'checking-public')
        except Exception:
            restore_previous(record)
            raise
    try:
        verify()
    except Exception:
        resume_cutover()
        raise
    link = PREFIX / 'previous'
    replacement = PREFIX / 'previous.next'
    replacement.unlink(missing_ok=True)
    replacement.symlink_to(previous)
    replacement.replace(link)
    (saved / 'activation-verified').write_text(release.name + '\n')
    pending_path().unlink()
    print('Activated reviewed release ' + value)


def revoke():
    idle()
    save()
    token = secrets.token_urlsafe(24)
    temporary = CONFIG / 'invite.new'
    temporary.write_text('CS2_PILOT_INVITE=' + token + '\n')
    temporary.chmod(0o600)
    temporary.replace(CONFIG / 'invite.env')
    private = CONFIG / 'invitation.txt'
    private.write_text(token)
    private.chmod(0o600)
    run('systemctl', 'restart', SERVICE)
    wait_ready()
    verify()
    print('Old invitations and sessions revoked. New code: /etc/cartridge-strike2-pilot/invitation.txt (root, 0600).')


def named_config(host, token_file):
    url = urlsplit(host)
    if url.scheme != 'https' or url.path not in ('', '/') or url.query or url.fragment or url.username or url.port or not re.fullmatch(r'[a-z0-9.-]+', url.hostname or '') or url.hostname.endswith('.trycloudflare.com'):
        raise ValueError('Expected the authorized stable HTTPS hostname, not a Quick Tunnel.')
    token = Path(token_file).read_text().strip()
    if not re.fullmatch(r'[A-Za-z0-9_+/=-]{40,4096}', token):
        raise ValueError('Invalid tunnel token file.')
    return url.scheme + '://' + url.hostname, token


def configure_named(host, token_file):
    host, token = named_config(host, token_file)
    idle()
    saved = save()
    try:
        (CONFIG / 'public-origin').write_text(host + '\n')
        (CONFIG / 'hosting.env').write_text('CS2_PUBLIC_ORIGIN=' + host + '\n')
        (CONFIG / 'tunnel-token').write_text(token)
        (CONFIG / 'tunnel-token').chmod(0o600)
        for unit, content in {
            SERVICE: '[Service]\nUnsetEnvironment=CS2_PUBLIC_ORIGIN_FILE\nEnvironmentFile=/etc/cartridge-strike2-pilot/hosting.env\n',
            TUNNEL: '[Unit]\nConditionPathExists=\n[Service]\nExecStart=\nLoadCredential=tunnel-token:/etc/cartridge-strike2-pilot/tunnel-token\nExecStart=/usr/bin/python3 ' + str(MANAGER_ROOT / 'deploy/online/tunnel.py') + ' %d/tunnel-token\nRestart=always\n',
        }.items():
            directory = SYSTEMD / (unit + '.service.d')
            directory.mkdir(exist_ok=True)
            (directory / 'named.conf').write_text(content)
        run('systemctl', 'daemon-reload')
        run('systemctl', 'restart', SERVICE, TUNNEL)
        wait_ready()
        deadline = time.monotonic() + 60
        while True:
            try:
                request = urllib.request.Request(host, headers={'User-Agent': 'CartridgeStrike2-Readiness/1.0', 'Accept': 'text/html'})
                with urllib.request.urlopen(request, timeout=5) as response:
                    if response.status == 200:
                        break
            except Exception:
                pass
            if time.monotonic() >= deadline:
                raise RuntimeError('The configured stable hostname did not become reachable.')
            time.sleep(2)
        verify()
    except Exception:
        restore_config(saved)
        run('systemctl', 'restart', SERVICE, TUNNEL)
        wait_ready()
        raise
    print('Named tunnel activated and public multiplayer verified. No expiry applies to the named service.')


def stop_public():
    idle()
    run('systemctl', 'disable', '--now', TUNNEL)
    print('Public tunnel stopped. Online authority and original port-2567 service are untouched.')


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('action', choices=['status', 'verify', 'activate', 'rollback', 'revoke', 'stop-public', 'configure-named', 'guard-fence', 'resume'])
    parser.add_argument('values', nargs='*')
    args = parser.parse_args()
    if args.action == 'status':
        print(json.dumps(health()))
        print('Release: ' + str((PREFIX / 'current').resolve()))
        print(run('systemctl', 'is-active', SERVICE, TUNNEL).stdout.strip())
        return
    if os.geteuid() != 0:
        raise RuntimeError('Use sudo for online service operations.')
    os.umask(0o077)
    require_installed_operations()
    if args.action == 'guard-fence':
        guard_fence(int(args.values[0]), args.values[1])
        return
    with LOCK.open('a') as lock:
        fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        operation(args)


def operation(args):
    if args.action == 'verify':
        verify()
    elif args.action == 'resume':
        resume_cutover()
    elif args.action == 'activate':
        activate(args.values[0])
    elif args.action == 'rollback':
        activate((PREFIX / 'previous').resolve().name)
    elif args.action == 'revoke':
        revoke()
    elif args.action == 'stop-public':
        stop_public()
    elif args.action == 'configure-named':
        configure_named(*args.values)


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Subprocess/HTTP exceptions may include secret headers or arguments.
        print(str(error) if isinstance(error, (ValueError, RuntimeError)) else type(error).__name__)
        raise SystemExit(1)
