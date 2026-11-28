import {WEAPONS} from './config.mjs';
import {syncWeaponFittings,releaseWeaponFittings} from './weapon-fittings.mjs';
export {syncWeaponFittings,releaseWeaponFittings};
export function syncActorWeaponFittings(model,actor){
  const item=actor?.inventory?.[WEAPONS[actor.weapon]?.slot];
  syncWeaponFittings(model,item);
}

import {kitWeapon} from './strike-kit-timing.mjs';
import {makeKitWeapon,animateKitWeapon,disposeKitModels} from './strike-kit-models.mjs?v=6.1.2';
import {upgradeViewSurfaces,disposeViewSurfaces} from './view-surface.mjs';
/** Public model API: original meshes/mechanisms + read-only presentation upgrades.
 * model-primitives.mjs retains existing mechanisms and adds the fictional bazooka.
 * Keeping the original geometry in one module avoids duplicate active versions.
 */
export * from './model-primitives.mjs';
import * as THREE from '../../vendor/three/three.module.js';
import { makeWeapon as primitiveWeapon, makeActor as primitiveActor,
  animateWeapon as primitiveWeaponAnimation, animateActor as primitiveActorAnimation,
  disposeWeaponResources as disposePrimitiveWeapons, animateCorpse as primitiveCorpse } from './model-primitives.mjs';
import {refitViewArms,releasePistolSupport} from './presentation-hands.mjs';
import { createViewMotion, viewMotion, strideSample, solveLeg, clamp } from './presentation-motion.mjs';

// Front/rear marker coordinates on the authored meshes, in viewmodel space.
// Additional camera-space drop at full Rush, fitted to the different mesh spans.
// V4 at 2.417-3.250 s shows only the upper tip moving along the lower edge.
const rushDrop={cr4:.26,ar47:.23,smg:.25,shotgun:.20,sniper:.28,bazooka:.26};
const sightLines = {
  p9: [.090,-.174,.089,.037], p12: [.090,-.174,.089,.037],
  cr4: [.119,-.475,.119,.023], ar47: [.104,-.640,.126,-.210],
  smg: [.122,-.380,.133,.030], shotgun: [.073,-.760,.100,.070],
  sniper: [.165,-.425,.165,-.055]
};
function alignSights(model,amount,pitchKick) {
  const line=model.userData.opticSight || sightLines[model.userData.id];
  if(!line || amount<=0)return;
  const [frontY,frontZ,rearY,rearZ]=line;
  const pitch=Math.atan((rearY-frontY)/(rearZ-frontZ));
  const aimY=rearZ*Math.sin(pitch)-rearY*Math.cos(pitch);
  model.rotation.x+=(pitch+pitchKick-model.rotation.x)*amount;
  model.rotation.y*=1-amount;model.rotation.z*=1-amount;
  model.position.x*=1-amount;model.position.y+=(aimY-model.position.y)*amount;
}

