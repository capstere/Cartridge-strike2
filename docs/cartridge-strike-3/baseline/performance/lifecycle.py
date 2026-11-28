"""Run the original tab-switch, cleanup, GPU and 20-cycle assertions on the Pi EGL driver."""
import functools
import json
from datetime import datetime, timezone
import http.server
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

repo = Path.cwd()
destination = Path(sys.argv[1]).resolve()
destination.parent.mkdir(parents=True, exist_ok=True)
identity = {
    "revision": subprocess.check_output(["git", "rev-parse", "HEAD"], text=True).strip(),
    "browser": subprocess.check_output(["chromium", "--version"], text=True).strip(),
    "startedAt": datetime.now(timezone.utc).isoformat(),
    "viewport": [844, 390],
    "physicalPhone": False,
    "backendRequest": "native Wayland EGL",
}
with tempfile.TemporaryDirectory(prefix="cs3-lifecycle-driver-") as work:
    env = dict(os.environ, WAYLAND_DISPLAY="wayland-0")
    class Server(http.server.ThreadingHTTPServer):
        request_queue_size = 128

    class Handler(http.server.SimpleHTTPRequestHandler):
        protocol_version = "HTTP/1.1"
        def log_message(self, *args):
            pass

    service = Server(("127.0.0.1", 0), functools.partial(Handler, directory=str(repo)))
    env.update(FPS_TEST_ORIGIN=f"http://127.0.0.1:{service.server_port}", FPS_LIFECYCLE_JSON=str(destination))
    suite = repo / "tools/match-lifecycle-browser.mjs"
    source = suite.read_text(encoding="utf-8")
    expected = ("chromium.executablePath(),['--headless=new'", "  await page.goto", "    await cover.bringToFront();")
    if any(source.count(marker) != 1 for marker in expected):
        raise RuntimeError("The upstream lifecycle launcher changed. Review the Pi adapter before running.")
    module = (repo / "frontline/source/tools/dev/node_modules/playwright-core/index.mjs").as_uri()
    source = source.replace("../frontline/source/tools/dev/node_modules/playwright-core/index.mjs", module)
    source = source.replace("chromium.executablePath(),['--headless=new'", """'/usr/bin/chromium',[
      '--no-sandbox','--disable-dev-shm-usage','--password-store=basic','--use-mock-keychain',
      '--disable-background-networking','--no-proxy-server','--ozone-platform=wayland','--use-angle=gl-egl',
      '--host-resolver-rules=MAP * ~NOTFOUND, EXCLUDE 127.0.0.1, EXCLUDE localhost'""")
    source = source.replace("  await page.goto", """  page.on('requestfailed',r=>console.log('Request failed',new URL(r.url()).pathname,r.failure()?.errorText));
  page.on('domcontentloaded',()=>console.log('Document loaded'));
  page.setDefaultNavigationTimeout(120000);
  await page.goto""")
    source = source.replace("    await cover.bringToFront();", """    await cover.bringToFront();
    if(i===-3)console.log('After switch',await page.evaluate(()=>[document.visibilityState,document.hasFocus(),__fps.game.state.paused]));""")
    adapted = Path(work) / "match-lifecycle.mjs"
    adapted.write_text(source, encoding="utf-8")
    thread = threading.Thread(target=service.serve_forever, daemon=True)
    thread.start()
    try:
        subprocess.run(["node", str(adapted)], env=env, check=True)
        identity["completedAt"] = datetime.now(timezone.utc).isoformat()
        destination.with_suffix(".meta.json").write_text(json.dumps(identity, indent=2) + "\n")
    finally:
        service.shutdown()
        thread.join()
        service.server_close()
