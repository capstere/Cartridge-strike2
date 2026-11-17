import {validateInput} from './input.mjs';
import {REWIND_MS} from './rules.mjs';
export const INPUT_FIELDS=['lifeId','controlEpoch','sampleTick','fireId','reloadId','forward','strafe','yaw','pitch','jump','crouch','sneak','fire'];
export function wireInput(frame) {return Object.fromEntries(INPUT_FIELDS.map(key=>[key,frame[key]]));}
export function validateNetworkInput(frame, actor, tick) {
  if(!frame||Object.getPrototypeOf(frame)!==Object.prototype||Reflect.ownKeys(frame).some(k=>!INPUT_FIELDS.includes(k)))throw Error('Unknown input field');
  for(const key of ['lifeId','controlEpoch','sampleTick','fireId','reloadId'])
    if(!Number.isSafeInteger(frame[key])||frame[key]<0||frame[key]>0xffffffff)throw Error('Invalid input counter');
  if(frame.lifeId!==actor.lifeId)throw Error('Old life input');
  if(frame.controlEpoch!==(actor.controlEpoch||0))throw Error('Old connection input');
  if(frame.sampleTick>tick||frame.sampleTick<tick-Math.ceil(REWIND_MS*60/1000))throw Error('Stale input tick');
  return validateInput(Object.fromEntries(['forward','strafe','yaw','pitch','jump','crouch','sneak','fire'].map(k=>[k,frame[k]])));
}
export function checkContract(actual, expected) {
  for(const key of ['protocolVersion','protocolHash','buildHash','mapId','mapHash','collisionHash','configHash'])
    if(actual?.[key]!==expected[key])throw Error(`Incompatible ${key}. Reload the matching local client/server build.`);
}
