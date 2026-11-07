/** Export a simple glTF 2.0 static prototype of authored geometric parts.
 * NOT a rigged character; the original rig GLB is bundled separately.
 * Runs entirely client-side and never sends assets to a server.
 */
const ENCODER=new TextEncoder();
const align4=n=>(n+3)&~3;
const COMPONENT_FLOAT=5126,COMPONENT_UINT=5125;
const TYPE_VEC3='VEC3';
function validMesh(mesh){
 const pos=mesh.geometry?.attributes?.position;
 if(!pos||pos.itemSize!==3||!pos.count||pos.count>100000)throw Error('Egen del har ogiltig geometri.');
}
export function makePrototypeGLB(instances){
 if(!Array.isArray(instances)||instances.length===0||instances.length>60)throw Error('Det krävs 1–60 synliga 3D-delar för prototypen.');
 const gltf={asset:{version:'2.0',generator:'Cartridge Strike Character Design Studio v2 - static prototype'},
  scene:0,scenes:[{nodes:[]}],nodes:[],meshes:[],materials:[],buffers:[{byteLength:0}],bufferViews:[],accessors:[]};
 const chunks=[];let byteLength=0;
 function append(source,target,componentType,type,count,min,max){
  const data=new Uint8Array(source.buffer,source.byteOffset,source.byteLength);
  const offset=align4(byteLength);
  if(offset>byteLength)chunks.push(new Uint8Array(offset-byteLength));
  chunks.push(data.slice());
  byteLength=offset+data.byteLength;
  const view=gltf.bufferViews.push({buffer:0,byteOffset:offset,byteLength:data.byteLength,target})-1;
  const acc={bufferView:view,componentType,count,type};
  if(min)acc.min=min;
  if(max)acc.max=max;
  return gltf.accessors.push(acc)-1;
 }
 for(const instance of instances){
  const mesh=instance.mesh;
  validMesh(mesh);
  mesh.updateWorldMatrix(true,false);
  const geometry=mesh.geometry;
  const pos=geometry.attributes.position;
  const normal=geometry.attributes.normal;
  if(!normal||normal.itemSize!==3||normal.count!==pos.count)throw Error('Egen del saknar normaler.');
  const values=new Float32Array(pos.count*3),normals=new Float32Array(pos.count*3);
  const low=[Infinity,Infinity,Infinity],high=[-Infinity,-Infinity,-Infinity];
  for(let i=0;i<pos.count;i++){
    for(let a=0;a<3;a++){
      const v=pos.array[i*pos.itemSize+a];
      if(!Number.isFinite(v))throw Error('Geometrin har ogiltig koordinat.');
      values[i*3+a]=v;low[a]=Math.min(low[a],v);high[a]=Math.max(high[a],v);
      normals[i*3+a]=normal.array[i*normal.itemSize+a];
    }
  }
  const indices=geometry.index?Uint32Array.from(geometry.index.array):Uint32Array.from({length:pos.count},(_,i)=>i);
  const p=append(values,34962,COMPONENT_FLOAT,TYPE_VEC3,pos.count,low,high);
  const n=append(normals,34962,COMPONENT_FLOAT,TYPE_VEC3,pos.count);
  const idx=append(indices,34963,COMPONENT_UINT,'SCALAR',indices.length);
  const c=mesh.material.color||{r:.7,g:.7,b:.7};
  const material=gltf.materials.push({
    name:instance.name||'part',pbrMetallicRoughness:{baseColorFactor:[c.r,c.g,c.b,1],metallicFactor:0,roughnessFactor:.8},
    doubleSided:true
  })-1;
  gltf.meshes.push({name:instance.name,primitives:[{attributes:{POSITION:p,NORMAL:n},indices:idx,material,mode:4}]});
  const matrix=Array.from(mesh.matrixWorld.elements);
  gltf.nodes.push({name:instance.name,mesh:gltf.meshes.length-1,matrix,
    extras:{part_id:instance.id,anchor:instance.anchor||'root',static_prototype_only:true}});
  gltf.scenes[0].nodes.push(gltf.nodes.length-1);
 }
 gltf.buffers[0].byteLength=byteLength;
 const binary=new Uint8Array(align4(byteLength));let cursor=0;
 for(const block of chunks){binary.set(block,cursor);cursor+=block.length;}
 const jsonData=ENCODER.encode(JSON.stringify(gltf)),jsonSize=align4(jsonData.length);
 const total=12+8+jsonSize+8+binary.length,out=new Uint8Array(total),v=new DataView(out.buffer);
 v.setUint32(0,0x46546c67,true);v.setUint32(4,2,true);v.setUint32(8,total,true);
 v.setUint32(12,jsonSize,true);v.setUint32(16,0x4e4f534a,true);
 out.fill(0x20,20,20+jsonSize);out.set(jsonData,20);
 const start=20+jsonSize;
 v.setUint32(start,binary.length,true);v.setUint32(start+4,0x004e4942,true);out.set(binary,start+8);
 return out;
}