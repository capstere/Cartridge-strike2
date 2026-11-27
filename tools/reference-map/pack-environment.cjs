// Package the measured output of the pinned map's original environment.
const fs=require('node:fs');
const path=require('node:path');
const {gunzipSync}=require('node:zlib');
const {createHash}=require('node:crypto');

const input=process.argv[2],target=process.argv[3],root=process.cwd();
if(!input||!target)throw Error('Supply private donor output and the target checkout.');
const packed=fs.readFileSync(path.join(input,'meltem-environment.json.gz'));
const data=JSON.parse(gunzipSync(packed));
if(data.version!==1||data.id!=='meltem'||!data.fabrics.length||data.mills.length!==2||
    data.sea?.waves.length!==8||data.sky?.key!=='kloofendal_48d')
  throw Error('Review the source environment geometry, sky and water before packaging.');
const relative='frontline/source/assets/sky/kloofendal_48d_lo.webp';
const sky=fs.readFileSync(path.join(root,relative));
const out=path.join(target,'assets/fps/maps/meltem');
fs.mkdirSync(out,{recursive:true});
fs.writeFileSync(path.join(out,'environment.json.gz'),packed);
fs.writeFileSync(path.join(out,'sky.webp'),sky);
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
console.log(JSON.stringify({source:data.id,sky:{path:relative,sha256:hash(sky),bytes:sky.length},
  environment:{sha256:hash(packed),bytes:packed.length,windmills:data.mills.length,
    clothGroups:data.fabrics.length,clothVertices:data.fabrics.reduce((n,f)=>n+f.mesh.vertices,0),
    waveBands:data.sea.waves.length,shoreDistanceField:[data.sea.field.width,data.sea.field.height]}},null,2));
