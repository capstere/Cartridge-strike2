# CS3-12 multiplayer staging

The public and pilot exporters ran against the published release tree at `0e0346c0833b05d308d630beaa24447af1abf90e`. Both yielded manifest SHA-256 `065b531e6b97545315ef5497ebaaa0880f9656d7e6e687b7d3d5a750fb23084f`, containing 727 public files. The pilot added 27 private files. The isolated pilot installed its 90 locked production packages from the offline npm cache. The candidate ran build `8dc2a53ff714cb321129cf8f5e4c0b41bef0c4239baf18a2608731512b8cc1fc`, protocol 22.

| Player journey | Observed result |
| --- | --- |
| Cold and returning public entry | The exported Pages project path opened Play → With friends using a pinned loopback HTTPS static server. On repeat navigation, 248 of 250 resources came from the browser cache. The service worker stored only the public offline page. The stable quick-join destination was inspected without contacting production. |
| Cold and returning private entry | Both clients signed in through the actual server invite form over a temporary internet HTTPS tunnel. A signed-out request for the protected build returned 401. Signed-in requests returned 200 with private, no-store headers. Returning entry fetched the live resources again, with zero private responses in Cache Storage. All four navigations used English. |
| Two rendered clients | Separate Chromium processes joined the same family lobby, readied up, and entered Compact Arena. The host observed the guest's touch fire decrease magazine ammunition from 30 to 29. Both exchanged WSS frames with the external edge. |
| Transport loss | The isolated authority terminated the guest’s socket. Both clients kept playing, and the host saw the same guest actor, life 3, match 1, advance from control epoch 1 to 2. The guest resumed and fired again, decreasing ammunition to 28. |
| Leave and return | The other player received forfeit results. The host left results, reopened the remembered family room and left it. Local authority health returned to zero rooms and zero players. |
| Mixed release reconnect | The real CS2 protocol 14 SDK connected to an isolated copy of CS2 release `8307e91118dba4fdca964012d2b0c247a40221fd`. The browser remained open while the same pinned HTTPS origin changed to CS3. Its original WSS connection and 12 retry attempts yielded no stale seat. Its old session received 401. After fresh sign-in, the previous client contract received an explicit incompatible protocol response. Reloading the current SDK and contract successfully admitted one fresh player. |

The Pi ran Chromium 156 with native Broadcom V3D and two independent touch-emulated viewports of 844 × 390 and 800 × 450. These results cover emulated device input. Physical phones and production Pages propagation are separate release observations. The tunnel, private family state, account database and test credentials were disposable.

The [browser receipt](network-browser.json) includes renderers, per-navigation cache counts, WSS traffic and the host’s replicated state. The [version receipt](network-versions.json) records both build hashes and the stale-session outcome.

## Reproduce

From a checkout of the desired candidate, install the locked server development tools and provision Playwright according to the repository browser test instructions. Use a fresh private directory per run. On the Pi, use the existing single renderer slot and a V3D-capable Wayland session.

```sh
umask 077
exports=$(mktemp -d)
node tools/runtime-distribution.mjs pilot "$exports/pilot"
node tools/runtime-distribution.mjs public "$exports/site"
npm ci --offline --prefix "$exports/pilot/server" --omit=dev --ignore-scripts --no-audit --no-fund
CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_HEADED=1 FPS_NETWORK_ANGLE=gl-egl \
  CLOUDFLARED=/opt/cartridge-strike2-pilot/bin/cloudflared \
  node tools/release-network-browser.mjs "$exports" "$exports/browser-receipts" internet
CHROMIUM_PATH=/usr/bin/chromium node tools/release-network-versions.mjs \
  "$PREVIOUS_DISPOSABLE_RUNTIME" "$exports/pilot" "$exports/version-receipts"
```

For the local transport variant, replace the last browser argument with `loopback`. The previous disposable runtime requires the manifest-verified production files, its matching server modules, vendor loader and pinned production dependencies. The rehearsal copied only these runtime files from the read-only CS2 release and verified the 528 original public file digests. Neither command uses service-manager credentials or the production database.
