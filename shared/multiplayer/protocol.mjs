import {validateInput} from './input.mjs';
export const INPUT_FIELDS=['lifeId','sampleTick','fireId','reloadId','forward','strafe','yaw','pitch','jump','crouch','sneak','fire'];
export function wireInput(frame) {return Object.fromEntries(INPUT_FIELDS.map(key=>[key,frame[key]]));}
export function validateNetworkInput(frame, actor, tick) {
  if(!frame||Object.getPrototypeOf(frame)!==Object.prototype||Reflect.ownKeys(frame).some(k=>!INPUT_FIELDS.includes(k)))throw Error('Unknown input field');
  for(const key of ['lifeId','sampleTick','fireId','reloadId'])
    if(!Number.isSafeInteger(frame[key])||frame[key]<0||frame[key]>0xffffffff)throw Error('Invalid input counter');
  if(frame.lifeId!==actor.lifeId)throw Error('Old life input');
  // This is freshness validation, not a client-selected rewind timestamp.
  if(frame.sampleTick>tick+6||frame.sampleTick<tick-60)throw Error('Stale input tick');
  return validateInput(Object.fromEntries(['forward','strafe','yaw','pitch','jump','crouch','sneak','fire'].map(k=>[k,frame[k]])));
}
export function checkContract(actual, expected) {
  for(const key of ['protocolVersion','buildHash','mapId','mapHash','configHash'])
    if(actual?.[key]!==expected[key])throw Error(`Incompatible ${key}. Reload the matching local client/server build.`);
}
