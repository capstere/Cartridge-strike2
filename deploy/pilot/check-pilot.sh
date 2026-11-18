#!/bin/sh
set -eu
# Deadline survives reboots. An expired or deliberately rolled back pilot is idle.
until_file=/etc/cartridge-strike2-pilot/until
[ -f "$until_file" ] && [ "$(date +%s)" -lt "$(cat "$until_file")" ] || exit 0
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:2568/health >/dev/null
/usr/bin/curl -fsS --max-time 5 http://127.0.0.1:20246/ready >/dev/null
test -s /run/cartridge-strike2-tunnel/origin
