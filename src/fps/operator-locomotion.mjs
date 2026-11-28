// Riposte 06ac-loco blends feet in actor-local movement directions while
// retaining the upper-body aim. Adapt that rule to the original Quaternius
// forward cycles. Preserve their ankle lift, cadence, knee bend and foot roll.
import {Matrix4,Quaternion,Vector3} from '../../vendor/three/three.module.js';

const hipPos=new Vector3(), kneePos=new Vector3(), anklePos=new Vector3();
const localHip=new Vector3(), localAnkle=new Vector3(), target=new Vector3();
const ray=new Vector3(), bend=new Vector3(), kneeGoal=new Vector3();
const actual=new Vector3(), desired=new Vector3(), parentRotation=new Quaternion();
const boneRotation=new Quaternion(), correction=new Quaternion(), footRotation=new Quaternion();
const inverse=new Matrix4();

export function createDirectionalPose(state) {
  if (state.isHostage) return null;
  state.holder.updateMatrixWorld(true);
  inverse.copy(state.holder.matrixWorld).invert();
  const legs=[];
  for (const side of ['l','r']) {
    const hip=state.bones.get('thigh_'+side),knee=state.bones.get('calf_'+side),foot=state.bones.get('foot_'+side);
    if (!hip || !knee || !foot) return null;
    hipPos.setFromMatrixPosition(hip.matrixWorld).applyMatrix4(inverse);
    anklePos.setFromMatrixPosition(foot.matrixWorld).applyMatrix4(inverse);
    legs.push({hip,knee,foot,restZ:anklePos.z-hipPos.z,
      hipBase:new Quaternion(),kneeBase:new Quaternion(),footBase:new Quaternion()});
  }
  return {legs,forward:1,right:0,applied:false};
}

export function restoreDirectionalPose(pose) {
  if (!pose?.applied) return;
  for (const leg of pose.legs) {
    leg.hip.quaternion.copy(leg.hipBase);
    leg.knee.quaternion.copy(leg.kneeBase);
    leg.foot.quaternion.copy(leg.footBase);
  }
  pose.applied=false;
}

function aimSegment(bone, child, point, destination) {
  actual.setFromMatrixPosition(child.matrixWorld).sub(point).normalize();
  desired.subVectors(destination,point).normalize();
  correction.setFromUnitVectors(actual,desired);
  bone.getWorldQuaternion(boneRotation).premultiply(correction);
  bone.parent.getWorldQuaternion(parentRotation).invert();
  bone.quaternion.copy(parentRotation).multiply(boneRotation);
  bone.updateWorldMatrix(false,true);
}

function solveLeg(leg,goal) {
  const {hip,knee,foot}=leg;
  kneePos.setFromMatrixPosition(knee.matrixWorld);
  const upper=hipPos.distanceTo(kneePos), lower=kneePos.distanceTo(anklePos);
  ray.subVectors(goal,hipPos);
  const distance=Math.max(Math.abs(upper-lower)+.001,Math.min(upper+lower-.001,ray.length()));
  ray.normalize();
  bend.subVectors(kneePos,hipPos);
  bend.addScaledVector(ray,-ray.dot(bend));
  if (bend.lengthSq()<1e-10) return;
  bend.normalize();
  const along=(upper*upper-lower*lower+distance*distance)/(2*distance);
  kneeGoal.copy(hipPos).addScaledVector(ray,along).addScaledVector(bend,Math.sqrt(Math.max(0,upper*upper-along*along)));
  foot.getWorldQuaternion(footRotation);
  aimSegment(hip,knee,hipPos,kneeGoal);
  kneePos.setFromMatrixPosition(knee.matrixWorld);
  aimSegment(knee,foot,kneePos,goal);
  foot.parent.getWorldQuaternion(parentRotation).invert();
  foot.quaternion.copy(parentRotation).multiply(footRotation);
  foot.updateWorldMatrix(false,true);
}

export function steerStride(state,actor,step,dx,dz,moving,reset,distanceSquared) {
  const pose=state.directional;
  if (!pose) return;
  if (reset) {pose.forward=1;pose.right=0;return;}
  const length=Math.hypot(dx,dz);
  if (length>.0001 && step>0) {
    const sin=Math.sin(actor.yaw||0), cos=Math.cos(actor.yaw||0);
    const forward=-(dx*sin+dz*cos)/length, right=(dx*cos-dz*sin)/length;
    const weight=1-Math.exp(-step*20);
    pose.forward+=(forward-pose.forward)*weight;
    pose.right+=(right-pose.right)*weight;
  }
  // Distant operators retain the phase-synchronized lower-body clip. The more
  // expensive planted-leg correction is blended out over the last four metres.
  const detail=Math.min(1,Math.max(0,(22-Math.sqrt(distanceSquared||0))/4));
  if (!moving || !detail || Math.abs(pose.right)+Math.abs(1-pose.forward)<.004) return;
  state.holder.updateWorldMatrix(true,true);
  inverse.copy(state.holder.matrixWorld).invert();
  for (const leg of pose.legs) {
    leg.hipBase.copy(leg.hip.quaternion);
    leg.kneeBase.copy(leg.knee.quaternion);
    leg.footBase.copy(leg.foot.quaternion);
    hipPos.setFromMatrixPosition(leg.hip.matrixWorld);
    anklePos.setFromMatrixPosition(leg.foot.matrixWorld);
    localHip.copy(hipPos).applyMatrix4(inverse);
    localAnkle.copy(anklePos).applyMatrix4(inverse);
    const stride=(localAnkle.z-localHip.z-leg.restZ)*detail;
    target.copy(localAnkle);
    target.x-=pose.right*stride;
    target.z+=(pose.forward-1)*stride;
    target.applyMatrix4(state.holder.matrixWorld);
    solveLeg(leg,target);
  }
  pose.applied=true;
}
