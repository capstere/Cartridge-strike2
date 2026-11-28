"""Materialize a clean, reviewable CS2 recovery checkout without touching another branch."""
import argparse
import hashlib
import json
from pathlib import Path
import shutil
import subprocess

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('previous', help='Verified pre-release main SHA')
parser.add_argument('base', help='Commit to base the separate recovery PR on')
parser.add_argument('new_directory', type=Path)
args = parser.parse_args()
target = args.new_directory.resolve()
if target.exists():
    raise SystemExit('Use a new directory outside the source checkout.')

def git(directory, *command):
    return subprocess.check_output(['git', '-C', str(directory), *command],text=True).strip()

previous = git(root,'rev-parse','--verify',args.previous+'^{commit}')
base = git(root,'rev-parse','--verify',args.base+'^{commit}')
if not target.parent.is_dir() or root == target or root in target.parents and target.name != '_cs2-recovery':
    raise SystemExit('Use an independent checkout or _cs2-recovery in a CI checkout.')
git(root,'worktree','add','--detach',str(target),base)
git(target,'restore','--source='+previous,'--staged','--worktree','--','.')
(target/'.nojekyll').unlink(missing_ok=True)
# A previously installed CS3 worker should retire and release its own offline
# shell after rollback. Player settings and saved levels live in other stores.
worker = target/'fps/sw.js'
worker.write_text("""self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const prefix = 'cs3-install:' + new URL(self.registration.scope).pathname + ':';
  for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
  await self.registration.unregister();
})()));
""")
manifest = target/'build-info.json'
info = json.loads(manifest.read_bytes())
info['files'] = [f for f in info['files'] if f['path'] not in ['.nojekyll','fps/sw.js']]
data = worker.read_bytes()
info['files'].append(dict(path='fps/sw.js',bytes=len(data),sha256=hashlib.sha256(data).hexdigest()))
info['files'].sort(key=lambda f:f['path'])
info['bytes'] = sum(f['bytes'] for f in info['files'])
manifest.write_text(json.dumps(info,ensure_ascii=False,indent=2)+'\n')
for name in ['tools/pages-source.mjs','tools/verify-pages.py']:
    shutil.copyfile(root/name,target/name)
workflow = target/'.github/workflows/recovery-pages.yml'
workflow.write_text("""name: CS2 restored public site
on:
  pull_request:
    branches: [main]
  push:
    branches: [main]
permissions:
  contents: read
jobs:
  exact-cs2-site:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: node tools/pages-source.mjs
      - uses: actions/jekyll-build-pages@v1
      - run: python3 tools/verify-pages.py . _site
""")
git(target,'add','-A','--','.')
subprocess.run(['node','tools/pages-source.mjs','--write'],cwd=target,check=True)
git(target,'add','_config.yml')
print(json.dumps(dict(previous=previous,base=base,publicFiles=len(info['files']),tree=git(target,'write-tree'))))
