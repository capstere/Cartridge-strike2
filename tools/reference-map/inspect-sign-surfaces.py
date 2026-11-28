"""Inspect decoded candidate art and the authoritative factory's original sign faces."""
import argparse
import base64
from collections import Counter
import gzip
import hashlib
import json
from pathlib import Path
import struct

from PIL import Image


def read_gzip_json(path):
    return json.loads(gzip.decompress(path.read_bytes()))


parser = argparse.ArgumentParser()
parser.add_argument('map', choices=('embruns', 'tephra'))
parser.add_argument('raw', type=Path, help='private donor export directory')
parser.add_argument('atlas', type=Path)
parser.add_argument('paint_receipt', type=Path)
args = parser.parse_args()
bindings = {'embruns': {'signs3': 'signs', 'decals3': 'decals', 'screen': 'decals'},
            'tephra': {'signs5': 'signs', 'decals5': 'decals', 'screenTp': 'signs'}}[args.map]
paint = json.loads(args.paint_receipt.read_text())
assert paint['map'] == args.map
assert hashlib.sha256(args.atlas.read_bytes()).hexdigest() == paint['sha256']
with Image.open(args.atlas) as atlas:
    assert list(atlas.size) == paint['size']
    rgba = atlas.convert('RGBA')
side = rgba.height
alpha = rgba.getchannel('A')
assert alpha.crop((0, 0, side, side)).getextrema() == (255, 255)
hist = alpha.crop((side, 0, side * 2, side)).histogram()
assert hist[0] > 0 and hist[-1] > 0 and sum(hist[1:-1]) > 0
counts = {key: Counter() for key in bindings}
group_counts = Counter()
for i, group in enumerate(read_gzip_json(args.raw / 'map.json.gz')['renderGroups']):
    key = group['material']
    if key not in bindings or not group['indices']:
        continue
    data = read_gzip_json(args.raw / f'group-{i}.json.gz')
    uvs = list(struct.iter_unpack('<ff', base64.b64decode(data['uv'])))
    columns = 2 if bindings[key] == 'signs' else 4
    group_counts[key] += 1
    for triangle in struct.iter_unpack('<III', base64.b64decode(data['index'])):
        sample = [uvs[index] for index in triangle]
        column = min(columns-1, int(sum(u for u, v in sample) * columns / 3))
        row = min(3, int(sum(v for u, v in sample) * 4 / 3))
        for u, v in sample:
            assert column-1e-4 <= u*columns <= column+1+1e-4
            assert row-1e-4 <= v*4 <= row+1+1e-4
        counts[key][row*columns+column] += 1
assert all(counts.values()), 'A declared material did not emit original faces.'
print(json.dumps({
    'map': args.map, 'sha256': paint['sha256'],
    'alphaPixels': {'transparent': hist[0], 'partial': sum(hist[1:-1]), 'opaque': hist[-1]},
    'sourceMaterials': {key: {'samples': bindings[key], 'groups': group_counts[key], 'triangles': sum(cells.values()),
                              'trianglesPerCell': dict(sorted(cells.items()))} for key, cells in counts.items()}
}, indent=2))
