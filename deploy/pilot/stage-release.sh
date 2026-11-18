#!/bin/bash
# Run as the checkout owner, from any location in a verified, committed checkout.
# Stages a release only. Activation, tunnel publication and rollback are separate.
set -euo pipefail
umask 022
repo=$(git rev-parse --show-toplevel)
revision=$(git -C "$repo" rev-parse --verify HEAD^{commit})
prefix=/opt/cartridge-strike2-pilot
release="$prefix/releases/$revision"
if sudo test -e "$release"; then
    echo "Release already staged at $release"
    exit 0
fi
staging=$(mktemp -d)
trap 'rm -rf -- "$staging"' EXIT
git -C "$repo" archive "$revision" | tar -x -C "$staging"
(
    cd "$staging"
    npm ci --prefix server --ignore-scripts --no-audit --no-fund
    node tools/build-network.mjs --check
    node tools/verify-owner-runtime.mjs
    npm prune --prefix server --omit=dev --ignore-scripts --no-audit --no-fund
)
sudo install -d -m 0755 "$prefix/releases"
incoming=$(sudo mktemp -d "$prefix/releases/.incoming.XXXXXXXX")
trap 'rm -rf -- "$staging"; sudo rm -rf -- "$incoming"' EXIT
sudo cp -a "$staging/." "$incoming/"
sudo chown -R root:root "$incoming"
sudo chmod 0755 "$incoming"
sudo mv -T "$incoming" "$release"
echo "Verified and staged $release"
