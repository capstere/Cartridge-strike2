/** Canonical wardrobe coordinates for the compact fantasy rig. */
import * as T from '../vendor/three/three.module.js';
import {skinDetail} from './studio-foundation.mjs';
export const dwarfPoint=([x,y,z])=>[x*.65,.23+(y-.98)*.45,z*.8];
export function dwarfJacket(avatar,color,accent){
 const source=avatar.meshes.find(m=>m.material?.name==='jacket-fabric');
 const collar=new T.CylinderGeometry(.077,.10,.035,20,1,true);collar.translate(0,.481,0);
 const zip=new T.BoxGeometry(.004,.21,.004);zip.translate(0,.35,.093);
 return [skinDetail(collar,source,new T.MeshStandardMaterial({color,side:T.DoubleSide,roughness:.85}),'dwarf-jacket-collar'),skinDetail(zip,source,new T.MeshStandardMaterial({color:accent,roughness:.6}),'dwarf-jacket-zip')];
}
