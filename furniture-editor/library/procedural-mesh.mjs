/** Minimal primitive meshes: one unit box reused by editor, two shared circles.
 * All objects centered X/Z and resting on the floor; elevation applied by parent.
 */
import {createPrefab} from '../../src/fps/riposte-procedural-props.mjs';
import * as T from '../../vendor/three/three.module.js';
import {proceduralOf} from './procedural.mjs?v=5.8.0';
import {chairColors} from '../appearance.mjs?v=5.8.0';
import {populateLabFurniture} from './lab-furniture-mesh.mjs?v=5.8.0';
import {populateFpsFurniture} from './fps-mesh.mjs?v=5.8.0';
const circle=new T.CylinderGeometry(.5,.5,1,24);
const metallic=new T.MeshStandardMaterial({color:0xa6afb0,metalness:.85,roughness:.40});
const white=new T.MeshStandardMaterial({color:0xe7e9e4,metalness:0,roughness:.48});
const dark=new T.MeshStandardMaterial({color:0x272e32,metalness:0,roughness:.76});
const navy=new T.MeshStandardMaterial({color:0x35556d,metalness:0,roughness:.98});
const screenGlass=new T.MeshStandardMaterial({color:0x161f23,metalness:.13,roughness:.45});
const chairMaterials=new Map();
function chairMaterial(color){if(!chairMaterials.has(color))chairMaterials.set(color,new T.MeshStandardMaterial({color}));return chairMaterials.get(color);}
function addRound(group,x,y,z,diameter,h,material){
 const mesh=new T.Mesh(circle,material);
 mesh.scale.set(diameter,h,diameter);mesh.position.set(x,y,z);mesh.userData.editId=group.userData.editId;
 group.add(mesh);return mesh;
}
/** The authored blue Floor 5 dining-chair silhouette: seat, back and four legs. */
export function populateDiningChair(item,put){
 const w=item.w,d=item.d,{body,legs}=chairColors(item);
 const cloth=chairMaterial(body),metal=chairMaterial(legs);
 put(0,.46,0,w,.075,d,cloth);
 put(0,.73,d*.31,w,.48,.06,cloth);
 for(const x of [-w*.32,w*.32])for(const z of [-d*.32,d*.32])
  put(x,.225,z,.026,.45,.026,metal);
}
export function populateProcedural(item,group,put){
 const entry=proceduralOf(item);if(!entry)return false;
 if(populateLabFurniture(item,group,put)||populateFpsFurniture(item,group,put))return true;
 const w=item.w,d=item.d,h=item.height;
 if(entry.shape==='reuse'){
  const prefab=createPrefab(T,entry.prefab,{detail:1}),bounds=new T.Box3().setFromObject(prefab.group),size=bounds.getSize(new T.Vector3()),center=bounds.getCenter(new T.Vector3());
  prefab.group.scale.set(w/size.x,h/size.y,d/size.z);
  prefab.group.position.set(-center.x*w/size.x,-bounds.min.y*h/size.y,-center.z*d/size.z);
  prefab.group.traverse(o=>{if(o.isMesh){o.userData.editId=item.id;o.userData.studioGeometry=true;for(const m of Array.isArray(o.material)?o.material:[o.material])m.userData.studioOwned=true;}});
  group.add(prefab.group);return true;
 }
 const box=(x,y,z,ww,hh,dd,mat)=>put(x,y,z,ww,hh,dd,mat);
 const legs=(top,legH=.045)=>{
  for(const x of [-w*.44,w*.44])for(const z of[-d*.4,d*.4])
   box(x,top/2,z,legH,top-.04,legH,metallic);
 };
 switch(entry.shape){
  case 'dining-chair':populateDiningChair(item,box);break;
  case 'desk':case 'table':
   box(0,h-.035,0,w,.07,d,white);legs(h-.06);break;
  case 'round':
   addRound(group,0,h-.035,0,w,.07,white);
   addRound(group,0,(h-.08)/2,0,.08,h-.08,metallic);
   addRound(group,0,.025,0,Math.min(.56,w*.58),.05,metallic);break;
  case 'screen':
   // Screen is freestanding on desk; smart placement snaps to rear desktop edge.
   box(0,h*.53,0,w,h*.89,d,navy);
   for(const x of [-w*.40,w*.40])box(x,.035,0,.09,.07,.12,dark);
   break;
  case 'counter':
   box(0,h-.035,0,w,.07,d,white);
   box(0,(h-.07)/2,0,w*.95,h-.10,d*.94,white);
   for(const x of [-w*.18,w*.18])box(x,h*.47,-d*.48,.012,.30,.016,metallic);
   break;
  case 'microwave':
   box(0,h/2,0,w,h,d,dark);
   box(0,h*.55,-d*.504,w*.74,h*.65,.014,screenGlass);
   box(w*.43,h*.57,-d*.518,.026,.19,.018,metallic);
   box(w*.40,h*.24,-d*.518,.035,.035,.02,metallic);break;
  case 'monitor':
   box(0,h*.64,0,w,h*.68,.035,dark);
   box(0,h*.65,-.022,w*.94,h*.6,.008,screenGlass);
   box(0,h*.23,.025,.036,h*.3,.05,metallic);
   box(0,.03,.05,w*.35,.055,d*.8,dark);break;
  case 'keyboard':
   box(0,h/2,0,w,h,d,dark);
   for(let z=-2;z<=2;z++)for(let x=-6;x<=6;x++)
    box(x*w/14,h*.97,z*d/6,w/17,.004,d/8,metallic);
   break;
  case 'printer':
   box(0,h*.47,0,w,h*.8,d,white);
   box(0,h*.92,-d*.09,w*.78,.035,d*.65,dark);
   box(0,h*.22,-d*.515,w*.72,.045,.02,dark);break;
  case 'machine':case 'coffee':
   box(0,h*.48,0,w,h*.91,d,white);
   box(0,h*.75,-d*.505,w*.59,h*.25,.016,dark);
   box(0,h*.22,-d*.51,w*.58,.018,.015,metallic);break;
  case 'wall-picture':
   box(0,h/2,0,w,h,d,dark);
   box(0,h/2,-d/2-.005,w*.87,h*.8,.014,navy);
   box(0,h/2-.04,-d/2-.015,w*.56,h*.18,.008,white);
   break;
  case 'wall-clock':{
   const disc=new T.Mesh(new T.CylinderGeometry(w/2,w/2,d,32),white);
   disc.rotation.x=Math.PI/2;disc.position.set(0,h/2,0);
   disc.userData.editId=group.userData.editId;group.add(disc);
   box(0,h/2,-d/2-.007,.012,h*.34,.009,dark);
   box(.04,h/2+.025,-d/2-.01,w*.24,.012,.009,navy);
   break;
  }
  case 'wall-shelf':
   box(0,.06,0,w,.08,d,white);
   for(const x of [-w*.37,w*.37])box(x,-.025,d*.27,.055,.11,.06,metallic);
   break;
  case 'cabinet':
   box(0,h/2,0,w,h,d,white);
   box(0,h*.50,-d*.51,w*.018,h*.93,.018,metallic);
   for(const x of [-.08,.08])box(x,h*.51,-d*.54,.022,.14,.025,metallic);break;
  default:box(0,h/2,0,w,h,d,white);
 }
 return true;
}
