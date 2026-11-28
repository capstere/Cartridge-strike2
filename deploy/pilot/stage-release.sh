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
    ops="/opt/cartridge-strike2-pilot/operations/$revision"
    sudo -n install -d -m 0755 "$(dirname "$ops")"
    privileged=(sudo -n)
elif [[ $# == 2 && $1 == --export-to && $2 == /* ]]; then
    release=$2
    ops="$release.ops"
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
mkdir -p "$workspace/ops"/{deploy/online,tools,server}
cp "$workspace/source"/deploy/online/{manage.py,prepare-rollback.mjs,tunnel.py} "$workspace/ops/deploy/online/"
cp "$workspace/source/tools/network-pilot-probe.mjs" "$workspace/ops/tools/"
ln -s "$release/server/node_modules" "$workspace/ops/server/node_modules"
printf '%s\n' "$revision" > "$workspace/ops/REVISION"
publish_tree() {
    local source=$1 target=$2
    if ! "${privileged[@]}" test -e "$target"; then
        incoming=$("${privileged[@]}" mktemp -d "$(dirname "$target")/.incoming.XXXXXXXX")
        "${privileged[@]}" cp -a "$source/." "$incoming/"
        if (( ${#privileged[@]} )); then sudo -n chown -Rh root:root "$incoming"; fi
        "${privileged[@]}" chmod 0755 "$incoming"
        "${privileged[@]}" mv -Tn "$incoming" "$target"
        "${privileged[@]}" rm -rf -- "$incoming"
        incoming=''
    fi
    "${privileged[@]}" diff --no-dereference -qr "$source" "$target"
    if (( ${#privileged[@]} )); then
        if [[ -n "$(sudo -n find -P "$target" \( ! -uid 0 -o ! -gid 0 -o \( ! -type l -perm /022 \) \) -print -quit)" ]]; then
            echo "Expected a root-owned, read-only deployment tree." >&2
            return 1
        fi
    fi
}
publish_tree "$workspace/pilot" "$release"
publish_tree "$workspace/ops" "$ops"
echo "Verified $revision at $release with operations at $ops"
