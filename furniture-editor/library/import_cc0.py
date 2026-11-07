#!/usr/bin/env python3
"""Reproducible, license-screened Kenney CC0 GLB importer for Furniture Studio ONLY.

Downloads a finite allowlist from an immutable, named public mirror SHA. Does
not import engine/runtime scripts. Verifies self-contained glTF 2, image headers,
size ceilings, and writes SHA-256 content provenance. It never touches fps/.
"""
from __future__ import annotations
import concurrent.futures
import hashlib
import json
import os
import re
import struct
import urllib.request
import time
from pathlib import Path

ROOT=Path(__file__).resolve().parent
SOURCE='Hidencod/tge-assets'
REF='37f5baddf99899547ae661668880809c42b450f0'
RAW=f'https://raw.githubusercontent.com/{SOURCE}/{REF}/'
CC0='https://kenney.nl/assets/furniture-kit'
MAX_MODEL=150_000
MAX_THUMB=60_000

def catalog_entries():
    txt=(ROOT/'catalog.mjs').read_text(encoding='utf-8')
    m=re.search(r'export const LIBRARY = Object.freeze\((\[.*?\])\);',txt,re.S)
    if not m: raise RuntimeError('Invalid catalog source')
    entries=json.loads(m.group(1))
    assert len(entries)>=70
    ids=[e['id'] for e in entries]
    assert len(ids)==len(set(ids))
    return entries

def check_glb(data,name):
    if not 100 <= len(data) <= MAX_MODEL or data[:4]!=b'glTF':raise ValueError('Invalid GLB header '+name)
    ver,size=struct.unpack_from('<II',data,4)
    if ver!=2 or size!=len(data):raise ValueError('Invalid glTF 2 length '+name)
    n,tag=struct.unpack_from('<II',data,12)
    if tag!=0x4e4f534a or n>len(data)-20:raise ValueError('Missing JSON chunk '+name)
    d=json.loads(data[20:20+n].rstrip(b' \t\0').decode('utf-8'))
    if d.get('asset',{}).get('version')!='2.0':raise ValueError('Wrong glTF version '+name)
    if not d.get('meshes') or len(d['meshes'])>250:raise ValueError('Missing/too many meshes '+name)
    for category in ['buffers','images']:
        for obj in d.get(category,[]):
            if 'uri' in obj and not str(obj['uri']).startswith('data:'):
                raise ValueError('External resource forbidden in '+name)
    if any(s in d.get('extensionsRequired',[]) for s in ['KHR_draco_mesh_compression','EXT_meshopt_compression']):
        raise ValueError('Requires unsupported decompression '+name)
    if sum(int(a.get('count',0)) for a in d.get('accessors',[]))>350000:
        raise ValueError('Too many vertices/accessors '+name)
    return {'meshes':len(d['meshes']),'accessors':len(d.get('accessors',[]))}

def download(path,limit):
    if not re.fullmatch(r'packs/(furniture-kit|food-kit|space-kit)/(thumbs/)?[a-z0-9-]+\.(glb|webp)',path):
        raise ValueError('Unsafe allowlist path '+path)
    req=urllib.request.Request(RAW+path,headers={'User-Agent':'CartridgeStrike-FurnitureStudio-CC0-Curated/1.0'})
    for attempt in range(4):
        try:
            with urllib.request.urlopen(req,timeout=45) as r:
                if r.status!=200:raise RuntimeError('Unexpected status '+str(r.status))
                b=r.read(limit+1)
            break
        except Exception:
            if attempt==3:raise
            time.sleep(1.5*(attempt+1))
    if not b or len(b)>limit:raise ValueError('Oversized or empty '+path)
    return b

def import_one(entry):
    pack,name=entry['pack'],entry['model']
    if pack=='built-in':return []
    if pack not in ('furniture-kit','food-kit','space-kit') or not re.fullmatch(r'[a-z0-9-]+',name):
        raise ValueError('Not an approved Kenney file')
    model=f'packs/{pack}/{name}.glb';thumb=f'packs/{pack}/thumbs/{name}.webp'
    a=download(model,MAX_MODEL);info=check_glb(a,model)
    b=download(thumb,MAX_THUMB)
    if b[:4]!=b'RIFF' or b[8:12]!=b'WEBP':raise ValueError('Not a WEBP '+thumb)
    target=ROOT/'models'/pack/(name+'.glb');preview=ROOT/'thumbs'/pack/(name+'.webp')
    target.parent.mkdir(parents=True,exist_ok=True);preview.parent.mkdir(parents=True,exist_ok=True)
    target.write_bytes(a);preview.write_bytes(b)
    return [{'file':target.relative_to(ROOT).as_posix(),'sourcePath':model,'bytes':len(a),'sha256':hashlib.sha256(a).hexdigest(),**info},
            {'file':preview.relative_to(ROOT).as_posix(),'sourcePath':thumb,'bytes':len(b),'sha256':hashlib.sha256(b).hexdigest()}]

def main():
    entries=catalog_entries()
    assert all(x.get('license') in ('CC0-1.0 · Kenney','Original (NORD-01)') for x in entries)
    # Source's LICENSE declares Kenney CC0 for the curated mirror, cross-check at the immutable SHA.
    license_req=urllib.request.Request(RAW+'LICENSE',headers={'User-Agent':'CartridgeStrike-FurnitureStudio-CC0-Curated/1.0'})
    with urllib.request.urlopen(license_req,timeout=30) as r:license_text=r.read(10000).decode('utf-8')
    if 'Kenney' not in license_text or 'Creative Commons Zero' not in license_text:
        raise ValueError('Unexpected upstream license')
    refs=[]
    with concurrent.futures.ThreadPoolExecutor(max_workers=8) as pool:
        for result in pool.map(import_one,entries):refs.extend(result)
    refs.sort(key=lambda r:r['file'])
    assert len(refs)==2*sum(x['pack']!='built-in' for x in entries)
    (ROOT/'KENNEY_CC0_LICENSE.txt').write_text(license_text)
    manifest={'schemaVersion':1,'source':SOURCE,'sourceCommit':REF,'originalAuthor':'Kenney','license':'CC0-1.0',
              'officialFurnitureKit':CC0,'entries':len(entries),'importedModels':len(refs)//2,
              'files':refs,'totalBytes':sum(r['bytes'] for r in refs)}
    (ROOT/'import-manifest.json').write_text(json.dumps(manifest,indent=2,ensure_ascii=False)+'\n')
    print(json.dumps({'status':'PASS','modelCount':manifest['importedModels'],'assetFiles':len(refs),
                      'totalBytes':manifest['totalBytes'],'sourceCommit':REF},ensure_ascii=False))
if __name__=='__main__':main()
