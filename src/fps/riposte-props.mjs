/** Reuse Lab geometry fitted into existing solid pallet volumes. No new blockers. */
import * as T from '../../vendor/three/three.module.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {createPrefab} from './riposte-procedural-props.mjs';
import {createPBRLibrary} from './riposte-pbr-materials.mjs';
export async function buildRiposteProps(world){
 const root=new T.Group();root.name='riposte-pallets';const library=createPBRLibrary({THREE:T}),wood=await library.load('timber');wood.material.normalScale.setScalar(.25);
 const proto=createPrefab(T,'pallet',{detail:0}),source=new T.Box3().setFromObject(proto.group),size=source.getSize(new T.Vector3()),center=source.getCenter(new T.Vector3()),parts=[];
 for(const p of world.living.props.filter(p=>p.type==='pallet')){
  const b=world.living.boxes.find(b=>b.livingOwner===p.id&&b.id.endsWith('-wood-base'));if(!b)continue;
  proto.group.position.set(b.x-center.x*b.w/size.x,b.y-center.y*b.h/size.y,b.z-center.z*b.d/size.z);proto.group.scale.set(b.w/size.x,b.h/size.y,b.d/size.z);proto.group.updateMatrixWorld(true);
  proto.group.traverse(o=>{if(o.isMesh){let g=o.geometry.clone().applyMatrix4(o.matrixWorld);if(g.index){const n=g.toNonIndexed();g.dispose();g=n;}parts.push(g);}});
 }
 if(parts.length){const mesh=new T.Mesh(mergeGeometries(parts),wood.material);mesh.receiveShadow=true;root.add(mesh);}parts.forEach(g=>g.dispose());proto.dispose();
 return {root,dispose(){root.removeFromParent();root.traverse(o=>o.geometry?.dispose());wood.release();library.dispose();}};
}
