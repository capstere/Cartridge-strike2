"""Build compact spatial ground masks and mipmapped material arrays from the source map."""
import gzip
import hashlib
import json
from pathlib import Path
import struct
import subprocess
import sys
import tempfile

import numpy as np
from PIL import Image

script = Path(__file__).resolve().parent
repo = script.parents[1]
donor = repo / 'frontline/source'
map_id, raw, output = sys.argv[1:]
raw, output = Path(raw), Path(output)
# Four 256x256 tiles cost 1.34 MiB including GPU mipmaps. One mask preserves the
# original PPM, geometry boundaries and all four channels independent of alpha.
side = 256
with tempfile.TemporaryDirectory() as private:
    mask = Path(private) / 'mask'
    subprocess.run(['node', script/'ground-mask.mjs', map_id, mask], check=True)
    field = json.loads(mask.with_suffix('.json').read_bytes())
    weights = mask.with_suffix('.rgba').read_bytes()
layers, bounds = field['layers'], field['bounds']
keys = [layers[key] for key in ['base', 'l1', 'l2', 'l3']]
scales = {'concrete':2.5, 'pavers':2.6, 'cobble':2.2, 'asphalt':4.5, 'ash':2.6, 'moss':2.4}
tiles, sources = [], []
for key in keys:
    image_path = raw/'moss.png' if key == 'moss' else donor/'assets/tex'/key/'map.webp'
    with Image.open(image_path) as image:
        if key == 'moss':
            # Runtime-exported texLab procedural data is already in GPU row order.
            tile = np.array(image.convert('RGBA').resize((side, side),Image.Resampling.LANCZOS))
        else:
            # Mirror the r147 photo upload and texLabPack's 5th mip luminance
            # height for a lean material. No parallax or normal maps are loaded.
            rgb = image.convert('RGB').transpose(Image.Transpose.FLIP_TOP_BOTTOM)
            small = rgb.resize((side,side),Image.Resampling.LANCZOS)
            mip = rgb.resize((max(1,rgb.width//32),max(1,rgb.height//32)),Image.Resampling.BOX).resize((side,side),Image.Resampling.BILINEAR)
            coeff = np.array([.2126,.7152,.0722])
            def linear(im):
                values = np.asarray(im,dtype=float)/255
                return np.where(values<=.04045,values/12.92,((values+.055)/1.055)**2.4)
            height = .5+2.5*((linear(small)-linear(mip))@coeff)
            tile = np.dstack((small,np.rint(np.clip(height,0,1)*255).astype('uint8')))
        tiles.append(tile.tobytes())
    sources.append(dict(layer=key,sha256=hashlib.sha256(image_path.read_bytes()).hexdigest()))
header = dict(version=1,id=map_id,width=field['width'],height=field['height'],side=side,
              bounds=[bounds[k] for k in ('x0','z0','w','d')],scales=[scales[k] for k in keys],
              dirt=layers['dirt'])
metadata = json.dumps(header,separators=(',',':')).encode()
data = struct.pack('<I',len(metadata))+metadata+weights+b''.join(tiles)
output.parent.mkdir(parents=True,exist_ok=True)
output.write_bytes(gzip.compress(data,compresslevel=9,mtime=0))
print(json.dumps(dict(**header,layers=sources,maskSHA256=hashlib.sha256(weights).hexdigest(),
    bytes=output.stat().st_size,sha256=hashlib.sha256(output.read_bytes()).hexdigest())))
