"""Publish cloudflared's assigned origin atomically and expire this temporary pilot."""
import asyncio
import os
from pathlib import Path
import re
import time

CLOUDFLARED = "/opt/cartridge-strike2-pilot/bin/cloudflared"
ORIGIN = Path("/run/cartridge-strike2-tunnel/origin")
DEADLINE = Path("/etc/cartridge-strike2-pilot/until")
# Use only the generated URL line, never a URL from a request/error log.
ASSIGNMENT = re.compile(r"\|\s*(https://[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.trycloudflare\.com)\s*\|")


async def run():
    ORIGIN.unlink(missing_ok=True)
    deadline = int(DEADLINE.read_text().strip())
    if time.time() >= deadline:
        return 0

    proc = await asyncio.create_subprocess_exec(
        CLOUDFLARED, "tunnel", "--no-autoupdate", "--metrics", "127.0.0.1:20246",
        "--grace-period", "3s", "--url", "http://127.0.0.1:2568",
        stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.STDOUT)
    published = False
    try:
        while True:
            remaining = deadline - time.time()
            if remaining <= 0:
                break
            try:
                line = await asyncio.wait_for(proc.stdout.readline(), timeout=min(remaining, 60))
            except asyncio.TimeoutError:
                if not published and time.time() < deadline:
                    print("Tunnel assignment timed out", flush=True)
                    return 1
                continue
            if not line:
                return 1
            msg = line.decode(errors="replace")
            match = ASSIGNMENT.search(msg)
            if not published and match:
                tmp = ORIGIN.with_suffix(".new")
                tmp.write_text(match[1] + "\n")
                os.replace(tmp, ORIGIN)
                published = True
                print("Assigned pilot origin " + match[1], flush=True)
            # Request failures may contain WebSocket seat tokens in their URLs.
            if "Registered tunnel connection" in msg:
                print("Cloudflare edge connected", flush=True)
            elif " ERR " in msg:
                print("cloudflared reported an error", flush=True)
    finally:
        ORIGIN.unlink(missing_ok=True)
        if proc.returncode is None:
            proc.terminate()
        await proc.wait()
    print("Temporary pilot expired", flush=True)
    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(run()))
