"""Offline isometric thumbnails of vetted Hissrum12 GLBs; no screenshot/CDN runtime."""
from pathlib import Path
import math
import numpy as np
import trimesh
from PIL import Image, ImageDraw
import argparse
p=argparse.ArgumentParser();p.add_argument('models',type=Path);p.add_argument('output',type=Path);args=p.parse_args();args.output.mkdir(parents=True,exist_ok=True)
S=192; a=math.radians(42);e=math.radians(26)
u=np.array([math.cos(a),0,-math.sin(a)]);v=np.array([-math.sin(e)*math.sin(a),math.cos(e),-math.sin(e)*math.cos(a)]);depth=np.array([math.cos(e)*math.sin(a),math.sin(e),math.cos(e)*math.cos(a)])
light=np.array([-.1,.85,.52]);light/=np.linalg.norm(light)
files=sorted(args.models.glob('*.glb'))
for file in files:
 scene=trimesh.load(str(file),force='scene',process=False)
 entries=[];all_points=[]
 for node in scene.graph.nodes_geometry:
  T,gname=scene.graph[node];geo=scene.geometry[gname]
  if not isinstance(geo,trimesh.Trimesh) or not len(geo.faces): continue
  points=trimesh.transform_points(geo.vertices,T)
  all_points.append(points)
  base=getattr(geo.visual.material,'baseColorFactor',None)
  color=np.array(base[:3] if base is not None else [0.57,.65,.68],dtype=float);color=color/255 if color.max()>1 else color;alpha=(base[3] if base is not None else 1.)
  # PBR base factors are linear; convert to display sRGB.
  color=np.where(color<0.0031308,12.92*color,1.055*np.power(np.maximum(color,0),1/2.4)-.055)
  entries.append((geo,points,np.clip(color,0,1),alpha))
 if not all_points: continue
 pts=np.concatenate(all_points);mid=(pts.max(axis=0)+pts.min(axis=0))/2
 xy=(pts-mid)@np.stack([u,v],axis=1)
 scale=152/max(.001,np.ptp(xy[:,0]),np.ptp(xy[:,1]));offset=np.array([S/2,S/2])
 img=Image.new('RGB',(S,S),(240,245,244));D=ImageDraw.Draw(img,'RGB')
 D.ellipse((14,158,178,176), fill=(213,224,222))
 polygons=[]
 for geo,points,col,alpha in entries:
  coords=(points-mid)@np.stack([u,-v],axis=1)*scale+offset
  dep=(points-mid)@depth
  # If too many triangles, sample faces deterministically but preserve overall silhouette.
  for ix,f in enumerate(geo.faces):
   tri=coords[f];p=points[f]
   n=np.cross(p[1]-p[0],p[2]-p[0]);d=np.linalg.norm(n)
   if d<1e-10:continue
   n=n/d;lambert=.64+.31*abs(n@light)
   rgba=tuple(int(x) for x in (np.clip(col*lambert,0,1)*255))
   polygons.append((float(np.mean(dep[f])),tuple(map(tuple,tri)),rgba))
 polygons.sort(key=lambda x:x[0])
 for _,points,color in polygons:
  D.polygon(points,fill=color)
 img.save(args.output/(file.stem+'.webp'),format='WEBP',quality=78,method=6)
print('PASS',len(files),'Hissrum12 previews',sum(p.stat().st_size for p in args.output.glob('*.webp')),'bytes')
