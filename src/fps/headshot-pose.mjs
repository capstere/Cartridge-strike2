import {Box3,Matrix4,Vector3,LoopOnce,MathUtils} from '../../vendor/three/three.module.js';

// Swept footprint of the two equipped banks, in the actor's backward direction.
// The outstretched hands pass the sides of the body around Z = 1.2–1.5 m.
const footprint=[
 [0,-.23,.24],[-.48,-.12,.34],[.48,-.12,.34],[0,.14,.32],[0,.53,.36],
 [-.53,.33,.34],[.53,.33,.34],[0,.93,.38],[0,1.32,.43],[0,1.76,.34],
 [-.38,.82,.28],[.38,.82,.28],[-.46,1.29,.35],[.46,1.29,.35],
 [-.79,1.32,.25],[.79,1.32,.25]
];
const fits=[[1,1],[.78,1],[.58,.88],[.42,.72],[.32,.55]];
const turns=[0,1,-1,2,-2,3,-3,4,-4,5,-5,6].map(step=>step*Math.PI/6);
const {smoothstep,lerp}=MathUtils;
const down={x:0,y:-1,z:0};
function supportHeight(world,x,z,startY){
 if(startY<.015)return 0;
 return world.raycast({x,y:startY+.02,z},down,startY+.05)?.point.y??0;
}

/** Checked once per death. Keep the original heading and proportions in open space. */
export function headshotSpace(world,actor,rig){
 const baseYaw=(actor.yaw||0)+rig.yaw,unit=rig.size/.95,y=actor.y||0;
 for(const [width,length] of fits)for(const turn of turns)for(const shift of [0,.36]){
  const angle=baseYaw+turn,sin=Math.sin(angle),cos=Math.cos(angle);
  const floor=supportHeight(world,actor.x+sin*length*unit,actor.z+cos*length*unit,y);
  const clear=footprint.every(([px,pz,radius])=>{
   const x=px*width*unit,z=pz*length*unit+shift;
   return world.canOccupy(actor.x+cos*x+sin*z,actor.z-sin*x+cos*z,radius*Math.min(width,length)*unit,.85,floor);
  });
  if(clear)return {turn,width,length,floor,shiftX:sin*shift,shiftZ:cos*shift};
 }
 // In a very tight corner the occupied player capsule still supplies room at the origin.
 return {turn:0,width:.28,length:.30,floor:supportHeight(world,actor.x,actor.z,y)};
}

const point=new Vector3(),grip=new Vector3(),partBox=new Box3(),rotation=new Matrix4();
function attachmentBounds(root){
 root.updateWorldMatrix(true,true);
 const inverse=root.matrixWorld.clone().invert(),box=new Box3();
 root.traverseVisible(mesh=>{
  if(!mesh.isMesh)return;
  if(!mesh.geometry.boundingBox)mesh.geometry.computeBoundingBox();
  rotation.multiplyMatrices(inverse,mesh.matrixWorld);
  box.union(partBox.copy(mesh.geometry.boundingBox).applyMatrix4(rotation));
 });
 return box;
}
function restHeight(object,bounds){
 rotation.makeRotationFromQuaternion(object.quaternion);
 return .004-partBox.copy(bounds).applyMatrix4(rotation).min.y;
}
function startKnockdown(model,actor,age){
 const d=model.userData,s=d.avatar,rig=s.knockdown;
 const outgoing=age<.18?[s.base.get(s.activeBase),s.upper.get(s.activeUpper)].filter(Boolean)
  .map(action=>({action,time:action.time})):[];
 if(s.hitApplied){s.bones.get('spine_03').quaternion.copy(s.hitBase);s.hitApplied=false;}
 s.mixer.stopAllAction();
 for(const {action,time} of outgoing){action.reset().play();action.time=time;}
 const action=rig.action.reset().setLoop(LoopOnce,1).play();
 action.clampWhenFinished=true;
 const death={at:actor.deathAt,action,outgoing,startHeight:s.holder.position.y,lastAge:-1};
 if(d.weaponModel)death.weaponBounds=attachmentBounds(d.weaponSocket);
 if(d.bag)death.bagBounds=attachmentBounds(d.bag);
 s.death=death;s.time=null;
 return death;
}

function settleWeapon(model,actor,age,death){
 const d=model.userData,s=d.avatar,socket=d.weaponSocket;
 const roll=smoothstep(age,.2,.92),release=smoothstep(age,.87,1.16);
 socket.rotation.set(MathUtils.clamp(actor.pitch||0,-.65,.65)*(1-roll),0,Math.PI*.5*roll);
 const hand=model.worldToLocal(s.bones.get('hand_r').getWorldPosition(point));
 grip.set(0,0,0);
 if(d.weaponModel.userData.grip)grip.copy(d.weaponModel.userData.grip).multiplyScalar(.85);
 socket.position.copy(hand).sub(grip.applyQuaternion(socket.quaternion));
 socket.position.y-=.012*(1-release);
 socket.position.z-=.043*(1-release);
 // The grip opens on impact. Let the gun settle on its side at the hand.
 const floor=restHeight(socket,death.weaponBounds);
 socket.position.y=lerp(Math.max(socket.position.y,floor),floor,release);
}

export function poseHeadshot(model,actor,age,{turn=0,width=1,length=1,floor=0,shiftX=0,shiftZ=0}){
 const d=model.userData,s=d.avatar,rig=s.knockdown;
 const death=s.death?.at===actor.deathAt&&s.death.action===rig.action?s.death:startKnockdown(model,actor,age);
 const duration=death.action.getClip().duration,at=Math.min(age,duration);
 if(at===death.lastAge)return true;
 const entry=smoothstep(at,0,.18);
 for(const {action} of death.outgoing){
  if(entry===1)action.stop();else action.setEffectiveWeight(1-entry);
 }
 if(entry===1)death.outgoing.length=0;
 death.action.time=at;death.action.setEffectiveWeight(entry);s.mixer.update(0);
 s.holder.position.set(0,lerp(death.startHeight,rig.floorOffset,entry),0);
 s.holder.scale.setScalar(s.scale);s.holder.rotation.set(0,Math.PI,0);
 d.marker.visible=false;d.frame.rotation.set(0,0,0);
 model.rotation.set(0,0,0);model.position.set(0,0,0);model.scale.set(1,1,1);
 model.updateMatrixWorld(true);
 if(death.weaponBounds)settleWeapon(model,actor,at,death);
 if(d.bag){
  const hip=model.worldToLocal(s.bones.get('pelvis').getWorldPosition(point));
  const roll=smoothstep(at,.32,1.06);
  d.bag.rotation.set(0,0,lerp(.04,-Math.PI*.5,roll));
  const floor=restHeight(d.bag,death.bagBounds);
  d.bag.position.set(hip.x+.26,lerp(Math.max(floor,hip.y-.10),floor,roll),hip.z+.025);
 }
 const steer=smoothstep(at,0,.52);
 model.scale.set(lerp(1,width,steer),1,lerp(1,length,steer));
 model.rotation.y=(actor.yaw||0)+turn*steer;
 const slide=smoothstep(at,0,.35);
 model.position.set(actor.x+shiftX*slide,lerp(actor.y||0,floor,smoothstep(at,.20,.96)),actor.z+shiftZ*slide);
 death.lastAge=at;death.settled=at===duration;death.occlusionBox=null;
 return true;
}
