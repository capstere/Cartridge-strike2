import * as T from '../../vendor/three/three.module.js';
import {createAuthoredAvatar,disposeAvatar} from './character-library.mjs?v=6.1.2';
import {authoredCorpse,syncAuthoredActor} from './character-actors.mjs?v=6.1.2';
import {makeWeapon,animateWeapon,releaseWeaponFittings} from './models.mjs?v=6.1.2';
import {outfitDefinition} from './operator-outfits.mjs';

const stages=new WeakMap();
// Use the admitted map and weapon lighting variants. Only copy authored light
// values: a live effect light can contain another player's most recent position.
export function replayLighting(source,{effectPoint=false}={}){
  const scene=new T.Scene();
  scene.environment=source.environment;scene.environmentIntensity=source.environmentIntensity;
  scene.environmentRotation.copy(source.environmentRotation);scene.fog=source.fog;
  scene.background=source.background;scene.backgroundIntensity=source.backgroundIntensity;
  scene.backgroundRotation.copy(source.backgroundRotation);scene.backgroundBlurriness=source.backgroundBlurriness;
  for(const light of source.children){
    let copy;
    if(light.isHemisphereLight)copy=new T.HemisphereLight(light.color,light.groundColor,light.intensity);
    else if(light.isDirectionalLight){
      copy=new T.DirectionalLight(light.color,light.intensity);
      copy.target.position.copy(light.target.position);scene.add(copy.target);
    }else if(light.isAmbientLight)copy=new T.AmbientLight(light.color,light.intensity);
    else continue;
    copy.position.copy(light.position);copy.layers.mask=light.layers.mask;scene.add(copy);
  }
  if(effectPoint)scene.add(new T.PointLight(0xffffff,0));
  return scene;
}
function build(renderer,frame){
  const scene=replayLighting(renderer.scene,{effectPoint:Boolean(renderer.actionVisuals?.light)}),target=new T.Group(),weaponSocket=new T.Group(),camera=renderer.camera.clone(false);
  const avatar=createAuthoredAvatar(frame.victimTeam,frame.victimId,false,{
    ignoreOverrides:true,previewOutfit:outfitDefinition(frame.victimOutfit)});
  const rig=new T.Group();
  rig.add(avatar.holder,weaponSocket);target.add(rig);
  Object.assign(target.userData,{avatar,frame:rig,weaponSocket,marker:new T.Object3D()});
  const view=replayLighting(renderer.viewScene),viewCamera=renderer.viewCamera.clone(false);
  scene.name='historical-map';view.name='historical-view';scene.add(target);
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
export function createReplayHitMarker(){
  // Four small screen-space strokes leave the scope centre unobstructed.
  const vertices=[];
  for(const [dx,dy] of [[1,1],[-1,1],[1,-1],[-1,-1]]){
    const a=[dx*4,dy*4],b=[dx*9,dy*9],x=-dy*.7,y=dx*.7;
    const v0=[a[0]+x,a[1]+y,0],v1=[a[0]-x,a[1]-y,0],v2=[b[0]+x,b[1]+y,0],v3=[b[0]-x,b[1]-y,0];
    vertices.push(...v0,...v1,...v2,...v2,...v1,...v3);
  }
  const geometry=new T.BufferGeometry();
  geometry.setAttribute('position',new T.Float32BufferAttribute(vertices,3));
  const material=new T.MeshBasicMaterial({color:0xf8ad8c,transparent:true,depthTest:false,depthWrite:false,side:T.DoubleSide,toneMapped:false});
  const scene=new T.Scene(),camera=new T.OrthographicCamera(-16,16,16,-16,0,2);
  scene.name='historical-hit';camera.position.z=1;camera.updateMatrixWorld();scene.add(new T.Mesh(geometry,material));
  return {scene,camera,geometry,material};
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
  const base=renderer.settings.fieldOfView??76;
  camera.fov=base+(p.opticalFov-base)*p.aim;
  camera.rotation.set(p.pitch,p.yaw,0,'YXZ');camera.position.set(p.x,p.y+p.height-.12,p.z);
  camera.updateProjectionMatrix();camera.updateMatrixWorld();viewCamera.updateProjectionMatrix();
  renderer.referenceScene?.update(camera);renderer.projectBatches?.update(camera);
  target.position.set(v.x,v.y,v.z);target.rotation.set(0,v.yaw,0);
  const d=target.userData;
  d.weaponModel=equip(d.weaponSocket,d.weaponModel,v.weapon,false);
  const actor={...v,aimAmount:v.aim,crouching:v.crouch,deathAt:frame.deathTime};
  if(v.alive)syncAuthoredActor(target,actor,time,{cameraYaw:p.yaw});
  else authoredCorpse(target,actor,time);
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
    if(frame.hitStrength>0){
      const hit=renderer.replayHitMarker,width=gpu.domElement.clientWidth,height=gpu.domElement.clientHeight;
      Object.assign(hit.camera,{left:-width/2,right:width/2,top:height/2,bottom:-height/2});
      hit.camera.updateProjectionMatrix();hit.material.opacity=frame.hitStrength;
      gpu.autoClear=false;renderer.nativeRender(hit.scene,hit.camera);
    }
  }finally{gpu.autoClear=autoClear;}
  return true;
}
