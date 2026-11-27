import {createReferenceEnvironment,applyReferenceWind} from './reference-environment.mjs';
import * as THREE from '../../vendor/three/three.module.js';

const commonTextures={cyfol:'cyfol.webp',cyflag:'cyflag.webp',plaster:'plaster.webp',stone:'stone.webp',ground:'pavers.webp',wood:'../../materials/riposte/timber/map.webp',signs:'signs.webp'};
const temporary=new THREE.Vector3();
function unpack(bytes,materials,root){
  const view=new DataView(bytes),size=view.getUint32(0,true);
  const header=JSON.parse(new TextDecoder().decode(new Uint8Array(bytes,4,size)));
  if(header.version!==1)throw Error('Unsupported reference mesh format.');
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
    if(part.sway){
      const sway=new Float32Array(n);
      for(let i=0;i<n;i++){sway[i]=THREE.DataUtils.fromHalfFloat(view.getUint16(o,true));o+=2;}
      g.setAttribute('aSw',new THREE.BufferAttribute(sway,1));
    }
    g.computeBoundingSphere();
    const mesh=new THREE.Mesh(g,materials[part.material]);
    mesh.matrixAutoUpdate=false;root.add(mesh);
  }
}
async function readBatch(name,signal,folder){
  const response=await fetch(new URL(name+'.bin.gz',folder),{signal});
  if(!response.ok)throw Error('Map geometry could not be loaded.');
  const body=await response.arrayBuffer(),header=new Uint8Array(body,0,2);
  if(header[0]!==31||header[1]!==139)return body; // already decoded by HTTP
  return new Response(new Blob([body]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
}
export function referenceScene(scene,world,settings){
  const id=world.referenceId,name=world.project.name;
  if(!['meltem','embruns','tephra'].includes(id))throw Error('Map presentation is unavailable.');
  const folder=new URL('../../assets/fps/maps/'+id+'/',import.meta.url);
  const textureFiles=id==='meltem'?commonTextures:{
    plaster:'../meltem/plaster.webp',stone:'../meltem/stone.webp',wood:commonTextures.wood,signs:'signs.webp',
    ground:id==='tephra'?'ash.webp':'../meltem/pavers.webp',
    ...(id==='tephra'?{lava:'lava.webp',basalt:'basalt.webp',moss:'moss.webp',panel:'panel.webp'}:{})
  };
  const abort=new AbortController(),root=new THREE.Group(),detail=new THREE.Group();
  root.name=name;detail.name=name+' fine detail';root.add(detail);scene.add(root);
  const materials={},textures=[];
  const palette={...(id==='meltem'?{cyfol:0xffffff,cyflag:0xffffff}:{}),...(id==='tephra'?{basalt:0xffffff,moss:0xffffff,panel:0xffffff}:{}),color:0xffffff,plaster:0xffffff,stone:0xffffff,wood:0xffffff,ground:0xdfd7c1,glass:0x82b2ce,signs:0xffffff,decals:0xffffff};
  for(const [k,color] of Object.entries(palette))materials[k]=new THREE.MeshLambertMaterial({color,vertexColors:true});
  materials.glass.transparent=true;materials.glass.opacity=.74;
  Object.assign(materials.decals,{transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});
  const screen=id==='embruns'?'portScreen':id==='tephra'?'tephraScreen':null;
  if(screen)materials[screen]=new THREE.MeshBasicMaterial(id==='embruns'?{color:new THREE.Color(1.8,1.8,1.8)}:{vertexColors:true});
  if(id==='tephra')materials.lava=new THREE.MeshBasicMaterial({color:new THREE.Color(3.4,3.4,3.4),vertexColors:true});
  const environment=createReferenceEnvironment({id,scene,root,settings,materials,signal:abort.signal,folder});
  if(id==='meltem'){
    applyReferenceWind(materials.cyfol,materials.cyflag,environment.time);
    materials.cyfol.alphaTest=.42;materials.cyflag.side=THREE.DoubleSide;
  }
  let disposed=false,baseReady=false,fineBatch=null;
  function loadFine(){
    if(!fineBatch)fineBatch=readBatch('detail',abort.signal,folder).then(bytes=>{
      if(!disposed)unpack(bytes,materials,detail);
    });
    return fineBatch;
  }
  async function build(){
    const loader=new THREE.TextureLoader();
    await Promise.all(Object.entries(textureFiles).map(async([k,f])=>{
      const texture=await loader.loadAsync(new URL(f,folder).href);
      if(disposed){texture.dispose();return;}
      texture.colorSpace=THREE.SRGBColorSpace;
      if(k==='cyfol'||k==='cyflag')texture.flipY=false;
      else if(['lava','moss','basalt','panel'].includes(k)){
        texture.flipY=false;texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      }
      else if(k==='signs'){
        texture.flipY=false;
        materials.decals.map=texture;
        materials.decals.needsUpdate=true;
        if(screen){materials[screen].map=texture;materials[screen].needsUpdate=true;}
      }else texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=settings.graphics==='low'?1:2;textures.push(texture);materials[k].map=texture;materials[k].needsUpdate=true;
    }));
    if(disposed)return;
    const base=await readBatch('base',abort.signal,folder);if(disposed)return;unpack(base,materials,root);
    if(settings.graphics!=='low')await loadFine();
    baseReady=true;
  }
  function update(camera){
    environment.update(camera);
    // Preserve the coarse architecture across all distances. Fine classes use
    // the donor's distance-driven hiding and are absent from the low profile.
    detail.visible=settings.graphics!=='low';
    if(!detail.visible||!baseReady||disposed)return;
    if(!fineBatch)loadFine().catch(error=>{if(!disposed)console.warn('Map fine detail unavailable.',error);});
    for(const m of detail.children){
      const sphere=m.geometry.boundingSphere;
      temporary.copy(camera.position).sub(sphere.center);
      m.visible=temporary.lengthSq()<(38+sphere.radius)**2;
    }
  }
  function dispose(){
    if(disposed)return;
    disposed=true;abort.abort();environment.dispose();root.removeFromParent();
    root.traverse(o=>o.geometry?.dispose());
    for(const m of Object.values(materials))m.dispose();
    for(const tex of textures)tex.dispose();textures.length=0;
  }
  return {root,update,dispose,ready:Promise.all([build(),environment.ready]).catch(e=>{if(!disposed){dispose();throw e;}})};
}
