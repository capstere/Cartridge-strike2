"""Check the rendered batch UV cells against the decoded donor sign-face receipt."""
from collections import Counter
from pathlib import Path
import gzip
import hashlib
import json
import struct
import sys

folder, source_receipt = map(Path, sys.argv[1:])
source = json.loads(source_receipt.read_text())
bind = {'signs3':'signs', 'signs5':'signs', 'decals3':'decals', 'decals5':'decals',
        'screen':'portScreen', 'screenTp':'tephraScreen'}
expected = {bind[k]: row for k,row in source['sourceMaterials'].items()}
observed = {key:Counter() for key in expected}
hashes = {}
for name in ('base.bin.gz','detail.bin.gz'):
    data = (folder/name).read_bytes()
    hashes[name] = hashlib.sha256(data).hexdigest()
    blob = gzip.decompress(data)
    size = struct.unpack_from('<I',blob)[0]
    header = json.loads(blob[4:4+size])
    for row in header['groups']:
        key = row['material']
        if key not in expected:
            continue
        # Each position occupies 6 bytes followed by 3 normal and 3 color bytes.
        count = row['n']
        start = 4+size+row['offset']+count*12
        uv = list(struct.iter_unpack('<ee',blob[start:start+count*4]))
        start += count*4
        stride = 4 if row['wide'] else 2
        triangles = struct.iter_unpack('<III' if row['wide'] else '<HHH',
            blob[start:start+row['indices']*stride])
        left = expected[key]['samples']=='signs'
        columns = 2 if left else 4
        for triangle in triangles:
            u = sum(uv[i][0] for i in triangle)/3
            v = sum(uv[i][1] for i in triangle)/3
            assert (0 <= u <= .5 if left else .5 <= u <= 1), (name,key,u,v)
            column = min(columns-1,int((u*2-(0 if left else 1))*columns))
            source_cell = min(3,int(v*4))*columns+column
            observed[key][str(source_cell)] += 1
for key, cells in observed.items():
    assert dict(cells)==expected[key]['trianglesPerCell'], (key,dict(cells),expected[key])
print(json.dumps({'map':source['map'],'files':hashes,'atlas':source['sha256'],
    'triangleCells':{key:dict(sorted(cells.items(),key=lambda item:int(item[0]))) for key,cells in observed.items()}},indent=2))
