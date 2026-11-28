#!/bin/bash
# Run inside the reviewed checkout. Only the dependency-closed distribution
# crosses from the temporary build workspace into a versioned release.
set -euo pipefail
umask 022
repo=$(git rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse --verify 'HEAD^{commit}')
prefix=/opt/cartridge-strike2-pilot/releases
if (( $# == 0 )); then
    sudo -n install -d -m 0755 "$prefix"
    release="$prefix/$revision"
    privileged=(sudo -n)
elif [[ $# == 2 && $1 == --export-to && $2 == /* ]]; then
    release=$2
    privileged=()
else
    echo 'Usage: bash deploy/pilot/stage-release.sh [--export-to /absolute/stage]' >&2
    exit 2
fi
workspace=$(mktemp -d)
incoming=''
cleanup() {
    rm -rf -- "$workspace"
    if [[ -n "$incoming" ]]; then "${privileged[@]}" rm -rf -- "$incoming"; fi
}
trap cleanup EXIT
mkdir "$workspace/source"
git -C "$repo" archive "$revision" -- . ':(exclude)frontline' ':(exclude)IMG_*.PNG' \
    ':(exclude,icase)*.zip' ':(exclude)docs/cartridge-strike-3/evidence' | tar -x -C "$workspace/source"
(
    cd "$workspace/source"
    npm ci --prefix server --prefer-offline --ignore-scripts --no-audit --no-fund
    node tools/build-network.mjs --check
    node tools/verify-owner-runtime.mjs
    node tools/runtime-distribution.mjs pilot "$workspace/pilot"
)
npm ci --prefix "$workspace/pilot/server" --offline --omit=dev --ignore-scripts --no-audit --no-fund
if "${privileged[@]}" test -e "$release"; then
    "${privileged[@]}" diff --no-dereference -qr "$workspace/pilot" "$release"
else
    incoming=$("${privileged[@]}" mktemp -d "$(dirname "$release")/.incoming.XXXXXXXX")
    "${privileged[@]}" cp -a "$workspace/pilot/." "$incoming/"
    if (( ${#privileged[@]} )); then sudo -n chown -R root:root "$incoming"; fi
    "${privileged[@]}" chmod 0755 "$incoming"
    # Concurrent attempts can stage the same immutable revision. Never replace it.
    "${privileged[@]}" mv -Tn "$incoming" "$release"
    "${privileged[@]}" diff --no-dereference -qr "$workspace/pilot" "$release"
fi
echo "Verified $revision at $release"
