"""Compile a reviewed original map into a deterministic LevelProject and indexed render batches."""
import base64
import gzip
import json
from pathlib import Path
import struct
import subprocess
import sys

import numpy as np
from coarse import reduce_vertices

raw, target = map(Path,sys.argv[1:3])
# This compiler writes packaged derivative inputs in target. Native captures stay in raw.
source=json.loads(gzip.decompress((raw/'map.json.gz').read_bytes()))
map_id=source.get('sourceId','meltem')
profiles={
    'meltem':('Meltem',(0,3,7,11,14)),
    'embruns':('Kervénec Harbor',(0,3,5,8,11)),
    'tephra':('Tephra',(0,3,7,11,14)),
}
name,spawn_indices=profiles[map_id]
geometry=target/'assets/fps/maps'/map_id
geometry.mkdir(parents=True,exist_ok=True)
# Keep material grouping small while preserving the donor's linear per-vertex
# tint/occlusion and original UVs. Fine detail is separately selectable at load.
surface={
    'chaux':'plaster','ashlar':'stone','drystone':'stone','rock':'stone',
    'paintwood':'wood','timber':'wood','wood':'wood','boards':'wood','shutter':'wood',
    'ground':'ground','glass':'glass','window':'glass',
    'signs4':'signs','decals4':'decals','cyfol':'cyfol','cyflag':'cyflag',
    'signs3':'signs','decals3':'decals','screen':'portScreen','lavaTp':'lava',
    'signs5':'signs','decals5':'decals','screenTp':'tephraScreen','ash':'ground','basalt':'basalt',
    'moss':'moss','panel':'panel','glassLit':'litGlass','lampTp':'litFixture','ceil':'ceiling','ceilc':'ceilingConcrete','wetstone':'stone','stone':'stone','plaster':'plaster'
}
if map_id!='tephra':
    for key in ('glassLit','lampTp','ceil','ceilc'):surface.pop(key,None)
groups={}
coarse_groups={}
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
    material=surface.get(g['material'],'color')
    sway=None
    if material in ('cyflag','cyfol'):
        if not a.get('sway'):raise ValueError('Missing source flexibility. Re-export with the pinned donor probe.')
        sway=arr('sway').flatten()
        if material=='cyflag':cell[:]=0
        else:cell=np.floor(centre/48).astype('int32').clip(-5,5)
    if material in ('signs','decals','portScreen','tephraScreen'):
        # Only 274 triangles. One map-wide batch per material keeps the number
        # of low-tier draw calls bounded. Reuse the source V orientation.
        cell[:]=0
        uv=uv.copy()
        uv[:,0]=uv[:,0]*.5 + (.5 if material in ('decals','portScreen') else 0)
    chunks,assignment=np.unique(cell,axis=0,return_inverse=True)
    for ci,(cx,cz) in enumerate(chunks):
        used,local=np.unique(indices[assignment==ci],return_inverse=True)
        key=(int(g['detail']>=2),material,int(cx),int(cz))
        groups.setdefault(key,[]).append((pos[used],normal[used],uv[used],colors[used],local.astype('<u4'),sway[used] if sway is not None else None))
    if map_id=='embruns' and g['detail']<2:
        coarse_cells=np.floor(centre/48).astype('int32').clip(-3,3)
        if material in ('signs','decals','portScreen'):coarse_cells[:]=0
        chunks,assignment=np.unique(coarse_cells,axis=0,return_inverse=True)
        for ci,(cx,cz) in enumerate(chunks):
            used,local=np.unique(indices[assignment==ci],return_inverse=True)
            parts=reduce_vertices(g['material'],pos[used],normal[used],uv[used],colors[used],local.reshape(-1,3))
            if parts[4].size:
                coarse_groups.setdefault((0,material,int(cx),int(cz)),[]).append((*parts,None))
