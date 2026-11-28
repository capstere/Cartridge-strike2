// Package only the measured environment from its corresponding original map.
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');
const input=process.argv[2],target=process.argv[3],id=process.argv[4]||'meltem';
if(!input||!target)throw Error('Supply private donor output and the target checkout.');
const skies={meltem:'kloofendal_48d',embruns:'kloofendal_misty_morning',tephra:'wasteland_feu'};
if(!Object.hasOwn(skies,id))throw Error('Unsupported source environment.');
const packed=fs.readFileSync(path.join(input,id+'-environment.json.gz'));
const data=JSON.parse(gunzipSync(packed));
if(data.version!==1||data.id!==id||data.sky?.key!==skies[id])
  throw Error('Review original map and photographic sky before packaging.');
if(id==='meltem'&&(data.mills.length!==2||data.fabrics.length!==12||data.ponds.length!==8))throw Error('Review original Meltem environment.');
if(id==='embruns'&&(data.fabrics.length!==6||data.ponds.length!==17))throw Error('Review original Kervénec environment.');
if(id==='tephra'){
  if(data.sea||!data.volcano?.vents.length||!data.volcano.canopy)throw Error('Review volcanic environment.');
}else if(data.sea?.waves.length!==8||!data.floats.length)throw Error('Review coastal waves and authored hulls.');
const relative='frontline/source/assets/sky/'+skies[id]+'_lo.webp';
const sky=fs.readFileSync(path.join(process.cwd(),relative));
const out=path.join(target,'assets/fps/maps',id);
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'environment.json.gz'),packed);
fs.writeFileSync(path.join(out,'sky.webp'),sky);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({source:data.id,sky:{path:relative,sha256:hash(sky),bytes:sky.length},
  environment:{sha256:hash(packed),bytes:packed.length,windmills:data.mills.length,floaters:data.floats.length,ponds:data.ponds.length,
    clothGroups:data.fabrics.length,clothVertices:data.fabrics.reduce((n,f)=>n+f.mesh.vertices,0),
    waveBands:data.sea?.waves.length||0,steamVents:data.volcano?.vents.length||0}},null,2));