export function makeWeapon(id='p9',options={}) {
  const hero=options.viewmodel!==false&&kitWeapon(id);
  const model=hero?makeKitWeapon(id):primitiveWeapon(id,options);
  if(options.viewmodel!==false){if(!hero)upgradeViewSurfaces(model);model.userData.presentationMotion=createViewMotion();}
  syncWeaponFittings(model,{...options,id});
  return model;
}
export function animateWeapon(model,actor,time,dt,options={}) {
  // Preserve exact magazine/slide timing, hand-to-magazine attachment and action pose.
  const pose=model.userData.heroKit?animateKitWeapon(model,actor,time,dt,options):primitiveWeaponAnimation(model,actor,time,dt,options);
  const state=model.userData.presentationMotion;
  if(state){
    const offset=viewMotion(state,actor,time,{weapon:model.userData.id,shotAt:options.shotAt,reducedMotion:options.reducedMotion});
    model.position.x+=offset.position[0];model.position.y+=offset.position[1];model.position.z+=offset.position[2];
    model.rotation.x+=offset.rotation[0];model.rotation.y+=offset.rotation[1];model.rotation.z+=offset.rotation[2];
    // Riposte 5.6.1 06-weapons VM_SPRINT and 06c-models pistolRunPose.
    // Copyright (c) 2026 BenDBSS, MIT (licenses/riposte-MIT.txt).
    const gait=actor.rushWeight || 0,phase=(actor.distanceWalked || 0)*4.4;
    const handling=pose.reloading || actor.action || actor.cartridge || options.inspecting ||
      time-(options.switchAt ?? -Infinity)<.26 || time-(options.throwAt ?? -Infinity)<.48;
    // The locomotion clock keeps advancing during an action. Ease between the
    // two poses instead of snapping the gun aside at either end of a reload.
    const elapsed=time-(state.handlingAt ?? -Infinity),target=handling?1:0;
    if(elapsed<0 || elapsed>.25 || state.poseActor!==actor.id || state.poseLife!==actor.lifeId){
      state.handlingWeight=target;
    }else{
      state.handlingWeight=target+(state.handlingWeight-target)*Math.exp(-25*elapsed);
    }
    state.handlingAt=time;state.poseActor=actor.id;state.poseLife=actor.lifeId;
    const rush=gait*(1-.92*state.handlingWeight)*(1-(actor.aimAmount || 0));
    if(rush>.001){
      const stride=options.reducedMotion?0:Math.cos(phase),bounce=options.reducedMotion?0:Math.sin(2*phase);
      const roll=options.reducedMotion?0:Math.sin(phase);
      const pistol=['p9','p12'].includes(model.userData.id);
      if(pistol){
        model.position.x+=(.035+.008*stride)*rush;
        model.position.y+=(-.115+.016*bounce)*rush;
        model.position.z+=(.095+.030*stride)*rush;
        model.rotation.x-=.38*rush;model.rotation.y-=.25*rush;model.rotation.z-=.24*rush;
        releasePistolSupport(model,rush,stride,bounce);
      }else if(WEAPONS[model.userData.id]?.slot==='primary'){
        model.position.x+=(.01+.012*stride)*rush;model.position.y+=(-.04-rushDrop[model.userData.id]+.012*bounce)*rush;
        model.position.z+=(-.04+.01*bounce)*rush;
        model.rotation.x+=(-.50+.04*bounce)*rush;
        model.rotation.y+=(.65+.05*stride)*rush;model.rotation.z+=(.70+.10*roll)*rush;
      }else{
        const compact=WEAPONS[model.userData.id]?.slot!=='bomb';
        model.position.y+=(-.045+.012*bounce)*rush;
        model.position.z+=(.055+.012*stride)*rush;
        model.rotation.x-=(compact?.18:.10)*rush;model.rotation.z+=(compact?.14:.07)*rush;
      }
    }
    const wall=(options.nearWall || 0)*(1-rush)*(1-(actor.aimAmount || 0));
    model.rotation.x+=wall*.75;model.position.z+=wall*.12;
    alignSights(model,(1-state.handlingWeight)*clamp(actor.aimAmount || 0),pose.pitchKick+offset.rotation[0]);
    refitViewArms(model);
    model.updateMatrixWorld(true);
    // Muzzle effect follows the final pose. Bullet/hitscan origin stays owned by Game.
    pose.muzzle=model.localToWorld(model.userData.muzzle.clone());
  }
  return pose;
}
import {charactersReady} from './character-library.mjs?v=6.1.2';
import {upgradeActor,syncAuthoredActor,authoredCorpse} from './character-actors.mjs?v=6.1.2';

