"""Build the previous public game beside CS3 in a separate recovery PR checkout."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import subprocess

root = Path(__file__).resolve().parents[2]
parser = argparse.ArgumentParser()
parser.add_argument('previous', help='Verified pre-release main SHA')
parser.add_argument('base', help='Commit to base the separate recovery PR on')
parser.add_argument('new_directory', type=Path)
args = parser.parse_args()
target = args.new_directory.resolve()
if target.exists() or not target.parent.is_dir() or (root in target.parents and target.name != '_cs2-recovery'):
    raise SystemExit('Use a new independent checkout or _cs2-recovery in CI.')

def git(directory, *command):
    return subprocess.check_output(['git','-C',str(directory),*command],text=True).strip()

previous = git(root,'rev-parse','--verify',args.previous+'^{commit}')
base = git(root,'rev-parse','--verify',args.base+'^{commit}')
git(root,'worktree','add','--detach',str(target),base)
site = target/'cs2-recovery'
templates = target/'pages-recovery-entries'
marker = target/'deploy/online/pages-recovery.json'
if marker.exists():
    if json.loads(marker.read_text())['previous'] != previous:
        raise SystemExit('A different recovery site already occupies the new checkout.')
    print('Selected recovery already prepared.')
    raise SystemExit()
site.mkdir()
templates.mkdir()
manifest = subprocess.check_output(['git','-C',str(root),'show',previous+':build-info.json'])
info = json.loads(manifest)
(site/'build-info.json').write_bytes(manifest)
with subprocess.Popen(['git','-C',str(root),'cat-file','--batch'],stdin=subprocess.PIPE,stdout=subprocess.PIPE) as objects:
    for entry in info['files']:
        path = PurePosixPath(entry['path'])
        if path.is_absolute() or str(path)!=entry['path'] or '..' in path.parts:
            raise ValueError('Invalid public path')
        objects.stdin.write((previous+':'+str(path)+'\n').encode())
        objects.stdin.flush()
        _, kind, count = objects.stdout.readline().split()
        assert kind == b'blob' and int(count)==entry['bytes']
        data = objects.stdout.read(int(count))
        assert objects.stdout.read(1)==b'\n' and hashlib.sha256(data).hexdigest()==entry['sha256']
        dest = site/path
        dest.parent.mkdir(parents=True,exist_ok=True)
        dest.write_bytes(data)
    objects.stdin.close()
    if objects.wait(): raise RuntimeError('Could not restore the previous public files.')

entries = {}
def page(source, destination, body):
    (templates/source).write_text('---\nlayout: null\npermalink: /'+destination+'\n---\n'+body)
    entries[destination] = hashlib.sha256(body.encode()).hexdigest()

for filename, path, relative in [
        ('home.html','index.html','./cs2-recovery/fps/'),
        ('play.html','fps/index.html','../cs2-recovery/fps/'),
        ('credits.html','credits.html','./cs2-recovery/credits.html')]:
    page(filename,path,'<!doctype html><html lang="en"><meta charset="utf-8"><title>Cartridge-Strike 2</title>'
        + '<script>location.replace('+json.dumps(relative)+'+location.search+location.hash)</script>'
        + '<a href="'+relative+'">Open Cartridge-Strike 2</a></html>\n')
page('retire-worker.js','fps/sw.js',"""self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil((async () => {
  const prefix = 'cs3-install:' + new URL(self.registration.scope).pathname + ':';
  for (const name of await caches.keys()) if (name.startsWith(prefix)) await caches.delete(name);
  await self.registration.unregister();
})()));
""")
marker.write_text(json.dumps({'previous':previous,'manifestSha256':hashlib.sha256(manifest).hexdigest(),'entries':entries},indent=2)+'\n')
git(target,'add','--','cs2-recovery','pages-recovery-entries','deploy/online/pages-recovery.json')
subprocess.run(['node','tools/pages-source.mjs','--write'],cwd=target,check=True)
git(target,'add','_config.yml')
print(json.dumps(dict(previous=previous,base=base,publicFiles=len(info['files']),tree=git(target,'write-tree'))))
