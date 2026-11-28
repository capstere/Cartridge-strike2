import * as T from '../../vendor/three/three.module.js';
import {createAuthoredAvatar,disposeAvatar} from './character-library.mjs?v=6.1.2';
import {syncAuthoredActor} from './character-actors.mjs?v=6.1.2';
import {makeWeapon,animateWeapon,releaseWeaponFittings} from './models.mjs?v=6.1.2';
import {OUTFITS} from './operator-outfits.mjs';
import {aimFov} from './tactical-rules.mjs';

const stages=new WeakMap();
function build(renderer,frame){
  const scene=new T.Scene(),target=new T.Group(),weaponSocket=new T.Group(),camera=renderer.camera.clone(false);
  const avatar=createAuthoredAvatar(frame.victimTeam,frame.victimId,false,{
    ignoreOverrides:true,previewOutfit:OUTFITS.find(o=>o.id===frame.victimOutfit)});
  target.add(avatar.holder,weaponSocket);
  Object.assign(target.userData,{avatar,weaponSocket,marker:new T.Object3D()});
  const view=new T.Scene(),viewCamera=renderer.viewCamera.clone(false);
  const gunLight=new T.DirectionalLight(0xffe7c8,2.1);gunLight.position.set(-1,2,1);
  view.add(new T.HemisphereLight(0xe2eff7,0x6c665b,1.45),gunLight);
  scene.add(new T.HemisphereLight(0xd6e5ee,0x899298,1.35),target);
  scene.environment=renderer.scene.environment;view.environment=renderer.viewScene.environment;
  scene.fog=renderer.scene.fog;scene.background=renderer.scene.background;
  // Borrow immutable map roots without reparenting them or traversing the live
  // scene for actors. Project batches update their own camera-dependent bounds.
  const roots=[renderer.referenceScene?.root,renderer.projectFurniture,renderer.detailScene?.root,
    renderer.facilityScene?.root,renderer.livingScene?.root,renderer.riposteProps?.root,
    renderer.decor,renderer.roomVisuals,renderer.cartridgeProps,
    ...renderer.scene.children.filter(n=>n.name==='room-static-batch')];
  scene.children.push(...new Set(roots.filter(n=>n?.isObject3D)));
  const flash=new T.Mesh(renderer.muzzle.geometry,renderer.muzzle.material);
  view.add(flash);
  const stage={scene,target,camera,view,viewCamera,flash,serial:frame.serial,time:frame.time};
  stages.set(renderer,stage);return stage;
}
function equip(object,old,id,viewmodel,cache){
  if(old?.userData.id===id)return old;
  if(old){releaseWeaponFittings(old);old.removeFromParent();}
  // The renderer already owns a bounded viewmodel cache and releases its
  // shared hands/materials at map disposal. Historical transforms get their own model.
  const key='replay-'+id;
  const weapon=cache?.get(key)??makeWeapon(id,{viewmodel});
  cache?.set(key,weapon);
  if(!viewmodel)weapon.scale.setScalar(.85);
  object.add(weapon);return weapon;
}
export function disposeReplayRender(renderer){
  const s=stages.get(renderer);
  if(!s)return;
  releaseWeaponFittings(s.target.userData.weaponModel);releaseWeaponFittings(s.gun);s.gun?.removeFromParent();
  disposeAvatar(s.target.userData.avatar);stages.delete(renderer);
}
/** Draw the two recorded participants. All live actor, objective, projectile,
 * tracer, door state and effect pools are excluded from this render scene. */
export function drawReplay(renderer,frame){
  if(frame?.stage!=='replay'){disposeReplayRender(renderer);return false;}
  let s=stages.get(renderer);
  if(s&&s.serial!==frame.serial){disposeReplayRender(renderer);s=null;}
  s??=build(renderer,frame);
  const {camera,target,viewCamera}=s,p=frame.camera,v=frame.target,time=frame.time;
  const dt=Math.min(.1,Math.max(0,time-s.time));s.time=time;
  camera.aspect=viewCamera.aspect=renderer.camera.aspect;
  camera.fov=76+(aimFov(p.weapon)-76)*p.aim;
  camera.rotation.set(p.pitch,p.yaw,0,'YXZ');camera.position.set(p.x,p.y+p.height-.12,p.z);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();viewCamera.updateProjectionMatrix();
  renderer.referenceScene?.update(camera);renderer.projectBatches?.update(camera);
  target.position.set(v.x,v.y,v.z);target.rotation.set(0,v.yaw,0);
  const d=target.userData;
  d.weaponModel=equip(d.weaponSocket,d.weaponModel,v.weapon,false);
  syncAuthoredActor(target,{...v,aimAmount:v.aim,crouching:v.crouch},time,{cameraYaw:p.yaw});
  const gpu=renderer.renderer,autoClear=gpu.autoClear;
  try{
    gpu.autoClear=true;renderer.nativeRender(s.scene,camera);
    if(!frame.scoped){
      s.gun=equip(s.view,s.gun,p.weapon,true,renderer.weaponCache);
      const shotAt=frame.shots.at(-1)??-Infinity;
      animateWeapon(s.gun,{...p,aimAmount:p.aim,moving:0,onGround:true},time,dt,{shotAt,reducedMotion:renderer.settings.reducedMotion});
      s.flash.visible=frame.shots.length>0;
      if(s.flash.visible){s.flash.position.set(.13*(1-p.aim),-.09,-.65);s.flash.scale.setScalar(1.1);}
      gpu.autoClear=false;gpu.clearDepth();renderer.nativeRender(s.view,viewCamera);
    }
  }finally{gpu.autoClear=autoClear;}
  return true;
}
