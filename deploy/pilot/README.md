# Temporary Pi internet pilot

The game runs as a dedicated, unprivileged system service on IPv4 loopback port 2568. The pre-existing cartridge-strike2 service keeps its checkout and port 2567. Cloudflared publishes only port 2568 over an outbound tunnel. Game assets, the SDK, matchmaking and WSS use the same HTTPS origin. Two private rooms can each admit ten players with five seats per team.

## Prepare a release on the Pi

From a reviewed commit, install the locked dependencies and run the server, browser and SDK checks described in the [pilot results](../../docs/multiplayer/pass4/README.md). Run `deploy/pilot/stage-release.sh` as the checkout owner. It verifies the build and all manifest entries in a fresh archive, prunes development packages and installs a root-owned release at `/opt/cartridge-strike2-pilot/releases/<git-sha>`. The server uses the Debian host's `/usr/bin/node`.

Install the official ARM64 cloudflared binary in `/opt/cartridge-strike2-pilot/bin/cloudflared` with mode 0755 after checking its SHA-256 against the GitHub release digest. On this Pi the pilot used release 2026.11.1 with SHA-256 `b155cec3e48e489cfb8e5c602769fb8c771083018d8881d68b4d18a791567c5a`. No router changes are required. [Cloudflare downloads](https://developers.cloudflare.com/tunnel/downloads/)

A first installation needs a root-owned directory `/etc/cartridge-strike2-pilot` (0755) and `invite.env` (root, 0600). Generate its single setting, `CS2_PILOT_INVITE`, with Python's `secrets.token_urlsafe(24)`. Keep the value off GitHub. Changing it and restarting the pilot service revokes previous login sessions.

Install the four systemd units from this directory under `/etc/systemd/system/`, run `sudo systemctl daemon-reload`, then activate the release as follows from the release checkout. Stop the connector before changing the running release. A restart disconnects active players.

```sh
prefix=/opt/cartridge-strike2-pilot
revision=$(git rev-parse HEAD)
sudo ln -sfn "$prefix/releases/$revision" "$prefix/next"
sudo mv -Tf "$prefix/next" "$prefix/current"
sudo systemctl enable cartridge-strike2-pilot
sudo systemctl restart cartridge-strike2-pilot
```

For the origin preflight, stop the connector and place `https://pilot.example.test` in `/run/cartridge-strike2-tunnel/origin` (readable by the pilot service). Use the release checkout with its development dependencies installed.

```sh
CS2_PILOT_URL=https://pilot.example.test CS2_PILOT_LOOPBACK_PORT=2568 \
  CS2_PILOT_INVITE="$(sudo cut -d= -f2 /etc/cartridge-strike2-pilot/invite.env)" \
  node tools/network-pilot-probe.mjs
```

A successful probe covers invite login and two real SDK players. The browser counterpart `node tools/network-pilot-browser.mjs` sets up an ephemeral local HTTPS proxy and runs two Chromium players through the game UI. The Pi uses `CHROMIUM_PATH=/usr/bin/chromium FPS_NETWORK_ANGLE=gl-egl FPS_NETWORK_DPR=0.5`.

## Start the verified pilot

Choose an absolute expiry and save it as Unix seconds in `/etc/cartridge-strike2-pilot/until` (0644). For a 24-hour session:

```sh
date --date='+24 hours' +%s | sudo tee /etc/cartridge-strike2-pilot/until >/dev/null
sudo systemctl enable --now cartridge-strike2-tunnel cartridge-strike2-pilot-check.timer
cat /run/cartridge-strike2-tunnel/origin
```

On startup the connector clears the old origin and publishes the exact hostname Cloudflare assigns. The game denies public access until it can validate this origin. The wrapper closes the connector at expiry. Its deadline survives a reboot. Systemd restarts failed processes. Transport interruptions can recover inside the same cloudflared process. A new Quick Tunnel process receives a new URL, which must be shared again. A stable hostname requires a named tunnel with a Cloudflare-managed hostname. [Quick Tunnel lifecycle](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/)

Run the SDK probe again with the actual HTTPS origin in `CS2_PILOT_URL` and the loopback override unset. The browser runner accepts `CS2_PILOT_URL` and `CS2_PILOT_INVITE_FILE` pointing to a private one-line secret file. It verifies independently authenticated browsers in the same room, accepted player input and replicated remote state over WSS. Both runners need the development dependencies. Use the revision deployed to the Pi.

## Monitor, stop and roll back

```sh
systemctl status cartridge-strike2-pilot cartridge-strike2-tunnel
systemctl list-timers cartridge-strike2-pilot-check.timer
journalctl -u cartridge-strike2-pilot-check.service -u cartridge-strike2-tunnel --since today
curl -fsS http://127.0.0.1:2568/health
```

The two-minute timer checks the local authority and tunnel edge readiness. Its failures go to the journal. Run the gameplay probe after a release or tunnel change. Check the local room/player counts before scheduling an interruption.

To end the pilot or return to the previous service:

```sh
sudo systemctl disable --now cartridge-strike2-tunnel cartridge-strike2-pilot-check.timer
sudo systemctl disable --now cartridge-strike2-pilot
systemctl is-active cartridge-strike2
```

For a previous *pilot* release, stop the connector, change the `current` symlink using the activation steps, restart the authority, repeat the local preflight, then start the tunnel if the deadline still permits it. The separate original service remains available throughout. Physical device play requires the phone and friend to open the current URL and enter the pilot invite. The host selects **Skapa rum**, chooses a private room code and shares that code plus the displayed room ID. The friend selects **Anslut** and both players select **Fortsätt**.
