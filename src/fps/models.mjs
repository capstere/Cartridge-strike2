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
import { fitPresentationHands, disposePresentationHands } from './presentation-hands.mjs';
import { createViewMotion, viewMotion, strideSample, solveLeg, clamp } from './presentation-motion.mjs';

export function makeWeapon(id='p9',options={}) {
  const hero=options.viewmodel!==false&&kitWeapon(id);
  const model=hero?makeKitWeapon(id):primitiveWeapon(id,options);
  if(options.viewmodel!==false){if(!hero){fitPresentationHands(model);upgradeViewSurfaces(model);}model.userData.presentationMotion=createViewMotion();}
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
  primitiveActorAnimation(model,actor,time,dt,options);
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
export function disposeWeaponResources(){disposeKitModels();disposeViewSurfaces();disposePresentationHands();disposePrimitiveWeapons();}

export function animateCorpse(model,actor,time,options={}){return model.userData.avatar?authoredCorpse(model,actor,time,options):primitiveCorpse(model,actor,time,options);}
