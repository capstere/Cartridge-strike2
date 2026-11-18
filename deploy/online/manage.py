#!/usr/bin/env python3
"""Operate only the isolated online service. Never print credentials."""
import argparse
import datetime
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import subprocess
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


def run(*args):
    return subprocess.run(args, check=True, capture_output=True, text=True)


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
    env = os.environ.copy()
    line = next(line for line in (CONFIG / 'invite.env').read_text().splitlines() if line.startswith('CS2_PILOT_INVITE='))
    env.update(CS2_PILOT_INVITE=line.split('=', 1)[1].strip().strip('"\''), CS2_PILOT_URL=origin(), CS2_PILOT_CLIENTS='2', CS2_PILOT_CONTRACT_URL=(PREFIX / 'current/shared/multiplayer/build.mjs').resolve().as_uri())
    env.pop('CS2_PILOT_LOOPBACK_PORT', None)
    result = subprocess.run(['/usr/bin/node', 'tools/network-pilot-probe.mjs'], cwd=MANAGER_ROOT, env=env, capture_output=True, text=True, timeout=90)
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


def activate(value):
    release = revision(value)
    idle()
    previous = (PREFIX / 'current').resolve()
    save()
    try:
        point(release)
        run('systemctl', 'restart', SERVICE)
        wait_ready()
        expected = json.loads((release / 'shared/multiplayer/build.mjs').read_text().split('Object.freeze(', 1)[1].rsplit(')', 1)[0])
        if health()['contract'] != expected:
            raise RuntimeError('Client/server contract mismatch after activation.')
        verify()
    except Exception:
        point(previous)
        run('systemctl', 'restart', SERVICE)
        wait_ready()
        raise
    link = PREFIX / 'previous'
    link.unlink(missing_ok=True)
    link.symlink_to(previous)
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
                with urllib.request.urlopen(host, timeout=5) as response:
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
    parser.add_argument('action', choices=['status', 'verify', 'activate', 'rollback', 'revoke', 'stop-public', 'configure-named'])
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
    if args.action == 'verify':
        verify()
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
