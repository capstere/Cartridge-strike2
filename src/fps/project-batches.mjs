import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {furnitureVisibility} from './project-visibility.mjs';
import * as T from '../../vendor/three/three.module.js';
import {buildProjectFurniture} from '../../furniture-editor/build/project-visuals.mjs?v=5.9.0';

// Keep every model/finish/size option in the key. Only placement and editor identity
// are excluded. Mirroring, roll and wall alignment belong to the source template.
const placementKeys=new Set(['id','source','original','roomId','mountId','snapRole','collision','x','z','yaw','elevation','wallMount']);
function appearanceKey(item){
 const keys=Object.keys(item).filter(k=>!placementKeys.has(k)).sort();
 return JSON.stringify([!!item.wallMount,...keys.map(k=>[k,item[k]])]);
}
// Merge repeated opaque parts once in model space (for example 24 identical shelf rails).
// The same fitted geometry then serves every spatial cell without multiplying vertex storage.
function compactModel(meshes){
 const parts=new Map(),model=new T.Group();
 for(const mesh of meshes){
  const material=mesh.material,geometry=mesh.geometry;
  // Preserve multi-material groups, interleaved buffers and custom shader behaviour verbatim.
  let key=mesh.uuid;
  if(!Array.isArray(material)&&!Object.values(geometry.attributes).some(a=>a.isInterleavedBufferAttribute)){
   let paint=material.uuid;
   if(material.userData.studioOwned&&material.onBeforeCompile===T.Material.prototype.onBeforeCompile&&
      !Object.values(material).some(v=>v?.isTexture)){
    const {uuid,name,userData,...properties}=material.toJSON();paint=JSON.stringify(properties);
   }
   const format=Object.entries(geometry.attributes).map(([k,a])=>[k,a.itemSize,a.array.constructor.name,a.normalized]);
   key=JSON.stringify([paint,!!geometry.index,format,mesh.renderOrder,mesh.receiveShadow]);
  }
  if(!parts.has(key))parts.set(key,[]);
  parts.get(key).push(mesh);
 }
 for(const group of parts.values()){
  const source=group[0],m=new T.Mesh(source.geometry,source.material);
  if(group.length===1){m.matrixAutoUpdate=false;m.matrix.copy(source.matrixWorld);}
  else{
   const copies=group.map(node=>node.geometry.clone().applyMatrix4(node.matrixWorld));
   m.geometry=mergeGeometries(copies);copies.forEach(g=>g.dispose());
   if(!m.geometry)throw Error('Möbeldelarnas geometrier kunde inte sammanfogas.');
  }
  m.name=source.name;m.receiveShadow=source.receiveShadow;m.renderOrder=source.renderOrder;model.add(m);
 }
 model.updateMatrixWorld(true);return model;
}
export async function buildFpsFurniture(items,root,options){
 const variants=new Map(),cells=new Map(),templates=new T.Group(),pose=new T.Object3D(),matrix=new T.Matrix4();
 for(const item of items){
  const key=appearanceKey(item);
  if(!variants.has(key))variants.set(key,[]);
  variants.get(key).push(item);
 }
 const samples=[...variants.values()].map(list=>({...list[0],x:0,z:0,elevation:0,yaw:0}));
 await buildProjectFurniture(samples,templates,options);
 const models=new Map(templates.children.map(node=>[node.userData.editId,node]));
 const cellFor=item=>{
  const key=(item.roomId||'')+'/'+Math.floor(item.x/8)+','+Math.floor(item.z/8);
  if(!cells.has(key)){const group=new T.Group();group.name='floor5-cell-'+key;root.add(group);cells.set(key,group);}
  return cells.get(key);
 };
 let instancedItems=0;const independent=new Map();
 for(const list of variants.values()){
  const template=models.get(list[0].id);template.updateMatrixWorld(true);
  const meshes=[];let canInstance=true;
  template.traverse(node=>{
   if(!node.visible||node.isLOD||node.isSkinnedMesh||node.isInstancedMesh||node.morphTargetInfluences)canInstance=false;
   if(node.isMesh){meshes.push(node);if([].concat(node.material).some(m=>m.transparent)||node.matrixWorld.determinant()<0)canInstance=false;}
  });
  if(!canInstance){
   // Some LOD classes carry constructor-only state. Build them through their original factory.
   for(const [i,item] of list.entries()){const cell=cellFor(item);
    if(i===0){template.position.set(item.x,item.elevation||0,item.z);template.rotation.y=item.yaw||0;cell.add(template);}
    else{if(!independent.has(cell))independent.set(cell,[]);independent.get(cell).push(item);}
   }
   continue;
  }
  const model=compactModel(meshes),groups=new Map();
  for(const item of list){const cell=cellFor(item);if(!groups.has(cell))groups.set(cell,[]);groups.get(cell).push(item);}
  for(const [cell,members] of groups){
   if(members.length===1){
    const item=members[0],copy=model.clone(true);
    copy.position.set(item.x,item.elevation||0,item.z);copy.rotation.y=item.yaw||0;
    copy.traverse(node=>{node.userData.editId=item.id;});cell.add(copy);
    continue;
   }
   instancedItems+=members.length;
   const ids=members.map(item=>item.id);
   for(const source of model.children){
    const batch=new T.InstancedMesh(source.geometry,source.material,members.length);
    batch.userData.projectItemIds=ids;batch.renderOrder=source.renderOrder;batch.receiveShadow=source.receiveShadow;batch.name=source.name;
    members.forEach((item,i)=>{
     pose.position.set(item.x,item.elevation||0,item.z);pose.rotation.y=item.yaw||0;pose.updateMatrix();
     batch.setMatrixAt(i,matrix.multiplyMatrices(pose.matrix,source.matrixWorld));
    });
    batch.computeBoundingSphere();cell.add(batch);
   }
  }
 }
 await Promise.all([...independent].map(([cell,list])=>buildProjectFurniture(list,cell,options)));
 const frustum=new T.Frustum(),projection=new T.Matrix4(),bounds=new T.Box3();
 const occlusion=furnitureVisibility(options.world),regions=[];
 const register=object=>{
  const box=bounds.setFromObject(object).clone();
  if(!box.isEmpty())regions.push({object,box,hidden:false});
 };
 for(const group of cells.values())register(group);
 return {cells:cells.size,variants:variants.size,instancedItems,register,update(camera){
  camera.updateMatrixWorld();frustum.setFromProjectionMatrix(projection.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
  const moved=occlusion.update(camera.position);
  for(const region of regions){
   if(moved)region.hidden=occlusion.hidden(region.box);
   region.object.visible=!region.hidden&&frustum.intersectsBox(region.box);
  }
 }};
}
