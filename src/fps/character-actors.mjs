/** Bridges the authored skin to the unchanged game actor and weapon mechanisms. */
import * as T from '../../vendor/three/three.module.js';
import {createAuthoredAvatar,animateAuthored,posedBounds,privateCharacterApplies,characterVisualSignature,disposeAvatar} from './character-library.mjs?v=6.1.2';
import {WEAPONS} from './config.mjs';
const V=()=>new T.Vector3(),Q=()=>new T.Quaternion();
export function upgradeActor(model,team,id,isHostage){
 const d=model.userData,keep=new Set();for(const root of[d.bag,d.marker])root?.traverse(o=>keep.add(o));
 const removed=[],geometries=new Set(),materials=new Set(),usedMaterials=new Set();model.traverse(o=>{if(keep.has(o)&&o.material)usedMaterials.add(o.material);if(o.isMesh&&!keep.has(o))removed.push(o);});
 for(const mesh of removed){mesh.removeFromParent();geometries.add(mesh.geometry);if(!usedMaterials.has(mesh.material))materials.add(mesh.material);}
 for(const g of geometries)if(!g.userData.sharedWeapon)g.dispose();for(const m of materials){m.dispose();}
 d.avatar=createAuthoredAvatar(team,id,isHostage);d.frame.add(d.avatar.holder);d.frame.add(d.weaponSocket);if(d.bag)d.frame.add(d.bag);
 d.characterRevision='quaternius-uniform-v1';return model;
}
/** A team change only replaces the cosmetic avatar; game actors and sockets survive. */
export function refreshActorCharacter(model,team,id){
 const d=model.userData,old=d.avatar;if(!old||(old.privateDesign?'private':old.overrideSignature||'original')===characterVisualSignature(team,id))return;
 const next=createAuthoredAvatar(team||'hostage',id,!team);
 old.holder.removeFromParent();disposeAvatar(old);d.avatar=next;d.frame.add(next.holder);d.fall=null;
}
// Calls are synchronous; scratch vectors never escape into game/actor state.
// Avoid dozens of short-lived vectors per visible rifle carrier and frame.
const pointScratch=V(),heldScratch=V(),targetScratch=V(),start=V(),end=V(),from=V(),to=V();
const correction=Q(),worldRotation=Q(),parentRotation=Q();
const shoulder=V(),elbowNow=V(),wristNow=V(),direction=V(),bend=V(),elbowTarget=V(),handTarget=V();
function bonePoint(bone,model){return model.worldToLocal(bone.getWorldPosition(pointScratch));}
function alignBone(bone,child,target){
 bone.getWorldPosition(start);child.getWorldPosition(end);from.copy(end).sub(start).normalize();to.copy(target).sub(start).normalize();
 correction.setFromUnitVectors(from,to);bone.getWorldQuaternion(worldRotation).premultiply(correction);bone.parent.getWorldQuaternion(parentRotation);
 bone.quaternion.copy(parentRotation.invert().multiply(worldRotation));bone.updateWorldMatrix(false,true);
}
function supportHand(state,target){
 const upper=state.bones.get('upperarm_l'),lower=state.bones.get('lowerarm_l'),hand=state.bones.get('hand_l');
 upper.getWorldPosition(shoulder);lower.getWorldPosition(elbowNow);hand.getWorldPosition(wristNow);
 const l1=shoulder.distanceTo(elbowNow),l2=elbowNow.distanceTo(wristNow);
 direction.copy(target).sub(shoulder);const distance=Math.max(.01,Math.min(l1+l2-.005,direction.length()));direction.normalize();
 bend.copy(elbowNow).sub(shoulder);bend.addScaledVector(direction,-bend.dot(direction));
 if(bend.lengthSq()<.000001){bend.set(-1,-1,0);bend.addScaledVector(direction,-direction.dot(bend));}bend.normalize();
 const along=(l1*l1-l2*l2+distance*distance)/(2*distance),height=Math.sqrt(Math.max(0,l1*l1-along*along));
 elbowTarget.copy(shoulder).addScaledVector(direction,along).addScaledVector(bend,height);
 handTarget.copy(shoulder).addScaledVector(direction,distance);
 alignBone(upper,lower,elbowTarget);alignBone(lower,hand,handTarget);
}
export function syncAuthoredActor(model,actor,time,options={}){
 const d=model.userData,s=d.avatar;animateAuthored(s,actor,time,options);
 model.updateMatrixWorld(true);
 if(d.bag){const hip=bonePoint(s.bones.get('pelvis'),model);d.bag.position.set(hip.x+.26,hip.y-.10,hip.z+.025);d.bag.rotation.set(Math.sin(time*3+s.seed)*Math.min(.035,(actor.moving||0)*.01),0,.04);}
 if(!d.isHostage&&d.weaponModel){
  const wrist=bonePoint(s.bones.get('hand_r'),model),gun=d.weaponModel,grip=gun.userData.grip,pitch=Math.max(-.65,Math.min(.65,actor.pitch||0));
  d.weaponSocket.rotation.set(pitch,0,0);const held=heldScratch.copy(grip||heldScratch.set(0,0,0)).multiplyScalar(.85).applyEuler(d.weaponSocket.rotation);
  d.weaponSocket.position.copy(wrist).sub(held);d.weaponSocket.position.y-=.012;d.weaponSocket.position.z-=.043;d.weaponSocket.updateWorldMatrix(true,true);
  s.gunHandLocal??=new T.Matrix4();s.gunHandLocal.copy(s.bones.get('hand_r').matrixWorld).invert().multiply(d.weaponSocket.matrixWorld);
  if(!(actor.reloadUntil>time)&&WEAPONS[actor.weapon]?.slot==='primary'){
   const target=gun.localToWorld(targetScratch.copy(gun.userData.support));target.y+=.006;target.z+=.024;supportHand(s,target);
   s.root.traverse(o=>{if(o.isSkinnedMesh)o.skeleton.update();});
  }
 }
 d.marker.position.y=(actor.height||1.7)+.14;d.marker.rotation.y=(options.cameraYaw||0)-(actor.yaw||0);
}
export function authoredCorpse(model,actor,time,{angle=actor.yaw||0,free=1.7}={}){
 const age=time-actor.deathAt;if(!Number.isFinite(age)||age<0||age>18)return false;
 const d=model.userData,s=d.avatar,progress=Math.min(1,age/.85);
 if(!s.death||s.death.at!==actor.deathAt){s.mixer.stopAllAction();const clip=s.mixer.clipAction(s.clips.get('Death01'));clip.reset().setLoop(T.LoopOnce,1).play();clip.clampWhenFinished=true;s.death={at:actor.deathAt,action:clip,bounds:null};s.time=null;}
 s.mixer.setTime(Math.min(s.death.action.getClip().duration-.001,age*3));
 d.marker.visible=false;model.position.set(0,0,0);model.rotation.set(0,0,0);model.scale.set(1,1,1);d.frame.rotation.set(0,0,0);s.holder.scale.setScalar(s.scale);s.holder.position.set(0,0,0);s.holder.rotation.set(0,Math.PI,0);
 model.updateMatrixWorld(true);
 if(d.bag){const hip=bonePoint(s.bones.get('pelvis'),model);d.bag.position.set(hip.x+.17,hip.y-.04,hip.z+.06);d.bag.rotation.z=-.8*progress;}
 if(d.weaponModel&&s.gunHandLocal){const matrix=new T.Matrix4().copy(d.frame.matrixWorld).invert().multiply(s.bones.get('hand_r').matrixWorld).multiply(s.gunHandLocal);matrix.decompose(d.weaponSocket.position,d.weaponSocket.quaternion,d.weaponSocket.scale);}
 model.updateMatrixWorld(true);const box=progress===1&&s.death.bounds?s.death.bounds:posedBounds(model);if(progress===1)s.death.bounds=box.clone();
 model.scale.x=Math.min(1,.42/Math.max(.01,box.max.x-box.min.x));model.scale.z=Math.min(1,(Math.max(.2,free)+.24)/Math.max(.01,box.max.z-box.min.z));
 const shiftX=-(box.min.x+box.max.x)*.5*model.scale.x,shiftZ=Math.max(-.12-box.min.z*model.scale.z,Math.min(0,Math.max(.2,free)+.12-box.max.z*model.scale.z));
 model.rotation.y=angle;model.position.set(actor.x+Math.cos(angle)*shiftX+Math.sin(angle)*shiftZ,.006-box.min.y+(actor.y||0)*(1-progress),actor.z-Math.sin(angle)*shiftX+Math.cos(angle)*shiftZ);return true;
}
