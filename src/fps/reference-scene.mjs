import * as THREE from '../../vendor/three/three.module.js';

const folder=new URL('../../assets/fps/maps/meltem/',import.meta.url);
const textureFiles={plaster:'plaster.webp',stone:'stone.webp',ground:'pavers.webp',wood:'../../materials/riposte/timber/map.webp'};
const temporary=new THREE.Vector3();
function unpack(bytes,materials,root){
  const view=new DataView(bytes),size=view.getUint32(0,true);
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,4,size)));
  if(header.version!==1)throw Error('Unsupported Meltem mesh format.');
  for(const part of header.groups){
    const {n,min,span}=part;let o=4+size+part.offset;
    const pos=new Float32Array(n*3);
    for(let i=0;i<pos.length;i++){const axis=i%3;pos[i]=min[axis]+view.getUint16(o,true)/65535*span[axis];o+=2;}
    const normal=new Int8Array(bytes,o,n*3);o+=n*3;
    const color=new Uint8Array(bytes,o,n*3);o+=n*3;
    const uv=new Float32Array(n*2);
    for(let i=0;i<uv.length;i++){uv[i]=THREE.DataUtils.fromHalfFloat(view.getUint16(o,true));o+=2;}
    const indices=part.wide?new Uint32Array(part.indices):new Uint16Array(part.indices);
    for(let i=0;i<indices.length;i++){indices[i]=part.wide?view.getUint32(o,true):view.getUint16(o,true);o+=part.wide?4:2;}
    const g=new THREE.BufferGeometry();
    g.setAttribute('position',new THREE.BufferAttribute(pos,3));
    g.setAttribute('normal',new THREE.BufferAttribute(normal,3,true));
    g.setAttribute('color',new THREE.BufferAttribute(color,3,true));
    g.setAttribute('uv',new THREE.BufferAttribute(uv,2));
    g.setIndex(new THREE.BufferAttribute(indices,1));
    g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,materials[part.material]);
    mesh.matrixAutoUpdate=false;root.add(mesh);
  }
}
async function readBatch(name,signal){
  const response=await fetch(new URL(name+'.bin.gz',folder),{signal});
  if(!response.ok)throw Error('Meltem geometry could not be loaded.');
  const body=await response.arrayBuffer(),header=new Uint8Array(body,0,2);
  if(header[0]!==31||header[1]!==139)return body; // already decoded by HTTP
  return new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export function referenceScene(scene,world,settings){
  const abort=new AbortController(),root=new THREE.Group(),detail=new THREE.Group(),water=world.project.referenceMap.water;
  root.name='Meltem';detail.name='Meltem fine detail';root.add(detail);scene.add(root);
  const materials={},textures=[];
  const palette={color:0xffffff,plaster:0xffffff,stone:0xffffff,wood:0xffffff,ground:0xdfd7c1,glass:0x82b2ce};
  for(const [k,color] of Object.entries(palette))materials[k]=new THREE.MeshLambertMaterial({color,vertexColors:true});
  materials.glass.transparent=true;materials.glass.opacity=.74;
  // One water surface below the quay and the pier. Donor volumes own support
  // and ray queries; this independent surface carries no invisible collider.
  const seaMaterial=new THREE.MeshLambertMaterial({color:0x17627e});
  const sea=new THREE.Mesh(new THREE.PlaneGeometry(240,260),seaMaterial);
  sea.rotation.x=-Math.PI/2;sea.position.set(-150,water.y,0);root.add(sea);
  scene.background=new THREE.Color(0x9ec6ed);scene.fog=new THREE.FogExp2(0xb6cfe1,.003);
  let disposed=false;
  async function build(){
    const loader=new THREE.TextureLoader();
    await Promise.all(Object.entries(textureFiles).map(async([k,f])=>{
      const texture=await loader.loadAsync(new URL(f,folder).href);
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=settings.graphics==='low'?1:2;textures.push(texture);materials[k].map=texture;materials[k].needsUpdate=true;
    }));
    if(disposed)return;
    const base=await readBatch('base',abort.signal);if(disposed)return;unpack(base,materials,root);
    if(settings.graphics!=='low'){const fine=await readBatch('detail',abort.signal);if(!disposed)unpack(fine,materials,detail);}
  }
  function update(camera){
    // Preserve the coarse architecture across all distances. Fine classes use
    // the donor's distance-driven hiding and are absent from the low profile.
    for(const m of detail.children){
      const sphere=m.geometry.boundingSphere;
      temporary.copy(camera.position).sub(sphere.center);
      m.visible=temporary.lengthSq()<(38+sphere.radius)**2;
    }
  }
  function dispose(){
    if(disposed)return;
    disposed=true;abort.abort();root.removeFromParent();
    root.traverse(o=>o.geometry?.dispose());
    for(const m of Object.values(materials))m.dispose();seaMaterial.dispose();
    for(const tex of textures)tex.dispose();textures.length=0;
  }
  return {root,update,dispose,ready:build().catch(e=>{if(!disposed){dispose();throw e;}})};
}