def write_batches(level,collection=groups,suffix=None):
    blob=bytearray();rows=[]
    for (detail,material,cx,cz),parts in sorted(collection.items()):
        if detail!=level:continue
        pos,norm,uv,col=[np.concatenate([a[k] for a in parts]) for k in range(4)]
        start=0;idx=[]
        for p,_,_,_,indices,_ in parts:
            idx.append(indices.ravel()+start);start+=len(p)
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
        if parts[0][5] is not None:
            row['sway']=True
            blob.extend(np.concatenate([part[5] for part in parts]).astype('<f2').tobytes())
        rows.append(row)
    header=json.dumps(dict(version=1,groups=rows),separators=(',',':')).encode()
    data=struct.pack('<I',len(header))+header+blob
    suffix=suffix or ('detail' if level else 'base')
    (geometry/(suffix+'.bin.gz')).write_bytes(gzip.compress(data,compresslevel=6,mtime=0))
    print(suffix,len(rows),'batches',sum(r['indices'] for r in rows)//3,'triangles',len(data),'uncompressed bytes')
write_batches(0)
write_batches(1)
if coarse_groups:write_batches(0,coarse_groups,'coarse')
if '--mesh-only' in sys.argv[3:]:sys.exit(0)
# All gameplay data lives in the edition-checked public LevelProject. JSON
# numeric representation uses exact source float values for the physical model.
spec={k:source[k] for k in ('bounds','solids','ramps','water','holes','nav','rayProps','zones','poi')}
spec.update(version=1,sourceId=map_id)
# Public callouts at the same named structures must match the English sign atlas.
sector_labels={
    'embruns':{'Fish market':'Fish Auction','Fish packing':'Fish Dispatch','Ice factory':'Ice Works','Café de la Marine':'Harbor Café'},
    'tephra':{'Pump station':'Pump Station 2','Labs':'Laboratory','Core store':'Core Archive','Control room':'Control Room'},
}
for row in spec['zones']:
    row[0]=sector_labels.get(map_id,{}).get(row[0],row[0])

if source.get('groundMaterials'):spec['groundMaterials']=source['groundMaterials']
spawns=[]
for t,team in enumerate(('analysts','counterAnalysts')):
    for i,n in enumerate(spawn_indices):
        x,z=source['spawns'][t][n]
        spawns.append(dict(id='SP-'+('C' if t else 'A')+'-'+str(i+1).zfill(2),team=team,index=i,x=x,z=z,yaw=3.141592653589793 if t else 0))
project=json.loads(Path('levels/compact-arena.json').read_text())
project.update(createdAt='2026-11-27T00:00:00.000Z',projectId='lvl-'+map_id,name=name,
               ground=dict(bounds=source['bounds'],wallHeightDefault=2.85,floors=[],tape=[]),
               intent=dict(runtimeLighting='neutral-daylight',supportedModes=['endless','tdm']),validation={},agentBrief={},navHints=[])
project['gameplay'].update(spawns=spawns,objectives=dict(hostages=[],rescue=None,bomb=None))
project['architecture']={k:([] if isinstance(v,list) else v) for k,v in project['architecture'].items()}
project['furniture']={k:[] for k in project['furniture']}
project['assets']={k:[] for k in project['assets']}
project.pop('surfaceColors',None);project.pop('surfaceMaterials',None)
project['referenceMap']=spec
(target/'levels').mkdir(parents=True,exist_ok=True)
(target/'levels'/(map_id+'.json')).write_text(json.dumps(project,separators=(',',':'),ensure_ascii=False)+'\n',encoding='utf-8')

# Package the approved source media used by this renderer profile.
from PIL import Image
import shutil
for name in {"meltem":("plaster","stone","pavers"),"embruns":(),"tephra":("ash",)}[map_id]:
    image=Image.open(Path("frontline/source/assets/tex")/name/"map.webp").convert("RGB")
    image.thumbnail((512,512),Image.Resampling.LANCZOS)
    image.save(geometry/(name+".webp"),quality=80,method=4)
if map_id in ('embruns','tephra'):
    light_source=next((Path(arg.split('=',1)[1])/map_id/'lighting.json.gz' for arg in sys.argv[3:] if arg.startswith('--light-dir=')),raw/'lighting.json.gz')
    lamp=json.loads(gzip.decompress(light_source.read_bytes()))
    count=lamp['nx']*lamp['nz']*lamp['ny']
    if lamp['version']!=1 or lamp['id']!=map_id or not (0<count<=500000) or len(base64.b64decode(lamp['rgba']))!=count*4:
        raise ValueError('Map light capture differs from its original source geometry.')
    shutil.copyfile(light_source,geometry/'lighting.json.gz')
    subprocess.run([sys.executable,Path(__file__).with_name('ground.py'),map_id,raw,geometry/'ground.bin.gz'],check=True)
if map_id=='meltem':
    shutil.copyfile("frontline/source/assets/sfx/amb_meltem/a_bed.mp3",geometry/"sea.mp3")
shutil.copyfile(Path("frontline/source/assets/maps")/(map_id+".webp"),geometry.parent/(map_id+".webp"))

if map_id=='meltem':
    subprocess.run(['node', str(Path(__file__).with_name('signs.mjs')), str(geometry/'signs.webp')], check=True)
else:
    subprocess.run(['node',str(Path(__file__).with_name('candidate-signs.mjs')),map_id,str(geometry/'signs.webp')],check=True)

for key in {'meltem':('cyfol','cyflag'),'embruns':(),'tephra':('lava','basalt','moss','panel')}[map_id]:
    image=Image.open(raw/(key+'.png')).convert('RGBA' if key=='cyfol' else 'RGB')
    image.thumbnail((512,512),Image.Resampling.LANCZOS)
    image.save(geometry/(key+'.webp'),quality=86,method=4)
subprocess.run(['node',str(Path(__file__).with_name('pack-environment.cjs')),str(raw),str(target),map_id],check=True)