export function makeActor(team,id,isHostage=false) {
  const model=primitiveActor(team,id,isHostage);
  if(charactersReady())return upgradeActor(model,team,id,isHostage);
  if(typeof document!=='undefined')throw new Error('Authored character library was not preloaded');
  model.userData.presentationGait={time:null,x:0,z:0,phase:0,speed:0,dx:0,dz:-1};
  model.userData.presentationFeet=model.userData.knees.map(knee=>{
    knee.updateWorldMatrix(true,true);
    const inverse=knee.matrixWorld.clone().invert(),bounds=new THREE.Box3();
    knee.traverse(child=>{if(!child.isMesh)return;child.geometry.computeBoundingBox();
      bounds.union(child.geometry.boundingBox.clone().applyMatrix4(new THREE.Matrix4().multiplyMatrices(inverse,child.matrixWorld)));});
    const points=[];for(const x of [bounds.min.x,bounds.max.x])for(const y of [bounds.min.y,bounds.max.y])for(const z of [bounds.min.z,bounds.max.z])points.push(new THREE.Vector3(x,y,z));
    return {points,matrix:new THREE.Matrix4()};
  });
  return model;
}
export function animateActor(model,actor,time,dt,options={}) {
  const oldWeapon=model.userData.weaponModel;
  primitiveActorAnimation(model,actor,time,dt,options);
  const weapon=model.userData.weaponModel;
  if (oldWeapon && oldWeapon!==weapon) releaseWeaponFittings(oldWeapon);
  if (weapon) syncActorWeaponFittings(weapon,actor);
  if(model.userData.avatar){
    if(model.userData.avatar.death){model.userData.avatar.death=null;model.userData.avatar.time=-1;model.userData.avatar.activeBase=null;model.userData.avatar.activeUpper=null;}
    syncAuthoredActor(model,actor,time,options);return;
  }
  const d=model.userData,g=d.presentationGait;if(!g)return;
  const x=Number.isFinite(actor.x)?actor.x:0,z=Number.isFinite(actor.z)?actor.z:0;
  const elapsed=g.time===null?0:time-g.time,travel=Math.hypot(x-g.x,z-g.z);
  if(g.time===null||elapsed<0||elapsed>.25||travel>1.5){Object.assign(g,{time,x,z,speed:0,phase:0});d.torso.rotation.y=0;for(const leg of [d.limbs[0],d.limbs[2]])leg.rotation.z=0;return;}
  if(elapsed>0){
    const speed=Math.min(5,travel/elapsed);g.speed+=(speed-g.speed)*(1-Math.exp(-elapsed*16));
    if(travel>.0001){
      const yaw=actor.yaw||0,dx=(x-g.x)/travel,dz=(z-g.z)/travel;
      g.dx=Math.cos(yaw)*dx-Math.sin(yaw)*dz;g.dz=Math.sin(yaw)*dx+Math.cos(yaw)*dz;
      // Phase advances by actual travel, not a running timer on stationary bots.
      const span=(.44+clamp(g.speed/3.5)*.14)*(1-clamp(d.crouch)*.5);
      g.phase+=travel/Math.max(.35,span/.60);
    }
    Object.assign(g,{time,x,z});
  }
  const c=clamp(d.crouch),pace=clamp(g.speed/3.5),air=actor.onGround===false;
  const hip=.86-c*.453-pace*.055*(1-c*.5);
  d.torso.position.y=hip+(air?-.015:0);
  d.torso.rotation.z=Math.sin(g.phase*Math.PI*2)*.012*pace;
  d.torso.rotation.y=clamp(g.dx,-1,1)*.075*pace;
  for(let i=0;i<2;i++){
    const leg=d.limbs[i*2],knee=d.knees[i],step=strideSample(g.phase+i*.5,g.speed,c);
    leg.position.y=hip;
    const lift=air?.09:step.lift;
    const pose=solveLeg(step.along*g.dz,hip-(.082+lift));
    leg.rotation.x=pose.hip;knee.rotation.x=pose.knee;
    leg.rotation.z=clamp(step.along*g.dx/Math.max(.3,hip),-.20,.20);
    // Fit the existing boot/shin bounds to the floor after bending. No per-frame
    // mesh traversal and no change to actor.y/collision. Handles crouch toe rotation.
    leg.updateMatrix();knee.updateMatrix();const foot=d.presentationFeet[i];
    foot.matrix.multiplyMatrices(leg.matrix,knee.matrix);const e=foot.matrix.elements;
    let bottom=Infinity;for(const p of foot.points)bottom=Math.min(bottom,e[1]*p.x+e[5]*p.y+e[9]*p.z+e[13]);
    leg.position.y+=.004+lift-bottom;
  }
  // Counter-rotate the head so torso motion does not turn aiming into head wobble.
  d.head.rotation.z=-d.torso.rotation.z*.7;
  d.head.rotation.y=-d.torso.rotation.y*.45;
  if(d.bag){d.bag.rotation.x=Math.sin(g.phase*Math.PI*2+.7)*pace*.065;d.bag.rotation.z=Math.sin(g.phase*Math.PI*2+.3)*pace*.045;}
  // Arms, weapon sockets, hit reaction, corpses and animation timings remain original.
}
export function disposeWeaponResources(){disposeKitModels();disposeViewSurfaces();disposePrimitiveWeapons();}

export function animateCorpse(model,actor,time,options={}){
  const d=model.userData,s=d.avatar;
  if(!s)return primitiveCorpse(model,actor,time,options);
  // A reconnect or first visible frame may be a corpse. Equip it from the same
  // actor snapshot as a live render before sampling the absolute death time.
  if(s.knockdown&&actor.deathVariant==='headshot'&&s.death?.at!==actor.deathAt&&
     (d.weaponId!==actor.weapon||s.time==null||Math.abs(s.time-actor.deathAt)>.5)){
    animateActor(model,actor,actor.deathAt,0);
  }
  return authoredCorpse(model,actor,time,options);
}
