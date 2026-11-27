"""Run the original tab-switch, cleanup, GPU and 20-cycle assertions on the Pi EGL driver."""
import functools
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
with tempfile.TemporaryDirectory(prefix="cs3-lifecycle-driver-") as work:
    env = dict(os.environ, PLAYWRIGHT_BROWSERS_PATH=work, WAYLAND_DISPLAY="wayland-0")
    class Handler(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass

    service = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Handler, directory=str(repo)))
    env.update(FPS_TEST_ORIGIN=f"http://127.0.0.1:{service.server_port}", FPS_LIFECYCLE_JSON=str(destination))
    exe = subprocess.check_output(["node", "-p", "require('./frontline/source/tools/dev/node_modules/playwright-core').chromium.executablePath()"], env=env, text=True).strip()
    path = Path(exe)
    if not path.is_relative_to(work):
        raise RuntimeError("Refusing to write to the user's browser installation")
    path.parent.mkdir(parents=True)
    path.write_text("""#!/bin/bash
args=()
for arg; do
  if [[ $arg != --headless=new ]]; then args+=("$arg"); fi
done
exec /usr/bin/chromium --ozone-platform=wayland --use-angle=gl-egl "${args[@]}"
""")
    path.chmod(0o700)
    thread = threading.Thread(target=service.serve_forever, daemon=True)
    thread.start()
    try:
        subprocess.run(["node", "tools/match-lifecycle-browser.mjs"], env=env, check=True)
    finally:
        service.shutdown()
        thread.join()
        service.server_close()
