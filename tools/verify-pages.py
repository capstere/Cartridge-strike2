"""Compare a built Pages output with its public manifest, including unexpected files."""
import hashlib
import json
from pathlib import Path
import sys

source, site = (Path(arg).resolve(strict=True) for arg in sys.argv[1:])
marker = source/'deploy/online/pages-recovery.json'
recovery = json.loads(marker.read_text()) if marker.exists() else None
prefix = 'cs2-recovery/' if recovery else ''
manifest = (source / prefix / 'build-info.json').read_bytes()
if recovery:
    assert hashlib.sha256(manifest).hexdigest() == recovery['manifestSha256']
entries = json.loads(manifest)['files']
expected = {prefix+entry['path']: entry['sha256'] for entry in entries}
assert len(expected) == len(entries)
expected[prefix+'build-info.json'] = hashlib.sha256(manifest).hexdigest()
if recovery:
    expected.update(recovery['entries'])
actual = {}
for path in site.rglob('*'):
    assert not path.is_symlink(), path
    if path.is_file():
        actual[path.relative_to(site).as_posix()] = hashlib.sha256(path.read_bytes()).hexdigest()
assert actual.keys() == expected.keys(), sorted(actual.keys() ^ expected.keys())
for name, digest in expected.items():
    assert actual[name] == digest, name
print(f'Verified all {len(actual)} public paths and digests.')
