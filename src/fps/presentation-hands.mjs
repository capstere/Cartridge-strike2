/** First-person palm frames and contact paths for Cartridge Strike's prop models.
 * Coordinates below are in the model or moving part's local frame, in metres.
 * The rig, materials and reach solver are shared by both families of viewmodels.
 */
import * as T from '../../vendor/three/three.module.js';
import {createHandMaterials} from './hand-materials.mjs';
import {createKitHand, createKitSleeve, fitKitSleeve, poseKitFingers} from './strike-kit-hands.mjs?v=6.1.2';

const owned = new Set();
const own = resource => { owned.add(resource); return resource; };
let materials;

// Authored +Y goes from wrist to knuckles, +Z points out of the back of the hand.
// Specify those two meaningful directions and remove any shear from the frame.
function palm(fingers, back) {
  const y = new T.Vector3(...fingers).normalize();
  const x = y.clone().cross(new T.Vector3(...back)).normalize();
  return new T.Quaternion().setFromRotationMatrix(new T.Matrix4().makeBasis(x, y, x.clone().cross(y)));
}
const triggerPalm = palm([-.35,.42,-.84], [1,.08,-.16]);
const carbineTrigger = palm([-.14,.05,-.99], [1,.08,-.12]);
const pistolPalm = palm([.10,.13,-.99], [1,.09,.15]);
const pistolSupport = palm([.58,.32,-.76], [-.84,-.12,-.50]);
const rifleSupport = palm([.65,.22,-.73], [-.32,-.92,-.22]);
const pumpSupport = palm([.61,.32,-.72], [-.42,-.87,-.26]);
const shortSupport = palm([.67,.30,-.68], [-.50,-.85,-.15]);
const scoutSupport = palm([.72,.16,-.67], [-.28,-.96,-.18]);
const tubeSupport = palm([.65,.32,-.69], [-.44,-.84,-.31]);
const magazinePalm = palm([.53,.46,-.71], [-.89,-.12,-.43]);
const carbineMagazine = palm([.59,-.22,-.78], [-.79,-.32,-.44]);
const rocketPalm = palm([.70,.66,.26], [-.72,.58,-.28]);
const shellPalm = palm([.72,.55,-.42], [-.23,-.34,-.91]);
const slidePalm = palm([.38,.61,-.70], [-.81,.48,-.16]);
const leverPalm = palm([-.08,.12,-.99], [.86,.40,.06]);
const knifePalm = palm([-.63,.54,-.56], [-.60,-.79,-.10]);
const loosePalm = palm([.30,.77,-.56], [-.90,.24,-.26]);
const cartridgePalm = palm([-.55,.50,-.67], [.85,.19,-.42]);
const cartridgeSupport = palm([.26,.67,-.70], [-.91,.05,-.34]);
const cradleRight = palm([-.65,.56,-.51], [.53,-.69,-.46]);
const cradleLeft = palm([.10,.70,-.71], [-.85,-.43,-.31]);

function grip(x, y, z, rotation, curl = 1) {
  return {position: new T.Vector3(x, y, z), rotation, curl};
}
const looseLeft = grip(-.19,-.105,-.115,loosePalm,.35);
const cartridge = [
  grip(.069,.073,.012,cartridgePalm,.82), grip(-.068,.046,.022,cartridgeSupport,.67)
];
// Root of each palm relative to the modelled grip. Dimensions come from the
// individual fore-ends, pump, cartridge cases and receivers in the two builders.
const grips = {
  ar47:    [grip(.041,-.107,.008,triggerPalm), grip(-.018,-.035,-.374,rifleSupport,.94)],
  shotgun: [grip(.041,-.107,.008,triggerPalm), grip(-.019,-.061,-.402,pumpSupport,.87)],
  cr4:     [grip(.038,-.088,.022,carbineTrigger), grip(-.019,-.046,-.336,rifleSupport,.91)],
  smg:     [grip(.041,-.107,.008,triggerPalm), grip(-.018,-.034,-.313,shortSupport,.99)],
  sniper:  [grip(.040,-.107,.009,triggerPalm), grip(-.017,-.051,-.349,scoutSupport,.96)],
  bazooka: [grip(.046,-.083,-.027,triggerPalm,.90), grip(-.034,-.036,-.267,tubeSupport,.77)],
  p9:      [grip(.031,-.073,.051,pistolPalm), grip(-.040,-.092,.051,pistolSupport,.84)],
  p12:     [grip(.032,-.076,.049,pistolPalm), grip(-.043,-.096,.054,pistolSupport,.88)],
  knife:   [grip(-.012,-.034,.041,knifePalm,1.04), looseLeft],
  he: cartridge, flash: cartridge, smoke: cartridge,
  bomb:    [grip(.133,-.032,.045,cradleRight,.83), grip(-.149,-.029,.041,cradleLeft,.83)]
};
const occupiedGrip = new T.Vector3(0,.012,-.032);
const shellPinch = new T.Vector3(.0305,.0331,-.032);
const leverPinch = new T.Vector3(-.022,.043,-.033);
function contact(position, rotation, palmPoint = occupiedGrip) {
  // Keep the fingertip/palm contact (including its offset) in the moving frame.
  const origin = position.clone().sub(palmPoint.clone().applyQuaternion(rotation));
  return {position: origin, rotation};
}
function magazineContact(d) {
  if (!d.magazine) return null;
  if (d.id === 'shotgun') return contact(d.magazineGrip, shellPalm, shellPinch);
  if (d.id === 'bazooka') return contact(new T.Vector3(-.036,-.012,-.135), rocketPalm);
  if (d.id === 'cr4') return contact(d.magazineGrip, carbineMagazine);
  return contact(d.magazineGrip, d.heroKit ? pistolSupport : magazinePalm);
}
const slideContact = contact(new T.Vector3(-.016,.049,.018), slidePalm);
const boltContact = contact(new T.Vector3(.037,.035,-.033), leverPalm, leverPinch);

