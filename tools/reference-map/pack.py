"""Pack native Meltem export into a deterministic LevelProject and indexed render batches."""
import base64
import gzip
import json
from pathlib import Path
import struct
import sys

import numpy as np

raw, target = map(Path,sys.argv[1:3])
# This compiler writes packaged derivative inputs in target. Native captures stay in raw.
source=json.loads(gzip.decompress((raw/'map.json.gz').read_bytes()))
geometry=target/'assets/fps/maps/meltem'
geometry.mkdir(parents=True,exist_ok=True)
# Keep material grouping small while preserving the donor's linear per-vertex
# tint/occlusion and original UVs. Fine detail is separately selectable at load.
surface={
    'chaux':'plaster','ashlar':'stone','drystone':'stone','rock':'stone',
    'paintwood':'wood','timber':'wood','wood':'wood','boards':'wood','shutter':'wood',
    'ground':'ground','glass':'glass','window':'glass'
}
groups={}
for i,g in enumerate(source['renderGroups']):
    if not g['indices']:continue
    a=json.loads(gzip.decompress((raw/('group-'+str(i)+'.json.gz')).read_bytes()))
    def arr(key,n=1,t='<f4'):
        return np.frombuffer(base64.b64decode(a[key]),dtype=t).reshape(-1,n)
    pos=arr('position',3); normal=arr('normal',3); uv=arr('uv',2)
    colors=arr('color',3)*np.clip(arr('ao'),0.4,1)
    indices=arr('index',3,'<u4')
    # The donor's far, ground and ordinary world buffers use different extents.
    # Partition triangles by their actual world centroid, never by filename.
    centre=pos[indices][:,:,[0,2]].mean(axis=1)
    cell=np.floor(centre/24).astype('int32')
    cell=np.clip(cell,-5,5)
    chunks,assignment=np.unique(cell,axis=0,return_inverse=True)
    for ci,(cx,cz) in enumerate(chunks):
        used,local=np.unique(indices[assignment==ci],return_inverse=True)
        key=(int(g['detail']>=2),surface.get(g['material'],'color'),int(cx),int(cz))
        groups.setdefault(key,[]).append((pos[used],normal[used],uv[used],colors[used],local.astype('<u4')))
def write_batches(level):
    blob=bytearray();rows=[]
    for (detail,material,cx,cz),parts in sorted(groups.items()):
        if detail!=level:continue
        pos,norm,uv,col=[np.concatenate([a[k] for a in parts]) for k in range(4)]
        start=0;idx=[]
        for p,_,_,_,indices in parts:
            idx.append(indices+start);start+=len(p)
        indices=np.concatenate(idx)
        # Per-axis quantization keeps even tiny trim accurate, with no seam
        # accumulation. Decode back into world metres once on load.
        minimum=pos.min(axis=0);span=np.maximum(pos.max(axis=0)-minimum,.00001)
        packed=np.rint((pos-minimum)*65535/span).clip(0,65535).astype('<u2')
        norm=np.rint(norm*127).clip(-127,127).astype('i1')
        col=np.rint(col*255).clip(0,255).astype('u1')
        uv=uv.astype('<f2');wide=len(pos)>65535
        row=dict(material=material,cell=[cx,cz],n=len(pos),indices=len(indices),wide=wide,
                 min=minimum.tolist(),span=span.tolist(),offset=len(blob))
        for buf in [packed,norm,col,uv,indices.astype('<u4' if wide else '<u2')]:
            blob.extend(buf.tobytes())
        rows.append(row)
    header=json.dumps(dict(version=1,groups=rows),separators=(',',':')).encode()
    data=struct.pack('<I',len(header))+header+blob
    suffix='detail' if level else 'base'
    (geometry/(suffix+'.bin.gz')).write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
    print(suffix,len(rows),'batches',sum(r['indices'] for r in rows)//3,'triangles',len(data),'uncompressed bytes')
write_batches(0)
write_batches(1)
# All gameplay data lives in the edition-checked public LevelProject. JSON
# numeric representation uses exact source float values for the physical model.
spec={k:source[k] for k in ('bounds','solids','ramps','water','holes','nav','rayProps','zones','poi')}
spec.update(version=1,sourceId='meltem')
spawns=[]
for t,team in enumerate(('analysts','counterAnalysts')):
    for i,n in enumerate((0,3,7,11,14)):
        x,z=source['spawns'][t][n]
        spawns.append(dict(id='SP-'+('C' if t else 'A')+'-'+str(i+1).zfill(2),team=team,index=i,x=x,z=z,yaw=3.141592653589793 if t else 0))
project=json.loads(Path('levels/compact-arena.json').read_text())
project.update(createdAt='2026-11-27T00:00:00.000Z',projectId='lvl-meltem',name='Meltem',
               ground=dict(bounds=source['bounds'],wallHeightDefault=2.85,floors=[],tape=[]),
               intent=dict(runtimeLighting='neutral-daylight',supportedModes=['endless','tdm']),validation={},agentBrief={},navHints=[])
project['gameplay'].update(spawns=spawns,objectives=dict(hostages=[],rescue=None,bomb=None))
project['architecture']={k:([] if isinstance(v,list) else v) for k,v in project['architecture'].items()}
project['furniture']={k:[] for k in project['furniture']}
project['assets']={k:[] for k in project['assets']}
project.pop('surfaceColors',None);project.pop('surfaceMaterials',None)
project['referenceMap']=spec
(target/'levels').mkdir(parents=True,exist_ok=True)
(target/'levels/meltem.json').write_text(json.dumps(project,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')

# Package the approved source media used by this renderer profile.
from PIL import Image
import shutil
for name in ("plaster","stone","pavers"):
    image=Image.open(Path("frontline/source/assets/tex")/name/"map.webp").convert("RGB")
    image.thumbnail((512,512),Image.Resampling.LANCZOS)
    image.save(geometry/(name+".webp"),quality=80,method=4)
shutil.copyfile("frontline/source/assets/sfx/amb_meltem/a_bed.mp3",geometry/"sea.mp3")
shutil.copyfile("frontline/source/assets/maps/meltem.webp",geometry.parent/"meltem.webp")
