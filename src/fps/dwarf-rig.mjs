/** The existing five adult fantasy dwarfs, converted to an editable rigid-weight
 * skin. Canonical front +Z; game wrapper turns to -Z. No gameplay state is owned.
 */
import * as T from '../../vendor/three/three.module.js';
import {RoundedBoxGeometry} from '../../vendor/three/addons/geometries/RoundedBoxGeometry.js';
import {mergeGeometries} from '../../vendor/three/addons/utils/BufferGeometryUtils.js';
import {cloneSkinned as cloneSkeleton} from './skinned-clone.mjs?v=6.1.2';
export const DWARF_RIG='cartridge-dwarf-v1';
export const DWARF_CLIPS=Object.freeze(['Idle_Loop','Walk_Loop','Death01']);
import {DWARF_PALETTES} from './character-roles.mjs?v=6.1.2';
export {DWARF_PALETTES};
export function createDwarfAsset(variant=0){
 if(!Number.isInteger(variant)||variant<0||variant>4)throw Error('Okänd dvärgvariant.');
 const root=new T.Group();root.name='dwarf-source';const bones=[],byName=new Map();
 function bone(name,parent,world){const b=new T.Bone();b.name=name;(parent||root).add(b);b.position.fromArray(world);if(parent){root.updateMatrixWorld(true);b.position.sub(parent.getWorldPosition(new T.Vector3()));}bones.push(b);byName.set(name,b);return b;}
 const origin=bone('dwarf_root',null,[0,0,0]),pelvis=bone('pelvis',origin,[0,.23,0]),chest=bone('spine_03',pelvis,[0,.34,0]),head=bone('Head',chest,[0,.57,.008]);
 for(const [side,sign]of [['l',1],['r',-1]]){
  const thigh=bone('thigh_'+side,origin,[sign*.073,.23,0]);const calf=bone('calf_'+side,thigh,[sign*.073,.12,0]);bone('foot_'+side,calf,[sign*.073,.038,.027]);
  const shoulder=bone('clavicle_'+side,chest,[sign*.13,.43,0]);const arm=bone('upperarm_'+side,shoulder,[sign*.153,.43,0]);const lower=bone('lowerarm_'+side,arm,[sign*.163,.34,0]);bone('hand_'+side,lower,[sign*.168,.277,.006]);
 }
 root.updateMatrixWorld(true);const skeleton=new T.Skeleton(bones);skeleton.calculateInverses();const p=DWARF_PALETTES[variant],materials=new Map();
 function material(name,color){const m=new T.MeshStandardMaterial({color,roughness:.88});m.name=name;materials.set(name,m);return m;}
 const M={cloth:material('jacket-fabric',p.jacket),skin:material('face-skin',p.skin),hand:material('gloves-leather',p.skin),beard:material('dwarf-beard',p.hair),brow:material('hair',p.hair),pants:material('trousers-fabric',p.pants),shoe:material('dwarf-shoe',p.boots),hat:material('dwarf-hat',p.jacket),hatbrim:material('dwarf-hat-brim',p.vest),dark:material('dwarf-trim',p.vest),metal:material('dwarf-metal',p.accent),eye:material('eyes','#17232a')};
 const groups=new Map();
 function put(geo,mat,boneName,x,y,z,scale=[1,1,1],rz=0){
  // z has the old renderer convention; reflect by a Y half-turn along with x.
  const matrix=new T.Matrix4().compose(new T.Vector3(-x,y,-z),new T.Quaternion().setFromEuler(new T.Euler(0,0,-rz)),new T.Vector3(...scale));
  const g=geo.index?geo.toNonIndexed():geo;g.applyMatrix4(matrix);if(g!==geo)geo.dispose();
  const count=g.attributes.position.count,j=new Uint16Array(count*4),w=new Float32Array(count*4),index=bones.indexOf(byName.get(boneName));
  for(let i=0;i<count;i++){j[i*4]=index;w[i*4]=1;}g.setAttribute('skinIndex',new T.Uint16BufferAttribute(j,4));g.setAttribute('skinWeight',new T.Float32BufferAttribute(w,4));
  if(!groups.has(mat))groups.set(mat,[]);groups.get(mat).push(g);
 }
 const sphere=(mat,b,x,y,z,s)=>put(new T.SphereGeometry(1,16,12),mat,b,x,y,z,s);
 put(new RoundedBoxGeometry(.26,.27,.18,3,.065),M.cloth,'spine_03',0,.34,0);
 sphere(M.skin,'Head',0,.57,-.008,[.122,.13,.108]);sphere(M.beard,'Head',0,.465,-.083,[.135,.145,.09]);
 for(let i=-1;i<=1;i++)sphere(M.beard,'Head',i*.055,.40,-.10,[.046,.09,.043]);
 sphere(M.skin,'Head',0,.558,-.117,[.041,.034,.038]);
 for(const sign of [-1,1]){sphere(M.skin,'Head',sign*.12,.565,0,[.026,.039,.027]);sphere(M.eye,'Head',sign*.047,.592,-.106,[.012,.012,.006]);put(new T.CapsuleGeometry(.009,.045,3,8),M.brow,'Head',sign*.048,.614,-.107,[1,1,1],sign*1.38);}
 put(new T.CylinderGeometry(.14,.14,.025,20),M.hatbrim,'Head',0,.675,0);
 put(new T.ConeGeometry(.122,.20,20),M.hat,'Head',0,.763,.008,[1,1,1],(variant-2)*.08);
 put(new T.BoxGeometry(.27,.035,.19),M.dark,'pelvis',0,.285,0);put(new RoundedBoxGeometry(.044,.041,.014,2,.007),M.metal,'pelvis',0,.286,-.103);
 for(const [side,sign]of [['l',-1],['r',1]]){
  put(new T.CapsuleGeometry(.049,.09,4,10),M.pants,'thigh_'+side,sign*.073,.165,0);
  put(new RoundedBoxGeometry(.112,.08,.17,3,.025),M.shoe,'foot_'+side,sign*.073,.038,-.027);
  put(new T.CapsuleGeometry(.043,.105,4,10),M.cloth,'upperarm_'+side,sign*.163,.367,0);
  sphere(M.hand,'hand_'+side,sign*.168,.277,-.006,[.045,.049,.041]);
 }
 for(const [m,parts]of groups){const g=mergeGeometries(parts);parts.forEach(p=>p.dispose());g.computeBoundingBox();const mesh=new T.SkinnedMesh(g,m);mesh.name=m.name==='hair'?'dwarf-eyebrows':'dwarf-'+m.name;mesh.frustumCulled=false;root.add(mesh);mesh.bind(skeleton);}
 const times=Array.from({length:33},(_,i)=>i/32),rotation=(name,amp,sign=1)=>new T.QuaternionKeyframeTrack(name+'.quaternion',times,times.flatMap(t=>new T.Quaternion().setFromAxisAngle(new T.Vector3(1,0,0),Math.sin(t*Math.PI*2)*amp*sign).toArray()));
 const idle=new T.AnimationClip('Idle_Loop',2,[new T.VectorKeyframeTrack('spine_03.position',[0,.5,1,1.5,2],[0,.11,0,0,.114,0,0,.11,0,0,.106,0,0,.11,0])]);
 const walk=new T.AnimationClip('Walk_Loop',1,[rotation('thigh_l',.42),rotation('thigh_r',.42,-1),rotation('upperarm_l',.30,-1),rotation('upperarm_r',.30),new T.VectorKeyframeTrack('spine_03.position',times,times.flatMap(t=>[0,.11+Math.abs(Math.sin(t*Math.PI*2))*.012,0]))]);
 const death=new T.AnimationClip('Death01',.55,[new T.QuaternionKeyframeTrack('dwarf_root.quaternion',[0,.275,.55],[0,0,0,1,...new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),.725).toArray(),...new T.Quaternion().setFromAxisAngle(new T.Vector3(0,0,1),1.45).toArray()])]);
 return {scene:root,animations:[idle,walk,death],userData:{rig:DWARF_RIG,variant}};
}
export function createDwarfAvatar(asset=createDwarfAsset()){
 const root=cloneSkeleton(asset.scene),bones=new Map(),materials=new Map(),meshes=[];
 root.traverse(o=>{if(o.isBone)bones.set(o.name,o);if(!o.isMesh)return;meshes.push(o);o.frustumCulled=false;const own=m=>{if(!materials.has(m))materials.set(m,m.clone());return materials.get(m);};o.material=Array.isArray(o.material)?o.material.map(own):own(o.material);});
 const holder=new T.Group();holder.name='dwarf-avatar';holder.rotation.y=Math.PI;holder.add(root);
 const mixer=new T.AnimationMixer(root),clips=new Map(asset.animations.map(c=>[c.name,c])),base=new Map([...clips].map(([n,c])=>[n,mixer.clipAction(c)]));base.get('Idle_Loop').play();mixer.update(0);
 return {root,holder,bones,materials,meshes,mixer,clips,base,upper:new Map(),shoes:[],ownedGeometry:[],scale:1,gender:'male',sculptKey:'dwarf',isDwarf:true,isHostage:true,time:null,activeBase:'Idle_Loop',groundOffset:0};
}
export function animateDwarf(state,actor,time){
 const name=actor.alive===false?'Death01':actor.moving>.03?'Walk_Loop':'Idle_Loop',action=state.base.get(name);
 if(!action)throw Error('Dvärgklipp saknas: '+name);
 if(state.activeBase!==name){state.mixer.stopAllAction();action.reset().play();state.activeBase=name;}
 action.setLoop(name==='Death01'?T.LoopOnce:T.LoopRepeat,name==='Death01'?1:Infinity);action.clampWhenFinished=name==='Death01';
 // Match the original procedural cadence; preview/export use these same clips.
 const at=name==='Death01'?Math.min(.55,Math.max(0,time-actor.deathAt)):name==='Walk_Loop'?(actor.steps||0)*13/(Math.PI*2):time+((actor.variant||0)*.2);
 state.mixer.setTime(at);state.root.updateMatrixWorld(true);state.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});state.time=time;
}