function copyGrip(hand, grip) {
  hand.position.copy(grip.position);
  hand.quaternion.copy(grip.rotation);
}
function follow(hand, part, socket, amount, state, clearance) {
  part.updateMatrix();
  state.position.copy(socket.position).applyMatrix4(part.matrix);
  state.rotation.copy(part.quaternion).multiply(socket.rotation);
  hand.position.lerp(state.position, amount);
  // Clear the edge on the approach; the whole contact interval has zero offset.
  hand.position.x += clearance * 4 * amount * (1 - amount);
  hand.quaternion.slerp(state.rotation, amount);
}
function fingers(hand, curl, trigger, pressure = 0, pinch = 0) {
  const state = hand.userData;
  if (state.lastCurl !== curl || state.trigger !== trigger || state.pinch !== pinch) {
    poseKitFingers(hand, curl, trigger, pinch);
    state.lastCurl = curl;
    state.trigger = trigger;
    state.pinch = pinch;
    state.pressure = undefined;
  }
  if (trigger && state.pressure !== pressure) {
    const knuckle = state.fingers[0][1], data = knuckle.userData;
    data.bend.setFromAxisAngle(data.flexAxis, data.curl - pressure * .20);
    knuckle.quaternion.copy(data.rest).multiply(data.bend);
    state.pressure = pressure;
  }
}
export function poseViewHands(model, magazineAmount = 0, action = 0, shot = 0, release = 0, throwAmount = 0) {
  const d = model.userData, state = d.handPose;
  if (!state) return;
  const {rightHand, leftHand} = d, [right, left] = state.grips;
  copyGrip(rightHand, right);
  copyGrip(leftHand, left);
  // The pump and the shell are separate animated objects in the shotgun model.
  if (d.pump) leftHand.position.add(d.pump.position);
  if (magazineAmount && state.magazine) follow(leftHand, d.magazine, state.magazine, magazineAmount, state, -.044);
  if (action) {
    if (d.id === 'cr4') follow(rightHand, d.slide, boltContact, action, state, .037);
    else follow(leftHand, d.slide, slideContact, action, state, -.060);
  }
  const offhandRelease = state.grips === cartridge ? throwAmount : 0;
  if (offhandRelease) {
    leftHand.position.lerp(looseLeft.position, throwAmount);
    leftHand.quaternion.slerp(looseLeft.rotation, throwAmount);
  }
  const loadCurl = d.id === 'shotgun' ? .93 : d.id === 'bazooka' ? .71 : .99;
  fingers(leftHand, T.MathUtils.lerp(left.curl, loadCurl, magazineAmount) - release * .24 - offhandRelease * .25, false, 0, d.id === 'shotgun' ? magazineAmount : 0);
  fingers(rightHand, right.curl - (d.id === 'cr4' ? action * .28 : 0), state.hasTrigger, shot);
}

// Both shoulders live in first-person camera space. An inspection, swap or reload
// rotates the gun and hands around the camera; the arm roots belong to the actor.
const rightShoulder = new T.Vector3(.235,-.355,-.115);
const leftShoulder = new T.Vector3(-.17,-.36,-.255);
// The reference pistol runner's free wrist swings in camera space. Both
// sleeves are refitted after the held weapon takes its final transform.
export function releasePistolSupport(model,weight,stride,bounce) {
  const {leftHand,handPose:state}=model.userData;
  if(!state)return;
  const mix=T.MathUtils.smoothstep(weight,.15,.85);
  if(!mix)return;
  model.updateMatrix();
  state.inverse.copy(model.matrix).invert();
  state.position.set(-.225+.015*stride,-.179+.017*bounce,-.434+.043*stride).applyMatrix4(state.inverse);
  leftHand.position.lerp(state.position,mix);
  leftHand.quaternion.slerp(loosePalm,mix);
  fingers(leftHand,T.MathUtils.lerp(state.grips[1].curl,.6,mix),false);
}
export function refitViewArms(model) {
  const d = model.userData, state = d.handPose;
  if (!state) return;
  model.updateMatrix();
  state.inverse.copy(model.matrix).invert();
  fitKitSleeve(d.rightArm, d.rightHand, state.anchor.copy(rightShoulder).applyMatrix4(state.inverse));
  fitKitSleeve(d.leftArm, d.leftHand, state.anchor.copy(leftShoulder).applyMatrix4(state.inverse));
}
export function fitPresentationHands(model) {
  const d = model.userData;
  if (!d.viewmodel) return;
  materials ||= createHandMaterials(own);
  const hand = side => createKitHand(d.arms, side, {material: materials.glove, own});
  const arm = side => createKitSleeve(d.arms, side, {material: materials.cloth, own});
  d.rightHand = hand(1);
  d.leftHand = hand(-1);
  d.rightArm = arm(1);
  d.leftArm = arm(-1);
  d.rightHand.userData.weapon = d.leftHand.userData.weapon = d.id;
  d.presentationHands = {right: d.rightHand, left: d.leftHand};
  d.handPose = {
    grips: grips[d.id] || grips.ar47, magazine: magazineContact(d), hasTrigger: !!d.magazine,
    position: new T.Vector3(), rotation: new T.Quaternion(), inverse: new T.Matrix4(), anchor: new T.Vector3()
  };
  poseViewHands(model);
  refitViewArms(model);
}
export function disposePresentationHands() {
  for (const resource of owned) resource.dispose();
  owned.clear();
  materials = null;
}
