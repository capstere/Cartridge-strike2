#!/usr/bin/env python3
"""Named Cloudflare connector; suppress request URLs and credential diagnostics."""
import asyncio
import sys


async def main():
    proc = await asyncio.create_subprocess_exec(
        '/opt/cartridge-strike2-pilot/bin/cloudflared', 'tunnel', '--no-autoupdate',
        '--metrics', '127.0.0.1:20246', '--grace-period', '3s', 'run',
        '--token-file', sys.argv[1], stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    try:
        while line := await proc.stdout.readline():
            if b'Registered tunnel connection' in line:
                print('Named tunnel connected', flush=True)
            elif b' ERR ' in line:
                print('Named connector reported an error; check local readiness metrics', flush=True)
        return await proc.wait()
    finally:
        if proc.returncode is None:
            proc.terminate()
            await proc.wait()


if __name__ == '__main__':
    raise SystemExit(asyncio.run(main()))
