"""Check ordinary and revalidated production Pages URLs against the reviewed public bytes."""
import argparse
import datetime
import hashlib
import json
from pathlib import Path
import subprocess
import urllib.error
import urllib.parse
import urllib.request

SITE = 'https://capstere.github.io/Cartridge-strike2/'


def request(path, method, revision=None):
    url = SITE + urllib.parse.quote(path, safe='/')
    if revision:
        url += '?release=' + revision
    req = urllib.request.Request(url, method=method, headers={
        'User-Agent': 'CartridgeStrike-Release-Check/1.0', 'Accept-Encoding': 'identity'})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            digest = hashlib.sha256(response.read()).hexdigest() if method == 'GET' else None
            return response.status, digest
    except urllib.error.HTTPError as error:
        return error.code, None


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('checkout', type=Path)
    parser.add_argument('new_receipt', type=Path)
    args = parser.parse_args()
    root = args.checkout.resolve(strict=True)
    revision = subprocess.check_output(['git', '-C', root, 'rev-parse', 'HEAD'], text=True).strip()
    manifest = (root / 'build-info.json').read_bytes()
    files = {entry['path']: entry['sha256'] for entry in json.loads(manifest)['files']}
    files['build-info.json'] = hashlib.sha256(manifest).hexdigest()
    routes = {'': 'index.html', 'fps/': 'fps/index.html'}
    for path in ['build-info.json', 'src/fps/app.mjs', 'src/fps/match-flow.mjs', 'shared/multiplayer/build.mjs',
                 'fps/match-loading.css', 'assets/fps/maps/meltem.webp', 'credits.html']:
        routes[path] = path
    screenshots = sorted(root.glob('IMG_*.PNG'))
    recordings = sorted(root.glob('ScreenRecording*.zip'))
    if len(screenshots) != 16 or len(recordings) != 5:
        raise ValueError('The reviewed upload inventory has changed.')
    excluded = [path.name for path in screenshots + recordings] + [
        'frontline/source/src/99-start.js', 'server/account-store.mjs', 'deploy/online/manage.py']
    checks = []
    for fresh in [False, True]:
        query = revision if fresh else None
        for path, owner in routes.items():
            status, digest = request(path, 'GET', query)
            checks.append(dict(path=path or '/', freshURL=fresh, status=status, sha256=digest,
                               passed=status == 200 and digest == files[owner]))
        for path in excluded:
            status, _ = request(path, 'HEAD', query)
            checks.append(dict(path=path, freshURL=fresh, status=status, passed=status in [403, 404, 410]))
    passed = all(row['passed'] for row in checks)
    receipt = dict(utc=datetime.datetime.now(datetime.timezone.utc).isoformat(),
                   reviewedRevision=revision, site=SITE, checks=checks, passed=passed)
    with args.new_receipt.open('x') as out:
        json.dump(receipt, out, indent=2)
        out.write('\n')
    print(json.dumps(dict(revision=revision, passed=passed, checks=len(checks),
                          failed=[row['path'] for row in checks if not row['passed']])))
    return 0 if passed else 1


if __name__ == '__main__':
    raise SystemExit(main())
